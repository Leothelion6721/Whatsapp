const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
let groups = new Map();
let sessions = new Map();

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

// REST API Endpoints

// Register endpoint
app.post('/api/register', async (req, res) => {
    const { username, password, securityQuestions, faceDescriptor, email } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ error: 'Username must be 3-20 characters' });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
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
        contacts: [],
        createdAt: Date.now(),
        online: false,
        socketId: null,
        securityQuestions: securityQuestions || null,
        faceDescriptor: faceDescriptor || null,
        email: email || null
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

// Get user auth methods for password reset
app.post('/api/get-user-auth-methods', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const methods = {
        securityQuestions: user.securityQuestions ? true : false,
        faceRecognition: user.faceDescriptor ? true : false,
        email: user.email ? true : false
    };

    res.json({
        success: true,
        methods,
        securityQuestions: user.securityQuestions || null
    });
});

// Verify security answers
app.post('/api/verify-security-answers', async (req, res) => {
    const { username, answers } = req.body;

    if (!username || !answers) {
        return res.status(400).json({ error: 'Username and answers are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (!user.securityQuestions) {
        return res.status(400).json({ error: 'Security questions not set for this user' });
    }

    // Check if all answers match (case-insensitive)
    let allCorrect = true;
    for (let i = 0; i < user.securityQuestions.length; i++) {
        if (user.securityQuestions[i].answer.toLowerCase() !== answers[i].toLowerCase()) {
            allCorrect = false;
            break;
        }
    }

    if (!allCorrect) {
        return res.status(401).json({ error: 'Incorrect security answers' });
    }

    res.json({ success: true, verified: true });
});

// Verify face for password reset
app.post('/api/verify-face-reset', async (req, res) => {
    const { username, faceDescriptor } = req.body;

    if (!username || !faceDescriptor) {
        return res.status(400).json({ error: 'Username and face descriptor are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (!user.faceDescriptor) {
        return res.status(400).json({ error: 'Face recognition not set for this user' });
    }

    // Calculate euclidean distance between face descriptors
    const storedDescriptor = user.faceDescriptor;
    if (!Array.isArray(storedDescriptor) || !Array.isArray(faceDescriptor)) {
        return res.status(400).json({ error: 'Invalid face descriptor format' });
    }

    let sum = 0;
    for (let i = 0; i < storedDescriptor.length; i++) {
        const diff = storedDescriptor[i] - faceDescriptor[i];
        sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    // Threshold for face matching (typically 0.6)
    const threshold = 0.6;

    if (distance > threshold) {
        return res.status(401).json({ error: 'Face verification failed' });
    }

    res.json({ success: true, verified: true, distance });
});

// Send reset code to email
app.post('/api/send-reset-code', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (!user.email) {
        return res.status(400).json({ error: 'Email not set for this user' });
    }

    // Generate a 6-digit code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Store the reset code temporarily (in production, use Redis or similar)
    user.resetCode = resetCode;
    user.resetCodeExpiry = Date.now() + 600000; // 10 minutes
    saveData();

    // In production, send email here
    console.log(`Reset code for ${username}: ${resetCode}`);

    res.json({
        success: true,
        message: 'Reset code sent to email',
        // For demo purposes only - remove in production
        code: resetCode
    });
});

// Verify reset code
app.post('/api/verify-reset-code', async (req, res) => {
    const { username, code } = req.body;

    if (!username || !code) {
        return res.status(400).json({ error: 'Username and code are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (!user.resetCode) {
        return res.status(400).json({ error: 'No reset code requested' });
    }

    if (Date.now() > user.resetCodeExpiry) {
        return res.status(400).json({ error: 'Reset code expired' });
    }

    if (user.resetCode !== code) {
        return res.status(401).json({ error: 'Invalid reset code' });
    }

    res.json({ success: true, verified: true });
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
    const { username, newPassword, verified } = req.body;

    if (!username || !newPassword) {
        return res.status(400).json({ error: 'Username and new password are required' });
    }

    if (!verified) {
        return res.status(400).json({ error: 'User must be verified before resetting password' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Clear reset code
    delete user.resetCode;
    delete user.resetCodeExpiry;

    saveData();

    res.json({
        success: true,
        message: 'Password reset successfully'
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
                                type: 'individual',
                                online: users.get(otherParticipant)?.online || false,
                                lastMessage: chat.lastMessage || null
                            });
                        }
                    }
                }

                const groupsList = [];
                for (const [groupId, group] of groups.entries()) {
                    if (group.members.includes(currentUsername)) {
                        groupsList.push({
                            id: groupId,
                            name: group.name,
                            type: 'group',
                            admin: group.admin,
                            members: group.members,
                            memberCount: group.members.length,
                            lastMessage: group.lastMessage || null
                        });
                    }
                }

                socket.emit('authenticated', {
                    username: currentUsername,
                    contacts: contactsList,
                    chats: chatsList,
                    groups: groupsList
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

        // Check if it's a group chat
        const isGroupChat = chatId.startsWith('group-');

        if (isGroupChat) {
            const group = groups.get(chatId);
            if (!group || !group.members.includes(currentUsername)) {
                socket.emit('message-error', { error: 'You are not a member of this group' });
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

            group.lastMessage = {
                text: text || (file ? '📎 File' : ''),
                time: Date.now()
            };

            saveData();

            // Send to all group members
            group.members.forEach(memberUsername => {
                const member = users.get(memberUsername);
                if (member && member.online && member.socketId) {
                    io.to(member.socketId).emit('new-message', {
                        chatId,
                        message: {
                            id: message.id,
                            text: message.text,
                            file: message.file,
                            senderUsername: message.senderUsername,
                            timestamp: message.timestamp,
                            sent: memberUsername === currentUsername
                        }
                    });
                }
            });

            console.log(`Message sent in group ${chatId} by ${currentUsername}`);
        } else {
            // Individual chat logic
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
        }
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

    socket.on('upload-voice', async (data) => {
        const { chatId, audioData } = data;

        if (!currentUsername || !chatId || !audioData) return;

        try {
            const uniqueFilename = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-voice.webm';
            const filePath = path.join(uploadsDir, uniqueFilename);

            const base64Data = audioData.replace(/^data:.*?;base64,/, '');
            const buffer = Buffer.from(base64Data, 'base64');

            fs.writeFileSync(filePath, buffer);

            const voiceInfo = {
                filename: uniqueFilename,
                originalName: 'voice-message.webm',
                mimetype: 'audio/webm',
                size: buffer.length,
                url: `/uploads/${uniqueFilename}`,
                isVoice: true
            };

            socket.emit('voice-uploaded', {
                chatId,
                file: voiceInfo
            });

            console.log(`Voice message uploaded by ${currentUsername} in chat ${chatId}`);

        } catch (error) {
            console.error('Voice upload error:', error);
            socket.emit('upload-error', { error: 'Failed to upload voice message' });
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

        // Check if it's a group chat
        const isGroupChat = chatId.startsWith('group-');

        if (isGroupChat) {
            const group = groups.get(chatId);
            if (!group || !group.members.includes(currentUsername)) {
                socket.emit('messages-error', { error: 'You are not a member of this group' });
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
        } else {
            // Individual chat logic
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
        }
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

    // Group Management Handlers
    socket.on('create-group', (data) => {
        const { groupName, members } = data;

        if (!currentUsername || !groupName || !members || !Array.isArray(members)) {
            socket.emit('group-error', { error: 'Invalid group data' });
            return;
        }

        if (groupName.trim().length < 3) {
            socket.emit('group-error', { error: 'Group name must be at least 3 characters' });
            return;
        }

        const currentUser = users.get(currentUsername);
        if (!currentUser) return;

        // Validate that all members are in current user's contacts
        const validMembers = members.filter(member =>
            currentUser.contacts.includes(member) && users.has(member)
        );

        if (validMembers.length === 0) {
            socket.emit('group-error', { error: 'No valid members selected' });
            return;
        }

        // Create the group
        const groupId = 'group-' + generateId();
        const groupMembers = [currentUsername, ...validMembers];

        groups.set(groupId, {
            id: groupId,
            name: groupName.trim(),
            admin: currentUsername,
            members: groupMembers,
            createdAt: Date.now(),
            lastMessage: null
        });

        messages.set(groupId, []);
        saveData();

        // Notify all group members
        groupMembers.forEach(memberUsername => {
            const member = users.get(memberUsername);
            if (member && member.online && member.socketId) {
                io.to(member.socketId).emit('group-created', {
                    id: groupId,
                    name: groupName.trim(),
                    type: 'group',
                    admin: currentUsername,
                    members: groupMembers,
                    memberCount: groupMembers.length,
                    lastMessage: null
                });
            }
        });

        console.log(`Group created: ${groupName} by ${currentUsername}`);
    });

    socket.on('add-group-member', (data) => {
        const { groupId, memberUsername } = data;

        if (!currentUsername || !groupId || !memberUsername) return;

        const group = groups.get(groupId);
        if (!group) {
            socket.emit('group-error', { error: 'Group not found' });
            return;
        }

        // Only admin can add members
        if (group.admin !== currentUsername) {
            socket.emit('group-error', { error: 'Only admin can add members' });
            return;
        }

        if (group.members.includes(memberUsername)) {
            socket.emit('group-error', { error: 'User is already a member' });
            return;
        }

        if (!users.has(memberUsername)) {
            socket.emit('group-error', { error: 'User does not exist' });
            return;
        }

        // Add the member
        group.members.push(memberUsername);
        saveData();

        // Notify all group members including the new one
        group.members.forEach(member => {
            const user = users.get(member);
            if (user && user.online && user.socketId) {
                io.to(user.socketId).emit('group-member-added', {
                    groupId: groupId,
                    memberUsername: memberUsername,
                    members: group.members,
                    memberCount: group.members.length
                });
            }
        });

        console.log(`${memberUsername} added to group ${groupId} by ${currentUsername}`);
    });

    socket.on('remove-group-member', (data) => {
        const { groupId, memberUsername } = data;

        if (!currentUsername || !groupId || !memberUsername) return;

        const group = groups.get(groupId);
        if (!group) {
            socket.emit('group-error', { error: 'Group not found' });
            return;
        }

        // Only admin can remove members
        if (group.admin !== currentUsername) {
            socket.emit('group-error', { error: 'Only admin can remove members' });
            return;
        }

        if (memberUsername === currentUsername) {
            socket.emit('group-error', { error: 'Admin cannot remove themselves. Transfer admin or leave group.' });
            return;
        }

        if (!group.members.includes(memberUsername)) {
            socket.emit('group-error', { error: 'User is not a member' });
            return;
        }

        // Remove the member
        group.members = group.members.filter(m => m !== memberUsername);
        saveData();

        // Notify the removed member
        const removedUser = users.get(memberUsername);
        if (removedUser && removedUser.online && removedUser.socketId) {
            io.to(removedUser.socketId).emit('group-removed', { groupId });
        }

        // Notify remaining members
        group.members.forEach(member => {
            const user = users.get(member);
            if (user && user.online && user.socketId) {
                io.to(user.socketId).emit('group-member-removed', {
                    groupId: groupId,
                    memberUsername: memberUsername,
                    members: group.members,
                    memberCount: group.members.length
                });
            }
        });

        console.log(`${memberUsername} removed from group ${groupId} by ${currentUsername}`);
    });

    socket.on('leave-group', (data) => {
        const { groupId } = data;

        if (!currentUsername || !groupId) return;

        const group = groups.get(groupId);
        if (!group) {
            socket.emit('group-error', { error: 'Group not found' });
            return;
        }

        if (!group.members.includes(currentUsername)) {
            socket.emit('group-error', { error: 'You are not a member of this group' });
            return;
        }

        // If admin is leaving, transfer admin to another member or delete group
        if (group.admin === currentUsername) {
            group.members = group.members.filter(m => m !== currentUsername);

            if (group.members.length > 0) {
                // Transfer admin to first remaining member
                group.admin = group.members[0];
            } else {
                // Delete the group if no members left
                groups.delete(groupId);
                messages.delete(groupId);
                saveData();
                socket.emit('group-deleted', { groupId });
                console.log(`Group ${groupId} deleted (no members left)`);
                return;
            }
        } else {
            // Regular member leaving
            group.members = group.members.filter(m => m !== currentUsername);
        }

        saveData();

        // Notify the user who left
        socket.emit('group-left', { groupId });

        // Notify remaining members
        group.members.forEach(member => {
            const user = users.get(member);
            if (user && user.online && user.socketId) {
                io.to(user.socketId).emit('group-member-left', {
                    groupId: groupId,
                    memberUsername: currentUsername,
                    newAdmin: group.admin,
                    members: group.members,
                    memberCount: group.members.length
                });
            }
        });

        console.log(`${currentUsername} left group ${groupId}`);
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
    console.log(`👥 Contact list feature enabled`);
    console.log(`📎 File upload feature enabled`);
    console.log(`📞 Voice & Video calling enabled (WebRTC)`);
    console.log(`💾 Data persistence enabled`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`📂 Uploads directory: ${uploadsDir}`);
});
