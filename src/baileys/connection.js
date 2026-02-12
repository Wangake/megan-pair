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
        this.maxReconnectAttempts = 10;
        this.connectionResolver = null;
        this.connectionRejector = null;
        this.connectionTimeout = null;
        this.statusCheckInProgress = false;
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

            // Create Pino logger for Baileys - SILENT to prevent spam
            const pinoLogger = pino({
                level: 'fatal',
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
                fireInitQueries: true,
                shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.includes('newsletter') // Ignore status broadcasts to prevent auto-view
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

        // Send online notification to owner (only once per session)
        if (this.connectionAttempts === 0) {
            this.sendOnlineNotification();
        }

        // Start auto-view status with SAFE implementation
        if (this.settings.AUTO_VIEW_STATUS) {
            setTimeout(() => this.startAutoViewStatus(), 5000);
        }
    }

    handleCloseConnection(lastDisconnect) {
        this.bot.isConnected = false;
        this.stopAutoViewStatus();

        const error = lastDisconnect?.error;
        const reason = error?.output?.statusCode || error?.statusCode || 0;
        const errorMessage = error?.message || 'Unknown error';

        // Check if we should reconnect
        if (this.shouldReconnect(reason, errorMessage)) {
            this.attemptReconnect();
        } else {
            this.logger.connection('disconnected', `Connection closed: ${errorMessage}`);
            
            // Logout case
            if (reason === 401) {
                this.logger.log('Session expired. Please re-pair.', 'error', '🔐');
            }
        }
    }

    shouldReconnect(statusCode, errorMessage) {
        // Don't reconnect if explicitly closed
        if (this.bot.closing) return false;

        // Don't reconnect on logout
        if (statusCode === 401) return false;

        // Always try to reconnect on network errors
        const networkErrors = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EPIPE', 'EAI_AGAIN'];
        if (networkErrors.some(err => errorMessage?.includes(err))) {
            return true;
        }

        // Reconnect on these status codes
        const reconnectCodes = [403, 404, 408, 429, 500, 502, 503, 504];
        return reconnectCodes.includes(statusCode) || 
               statusCode === undefined || 
               this.connectionAttempts < this.maxReconnectAttempts;
    }

    async attemptReconnect() {
        if (this.isReconnecting || this.connectionAttempts >= this.maxReconnectAttempts) {
            if (this.connectionAttempts >= this.maxReconnectAttempts) {
                this.logger.log('Max reconnection attempts reached. Please restart manually.', 'error', '⚠️');
            }
            return;
        }

        this.isReconnecting = true;
        this.connectionAttempts++;

        // Exponential backoff
        const delay = Math.min(2000 * Math.pow(1.5, this.connectionAttempts - 1), 30000);

        this.logger.log(`Attempting reconnect (${this.connectionAttempts}/${this.maxReconnectAttempts}) in ${delay/1000}s`, 'warning', '🔄');

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

        // Don't auto-view status - it causes crashes
        // Just log that we're skipping it
        this.logger.log('Auto-view status disabled (skipped to prevent reconnects)', 'info', '👁️');
        
        // If you REALLY need auto-view, uncomment below with caution
        /*
        this.autoViewInterval = setInterval(() => {
            if (this.bot.isConnected && this.settings.AUTO_VIEW_STATUS && !this.statusCheckInProgress) {
                this.safeViewStatuses();
            }
        }, 60000); // Check every minute
        */
    }

    async safeViewStatuses() {
        if (this.statusCheckInProgress) return;
        
        this.statusCheckInProgress = true;
        
        try {
            if (!this.bot.sock) return;
            
            // Get status contacts
            const statusJids = await this.bot.sock.getStatusJids();
            if (!statusJids || statusJids.length === 0) return;
            
            // Only view first 5 statuses to prevent overload
            const toView = statusJids.slice(0, 5);
            
            for (const jid of toView) {
                try {
                    await this.bot.sock.readMessages([{ 
                        remoteJid: 'status@broadcast', 
                        id: jid,
                        participant: jid 
                    }]);
                    // Small delay between reads
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e) {
                    // Skip individual status errors silently
                    continue;
                }
            }
            
            this.logger.log(`Viewed ${toView.length} statuses`, 'debug', '👁️');
        } catch (error) {
            // Silently fail - status viewing is not critical
            this.logger.log('Status check completed (no new statuses)', 'debug', '👁️');
        } finally {
            this.statusCheckInProgress = false;
        }
    }

    stopAutoViewStatus() {
        if (this.autoViewInterval) {
            clearInterval(this.autoViewInterval);
            this.autoViewInterval = null;
        }
    }

    async sendOnlineNotification() {
        if (!this.settings.OWNER_PHONE) return;

        try {
            const ownerJid = `${this.settings.OWNER_PHONE}@s.whatsapp.net`;
            const phone = this.bot.getPhoneNumber();
            const name = this.bot.getUserName();
            const uptime = this.bot.formatUptime ? 
                this.bot.formatUptime((Date.now() - this.bot.startTime) / 1000) : '0s';

            await this.bot.sock.sendMessage(ownerJid, {
                text: `✅ *${this.settings.BOT_NAME} Online*\n\n` +
                      `📱 *Phone:* ${phone}\n` +
                      `👤 *Name:* ${name}\n` +
                      `⏰ *Time:* ${new Date().toLocaleString()}\n` +
                      `🕐 *Uptime:* ${uptime}\n` +
                      `📝 *Prefix:* ${this.settings.PREFIX}\n` +
                      `🔌 *Status:* Connected`
            });
            
            this.logger.log(`Online notification sent to owner`, 'success', '📨');
        } catch (error) {
            // Silently fail - notification not critical
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