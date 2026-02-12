const BaileysWrapper = require('./src/baileys');
const settings = require('./settings');
const { createLogger } = require('./wanga/utils/logger');
const db = require('./wanga/utils/database');
const CommandHandler = require('./src/commands');
const Core = require('./src/core');

// Import Baileys directly for proper event handling
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');

// Import AutoReact
const AutoReact = require('./src/core/utils/autoreact');

// ============ HTTP SERVER FOR RENDER PORT ============
const http = require('http');
const os = require('os');

class MeganBot {
    constructor() {
        this.settings = settings;
        // Database tracker
        this.db = db;

        // Initialize database with settings
        if (typeof this.db.integrateWithBot === "function") {
            this.db.integrateWithBot(this);
        }
        // Integrate database with bot for auto-alerts
        this.db.integrateWithBot(this);
        this.logger = createLogger(settings.BOT_NAME);
        // Force prefix to be "."
        this.settings.PREFIX = ".";

        // Initialize core
        this.core = new Core(this);

        // Initialize baileys wrapper
        this.baileys = new BaileysWrapper(this.settings, this.logger);

        // Store baileys instance for easy access
        this.sock = null;
        this.isConnected = false;
        this.startTime = Date.now();
        this.closing = false;
        this.user = null;

        // Message cache for anti-delete - SIMPLE MAP
        this.messageCache = new Map();
        this.setupCacheCleanup();

        // Initialize command handler
        this.db.integrateWithBot(this);
        this.commandHandler = new CommandHandler(this);

        // Initialize AutoReact
        this.autoReact = new AutoReact(this);

        this.logger.log(`Prefix set to: "${this.settings.PREFIX}"`, 'debug', '⚙️');
        
        // ============ Start HTTP status server ============
        this.startStatusServer();
    }

