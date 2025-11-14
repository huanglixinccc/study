// ChatComponent.jsx
import React, { useState, useEffect, useRef } from 'react';
import SSEClient from './SSEClient';
import './ChatComponent.css';

const ChatComponent = () => {
    const [messages, setMessages] = useState([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [conversationId, setConversationId] = useState(null);

    const sseClientRef = useRef(null);
    const messagesEndRef = useRef(null);

    // 滚动到底部
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // 初始化SSE客户端
    useEffect(() => {
        sseClientRef.current = new SSEClient({
            onMessage: (data) => {
                if (data.content) {
                    setMessages(prev => {
                        const newMessages = [...prev];
                        const lastMessage = newMessages[newMessages.length - 1];

                        if (lastMessage && lastMessage.type === 'ai' && lastMessage.isStreaming) {
                            // 更新流式消息
                            newMessages[newMessages.length - 1] = {
                                ...lastMessage,
                                content: data.content,
                                seq: data.seq
                            };
                        } else {
                            // 添加新消息
                            newMessages.push({
                                id: Date.now(),
                                type: 'ai',
                                content: data.content,
                                seq: data.seq,
                                isStreaming: data.status === 'streaming'
                            });
                        }

                        return newMessages;
                    });
                }

                if (data.status === 'streaming') {
                    setIsGenerating(true);
                }
            },

            onOpen: () => {
                setIsConnected(true);
                console.log('连接成功');
            },

            onError: (error) => {
                console.error('连接错误:', error);
                setIsConnected(false);
                setIsGenerating(false);

                setMessages(prev => [...prev, {
                    id: Date.now(),
                    type: 'system',
                    content: `连接错误: ${error.message}`
                }]);
            },

            onComplete: (data) => {
                setIsGenerating(false);
                setIsConnected(false);

                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];

                    if (lastMessage && lastMessage.type === 'ai') {
                        newMessages[newMessages.length - 1] = {
                            ...lastMessage,
                            isStreaming: false
                        };
                    }

                    return newMessages;
                });

                console.log('对话完成');
            }
        });

        // 尝试恢复之前的会话
        const savedConversationId = sseClientRef.current.getSavedConversationId();
        if (savedConversationId) {
            setConversationId(savedConversationId);
            checkConversationStatus(savedConversationId);
        }

        return () => {
            if (sseClientRef.current) {
                sseClientRef.current.close();
            }
        };
    }, []);

    // 检查会话状态
    const checkConversationStatus = async (convId) => {
        const status = await sseClientRef.current.checkConversationStatus(convId);
        console.log('会话状态:', status);

        if (status.exists && status.status === 'streaming') {
            setMessages(prev => [...prev, {
                id: Date.now(),
                type: 'system',
                content: `检测到未完成的对话，可以点击"继续对话"恢复`
            }]);
        }
    };

    // 发送消息
    const sendMessage = async () => {
        if (!inputMessage.trim() || isGenerating) return;

        const message = inputMessage.trim();
        setInputMessage('');

        // 添加用户消息
        setMessages(prev => [...prev, {
            id: Date.now(),
            type: 'user',
            content: message
        }]);

        // 开始AI生成
        setIsGenerating(true);

        try {
            const convId = await sseClientRef.current.startChat(message, conversationId);
            setConversationId(convId);
        } catch (error) {
            console.error('发送消息失败:', error);
            setIsGenerating(false);

            setMessages(prev => [...prev, {
                id: Date.now(),
                type: 'system',
                content: `发送失败: ${error.message}`
            }]);
        }
    };

    // 继续对话
    const continueConversation = async () => {
        if (!conversationId) return;

        setIsGenerating(true);
        await sseClientRef.current.connect();
    };

    // 开始新对话
    const startNewConversation = () => {
        setMessages([]);
        setConversationId(null);
        localStorage.removeItem('currentConversationId');

        if (sseClientRef.current) {
            sseClientRef.current.close();
        }
    };

    // 处理键盘事件
    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="chat-container">
            <div className="chat-header">
                <h3>智能聊天 (断线续传演示)</h3>
                <div className="connection-status">
                    <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                        ●
                    </span>
                    {isConnected ? '已连接' : '未连接'}
                    {conversationId && (
                        <span className="conversation-id">会话: {conversationId.substring(0, 8)}...</span>
                    )}
                </div>
                <button onClick={startNewConversation} className="new-conversation-btn">
                    新对话
                </button>
            </div>

            <div className="messages-container">
                {messages.length === 0 && (
                    <div className="empty-state">
                        <p>开始一段对话吧！支持断线自动重连续传。</p>
                    </div>
                )}

                {messages.map((message) => (
                    <div key={message.id} className={`message ${message.type}`}>
                        <div className="message-content">
                            {message.content}
                            {message.isStreaming && <span className="streaming-cursor">▊</span>}
                        </div>
                        {message.seq !== undefined && (
                            <div className="message-meta">seq: {message.seq}</div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            <div className="input-container">
                <div className="controls">
                    {conversationId && !isGenerating && !isConnected && (
                        <button onClick={continueConversation} className="continue-btn">
                            继续对话
                        </button>
                    )}
                </div>

                <div className="input-group">
                    <textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="输入消息... (Enter发送，Shift+Enter换行)"
                        disabled={isGenerating}
                        rows="2"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!inputMessage.trim() || isGenerating}
                        className="send-btn"
                    >
                        {isGenerating ? '生成中...' : '发送'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatComponent;