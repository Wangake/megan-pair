const fs = require('fs-extra');
const path = require('path');

class AdvancedTracker {
    constructor() {
        this.dataDir = path.join(__dirname, '../../database');
        this.trackerFile = path.join(this.dataDir, 'tracker.json');
        this.settingsFile = path.join(__dirname, '../../settings.js');
        
        this.data = {
            messages: {},
            edits: {},
            deletes: {},
            stats: {
                totalMessages: 0,
                totalEdits: 0,
                totalDeletes: 0,
                startTime: Date.now()
            },
            settings: {}
        };
        
        this.messageCache = new Map(); // For real-time tracking
        this.editQueue = new Map(); // To prevent delete/edit confusion
        this.init();
    }
    
    async init() {
        try {
            await fs.ensureDir(this.dataDir);
            
            if (await fs.pathExists(this.trackerFile)) {
                const saved = await fs.readJson(this.trackerFile);
                this.data = { ...this.data, ...saved };
            }
            
            // Load settings
            if (await fs.pathExists(this.settingsFile)) {
                this.data.settings = require(this.settingsFile);
            }
            
            console.log('🔍 Advanced Tracker Initialized');
        } catch (error) {
            console.error('❌ Tracker init error:', error);
        }
    }
    
    async save() {
        try {
            await fs.writeJson(this.trackerFile, this.data, { spaces: 2 });
        } catch (error) {
            console.error('❌ Tracker save error:', error);
        }
    }
    
    // ============ SMART MESSAGE TRACKING ============
    trackMessage(msg) {
        try {
            if (!msg.key || !msg.message) return null;
            
            const msgId = msg.key.id;
            const from = msg.key.remoteJid;
            const sender = msg.key.participant || from;
            const isGroup = from.endsWith('@g.us');
            
            // Extract message text
            let text = '';
            if (msg.message.conversation) text = msg.message.conversation;
            if (msg.message.extendedTextMessage?.text) text = msg.message.extendedTextMessage.text;
            if (msg.message.imageMessage?.caption) text = msg.message.imageMessage.caption;
            if (msg.message.videoMessage?.caption) text = msg.message.videoMessage.caption;
            
            const messageData = {
                id: msgId,
                from,
                sender,
                text: text || '[Media]',
                isGroup,
                timestamp: Date.now(),
                key: msg.key,
                hasMedia: this.isMediaMessage(msg.message)
            };
            
            // Store in cache
            this.messageCache.set(msgId, messageData);
            
            // Store in database
            this.data.messages[msgId] = messageData;
            this.data.stats.totalMessages++;
            
            // Clean old cache entries (keep last 1000)
            if (this.messageCache.size > 1000) {
                const oldestKey = this.messageCache.keys().next().value;
                this.messageCache.delete(oldestKey);
            }
            
            console.log(`📨 Tracked: ${msgId.substring(0, 8)}`);
            return messageData;
            
        } catch (error) {
            console.error('❌ Track message error:', error);
            return null;
        }
    }
    
