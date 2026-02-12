const fs = require('fs-extra');
const path = require('path');
const NodeCache = require('node-cache');

class Database {
    constructor() {
        this.dbDir = './database';
        
        // Get owner from settings (try multiple paths)
        let ownerPhone = '254107655023';
        try {
            const settingsPath = path.join(process.cwd(), 'settings.js');
            if (fs.existsSync(settingsPath)) {
                const settings = require(settingsPath);
                ownerPhone = settings.OWNER_PHONE || ownerPhone;
            }
        } catch (error) {
            console.log('⚠️ Using default owner phone');
        }
        
        this.ownerJid = `${ownerPhone}@s.whatsapp.net`;
        this.botSock = null;
        
        // Simple cache for messages
        this.messageCache = new Map();
        
        // Clean old messages every hour
        setInterval(() => this.cleanupCache(), 3600000);
        
        console.log('📊 Database initialized for owner:', this.ownerJid);
    }
    
    // ==================== SIMPLE MESSAGE TRACKING ====================
    
    async trackMessage(m, sock) {
        try {
            if (!m.message || !m.key) return;
            
            const key = m.key;
            const messageId = key.id;
            
            // Skip status updates
            if (key.remoteJid === 'status@broadcast') return;
            
            // Extract message text
            const messageText = this.extractMessageText(m.message);
            
            // Only cache if it has text
            if (messageText && messageText.trim() !== '') {
                const messageData = {
                    id: messageId,
                    jid: key.remoteJid,
                    sender: key.participant || key.remoteJid,
                    text: messageText,
                    timestamp: Date.now(),
                    isGroup: key.remoteJid.endsWith('@g.us')
                };
                
                // Store in cache
                this.messageCache.set(messageId, messageData);
                
                // Log briefly
                if (messageText.length > 0) {
                    console.log(`💾 Cached: ${messageId.substring(0, 8)}`);
                }
            }
            
        } catch (error) {
            console.error('❌ Error tracking message:', error.message);
        }
    }
    
    // ==================== SIMPLE EDIT/DELETE DETECTION ====================
    
    async detectChange(update, sock, eventType = 'update') {
        try {
            const { key, update: updateData } = update;
            if (!key || !updateData) return;
            
            const messageId = key.id;
            const cachedMessage = this.messageCache.get(messageId);
            
            if (!cachedMessage) {
                console.log(`⚠️ ${eventType.toUpperCase()}: Message ${messageId.substring(0, 8)} not in cache`);
                return;
            }
            
            const newText = this.extractMessageText(updateData);
            const oldText = cachedMessage.text;
            
            // Skip if text is same
            if (newText === oldText) return;
            
            // Send alert based on what happened
            if (eventType === 'update') {
                await this.sendAlert(cachedMessage, newText, 'EDIT', sock);
                // Update cache with new text
                cachedMessage.text = newText;
                this.messageCache.set(messageId, cachedMessage);
            }
            
        } catch (error) {
            console.error(`❌ Error detecting ${eventType}:`, error.message);
        }
    }
    
    // ==================== SIMPLE ALERT ====================
    
    async sendAlert(message, newText, alertType, sock) {
        try {
            if (!sock || !sock.sendMessage) {
                console.log('⚠️ Cannot send alert: Socket not available');
                return;
            }
            
            const sender = this.formatJid(message.sender);
            const location = message.isGroup ? 'Group Chat' : 'Private Chat';
            
            let alertTitle = '🔄 MESSAGE CHANGED';
            let alertDetails = '';
            
            if (alertType === 'EDIT') {
                alertTitle = '✏️ EDITED MESSAGE';
                alertDetails = `📜 Original: ${message.text}\n📝 Edited to: ${newText}`;
            }
            
            // Simple, clean alert format
            const alertMessage = `${alertTitle}\n\n` +
                               `👤 From: ${sender}\n` +
                               `📍 Location: ${location}\n` +
                               `🕐 Time: ${new Date().toLocaleTimeString()}\n\n` +
                               `${alertDetails}\n\n` +
                               `⚡ Powered by MEGAN-MD`;
            
            // Send to owner
            await sock.sendMessage(this.ownerJid, { text: alertMessage });
            
            console.log(`📤 ${alertType} alert sent to owner`);
            
        } catch (error) {
            console.error('❌ Error sending alert:', error.message);
        }
    }
    
    // ==================== HELPER METHODS ====================
    
    extractMessageText(message) {
        if (!message) return '';
        
        if (message.conversation) return message.conversation;
        if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
        if (message.imageMessage?.caption) return message.imageMessage.caption;
        if (message.videoMessage?.caption) return message.videoMessage.caption;
        if (message.documentMessage?.caption) return message.documentMessage.caption;
        
        return '';
    }
    
    formatJid(jid) {
        if (!jid || typeof jid !== 'string') return 'Unknown';
        if (jid.includes('@s.whatsapp.net')) {
            return jid.split('@')[0];
        }
        return jid;
    }
    
    cleanupCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [messageId, data] of this.messageCache.entries()) {
            if (now - data.timestamp > 3600000) { // 1 hour
                this.messageCache.delete(messageId);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            console.log(`🧹 Cleaned ${cleaned} old messages from cache`);
        }
    }
    
    // ==================== INTEGRATION ====================
    
    integrateWithBot(bot) {
        this.botSock = bot.sock;
        console.log('✅ Database integrated with bot');
    }
}

// Export singleton instance
const db = new Database();
module.exports = db;
