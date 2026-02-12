const fs = require('fs-extra');
const path = require('path');

class SimpleDatabase {
    constructor() {
        this.dataDir = path.join(__dirname, '../../database');
        this.dataFile = path.join(this.dataDir, 'data.json');
        this.statsFile = path.join(this.dataDir, 'stats.json');
        this.deletedFile = path.join(this.dataDir, 'deleted.json');
        
        this.data = {
            users: {},
            messages: {},
            groups: {},
            settings: {}
        };
        
        this.stats = {
            totalMessages: 0,
            totalMedia: 0,
            totalEdits: 0,
            totalDeletes: 0,
            totalUsers: 0,
            totalGroups: 0,
            uptime: 0,
            lastActivity: Date.now()
        };
        
        this.deletedMessages = [];
        
        this.init();
    }
    
    async init() {
        try {
            await fs.ensureDir(this.dataDir);
            
            // Load existing data
            if (await fs.pathExists(this.dataFile)) {
                const savedData = await fs.readJson(this.dataFile);
                this.data = { ...this.data, ...savedData };
            }
            
            if (await fs.pathExists(this.statsFile)) {
                const savedStats = await fs.readJson(this.statsFile);
                this.stats = { ...this.stats, ...savedStats };
            }
            
            if (await fs.pathExists(this.deletedFile)) {
                this.deletedMessages = await fs.readJson(this.deletedFile);
            }
            
            console.log('✅ Simple database initialized');
        } catch (error) {
            console.error('❌ Database initialization error:', error);
        }
    }
    
    async save() {
        try {
            await fs.writeJson(this.dataFile, this.data, { spaces: 2 });
            await fs.writeJson(this.statsFile, this.stats, { spaces: 2 });
            await fs.writeJson(this.deletedFile, this.deletedMessages, { spaces: 2 });
        } catch (error) {
            console.error('❌ Database save error:', error);
        }
    }
    
    // Message tracking
    async trackMessage(msg, sock) {
        try {
            const msgId = msg.key?.id;
            if (!msgId) return;
            
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            
            // Extract message text
            let text = '';
            if (msg.message?.conversation) text = msg.message.conversation;
            if (msg.message?.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            if (msg.message?.imageMessage?.caption) text = msg.message.imageMessage.caption;
            if (msg.message?.videoMessage?.caption) text = msg.message.videoMessage.caption;
            
            // Store message
            this.data.messages[msgId] = {
                id: msgId,
                from,
                sender,
                text: text || '[Media]',
                isGroup,
                timestamp: Date.now(),
                hasMedia: !!(msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.audioMessage || msg.message?.documentMessage)
            };
            
            // Update stats
            this.stats.totalMessages++;
            if (this.data.messages[msgId].hasMedia) {
                this.stats.totalMedia++;
            }
            this.stats.lastActivity = Date.now();
            
            // Track user
            if (!this.data.users[sender]) {
                this.data.users[sender] = {
                    id: sender,
                    messageCount: 0,
                    firstSeen: Date.now(),
                    lastSeen: Date.now()
                };
                this.stats.totalUsers++;
            }
            this.data.users[sender].messageCount++;
            this.data.users[sender].lastSeen = Date.now();
            
            // Track group if applicable
            if (isGroup && !this.data.groups[from]) {
                this.data.groups[from] = {
                    id: from,
                    messageCount: 0,
                    firstSeen: Date.now(),
                    lastSeen: Date.now()
                };
                this.stats.totalGroups++;
            }
            if (isGroup) {
                this.data.groups[from].messageCount++;
                this.data.groups[from].lastSeen = Date.now();
            }
            
            // Auto-save every 100 messages
            if (this.stats.totalMessages % 100 === 0) {
                await this.save();
            }
            
            return true;
        } catch (error) {
            console.error('❌ Track message error:', error);
            return false;
        }
    }
    
    async trackMessageEdit(update, sock) {
        try {
            const msgId = update.key?.id;
            if (!msgId || !update.update?.message) return;
            
            const existing = this.data.messages[msgId];
            if (existing) {
                existing.edited = true;
                existing.editTimestamp = Date.now();
                this.stats.totalEdits++;
            }
            
            return true;
        } catch (error) {
            console.error('❌ Track edit error:', error);
            return false;
        }
    }
    
    async handleMessageDelete(deleteData, sock, type = 'user_deleted') {
        try {
            const { keys } = deleteData;
            
            for (const key of keys) {
                const msgId = key.id;
                const existing = this.data.messages[msgId];
                
                if (existing) {
                    // Move to deleted messages
                    this.deletedMessages.push({
                        ...existing,
                        deletedAt: Date.now(),
                        deleter: key.participant || existing.sender,
                        deleteType: type
                    });
                    
                    // Remove from active messages
                    delete this.data.messages[msgId];
                    
                    // Update stats
                    this.stats.totalDeletes++;
                    
                    console.log(`🗑️ Message ${msgId.substring(0, 8)} tracked as deleted`);
                }
            }
            
            // Save after tracking deletes
            await this.save();
            
            return true;
        } catch (error) {
            console.error('❌ Track delete error:', error);
            return false;
        }
    }
    
    async addDeletedMessage(messageId, data) {
        try {
            this.deletedMessages.push({
                messageId,
                ...data,
                trackedAt: Date.now()
            });
            
            // Keep only last 1000 deleted messages
            if (this.deletedMessages.length > 1000) {
                this.deletedMessages = this.deletedMessages.slice(-1000);
            }
            
            this.stats.totalDeletes++;
            await this.save();
            
            return true;
        } catch (error) {
            console.error('❌ Add deleted message error:', error);
            return false;
        }
    }
    
    async recoverDeletedMessage(messageId) {
        try {
            const deleted = this.deletedMessages.find(msg => msg.messageId === messageId);
            if (deleted) {
                return {
                    recovered: true,
                    message: deleted
                };
            }
            
            return { recovered: false };
        } catch (error) {
            console.error('❌ Recover message error:', error);
            return { recovered: false, error: error.message };
        }
    }
    
    getStats() {
        return {
            ...this.stats,
            uptime: Math.floor(process.uptime()),
            currentTime: new Date().toISOString(),
            databaseSize: {
                messages: Object.keys(this.data.messages).length,
                users: Object.keys(this.data.users).length,
                groups: Object.keys(this.data.groups).length,
                deleted: this.deletedMessages.length
            }
        };
    }
    
    integrateWithBot(bot) {
        console.log('✅ Database integrated with bot');
        return this;
    }
    
    async cleanup() {
        await this.save();
        console.log('✅ Database cleanup completed');
    }
}

module.exports = new SimpleDatabase();
