#!/usr/bin/env python3
"""
WhatsApp Clone Message Generator
This script connects to the WhatsApp clone via WebSocket and generates test messages
to populate chats for testing scrolling functionality.

Install requirements: pip install websocket-client requests
"""

import json
import time
import random
from datetime import datetime
import requests

try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    print("⚠ websocket-client not installed. Install with: pip install websocket-client")

# Configuration
BASE_URL = "http://localhost:3000"
WS_URL = "ws://localhost:3000/socket.io/?EIO=4&transport=websocket"

# Sample messages
SAMPLE_MESSAGES = [
    "Hey! How are you doing?",
    "I'm doing great, thanks!",
    "What are you up to today?",
    "Just working on some projects 💻",
    "That sounds interesting!",
    "Yeah, it's been pretty cool",
    "Have you seen the latest news?",
    "No, what happened?",
    "Check it out when you get a chance",
    "Will do, thanks!",
    "How's the weather there?",
    "It's pretty nice actually ☀️",
    "Lucky you!",
    "Haha, yeah 😄",
    "What are your plans this weekend?",
    "Not sure yet, you?",
    "Maybe going out with friends",
    "That sounds fun!",
    "Want to join us?",
    "Sure, let me know the details",
    "Perfect! I'll send you the info later",
    "Looking forward to it!",
    "Same here! 🎉",
    "This is going to be awesome",
    "Definitely!",
    "Can't wait for the weekend",
    "Me neither, it's been a long week",
    "Tell me about it...",
    "At least we have something to look forward to",
    "True! That always helps",
    "By the way, did you finish that task?",
    "Yeah, I completed it yesterday",
    "Nice! How did it go?",
    "Pretty smooth actually",
    "That's great to hear!",
    "Thanks! How about yours?",
    "Still working on it",
    "You'll get there!",
    "I hope so 😅",
    "I believe in you!",
    "Thanks for the encouragement 🙏",
    "Anytime! That's what friends are for",
    "You're the best!",
    "Aww, you too!",
    "So what's new with you?",
    "Not much, same old same old",
    "I feel you on that",
    "How about we do something different this weekend?",
    "I'm all for that! Any ideas?",
    "How about trying that new restaurant?",
    "The one on Main Street?",
    "Yeah, that's the one!",
    "I've heard good things about it",
    "Me too! Let's go for it",
    "Sounds like a plan!",
    "I'll make a reservation",
    "Perfect! What time works for you?",
    "How about 7 PM?",
    "That works for me!",
    "Great! See you then",
    "See you! 👋",
]

def login_user(username, password):
    """Login and get token"""
    try:
        response = requests.post(
            f"{BASE_URL}/api/login",
            json={"username": username, "password": password},
            headers={"Content-Type": "application/json"},
            timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            return data.get("token")
        else:
            print(f"✗ Failed to login {username}: {response.text}")
            return None
    except Exception as e:
        print(f"✗ Error logging in: {e}")
        return None

def generate_messages_directly():
    """Generate messages by directly modifying the data files"""
    print("=" * 60)
    print("WhatsApp Clone - Direct Message Generator")
    print("=" * 60)
    print()

    import os

    data_dir = "./data"
    messages_file = os.path.join(data_dir, "messages.json")
    chats_file = os.path.join(data_dir, "chats.json")
    users_file = os.path.join(data_dir, "users.json")

    # Check if files exist
    if not os.path.exists(messages_file) or not os.path.exists(chats_file):
        print("✗ Data files not found. Please:")
        print("  1. Start the server: node server.js")
        print("  2. Run populate_test_data.py to create users")
        print("  3. Login and create at least one chat in the browser")
        return False

    try:
        # Load existing data
        with open(messages_file, 'r') as f:
            messages_data = json.load(f)

        with open(chats_file, 'r') as f:
            chats_data = json.load(f)

        with open(users_file, 'r') as f:
            users_data = json.load(f)

        # Convert to dicts
        messages_dict = dict(messages_data)
        chats_dict = dict(chats_data)

        if not chats_dict:
            print("✗ No chats found. Please:")
            print("  1. Login to the app in your browser")
            print("  2. Create a chat with a contact")
            print("  3. Then run this script again")
            return False

        print(f"Found {len(chats_dict)} chat(s)")
        print()

        # Generate messages for each chat
        for chat_id, chat_info in chats_dict.items():
            participants = chat_info["participants"]
            print(f"Generating messages for chat: {participants[0]} <-> {participants[1]}")

            # Get or create message list for this chat
            if chat_id not in messages_dict:
                messages_dict[chat_id] = []

            existing_count = len(messages_dict[chat_id])
            print(f"  Existing messages: {existing_count}")

            # Generate 50 new messages
            num_new_messages = 50
            for i in range(num_new_messages):
                sender = random.choice(participants)
                message = {
                    "id": f"{int(time.time() * 1000)}-{random.randint(1000, 9999)}",
                    "chatId": chat_id,
                    "senderUsername": sender,
                    "text": random.choice(SAMPLE_MESSAGES),
                    "file": None,
                    "timestamp": int(time.time() * 1000) + i,
                    "read": False
                }
                messages_dict[chat_id].append(message)
                time.sleep(0.01)  # Small delay to ensure unique timestamps

            # Update last message in chat
            last_msg = messages_dict[chat_id][-1]
            chat_info["lastMessage"] = {
                "text": last_msg["text"],
                "time": last_msg["timestamp"]
            }

            print(f"  ✓ Added {num_new_messages} messages (total: {len(messages_dict[chat_id])})")
            print()

        # Save back to files
        print("Saving data...")
        with open(messages_file, 'w') as f:
            json.dump(list(messages_dict.items()), f, indent=2)

        with open(chats_file, 'w') as f:
            json.dump(list(chats_dict.items()), f, indent=2)

        print()
        print("=" * 60)
        print("✓ Messages generated successfully!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Restart the server (Ctrl+C then run: node server.js)")
        print("2. Refresh your browser")
        print("3. Open any chat to see the messages")
        print("4. Scroll up and down to test the functionality!")
        print()

        return True

    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """Main function"""
    if not WEBSOCKET_AVAILABLE:
        print()
        print("Using direct file method instead...")
        print()
        return generate_messages_directly()
    else:
        # If websocket is available, we could implement socket-based generation
        # For now, use the direct method as it's more reliable
        return generate_messages_directly()

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