    // ============ Status API Server ============
    startStatusServer() {
        const PORT = process.env.PORT || 3000;
        
        const server = http.createServer((req, res) => {
            // Set CORS headers
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET');
            res.setHeader('Content-Type', 'application/json');
            
            // Handle favicon.ico
            if (req.url === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            
            // Status endpoint
            if (req.url === '/' || req.url === '/status') {
                const status = {
                    status: this.isConnected ? 'online' : 'offline',
                    bot: {
                        name: settings.BOT_NAME || 'MEGAN MD',
                        version: settings.VERSION || '1.0.0',
                        prefix: this.settings.PREFIX,
                        owner: settings.OWNER_NAME || 'Tracker Wanga',
                        phone: settings.OWNER_PHONE || '254107655023'
                    },
                    connection: {
                        connected: this.isConnected,
                        user: this.user ? {
                            name: this.getUserName(),
                            phone: this.getPhoneNumber()
                        } : null,
                        uptime: this.formatUptime((Date.now() - this.startTime) / 1000),
                        reconnect_attempts: this.baileys?.connection?.connectionAttempts || 0
                    },
                    stats: {
                        cached_messages: this.messageCache?.size || 0,
                        commands_loaded: this.commandHandler?.commands?.size || 0,
                        autoreact_enabled: this.autoReact?.getStatus?.()?.enabled || false
                    },
                    system: {
                        node_version: process.version,
                        platform: os.platform(),
                        memory_usage: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
                        cpu_cores: os.cpus().length
                    },
                    timestamp: new Date().toISOString()
                };
                
                res.writeHead(this.isConnected ? 200 : 503);
                res.end(JSON.stringify(status, null, 2));
            }
            
            // Health check endpoint
            else if (req.url === '/health') {
                res.writeHead(this.isConnected ? 200 : 503);
                res.end(JSON.stringify({ 
                    status: this.isConnected ? 'healthy' : 'unhealthy',
                    timestamp: new Date().toISOString()
                }));
            }
            
            // 404 for other routes
            else {
                res.writeHead(404);
                res.end(JSON.stringify({ 
                    error: 'Not found',
                    available_endpoints: ['/', '/status', '/health']
                }));
            }
        });

        server.listen(PORT, '0.0.0.0', () => {
            this.logger.log(`Status API server running on port ${PORT}`, 'success', '🌐');
        });

        server.on('error', (err) => {
            this.logger.error(err, 'StatusServer');
        });
    }

    async initialize() {
        try {
            this.logger.log(`🚀 Starting ${this.settings.BOT_NAME}...`, 'info', '🚀');

            // Initialize core first
            await this.core.initialize();

            // Initialize baileys connection
            this.sock = await this.baileys.initialize();
            
            // Setup event listeners
            this.setupEventListeners();

            // ==================== CHANNEL LISTENER SETUP ====================
            try {
                const setupChannelListener = require('./src/utils/channelListener');
                const YOUR_PERSONAL_JID = '254107655023@s.whatsapp.net';
                setupChannelListener(this.sock, YOUR_PERSONAL_JID);
                this.logger.log('Channel listener activated', 'success', '📢');
            } catch (error) {
                this.logger.error(error, 'setupChannelListener');
            }
            // ==================== END CHANNEL LISTENER ====================

            // Setup cleanup handlers
            this.setupCleanup();

            this.logger.log(`${this.settings.BOT_NAME} is ready!`, 'success', '✅');
            this.logger.log(`Prefix: "${this.settings.PREFIX}"`, 'info', '📝');

            // Test connection
            setTimeout(() => this.testConnection(), 3000);
        } catch (error) {
            this.logger.error(error, 'MeganBot.initialize');
            process.exit(1);
        }
    }

    setupEventListeners() {
        if (!this.sock) return;

        // ============ CRITICAL: RAW MESSAGE DEBUG LISTENER ============
        // This shows EVERY incoming message in detail
        this.sock.ev.on('messages.upsert', ({ messages, type }) => {
            // Log raw event
            console.log('\n' + '='.repeat(60));
            console.log(`🔔 NEW MESSAGE EVENT | Type: ${type} | Time: ${new Date().toLocaleTimeString()}`);
            console.log('='.repeat(60));
            
            messages.forEach((msg, index) => {
                const key = msg.key || {};
                const message = msg.message || {};
                const messageType = Object.keys(message)[0] || 'unknown';
                const from = key.remoteJid || 'unknown';
                const sender = key.participant || key.remoteJid || 'unknown';
                const isGroup = from?.endsWith('@g.us') || false;
                const isStatus = from === 'status@broadcast';
                
                // Extract text content
                let text = '';
                if (message.conversation) text = message.conversation;
                else if (message.extendedTextMessage?.text) text = message.extendedTextMessage.text;
                else if (message.imageMessage?.caption) text = message.imageMessage.caption;
                else if (message.videoMessage?.caption) text = message.videoMessage.caption;
                else if (message.documentMessage?.caption) text = message.documentMessage.caption;
                
                console.log(`\n📨 [${index + 1}/${messages.length}] Message ID: ${key.id || 'no-id'}`);
                console.log(`   📍 From: ${from}`);
                console.log(`   👤 Sender: ${sender}`);
                console.log(`   🏷️ Type: ${isGroup ? '👥 GROUP' : isStatus ? '📱 STATUS' : '💬 PRIVATE'}`);
                console.log(`   📦 Message Type: ${messageType}`);
                console.log(`   💬 Text: ${text || '[NO TEXT / MEDIA]'}`);
                
                if (text) {
                    console.log(`   📝 Preview: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
                }
                
                // Show if it's a command
                if (text && text.startsWith(this.settings.PREFIX)) {
                    console.log(`   ⚡ COMMAND DETECTED: ${text.split(' ')[0]}`);
                }
                
                // Full message dump (truncated)
                console.log(`   📋 Full Message: ${JSON.stringify(msg, null, 2).substring(0, 300)}...`);
            });
            
            console.log('='.repeat(60) + '\n');
            
            // Process normally
            if (type === 'notify') {
                for (const msg of messages) {
                    this.handleMessage(msg).catch(err => {
                        this.logger.error(err, 'handleMessage');
                    });
                }
            }
        });

        // Listen for message updates (edits)
        this.sock.ev.on('messages.update', async (updates) => {
            console.log(`✏️ Message Edit Event: ${updates.length} update(s)`);
            for (const update of updates) {
                console.log(`   - Edited: ${update.key?.id?.substring(0, 10)}...`);
                if (this.db.trackMessageEdit) {
                    await this.db.trackMessageEdit(update, this.sock);
                }
            }
        });

        // Listen for message deletions
        this.sock.ev.on('messages.delete', async (update) => {
            console.log(`🗑️ Message Delete Event:`, update);
            if (this.settings.ANTI_DELETE) {
                await this.handleMessageDelete(update);
            }
            if (this.db.handleMessageDelete) {
                await this.db.handleMessageDelete(update, this.sock);
            }
        });

        // Listen for receipt updates
        this.sock.ev.on('message-receipt.update', async (receiptUpdates) => {
            for (const update of receiptUpdates) {
                const { key, receipt } = update;
                if (receipt && receipt.type === 'deleted') {
                    console.log(`🗑️ Delete Receipt: ${key.id?.substring(0, 10)}...`);
                    await this.handleReceiptDelete(key);
                }
            }
        });

        // Listen for group updates
        this.sock.ev.on('groups.update', async (updates) => {
            for (const update of updates) {
                console.log(`👥 Group Update: ${update.id}`, update);
            }
        });

        // Listen for presence updates
        this.sock.ev.on('presence.update', async (update) => {
            // Uncomment if you want to see who's online
            // console.log(`🟢 Presence: ${update.id}`, update);
        });

        this.logger.log('Event listeners setup complete', 'success', '✅');
    }

    async handleMessage(msg) {
        try {
            if (!msg.message || !msg.key) return;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            const isStatus = from === 'status@broadcast';
            
            // Skip status broadcasts
            if (isStatus) return;
            
            // Extract text from message
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
            if (msg.message.videoMessage?.caption) text = msg.message.videoMessage.caption;
            
            // Log the message (simplified)
            const type = isGroup ? 'GROUP' : 'PVT';
            const shortText = text ? text.substring(0, 50) : '[Media]';
            this.logger.message(type, sender.split('@')[0], shortText);

            // Track message in database
            if (this.db.trackMessage) {
                await this.db.trackMessage(msg, this.sock);
            }
            
            // Cache the message for anti-delete
            if (this.settings.CACHE_MESSAGES) {
                this.cacheMessage(msg);
            }

            // MARK AS READ
            if (this.settings.AUTO_READ && !isStatus) {
                await this.sock.readMessages([{ remoteJid: from, id: msg.key.id }]);
            }

            // AUTO-REACT TO MESSAGES
            if (this.autoReact && !isStatus) {
                try {
                    await this.autoReact.autoReact(msg);
                } catch (error) {
                    this.logger.error(error, 'AutoReact');
                }
            }

            // Handle commands
            if (text && text.startsWith(this.settings.PREFIX)) {
                await this.commandHandler.handleCommand(msg, text, from, sender, isGroup);
            }
        } catch (error) {
            this.logger.error(error, 'handleMessage');
        }
    }

    cacheMessage(msg) {
        const msgId = msg.key.id;
        const now = Date.now();
        this.messageCache.set(msgId, {
            message: msg,
            timestamp: now,
            from: msg.key.remoteJid,
            sender: msg.key.participant || msg.key.remoteJid,
            text: this.extractMessageText(msg.message),
            isGroup: msg.key.remoteJid.endsWith('@g.us'),
            key: msg.key
        });
    }

    extractMessageText(message) {
        if (!message) return '';
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        if (message.documentMessage?.caption) return message.documentMessage.caption;
        if (message.audioMessage?.caption) return message.audioMessage.caption;
        return '';
    }

    async handleMessageDelete(update) {
        const { keys } = update;
        for (const key of keys) {
            const msgId = key.id;
            const cached = this.messageCache.get(msgId);
            if (cached) {
                this.logger.log(`Message ${msgId.substring(0, 10)}... was deleted`, 'warning', '🗑️');
                if (this.db.trackMessageDelete) {
                    await this.db.trackMessageDelete(key, this.sock, 'user_deleted');
                }
                await this.processDeletedMessage(cached, key);
                this.messageCache.delete(msgId);
            }
        }
    }

    async handleReceiptDelete(key) {
        const msgId = key.id;
        const cached = this.messageCache.get(msgId);
        if (cached) {
            this.logger.log(`Message ${msgId.substring(0, 10)}... deleted (via receipt)`, 'warning', '🗑️');
            if (this.db.trackMessageDelete) {
                await this.db.trackMessageDelete(key, this.sock, 'user_deleted');
            }
            await this.processDeletedMessage(cached, key);
            this.messageCache.delete(msgId);
        }
    }

    async processDeletedMessage(cached, deleteKey) {
        const { from, sender, text, isGroup, key } = cached;
        const deleter = deleteKey.participant || sender;
        const deleterName = deleter.split('@')[0];
        const senderName = sender.split('@')[0];
        
        // Send alert to owner
        if (this.settings.OWNER_PHONE) {
            const ownerJid = `${this.settings.OWNER_PHONE}@s.whatsapp.net`;
            try {
                let groupName = '';
                if (isGroup) {
                    try {
                        const metadata = await this.sock.groupMetadata(from);
                        groupName = metadata.subject;
                    } catch (error) {
                        groupName = 'Unknown Group';
                    }
                }

                const alertMessage = `🚨 *ANTI-DELETE ALERT!*\n\n` +
                    `📝 *Message deleted!*\n` +
                    `👤 *Deleted by:* @${deleterName}\n` +
                    `👤 *Sender:* @${senderName}\n` +
                    `📍 *Location:* ${isGroup ? `Group (${groupName})` : 'Private Chat'}\n` +
                    `💬 *Message:*\n${text || '[Media]'}`;

                await this.sock.sendMessage(ownerJid, {
                    text: alertMessage,
                    mentions: [deleter, cached.sender]
                });
            } catch (error) {
                this.logger.error(error, 'sendAntiDeleteAlert');
            }
        }
    }

    setupCacheCleanup() {
        setInterval(() => {
            this.cleanupOldMessages();
        }, 60 * 60 * 1000);
    }

    cleanupOldMessages() {
        const now = Date.now();
        const maxAge = this.settings.CACHE_DURATION || 24 * 60 * 60 * 1000;
        let cleaned = 0;
        for (const [msgId, data] of this.messageCache.entries()) {
            if (now - data.timestamp > maxAge) {
                this.messageCache.delete(msgId);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.log(`Cleaned ${cleaned} old messages from cache`, 'info', '🧹');
        }
    }

    getUserName() {
        if (this.user) {
            return this.user.name || this.user.verifiedName || this.user.notify || this.user.id?.split(':')[0] || 'Unknown';
        }
        return this.baileys?.user?.name || this.baileys?.getUserName() || 'Unknown';
    }

    getPhoneNumber() {
        if (this.user) {
            return this.user.id?.split(':')[0] || this.user.id?.split('@')[0] || 'Unknown';
        }
        return this.baileys?.user?.id?.split(':')[0] || this.baileys?.getPhoneNumber() || 'Unknown';
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 60 * 60));
        const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
        const minutes = Math.floor((seconds % (60 * 60)) / 60);
        const secs = Math.floor(seconds % 60);
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
        return parts.join(' ');
    }

    async testConnection() {
        this.logger.log('Running connection tests...', 'info', '🧪');
        
        if (!this.sock) {
            this.logger.log('Socket not initialized', 'error', '❌');
            return;
        }
        
        this.logger.log(`User: ${this.getUserName()}`, 'success', '✅');
        this.logger.log(`Phone: ${this.getPhoneNumber()}`, 'info', '📱');
        this.logger.log(`Connection: ${this.isConnected ? 'Connected' : 'Disconnected'}`, 'info', '🔌');
        this.logger.log(`Prefix: "${this.settings.PREFIX}"`, 'info', '📝');
        this.logger.log(`Commands: ${this.commandHandler?.commands.size || 0} loaded`, 'info', '📊');
        
        if (this.autoReact) {
            const status = this.autoReact.getStatus();
            this.logger.log(`AutoReact: ${status.enabled ? 'Enabled ✅' : 'Disabled ❌'} (${status.mode})`, 'info', '🤖');
        }
        
        this.logger.log('Connection tests completed', 'success', '✅');
    }

    setupCleanup() {
        process.on('SIGINT', () => {
            this.logger.log('Received SIGINT', 'warning', '🛑');
            this.cleanup();
        });

        process.on('SIGTERM', () => {
            this.logger.log('Received SIGTERM', 'warning', '🛑');
            this.cleanup();
        });
    }

    async cleanup() {
        this.logger.log('Cleaning up...', 'warning', '🧹');

        const cacheSize = this.messageCache.size;
        this.messageCache.clear();
        this.logger.log(`Cleared ${cacheSize} messages from cache`, 'info', '💾');

        try {
            if (this.baileys) {
                await this.baileys.end();
            }
        } catch (error) {
            this.logger.error(error, 'cleanup');
        }

        this.logger.log('Cleanup complete', 'info', '✅');
        process.exit(0);
    }
}

// Create and start the bot
const bot = new MeganBot();
bot.initialize().catch(error => {
    console.error('Failed to start bot:', error);
    process.exit(1);
});