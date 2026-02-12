const fs = require('fs-extra');
const path = require('path');
const NodeCache = require('node-cache');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class WhatsAppTracker {
    constructor() {
        // Initialize caches with different TTLs
        this.mediaCache = new NodeCache({ 
            stdTTL: 300, // 5 minutes for videos (300 seconds)
            checkperiod: 60,
            deleteOnExpire: true
        });
        
        this.messageCache = new NodeCache({
            stdTTL: 600, // 10 minutes for messages
            checkperiod: 60,
            deleteOnExpire: true
        });
        
        this.imageCache = new NodeCache({
            stdTTL: 600, // 10 minutes for images
            checkperiod: 60,
            deleteOnExpire: true
        });
        
        this.audioCache = new NodeCache({
            stdTTL: 600, // 10 minutes for audio
            checkperiod: 60,
            deleteOnExpire: true
        });
        
        // Database directories
        this.dbDir = './tracker_db';
        this.mediaDir = path.join(this.dbDir, 'media');
        this.logsDir = path.join(this.dbDir, 'logs');
        
        this.ensureDirs();
        
        // Statistics
        this.stats = {
            totalMessages: 0,
            totalMedia: 0,
            totalVideos: 0,
            totalImages: 0,
            totalAudio: 0,
            startTime: Date.now()
        };
        
        // Auto-cleanup interval (every 30 seconds)
        this.cleanupInterval = setInterval(() => this.cleanupExpired(), 30000);
        
        console.log('📊 WhatsApp Tracker initialized');
    }
    
    ensureDirs() {
        // Create all necessary directories
        const dirs = [this.dbDir, this.mediaDir, this.logsDir];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Create subdirectories for media types
        const mediaSubdirs = ['videos', 'images', 'audio', 'documents'];
        mediaSubdirs.forEach(subdir => {
            const dirPath = path.join(this.mediaDir, subdir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
    }
    
    // Main tracking method
    async trackMessage(m, sock) {
        try {
            if (!m.message) return;
            
            const key = m.key;
            const messageId = key.id;
            const timestamp = Date.now();
            const isGroup = key.remoteJid.endsWith('@g.us');
            const sender = key.fromMe ? 'ME' : (key.participant || key.remoteJid);
            
            // Skip status updates
            if (key.remoteJid === 'status@broadcast') {
                console.log('⚠️ Skipping status update (not supported)');
                return;
            }
            
            // Get message type
            const messageType = Object.keys(m.message)[0];
            const messageContent = m.message[messageType];
            
            // Create message object
            const messageObj = {
                id: messageId,
                jid: key.remoteJid,
                sender: sender,
                type: messageType,
                timestamp: timestamp,
                isGroup: isGroup,
                fromMe: key.fromMe,
                content: this.extractMessageContent(messageType, messageContent),
                raw: m // Store raw message for debugging
            };
            
            // Store in message cache (10 minutes)
            this.messageCache.set(`msg_${messageId}`, messageObj);
            
            // Log to file
            await this.logToFile('messages', messageObj);
            
            // Update stats
            this.stats.totalMessages++;
            
            console.log(`📨 Tracked ${messageType} from ${sender.substring(0, 20)}...`);
            
            // Handle media if present
            if (this.isMediaMessage(messageType)) {
                await this.trackMedia(messageId, messageType, messageContent, sock, key);
            }
            
            // Handle broadcast lists if it's a broadcast
            if (key.remoteJid.endsWith('@broadcast') && !key.fromMe) {
                await this.trackBroadcast(key.remoteJid, sock);
            }
            
            // Handle reactions
            if (messageType === 'reactionMessage') {
                await this.trackReaction(messageContent, key);
            }
            
            // Handle group updates
            if (messageType === 'protocolMessage') {
                await this.trackProtocolMessage(messageContent, key);
            }
            
        } catch (error) {
            console.error('❌ Error tracking message:', error.message);
            await this.logError('trackMessage', error);
        }
    }
    
    // Track media files
    async trackMedia(messageId, messageType, content, sock, key) {
        try {
            // Check file size (skip if > 20MB)
            const fileSize = parseInt(content.fileLength) || 0;
            if (fileSize > 20 * 1024 * 1024) { // 20MB limit
                console.log(`⚠️ Skipping media >20MB: ${fileSize} bytes`);
                return;
            }
            
            // Determine media type and TTL
            let cacheInstance, mediaType, ttl, subdir;
            
            if (messageType === 'videoMessage') {
                cacheInstance = this.mediaCache;
                mediaType = 'video';
                ttl = 300; // 5 minutes
                subdir = 'videos';
                this.stats.totalVideos++;
            } else if (messageType === 'imageMessage') {
                cacheInstance = this.imageCache;
                mediaType = 'image';
                ttl = 600; // 10 minutes
                subdir = 'images';
                this.stats.totalImages++;
            } else if (messageType === 'audioMessage') {
                cacheInstance = this.audioCache;
                mediaType = 'audio';
                ttl = 600; // 10 minutes
                subdir = 'audio';
                this.stats.totalAudio++;
            } else if (messageType === 'documentMessage') {
                cacheInstance = this.mediaCache;
                mediaType = 'document';
                ttl = 300; // 5 minutes
                subdir = 'documents';
            } else if (messageType === 'stickerMessage') {
                cacheInstance = this.imageCache;
                mediaType = 'sticker';
                ttl = 600; // 10 minutes
                subdir = 'images';
                this.stats.totalImages++;
            } else {
                return; // Unknown media type
            }
            
            this.stats.totalMedia++;
            
            // Create media info object
            const mediaInfo = {
                id: messageId,
                mediaType: mediaType,
                messageType: messageType,
                mimeType: content.mimetype || 'application/octet-stream',
                fileSize: fileSize,
                caption: content.caption || '',
                timestamp: Date.now(),
                jid: key.remoteJid,
                sender: key.fromMe ? 'ME' : (key.participant || key.remoteJid),
                isGroup: key.remoteJid.endsWith('@g.us'),
                url: content.url || '',
                directPath: content.directPath || '',
                mediaKey: content.mediaKey || ''
            };
            
            // Store in appropriate cache
            cacheInstance.set(`media_${messageId}`, mediaInfo, ttl);
            
            // Log to file
            await this.logToFile('media', mediaInfo);
            
            console.log(`📹 Tracked ${mediaType} (${this.formatBytes(fileSize)})`);
            
            // Auto-download if enabled (under 5MB)
            if (fileSize > 0 && fileSize < 5 * 1024 * 1024) {
                await this.downloadMedia(messageId, mediaInfo, sock, subdir);
            }
            
        } catch (error) {
            console.error('❌ Error tracking media:', error.message);
            await this.logError('trackMedia', error);
        }
    }
    
    // Download media file
    async downloadMedia(messageId, mediaInfo, sock, subdir) {
        try {
            if (!sock || !sock.downloadAndSaveMediaMessage) {
                console.log('⚠️ Download function not available');
                return;
            }
            
            const filename = `${messageId}_${Date.now()}`;
            const fileExt = this.getFileExtension(mediaInfo.mimeType);
            const filePath = path.join(this.mediaDir, subdir, `${filename}.${fileExt}`);
            
            // Get the message object
            const msgObj = {
                key: { id: messageId },
                message: { [mediaInfo.messageType]: mediaInfo }
            };
            
            // Download using baileys function
            const downloadedPath = await sock.downloadAndSaveMediaMessage(
                msgObj,
                filePath,
                { },
                { 
                    reuploadRequest: sock.updateMediaMessage,
                    logger: console
                }
            );
            
            if (downloadedPath && fs.existsSync(downloadedPath)) {
                // Update media info with download path
                mediaInfo.downloaded = true;
                mediaInfo.localPath = downloadedPath;
                mediaInfo.downloadTime = Date.now();
                
                console.log(`✅ Downloaded ${mediaInfo.mediaType} to: ${downloadedPath}`);
                
                // Update cache with download info
                if (mediaInfo.mediaType === 'video') {
                    this.mediaCache.set(`media_${messageId}`, mediaInfo);
                } else if (mediaInfo.mediaType === 'image') {
                    this.imageCache.set(`media_${messageId}`, mediaInfo);
                } else if (mediaInfo.mediaType === 'audio') {
                    this.audioCache.set(`media_${messageId}`, mediaInfo);
                }
                
                // Log download
                await this.logToFile('downloads', {
                    messageId: messageId,
                    mediaType: mediaInfo.mediaType,
                    fileSize: mediaInfo.fileSize,
                    downloadPath: downloadedPath,
                    downloadTime: Date.now()
                });
            }
            
        } catch (error) {
            console.error('❌ Error downloading media:', error.message);
            // Don't log download errors to avoid spam
        }
    }
    
    // Track broadcast lists
    async trackBroadcast(broadcastJid, sock) {
        try {
            if (!sock || !sock.getBroadcastListInfo) return;
            
            const broadcastInfo = await sock.getBroadcastListInfo(broadcastJid);
            
            if (broadcastInfo) {
                const broadcastData = {
                    jid: broadcastJid,
                    name: broadcastInfo.name || 'Unknown',
                    recipients: broadcastInfo.recipients || [],
                    timestamp: Date.now()
                };
                
                // Store in cache (1 hour)
                this.messageCache.set(`broadcast_${broadcastJid}`, broadcastData, 3600);
                
                // Log to file
                await this.logToFile('broadcasts', broadcastData);
                
                console.log(`📢 Tracked broadcast: ${broadcastInfo.name}`);
            }
        } catch (error) {
            console.error('❌ Error tracking broadcast:', error.message);
        }
    }
    
    // Track reactions
    async trackReaction(reactionContent, key) {
        try {
            const reactionData = {
                messageId: reactionContent.key?.id,
                reaction: reactionContent.text,
                sender: key.fromMe ? 'ME' : (key.participant || key.remoteJid),
                timestamp: Date.now(),
                jid: key.remoteJid
            };
            
            // Store in cache (1 hour)
            this.messageCache.set(`reaction_${reactionData.messageId}_${Date.now()}`, reactionData, 3600);
            
            // Log to file
            await this.logToFile('reactions', reactionData);
            
            console.log(`🎯 Tracked reaction: ${reactionData.reaction}`);
            
        } catch (error) {
            console.error('❌ Error tracking reaction:', error.message);
        }
    }
    
    // Track protocol messages (edits, deletes, etc.)
    async trackProtocolMessage(protocolContent, key) {
        try {
            const protocolData = {
                type: protocolContent.type || 0,
                key: protocolContent.key,
                timestamp: Date.now(),
                jid: key.remoteJid,
                sender: key.fromMe ? 'ME' : (key.participant || key.remoteJid)
            };
            
            // Store in cache (1 hour)
            this.messageCache.set(`protocol_${Date.now()}`, protocolData, 3600);
            
            // Log to file
            await this.logToFile('protocol', protocolData);
            
            console.log(`🔧 Tracked protocol message type: ${protocolData.type}`);
            
        } catch (error) {
            console.error('❌ Error tracking protocol message:', error.message);
        }
    }
    
    // Cleanup expired items
    async cleanupExpired() {
        try {
            const now = Date.now();
            const cleanupLog = {
                timestamp: now,
                videosCleaned: 0,
                imagesCleaned: 0,
                audioCleaned: 0,
                messagesCleaned: 0,
                filesDeleted: 0
            };
            
            // Clean media directories (remove files older than their TTL)
            const mediaTypes = ['videos', 'images', 'audio', 'documents'];
            
            for (const type of mediaTypes) {
                const typeDir = path.join(this.mediaDir, type);
                if (fs.existsSync(typeDir)) {
                    const files = fs.readdirSync(typeDir);
                    const ttl = type === 'videos' ? 300000 : 600000; // 5 or 10 minutes in milliseconds
                    
                    for (const file of files) {
                        const filePath = path.join(typeDir, file);
                        const stats = fs.statSync(filePath);
                        
                        if (now - stats.mtimeMs > ttl) {
                            fs.unlinkSync(filePath);
                            cleanupLog.filesDeleted++;
                            
                            if (type === 'videos') cleanupLog.videosCleaned++;
                            else if (type === 'images') cleanupLog.imagesCleaned++;
                            else if (type === 'audio') cleanupLog.audioCleaned++;
                        }
                    }
                }
            }
            
            // Log cleanup
            if (cleanupLog.filesDeleted > 0) {
                await this.logToFile('cleanup', cleanupLog);
                console.log(`🧹 Cleaned up ${cleanupLog.filesDeleted} old files`);
            }
            
        } catch (error) {
            console.error('❌ Error during cleanup:', error.message);
        }
    }
    
    // Get statistics
    getStats() {
        const uptime = Date.now() - this.stats.startTime;
        const hours = Math.floor(uptime / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        
        return {
            ...this.stats,
            uptime: `${hours}h ${minutes}m`,
            cacheStats: {
                videos: this.mediaCache.keys().length,
                images: this.imageCache.keys().length,
                audio: this.audioCache.keys().length,
                messages: this.messageCache.keys().length
            },
            diskUsage: this.getDiskUsage()
        };
    }
    
    // Get disk usage
    getDiskUsage() {
        try {
            let totalSize = 0;
            let fileCount = 0;
            
            const countSize = (dir) => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    fileCount += files.length;
                    
                    files.forEach(file => {
                        const filePath = path.join(dir, file);
                        const stats = fs.statSync(filePath);
                        totalSize += stats.size;
                    });
                }
            };
            
            // Count all media directories
            const mediaTypes = ['videos', 'images', 'audio', 'documents'];
            mediaTypes.forEach(type => {
                countSize(path.join(this.mediaDir, type));
            });
            
            // Count log files
            if (fs.existsSync(this.logsDir)) {
                const logFiles = fs.readdirSync(this.logsDir);
                fileCount += logFiles.length;
                
                logFiles.forEach(file => {
                    const filePath = path.join(this.logsDir, file);
                    const stats = fs.statSync(filePath);
                    totalSize += stats.size;
                });
            }
            
            return {
                totalSize: this.formatBytes(totalSize),
                fileCount: fileCount
            };
            
        } catch (error) {
            return { totalSize: '0B', fileCount: 0 };
        }
    }
    
    // Helper methods
    isMediaMessage(messageType) {
        const mediaTypes = [
            'imageMessage', 'videoMessage', 'audioMessage',
            'documentMessage', 'stickerMessage'
        ];
        return mediaTypes.includes(messageType);
    }
    
    extractMessageContent(messageType, content) {
        switch (messageType) {
            case 'conversation':
                return content || '';
            case 'extendedTextMessage':
                return content.text || '';
            case 'imageMessage':
                return content.caption || '[Image]';
            case 'videoMessage':
                return content.caption || '[Video]';
            case 'audioMessage':
                return '[Audio Message]';
            case 'documentMessage':
                return content.fileName || '[Document]';
            case 'stickerMessage':
                return '[Sticker]';
            default:
                return `[${messageType}]`;
        }
    }
    
    getFileExtension(mimeType) {
        const mimeMap = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'audio/ogg': 'ogg',
            'audio/mpeg': 'mp3',
            'application/pdf': 'pdf'
        };
        
        return mimeMap[mimeType] || 'bin';
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
    }
    
    // Logging methods
    async logToFile(category, data) {
        try {
            const logFile = path.join(this.logsDir, `${category}.json`);
            let logs = [];
            
            if (fs.existsSync(logFile)) {
                const content = await fs.readFile(logFile, 'utf8');
                try {
                    logs = JSON.parse(content);
                } catch (e) {
                    logs = [];
                }
            }
            
            logs.push({
                timestamp: Date.now(),
                data: data
            });
            
            // Keep only last 1000 entries per category
            if (logs.length > 1000) {
                logs = logs.slice(-1000);
            }
            
            await fs.writeFile(logFile, JSON.stringify(logs, null, 2));
            
        } catch (error) {
            console.error('❌ Error logging to file:', error.message);
        }
    }
    
    async logError(method, error) {
        try {
            const errorLog = {
                timestamp: Date.now(),
                method: method,
                error: error.message,
                stack: error.stack
            };
            
            await this.logToFile('errors', errorLog);
            
        } catch (logError) {
            console.error('❌ Failed to log error:', logError.message);
        }
    }
    
    // Integration with your bot
    integrateWithBot(sock) {
        // Track incoming messages
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const m of messages) {
                await this.trackMessage(m, sock);
            }
        });
        
        // Track message updates (edits, deletes)
        sock.ev.on('messages.update', async (messageUpdates) => {
            for (const update of messageUpdates) {
                await this.trackMessageUpdate(update, sock);
            }
        });
        
        // Track presence updates
        sock.ev.on('presence.update', async (update) => {
            await this.trackPresence(update, sock);
        });
        
        // Track group updates
        sock.ev.on('group-participants.update', async (event) => {
            await this.trackGroupUpdate(event, sock);
        });
        
        // Track connection events
        sock.ev.on('connection.update', (update) => {
            console.log(`🔗 Connection update: ${update.connection}`);
            this.logToFile('connection', update);
        });
        
        console.log('✅ Tracker integrated with bot');
    }
    
    async trackMessageUpdate(update, sock) {
        try {
            const updateData = {
                key: update.key,
                update: update.update,
                timestamp: Date.now()
            };
            
            await this.logToFile('message_updates', updateData);
            
        } catch (error) {
            console.error('❌ Error tracking message update:', error.message);
        }
    }
    
    async trackPresence(update, sock) {
        try {
            const presenceData = {
                id: update.id,
                presences: update.presences,
                timestamp: Date.now()
            };
            
            await this.logToFile('presence', presenceData);
            
        } catch (error) {
            console.error('❌ Error tracking presence:', error.message);
        }
    }
    
    async trackGroupUpdate(event, sock) {
        try {
            const groupData = {
                id: event.id,
                action: event.action,
                participants: event.participants,
                timestamp: Date.now()
            };
            
            await this.logToFile('group_updates', groupData);
            
            console.log(`👥 Group update: ${event.action} in ${event.id}`);
            
        } catch (error) {
            console.error('❌ Error tracking group update:', error.message);
        }
    }
    
    // Command to show tracker stats
    getTrackerCommand() {
        return {
            name: 'tracker',
            description: 'Show tracker statistics',
            aliases: ['stats', 'trackerstats'],
            category: 'Settings',
            async execute({ msg, from, bot }) {
                const stats = bot.tracker.getStats();
                
                const statText = `📊 *TRACKER STATISTICS*\n\n` +
                               `📨 *Messages:* ${stats.totalMessages}\n` +
                               `📹 *Media Total:* ${stats.totalMedia}\n` +
                               `🎥 Videos: ${stats.totalVideos}\n` +
                               `🖼️ Images: ${stats.totalImages}\n` +
                               `🎵 Audio: ${stats.totalAudio}\n\n` +
                               `💾 *Cache Status:*\n` +
                               `  Videos: ${stats.cacheStats.videos}\n` +
                               `  Images: ${stats.cacheStats.images}\n` +
                               `  Audio: ${stats.cacheStats.audio}\n` +
                               `  Messages: ${stats.cacheStats.messages}\n\n` +
                               `💿 *Disk Usage:*\n` +
                               `  Size: ${stats.diskUsage.totalSize}\n` +
                               `  Files: ${stats.diskUsage.fileCount}\n\n` +
                               `⏱️ *Uptime:* ${stats.uptime}\n\n` +
                               `_Auto-clean: Videos (5min), Images/Audio (10min)_`;
                
                await bot.sock.sendMessage(from, { text: statText });
            }
        };
    }
}

module.exports = WhatsAppTracker;
