// CellBox Arduino Code
// Controls a servo to lock/unlock a box based on commands from Flask app
// Servo control code for locking the phone in the box

#include <Servo.h>

Servo lockServo;
const int SERVO_PIN = 9;  // PWM pin for servo
const int LED_PIN = 13;   // Status LED

// Servo positions
const int LOCK_POSITION = 180;    // Servo position when locked
const int UNLOCK_POSITION = 0;    // Servo position when unlocked

// Lock state variables
bool isLocked = false;
unsigned long lockEndTime = 0;
int lockDurationSeconds = 0;

void setup() {
  Serial.begin(9600);
  
  lockServo.attach(SERVO_PIN);
  pinMode(LED_PIN, OUTPUT);
  
  // Initialize to unlocked position
  lockServo.write(UNLOCK_POSITION);
  digitalWrite(LED_PIN, LOW);
  
  delay(1000);
  Serial.println("CellBox Arduino Ready");
  Serial.println("Commands: LOCK:<minutes> or UNLOCK");
}

void loop() {
  // Check if we need to auto-unlock
  if (isLocked && millis() > lockEndTime) {
    autoUnlock();
  }
  
  // Read serial commands
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    processCommand(command);
  }
  
  // Update LED status
  digitalWrite(LED_PIN, isLocked ? HIGH : LOW);
}

void processCommand(String cmd) {
  if (cmd.startsWith("LOCK:")) {
    // Extract duration in minutes
    int colonIndex = cmd.indexOf(':');
    String durationStr = cmd.substring(colonIndex + 1);
    int durationMinutes = durationStr.toInt();
    
    if (durationMinutes > 0) {
      lockBox(durationMinutes);
      Serial.print("LOCKED for ");
      Serial.print(durationMinutes);
      Serial.println(" minutes");
    } else {
      Serial.println("ERROR: Invalid duration");
    }
  }
  else if (cmd == "UNLOCK") {
    unlockBox();
    Serial.println("UNLOCKED");
  }
  else {
    Serial.println("ERROR: Unknown command");
  }
}

void lockBox(int durationMinutes) {
  if (isLocked) {
    Serial.println("ERROR: Already locked");
    return;
  }
  
  // Move servo to lock position
  lockServo.write(LOCK_POSITION);
  
  isLocked = true;
  lockDurationSeconds = durationMinutes * 60;
  lockEndTime = millis() + (durationMinutes * 60 * 1000UL);
  
  // Status light on
  digitalWrite(LED_PIN, HIGH);
}

void unlockBox() {
  // Move servo to unlock position
  lockServo.write(UNLOCK_POSITION);
  
  isLocked = false;
  lockEndTime = 0;
  lockDurationSeconds = 0;
  
  // Status light off
  digitalWrite(LED_PIN, LOW);
}

void autoUnlock() {
  Serial.println("Time's up! Auto-unlocking...");
  unlockBox();
}
