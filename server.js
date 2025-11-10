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
let sessions = new Map();

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
    const { username, password } = req.body;
    
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

    // Mark messages as read
    socket.on('mark-messages-read', (data) => {
        const { chatId, messageIds } = data;

        if (!currentUsername || !chatId || !messageIds || messageIds.length === 0) return;

        const chat = chats.get(chatId);
        if (!chat || !chat.participants.includes(currentUsername)) return;

        const chatMessages = messages.get(chatId) || [];

        // Mark messages as read
        chatMessages.forEach(msg => {
            if (messageIds.includes(msg.id) && msg.senderUsername !== currentUsername) {
                msg.read = true;
            }
        });

        saveData();

        // Notify the sender that their messages were read
        const otherParticipant = chat.participants.find(p => p !== currentUsername);
        const otherUser = users.get(otherParticipant);

        if (otherUser && otherUser.online && otherUser.socketId) {
            io.to(otherUser.socketId).emit('messages-marked-read', {
                chatId,
                messageIds
            });
        }

        console.log(`Messages marked as read in chat ${chatId} by ${currentUsername}`);
    });

    // Edit message
    socket.on('edit-message', (data) => {
        const { chatId, messageId, text, encrypted, ciphertext, encryptedKey, iv } = data;

        if (!currentUsername || !chatId || !messageId) return;

        const chat = chats.get(chatId);
        if (!chat || !chat.participants.includes(currentUsername)) return;

        const chatMessages = messages.get(chatId) || [];
        const message = chatMessages.find(m => m.id === messageId);

        if (!message || message.senderUsername !== currentUsername) {
            socket.emit('message-error', { error: 'Cannot edit this message' });
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

        // Update last message if this was the last one
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg && lastMsg.id === messageId) {
            chat.lastMessage = {
                text: text || '',
                time: message.timestamp
            };
        }

        saveData();

        // Broadcast to all participants
        chat.participants.forEach(participantUsername => {
            const participant = users.get(participantUsername);
            if (participant && participant.online && participant.socketId) {
                io.to(participant.socketId).emit('message-edited', {
                    chatId,
                    messageId,
                    text,
                    encrypted,
                    ciphertext,
                    encryptedKey,
                    iv
                });
            }
        });

        console.log(`Message ${messageId} edited in chat ${chatId} by ${currentUsername}`);
    });

    // Delete message
    socket.on('delete-message', (data) => {
        const { chatId, messageId } = data;

        if (!currentUsername || !chatId || !messageId) return;

        const chat = chats.get(chatId);
        if (!chat || !chat.participants.includes(currentUsername)) return;

        const chatMessages = messages.get(chatId) || [];
        const message = chatMessages.find(m => m.id === messageId);

        if (!message || message.senderUsername !== currentUsername) {
            socket.emit('message-error', { error: 'Cannot delete this message' });
            return;
        }

        // Mark message as deleted
        message.deleted = true;
        message.text = '';
        message.file = null;
        message.voiceMessage = null;

        // Update last message if this was the last one
        const lastMsg = chatMessages[chatMessages.length - 1];
        if (lastMsg && lastMsg.id === messageId) {
            chat.lastMessage = {
                text: '🚫 This message was deleted',
                time: message.timestamp
            };
        }

        saveData();

        // Broadcast to all participants
        chat.participants.forEach(participantUsername => {
            const participant = users.get(participantUsername);
            if (participant && participant.online && participant.socketId) {
                io.to(participant.socketId).emit('message-deleted', {
                    chatId,
                    messageId
                });
            }
        });

        console.log(`Message ${messageId} deleted in chat ${chatId} by ${currentUsername}`);
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
