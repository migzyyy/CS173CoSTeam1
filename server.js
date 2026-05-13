require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const cookieParser = require('cookie-parser');
const { initDatabase, getDatabase, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname)));

async function startServer() {
  await initDatabase();
  const db = getDatabase();

  // Create table for magic link tokens
  db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at DATETIME NOT NULL
  )`);
  saveDatabase();

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  // 1. Send the OTP Code
  app.post('/api/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      // Generate a 6-digit random code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + (10 * 60 * 1000); // Expires in 10 mins

      db.run(
        `INSERT INTO auth_tokens (email, token, expires_at) VALUES (?, ?, ?)`,
        [email, otp, expiresAt]
      );
      saveDatabase();

      const msg = {
        to: email,
        from: process.env.SENDER_EMAIL,
        subject: 'Your Login Code for CS 173 Portal',
        text: `Your 6-digit login code is: ${otp}`,
        html: `<h2>Your login code is: <span style="color: blue; letter-spacing: 5px;">${otp}</span></h2><p>This code will expire in 10 minutes.</p>`,
      };

      await sgMail.send(msg);
      console.log(`OTP sent to ${email}`);
      res.json({ message: 'Verification code sent!' });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to process login' });
    }
  });

  // 2. Verify the typed OTP Code
  app.post('/api/verify', express.json(), (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) return res.status(400).json({ error: 'Missing credentials.' });

    try {
      const results = db.exec(`SELECT * FROM auth_tokens WHERE email = '${email}' AND token = '${otp}'`);

      if (results.length === 0 || results[0].values.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired code.' });
      }

      const row = results[0].values[0];
      const expiresAt = row[2];

      if (Date.now() > parseInt(expiresAt)) {
        return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
      }

      // Valid OTP! Delete it so it can't be used twice
      db.run(`DELETE FROM auth_tokens WHERE email = ?`, [email]);
      saveDatabase();

      res.cookie('user_email', email, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: false // Keep false for local testing! Switch to true when pushing to the live site.
      });

      res.json({ message: 'Login successful!', redirect: '/dashboard.html' });
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).json({ error: 'Server error during verification.' });
    }
  });

  // Logout
  app.get('/api/logout', (req, res) => {
    res.clearCookie('user_email');
    res.redirect('/');
  });

  // Submit form
  app.post('/api/submit', (req, res) => {
try {
      console.log('Received submission:', req.body);
      const email = req.cookies.user_email;
      if (!email) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }
      const {
        month, year, name, position, college, activities,
        hoursPerWeek, totalHours, declarationMonth, signatureData, submissionDate
      } = req.body;

      const sql = `
        INSERT INTO submissions (email, month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, signature_data, submission_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
      `;
      const params = [
        email, month, year, name, position, college,
        JSON.stringify(activities), JSON.stringify(hoursPerWeek),
        totalHours, declarationMonth, signatureData, submissionDate
      ];
      
      db.run(sql, params);
      saveDatabase();
      
      const result = db.exec("SELECT last_insert_rowid() as id");
      const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
      console.log('Saved submission with ID:', lastId);
      res.json({ success: true, id: lastId });
    } catch (error) {
      console.error('Error saving submission:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get all submissions
  app.get('/api/submissions', (req, res) => {
    try {
      const email = req.cookies.user_email;
      if (!email) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const results = db.exec(`
        SELECT id, month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, submission_date, created_at
        FROM submissions
        WHERE email = '${email}'
        ORDER BY created_at DESC
      `);

      if (results.length === 0) return res.json([]);

      const columns = results[0].columns;
      const submissions = results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        obj.activities = JSON.parse(obj.activities);
        obj.hoursPerWeek = JSON.parse(obj.hours_per_week);
        return obj;
      });

      res.json(submissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
    }
  });

  // Get single submission
  app.get('/api/submissions/:id', (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM submissions WHERE id = ?");
      stmt.bind([parseInt(req.params.id)]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        row.activities = JSON.parse(row.activities);
        row.hoursPerWeek = JSON.parse(row.hours_per_week);
        res.json(row);
      } else {
        stmt.free();
        res.status(404).json({ success: false, error: 'Submission not found' });
      }
    } catch (error) {
      console.error('Error fetching submission:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch submission' });
    }
  });

  // Delete submission
  app.delete('/api/submissions/:id', (req, res) => {
    try {
      db.run('DELETE FROM submissions WHERE id = ?', [parseInt(req.params.id)]);
      saveDatabase();
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting submission:', error);
      res.status(500).json({ success: false, error: 'Failed to delete submission' });
    }
  });

  // Download PDF
  app.get('/api/submissions/:id/pdf', (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM submissions WHERE id = ?");
      stmt.bind([parseInt(req.params.id)]);

      if (!stmt.step()) {
        stmt.free();
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      const row = stmt.getAsObject();
      stmt.free();

      row.activities = JSON.parse(row.activities);
      row.hoursPerWeek = JSON.parse(row.hours_per_week);

      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 50 });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="COS_${row.name}_${row.month}_${row.year}.pdf"`);

      doc.pipe(res);

      // Title Section (center-aligned)
      doc.fontSize(14).text('UNIVERSITY OF THE PHILIPPINES', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).text('--------------------', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(16).font('Helvetica-Bold').text('CERTIFICATE OF SERVICE', { align: 'center' });
      doc.moveDown();

      // For the month of
      doc.fontSize(12).font('Helvetica').text(`For the month of ${row.month || ''}`, { align: 'center' });
      doc.moveDown();

      // Personal Information
      doc.fontSize(12).text('Name: ' + (row.name || ''));
      doc.text('Position: ' + (row.position || ''));
      doc.text('College/School of: ' + (row.college || ''));
      doc.moveDown();

      // Service Activities
      doc.fontSize(12).text('Service Activities:', { underline: true });
      doc.moveDown(0.5);
      if (row.activities && row.activities.length > 0) {
        row.activities.forEach((activity, index) => {
          const hours = row.hoursPerWeek && row.hoursPerWeek[index] ? row.hoursPerWeek[index] : '';
          doc.fontSize(10).text(`${index + 1}. ${activity} (${hours} hrs/week)`);
        });
      }
      doc.moveDown();

      // Separator
      doc.fontSize(12).text('--------------------', { align: 'center' });
      doc.moveDown();

      // Declaration
      doc.fontSize(12).text(`I hereby certify upon my honor that I have rendered full service for the month of ${row.declaration_month || row.month}.`);
      doc.moveDown();

      // Signature Section
      doc.fontSize(12).text('Signature:', { underline: true });
      if (row.signature_data) {
        try {
          const base64Data = row.signature_data.replace(/^data:image\/png;base64,/, '');
          const imgBuffer = Buffer.from(base64Data, 'base64');
          doc.image(imgBuffer, { width: 200 });
        } catch (e) {
          console.error('Error adding signature to PDF:', e);
        }
      }
      doc.moveDown(0.5);
      doc.fontSize(12).text('Printed Name: ' + (row.name || ''));
      doc.moveDown();

      // Attested/Approved Section
      doc.fontSize(12).text('Attested:', { underline: true });
      doc.moveDown(2); // Space for attestation
      doc.fontSize(12).text('Approved:', { underline: true });

      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF' });
    }
  });

  // Download JSON
  app.get('/api/submissions/:id/json', (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM submissions WHERE id = ?");
      stmt.bind([parseInt(req.params.id)]);

      if (!stmt.step()) {
        stmt.free();
        return res.status(404).json({ success: false, error: 'Submission not found' });
      }

      const row = stmt.getAsObject();
      stmt.free();

      row.activities = JSON.parse(row.activities);
      row.hoursPerWeek = JSON.parse(row.hours_per_week);

      const jsonData = JSON.stringify({
        month: row.month,
        year: row.year,
        name: row.name,
        position: row.position,
        college: row.college,
        activities: row.activities,
        hoursPerWeek: row.hoursPerWeek,
        totalHours: row.total_hours,
        declarationMonth: row.declaration_month,
        submissionDate: row.submission_date
      }, null, 2);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="COS_${row.name}_${row.month}_${row.year}.json"`);
      res.send(jsonData);
    } catch (error) {
      console.error('Error generating JSON:', error);
      res.status(500).json({ success: false, error: 'Failed to generate JSON' });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}

startServer();