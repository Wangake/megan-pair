const fs = require('fs-extra');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');

class Connection {
    constructor(bot, settings, logger) {
        this.bot = bot;
        this.settings = settings;
        this.logger = logger;
        this.autoViewInterval = null;
        this.isReconnecting = false;
        this.connectionAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.connectionResolver = null;
        this.connectionRejector = null;
        this.connectionTimeout = null;
    }

    async initializeSocket() {
        try {
            // Check session
            const sessionExists = await fs.pathExists(path.join(this.settings.SESSION_DIR, 'creds.json'));
            if (!sessionExists) {
                this.logger.log('No session found. Please run pairing process.', 'error', '❌');
                throw new Error('No session found');
            }

            // Initialize auth state
            const { state, saveCreds } = await useMultiFileAuthState(this.settings.SESSION_DIR);
            this.saveCreds = saveCreds;

            // Get latest version
            const { version } = await fetchLatestBaileysVersion();

            // Create Pino logger for Baileys
            const pinoLogger = pino({
                level: 'silent', // We handle logging ourselves
                transport: null
            });

            // Create socket
            this.bot.sock = makeWASocket({
                version,
                auth: state,
                logger: pinoLogger,
                printQRInTerminal: false,
                browser: Browsers.ubuntu('Chrome'),
                markOnlineOnConnect: true,
                syncFullHistory: false,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 25000,
                generateHighQualityLinkPreview: true,
                emitOwnEvents: true,
                defaultQueryTimeoutMs: 60000,
                mobile: false,
                fireInitQueries: true
            });

            // Handle credentials update
            this.bot.sock.ev.on('creds.update', () => {
                if (this.saveCreds) {
                    this.saveCreds();
                }
            });

            this.logger.log('Socket initialized successfully', 'success', '✅');
            return this.bot.sock;
        } catch (error) {
            this.logger.error(error, 'Connection.initializeSocket');
            throw error;
        }
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.connectionResolver = resolve;
            this.connectionRejector = reject;
            
            this.connectionTimeout = setTimeout(() => {
                reject(new Error('Connection timeout (60s)'));
            }, 60000);

            // Listen for connection updates
            this.bot.sock.ev.on('connection.update', (update) => {
                this.handleConnectionUpdate(update, resolve, reject);
            });
        });
    }

    handleConnectionUpdate(update, resolve, reject) {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            this.handleOpenConnection();
            if (resolve) resolve(this.bot.sock);
        } else if (connection === 'close') {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
            this.handleCloseConnection(lastDisconnect);
            if (reject) reject(new Error(`Connection closed: ${lastDisconnect?.error?.message || 'Unknown'}`));
        } else if (connection === 'connecting') {
            this.logger.connection('connecting', 'Establishing connection...');
        }
    }

    handleOpenConnection() {
        this.bot.isConnected = true;
        this.bot.user = this.bot.sock.user;
        this.connectionAttempts = 0;
        this.isReconnecting = false;

        const phone = this.bot.getPhoneNumber();
        const name = this.bot.getUserName();

        this.logger.connection('connected', `${name} (${phone})`);
        this.logger.log(`${this.settings.BOT_NAME} is now online!`, 'success', '✅');
        this.logger.log(`📱 Phone: ${phone}`, 'info', '📱');
        this.logger.log(`👤 Name: ${name}`, 'info', '👤');
        this.logger.log(`👑 Owner: ${this.settings.OWNER_NAME}`, 'info', '👑');
        this.logger.log(`📝 Prefix: ${this.settings.PREFIX}`, 'info', '📝');

        // Send online notification to owner
        this.sendOnlineNotification();

        // Start auto-view status
        if (this.settings.AUTO_VIEW_STATUS) {
            this.startAutoViewStatus();
        }
    }

    handleCloseConnection(lastDisconnect) {
        this.bot.isConnected = false;
        this.stopAutoViewStatus();

        const error = lastDisconnect?.error;
        const reason = error?.output?.statusCode || error?.statusCode || 0;

        if (this.shouldReconnect(reason)) {
            this.attemptReconnect();
        } else {
            this.logger.connection('disconnected', `Connection closed: ${error?.message || 'Unknown error'}`);
        }
    }

    shouldReconnect(statusCode) {
        // Don't reconnect if explicitly closed
        if (this.bot.closing) return false;

        // Reconnect on these status codes
        const reconnectCodes = [401, 403, 404, 408, 500, 502, 503, 504];
        return reconnectCodes.includes(statusCode) || 
               statusCode === undefined || 
               this.connectionAttempts < this.maxReconnectAttempts;
    }

    async attemptReconnect() {
        if (this.isReconnecting || this.connectionAttempts >= this.maxReconnectAttempts) {
            return;
        }

        this.isReconnecting = true;
        this.connectionAttempts++;

        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        
        this.logger.log(`Attempting reconnect (${this.connectionAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`, 'warning', '🔄');

        setTimeout(async () => {
            try {
                await this.initializeSocket();
                await this.connect();
                this.isReconnecting = false;
            } catch (error) {
                this.logger.error(error, 'Connection.attemptReconnect');
                this.isReconnecting = false;
                if (this.connectionAttempts < this.maxReconnectAttempts) {
                    await this.attemptReconnect();
                }
            }
        }, delay);
    }

    startAutoViewStatus() {
        if (this.autoViewInterval) {
            clearInterval(this.autoViewInterval);
        }

        this.autoViewInterval = setInterval(() => {
            if (this.bot.isConnected && this.settings.AUTO_VIEW_STATUS) {
                this.handleStatusUpdate();
            }
        }, 30000);

        this.logger.log('Auto-view status started', 'success', '👁️');
    }

    stopAutoViewStatus() {
        if (this.autoViewInterval) {
            clearInterval(this.autoViewInterval);
            this.autoViewInterval = null;
            this.logger.log('Auto-view status stopped', 'warning', '👁️');
        }
    }

    async handleStatusUpdate() {
        this.logger.log('Checking status updates...', 'info', '👁️');
        // Status viewing logic can be implemented here
        // Currently just logs for demonstration
    }

    async sendOnlineNotification() {
        if (!this.settings.OWNER_PHONE) return;

        try {
            const ownerJid = `${this.settings.OWNER_PHONE}@s.whatsapp.net`;
            const phone = this.bot.getPhoneNumber();
            const name = this.bot.getUserName();

            await this.bot.sendMessage(ownerJid, {
                text: `✅ *${this.settings.BOT_NAME} Online*\n\n` +
                      `📱 Phone: ${phone}\n` +
                      `👤 Name: ${name}\n` +
                      `⏰ Time: ${new Date().toLocaleString()}\n` +
                      `🔌 Connection: Stable\n` +
                      `📝 Prefix: ${this.settings.PREFIX}`
            });
        } catch (error) {
            this.logger.error(error, 'Connection.sendOnlineNotification');
        }
    }

    async cleanup() {
        this.stopAutoViewStatus();
        this.bot.closing = true;

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.bot.sock) {
            try {
                await this.bot.sock.end();
                this.logger.log('Connection cleanup complete', 'info', '🧹');
            } catch (error) {
                this.logger.error(error, 'Connection.cleanup');
            }
        }
    }
}

module.exports = Connection;
