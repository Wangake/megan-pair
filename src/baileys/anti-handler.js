class AntiHandler {
    constructor(bot, config, logger) {
        this.bot = bot;
        this.config = config;
        this.logger = logger;
        
        this.messageCache = new Map();
        this.spamTracker = new Map();
        this.linkTracker = new Map();
        this.callTracker = new Map();
        
        // Cleanup intervals
        this.setupCleanupIntervals();
    }

    setupCleanupIntervals() {
        // Clean old messages every hour
        setInterval(() => this.cleanupOldMessages(), 60 * 60 * 1000);
        
        // Clean spam tracker every 5 minutes
        setInterval(() => this.cleanupSpamTracker(), 5 * 60 * 1000);
    }

    cacheMessage(msg) {
        const msgId = msg.key.id;
        const now = Date.now();

        this.messageCache.set(msgId, {
            message: msg,
            timestamp: now,
            from: msg.key.remoteJid,
            sender: msg.key.participant || msg.key.remoteJid,
            text: this.bot.extractMessageText(msg.message)
        });

        // Auto-cleanup after 1 hour
        setTimeout(() => {
            this.messageCache.delete(msgId);
        }, 60 * 60 * 1000);
    }

    async handleMessageDelete(update) {
        const { keys } = update;

        for (const key of keys) {
            const msgId = key.id;
            const cached = this.messageCache.get(msgId);

            if (cached) {
                await this.processDeletedMessage(cached, key);
                this.messageCache.delete(msgId);
            }
        }
    }

    async processDeletedMessage(cached, deleteKey) {
        const { message, from, sender, text } = cached;
        const deleter = deleteKey.participant || sender;
        const isGroup = this.bot.isGroup(from);

        // Log deletion
        const deleterShort = deleter.split('@')[0];
        const senderShort = sender.split('@')[0];
        
        this.logger.log(
            `Message deleted by ${deleterShort}${isGroup ? ` in group` : ''}`,
            'warning',
            '🗑️'
        );

        // Save to database if available
        if (this.bot.db?.deletedMessages) {
            try {
                this.bot.db.deletedMessages.addDeletedMessage(msgId, {
                    text: text || '[Media]',
                    from: from,
                    sender: sender,
                    deleter: deleter,
                    deletedAt: Date.now(),
                    isGroup: isGroup
                });
            } catch (error) {
                this.logger.error(error, 'AntiHandler.saveDeletedMessage');
            }
        }

        // Notify owner or admins about deletion
        if (isGroup && this.config.antiDeleteNotify) {
            await this.notifyAboutDeletion(from, sender, deleter, text);
        }
    }

    async notifyAboutDeletion(groupJid, sender, deleter, text) {
        try {
            const isAdmin = await this.bot.groupHandler.isUserAdmin(groupJid, deleter);
            const isSelf = deleter === this.bot.user?.id;
            
            if (isAdmin && !isSelf) {
                // Admin deleted someone else's message
                const adminName = deleter.split('@')[0];
                const senderName = sender.split('@')[0];
                const shortText = text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '[Media]';
                
                const notification = `⚠️ *Message Deleted*\n\n` +
                                   `👤 Admin: @${adminName}\n` +
                                   `👤 Sender: @${senderName}\n` +
                                   `📝 Content: ${shortText}\n\n` +
                                   `🗑️ Admin deleted this message`;

                await this.bot.sendMessage(groupJid, {
                    text: notification,
                    mentions: [deleter, sender]
                });
            }
        } catch (error) {
            this.logger.error(error, 'AntiHandler.notifyAboutDeletion');
        }
    }

    async checkAntiSpam(sender, groupJid, msg) {
        const now = Date.now();
        const key = `${sender}-${groupJid}`;

        if (!this.spamTracker.has(key)) {
            this.spamTracker.set(key, []);
        }

        const timestamps = this.spamTracker.get(key);
        timestamps.push(now);

        // Keep only messages from last minute
        const oneMinuteAgo = now - 60000;
        const recentMessages = timestamps.filter(time => time > oneMinuteAgo);
        this.spamTracker.set(key, recentMessages);

        // Check spam threshold (10 messages per minute)
        if (recentMessages.length > 10) {
            await this.handleSpamDetected(sender, groupJid, msg);
            this.spamTracker.set(key, []); // Reset after handling
        }
    }

    async handleSpamDetected(sender, groupJid, msg) {
        try {
            const isAdmin = await this.bot.groupHandler.isUserAdmin(groupJid, sender);
            
            if (!isAdmin) {
                await this.bot.sendMessage(groupJid, {
                    text: `⚠️ @${sender.split('@')[0]} Please slow down!`,
                    mentions: [sender]
                }, { quoted: msg });

                // Warn user
                this.logger.log(`Spam detected from ${sender.split('@')[0]}`, 'warning', '🚫');
            }
        } catch (error) {
            this.logger.error(error, 'AntiHandler.handleSpamDetected');
        }
    }

    async checkAntiLink(message, jid, sender) {
        if (!this.config.antiLink) return false;

        const text = this.bot.extractMessageText(message);
        if (!text) return false;

        const linkPatterns = [
            /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
            /chat\.whatsapp\.com\/[a-zA-Z0-9]+/,
            /discord\.gg\/[a-zA-Z0-9]+/,
            /t\.me\/[a-zA-Z0-9]+/
        ];

        for (const pattern of linkPatterns) {
            if (pattern.test(text)) {
                await this.handleLinkDetected(jid, sender, text);
                return true;
            }
        }

        return false;
    }

    async handleLinkDetected(jid, sender, text) {
        try {
            const isGroup = this.bot.isGroup(jid);
            const isAdmin = isGroup ? await this.bot.groupHandler.isUserAdmin(jid, sender) : false;

            if (!isAdmin) {
                if (isGroup) {
                    await this.bot.sendMessage(jid, {
                        text: `⚠️ @${sender.split('@')[0]} Links are not allowed in this group!`,
                        mentions: [sender]
                    });

                    // Optional: Delete the message
                    // await this.bot.sendMessage(jid, {
                    //     delete: {
                    //         remoteJid: jid,
                    //         fromMe: false,
                    //         id: msg.key.id
                    //     }
                    // });
                } else {
                    await this.bot.sendMessage(jid, {
                        text: `⚠️ Please don't send links to me directly.`
                    });
                }

                this.logger.log(`Link detected from ${sender.split('@')[0]}`, 'warning', '🔗');
                return true;
            }
        } catch (error) {
            this.logger.error(error, 'AntiHandler.handleLinkDetected');
        }

        return false;
    }

    async checkAntiTagAdmin(message, jid, sender) {
        if (!this.config.antiTagAdmin) return false;

        const text = this.bot.extractMessageText(message);
        if (!text || !this.bot.isGroup(jid)) return false;

        // Check for @admin or @admins mentions
        if (text.toLowerCase().includes('@admin') || text.toLowerCase().includes('@admins')) {
            const isAdmin = await this.bot.groupHandler.isUserAdmin(jid, sender);
            
            if (!isAdmin) {
                await this.handleAdminTagDetected(jid, sender);
                return true;
            }
        }

        return false;
    }

    async handleAdminTagDetected(jid, sender) {
        try {
            await this.bot.sendMessage(jid, {
                text: `⚠️ @${sender.split('@')[0]} Please don't tag admins unnecessarily!`,
                mentions: [sender]
            });

            this.logger.log(`Admin tag detected from ${sender.split('@')[0]}`, 'warning', '🏷️');
        } catch (error) {
            this.logger.error(error, 'AntiHandler.handleAdminTagDetected');
        }
    }

    cleanupOldMessages() {
        const now = Date.now();
        const maxAge = 60 * 60 * 1000; // 1 hour

        for (const [msgId, data] of this.messageCache.entries()) {
            if (now - data.timestamp > maxAge) {
                this.messageCache.delete(msgId);
            }
        }
    }

    cleanupSpamTracker() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [key, timestamps] of this.spamTracker.entries()) {
            const recent = timestamps.filter(time => now - time < maxAge);
            if (recent.length === 0) {
                this.spamTracker.delete(key);
            } else {
                this.spamTracker.set(key, recent);
            }
        }
    }

    getStats() {
        return {
            cachedMessages: this.messageCache.size,
            spamTracked: this.spamTracker.size,
            linkDetections: this.linkTracker.size,
            callDetections: this.callTracker.size
        };
    }
}

module.exports = AntiHandler;
