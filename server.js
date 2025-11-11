const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Mailjet = require('node-mailjet');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    maxHttpBufferSize: 10e6
});

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Mailjet configuration (IMPORTANT: Use environment variables for security)
const MAILJET_API_KEY = process.env.MAILJET_API_KEY || 'F26FADC590F1FAC70BC378EF5E264C98';
const MAILJET_SECRET_KEY = process.env.MAILJET_SECRET_KEY || '';  // You need to provide this

// Initialize Mailjet client
let mailjetClient = null;
if (MAILJET_API_KEY && MAILJET_SECRET_KEY) {
    mailjetClient = new Mailjet.apiConnect(MAILJET_API_KEY, MAILJET_SECRET_KEY);
    console.log('📧 Mailjet email service initialized');
} else {
    console.warn('⚠️ Mailjet not configured. Email invitations will be disabled. Please set MAILJET_API_KEY and MAILJET_SECRET_KEY environment variables.');
}

// Create necessary directories
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|mp4|mp3|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// In-memory storage with persistence
let users = new Map();
let messages = new Map();
let chats = new Map();
let sessions = new Map();
let meetings = new Map();

// Load data from files if they exist
function loadData() {
    try {
        const usersFile = path.join(dataDir, 'users.json');
        const messagesFile = path.join(dataDir, 'messages.json');
        const chatsFile = path.join(dataDir, 'chats.json');
        const meetingsFile = path.join(dataDir, 'meetings.json');

        if (fs.existsSync(usersFile)) {
            const usersData = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            users = new Map(usersData);
        }
        if (fs.existsSync(messagesFile)) {
            const messagesData = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
            messages = new Map(messagesData);
        }
        if (fs.existsSync(chatsFile)) {
            const chatsData = JSON.parse(fs.readFileSync(chatsFile, 'utf8'));
            chats = new Map(chatsData);
        }
        if (fs.existsSync(meetingsFile)) {
            const meetingsData = JSON.parse(fs.readFileSync(meetingsFile, 'utf8'));
            meetings = new Map(meetingsData);
        }
        console.log('📁 Data loaded successfully');
    } catch (error) {
        console.error('Error loading data:', error.message);
    }
}

// Save data to files
function saveData() {
    try {
        fs.writeFileSync(
            path.join(dataDir, 'users.json'),
            JSON.stringify([...users], null, 2)
        );
        fs.writeFileSync(
            path.join(dataDir, 'messages.json'),
            JSON.stringify([...messages], null, 2)
        );
        fs.writeFileSync(
            path.join(dataDir, 'chats.json'),
            JSON.stringify([...chats], null, 2)
        );
        fs.writeFileSync(
            path.join(dataDir, 'meetings.json'),
            JSON.stringify([...meetings], null, 2)
        );
    } catch (error) {
        console.error('Error saving data:', error.message);
    }
}

// Load data on startup
loadData();

// Save data periodically
setInterval(saveData, 30000);

// Helper functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function getChatId(user1, user2) {
    return [user1, user2].sort().join('-');
}

function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded.userId;
    } catch (error) {
        return null;
    }
}