    // ============ ACCURATE EDIT DETECTION ============
    trackEdit(update, sock) {
        try {
            const { key, update: updateData } = update;
            if (!key || !updateData || !updateData.message) return null;
            
            const msgId = key.id;
            const cached = this.messageCache.get(msgId);
            
            if (!cached) return null;
            
            // Extract new text
            let newText = '';
            if (updateData.message.conversation) newText = updateData.message.conversation;
            if (updateData.message.extendedTextMessage?.text) newText = updateData.message.extendedTextMessage.text;
            if (updateData.message.imageMessage?.caption) newText = updateData.message.imageMessage.caption;
            
            const oldText = cached.text || '[Media]';
            
            // Check if text actually changed (not just whitespace)
            if (newText.trim() === oldText.trim()) return null;
            
            // Check if this might be a delete (empty text after having text)
            if (oldText !== '[Media]' && (!newText || newText.trim() === '')) {
                console.log(`⚠️ Possible delete disguised as edit: ${msgId.substring(0, 8)}`);
                // Don't track as edit - wait for delete event
                return null;
            }
            
            // Create edit record
            const editRecord = {
                id: `${msgId}_${Date.now()}`,
                messageId: msgId,
                oldText,
                newText,
                editor: key.participant || cached.sender,
                timestamp: Date.now(),
                from: cached.from,
                isGroup: cached.isGroup
            };
            
            // Store edit
            this.data.edits[editRecord.id] = editRecord;
            this.data.stats.totalEdits++;
            
            // Update cached message
            cached.text = newText;
            cached.edited = true;
            cached.editTimestamp = Date.now();
            this.messageCache.set(msgId, cached);
            this.data.messages[msgId] = cached;
            
            console.log(`✏️  Edit detected: ${msgId.substring(0, 8)}`);
            
            // Send alert if enabled
            if (this.data.settings?.ANTI_DELETE && this.data.settings?.ALERT_OWNER) {
                this.sendEditAlert(editRecord, cached, sock);
            }
            
            this.save();
            return editRecord;
            
        } catch (error) {
            console.error('❌ Track edit error:', error);
            return null;
        }
    }
    
    // ============ ACCURATE DELETE DETECTION ============
    trackDelete(deleteData, sock) {
        try {
            const { keys } = deleteData;
            const results = [];
            
            for (const key of keys) {
                const msgId = key.id;
                const cached = this.messageCache.get(msgId);
                
                if (!cached) {
                    console.log(`🗑️  Uncached delete: ${msgId.substring(0, 8)}`);
                    continue;
                }
                
                // Create delete record
                const deleteRecord = {
                    id: `${msgId}_delete_${Date.now()}`,
                    messageId: msgId,
                    text: cached.text,
                    sender: cached.sender,
                    deleter: key.participant || cached.sender,
                    from: cached.from,
                    isGroup: cached.isGroup,
                    timestamp: Date.now(),
                    wasEdited: !!cached.edited
                };
                
                // Store delete
                this.data.deletes[deleteRecord.id] = deleteRecord;
                this.data.stats.totalDeletes++;
                
                // Remove from cache
                this.messageCache.delete(msgId);
                delete this.data.messages[msgId];
                
                console.log(`🗑️  Delete detected: ${msgId.substring(0, 8)}`);
                
                // Send alert if enabled
                if (this.data.settings?.ANTI_DELETE && this.data.settings?.ALERT_OWNER) {
                    this.sendDeleteAlert(deleteRecord, cached, sock);
                }
                
                results.push(deleteRecord);
            }
            
            this.save();
            return results;
            
        } catch (error) {
            console.error('❌ Track delete error:', error);
            return [];
        }
    }
    
