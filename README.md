# CS 173 Certificate of Service Team 1
- I. Chung
- M. Millora
- J. Rifareal
- M. Siasoco

## Certificate of Service (COS) Form

A web-based Certificate of Service form application with database storage.

## Features

- Fill out Certificate of Service forms online
- Add multiple service activities with hours per week
- Digital signature pad 
- Auto-calculate total monthly hours
- Submit and store form data in SQLite database
- View past entries
- Delete unwanted entries

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Database**: SQLite (via sql.js)
- **No build step required**

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and go to:
   ```
   http://localhost:3000
   ```

## Project Structure

```
cos-form/
├── index.html          # Main form page
├── history.html        # View past entries page
├── server.js           # Express backend server
├── database.js         # SQLite database setup
├── package.json        # Dependencies
├── css/
│   └── style.css       # Styling
├── js/
│   ├── script.js       # Form logic
│   └── history.js      # History page logic
└── database.sqlite     # SQLite database file (auto-created)
```

## Usage

### Filling Out the Form

1. **Personal Information**
   - Select the month from the dropdown
   - Enter the year
   - Enter your full name
   - Enter your position/title
   - Enter your college/school name

2. **Service Activities**
   - Enter the activity description (e.g., "Research on AI", "Community extension")
   - Enter approximate hours per week for that activity
   - Click "Add Another Activity" to add more activities
   - Click the "×" button to remove an activity
   - Total hours are calculated automatically

3. **Declaration**
   - Enter the month/year for the declaration statement
   - The declaration text updates in real-time as you type

4. **Digital Signature**
   - Click and drag on the signature canvas to sign
   - Click "Clear Signature" to clear and re-sign

5. **Submit**
   - Click "Submit" to save the form data to the database
   - Click "Reset" to clear all fields and start over

### Viewing Past Entries

1. Click "View Past Entries" in the navigation
2. Browse all submitted entries
3. Delete any unwanted entries

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/submit` | Submit a new form |
| GET | `/api/submissions` | Get all submissions |
| GET | `/api/submissions/:id` | Get a specific submission |
| DELETE | `/api/submissions/:id` | Delete a submission |

## Database Schema

```sql
CREATE TABLE submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  college TEXT NOT NULL,
  activities TEXT NOT NULL,      -- JSON array
  hours_per_week TEXT NOT NULL,  -- JSON array
  total_hours INTEGER,
  declaration_month TEXT,
  signature_data TEXT,           -- Base64 image
  submission_date TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Viewing the Database

### Option 1: DB Browser for SQLite
1. Download from https://sqlitebrowser.org/
2. Open `database.sqlite` in the cos-form folder

### Option 2: Command Line
```bash
sqlite3 database.sqlite
sqlite> SELECT * FROM submissions;
sqlite> .quit
```

### Option 3: VS Code Extension
Install "SQLite Viewer" extension and open `database.sqlite`

## Troubleshooting

### Server won't start
- Make sure port 3000 is not in use
- Check that Node.js is installed: `node --version`

### Form not saving
- Check if the server is running (look for "Server running" message)
- Open browser console (F12) to see error messages
- Check the terminal for server-side errors

### Signature not working
- Make sure to draw on the canvas (click and drag)
- Mobile: Use touch to draw
