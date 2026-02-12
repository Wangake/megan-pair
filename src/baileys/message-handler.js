class MessageHandler {
    constructor(bot, config, logger) {
        this.bot = bot;
        this.config = config;
        this.logger = logger;
    }

    async handleMessagesUpsert(messages, type) {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
            await this.processMessage(msg);
        }
    }

    async processMessage(msg) {
        try {
            // Validate message
            if (!msg.message || !msg.key) return;

            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = this.bot.isGroup(from);
            const text = this.bot.extractMessageText(msg.message);

            // Cache for anti-delete
            if (this.bot.antiHandler?.cacheMessage) {
                this.bot.antiHandler.cacheMessage(msg);
            }

            // Log message
            this.logMessage(msg, from, sender, text, isGroup);

            // Auto-read if enabled
            if (this.config.autoRead !== false) {
                await this.markAsRead(from, msg.key.id);
            }

            // Check for commands
            if (text && text.startsWith(this.config.PREFIX)) {
                await this.handleCommand(msg, text, from, sender, isGroup);
            }

            // Anti-spam check for groups
            if (isGroup && this.bot.antiHandler?.checkAntiSpam) {
                await this.bot.antiHandler.checkAntiSpam(sender, from, msg);
            }
            
        } catch (error) {
            this.logger.error(error, 'MessageHandler.processMessage');
        }
    }

    logMessage(msg, from, sender, text, isGroup) {
        const type = isGroup ? 'GROUP' : 'PVT';
        const content = text ? text.substring(0, 50) : '[Media]';
        const senderShort = sender.split('@')[0];
        
        this.logger.message(type, senderShort, content);
    }

    async handleCommand(msg, text, from, sender, isGroup) {
        const command = text.slice(this.config.PREFIX.length).trim().split(/ +/)[0].toLowerCase();
        const args = text.slice(this.config.PREFIX.length + command.length).trim().split(/ +/);
        
        this.logger.command(command, sender, isGroup ? from : '');

        // Emit command event for main bot to handle
        if (this.bot.events && this.bot.events.emit) {
            this.bot.events.emit('command', {
                msg, command, args, from, sender, isGroup, text
            });
        }
    }

    async markAsRead(jid, messageId) {
        try {
            await this.bot.readMessages([{ remoteJid: jid, id: messageId }]);
        } catch (error) {
            // Silent fail for read errors
        }
    }

    async handleReceiptUpdate(updates) {
        // Handle message receipts
        for (const update of updates) {
            // Implement receipt tracking here
        }
    }

    async handleChatsUpsert(chats) {
        // Handle new chats
    }

    async handleChatsUpdate(updates) {
        // Handle chat updates
    }

    async handleContactsUpdate(updates) {
        // Handle contact updates
    }

    // Utility methods
    async reply(jid, text, quotedMsg) {
        return this.bot.sendMessage(jid, { text }, { quoted: quotedMsg });
    }

    async sendTyping(jid, duration = 1000) {
        try {
            await this.bot.sendPresenceUpdate('composing', jid);
            setTimeout(async () => {
                await this.bot.sendPresenceUpdate('paused', jid);
            }, duration);
        } catch (error) {
            // Silent fail for typing errors
        }
    }

    async sendRecording(jid, duration = 1000) {
        try {
            await this.bot.sendPresenceUpdate('recording', jid);
            setTimeout(async () => {
                await this.bot.sendPresenceUpdate('paused', jid);
            }, duration);
        } catch (error) {
            // Silent fail for recording errors
        }
    }

    async sendReaction(jid, msgKey, emoji) {
        try {
            await this.bot.sendMessage(jid, {
                react: {
                    text: emoji,
                    key: msgKey
                }
            });
        } catch (error) {
            // Silent fail for reaction errors
        }
    }

    extractMentions(text) {
        const mentionRegex = /@(\d+)/g;
        const mentions = [];
        let match;
        
        while ((match = mentionRegex.exec(text)) !== null) {
            mentions.push(match[1] + '@s.whatsapp.net');
        }
        
        return mentions;
    }

    formatMentionText(text, mentions) {
        return {
            text: text,
            mentions: mentions
        };
    }
}

module.exports = MessageHandler;