// Email sending function
async function sendMeetingInvitationEmail(recipientEmail, recipientName, meeting, organizerName) {
    if (!mailjetClient) {
        console.log('📧 Email service not configured. Skipping email to:', recipientEmail);
        return { success: false, message: 'Email service not configured' };
    }

    try {
        const meetingDate = new Date(meeting.dateTime);
        const formattedDate = meetingDate.toLocaleString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });

        const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #00a884 0%, #005c4b 100%); padding: 40px 30px; text-align: center; }
        .header-icon { font-size: 64px; margin-bottom: 10px; }
        .header h1 { color: white; margin: 0; font-size: 28px; }
        .content { padding: 40px 30px; }
        .meeting-card { background: #f8f9fa; border-left: 4px solid #00a884; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .meeting-detail { margin: 12px 0; display: flex; align-items: start; }
        .detail-icon { margin-right: 10px; font-size: 20px; }
        .detail-label { font-weight: 600; color: #333; min-width: 100px; }
        .detail-value { color: #555; }
        .cta-button { display: inline-block; background: #00a884; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
        .cta-button:hover { background: #06cf9c; }
        .footer { background: #f8f9fa; padding: 20px 30px; text-align: center; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-icon">📅</div>
            <h1>Meeting Invitation</h1>
        </div>

        <div class="content">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                Hello <strong>${recipientName}</strong>,
            </p>

            <p style="font-size: 16px; color: #555; line-height: 1.6;">
                You have been invited to a meeting by <strong>${organizerName}</strong>.
            </p>

            <div class="meeting-card">
                <h2 style="margin: 0 0 20px 0; color: #00a884; font-size: 22px;">
                    ${meeting.title}
                </h2>

                ${meeting.description ? `
                <div class="meeting-detail">
                    <span class="detail-icon">📝</span>
                    <div>
                        <div class="detail-label">Description:</div>
                        <div class="detail-value">${meeting.description}</div>
                    </div>
                </div>
                ` : ''}

                <div class="meeting-detail">
                    <span class="detail-icon">🕐</span>
                    <div>
                        <div class="detail-label">Date & Time:</div>
                        <div class="detail-value">${formattedDate}</div>
                    </div>
                </div>

                <div class="meeting-detail">
                    <span class="detail-icon">⏱️</span>
                    <div>
                        <div class="detail-label">Duration:</div>
                        <div class="detail-value">${meeting.duration} minutes</div>
                    </div>
                </div>

                <div class="meeting-detail">
                    <span class="detail-icon">👤</span>
                    <div>
                        <div class="detail-label">Organizer:</div>
                        <div class="detail-value">${organizerName}</div>
                    </div>
                </div>
            </div>

            <center>
                <a href="${process.env.APP_URL || 'http://localhost:3000'}" class="cta-button">
                    Join Meeting in WhatsApp
                </a>
            </center>

            <p style="font-size: 14px; color: #777; margin-top: 30px; line-height: 1.6;">
                To join this meeting, log in to your WhatsApp account and navigate to the Meetings tab.
                You can also join directly from the invitation message in your chat.
            </p>
        </div>

        <div class="footer">
            <p style="margin: 0;">This is an automated message from WhatsApp Meeting Scheduler</p>
            <p style="margin: 10px 0 0 0;">© ${new Date().getFullYear()} WhatsApp Clone. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;

        const request = mailjetClient
            .post('send', { version: 'v3.1' })
            .request({
                Messages: [
                    {
                        From: {
                            Email: process.env.SENDER_EMAIL || 'noreply@whatsapp-clone.com',
                            Name: 'WhatsApp Meeting Scheduler'
                        },
                        To: [
                            {
                                Email: recipientEmail,
                                Name: recipientName
                            }
                        ],
                        Subject: `Meeting Invitation: ${meeting.title}`,
                        HTMLPart: htmlTemplate,
                        TextPart: `You have been invited to a meeting: ${meeting.title}\n\nDate & Time: ${formattedDate}\nDuration: ${meeting.duration} minutes\nOrganizer: ${organizerName}\n\nLog in to WhatsApp to join the meeting.`
                    }
                ]
            });

        const result = await request;
        console.log(`✅ Email sent successfully to ${recipientEmail}`);
        return { success: true, result };

    } catch (error) {
        console.error('❌ Error sending email:', error.message);
        return { success: false, error: error.message };
    }
}

// REST API Endpoints

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
        return res.status(400).json({ error: 'Username, password, and email are required' });
    }

    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateId();

    users.set(username, {
        userId,
        password: hashedPassword,
        username,
        email,
        contacts: [],
        createdAt: Date.now(),
        online: false,
        socketId: null
    });
    
    saveData();
    
    const token = generateToken(userId);
    sessions.set(token, userId);
    
    res.json({ 
        success: true, 
        token,
        userId,
        username
    });
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = users.get(username);
    if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user.userId);
    sessions.set(token, user.userId);
    
    res.json({ 
        success: true, 
        token,
        userId: user.userId,
        username: user.username
    });
});

// Add contact endpoint
app.post('/api/add-contact', async (req, res) => {
    const { token, contactUsername } = req.body;
    
    const userId = verifyToken(token);
    if (!userId) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    let currentUser = null;
    for (const [username, user] of users.entries()) {
        if (user.userId === userId) {
            currentUser = user;
            break;
        }
    }
    
    if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    if (!users.has(contactUsername)) {
        return res.status(404).json({ error: 'Contact username does not exist' });
    }
    
    if (currentUser.contacts.includes(contactUsername)) {
        return res.status(400).json({ error: 'Contact already added' });
    }
    
    currentUser.contacts.push(contactUsername);
    saveData();
    
    res.json({ success: true, message: 'Contact added successfully' });
});

