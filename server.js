const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());
app.use(express.json());

// Хранилище
const users = new Map();
const messages = [];
const chats = new Map();

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            switch (msg.type) {
                case 'auth':
                    const userId = msg.userId;
                    if (!users.has(userId)) {
                        users.set(userId, {
                            id: userId,
                            login: msg.login,
                            name: msg.name,
                            avatar: msg.avatar,
                            online: true
                        });
                    }
                    const user = users.get(userId);
                    user.online = true;
                    ws.userId = userId;
                    
                    ws.send(JSON.stringify({
                        type: 'auth_success',
                        chats: Array.from(chats.values()),
                        messages: messages
                    }));
                    
                    broadcast({
                        type: 'user_online',
                        userId: userId,
                        login: user.login
                    });
                    break;

                case 'message':
                    const newMsg = {
                        id: generateId(),
                        chatId: msg.chatId,
                        userId: ws.userId,
                        text: msg.text,
                        timestamp: Date.now()
                    };
                    messages.push(newMsg);
                    
                    const chat = chats.get(msg.chatId);
                    if (chat) {
                        chat.participants.forEach(pid => {
                            wss.clients.forEach(client => {
                                if (client.userId === pid && client.readyState === WebSocket.OPEN) {
                                    client.send(JSON.stringify({
                                        type: 'new_message',
                                        message: newMsg
                                    }));
                                }
                            });
                        });
                    }
                    break;

                case 'create_chat':
                    const chatId = generateId();
                    const newChat = {
                        id: chatId,
                        name: msg.name,
                        type: msg.type || 'group',
                        participants: [ws.userId, ...msg.participants],
                        createdAt: Date.now()
                    };
                    chats.set(chatId, newChat);
                    
                    newChat.participants.forEach(pid => {
                        wss.clients.forEach(client => {
                            if (client.userId === pid && client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'chat_created',
                                    chat: newChat
                                }));
                            }
                        });
                    });
                    break;

                case 'search_users':
                    const query = msg.query.toLowerCase();
                    const results = Array.from(users.values())
                        .filter(u => 
                            u.login.toLowerCase().includes(query) ||
                            (u.name && u.name.toLowerCase().includes(query))
                        )
                        .map(u => ({
                            id: u.id,
                            login: u.login,
                            name: u.name,
                            online: u.online
                        }));
                    
                    ws.send(JSON.stringify({
                        type: 'search_results',
                        results: results
                    }));
                    break;
            }
        } catch (e) {
            console.error('Error:', e);
        }
    });

    ws.on('close', () => {
        if (ws.userId && users.has(ws.userId)) {
            const user = users.get(ws.userId);
            user.online = false;
            broadcast({
                type: 'user_offline',
                userId: ws.userId,
                login: user.login
            });
        }
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

app.get('/api/users', (req, res) => {
    res.json(Array.from(users.values()));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});