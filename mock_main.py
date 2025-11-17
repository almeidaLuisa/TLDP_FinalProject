# this page will serve as a webpage with buttons that talks to our USB to send commands

from flask import Flask
import serial
import serial.tools.list_ports

ARDUINO_PORT = None # Set to your Arduino's port like 'COM3' (Windows) or '/dev/ttyUSB0' (Mac/Linux)
BAUD_RATE = 9600
app = Flask(__name__)


class MockSerial:
    """
    A fake serial class that mimics pyserial's write() method
    for testing when no hardware is connected.
    """

    def __init__(self, port, baudrate):
        print(f"--- MOCK MODE ---")
        print(f"No hardware found at {port}.")
        print("Using MockSerial. Commands will be printed to the console.")
        print(f"-------------------")

    def write(self, data):
        # .decode() turns bytes (like b'L') into a string (like 'L')
        print(f"MOCK SERIAL: Wrote command '{data.decode()}'")


try:
    # If you haven't set a specific port, try to find one
    if ARDUINO_PORT is None:
        ports = serial.tools.list_ports.comports()
        # Find the first port that looks like an Arduino
        arduino_ports = [p.device for p in ports if
                         'arduino' in p.description.lower() or 'ch340' in p.description.lower()]
        if not arduino_ports:
            raise serial.SerialException("No Arduino found.")
        ARDUINO_PORT = arduino_ports[0]

    ser = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
    print(f"--- REAL MODE ---")
    print(f"Successfully connected to Arduino at {ARDUINO_PORT}")
    print(f"-----------------")

except serial.SerialException:
    # If connection fails, use the MockSerial class
    ser = MockSerial(port=ARDUINO_PORT or "Not Found", baudrate=BAUD_RATE)

#HTML part:
HTML_CONTENT = """
<!DOCTYPE html>
<html>
...
        <a href="/lock" id="lock" class="button">LOCK</a>
        <a href="/unlock" id="unlock" class="button">UNLOCK</a>
...
</html>
"""