// Get contacts endpoint
app.post('/api/get-contacts', async (req, res) => {
    const { token } = req.body;
    
    const userId = verifyToken(token);
    if (!userId) {
        return res.status(401).json({ error: 'Invalid token' });
    }
    
    let currentUser = null;
    for (const [username, user] of users.entries()) {
        if (user.userId === userId) {
            currentUser = user;
            break;
        }
    }
    
    if (!currentUser) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    const contactsList = currentUser.contacts.map(contactUsername => {
        const contact = users.get(contactUsername);
        return {
            username: contactUsername,
            online: contact ? contact.online : false,
            userId: contact ? contact.userId : null
        };
    });
    
    res.json({ success: true, contacts: contactsList });
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    let currentUsername = null;

    socket.on('authenticate', (data) => {
        const { token } = data;
        const userId = verifyToken(token);
        
        if (!userId) {
            socket.emit('auth-error', { error: 'Invalid token' });
            return;
        }
        
        for (const [username, user] of users.entries()) {
            if (user.userId === userId) {
                currentUsername = username;
                user.online = true;
                user.socketId = socket.id;
                
                user.contacts.forEach(contactUsername => {
                    const contact = users.get(contactUsername);
                    if (contact && contact.online && contact.socketId) {
                        io.to(contact.socketId).emit('contact-online', {
                            username: currentUsername
                        });
                    }
                });
                
                const contactsList = user.contacts.map(contactUsername => {
                    const contact = users.get(contactUsername);
                    return {
                        username: contactUsername,
                        online: contact ? contact.online : false
                    };
                });
                
                const chatsList = [];
                for (const [chatId, chat] of chats.entries()) {
                    if (chat.participants.includes(currentUsername)) {
                        const otherParticipant = chat.participants.find(p => p !== currentUsername);
                        if (user.contacts.includes(otherParticipant)) {
                            chatsList.push({
                                id: chatId,
                                name: otherParticipant,
                                online: users.get(otherParticipant)?.online || false,
                                lastMessage: chat.lastMessage || null
                            });
                        }
                    }
                }
                
                socket.emit('authenticated', {
                    username: currentUsername,
                    contacts: contactsList,
                    chats: chatsList
                });
                
                saveData();
                console.log(`User authenticated: ${currentUsername}`);
                break;
            }
        }
    });

    socket.on('create-chat', (data) => {
        const { contactUsername } = data;
        
        if (!currentUsername || !contactUsername) return;
        
        const currentUser = users.get(currentUsername);
        if (!currentUser || !currentUser.contacts.includes(contactUsername)) {
            socket.emit('chat-error', { error: 'User is not in your contacts' });
            return;
        }
        
        const chatId = getChatId(currentUsername, contactUsername);
        
        if (!chats.has(chatId)) {
            chats.set(chatId, {
                id: chatId,
                participants: [currentUsername, contactUsername],
                createdAt: Date.now(),
                lastMessage: null
            });
            messages.set(chatId, []);
            saveData();
        }
        
        const contact = users.get(contactUsername);
        socket.emit('chat-created', {
            id: chatId,
            name: contactUsername,
            online: contact ? contact.online : false
        });
    });

    socket.on('send-message', (data) => {
        const { chatId, text, file } = data;
        
        if (!currentUsername || !chatId) return;
        if (!text && !file) return;
        
        const chat = chats.get(chatId);
        if (!chat || !chat.participants.includes(currentUsername)) return;
        
        const currentUser = users.get(currentUsername);
        const otherParticipant = chat.participants.find(p => p !== currentUsername);
        
        if (!currentUser.contacts.includes(otherParticipant)) {
            socket.emit('message-error', { error: 'Cannot send message to non-contact' });
            return;
        }
        
        const message = {
            id: generateId(),
            chatId,
            senderUsername: currentUsername,
            text: text || '',
            file: file || null,
            timestamp: Date.now(),
            read: false
        };
        
        const chatMessages = messages.get(chatId) || [];
        chatMessages.push(message);
        messages.set(chatId, chatMessages);
        
        chat.lastMessage = {
            text: text || (file ? '📎 File' : ''),
            time: Date.now()
        };
        
        saveData();
        
        chat.participants.forEach(participantUsername => {
            const participant = users.get(participantUsername);
            if (participant && participant.online && participant.socketId) {
                if (participantUsername === currentUsername || participant.contacts.includes(currentUsername)) {
                    io.to(participant.socketId).emit('new-message', {
                        chatId,
                        message: {
                            id: message.id,
                            text: message.text,
                            file: message.file,
                            senderUsername: message.senderUsername,
                            timestamp: message.timestamp,
                            sent: participantUsername === currentUsername
                        }
                    });
                }
            }
        });
        
        console.log(`Message sent in chat ${chatId} by ${currentUsername}`);
    });

    socket.on('upload-file', async (data) => {
        const { chatId, fileData, fileName, fileType } = data;
        
        if (!currentUsername || !chatId || !fileData) return;
        
        try {
            const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + fileName;
            const filePath = path.join(uploadsDir, uniqueFilename);
            
            const base64Data = fileData.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');
            
            fs.writeFileSync(filePath, buffer);
            
            const fileInfo = {
                filename: uniqueFilename,
                originalName: fileName,
                mimetype: fileType,
                size: buffer.length,
                url: `/uploads/${uniqueFilename}`
            };
            
            socket.emit('file-uploaded', {
                chatId,
                file: fileInfo
            });
            
        } catch (error) {
            console.error('File upload error:', error);
            socket.emit('upload-error', { error: 'Failed to upload file' });
        }
    });

    socket.on('add-contact', async (data) => {
        const { contactUsername } = data;
        
        if (!currentUsername) return;
        
        const currentUser = users.get(currentUsername);
        if (!currentUser) return;
        
        if (!users.has(contactUsername)) {
            socket.emit('contact-error', { error: 'User does not exist' });
            return;
        }
        
        if (currentUser.contacts.includes(contactUsername)) {
            socket.emit('contact-error', { error: 'Already in contacts' });
            return;
        }
        
        currentUser.contacts.push(contactUsername);
        saveData();
        
        const contact = users.get(contactUsername);
        socket.emit('contact-added', {
            username: contactUsername,
            online: contact ? contact.online : false,
            userId: contact ? contact.userId : null
        });
        
        console.log(`${currentUsername} added ${contactUsername} as contact`);
    });

    socket.on('remove-contact', async (data) => {
        const { contactUsername } = data;
        
        if (!currentUsername) return;
        
        const currentUser = users.get(currentUsername);
        if (!currentUser) return;
        
        currentUser.contacts = currentUser.contacts.filter(c => c !== contactUsername);
        saveData();
        
        socket.emit('contact-removed', { username: contactUsername });
        
        console.log(`${currentUsername} removed ${contactUsername} from contacts`);
    });

    socket.on('typing', (data) => {
        const { chatId, isTyping } = data;
        
        if (!currentUsername || !chatId) return;
        
        const chat = chats.get(chatId);
        if (!chat) return;
        
        chat.participants.forEach(participantUsername => {
            if (participantUsername !== currentUsername) {
                const participant = users.get(participantUsername);
                if (participant && participant.online && participant.socketId) {
                    if (participant.contacts.includes(currentUsername)) {
                        io.to(participant.socketId).emit('user-typing', {
                            chatId,
                            username: currentUsername,
                            isTyping
                        });
                    }
                }
            }
        });
    });

    socket.on('get-messages', (data) => {
        const { chatId } = data;
        
        if (!currentUsername || !chatId) return;
        
        const chat = chats.get(chatId);
        if (!chat || !chat.participants.includes(currentUsername)) return;
        
        const currentUser = users.get(currentUsername);
        const otherParticipant = chat.participants.find(p => p !== currentUsername);
        
        if (!currentUser.contacts.includes(otherParticipant)) {
            socket.emit('messages-error', { error: 'Cannot access messages with non-contact' });
            return;
        }
        
        const chatMessages = messages.get(chatId) || [];
        
        socket.emit('messages-loaded', {
            chatId,
            messages: chatMessages.map(msg => ({
                id: msg.id,
                text: msg.text,
                file: msg.file,
                senderUsername: msg.senderUsername,
                timestamp: msg.timestamp,
                sent: msg.senderUsername === currentUsername
            }))
        });
    });

    // WebRTC Call Signaling Handlers
    socket.on('call-offer', (data) => {
        const { to, offer, isVideo } = data;
        
        if (!currentUsername) return;
        
        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            // Forward the call offer to the target user
            io.to(targetUser.socketId).emit('incoming-call', {
                from: currentUsername,
                offer: offer,
                isVideo: isVideo
            });
            console.log(`Call offer from ${currentUsername} to ${to}`);
        }
    });

    socket.on('call-answer', (data) => {
        const { to, answer } = data;
        
        if (!currentUsername) return;
        
        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            // Forward the call answer to the caller
            io.to(targetUser.socketId).emit('call-answered', {
                from: currentUsername,
                answer: answer
            });
            console.log(`Call answered from ${currentUsername} to ${to}`);
        }
    });

    socket.on('ice-candidate', (data) => {
        const { to, candidate } = data;
        
        if (!currentUsername) return;
        
        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            // Forward ICE candidate
            io.to(targetUser.socketId).emit('ice-candidate', {
                from: currentUsername,
                candidate: candidate
            });
        }
    });

    socket.on('call-declined', (data) => {
        const { to } = data;
        
        if (!currentUsername) return;
        
        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            io.to(targetUser.socketId).emit('call-declined', {
                from: currentUsername
            });
            console.log(`Call declined by ${currentUsername}`);
        }
    });

    socket.on('call-cancelled', (data) => {
        const { to } = data;
        
        if (!currentUsername) return;
        
        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            io.to(targetUser.socketId).emit('call-cancelled', {
                from: currentUsername
            });
            console.log(`Call cancelled by ${currentUsername}`);
        }
    });

    socket.on('call-ended', (data) => {
        const { to } = data;

        if (!currentUsername) return;

        const targetUser = users.get(to);
        if (targetUser && targetUser.online && targetUser.socketId) {
            io.to(targetUser.socketId).emit('call-ended', {
                from: currentUsername
            });
            console.log(`Call ended by ${currentUsername}`);
        }
    });

    // Meeting Handlers
    socket.on('create-meeting', (meeting) => {
        if (!currentUsername) return;

        meetings.set(meeting.id, meeting);
        saveData();

        // Emit to organizer
        socket.emit('meeting-created', meeting);

        // Notify all participants
        meeting.participants.forEach(participantUsername => {
            const participant = users.get(participantUsername);
            if (participant && participant.online && participant.socketId) {
                io.to(participant.socketId).emit('meeting-created', meeting);
            }
        });

        // Send invitation messages if requested
        if (meeting.sendInvitations) {
            const meetingDate = new Date(meeting.dateTime);
            const formattedDate = meetingDate.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            meeting.participants.forEach(participantUsername => {
                const chatId = [currentUsername, participantUsername].sort().join('-');

                // Create or get chat
                if (!chats.has(chatId)) {
                    chats.set(chatId, {
                        id: chatId,
                        participants: [currentUsername, participantUsername],
                        createdAt: Date.now()
                    });
                }

                // Create invitation message
                const invitationMessage = {
                    id: Date.now() + '-invitation-' + Math.random(),
                    chatId,
                    from: currentUsername,
                    to: participantUsername,
                    type: 'meeting-invitation',
                    meetingId: meeting.id,
                    meetingTitle: meeting.title,
                    meetingDescription: meeting.description,
                    meetingDateTime: meeting.dateTime,
                    meetingDuration: meeting.duration,
                    formattedDate: formattedDate,
                    timestamp: Date.now(),
                    read: false
                };

                // Save message
                if (!messages.has(chatId)) {
                    messages.set(chatId, []);
                }
                messages.get(chatId).push(invitationMessage);

                // Send to participant if online
                const participant = users.get(participantUsername);
                if (participant && participant.online && participant.socketId) {
                    io.to(participant.socketId).emit('new-message', invitationMessage);
                    io.to(participant.socketId).emit('meeting-invitation', {
                        meetingId: meeting.id,
                        meetingTitle: meeting.title,
                        organizer: currentUsername
                    });
                }

                // Send email invitation
                if (participant && participant.email) {
                    sendMeetingInvitationEmail(
                        participant.email,
                        participantUsername,
                        meeting,
                        currentUsername
                    ).catch(err => {
                        console.error(`Failed to send email to ${participant.email}:`, err.message);
                    });
                }

                console.log(`Invitation sent to ${participantUsername} for meeting: ${meeting.title}`);
            });

            saveData();
        }

        console.log(`Meeting created: ${meeting.title} by ${currentUsername}`);
    });

    socket.on('get-meetings', () => {
        if (!currentUsername) return;

        // Get meetings where user is organizer or participant
        const userMeetings = Array.from(meetings.values()).filter(meeting =>
            meeting.organizer === currentUsername || meeting.participants.includes(currentUsername)
        );

        socket.emit('meetings-list', userMeetings);
    });

    socket.on('delete-meeting', (meetingId) => {
        if (!currentUsername) return;

        const meeting = meetings.get(meetingId);
        if (meeting && meeting.organizer === currentUsername) {
            meetings.delete(meetingId);
            saveData();

            // Notify organizer
            socket.emit('meeting-deleted', meetingId);

            // Notify all participants
            meeting.participants.forEach(participantUsername => {
                const participant = users.get(participantUsername);
                if (participant && participant.online && participant.socketId) {
                    io.to(participant.socketId).emit('meeting-deleted', meetingId);
                }
            });

            console.log(`Meeting deleted: ${meeting.title} by ${currentUsername}`);
        }
    });

    socket.on('join-meeting-room', (data) => {
        if (!currentUsername) return;

        const { meetingId } = data;
        socket.join(`meeting-${meetingId}`);
        console.log(`${currentUsername} joined meeting room: ${meetingId}`);
    });

    socket.on('leave-meeting-room', (data) => {
        if (!currentUsername) return;

        const { meetingId } = data;
        socket.leave(`meeting-${meetingId}`);
        console.log(`${currentUsername} left meeting room: ${meetingId}`);
    });

    socket.on('meeting-offer', (data) => {
        if (!currentUsername) return;

        const { meetingId, offer } = data;
        socket.to(`meeting-${meetingId}`).emit('meeting-offer', {
            meetingId,
            offer,
            from: currentUsername
        });
    });

    socket.on('meeting-answer', (data) => {
        if (!currentUsername) return;

        const { meetingId, answer } = data;
        socket.to(`meeting-${meetingId}`).emit('meeting-answer', {
            meetingId,
            answer,
            from: currentUsername
        });
    });

    socket.on('meeting-ice-candidate', (data) => {
        if (!currentUsername) return;

        const { meetingId, candidate } = data;
        socket.to(`meeting-${meetingId}`).emit('meeting-ice-candidate', {
            meetingId,
            candidate,
            from: currentUsername
        });
    });

    socket.on('meeting-chat-message', (data) => {
        if (!currentUsername) return;

        const { meetingId, message } = data;
        io.to(`meeting-${meetingId}`).emit('meeting-chat-message', {
            meetingId,
            sender: currentUsername,
            message
        });
    });

    socket.on('disconnect', () => {
        if (currentUsername) {
            const user = users.get(currentUsername);
            if (user) {
                user.online = false;
                user.socketId = null;
                
                user.contacts.forEach(contactUsername => {
                    const contact = users.get(contactUsername);
                    if (contact && contact.online && contact.socketId) {
                        io.to(contact.socketId).emit('contact-offline', {
                            username: currentUsername
                        });
                    }
                });
                
                saveData();
                console.log(`User disconnected: ${currentUsername}`);
            }
        }
        console.log('Client disconnected:', socket.id);
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        users: users.size,
        chats: chats.size,
        meetings: meetings.size,
        messages: Array.from(messages.values()).reduce((sum, msgs) => sum + msgs.length, 0),
        authenticated: true
    });
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB' });
        }
    }
    res.status(500).json({ error: error.message });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n💾 Saving data before shutdown...');
    saveData();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n💾 Saving data before shutdown...');
    saveData();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatsApp Clone Server running on port ${PORT}`);
    console.log(`🔐 Authentication enabled with password protection`);
    console.log(`👥 Contact list feature enabled`);
    console.log(`📎 File upload feature enabled`);
    console.log(`📞 Voice & Video calling enabled (WebRTC)`);
    console.log(`📅 Meeting scheduler enabled with Zoom-like interface`);
    console.log(`💾 Data persistence enabled`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`📂 Uploads directory: ${uploadsDir}`);
});
