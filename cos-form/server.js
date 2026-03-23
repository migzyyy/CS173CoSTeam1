const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, getDatabase, saveDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

async function startServer() {
  await initDatabase();
  const db = getDatabase();

  app.post('/api/submit', (req, res) => {
    try {
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
      const result = db.exec("SELECT last_insert_rowid()");
      res.json({ success: true, id: result[0].values[0][0] });
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

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/index.html in your browser`);
  });
}

startServer();
