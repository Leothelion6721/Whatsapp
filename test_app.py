#!/usr/bin/env python3
"""
WhatsApp Clone - App Launcher and Tester
This script helps you start the server and test the scrolling functionality.
"""

import subprocess
import webbrowser
import time
import requests
import sys
import os

BASE_URL = "http://localhost:3000"

def check_node_installed():
    """Check if Node.js is installed"""
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✓ Node.js is installed: {result.stdout.strip()}")
            return True
    except FileNotFoundError:
        pass
    print("✗ Node.js is not installed")
    return False

def check_server_running():
    """Check if server is already running"""
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=2)
        if response.status_code == 200:
            return True
    except:
        pass
    return False

def start_server():
    """Start the Node.js server"""
    print("Starting server...")
    try:
        # Start server in background
        process = subprocess.Popen(
            ['node', 'server.js'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Wait for server to start
        for i in range(10):
            time.sleep(1)
            if check_server_running():
                print("✓ Server started successfully!")
                return process
            print(f"  Waiting for server... ({i+1}/10)")

        print("✗ Server failed to start within 10 seconds")
        return None
    except Exception as e:
        print(f"✗ Error starting server: {e}")
        return None

def open_browser():
    """Open the app in browser"""
    print(f"Opening browser to {BASE_URL}")
    webbrowser.open(BASE_URL)

def print_instructions():
    """Print testing instructions"""
    print("\n" + "=" * 70)
    print(" HOW TO TEST SCROLLING FUNCTIONALITY")
    print("=" * 70)
    print()
    print("The scrolling functionality is built into the web app using CSS/JavaScript.")
    print("Python cannot control browser scrolling - that happens in the frontend.")
    print()
    print("TO SEE SCROLLING IN ACTION:")
    print()
    print("1. Register/Login with a username and password")
    print("   Example: username='alice', password='test123'")
    print()
    print("2. Add a contact:")
    print("   - Click 'Contacts' tab")
    print("   - Enter another username (e.g., 'bob')")
    print("   - Create that user in another browser tab first")
    print()
    print("3. Start a chat:")
    print("   - Click on a contact")
    print("   - Send many messages (10-20+)")
    print()
    print("4. TEST THE SCROLLING:")
    print("   ✓ Scroll UP/DOWN in the messages area")
    print("   ✓ Custom scrollbar should appear on the right")
    print("   ✓ When you scroll up, a ⬇️ button appears")
    print("   ✓ Click the button to jump back to bottom")
    print("   ✓ Smooth scrolling animations")
    print()
    print("5. ALSO TEST:")
    print("   ✓ Scroll through contacts list (sidebar)")
    print("   ✓ Scroll through chats list (sidebar)")
    print()
    print("=" * 70)
    print()

def main():
    """Main function"""
    print("\n" + "=" * 70)
    print(" WhatsApp Clone - Test App Launcher")
    print("=" * 70)
    print()

    # Check Node.js
    if not check_node_installed():
        print("\nPlease install Node.js first:")
        print("  https://nodejs.org/")
        return 1

    print()

    # Check if server is running
    if check_server_running():
        print("✓ Server is already running")
    else:
        print("Server is not running. Starting it now...")
        process = start_server()
        if not process:
            return 1

    print()
    time.sleep(1)

    # Open browser
    open_browser()

    # Print instructions
    print_instructions()

    print("TIP: Open your browser's Developer Console (F12) to check for errors")
    print()
    print("Press Ctrl+C to stop this script")
    print()

    try:
        # Keep script running
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n\nStopping...")
        return 0

if __name__ == "__main__":
    sys.exit(main())
