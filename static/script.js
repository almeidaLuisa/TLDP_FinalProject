const API_URL = 'http://localhost:5000/api';
let currentUser = null;
let currentSession = null;
let sessionTimer = null;

// Check Arduino status on load
window.addEventListener('load', () => {
    checkArduinoStatus();
    loadLeaderboard();
    setInterval(loadLeaderboard, 10000); // Refresh leaderboard every 10 seconds
});

// Arduino Status
async function checkArduinoStatus() {
    try {
        const res = await fetch(`${API_URL}/arduino/status`);
        const data = await res.json();
        const statusEl = document.getElementById('arduino-status');
        
        if (data.connected) {
            statusEl.textContent = '✅ Arduino Connected';
            statusEl.classList.add('connected');
            statusEl.classList.remove('disconnected');
        } else {
            statusEl.textContent = '⚠️ Arduino Disconnected (Demo Mode)';
            statusEl.classList.add('disconnected');
            statusEl.classList.remove('connected');
        }
    } catch (err) {
        console.error('Error checking Arduino status:', err);
        const statusEl = document.getElementById('arduino-status');
        statusEl.textContent = '❌ Server Error';
        statusEl.classList.add('disconnected');
    }
}

// User Management
async function loginUser() {
    const nameInput = document.getElementById('username');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        
        const user = await res.json();
        currentUser = user;
        
        // Update UI
        document.querySelector('.user-form').classList.add('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-name').textContent = user.name;
        document.getElementById('timer-section').style.display = 'block';
        
        updateUserStats();
        
        // Reset timer inputs
        document.getElementById('study-duration').value = 25;
        document.getElementById('start-btn').classList.remove('hidden');
        document.getElementById('end-btn').classList.add('hidden');
        document.getElementById('session-active').classList.add('hidden');
        
    } catch (err) {
        console.error('Error logging in:', err);
        alert('Error logging in. Please try again.');
    }
}

async function updateUserStats() {
    if (!currentUser) return;
    
    try {
        const res = await fetch(`${API_URL}/users/${currentUser.id}`);
        const user = await res.json();
        currentUser = user;
        
        const hours = Math.floor(user.total_study_time / 60);
        const minutes = user.total_study_time % 60;
        
        document.getElementById('total-study-time').textContent = `${hours}h ${minutes}m`;
        document.getElementById('sessions-count').textContent = user.sessions;
    } catch (err) {
        console.error('Error updating user stats:', err);
    }
}

// Study Sessions
async function startSession() {
    if (!currentUser) return;
    
    const duration = parseInt(document.getElementById('study-duration').value);
    
    if (!duration || duration < 1 || duration > 240) {
        alert('Please enter a valid duration (1-240 minutes)');
        return;
    }
    
    try {
        const res = await fetch(`${API_URL}/sessions/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                user_id: currentUser.id, 
                duration 
            })
        });
        
        const session = await res.json();
        currentSession = session;
        
        // Update UI
        document.getElementById('start-btn').classList.add('hidden');
        document.getElementById('end-btn').classList.remove('hidden');
        document.getElementById('session-active').classList.remove('hidden');
        document.getElementById('study-duration').disabled = true;
        
        // Start timer
        startTimer(new Date(session.locked_until));
        
    } catch (err) {
        console.error('Error starting session:', err);
        alert('Error starting session. Please try again.');
    }
}

async function endSession() {
    if (!currentUser || !currentSession) return;
    
    try {
        const res = await fetch(`${API_URL}/sessions/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                session_id: currentSession.session_id
            })
        });
        
        const data = await res.json();
        
        // Clear timer
        if (sessionTimer) clearInterval(sessionTimer);
        
        // Update UI
        document.getElementById('start-btn').classList.remove('hidden');
        document.getElementById('end-btn').classList.add('hidden');
        document.getElementById('session-active').classList.add('hidden');
        document.getElementById('study-duration').disabled = false;
        document.getElementById('progress-fill').style.width = '0%';
        
        currentSession = null;
        
        // Update stats and leaderboard
        await updateUserStats();
        await loadLeaderboard();
        
        alert(`Session ended! You studied for ${data.duration} minutes.`);
        
    } catch (err) {
        console.error('Error ending session:', err);
        alert('Error ending session. Please try again.');
    }
}

function startTimer(lockedUntil) {
    const startTime = new Date();
    const totalDuration = lockedUntil - startTime;
    
    const updateTimer = () => {
        const now = new Date();
        const remaining = lockedUntil - now;
        
        if (remaining <= 0) {
            document.getElementById('time-remaining').textContent = '00:00';
            document.getElementById('progress-fill').style.width = '100%';
            clearInterval(sessionTimer);
            return;
        }
        
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        document.getElementById('time-remaining').textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        
        const elapsed = now - startTime;
        const progress = (elapsed / totalDuration) * 100;
        document.getElementById('progress-fill').style.width = `${Math.min(progress, 100)}%`;
        
        document.getElementById('lock-until').textContent = 
            `Box locked until: ${lockedUntil.toLocaleTimeString()}`;
    };
    
    updateTimer(); // Call once immediately
    sessionTimer = setInterval(updateTimer, 1000);
}

// Leaderboard
async function loadLeaderboard() {
    try {
        const res = await fetch(`${API_URL}/leaderboard`);
        const users = await res.json();
        
        const tbody = document.getElementById('leaderboard-body');
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No users yet</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map((user, index) => {
            const hours = Math.floor(user.total_study_time / 60);
            const minutes = user.total_study_time % 60;
            const timeStr = `${hours}h ${minutes}m`;
            
            return `
                <tr>
                    <td>#${index + 1}</td>
                    <td>${user.name}</td>
                    <td>${timeStr}</td>
                    <td>${user.sessions}</td>
                </tr>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Error loading leaderboard:', err);
    }
}

// Allow Enter key to login
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.getElementById('username').value) {
        loginUser();
    }
});
