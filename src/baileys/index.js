const Connection = require('./connection');
const MessageHandler = require('./message-handler');
const GroupHandler = require('./group-handler');
const AntiHandler = require('./anti-handler');
const PresenceHandler = require('./presence-handler');

class BaileysWrapper {
    constructor(settings, logger) {
        this.settings = settings;
        this.logger = logger;
        this.sock = null;
        this.isConnected = false;
        this.user = null;
        this.closing = false;
        
        // Initialize handlers
        this.connection = new Connection(this, settings, logger);
        this.messageHandler = new MessageHandler(this, settings, logger);
        this.groupHandler = new GroupHandler(this, settings, logger);
        this.antiHandler = new AntiHandler(this, settings, logger);
        this.presenceHandler = new PresenceHandler(this, settings, logger);

        // Event emitter for commands
        const EventEmitter = require('events');
        this.events = new EventEmitter();
    }

    async initialize() {
        try {
            // Initialize socket
            await this.connection.initializeSocket();

            // Connect
            await this.connection.connect();
            
            return this.sock;
        } catch (error) {
            this.logger.error(error, 'BaileysWrapper.initialize');
            throw error;
        }
    }

    // Socket proxy methods
    sendMessage(jid, content, options = {}) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.sendMessage(jid, content, options);
    }

    async sendText(jid, text, options = {}) {
        return this.sendMessage(jid, { text }, options);
    }

    async groupMetadata(jid) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.groupMetadata(jid);
    }

    async groupParticipantsUpdate(jid, participants, action) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.groupParticipantsUpdate(jid, participants, action);
    }

    async sendPresenceUpdate(presence, jid) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.sendPresenceUpdate(presence, jid);
    }

    async readMessages(keys) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.readMessages(keys);
    }

    async updateBlockStatus(jid, action) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.updateBlockStatus(jid, action);
    }

    async groupFetchAllParticipating() {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.groupFetchAllParticipating();
    }

    async groupInviteCode(jid) {
        if (!this.sock) throw new Error('Socket not initialized');
        return this.sock.groupInviteCode(jid);
    }

    // FIXED: Download media content method for Baileys 7
    async downloadMediaContent(msg, mediaType) {
        if (!this.sock) throw new Error('Socket not initialized');

        try {
            // Get media from the message directly
            let mediaMessage;
            switch(mediaType) {
                case 'imageMessage':
                    mediaMessage = msg.message?.imageMessage;
                    break;
                case 'videoMessage':
                    mediaMessage = msg.message?.videoMessage;
                    break;
                case 'stickerMessage':
                    mediaMessage = msg.message?.stickerMessage;
                    break;
                case 'audioMessage':
                    mediaMessage = msg.message?.audioMessage;
                    break;
                case 'documentMessage':
                    mediaMessage = msg.message?.documentMessage;
                    break;
                default:
                    throw new Error(`Unsupported media type: ${mediaType}`);
            }

            if (!mediaMessage) {
                // Check quoted message
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quoted) {
                    switch(mediaType) {
                        case 'imageMessage':
                            mediaMessage = quoted.imageMessage;
                            break;
                        case 'videoMessage':
                            mediaMessage = quoted.videoMessage;
                            break;
                        case 'stickerMessage':
                            mediaMessage = quoted.stickerMessage;
                            break;
                        case 'audioMessage':
                            mediaMessage = quoted.audioMessage;
                            break;
                        case 'documentMessage':
                            mediaMessage = quoted.documentMessage;
                            break;
                    }
                }

                if (!mediaMessage) {
                    throw new Error('Media message not found');
                }
            }

            // Download the media - CORRECT Baileys 7 method
            const buffer = await this.sock.downloadMediaMessage(mediaMessage);
            return buffer;
            
        } catch (error) {
            this.logger.error(error, 'downloadMediaContent');
            throw new Error(`Failed to download media: ${error.message}`);
        }
    }

    // Simple download method for direct media message
    async downloadMedia(mediaMessage) {
        if (!this.sock) throw new Error('Socket not initialized');
        if (!mediaMessage) throw new Error('No media message provided');

        try {
            const buffer = await this.sock.downloadMediaMessage(mediaMessage);
            return buffer;
        } catch (error) {
            this.logger.error(error, 'downloadMedia');
            throw new Error(`Failed to download media: ${error.message}`);
        }
    }

    async end() {
        this.closing = true;
        return this.connection.cleanup();
    }

    // Utility methods
    getPhoneNumber() {
        if (!this.user?.id) return 'Unknown';
        const id = this.user.id;
        return id.split(':')[0].split('@')[0];
    }

    getUserName() {
        return this.user?.name || this.user?.verifiedName || 'Unknown';
    }

    isGroup(jid) {
        return jid && jid.endsWith('@g.us');
    }

    isPrivate(jid) {
        return jid && jid.endsWith('@s.whatsapp.net');
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

    formatPhone(phone) {
        phone = phone.replace(/\D/g, '');
        if (phone.startsWith('0')) phone = '254' + phone.slice(1);
        if (!phone.startsWith('254')) phone = '254' + phone;
        return phone;
    }
}

module.exports = BaileysWrapper;
