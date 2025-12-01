const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const SerialPort = require('serialport');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'study.db'), (err) => {
  if (err) console.error('Database error:', err);
  else console.log('Connected to SQLite database');
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      total_study_time INTEGER DEFAULT 0,
      sessions INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      locked_until DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
});

// Arduino Serial Port Setup
let servoPort;
let isArduinoConnected = false;

function initializeArduino() {
  // Try to connect to Arduino (adjust COM port as needed)
  const ports = ['COM3', 'COM4', 'COM5', '/dev/ttyUSB0', '/dev/ttyACM0'];
  
  ports.forEach((port) => {
    const tempPort = new SerialPort(port, { baudRate: 9600 }, (err) => {
      if (!err) {
        servoPort = tempPort;
        isArduinoConnected = true;
        console.log(`Connected to Arduino on ${port}`);
      }
    });
  });
}

// Initialize Arduino on startup
setTimeout(initializeArduino, 2000);

// Lock the box
function lockBox(duration) {
  if (isArduinoConnected && servoPort) {
    const command = `LOCK:${duration}\n`;
    servoPort.write(command);
  }
}

// Unlock the box
function unlockBox() {
  if (isArduinoConnected && servoPort) {
    servoPort.write('UNLOCK\n');
  }
}

// API Routes

// Get all users (leaderboard)
app.get('/api/leaderboard', (req, res) => {
  db.all(
    'SELECT * FROM users ORDER BY total_study_time DESC LIMIT 50',
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Create or get user
app.post('/api/users', (req, res) => {
  const { name } = req.body;
  
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Try to get existing user first
  db.get('SELECT * FROM users WHERE name = ?', [name], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    
    if (user) {
      return res.json(user);
    }

    // Create new user
    db.run(
      'INSERT INTO users (name) VALUES (?)',
      [name],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, total_study_time: 0, sessions: 0 });
      }
    );
  });
});

// Start a study session
app.post('/api/sessions/start', (req, res) => {
  const { user_id, duration } = req.body; // duration in minutes

  if (!user_id || !duration) {
    return res.status(400).json({ error: 'user_id and duration are required' });
  }

  const lockedUntil = new Date(Date.now() + duration * 60 * 1000);

  db.run(
    'INSERT INTO sessions (user_id, duration, locked_until) VALUES (?, ?, ?)',
    [user_id, duration, lockedUntil.toISOString()],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });

      // Lock the box
      lockBox(duration);

      res.json({
        session_id: this.lastID,
        user_id,
        duration,
        locked_until: lockedUntil
      });
    }
  );
});

// End a study session
app.post('/api/sessions/end', (req, res) => {
  const { user_id, session_id } = req.body;

  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  db.get(
    'SELECT duration FROM sessions WHERE id = ? AND user_id = ?',
    [session_id, user_id],
    (err, session) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!session) return res.status(404).json({ error: 'Session not found' });

      // Update user total study time
      db.run(
        'UPDATE users SET total_study_time = total_study_time + ?, sessions = sessions + 1 WHERE id = ?',
        [session.duration, user_id],
        (err) => {
          if (err) return res.status(500).json({ error: err.message });

          // Unlock the box
          unlockBox();

          res.json({ message: 'Session ended', duration: session.duration });
        }
      );
    }
  );
});

// Get user sessions
app.get('/api/users/:user_id/sessions', (req, res) => {
  const { user_id } = req.params;

  db.all(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [user_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Get user info
app.get('/api/users/:user_id', (req, res) => {
  const { user_id } = req.params;

  db.get('SELECT * FROM users WHERE id = ?', [user_id], (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });
});

// Check Arduino connection status
app.get('/api/arduino/status', (req, res) => {
  res.json({ connected: isArduinoConnected });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Database: study.db`);
});
