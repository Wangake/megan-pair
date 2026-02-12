const axios = require('axios');
const moment = require('moment-timezone');
const { sizeFormatter } = require('human-readable');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Jimp = require('jimp');

class Utils {
    constructor(bot = null) {
        this.bot = bot;
        this.tmpDir = path.join(__dirname, '..', '..', 'tmp');
    }

    // Generate unique ID
    generateId(length = 10) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Get buffer from URL
    async getBuffer(url, options = {}) {
        try {
            const response = await axios({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Bot)',
                    ...options.headers
                },
                ...options
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get buffer: ${error.message}`);
        }
    }

    // Fetch JSON from URL
    async fetchJson(url, options = {}) {
        try {
            const response = await axios({
                method: 'GET',
                url,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (WhatsApp Bot)',
                    ...options.headers
                },
                ...options
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to fetch JSON: ${error.message}`);
        }
    }

    // Format file size
    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }

    // Format date
    formatDate(date = new Date(), format = 'DD/MM/YYYY HH:mm:ss') {
        return moment(date).format(format);
    }

    // Get current time
    getTime(timezone = 'Africa/Nairobi', format = 'HH:mm:ss') {
        return moment().tz(timezone).format(format);
    }

    // Sleep/delay
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Check if string is URL
    isUrl(str) {
        try {
            new URL(str);
            return true;
        } catch {
            return false;
        }
    }

    // Generate random filename
    randomFilename(ext = '.tmp') {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}${ext}`;
    }

    // Ensure temp directory exists
    async ensureTmpDir() {
        try {
            await fs.access(this.tmpDir);
        } catch {
            await fs.mkdir(this.tmpDir, { recursive: true });
        }
        return this.tmpDir;
    }

    // Parse mentions from text
    parseMentions(text) {
        const mentions = [];
        const regex = /@(\d{10,15})/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            mentions.push(match[1] + '@s.whatsapp.net');
        }
        return mentions;
    }

    // Get group admins
    getGroupAdmins(participants) {
        return participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id);
    }

    // Calculate uptime
    formatUptime(seconds) {
        const days = Math.floor(seconds / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
        
        return parts.join(' ');
    }

    // Resize image with Jimp (async/await version for Jimp 1.x)
    async resizeImage(buffer, width, height) {
        try {
            const image = await Jimp.read(buffer);
            image.resize(width, height);
            return await image.getBufferAsync(Jimp.MIME_PNG);
        } catch (error) {
            console.error('Jimp resize error:', error.message);
            throw new Error(`Image resize failed: ${error.message}`);
        }
    }

    // Convert image format with Jimp
    async convertImage(buffer, format = Jimp.MIME_PNG) {
        try {
            const image = await Jimp.read(buffer);
            return await image.getBufferAsync(format);
        } catch (error) {
            throw new Error(`Image conversion failed: ${error.message}`);
        }
    }

    // Get image dimensions
    async getImageSize(buffer) {
        try {
            const image = await Jimp.read(buffer);
            return {
                width: image.bitmap.width,
                height: image.bitmap.height,
                size: buffer.length
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Clean temporary files
    async cleanTmpFiles(maxAge = 3600000) {
        try {
            await this.ensureTmpDir();
            const files = await fs.readdir(this.tmpDir);
            const now = Date.now();
            
            for (const file of files) {
                const filePath = path.join(this.tmpDir, file);
                try {
                    const stats = await fs.stat(filePath);
                    if (now - stats.mtimeMs > maxAge) {
                        await fs.unlink(filePath);
                    }
                } catch (error) {
                    // Ignore errors
                }
            }
        } catch (error) {
            // Ignore cleanup errors
        }
    }

    // Simple image manipulation - grayscale
    async grayscale(buffer) {
        try {
            const image = await Jimp.read(buffer);
            image.grayscale();
            return await image.getBufferAsync(Jimp.MIME_PNG);
        } catch (error) {
            throw new Error(`Grayscale failed: ${error.message}`);
        }
    }

    // Simple image manipulation - invert
    async invert(buffer) {
        try {
            const image = await Jimp.read(buffer);
            image.invert();
            return await image.getBufferAsync(Jimp.MIME_PNG);
        } catch (error) {
            throw new Error(`Invert failed: ${error.message}`);
        }
    }
}

module.exports = Utils;