    // ============ COOL ALERT MESSAGES ============
    async sendEditAlert(editRecord, originalMsg, sock) {
        try {
            if (!sock || !sock.sendMessage) return;
            
            const editor = editRecord.editor.split('@')[0];
            const sender = originalMsg.sender.split('@')[0];
            
            // Cool fonts/emojis for edit alerts
            const editEmojis = ['👁️', '🔍', '🕵️', '✏️', '📝', '📋', '📜'];
            const editTitles = [
                '𝐌𝐄𝐆𝐀𝐍 𝐃𝐄𝐓𝐄𝐂𝐓 𝐄𝐃𝐈𝐓!',
                '𝐒𝐍𝐄𝐀𝐊𝐘 𝐄𝐃𝐈𝐓 𝐀𝐋𝐄𝐑𝐓!',
                '𝐒𝐓𝐄𝐀𝐋𝐓𝐇 𝐄𝐃𝐈𝐓 𝐃𝐄𝐓𝐄𝐂𝐓𝐄𝐃!',
                '𝐆𝐇𝐎𝐒𝐓 𝐄𝐃𝐈𝐓 𝐒𝐏𝐎𝐓𝐓𝐄𝐃!'
            ];
            
            const emoji = editEmojis[Math.floor(Math.random() * editEmojis.length)];
            const title = editTitles[Math.floor(Math.random() * editTitles.length)];
            
            let location = '𝐏𝐫𝐢𝐯𝐚𝐭𝐞 𝐂𝐡𝐚𝐭';
            if (originalMsg.isGroup) {
                try {
                    const metadata = await sock.groupMetadata(originalMsg.from);
                    location = `𝐆𝐫𝐨𝐮𝐩: ${metadata.subject}`;
                } catch {
                    location = '𝐆𝐫𝐨𝐮𝐩 𝐂𝐡𝐚𝐭';
                }
            }
            
            const alertMsg = `${emoji} *${title}* ${emoji}\n\n` +
                           `👤 *𝐄𝐝𝐢𝐭𝐨𝐫:* ${editor}\n` +
                           `👤 *𝐎𝐫𝐢𝐠𝐢𝐧𝐚𝐥 𝐒𝐞𝐧𝐝𝐞𝐫:* ${sender}\n` +
                           `📍 *𝐋𝐨𝐜𝐚𝐭𝐢𝐨𝐧:* ${location}\n` +
                           `🆔 *𝐌𝐞𝐬𝐬𝐚𝐠𝐞 𝐈𝐃:* ${editRecord.messageId.substring(0, 8)}...\n` +
                           `⏰ *𝐓𝐢𝐦𝐞:* ${new Date().toLocaleTimeString()}\n\n` +
                           `📜 *𝐎𝐑𝐈𝐆𝐈𝐍𝐀𝐋 𝐓𝐄𝐗𝐓:*\n${editRecord.oldText}\n\n` +
                           `📝 *𝐄𝐃𝐈𝐓𝐄𝐃 𝐓𝐎:*\n${editRecord.newText}\n\n` +
                           `🔍 *𝐌𝐄𝐆𝐀𝐍 𝐓𝐑𝐀𝐂𝐊𝐄𝐑 𝐀𝐂𝐓𝐈𝐕𝐄*\n` +
                           `📊 *𝐓𝐨𝐭𝐚𝐥 𝐞𝐝𝐢𝐭𝐬 𝐭𝐫𝐚𝐜𝐤𝐞𝐝:* ${this.data.stats.totalEdits}`;
            
            const ownerJid = `${this.data.settings?.OWNER_PHONE}@s.whatsapp.net`;
            await sock.sendMessage(ownerJid, { text: alertMsg });
            
            console.log(`📤 Edit alert sent`);
            
        } catch (error) {
            console.error('❌ Send edit alert error:', error);
        }
    }
    
