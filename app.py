import os
import sqlite3
import serial
import serial.tools.list_ports
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, render_template, send_from_directory

app = Flask(__name__, template_folder='templates', static_folder='static')

# Enable CORS for API routes
from flask_cors import CORS
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Database setup
DB_PATH = 'study.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
#testing something 
def init_db():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            total_study_time REAL DEFAULT 0,
            sessions INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            locked_until DATETIME NOT NULL,
            created_at DATETIME DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    conn.commit()
    conn.close()

# Arduino Serial Communication
arduino_port = None
is_connected = False
# Author: Luisa Almeida
# Date: 2025-12-01
# find_arduino_port()
# Scans all available COM ports and identifies a real Arduino USB device.

# How it works:
# - Reads every serial port and checks its description + hardware ID.
# - Looks for known Arduino-related identifiers such as:
#     "arduino", "ch340", "usb-serial", "cp210", "silabs"
# - Attempts to open the port to confirm it is a real, accessible device.
# - Prevents false positives from Bluetooth or virtual ports that contain "USB".
# Returns:
#   A string such as 'COM5' if a valid Arduino is found,
#   or None if no real Arduino device is detected.
# Prevents:
#   - Connecting to Bluetooth COM ports
#   - Marking Arduino as "connected" when the board is not plugged in
def find_arduino_port():
    """Scan COM ports and find a REAL Arduino / USB-Serial device."""
    arduino_keywords = ['arduino', 'ch340', 'usb-serial', 'silabs', 'cp210', 'usb serial']
    ports = serial.tools.list_ports.comports()
    for port in ports:
        desc = port.description.lower()
        hwid = port.hwid.lower()

        # Check if the port actually looks like an Arduino USB device
        if any(keyword in desc for keyword in arduino_keywords) or \
           any(keyword in hwid for keyword in arduino_keywords):

            # Verify we can open it
            try:
                ser = serial.Serial(port.device, 9600, timeout=1)
                ser.close()
                return port.device
            except:
                continue

    return None
# Author: Luisa Almeida
# Date: 2025-12-01
# init_arduino()
# Initializes the Arduino USB connection used by the lockbox system.
# Steps:
# 1. Calls find_arduino_port() to locate an actual Arduino device.
# 2. If found, opens the serial connection at 9600 baud.
# 3. Updates global variables:
#       - arduino_port   → holds the Serial() object
#       - is_connected   → True only if connection was successful
# Behavior:
# - If no Arduino is found, sets is_connected = False.
# - Avoids connecting to Bluetooth or invalid ports.
# - Ensures the UI only shows “Arduino Connected” when a REAL board is detected.
# Returns:
#   None
def init_arduino():
    """Initialize Arduino connection."""
    global arduino_port, is_connected

    port_name = find_arduino_port()

    if not port_name:
        print("No Arduino detected.")
        is_connected = False
        arduino_port = None
        return

    try:
        arduino_port = serial.Serial(port_name, 9600, timeout=2)
        is_connected = True
        print(f"Connected to Arduino on {port_name}")
    except Exception as e:
        print(f"Failed to connect to Arduino: {e}")
        is_connected = False
        arduino_port = None
def lock_box(duration_minutes):
    """Send lock command to Arduino"""
    if is_connected and arduino_port:
        try:
            command = f"LOCK:{duration_minutes}\n"
            arduino_port.write(command.encode())
            print(f"Box locked for {duration_minutes} minutes")
        except Exception as e:
            print(f"Error sending lock command: {e}")

def unlock_box():
    """Send unlock command to Arduino"""
    if is_connected and arduino_port:
        try:
            arduino_port.write(b"UNLOCK\n")
            print("Box unlocked")
        except Exception as e:
            print(f"Error sending unlock command: {e}")

# API Routes

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'Server is running'})

@app.route('/api/arduino/status', methods=['GET'])
def arduino_status():
    return jsonify({'connected': is_connected})

