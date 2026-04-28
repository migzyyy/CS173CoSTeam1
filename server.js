require('dotenv').config(); // Loads your SendGrid keys from .env
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto'); // Built-in Node module for token generation
const sgMail = require('@sendgrid/mail'); // SendGrid SDK
const cookieParser = require('cookie-parser'); // <-- ADD THIS
const { initDatabase, getDatabase, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Configure SendGrid with your key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser()); // <-- ADD THIS
app.use(express.static(path.join(__dirname)));

async function startServer() {
  await initDatabase();
  const db = getDatabase();

  // Create table for our magic link tokens
  db.run(`CREATE TABLE IF NOT EXISTS auth_tokens (
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at DATETIME NOT NULL
  )`);
  saveDatabase(); // Ensure the table creation is saved to your sqlite file

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.post('/api/submit', (req, res) => {
    try {
      console.log('Received submission:', req.body);
      const {
        month,
        year,
        name,
        position,
        college,
        activities,
        hoursPerWeek,
        totalHours,
        declarationMonth,
        signatureData,
        submissionDate
      } = req.body;

      db.run(`
        INSERT INTO submissions (month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, signature_data, submission_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        month,
        year,
        name,
        position,
        college,
        JSON.stringify(activities),
        JSON.stringify(hoursPerWeek),
        totalHours,
        declarationMonth,
        signatureData,
        submissionDate
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

      if (results.length === 0) {
        return res.json([]);
      }

      const columns = results[0].columns;
      const submissions = results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
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
        month,
        year,
        name,
        position,
        college,
        activities,
        hoursPerWeek,
        totalHours,
        declarationMonth,
        signatureData,
        submissionDate
      } = req.body;

      db.run(`
        INSERT INTO drafts (month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, signature_data, submission_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `, [
        month,
        year,
        name,
        position,
        college,
        JSON.stringify(activities),
        JSON.stringify(hoursPerWeek),
        totalHours,
        declarationMonth,
        signatureData,
        submissionDate
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

  app.get('/api/drafts', (req, res) => {
    try {
      const results = db.exec(`
        SELECT id, month, year, name, position, college, activities, hours_per_week, total_hours, declaration_month, submission_date, created_at
        FROM drafts
        ORDER BY created_at DESC
      `);

      if (results.length === 0) {
        return res.json([]);
      }

      const columns = results[0].columns;
      const drafts = results[0].values.map(row => {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = row[i];
        });
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

  // ... (Your existing code above) ...

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

  // === NEW AUTHENTICATION ROUTES ===

  // 1. Receive email and send the Magic Link
  app.post('/api/login', async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      // Generate a secure 64-character hex token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      // Save token to database
      db.run(
        `INSERT INTO auth_tokens (email, token, expires_at) VALUES (?, ?, ?)`, 
        [email, token, expiresAt]
      );
      saveDatabase();

      // Construct the Magic Link (Change localhost to your Droplet IP when deploying)
      const magicLink = `http://localhost:${PORT}/verify?token=${token}`;

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

  // 2. Handle the user clicking the link in their email
  app.get('/verify', (req, res) => {
      const { token } = req.query;

      if (!token) return res.status(400).send('Invalid link.');

      try {
          const results = db.exec(`SELECT * FROM auth_tokens WHERE token = '${token}'`);
          
          if (results.length === 0 || results[0].values.length === 0) {
              return res.status(400).send('Invalid or expired link.');
          }

          // Extract row data (Assuming format: email, token, expires_at)
          const row = results[0].values[0];
          const email = row[0];
          const expiresAt = row[2];

          // Check if token expired
          if (new Date() > new Date(expiresAt)) {
              return res.status(400).send('Link has expired. Please request a new one.');
          }

          // Token is valid! Delete it so it can't be used twice
          db.run(`DELETE FROM auth_tokens WHERE token = ?`, [token]);
          saveDatabase();

          // === NEW COOKIE LOGIC ===
          // Set a secure, HTTP-only cookie that lasts for 24 hours
          res.cookie('user_email', email, { 
              maxAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
              httpOnly: false, // Set to false so frontend JS can read it for UI purposes
              secure: false // Keep false for localhost testing. Change to true when on DigitalOcean (HTTPS)!
          });

          // Redirect the user to the dashboard upon success
          res.redirect('/dashboard.html');
      } catch (error) {
          console.error('Verification error:', error);
          res.status(500).send('Server error during verification.');
      }
  });

  // 3. Logout Route
  app.get('/api/logout', (req, res) => {
      res.clearCookie('user_email');
      res.redirect('/'); // Send them back to the login page
  });

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
  });
}

startServer();
