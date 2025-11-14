// SessionManager.js
class ConversationSession {
    constructor(conversationId, initialMessage) {
        this.conversationId = conversationId;
        this.initialMessage = initialMessage;
        this.status = 'pending'; // pending, streaming, completed, interrupted
        this.generatedChunks = [];
        this.lastSeq = 0;
        this.aiStream = null;
        this.clients = new Map(); // clientId -> { response, lastSentSeq }
        this.createdAt = Date.now();
        this.lastActivity = Date.now();
    }

    // 添加客户端
    addClient(clientId, response, lastSeq = 0) {
        this.clients.set(clientId, { response, lastSentSeq: lastSeq });
        this.lastActivity = Date.now();

        console.log(`客户端 ${clientId} 加入会话 ${this.conversationId}, 最后序列: ${lastSeq}`);

        // 发送缓存的内容
        this.sendCachedContent(clientId);

        return this;
    }

    // 发送已缓存的内容
    sendCachedContent(clientId) {
        const client = this.clients.get(clientId);
        if (!client) return;

        const unsentChunks = this.generatedChunks.filter(chunk => chunk.seq > client.lastSentSeq);

        unsentChunks.forEach(chunk => {
            this.sendToClient(clientId, chunk);
        });

        // 如果没有更多内容且会话完成，发送完成信号
        if (this.status === 'completed' && unsentChunks.length === 0) {
            this.sendToClient(clientId, {
                seq: this.lastSeq + 1,
                content: '',
                status: 'completed',
                conversationId: this.conversationId
            });
        }
    }

    // 发送数据到特定客户端
    sendToClient(clientId, data) {
        const client = this.clients.get(clientId);
        if (!client || !client.response) return;

        try {
            client.response.write(`data: ${JSON.stringify(data)}\n\n`);
            client.lastSentSeq = data.seq;
            console.log(`发送到 ${clientId}: seq=${data.seq}, content=${data.content.substring(0, 20)}...`);
        } catch (error) {
            console.error(`发送到客户端 ${clientId} 失败:`, error);
            this.removeClient(clientId);
        }
    }

    // 广播到所有客户端
    broadcast(data) {
        this.generatedChunks.push(data);
        this.lastSeq = data.seq;
        this.lastActivity = Date.now();

        this.clients.forEach((client, clientId) => {
            if (data.seq > client.lastSentSeq) {
                this.sendToClient(clientId, data);
            }
        });

        // 更新状态
        if (data.status === 'completed') {
            this.status = 'completed';
            this.cleanup();
        }
    }

    // 移除客户端
    removeClient(clientId) {
        this.clients.delete(clientId);
        console.log(`客户端 ${clientId} 离开会话 ${this.conversationId}`);

        // 如果没有客户端且会话完成，清理资源
        if (this.clients.size === 0 && this.status === 'completed') {
            this.cleanup();
        }
    }

    // 清理资源
    cleanup() {
        if (this.aiStream && typeof this.aiStream.destroy === 'function') {
            this.aiStream.destroy();
        }
        console.log(`会话 ${this.conversationId} 资源已清理`);
    }

    // 开始AI生成
    async startAIGeneration() {
        if (this.status !== 'pending') return;

        this.status = 'streaming';
        console.log(`开始AI生成 for ${this.conversationId}`);

        try {
            // 模拟AI流式生成（实际项目中替换为真实的AI服务调用）
            await this.simulateAIGeneration();
        } catch (error) {
            console.error(`AI生成失败 for ${this.conversationId}:`, error);
            this.status = 'interrupted';
            this.broadcast({
                seq: this.lastSeq + 1,
                content: '',
                status: 'error',
                error: '生成失败',
                conversationId: this.conversationId
            });
        }
    }

    // 模拟AI生成（实际项目替换为真实AI调用）
    async simulateAIGeneration() {
        const fullText = `这是对"${this.initialMessage}"的回复。我们将模拟流式生成过程，分多个块发送数据。`;
        const words = fullText.split(' ');
        let currentText = '';

        for (let i = 0; i < words.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 模拟生成延迟

            currentText += (i === 0 ? '' : ' ') + words[i];

            this.broadcast({
                seq: i,
                content: currentText,
                status: 'streaming',
                conversationId: this.conversationId
            });
        }

        // 生成完成
        this.broadcast({
            seq: words.length,
            content: '',
            status: 'completed',
            conversationId: this.conversationId
        });
    }
}

// 会话管理器
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // 5分钟清理一次
    }

    // 获取或创建会话
    getOrCreateSession(conversationId, initialMessage = '') {
        let session = this.sessions.get(conversationId);

        if (!session) {
            console.log(`创建新会话: ${conversationId}`);
            session = new ConversationSession(conversationId, initialMessage);
            this.sessions.set(conversationId, session);

            // 开始AI生成
            session.startAIGeneration();
        } else {
            console.log(`找到现有会话: ${conversationId}, 状态: ${session.status}`);
        }

        return session;
    }

    // 获取会话
    getSession(conversationId) {
        return this.sessions.get(conversationId);
    }

    // 清理过期会话
    cleanupExpiredSessions() {
        const now = Date.now();
        const expiredTime = 30 * 60 * 1000; // 30分钟无活动视为过期

        for (const [conversationId, session] of this.sessions.entries()) {
            if (session.status === 'completed' && (now - session.lastActivity) > expiredTime) {
                session.cleanup();
                this.sessions.delete(conversationId);
                console.log(`清理过期会话: ${conversationId}`);
            }
        }
    }

    // 手动结束会话
    endSession(conversationId) {
        const session = this.sessions.get(conversationId);
        if (session) {
            session.cleanup();
            this.sessions.delete(conversationId);
            console.log(`手动结束会话: ${conversationId}`);
        }
    }
}

module.exports = { SessionManager, ConversationSession };