@app.route('/api/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get top 50 users by study time"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users ORDER BY total_study_time DESC LIMIT 50')
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(users)

@app.route('/api/users', methods=['POST'])
def create_or_get_user():
    """Create new user or get existing user"""
    data = request.json
    name = data.get('name', '').strip()
    
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    
    conn = get_db()
    cursor = conn.cursor()
    
    # Check if user exists
    cursor.execute('SELECT * FROM users WHERE name = ?', (name,))
    user = cursor.fetchone()
    
    if user:
        conn.close()
        return jsonify(dict(user))
    
    # Create new user
    cursor.execute('INSERT INTO users (name) VALUES (?)', (name,))
    conn.commit()
    user_id = cursor.lastrowid
    
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    new_user = dict(cursor.fetchone())
    conn.close()
    
    return jsonify(new_user), 201

@app.route('/api/users/<int:user_id>', methods=['GET'])
def get_user(user_id):
    """Get user info"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE id = ?', (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify(dict(user))

@app.route('/api/users/<int:user_id>/sessions', methods=['GET'])
def get_user_sessions(user_id):
    """Get user's past sessions"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', (user_id,))
    sessions = [dict(row) for row in cursor.fetchall()]
    conn.close()
    
    return jsonify(sessions)

@app.route('/api/sessions/start', methods=['POST'])
def start_session():
    """Start a new study session and lock the box"""
    data = request.json
    user_id = data.get('user_id')
    duration = data.get('duration')  # in minutes
    
    if not user_id or not duration:
        return jsonify({'error': 'user_id and duration are required'}), 400
    
    locked_until = datetime.now() + timedelta(minutes=int(duration))
    
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO sessions (user_id, duration, locked_until) VALUES (?, ?, ?)',
        (user_id, duration, locked_until.isoformat())
    )
    conn.commit()
    session_id = cursor.lastrowid
    conn.close()
    
    # Lock the box
    lock_box(duration)
    
    return jsonify({
        'session_id': session_id,
        'user_id': user_id,
        'duration': duration,
        'locked_until': locked_until.isoformat()
    }), 201

@app.route('/api/sessions/end', methods=['POST'])
@app.route('/api/sessions/end', methods=['POST'])
# End an active study session.
# - Validates that user_id and session_id were provided.
# - Retrieves the session's start time from the database.
# - Calculates the actual study duration in seconds.
# - Converts duration to minutes with decimals allowed if needed.
# - Updates the user's total study time and increments session count.
# - Sends an UNLOCK command to the Arduino lockbox.
# - Returns a JSON response with the real duration (can be less than 1 minute).
def end_session():
    data = request.json
    user_id = data.get('user_id')
    session_id = data.get('session_id')

    if not user_id or not session_id:
        return jsonify({'error': 'user_id and session_id are required'}), 400

    conn = get_db()
    cursor = conn.cursor()

    # Fetch session start time
    cursor.execute('SELECT created_at FROM sessions WHERE id = ? AND user_id = ?', (session_id, user_id))
    session = cursor.fetchone()

    if not session:
        conn.close()
        return jsonify({'error': 'Session not found'}), 404

    # Calculate real duration (in minutes, with decimals)
    start_time = datetime.strptime(session['created_at'], "%Y-%m-%d %H:%M:%S")
    now = datetime.now()

    total_seconds = (now - start_time).total_seconds()
    real_duration_minutes = total_seconds / 60  # now accurate even for <1min

    # Update user stats (store minutes, decimal allowed)
    cursor.execute(
        'UPDATE users SET total_study_time = total_study_time + ?, sessions = sessions + 1 WHERE id = ?',
        (real_duration_minutes, user_id)
    )
    conn.commit()
    conn.close()

    # Unlock hardware
    unlock_box()

    return jsonify({'message': 'Session ended', 'real_duration_minutes': real_duration_minutes})

# Serve HTML
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    init_db()
    init_arduino()
    app.run(debug=True, port=5000)
