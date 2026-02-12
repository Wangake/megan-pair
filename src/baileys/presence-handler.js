class PresenceHandler {
    constructor(bot, config, logger) {
        this.bot = bot;
        this.config = config;
        this.logger = logger;
        
        this.typingUsers = new Map();
        this.presenceCache = new Map();
        this.activeUsers = new Map();
        this.typingIntervals = new Map();
    }

    async handlePresenceUpdate(update) {
        try {
            const { id, presences } = update;
            
            if (!id || !presences) return;

            const now = Date.now();
            const groupJid = id;

            // Update presence cache
            if (!this.presenceCache.has(groupJid)) {
                this.presenceCache.set(groupJid, new Map());
            }

            const groupPresence = this.presenceCache.get(groupJid);

            for (const [userId, presence] of Object.entries(presences)) {
                this.updateUserPresence(groupJid, userId, presence, now);
            }

            // Clean old presence data periodically
            this.cleanupOldPresence(groupJid, now);

        } catch (error) {
            this.logger.error(error, 'PresenceHandler.handlePresenceUpdate');
        }
    }

    updateUserPresence(groupJid, userId, presence, timestamp) {
        if (!this.presenceCache.has(groupJid)) {
            this.presenceCache.set(groupJid, new Map());
        }

        const groupPresence = this.presenceCache.get(groupJid);
        
        groupPresence.set(userId, {
            lastKnownPresence: presence.lastKnownPresence,
            lastSeen: presence.lastSeen,
            lastUpdated: timestamp,
            platform: presence.platform
        });

        // Track typing users
        if (presence.lastKnownPresence === 'composing' || presence.lastKnownPresence === 'recording') {
            this.typingUsers.set(userId, timestamp);
            this.updateActiveUser(userId, timestamp);
        }
    }

    updateActiveUser(userId, timestamp) {
        this.activeUsers.set(userId, timestamp);
    }

    cleanupOldPresence(groupJid, currentTime) {
        if (!this.presenceCache.has(groupJid)) return;

        const groupPresence = this.presenceCache.get(groupJid);
        const maxAge = 5 * 60 * 1000; // 5 minutes

        for (const [userId, data] of groupPresence.entries()) {
            if (currentTime - data.lastUpdated > maxAge) {
                groupPresence.delete(userId);
            }
        }
    }

    async subscribeToGroupPresence(groupJid) {
        try {
            await this.bot.presenceSubscribe(groupJid);
            this.logger.log(`Subscribed to presence for ${groupJid.split('@')[0]}`, 'info', '👁️');
            return true;
        } catch (error) {
            this.logger.error(error, 'PresenceHandler.subscribeToGroupPresence');
            return false;
        }
    }

    async unsubscribeFromGroupPresence(groupJid) {
        try {
            // Note: Baileys doesn't have direct unsubscribe, but we can stop tracking
            this.presenceCache.delete(groupJid);
            this.logger.log(`Unsubscribed from presence for ${groupJid.split('@')[0]}`, 'info', '👁️');
            return true;
        } catch (error) {
            this.logger.error(error, 'PresenceHandler.unsubscribeFromGroupPresence');
            return false;
        }
    }

    async setBotPresence(presence, jid = null) {
        try {
            await this.bot.sendPresenceUpdate(presence, jid);
            this.logger.log(`Bot presence set to: ${presence}`, 'info', '👤');
            return true;
        } catch (error) {
            this.logger.error(error, 'PresenceHandler.setBotPresence');
            return false;
        }
    }

    async sendTypingIndicator(jid, duration = 2000) {
        try {
            await this.setBotPresence('composing', jid);
            
            // Clear any existing typing interval for this JID
            if (this.typingIntervals.has(jid)) {
                clearTimeout(this.typingIntervals.get(jid));
            }

            // Stop typing after duration
            const timeout = setTimeout(async () => {
                await this.setBotPresence('paused', jid);
                this.typingIntervals.delete(jid);
            }, duration);

            this.typingIntervals.set(jid, timeout);
            return true;
        } catch (error) {
            this.logger.error(error, 'PresenceHandler.sendTypingIndicator');
            return false;
        }
    }

    async sendRecordingIndicator(jid, duration = 2000) {
        try {
            await this.setBotPresence('recording', jid);
            
            // Clear any existing recording interval for this JID
            if (this.typingIntervals.has(jid)) {
                clearTimeout(this.typingIntervals.get(jid));
            }

            // Stop recording after duration
            const timeout = setTimeout(async () => {
                await this.setBotPresence('paused', jid);
                this.typingIntervals.delete(jid);
            }, duration);

            this.typingIntervals.set(jid, timeout);
            return true;
        } catch (error) {
            this.logger.error(error, 'PresenceHandler.sendRecordingIndicator');
            return false;
        }
    }

    async sendOnlinePresence(jid = null) {
        return this.setBotPresence('available', jid);
    }

    async sendOfflinePresence(jid = null) {
        return this.setBotPresence('unavailable', jid);
    }

    isUserTyping(userId) {
        const lastTyping = this.typingUsers.get(userId);
        if (!lastTyping) return false;

        const now = Date.now();
        return (now - lastTyping) < 10000; // Typing within last 10 seconds
    }

    isUserActive(userId) {
        const lastActive = this.activeUsers.get(userId);
        if (!lastActive) return false;

        const now = Date.now();
        return (now - lastActive) < 5 * 60 * 1000; // Active within last 5 minutes
    }

    getTypingUsers() {
        const now = Date.now();
        const typing = [];

        for (const [userId, timestamp] of this.typingUsers.entries()) {
            if (now - timestamp < 10000) { // Last 10 seconds
                typing.push(userId);
            }
        }

        return typing;
    }

    getActiveUsers() {
        const now = Date.now();
        const active = [];

        for (const [userId, timestamp] of this.activeUsers.entries()) {
            if (now - timestamp < 5 * 60 * 1000) { // Last 5 minutes
                active.push(userId);
            }
        }

        return active;
    }

    getUserPresence(groupJid, userId) {
        if (!this.presenceCache.has(groupJid)) return null;
        
        const groupPresence = this.presenceCache.get(groupJid);
        return groupPresence.get(userId) || null;
    }

    getGroupPresenceStats(groupJid) {
        if (!this.presenceCache.has(groupJid)) {
            return {
                total: 0,
                online: 0,
                typing: 0,
                active: 0
            };
        }

        const groupPresence = this.presenceCache.get(groupJid);
        const now = Date.now();
        
        let online = 0;
        let typing = 0;
        let active = 0;

        for (const [userId, data] of groupPresence.entries()) {
            if (now - data.lastUpdated < 2 * 60 * 1000) { // Last 2 minutes
                online++;
                
                if (this.isUserTyping(userId)) {
                    typing++;
                }
                
                if (this.isUserActive(userId)) {
                    active++;
                }
            }
        }

        return {
            total: groupPresence.size,
            online,
            typing,
            active
        };
    }

    cleanupAll() {
        // Clear all intervals
        for (const timeout of this.typingIntervals.values()) {
            clearTimeout(timeout);
        }
        
        this.typingIntervals.clear();
        this.logger.log('Presence handler cleaned up', 'info', '🧹');
    }
}

module.exports = PresenceHandler;
