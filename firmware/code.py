# firmware/code.py
import time
import usb_cdc
from pmk import PMK
from pmk.platform.keybow2040 import Keybow2040 as Hardware

keybow = PMK(Hardware())
keybow.rotate(270)  # 90 degrees anti-clockwise
keys = keybow.keys

# Get the data serial port (enabled in boot.py)
serial = usb_cdc.data
if serial is None:
    # Fallback: data port not available, halt with red LED
    keybow.set_all(255, 0, 0)
    while True:
        pass

ROWS = 'ABCD'

def num_to_grid(n):
    row = ROWS[n // 4]
    col = (n % 4) + 1
    return f"{row}{col}"

def grid_to_num(grid):
    row = ROWS.index(grid[0])
    col = int(grid[1]) - 1
    return row * 4 + col

led_colors = {}
serial_buffer = ""

def is_valid_hex(s):
    if len(s) != 6:
        return False
    try:
        int(s, 16)
        return True
    except ValueError:
        return False

def send(msg):
    serial.write((msg + "\n").encode("utf-8"))

def read_serial_line():
    global serial_buffer
    available = serial.in_waiting
    if available:
        data = serial.read(available)
        if data:
            serial_buffer += "".join(chr(b) for b in data)
    if "\n" in serial_buffer:
        line, serial_buffer = serial_buffer.split("\n", 1)
        return line.strip()
    return None

def parse_command(line):
    line = line.strip()
    if not line or len(line) > 64:
        return

    if line == 'PING':
        send('PONG')
        return

    if line.startswith('LED:'):
        parts = line.split(':')
        if len(parts) != 3:
            return
        target = parts[1]
        value = parts[2]

        if target == 'ALL':
            if value == 'OFF':
                keybow.set_all(0, 0, 0)
                led_colors.clear()
            elif is_valid_hex(value):
                r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
                keybow.set_all(r, g, b)
                for i in range(16):
                    led_colors[i] = (r, g, b)
        else:
            try:
                key_num = grid_to_num(target)
            except (ValueError, IndexError):
                return
            if value == 'OFF':
                keys[key_num].set_led(0, 0, 0)
                led_colors.pop(key_num, None)
            elif is_valid_hex(value):
                r, g, b = int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)
                keys[key_num].set_led(r, g, b)
                led_colors[key_num] = (r, g, b)
        return

    if line.startswith('PROFILE:'):
        return

for key in keys:
    @keybow.on_press(key)
    def press_handler(key):
        grid = num_to_grid(key.number)
        key.set_led(255, 255, 255)
        send(f"KEY:{grid}:PRESS")

    @keybow.on_release(key)
    def release_handler(key):
        if key.number in led_colors:
            r, g, b = led_colors[key.number]
            key.set_led(r, g, b)
        else:
            key.set_led(0, 0, 0)
        grid = num_to_grid(key.number)
        send(f"KEY:{grid}:RELEASE")

    @keybow.on_hold(key)
    def hold_handler(key):
        grid = num_to_grid(key.number)
        send(f"KEY:{grid}:HOLD")

send("READY")

while True:
    keybow.update()
    line = read_serial_line()
    if line is not None:
        parse_command(line)
