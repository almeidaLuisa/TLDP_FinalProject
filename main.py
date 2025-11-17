# this page will serve as a webpage with buttons that talks to our USB to send commands

from flask import Flask
import serial
import serial.tools.list_ports

ARDUINO_PORT = None
BAUD_RATE = 9600
app = Flask(__name__)

