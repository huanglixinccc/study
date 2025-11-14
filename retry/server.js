// server.js
const express = require('express');
const cors = require('cors');
const { SessionManager } = require('./SessionManager');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// 初始化会话管理器
const sessionManager = new SessionManager();

// 生成客户端ID
function generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// SSE 聊天接口
app.get('/api/chat/stream', (req, res) => {
    const { conversationId, message = '', lastSeq = 0 } = req.query;

    if (!conversationId) {
        return res.status(400).json({ error: 'conversationId 必填' });
    }

    // 设置SSE头
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    const clientId = generateClientId();
    console.log(`新的SSE连接: clientId=${clientId}, conversationId=${conversationId}, lastSeq=${lastSeq}`);

    // 获取或创建会话
    const session = sessionManager.getOrCreateSession(conversationId, message);

    // 添加客户端到会话
    session.addClient(clientId, res, parseInt(lastSeq));

    // 客户端断开连接
    req.on('close', () => {
        console.log(`客户端断开: ${clientId}`);
        session.removeClient(clientId);
    });

    req.on('error', (error) => {
        console.error(`客户端连接错误: ${clientId}`, error);
        session.removeClient(clientId);
    });
});

// 获取会话状态
app.get('/api/chat/status/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    const session = sessionManager.getSession(conversationId);

    if (!session) {
        return res.json({ exists: false });
    }

    res.json({
        exists: true,
        status: session.status,
        lastSeq: session.lastSeq,
        clientCount: session.clients.size,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity
    });
});

// 手动结束会话
app.post('/api/chat/end/:conversationId', (req, res) => {
    const { conversationId } = req.params;
    sessionManager.endSession(conversationId);
    res.json({ success: true, message: '会话已结束' });
});

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        activeSessions: sessionManager.sessions.size,
        timestamp: new Date().toISOString()
    });
});

app.listen(port, () => {
    console.log(`🚀 SSE服务器运行在 http://localhost:${port}`);
    console.log(`📊 健康检查: http://localhost:${port}/health`);
});