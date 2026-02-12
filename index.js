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

// ============ ADDED: HTTP SERVER FOR RENDER PORT ============
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

        // Message cache for anti-delete - SIMPLE MAP
        this.messageCache = new Map();
        this.setupCacheCleanup();

        // Initialize command handler
        // Integrate database with bot
        this.db.integrateWithBot(this);
        this.commandHandler = new CommandHandler(this);

        // Initialize AutoReact
        this.autoReact = new AutoReact(this);

        this.logger.log(`Prefix set to: "${this.settings.PREFIX}"`, 'debug', '⚙️');
        
        // ============ ADDED: Start HTTP status server ============
        this.startStatusServer();
    }

    // ============ ADDED: Status API Server ============
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
            if (req.url === '/status' || req.url === '/') {
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
                        user: this.baileys?.user ? {
                            name: this.baileys.getUserName(),
                            phone: this.baileys.user.id?.split(':')[0] || 'Unknown'
                        } : null,
                        uptime: this.formatUptime((Date.now() - this.startTime) / 1000)
                    },
                    stats: {
                        cached_messages: this.messageCache?.size || 0,
                        commands_loaded: this.commandHandler?.commands?.size || 0,
                        autoreact_enabled: this.autoReact?.getStatus?.()?.enabled || false,
                        database_connected: this.db?.isConnected?.() || true
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
            
            // Health check endpoint (for Render)
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
                    available_endpoints: ['/status', '/', '/health']
                }));
            }
        });

        server.listen(PORT, '0.0.0.0', () => {
            this.logger.log(`Status API server running on port ${PORT}`, 'success', '🌐');
            this.logger.log(`Status endpoint: http://localhost:${PORT}/status`, 'info', '🔗');
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
            this.isConnected = true;

            // Setup event listeners
            this.setupEventListeners();

            // ==================== CHANNEL LISTENER SETUP ====================
            try {
                const setupChannelListener = require('./src/utils/channelListener');

                // Your personal chat JID (where you want forwarded messages)
                const YOUR_PERSONAL_JID = '254107655023@s.whatsapp.net';

                // Setup channel listener
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
            await this.testConnection();
        } catch (error) {
            this.logger.error(error, 'MeganBot.initialize');
            process.exit(1);
        }
    }

    setupEventListeners() {
        // Listen for messages
        // Listen for message updates (edits)
        this.sock.ev.on('messages.update', async (updates) => {
            for (const update of updates) {
                if (this.db.trackMessageEdit) {
                    await this.db.trackMessageEdit(update, this.sock);
                }
            }
        });

        this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const msg of messages) {
                await this.handleMessage(msg);
            }
        });

        // ============ CRITICAL: PROPER DELETE EVENT LISTENER ============
        // Listen for message deletions (anti-delete) - EXACTLY LIKE YOUR OLD CODE
        this.sock.ev.on('messages.delete', async (update) => {
            this.logger.log('DEBUG: Delete event received', 'debug', '🗑️');

            if (this.settings.ANTI_DELETE) {
                await this.handleMessageDelete(update);
            }
        });

        // ============ DATABASE TRACKER DELETE HANDLER ============
        this.sock.ev.on("messages.delete", async (deleteData) => {
            this.logger.log("DATABASE: Delete event received", "debug", "🗑️");
            if (this.db.handleMessageDelete) {
                await this.db.handleMessageDelete(deleteData, this.sock);
            }
        });
        // Also listen for receipt updates as backup (like old code)
        // ============ DATABASE TRACKER EDIT HANDLER ============
        this.sock.ev.on("messages.update", async (updates) => {
            this.logger.log(`DATABASE: ${updates.length} update(s) received`, "debug", "✏️");
            for (const update of updates) {
                if (this.db.handleMessageEdit) {
                    await this.db.handleMessageEdit(update, this.sock);
                }
            }
        });

        this.sock.ev.on('message-receipt.update', async (receiptUpdates) => {
            for (const update of receiptUpdates) {
                const { key, receipt } = update;
                if (receipt && receipt.type === 'deleted') {
                    this.logger.log('DEBUG: Delete receipt received', 'debug', '🗑️');
                    await this.handleReceiptDelete(key);
                }
            }
        });

        // Listen for connection updates
        this.sock.ev.on('connection.update', (update) => {
            const { connection } = update;
            if (connection === 'connecting') {
                this.logger.log('Connecting to WhatsApp...', 'info', '🔄');
            }

            if (connection === 'close') {
                this.logger.log('Connection closed', 'warning', '🔌');
                this.isConnected = false;
            }

            if (connection === 'open') {
                this.isConnected = true;
                this.logger.log('Connection restored', 'success', '✅');
            }
        });

        this.logger.log('Event listeners setup complete', 'success', '✅');
    }

    async handleMessage(msg) {
        try {
            if (!msg.message || !msg.key) return;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            // Extract text from message
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
            if (msg.message.videoMessage?.caption) text = msg.message.videoMessage.caption;
            // Log the message
            const type = isGroup ? 'GROUP' : 'PVT';
            const shortText = text ? text.substring(0, 50) : '[Media]';
            this.logger.message(type, sender, shortText);

            // Track message in database with socket
            if (this.db.trackMessage) {
                await this.db.trackMessage(msg, this.sock);
            }
            // Track message in database
            if (this.db.trackMessage) {
                await this.db.trackMessage(msg, this.sock);
            }
            // Cache the message for anti-delete - SIMPLE CACHE
            if (this.settings.CACHE_MESSAGES) {
                this.cacheMessage(msg);
            }

            // MARK AS READ FIRST (before auto-react)
            if (this.settings.AUTO_READ) {
                await this.sock.readMessages([{ remoteJid: from, id: msg.key.id }]);
            }

            // AUTO-REACT TO MESSAGES
            if (this.autoReact) {
                try {
                    await this.autoReact.autoReact(msg);
                } catch (error) {
                    this.logger.error(error, 'AutoReact in handleMessage');
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
        // Simple caching - just like old code
        this.messageCache.set(msgId, {
            message: msg,
            timestamp: now,
            from: msg.key.remoteJid,
            sender: msg.key.participant || msg.key.remoteJid,
            text: this.extractMessageText(msg.message),
            isGroup: msg.key.remoteJid.endsWith('@g.us'),
            key: msg.key
        });
        this.logger.log(`Cached message ${msgId.substring(0, 10)}...`, 'debug', '💾');
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
        this.logger.log(`DEBUG: Processing delete event`, 'debug', '🗑️');

        const { keys } = update;

        for (const key of keys) {
            const msgId = key.id;
            const cached = this.messageCache.get(msgId);

            if (cached) {
                this.logger.log(`Message ${msgId.substring(0, 10)}... was deleted`, 'warning', '🗑️');
                // Track in database with auto-alert
                if (this.db.trackMessageDelete) {
                    await this.db.trackMessageDelete(key, this.sock, 'user_deleted');
                }
                await this.processDeletedMessage(cached, key);

                // Also track in database
                if (this.db.trackMessageDelete) {
                    await this.db.trackMessageDelete(key, 'user_deleted');
                }

                this.messageCache.delete(msgId);
            } else {
                this.logger.log(`Uncached message ${msgId.substring(0, 10)}... was deleted`, 'debug', '🗑️');
            }
        }
    }

    async handleReceiptDelete(key) {
        const msgId = key.id;
        const cached = this.messageCache.get(msgId);

        if (cached) {
            this.logger.log(`Message ${msgId.substring(0, 10)}... deleted (via receipt)`, 'warning', '🗑️');
            // Track in database with auto-alert
            if (this.db.trackMessageDelete) {
                await this.db.trackMessageDelete(key, this.sock, 'user_deleted');
            }
            await this.processDeletedMessage(cached, key);
            // Also track in database
            if (this.db.trackMessageDelete) {
                await this.db.trackMessageDelete(key, 'user_deleted');
            }
            this.messageCache.delete(msgId);
        }
    }

    async processDeletedMessage(cached, deleteKey) {
        const { from, sender, text, isGroup, key } = cached;
        const deleter = deleteKey.participant || sender;
        const deleterName = deleter.split('@')[0];
        const senderName = sender.split('@')[0];
        // Save to database if available
        if (db && db.deletedMessages) {
            try {
                db.deletedMessages.addDeletedMessage(key.id, {
                    text: text || '[Media]',
                    from: from,
                    sender: sender,
                    deleter: deleter,
                    deletedAt: Date.now(),
                    isGroup: isGroup
                });
            } catch (error) {
                this.logger.error(error, 'saveDeletedMessage');
            }
        }

        // Send alert ONLY to bot owner
        await this.sendAntiDeleteAlertToOwner(cached, deleter, deleterName, senderName);
    }

    async sendAntiDeleteAlertToOwner(cached, deleter, deleterName, senderName) {
        const { from, text, isGroup, key } = cached;

        try {
            // Get group name if it's a group
            let groupName = '';
            if (isGroup) {
                try {
                    const metadata = await this.sock.groupMetadata(from);
                    groupName = metadata.subject;
                } catch (error) {
                    groupName = 'Unknown Group';
                }
            }

            // Create detailed alert message
            const alertMessage = `🚨 *ANTI-DELETE ALERT!*  🚨

📝 *Message was deleted!*
👤 *Deleted by:* @${deleterName}
👤 *Original sender:* @${senderName}
📍 *Location:* ${isGroup ? `Group (${groupName})` : 'Private Chat'}
🆔 *Message ID:* ${key.id.substring(0, 8)}...
⏰ *Time:* ${new Date().toLocaleTimeString()}
📅 *Date:* ${new Date().toLocaleDateString()}
💬 *Message Content:*
${text || '[Media]'}`;
            // Send alert ONLY to bot owner
            if (this.settings.OWNER_PHONE) {
                const ownerJid = `${this.settings.OWNER_PHONE}@s.whatsapp.net`;
                try {
                    await this.sock.sendMessage(ownerJid, {
                        text: alertMessage,
                        mentions: [deleter, cached.sender]
                    });

                    this.logger.log(`Anti-delete alert sent to owner for message deleted by ${deleterName}`, 'warning', '🚨');
                } catch (error) {
                    this.logger.error(error, 'sendAntiDeleteAlertToOwner');
                }
            }
        } catch (error) {
            this.logger.error(error, 'sendAntiDeleteAlertToOwner');
        }
    }

    setupCacheCleanup() {
        // Clean old cached messages every hour
        setInterval(() => {
            this.cleanupOldMessages();
        }, 60 * 60 * 1000);
    }

    cleanupOldMessages() {
        const now = Date.now();
        const maxAge = this.settings.CACHE_DURATION;
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
        // Test 1: Check socket
        if (!this.sock) {
            this.logger.log('Socket not initialized', 'error', '❌');
            return;
        }
        // Test 2: Check user info
        if (this.baileys.user) {
            this.logger.log(`User: ${this.baileys.getUserName()}`, 'success', '✅');
        } else {
            this.logger.log('User info not available', 'warning', '⚠️');
        }

        // Test 3: Check connection status
        this.logger.log(`Connection: ${this.isConnected ? 'Connected' : 'Disconnected'}`, 'info', '🔌');
        // Test 4: Check prefix
        this.logger.log(`Prefix: "${this.settings.PREFIX}"`, 'info', '📝');

        // Test 5: Check commands
        this.logger.log(`Commands: ${this.commandHandler?.commands.size || 0} loaded`, 'info', '📊');
        // Test 6: Check core
        this.logger.log(`Core: ${this.core ? 'Initialized  ✅' : 'Not initialized ❌'}`, 'info', '⚙️');

        // Test 7: Check AutoReact
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

        // Clean message cache
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