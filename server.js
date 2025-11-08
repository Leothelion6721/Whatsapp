const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

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

// Email Configuration
// Set these environment variables to enable email sending:
// EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
const emailConfig = {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com', // e.g., 'smtp.gmail.com' for Gmail
    port: process.env.EMAIL_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: process.env.EMAIL_USER ? {
        user: process.env.EMAIL_USER, // Your email address
        pass: process.env.EMAIL_PASS  // Your email password or app password
    } : null
};

const emailFrom = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@securewhatsapp.com';

// Create email transporter (only if credentials are provided)
let emailTransporter = null;
if (emailConfig.auth) {
    emailTransporter = nodemailer.createTransport(emailConfig);
    console.log('✅ Email service configured');

    // Verify email configuration
    emailTransporter.verify((error, success) => {
        if (error) {
            console.error('❌ Email service error:', error.message);
            emailTransporter = null;
        } else {
            console.log('✅ Email service ready to send messages');
        }
    });
} else {
    console.log('⚠️  Email service not configured - will log to console instead');
    console.log('   To enable email, set these environment variables:');
    console.log('   EMAIL_USER, EMAIL_PASS, EMAIL_HOST (optional), EMAIL_FROM (optional)');
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
let groups = new Map(); // For group chats
let sessions = new Map();
let passwordResetTokens = new Map(); // For password recovery: token -> {username, email, expires}

// Load data from files if they exist
function loadData() {
    try {
        const usersFile = path.join(dataDir, 'users.json');
        const messagesFile = path.join(dataDir, 'messages.json');
        const chatsFile = path.join(dataDir, 'chats.json');
        const groupsFile = path.join(dataDir, 'groups.json');

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
        if (fs.existsSync(groupsFile)) {
            const groupsData = JSON.parse(fs.readFileSync(groupsFile, 'utf8'));
            groups = new Map(groupsData);
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
            path.join(dataDir, 'groups.json'),
            JSON.stringify([...groups], null, 2)
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

function generateResetToken() {
    // Generate 6-digit verification code
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendPasswordResetEmail(email, username, resetCode) {
    // Create email HTML template
    const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }
            .email-container {
                background-color: #ffffff;
                border-radius: 10px;
                padding: 40px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .header h1 {
                color: #00a884;
                margin: 0;
                font-size: 28px;
            }
            .header .icon {
                font-size: 50px;
                margin-bottom: 10px;
            }
            .content {
                color: #666;
                font-size: 16px;
            }
            .code-container {
                background-color: #f0f0f0;
                border: 2px solid #00a884;
                border-radius: 8px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
            }
            .code {
                font-size: 36px;
                font-weight: bold;
                letter-spacing: 8px;
                color: #00a884;
                font-family: 'Courier New', monospace;
            }
            .code-label {
                color: #666;
                font-size: 14px;
                margin-bottom: 10px;
            }
            .warning {
                background-color: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 15px;
                margin: 20px 0;
                border-radius: 4px;
            }
            .warning p {
                margin: 0;
                color: #856404;
                font-size: 14px;
            }
            .footer {
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                text-align: center;
                color: #999;
                font-size: 12px;
            }
            .button {
                display: inline-block;
                background-color: #00a884;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <div class="icon">🔐</div>
                <h1>Password Reset</h1>
            </div>

            <div class="content">
                <p>Hello <strong>${username}</strong>,</p>

                <p>You recently requested to reset your password for your Secure WhatsApp account. Use the verification code below to complete the password reset:</p>

                <div class="code-container">
                    <div class="code-label">Your Verification Code</div>
                    <div class="code">${resetCode}</div>
                </div>

                <p>This code will <strong>expire in 15 minutes</strong> for security reasons.</p>

                <div class="warning">
                    <p>⚠️ <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.</p>
                </div>

                <p>If you have any questions or need help, please don't hesitate to contact our support team.</p>

                <p>Best regards,<br><strong>Secure WhatsApp Team</strong></p>
            </div>

            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
                <p>&copy; ${new Date().getFullYear()} Secure WhatsApp. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    // Plain text version for email clients that don't support HTML
    const textVersion = `
Password Reset Request

Hello ${username},

You recently requested to reset your password for your Secure WhatsApp account.

Your Verification Code: ${resetCode}

This code will expire in 15 minutes.

If you didn't request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
Secure WhatsApp Team

---
This is an automated message, please do not reply to this email.
© ${new Date().getFullYear()} Secure WhatsApp. All rights reserved.
    `.trim();

    // Try to send email if transporter is configured
    if (emailTransporter) {
        try {
            const info = await emailTransporter.sendMail({
                from: `"Secure WhatsApp" <${emailFrom}>`,
                to: email,
                subject: `Password Reset Code: ${resetCode}`,
                text: textVersion,
                html: htmlTemplate
            });

            console.log(`✅ Password reset email sent to ${email}`);
            console.log(`   Message ID: ${info.messageId}`);
            console.log(`   Reset code: ${resetCode} (expires in 15 minutes)`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to send email to ${email}:`, error.message);
            // Fall through to console logging
        }
    }

    // Fallback: Log to console if email is not configured or failed
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║         PASSWORD RESET EMAIL (Console Mode)               ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log(`║ To: ${email.padEnd(54)}║`);
    console.log(`║ Username: ${username.padEnd(47)}║`);
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║ Hello,                                                     ║');
    console.log('║                                                            ║');
    console.log('║ You requested to reset your password.                     ║');
    console.log('║ Use the verification code below to reset your password:   ║');
    console.log('║                                                            ║');
    console.log(`║              Verification Code: ${resetCode}                    ║`);
    console.log('║                                                            ║');
    console.log('║ This code will expire in 15 minutes.                      ║');
    console.log('║                                                            ║');
    console.log('║ If you did not request this, please ignore this email.    ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    return true;
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

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    if (users.has(username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    // Check if email already exists
    for (const [, user] of users) {
        if (user.email === email) {
            return res.status(400).json({ error: 'Email already registered' });
        }
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
        socketId: null,
        publicKey: null // For E2E encryption
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

// Forgot password endpoint
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    // Find user by email
    let user = null;
    let username = null;
    for (const [uname, userData] of users) {
        if (userData.email === email) {
            user = userData;
            username = uname;
            break;
        }
    }

    // Always return success for security (don't reveal if email exists)
    // But only send email if user exists
    if (user) {
        // Generate reset code (6 digits)
        const resetCode = generateResetToken();
        const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes from now

        // Store reset code
        passwordResetTokens.set(resetCode, {
            username,
            email,
            expiresAt
        });

        // Send email (sends real email if configured, otherwise logs to console)
        await sendPasswordResetEmail(email, username, resetCode);

        console.log(`Password reset requested for ${username} (${email})`);
    }

    // Always return success to prevent email enumeration
    res.json({
        success: true,
        message: 'If your email is registered, you will receive a verification code.'
    });
});

// Verify reset code endpoint
app.post('/api/verify-reset-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'Verification code is required' });
    }

    // Verify reset code
    const resetData = passwordResetTokens.get(code);
    if (!resetData) {
        return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Check if code is expired
    if (Date.now() > resetData.expiresAt) {
        passwordResetTokens.delete(code);
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    res.json({
        success: true,
        message: 'Code verified successfully'
    });
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    const { code, newPassword } = req.body;

    if (!code || !newPassword) {
        return res.status(400).json({ error: 'Verification code and new password are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify reset code
    const resetData = passwordResetTokens.get(code);
    if (!resetData) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Check if code is expired
    if (Date.now() > resetData.expiresAt) {
        passwordResetTokens.delete(code);
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
    }

    // Get user
    const user = users.get(resetData.username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    users.set(resetData.username, user);

    // Delete used code
    passwordResetTokens.delete(code);

    // Save data
    saveData();

    console.log(`Password reset successful for ${resetData.username}`);

    res.json({
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
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

                // Collect public keys from contacts for E2E encryption
                const contactKeys = user.contacts
                    .map(contactUsername => {
                        const contact = users.get(contactUsername);
                        if (contact && contact.publicKey) {
                            return {
                                username: contactUsername,
                                publicKey: contact.publicKey
                            };
                        }
                        return null;
                    })
                    .filter(k => k !== null);

                const chatsList = [];
                for (const [chatId, chat] of chats.entries()) {
                    if (chat.participants.includes(currentUsername)) {
                        const otherParticipant = chat.participants.find(p => p !== currentUsername);
                        if (user.contacts.includes(otherParticipant)) {
                            chatsList.push({
                                id: chatId,
                                name: otherParticipant,
                                online: users.get(otherParticipant)?.online || false,
                                lastMessage: chat.lastMessage || null,
                                isGroup: false
                            });
                        }
                    }
                }

                // Get user's groups
                const groupsList = [];
                for (const [groupId, group] of groups.entries()) {
                    if (group.members.includes(currentUsername)) {
                        groupsList.push({
                            id: groupId,
                            name: group.name,
                            members: group.members,
                            admin: group.admin,
                            lastMessage: group.lastMessage || null,
                            isGroup: true
                        });
                    }
                }

                socket.emit('authenticated', {
                    username: currentUsername,
                    contacts: contactsList,
                    chats: chatsList,
                    groups: groupsList,
                    contactKeys: contactKeys
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
        const { chatId, text, file, encrypted, ciphertext, encryptedKey, iv } = data;

        if (!currentUsername || !chatId) return;
        if (!text && !file && !ciphertext) return;

        // Check if it's a group or regular chat
        const group = groups.get(chatId);
        const chat = chats.get(chatId);

        let recipients = [];

        if (group) {
            // Group message
            if (!group.members.includes(currentUsername)) {
                socket.emit('message-error', { error: 'Not a member of this group' });
                return;
            }
            recipients = group.members;
        } else if (chat) {
            // Regular 1-on-1 chat
            if (!chat.participants.includes(currentUsername)) return;

            const currentUser = users.get(currentUsername);
            const otherParticipant = chat.participants.find(p => p !== currentUsername);

            if (!currentUser.contacts.includes(otherParticipant)) {
                socket.emit('message-error', { error: 'Cannot send message to non-contact' });
                return;
            }
            recipients = chat.participants;
        } else {
            return; // Invalid chatId
        }

        const message = {
            id: generateId(),
            chatId,
            senderUsername: currentUsername,
            text: text || '',
            file: file || null,
            encrypted: encrypted || false,
            ciphertext: ciphertext || null,
            encryptedKey: encryptedKey || null,
            iv: iv || null,
            timestamp: Date.now(),
            read: false
        };

        const chatMessages = messages.get(chatId) || [];
        chatMessages.push(message);
        messages.set(chatId, chatMessages);
        
        // Update last message
        const lastMessageData = {
            text: text || (file ? '📎 File' : ''),
            time: Date.now()
        };

        if (group) {
            group.lastMessage = lastMessageData;
        } else if (chat) {
            chat.lastMessage = lastMessageData;
        }

        saveData();

        // Broadcast to all recipients
        recipients.forEach(recipientUsername => {
            const recipient = users.get(recipientUsername);
            if (recipient && recipient.online && recipient.socketId) {
                io.to(recipient.socketId).emit('new-message', {
                    chatId,
                    message: {
                        id: message.id,
                        text: message.text,
                        file: message.file,
                        encrypted: message.encrypted,
                        ciphertext: message.ciphertext,
                        encryptedKey: message.encryptedKey,
                        iv: message.iv,
                        senderUsername: message.senderUsername,
                        timestamp: message.timestamp,
                        read: message.read || false,
                        sent: recipientUsername === currentUsername
                    }
                });
            }
        });

        const chatType = group ? 'group' : 'chat';
        console.log(`Message sent in ${chatType} ${chatId} by ${currentUsername}`);
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

    socket.on('send-voice-message', async (data) => {
        const { chatId, audioData, duration } = data;

        if (!currentUsername || !chatId || !audioData) return;

        try {
            // Save audio file
            const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-voice.webm';
            const filePath = path.join(uploadsDir, uniqueFilename);

            const base64Data = audioData.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            fs.writeFileSync(filePath, buffer);

            const voiceInfo = {
                filename: uniqueFilename,
                duration: duration || 0,
                size: buffer.length,
                url: `/uploads/${uniqueFilename}`
            };

            // Check if it's a group or regular chat
            const group = groups.get(chatId);
            const chat = chats.get(chatId);

            let recipients = [];

            if (group) {
                if (!group.members.includes(currentUsername)) {
                    socket.emit('message-error', { error: 'Not a member of this group' });
                    return;
                }
                recipients = group.members;
            } else if (chat) {
                if (!chat.participants.includes(currentUsername)) return;

                const currentUser = users.get(currentUsername);
                const otherParticipant = chat.participants.find(p => p !== currentUsername);

                if (!currentUser.contacts.includes(otherParticipant)) {
                    socket.emit('message-error', { error: 'Cannot send message to non-contact' });
                    return;
                }
                recipients = chat.participants;
            } else {
                return;
            }

            // Create voice message
            const message = {
                id: generateId(),
                chatId,
                senderUsername: currentUsername,
                text: '',
                voiceMessage: voiceInfo,
                timestamp: Date.now(),
                read: false
            };

            const chatMessages = messages.get(chatId) || [];
            chatMessages.push(message);
            messages.set(chatId, chatMessages);

            // Update last message
            const lastMessageData = {
                text: '🎤 Voice message',
                time: Date.now()
            };

            if (group) {
                group.lastMessage = lastMessageData;
            } else if (chat) {
                chat.lastMessage = lastMessageData;
            }

            saveData();

            // Broadcast to all recipients
            recipients.forEach(recipientUsername => {
                const recipient = users.get(recipientUsername);
                if (recipient && recipient.online && recipient.socketId) {
                    io.to(recipient.socketId).emit('new-message', {
                        chatId,
                        message: {
                            id: message.id,
                            text: message.text,
                            voiceMessage: message.voiceMessage,
                            senderUsername: message.senderUsername,
                            timestamp: message.timestamp,
                            read: message.read || false,
                            sent: recipientUsername === currentUsername
                        }
                    });
                }
            });

            const chatType = group ? 'group' : 'chat';
            console.log(`Voice message sent in ${chatType} ${chatId} by ${currentUsername}`);

        } catch (error) {
            console.error('Voice message error:', error);
            socket.emit('voice-message-error', { error: 'Failed to send voice message' });
        }
    });

    socket.on('edit-message', (data) => {
        const { chatId, messageId, text, encrypted, ciphertext, encryptedKey, iv } = data;

        if (!currentUsername || !chatId || !messageId) return;

        const group = groups.get(chatId);
        const chat = chats.get(chatId);

        let recipients = [];

        if (group) {
            if (!group.members.includes(currentUsername)) {
                socket.emit('message-error', { error: 'Not a member of this group' });
                return;
            }
            recipients = group.members;
        } else if (chat) {
            if (!chat.participants.includes(currentUsername)) return;
            recipients = chat.participants;
        } else {
            return;
        }

        // Find and update the message
        const chatMessages = messages.get(chatId) || [];
        const messageIndex = chatMessages.findIndex(m => m.id === messageId);

        if (messageIndex === -1) {
            socket.emit('message-error', { error: 'Message not found' });
            return;
        }

        const message = chatMessages[messageIndex];

        // Verify user owns the message
        if (message.senderUsername !== currentUsername) {
            socket.emit('message-error', { error: 'Cannot edit message sent by another user' });
            return;
        }

        // Update message
        message.text = text || '';
        message.encrypted = encrypted || false;
        message.ciphertext = ciphertext || null;
        message.encryptedKey = encryptedKey || null;
        message.iv = iv || null;
        message.edited = true;
        message.editedAt = Date.now();

        messages.set(chatId, chatMessages);

        // Update last message if this is the last message
        if (messageIndex === chatMessages.length - 1) {
            const lastMessageData = {
                text: text || '',
                time: Date.now()
            };

            if (group) {
                group.lastMessage = lastMessageData;
            } else if (chat) {
                chat.lastMessage = lastMessageData;
            }
        }

        saveData();

        // Broadcast to all recipients
        recipients.forEach(recipientUsername => {
            const recipient = users.get(recipientUsername);
            if (recipient && recipient.online && recipient.socketId) {
                io.to(recipient.socketId).emit('message-edited', {
                    chatId,
                    messageId,
                    text: message.text,
                    encrypted: message.encrypted,
                    ciphertext: message.ciphertext,
                    encryptedKey: message.encryptedKey,
                    iv: message.iv
                });
            }
        });

        const chatType = group ? 'group' : 'chat';
        console.log(`Message edited in ${chatType} ${chatId} by ${currentUsername}`);
    });

    socket.on('delete-message', (data) => {
        const { chatId, messageId } = data;

        if (!currentUsername || !chatId || !messageId) return;

        const group = groups.get(chatId);
        const chat = chats.get(chatId);

        let recipients = [];

        if (group) {
            if (!group.members.includes(currentUsername)) {
                socket.emit('message-error', { error: 'Not a member of this group' });
                return;
            }
            recipients = group.members;
        } else if (chat) {
            if (!chat.participants.includes(currentUsername)) return;
            recipients = chat.participants;
        } else {
            return;
        }

        // Find and delete the message
        const chatMessages = messages.get(chatId) || [];
        const messageIndex = chatMessages.findIndex(m => m.id === messageId);

        if (messageIndex === -1) {
            socket.emit('message-error', { error: 'Message not found' });
            return;
        }

        const message = chatMessages[messageIndex];

        // Verify user owns the message
        if (message.senderUsername !== currentUsername) {
            socket.emit('message-error', { error: 'Cannot delete message sent by another user' });
            return;
        }

        // Mark message as deleted (keep metadata for history)
        message.deleted = true;
        message.text = '';
        message.file = null;
        message.voiceMessage = null;
        message.encrypted = false;
        message.ciphertext = null;
        message.encryptedKey = null;
        message.iv = null;
        message.deletedAt = Date.now();

        messages.set(chatId, chatMessages);

        // Update last message if this is the last message
        if (messageIndex === chatMessages.length - 1) {
            const lastMessageData = {
                text: '🚫 This message was deleted',
                time: Date.now()
            };

            if (group) {
                group.lastMessage = lastMessageData;
            } else if (chat) {
                chat.lastMessage = lastMessageData;
            }
        }

        saveData();

        // Broadcast to all recipients
        recipients.forEach(recipientUsername => {
            const recipient = users.get(recipientUsername);
            if (recipient && recipient.online && recipient.socketId) {
                io.to(recipient.socketId).emit('message-deleted', {
                    chatId,
                    messageId
                });
            }
        });

        const chatType = group ? 'group' : 'chat';
        console.log(`Message deleted in ${chatType} ${chatId} by ${currentUsername}`);
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

    // ========== GROUP CHAT HANDLERS ==========

    socket.on('create-group', (data) => {
        const { groupName, memberUsernames } = data;

        if (!currentUsername || !groupName || !memberUsernames || memberUsernames.length === 0) {
            socket.emit('group-error', { error: 'Invalid group data' });
            return;
        }

        // Verify all members are contacts
        const currentUser = users.get(currentUsername);
        if (!currentUser) return;

        const validMembers = memberUsernames.filter(username =>
            currentUser.contacts.includes(username) && users.has(username)
        );

        if (validMembers.length === 0) {
            socket.emit('group-error', { error: 'No valid contacts selected' });
            return;
        }

        // Create group
        const groupId = generateId();
        const allMembers = [currentUsername, ...validMembers];

        groups.set(groupId, {
            id: groupId,
            name: groupName,
            members: allMembers,
            admin: currentUsername,
            createdAt: Date.now(),
            lastMessage: null
        });

        messages.set(groupId, []);
        saveData();

        // Notify all members
        allMembers.forEach(memberUsername => {
            const member = users.get(memberUsername);
            if (member && member.online && member.socketId) {
                io.to(member.socketId).emit('group-created', {
                    id: groupId,
                    name: groupName,
                    members: allMembers,
                    admin: currentUsername,
                    isGroup: true
                });
            }
        });

        console.log(`Group "${groupName}" created by ${currentUsername} with ${validMembers.length} members`);
    });

    socket.on('add-group-member', (data) => {
        const { groupId, username } = data;

        if (!currentUsername || !groupId || !username) return;

        const group = groups.get(groupId);
        if (!group) {
            socket.emit('group-error', { error: 'Group not found' });
            return;
        }

        // Check if current user is admin
        if (group.admin !== currentUsername) {
            socket.emit('group-error', { error: 'Only admin can add members' });
            return;
        }

        // Check if user is already a member
        if (group.members.includes(username)) {
            socket.emit('group-error', { error: 'User already in group' });
            return;
        }

        // Check if user exists
        if (!users.has(username)) {
            socket.emit('group-error', { error: 'User not found' });
            return;
        }

        // Add member
        group.members.push(username);
        saveData();

        // Notify all members
        group.members.forEach(memberUsername => {
            const member = users.get(memberUsername);
            if (member && member.online && member.socketId) {
                io.to(member.socketId).emit('group-member-added', {
                    groupId,
                    username,
                    members: group.members
                });
            }
        });

        console.log(`${username} added to group ${groupId} by ${currentUsername}`);
    });

    socket.on('remove-group-member', (data) => {
        const { groupId, username } = data;

        if (!currentUsername || !groupId || !username) return;

        const group = groups.get(groupId);
        if (!group) {
            socket.emit('group-error', { error: 'Group not found' });
            return;
        }

        // Check if current user is admin
        if (group.admin !== currentUsername) {
            socket.emit('group-error', { error: 'Only admin can remove members' });
            return;
        }

        // Cannot remove admin
        if (username === group.admin) {
            socket.emit('group-error', { error: 'Cannot remove admin' });
            return;
        }

        // Remove member
        group.members = group.members.filter(m => m !== username);
        saveData();

        // Notify all members
        group.members.forEach(memberUsername => {
            const member = users.get(memberUsername);
            if (member && member.online && member.socketId) {
                io.to(member.socketId).emit('group-member-removed', {
                    groupId,
                    username,
                    members: group.members
                });
            }
        });

        // Notify removed member
        const removedUser = users.get(username);
        if (removedUser && removedUser.online && removedUser.socketId) {
            io.to(removedUser.socketId).emit('removed-from-group', { groupId });
        }

        console.log(`${username} removed from group ${groupId} by ${currentUsername}`);
    });

    socket.on('leave-group', (data) => {
        const { groupId } = data;

        if (!currentUsername || !groupId) return;

        const group = groups.get(groupId);
        if (!group) return;

        // If admin leaves, assign new admin or delete group
        if (group.admin === currentUsername) {
            if (group.members.length > 1) {
                // Assign new admin (first non-admin member)
                const newAdmin = group.members.find(m => m !== currentUsername);
                group.admin = newAdmin;
            } else {
                // Delete group if admin was the last member
                groups.delete(groupId);
                messages.delete(groupId);
                saveData();
                return;
            }
        }

        // Remove member
        group.members = group.members.filter(m => m !== currentUsername);
        saveData();

        // Notify remaining members
        group.members.forEach(memberUsername => {
            const member = users.get(memberUsername);
            if (member && member.online && member.socketId) {
                io.to(member.socketId).emit('group-member-left', {
                    groupId,
                    username: currentUsername,
                    members: group.members,
                    newAdmin: group.admin
                });
            }
        });

        socket.emit('left-group', { groupId });
        console.log(`${currentUsername} left group ${groupId}`);
    });

    socket.on('get-group-messages', (data) => {
        const { groupId } = data;

        if (!currentUsername || !groupId) return;

        const group = groups.get(groupId);
        if (!group || !group.members.includes(currentUsername)) {
            socket.emit('messages-error', { error: 'Access denied' });
            return;
        }

        const groupMessages = messages.get(groupId) || [];

        socket.emit('messages-loaded', {
            chatId: groupId,
            messages: groupMessages.map(msg => ({
                ...msg,
                sent: msg.senderUsername === currentUsername
            }))
        });
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
                voiceMessage: msg.voiceMessage,
                encrypted: msg.encrypted,
                ciphertext: msg.ciphertext,
                encryptedKey: msg.encryptedKey,
                iv: msg.iv,
                edited: msg.edited || false,
                deleted: msg.deleted || false,
                read: msg.read || false,
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

    // Handle public key exchange for E2E encryption
    socket.on('public-key', (data) => {
        const { publicKey } = data;

        if (!currentUsername) return;

        const user = users.get(currentUsername);
        if (user) {
            user.publicKey = publicKey;
            saveData();

            // Send public key to all contacts
            user.contacts.forEach(contactUsername => {
                const contact = users.get(contactUsername);
                if (contact && contact.online && contact.socketId) {
                    io.to(contact.socketId).emit('public-key-received', {
                        username: currentUsername,
                        publicKey: publicKey
                    });
                }
            });

            console.log(`🔐 Public key stored for ${currentUsername}`);
        }
    });

    // Whiteboard handlers
    socket.on('whiteboard-draw', (data) => {
        if (!currentUsername) return;

        const { imageData } = data;

        // Broadcast whiteboard update to all connected users
        socket.broadcast.emit('whiteboard-update', { imageData });

        console.log(`Whiteboard updated by ${currentUsername}`);
    });

    socket.on('join-whiteboard', () => {
        if (!currentUsername) return;

        // Count users in whiteboard (simplified - broadcasts to everyone)
        const connectedUsers = Array.from(users.values()).filter(u => u.online).length;

        io.emit('whiteboard-users-count', { count: connectedUsers });

        console.log(`${currentUsername} joined whiteboard`);
    });

    // Read receipts handler
    socket.on('mark-messages-read', (data) => {
        const { chatId, messageIds } = data;

        if (!currentUsername || !chatId || !messageIds || messageIds.length === 0) return;

        const group = groups.get(chatId);
        const chat = chats.get(chatId);

        if (!group && !chat) return;

        // Get the chat messages
        const chatMessages = messages.get(chatId) || [];

        // Mark messages as read
        let updated = false;
        chatMessages.forEach(msg => {
            if (messageIds.includes(msg.id) && !msg.read) {
                msg.read = true;
                updated = true;
            }
        });

        if (updated) {
            messages.set(chatId, chatMessages);
            saveData();

            // Notify the sender that their messages were read
            // Find who sent these messages
            const senderUsernames = new Set();
            chatMessages.forEach(msg => {
                if (messageIds.includes(msg.id) && msg.senderUsername !== currentUsername) {
                    senderUsernames.add(msg.senderUsername);
                }
            });

            senderUsernames.forEach(senderUsername => {
                const sender = users.get(senderUsername);
                if (sender && sender.online && sender.socketId) {
                    io.to(sender.socketId).emit('messages-read', {
                        chatId,
                        messageIds
                    });
                }
            });

            console.log(`Messages marked as read in chat ${chatId} by ${currentUsername}`);
        }
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
    console.log(`🔒 End-to-End Encryption enabled (RSA-2048 + AES-256-GCM)`);
    console.log(`👥 Contact list feature enabled`);
    console.log(`📎 File upload feature enabled`);
    console.log(`📞 Voice & Video calling enabled (WebRTC)`);
    console.log(`💾 Data persistence enabled`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`📂 Uploads directory: ${uploadsDir}`);
});