    async sendDeleteAlert(deleteRecord, originalMsg, sock) {
        try {
            if (!sock || !sock.sendMessage) return;
            
            const deleter = deleteRecord.deleter.split('@')[0];
            const sender = originalMsg.sender.split('@')[0];
            
            // Cool fonts/emojis for delete alerts
            const deleteEmojis = ['🚨', '⚠️', '🔔', '🎯', '🔥', '💥', '✨'];
            const deleteTitles = [
                '𝐌𝐄𝐆𝐀𝐍 𝐃𝐄𝐓𝐄𝐂𝐓 𝐃𝐄𝐋𝐄𝐓𝐄!',
                '𝐌𝐄𝐒𝐒𝐀𝐆𝐄 𝐕𝐀𝐍𝐈𝐒𝐇𝐄𝐃!',
                '𝐆𝐇𝐎𝐒𝐓 𝐃𝐄𝐋𝐄𝐓𝐄 𝐀𝐋𝐄𝐑𝐓!',
                '𝐒𝐓𝐄𝐀𝐋𝐓𝐇 𝐃𝐄𝐋𝐄𝐓𝐄 𝐃𝐄𝐓𝐄𝐂𝐓𝐄𝐃!'
            ];
            
            const emoji = deleteEmojis[Math.floor(Math.random() * deleteEmojis.length)];
            const title = deleteTitles[Math.floor(Math.random() * deleteTitles.length)];
            
            let location = '𝐏𝐫𝐢𝐯𝐚𝐭𝐞 𝐂𝐡𝐚𝐭';
            if (originalMsg.isGroup) {
                try {
                    const metadata = await sock.groupMetadata(originalMsg.from);
                    location = `𝐆𝐫𝐨𝐮𝐩: ${metadata.subject}`;
                } catch {
                    location = '𝐆𝐫𝐨𝐮𝐩 𝐂𝐡𝐚𝐭';
                }
            }
            
            const alertMsg = `${emoji} *${title}* ${emoji}\n\n` +
                           `👤 *𝐃𝐞𝐥𝐞𝐭𝐞𝐫:* ${deleter}\n` +
                           `👤 *𝐎𝐫𝐢𝐠𝐢𝐧𝐚𝐥 𝐒𝐞𝐧𝐝𝐞𝐫:* ${sender}\n` +
                           `📍 *𝐋𝐨𝐜𝐚𝐭𝐢𝐨𝐧:* ${location}\n` +
                           `🆔 *𝐌𝐞𝐬𝐬𝐚𝐠𝐞 𝐈𝐃:* ${deleteRecord.messageId.substring(0, 8)}...\n` +
                           `⏰ *𝐓𝐢𝐦𝐞:* ${new Date().toLocaleTimeString()}\n` +
                           `📅 *𝐃𝐚𝐭𝐞:* ${new Date().toLocaleDateString()}\n\n` +
                           `📜 *𝐃𝐄𝐋𝐄𝐓𝐄𝐃 𝐌𝐄𝐒𝐒𝐀𝐆𝐄:*\n${deleteRecord.text}\n\n` +
                           `🔍 *𝐌𝐄𝐆𝐀𝐍 𝐓𝐑𝐀𝐂𝐊𝐄𝐑 𝐀𝐂𝐓𝐈𝐕𝐄*\n` +
                           `📊 *𝐓𝐨𝐭𝐚𝐥 𝐝𝐞𝐥𝐞𝐭𝐞𝐬 𝐭𝐫𝐚𝐜𝐤𝐞𝐝:* ${this.data.stats.totalDeletes}`;
            
            const ownerJid = `${this.data.settings?.OWNER_PHONE}@s.whatsapp.net`;
            await sock.sendMessage(ownerJid, { text: alertMsg });
            
            console.log(`📤 Delete alert sent`);
            
        } catch (error) {
            console.error('❌ Send delete alert error:', error);
        }
    }
    
    // ============ HELPER METHODS ============
    isMediaMessage(message) {
        return message.imageMessage || message.videoMessage || 
               message.audioMessage || message.documentMessage || 
               message.stickerMessage;
    }
    
    getStats() {
        const uptime = Date.now() - this.data.stats.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        
        return {
            ...this.data.stats,
            uptime: `${hours}h ${minutes}m`,
            cacheSize: this.messageCache.size,
            messagesStored: Object.keys(this.data.messages).length,
            editsStored: Object.keys(this.data.edits).length,
            deletesStored: Object.keys(this.data.deletes).length
        };
    }
    
    clearCache() {
        const size = this.messageCache.size;
        this.messageCache.clear();
        return size;
    }
    
    // ============ SETTINGS MANAGEMENT ============
    updateSetting(key, value) {
        if (!this.data.settings) this.data.settings = {};
        this.data.settings[key] = value;
        this.save();
        return true;
    }
    
    getSetting(key, defaultValue = null) {
        return this.data.settings[key] !== undefined ? 
               this.data.settings[key] : defaultValue;
    }
    
    // ============ BOT INTEGRATION ============
    integrateWithBot(bot) {
        console.log('🔍 Advanced Tracker integrated with bot');
        return this;
    }
}

module.exports = new AdvancedTracker();
