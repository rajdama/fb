# global_key_listener.py
from pynput import keyboard
import sys
import json

def on_press(key):
    try:
        # Send key name to stdout as JSON
        print(json.dumps({"type": "press", "key": key.char}))
    except AttributeError:
        # Special keys (like ESC, Ctrl, etc.)
        print(json.dumps({"type": "press", "key": str(key)}))
    sys.stdout.flush()  # Important to flush stdout

    # Emergency exit on ESC
    if key == keyboard.Key.esc:
        print(json.dumps({"type": "exit"}))
        sys.stdout.flush()
        return False  # Stop listener

listener = keyboard.Listener(on_press=on_press)
listener.start()
listener.join()
