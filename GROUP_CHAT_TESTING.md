# 👥 Group Chat Testing Guide

## Quick Test Guide for Group Functionality

### Prerequisites
1. Server running: `node server.js`
2. At least 3 user accounts created
3. Users have added each other as contacts

---

## How to Test Groups (5 Minutes)

### Step 1: Create Users (if you haven't already)

**Window 1 - Alice:**
- Open: http://localhost:3000
- Sign up: `alice` / `password123`

**Window 2 - Bob (Incognito):**
- Open: http://localhost:3000
- Sign up: `bob` / `password123`

**Window 3 - Charlie (Another incognito):**
- Open: http://localhost:3000
- Sign up: `charlie` / `password123`

### Step 2: Add Each Other as Contacts

**Alice's window:**
1. Click "Contacts" tab
2. Add: `bob`
3. Add: `charlie`

**Bob's window:**
1. Click "Contacts" tab
2. Add: `alice`
3. Add: `charlie`

**Charlie's window:**
1. Click "Contacts" tab
2. Add: `alice`
3. Add: `bob`

### Step 3: Create a Group

**In Alice's window:**
1. Click the 👥 button in the sidebar header (next to logout)
2. Enter group name: `Team Chat`
3. You'll see a list of contacts:
   ```
   1. bob
   2. charlie
   ```
4. Enter: `1,2` (to add both)
5. Click OK

**You should see:**
- ✅ Alert: "Group 'Team Chat' created successfully!"
- ✅ Group appears in chats list with 👥 icon
- ✅ Green avatar for the group
- ✅ Member count: "(3)"

### Step 4: Verify Group Appears for All Members

**In Bob's window:**
- ✅ Group "Team Chat 👥" should appear in chats list

**In Charlie's window:**
- ✅ Group "Team Chat 👥" should appear in chats list

### Step 5: Test Group Messaging

**Alice sends a message:**
1. Click on "Team Chat" group
2. Type: "Hello everyone! Welcome to the team!"
3. Send

**Bob and Charlie should see:**
- ✅ Message from Alice appears instantly
- ✅ Message shows sender name "alice"
- ✅ Real-time updates

**Bob replies:**
1. Type: "Thanks Alice! Happy to be here!"
2. Send

**Everyone sees Bob's message**

**Charlie replies:**
1. Type: "Hey team! 👋"
2. Send

**Everyone sees Charlie's message**

### Step 6: Test Group Features

#### Check Group Status
- Click on group in any window
- Status should show: "3 members"
- Name shows: "Team Chat 👥"

#### Test Scrolling in Group
- Send 20+ messages in the group
- ✅ Scroll up and down
- ✅ Scroll-to-bottom button (⬇️) should appear

#### Test Last Message Update
- Send a message
- ✅ Group in chat list updates with last message
- ✅ Timestamp updates

---

## 🎯 What to Verify

### ✅ Group Creation
- [x] Can create group with 2+ contacts
- [x] Group appears for all members
- [x] Group shows 👥 icon
- [x] Member count displayed

### ✅ Group Messaging
- [x] All members receive messages
- [x] Sender name shown on messages
- [x] Real-time message delivery
- [x] Message history persists

### ✅ Group Visual Indicators
- [x] Green avatar for groups
- [x] 👥 icon on avatar
- [x] "(X members)" count in name
- [x] Status shows "X members"

### ✅ Group in Chat List
- [x] Groups appear above 1-on-1 chats
- [x] Last message updates
- [x] Timestamp updates
- [x] Click to open group chat

---

## 🔧 Advanced Testing

### Test Admin Controls (Server-side)

**Note:** Admin controls are implemented server-side. In future updates, you can add UI for:
- Adding members (admin only)
- Removing members (admin only)
- Leaving group (any member)
- Viewing members list

**Current:** Group creator is automatically the admin.

### Test Group Persistence

1. Create a group and send messages
2. Refresh the browser
3. Login again
4. ✅ Group should still be there
5. ✅ Messages should be loaded

### Test Multiple Groups

1. Create another group: "Work Team"
2. Add different members
3. ✅ Both groups appear in list
4. ✅ Can switch between groups
5. ✅ Messages stay in correct group

---

## 🐛 Troubleshooting

### Group doesn't appear
- Make sure all users added each other as contacts first
- Check server console for errors
- Refresh browser

### Can't create group
- Need at least 1 contact to create group
- Make sure contacts have been added

### Messages not appearing
- Check all users are logged in
- Check browser console (F12) for errors
- Verify server is running

### Group creation fails
- Make sure you enter valid contact numbers
- Use commas to separate: `1,2` or `1,2,3`
- Numbers must match contact list

---

## 📊 Server Logs to Check

When testing, watch server console for:
```
Group "Team Chat" created by alice with 2 members
Message sent in group <groupId> by bob
charlie added to group <groupId> by alice
```

---

## 🎉 Success Checklist

- [x] Created group with multiple contacts
- [x] All members see the group
- [x] Can send and receive group messages
- [x] Group shows in chat list with icon
- [x] Member count displays correctly
- [x] Messages show sender names
- [x] Last message updates in chat list
- [x] Can switch between groups and 1-on-1 chats
- [x] Group messages persist after refresh

---

## 🚀 Features Included

✅ **Group Creation** - Create groups with 2+ contacts
✅ **Group Messaging** - Send/receive messages to all members
✅ **Admin Controls** - Group creator is admin (server-side)
✅ **Member Management** - Add/remove members (server-side APIs ready)
✅ **Visual Indicators** - 👥 icon, green avatar, member count
✅ **Real-time Updates** - Instant message delivery
✅ **Persistence** - Groups and messages saved
✅ **Group Encryption** - Supports encrypted group messages
✅ **Leave Group** - Server-side API ready
✅ **Auto Admin Transfer** - When admin leaves

Enjoy your new group chat feature! 👥🎉
