#!/usr/bin/env python3
"""
WhatsApp Clone Test Data Generator
This script populates the application with test users and messages to test scrolling functionality.
"""

import requests
import json
import time
import random
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:3000"
NUM_MESSAGES = 50  # Number of messages to generate per chat

# Test users data
TEST_USERS = [
    {"username": "alice", "password": "password123"},
    {"username": "bob", "password": "password123"},
    {"username": "charlie", "password": "password123"},
]

# Sample messages for realistic chat
SAMPLE_MESSAGES = [
    "Hey! How are you doing?",
    "I'm doing great, thanks for asking!",
    "What are you up to today?",
    "Just working on some projects",
    "That sounds interesting!",
    "Yeah, it's pretty cool",
    "Have you seen the latest news?",
    "No, what happened?",
    "Check it out when you get a chance",
    "Will do!",
    "Thanks for letting me know",
    "No problem at all",
    "How's the weather there?",
    "It's pretty nice actually",
    "Lucky you!",
    "Haha, yeah",
    "What are you doing this weekend?",
    "Not sure yet, you?",
    "Maybe going out with friends",
    "That sounds fun!",
    "Want to join us?",
    "Sure, let me know the details",
    "Will do!",
    "Looking forward to it",
    "Same here!",
    "This is going to be awesome",
    "Definitely!",
    "Can't wait",
    "Me neither",
    "It's going to be so much fun",
    "Absolutely!",
    "I'm so excited",
    "You should be!",
    "This is amazing",
    "I know right?",
    "Best thing ever",
    "Totally agree",
    "This is what I've been waiting for",
    "Same energy here",
    "Let's make it happen",
    "For sure!",
    "Count me in",
    "Awesome!",
    "This is perfect",
    "Indeed it is",
    "Nothing could be better",
    "Exactly my thoughts",
    "Great minds think alike",
    "They really do",
    "Alright, talk to you later!",
    "Sounds good, bye!",
]

class WhatsAppTestClient:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
        self.tokens = {}

    def register_user(self, username, password):
        """Register a new user"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/register",
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                self.tokens[username] = data.get("token")
                print(f"✓ Registered user: {username}")
                return True
            elif response.status_code == 400 and "already exists" in response.text:
                # User already exists, try to login
                return self.login_user(username, password)
            else:
                print(f"✗ Failed to register {username}: {response.text}")
                return False
        except Exception as e:
            print(f"✗ Error registering {username}: {e}")
            return False

    def login_user(self, username, password):
        """Login an existing user"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/login",
                json={"username": username, "password": password},
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                data = response.json()
                self.tokens[username] = data.get("token")
                print(f"✓ Logged in user: {username}")
                return True
            else:
                print(f"✗ Failed to login {username}: {response.text}")
                return False
        except Exception as e:
            print(f"✗ Error logging in {username}: {e}")
            return False

    def add_contact(self, username, contact_username):
        """Add a contact for a user"""
        try:
            token = self.tokens.get(username)
            if not token:
                print(f"✗ No token for {username}")
                return False

            response = self.session.post(
                f"{self.base_url}/api/add-contact",
                json={"token": token, "contactUsername": contact_username},
                headers={"Content-Type": "application/json"}
            )
            if response.status_code == 200:
                print(f"✓ {username} added {contact_username} as contact")
                return True
            elif response.status_code == 400 and "already" in response.text.lower():
                print(f"  {username} already has {contact_username} as contact")
                return True
            else:
                print(f"✗ Failed to add contact: {response.text}")
                return False
        except Exception as e:
            print(f"✗ Error adding contact: {e}")
            return False

def check_server():
    """Check if the server is running"""
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=5)
        if response.status_code == 200:
            print("✓ Server is running")
            return True
        else:
            print("✗ Server returned unexpected status")
            return False
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to server. Make sure the server is running on port 3000")
        print("  Run: node server.js")
        return False
    except Exception as e:
        print(f"✗ Error checking server: {e}")
        return False

def populate_data():
    """Main function to populate test data"""
    print("=" * 60)
    print("WhatsApp Clone - Test Data Generator")
    print("=" * 60)
    print()

    # Check if server is running
    if not check_server():
        return False

    print()
    client = WhatsAppTestClient(BASE_URL)

    # Step 1: Register/Login users
    print("Step 1: Creating test users...")
    print("-" * 60)
    for user in TEST_USERS:
        client.register_user(user["username"], user["password"])
        time.sleep(0.5)

    print()

    # Step 2: Add contacts (create bidirectional friendships)
    print("Step 2: Adding contacts...")
    print("-" * 60)
    for i, user in enumerate(TEST_USERS):
        for other_user in TEST_USERS[i+1:]:
            client.add_contact(user["username"], other_user["username"])
            client.add_contact(other_user["username"], user["username"])
            time.sleep(0.3)

    print()
    print("=" * 60)
    print("✓ Test data population complete!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("1. Open your browser to http://localhost:3000")
    print("2. Login with one of these accounts:")
    for user in TEST_USERS:
        print(f"   - Username: {user['username']}, Password: {user['password']}")
    print("3. Click on a contact to start chatting")
    print("4. Send some messages to test the scroll functionality!")
    print()
    print("Note: To generate lots of messages for scrolling, you need to:")
    print("- Open the app in your browser")
    print("- Create a chat with a contact")
    print("- Send multiple messages to see scrolling in action")
    print()

    return True

if __name__ == "__main__":
    try:
        populate_data()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
