const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

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
let sessions = new Map();
let resetCodes = new Map(); // For password reset codes

// Load data from files if they exist
function loadData() {
    try {
        const usersFile = path.join(dataDir, 'users.json');
        const messagesFile = path.join(dataDir, 'messages.json');
        const chatsFile = path.join(dataDir, 'chats.json');

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
    const { username, password, authMethod, securityQuestion, securityAnswer, faceData } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    if (!authMethod) {
        return res.status(400).json({ error: 'Please select a verification method' });
    }

    if (authMethod === 'security' && (!securityQuestion || !securityAnswer)) {
        return res.status(400).json({ error: 'Security question and answer are required' });
    }

    if (authMethod === 'face' && !faceData) {
        return res.status(400).json({ error: 'Face data is required' });
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

    const userData = {
        userId,
        password: hashedPassword,
        username,
        authMethod,
        contacts: [],
        createdAt: Date.now(),
        online: false,
        socketId: null
    };

    if (authMethod === 'security') {
        userData.securityQuestion = securityQuestion;
        userData.securityAnswer = await bcrypt.hash(securityAnswer.toLowerCase().trim(), 10);
    } else if (authMethod === 'face') {
        userData.faceData = faceData;
    }

    users.set(username, userData);
    saveData();

    const token = generateToken(userId);
    sessions.set(token, userId);

    console.log(`✅ User registered: ${username} (${authMethod})`);

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

// Get auth methods endpoint
app.post('/api/get-auth-methods', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const response = {
        success: true,
        authMethod: user.authMethod || 'security'
    };

    if (user.authMethod === 'security' && user.securityQuestion) {
        response.question = user.securityQuestion;
    }

    res.json(response);
});

// Verify face for password reset
app.post('/api/verify-face-reset', async (req, res) => {
    const { username, faceData } = req.body;

    if (!username || !faceData) {
        return res.status(400).json({ error: 'Username and face data are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    if (user.authMethod !== 'face' || !user.faceData) {
        return res.status(400).json({ error: 'User does not have face recognition enabled' });
    }

    // Neural network face comparison using face-api.js descriptors
    const similarity = compareFaceData(user.faceData, faceData);

    // For face-api.js, we use euclidean distance threshold of 0.45
    // This translates to similarity > 0.25 (25%) in our normalized scale
    // Lower threshold = stricter matching (rejects "cut in two" faces)
    if (similarity > 0.25) { // Strict threshold based on 0.45 euclidean distance
        // Generate reset code
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        const expiresAt = Date.now() + (15 * 60 * 1000);

        resetCodes.set(username, { code, expiresAt });

        console.log('');
        console.log('═══════════════════════════════════════════════════════');
        console.log('🔐 PASSWORD RESET REQUEST - FACE VERIFIED');
        console.log('═══════════════════════════════════════════════════════');
        console.log(`Username: ${username}`);
        console.log(`Face Verified: ✅ YES (${Math.round(similarity * 100)}% match)`);
        console.log(`Reset Code: ${code}`);
        console.log(`Generated: ${new Date().toISOString()}`);
        console.log(`Expires: ${new Date(expiresAt).toISOString()}`);
        console.log(`Valid for: 15 minutes`);
        console.log('═══════════════════════════════════════════════════════');
        console.log('');

        res.json({
            success: true,
            message: 'Face verified! Contact admin at leothelion123@outlook.fr'
        });
    } else {
        console.log(`❌ Face verification failed for user: ${username} (${Math.round(similarity * 100)}% match)`);
        res.status(401).json({ error: 'Face does not match' });
    }
});

// Face comparison using Euclidean distance on 128D descriptors
function compareFaceData(stored, provided) {
    try {
        // Parse the JSON face descriptors (128-dimensional arrays)
        const storedDescriptor = JSON.parse(stored);
        const providedDescriptor = JSON.parse(provided);

        // Validate descriptors
        if (!Array.isArray(storedDescriptor) || !Array.isArray(providedDescriptor)) {
            console.error('❌ Invalid face descriptors: not arrays');
            return 0;
        }

        if (storedDescriptor.length !== 128 || providedDescriptor.length !== 128) {
            console.error('❌ Invalid face descriptors: expected 128 dimensions, got', storedDescriptor.length, providedDescriptor.length);
            return 0;
        }

        // Calculate Euclidean distance between the two 128D descriptors
        let sumSquaredDiff = 0;
        for (let i = 0; i < 128; i++) {
            const diff = storedDescriptor[i] - providedDescriptor[i];
            sumSquaredDiff += diff * diff;
        }
        const euclideanDistance = Math.sqrt(sumSquaredDiff);

        // Convert distance to similarity percentage
        // Face-api.js typical threshold: 0.6 (below = same person, above = different person)
        // We'll use a more strict threshold of 0.45 for higher security
        // Similarity = 1 - (distance / max_acceptable_distance)
        const maxDistance = 0.6; // Typical face-api.js threshold
        const similarity = Math.max(0, 1 - (euclideanDistance / maxDistance));

        console.log('');
        console.log('🤖 FACE-API.JS NEURAL NETWORK COMPARISON');
        console.log('═══════════════════════════════════════');
        console.log(`📊 Euclidean Distance: ${euclideanDistance.toFixed(4)}`);
        console.log(`📈 Similarity Score: ${(similarity * 100).toFixed(2)}%`);
        console.log(`🎯 Distance Threshold: 0.45 (strict)`);
        console.log(`✅ Match Status: ${euclideanDistance < 0.45 ? 'ACCEPTED ✓' : 'REJECTED ✗'}`);
        console.log('═══════════════════════════════════════');
        console.log('');

        return similarity;

    } catch (error) {
        console.error('❌ Face comparison error:', error);
        return 0;
    }
}

// Request reset code endpoint
app.post('/api/request-reset', async (req, res) => {
    const { username, securityAnswer } = req.body;

    if (!username || !securityAnswer) {
        return res.status(400).json({ error: 'Username and security answer are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    // Verify security answer (case-insensitive)
    const answerMatch = await bcrypt.compare(securityAnswer.toLowerCase().trim(), user.securityAnswer);
    if (!answerMatch) {
        console.log(`❌ Failed security answer attempt for user: ${username}`);
        return res.status(401).json({ error: 'Incorrect security answer' });
    }

    // Generate secure 8-character code
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = Date.now() + (15 * 60 * 1000); // 15 minutes

    resetCodes.set(username, { code, expiresAt });

    // Print to server console (Render logs)
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('🔐 PASSWORD RESET REQUEST - VERIFIED');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Username: ${username}`);
    console.log(`Security Question: ${user.securityQuestion}`);
    console.log(`Answer Verified: ✅ YES`);
    console.log(`Reset Code: ${code}`);
    console.log(`Generated: ${new Date().toISOString()}`);
    console.log(`Expires: ${new Date(expiresAt).toISOString()}`);
    console.log(`Valid for: 15 minutes`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    res.json({
        success: true,
        message: 'Reset code generated. Contact admin at leothelion123@outlook.fr'
    });
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    const { username, code, newPassword } = req.body;

    if (!username || !code || !newPassword) {
        return res.status(400).json({ error: 'Username, code, and new password are required' });
    }

    const user = users.get(username);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    const resetData = resetCodes.get(username);
    if (!resetData) {
        return res.status(400).json({ error: 'No reset code found. Please request a new one.' });
    }

    // Check expiration
    if (Date.now() > resetData.expiresAt) {
        resetCodes.delete(username);
        console.log(`❌ Expired reset code attempt for user: ${username}`);
        return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
    }

    // Validate code (constant-time comparison to prevent timing attacks)
    const codeBuffer1 = Buffer.from(code.toUpperCase());
    const codeBuffer2 = Buffer.from(resetData.code);

    if (codeBuffer1.length !== codeBuffer2.length || !crypto.timingSafeEqual(codeBuffer1, codeBuffer2)) {
        console.log(`❌ Invalid reset code attempt for user: ${username}`);
        return res.status(400).json({ error: 'Invalid reset code' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Remove used reset code
    resetCodes.delete(username);
    saveData();

    console.log(`✅ Password successfully reset for user: ${username}`);

    res.json({ success: true, message: 'Password reset successfully' });
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
        const { chatId, text, file, voice } = data;

        if (!currentUsername || !chatId) return;
        if (!text && !file && !voice) return;

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
            voice: voice || null,
            timestamp: Date.now(),
            read: false
        };
        
        const chatMessages = messages.get(chatId) || [];
        chatMessages.push(message);
        messages.set(chatId, chatMessages);
        
        chat.lastMessage = {
            text: text || (file ? '📎 File' : (voice ? '🎤 Voice message' : '')),
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
                            voice: message.voice,
                            senderUsername: message.senderUsername,
                            timestamp: message.timestamp,
                            sent: participantUsername === currentUsername
                        }
                    });
                }
            }
        });

        console.log(`Message sent in chat ${chatId} by ${currentUsername}${voice ? ' (voice message)' : ''}`);
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
        const { chatId, audioData, duration } = data;

        if (!currentUsername || !chatId || !audioData) return;

        const currentUser = users.get(currentUsername);
        if (!currentUser) return;

        try {
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

            console.log(`🎤 Voice message uploaded by ${currentUsername}`);

            // Send voice info back to client (like file-uploaded)
            socket.emit('voice-uploaded', {
                chatId,
                voice: voiceInfo
            });

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
// Cleanup expired reset codes every 5 minutes
setInterval(() => {
    const now = Date.now();
    let expiredCount = 0;

    for (const [username, data] of resetCodes.entries()) {
        if (now > data.expiresAt) {
            resetCodes.delete(username);
            expiredCount++;
        }
    }

    if (expiredCount > 0) {
        console.log(`🧹 Cleaned up ${expiredCount} expired reset code(s)`);
    }
}, 5 * 60 * 1000); // Every 5 minutes

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WhatsApp Clone Server running on port ${PORT}`);
    console.log(`🔐 Authentication enabled with password protection`);
    console.log(`👥 Contact list feature enabled`);
    console.log(`📎 File upload feature enabled`);
    console.log(`📞 Voice & Video calling enabled (WebRTC)`);
    console.log(`💾 Data persistence enabled`);
    console.log(`🔑 Password reset feature enabled`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Data directory: ${dataDir}`);
    console.log(`📂 Uploads directory: ${uploadsDir}`);
});
