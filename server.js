require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail');
const cookieParser = require('cookie-parser');
const PDFDocument = require('pdfkit');
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

  // Login - send magic link
  app.post('/api/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const token = crypto.randomBytes(32).toString('hex');
      // CREATE AN ISO STRING FOR EXACTLY 15 MINUTES IN THE FUTURE
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      db.run(
        `INSERT INTO auth_tokens (email, token, expires_at) VALUES (?, ?, ?)`,
        [email, token, expiresAt]
      );
      saveDatabase();

      // This tells the server: "If there is a BASE_URL in the .env file, use it. 
      // Otherwise, fall back to localhost for local development."
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
      const magicLink = `${baseUrl}/api/verify?token=${token}`;

      const msg = {
        to: email,
        from: process.env.SENDER_EMAIL,
        subject: 'Login to CS 173 Certificate of Service Portal',
        text: `Click this link to securely log in: ${magicLink}`,
        html: `<p>Click <strong><a href="${magicLink}">here</a></strong> to securely log in.</p>`,
      };

      await sgMail.send(msg);
      console.log(`Magic link sent to ${email}`);
      res.json({ message: 'Verification email sent!' });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Failed to process login' });
    }
  });

  // Verify token from email link
  app.get('/api/verify', (req, res) => {
    const { token } = req.query;

    if (!token) return res.status(400).send('Invalid link.');

    try {
      const results = db.exec(`SELECT * FROM auth_tokens WHERE token = '${token}'`);

      if (results.length === 0 || results[0].values.length === 0) {
        return res.status(400).send('Invalid or expired link.');
      }

      const row = results[0].values[0];
      const email = row[0];
      const expiresAt = row[2];

      // BULLETPROOF COMPARISON: Convert both to Dates and compare
      if (new Date() > new Date(expiresAt)) {
        return res.status(400).send('Link has expired. Please request a new one.');
      }

      db.run(`DELETE FROM auth_tokens WHERE token = ?`, [token]);
      saveDatabase();

      res.cookie('user_email', email, {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: false,
        secure: true
      });

      res.redirect('/dashboard.html');
    } catch (error) {
      console.error('Verification error:', error);
      res.status(500).send('Server error during verification.');
    }
  });

  // Logout
  app.get('/api/logout', (req, res) => {
    res.clearCookie('user_email');
    res.redirect('/');
  });

  app.post('/api/submit', (req, res) => {
    try {
      console.log('Received submission:', req.body);
      const {
        month, year, name, position, college, activities,
        hoursPerWeek, totalHours, declarationMonth, signatureData, submissionDate
      } = req.body;

      db.run(`
        INSERT INTO submissions (month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, signature_data, submission_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
      `, [
        month, year, name, position, college,
        JSON.stringify(activities), JSON.stringify(hoursPerWeek),
        totalHours, declarationMonth, signatureData, submissionDate
      ]);

      saveDatabase();
      const result = db.exec("SELECT last_insert_rowid() as id");
      const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
      console.log('Saved submission with ID:', lastId);
      res.json({ success: true, id: lastId });
    } catch (error) {
      console.error('Error saving submission:', error);
      res.status(500).json({ success: false, error: 'Failed to save submission' });
    }
  });

  app.get('/api/submissions', (req, res) => {
    try {
      const results = db.exec(`
        SELECT id, month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, submission_date, created_at
        FROM submissions
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

  app.get('/api/submissions/:id', (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM submissions WHERE id = ?");
      stmt.bind([parseInt(req.params.id)]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        row.activities = JSON.parse(row.activities);
        row.hoursPerWeek = JSON.parse(row.hours_per_week);
        stmt.free();
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

app.post('/api/drafts', (req, res) => {
    try {
      console.log('Received draft:', req.body);
      const {
        month, year, name, position, college, activities,
        hoursPerWeek, totalHours, declarationMonth, signatureData, submissionDate
      } = req.body;

db.run(`
        INSERT INTO drafts (month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, signature_data, submission_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
      `, [
        month, year, name, position, college,
        JSON.stringify(activities), JSON.stringify(hoursPerWeek),
        totalHours, declarationMonth, signatureData, submissionDate
      ]);

      saveDatabase();
      const result = db.exec("SELECT last_insert_rowid() as id");
      const lastId = result.length > 0 && result[0].values.length > 0 ? result[0].values[0][0] : 0;
      console.log('Saved draft with ID:', lastId);
      res.json({ success: true, id: lastId });
    } catch (error) {
      console.error('Error saving draft:', error);
      res.status(500).json({ success: false, error: 'Failed to save draft' });
    }
  });

  app.put('/api/drafts/:id', (req, res) => {
    try {
      const {
        month, year, name, position, college, activities,
        hoursPerWeek, totalHours, declarationMonth, signatureData, submissionDate
      } = req.body;

      db.run(`
        UPDATE drafts
        SET month=?, year=?, name=?, position=?, college=?, activities=?, hours_per_week=?, total_hours=?, declaration_month=?, signature_data=?, submission_date=?
        WHERE id=?
      `, [
        month, year, name, position, college,
        JSON.stringify(activities), JSON.stringify(hoursPerWeek),
        totalHours, declarationMonth, signatureData, submissionDate,
        parseInt(req.params.id)
      ]);

      saveDatabase();
      console.log('Updated draft with ID:', req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating draft:', error);
      res.status(500).json({ success: false, error: 'Failed to update draft' });
    }
  });

  app.get('/api/drafts', (req, res) => {
    try {
      const results = db.exec(`
        SELECT id, month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, submission_date, created_at
        FROM drafts
        ORDER BY created_at DESC
      `);

      if (results.length === 0) return res.json([]);

      const columns = results[0].columns;
      const drafts = results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => { obj[col] = row[i]; });
        obj.activities = JSON.parse(obj.activities);
        obj.hoursPerWeek = JSON.parse(obj.hours_per_week);
        return obj;
      });

      res.json(drafts);
    } catch (error) {
      console.error('Error fetching drafts:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch drafts' });
    }
  });

  app.delete('/api/drafts/:id', (req, res) => {
    try {
      db.run('DELETE FROM drafts WHERE id = ?', [parseInt(req.params.id)]);
      saveDatabase();
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting draft:', error);
      res.status(500).json({ success: false, error: 'Failed to delete draft' });
    }
  });

  // Get single draft
  app.get('/api/drafts/:id', (req, res) => {
    try {
      const stmt = db.prepare("SELECT * FROM drafts WHERE id = ?");
      stmt.bind([parseInt(req.params.id)]);

      if (stmt.step()) {
        const row = stmt.getAsObject();
        row.activities = JSON.parse(row.activities);
        row.hoursPerWeek = JSON.parse(row.hours_per_week);
        stmt.free();
        res.json(row);
      } else {
        stmt.free();
        res.status(404).json({ success: false, error: 'Draft not found' });
      }
    } catch (error) {
      console.error('Error fetching draft:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch draft' });
    }
  });

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
      doc.fontSize(16).text('UNIVERSITY OF THE PHILIPPINES', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text('--------------------', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(18).font('Helvetica-Bold').text('CERTIFICATE OF SERVICE', { align: 'center' });
      doc.moveDown();

      // For the month of
      doc.fontSize(14).font('Helvetica').text(`For the month of ${row.month || ''}`);
      doc.moveDown();

      // Personal Information
      doc.fontSize(14).text('Name: ' + (row.name || ''));
      doc.text('Position: ' + (row.position || ''));
      doc.text('College/School of: ' + (row.college || ''));
      doc.moveDown();

      // Service Activities
      doc.fontSize(14).text('Service Activities:', { underline: true });
      doc.moveDown(0.5);
      if (row.activities && row.activities.length > 0) {
        row.activities.forEach((activity, index) => {
          const hours = row.hoursPerWeek && row.hoursPerWeek[index] ? row.hoursPerWeek[index] : '';
          doc.fontSize(12).text(`${index + 1}. ${activity} (${hours} hrs/week)`);
        });
      }
      doc.moveDown();

      // Separator
      doc.fontSize(14).text('--------------------', { align: 'center' });
      doc.moveDown();

      // Declaration
      doc.fontSize(14).text(`I hereby certify upon my honor that I have rendered full service for the month of ${row.declaration_month || row.month}.`);
      doc.moveDown();

      // Signature Section
      doc.fontSize(14).text('Signature:', { underline: true });
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
      doc.fontSize(14).text((row.name || ''));
      doc.moveDown();

      // Attested/Approved Section
      doc.fontSize(14).text('Attested:', { underline: true });
      doc.moveDown(2);
      doc.fontSize(14).text('Chairman, Department of Computer Science');
      doc.moveDown(2);
      doc.fontSize(14).text('Approved:', { underline: true });
      doc.moveDown(2);
      doc.fontSize(14).text('Dean, College of Engineering');
      doc.moveDown(2); 

      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF' });
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}

startServer();