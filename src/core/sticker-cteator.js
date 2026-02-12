// src/core/sticker-creator.js - Jimp Only Version
// Works on ANY platform - no sharp, no canvas, no native dependencies
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const webp = require('node-webpmux');

class StickerCreator {
    constructor() {
        this.tmpDir = path.join(__dirname, '../../temp');
        this.ensureTmpDir();
    }

    ensureTmpDir() {
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }

    generateTempFile(extension = '.tmp') {
        return path.join(this.tmpDir, `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`);
    }

    // ============ CREATE STICKER FROM IMAGE ============
    // Uses Jimp only - works everywhere
    async createFromImage(buffer, options = {}) {
        const { quality = 80, pack = 'MEGAN MD', author = 'MEGAN-MD', circle = false } = options;
        
        try {
            // Read image with Jimp
            const image = await Jimp.read(buffer);
            
            // Resize to 512x512
            image.resize(512, 512);
            
            // Apply circle if requested
            if (circle) {
                image.circle();
            }
            
            // Get buffer as PNG
            const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
            
            // Convert PNG to WebP using Jimp's WebP support
            const webpImage = await Jimp.read(pngBuffer);
            const webpBuffer = await webpImage.getBufferAsync(Jimp.MIME_WEBP);
            
            // Add metadata
            const finalBuffer = await this.addMetadata(webpBuffer, pack, author);
            
            return {
                buffer: finalBuffer,
                type: 'image/webp',
                size: finalBuffer.length
            };
        } catch (error) {
            throw new Error(`Failed to create sticker: ${error.message}`);
        }
    }

    // ============ CREATE ANIMATED STICKER FROM VIDEO ============
    // Creates static sticker from first frame using Jimp
    async createFromVideo(buffer, options = {}) {
        const { pack = 'MEGAN MD', author = 'MEGAN-MD' } = options;
        
        try {
            // Jimp can't read video, so create a placeholder sticker
            // with message that FFmpeg is needed for animated stickers
            const width = 512;
            const height = 512;
            
            // Create a new image with text
            const image = new Jimp(width, height, '#000000');
            
            // Load a font
            const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
            image.print(font, 10, 200, 'Video Sticker\nRequires FFmpeg\nInstall FFmpeg for\nanimated stickers');
            
            // Get buffer as PNG
            const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
            
            // Convert to WebP
            const webpImage = await Jimp.read(pngBuffer);
            const webpBuffer = await webpImage.getBufferAsync(Jimp.MIME_WEBP);
            
            // Add metadata
            const finalBuffer = await this.addMetadata(webpBuffer, pack, author);
            
            return {
                buffer: finalBuffer,
                type: 'image/webp',
                size: finalBuffer.length,
                note: 'Static sticker - FFmpeg required for animated stickers'
            };
        } catch (error) {
            // Ultimate fallback - simple colored sticker
            const fallbackImage = new Jimp(512, 512, '#FF0000');
            const font = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
            fallbackImage.print(font, 10, 200, 'Video Sticker');
            
            const pngBuffer = await fallbackImage.getBufferAsync(Jimp.MIME_PNG);
            const webpImage = await Jimp.read(pngBuffer);
            const webpBuffer = await webpImage.getBufferAsync(Jimp.MIME_WEBP);
            
            const finalBuffer = await this.addMetadata(webpBuffer, pack, author);
            
            return {
                buffer: finalBuffer,
                type: 'image/webp',
                size: finalBuffer.length
            };
        }
    }

    // ============ CREATE EMOJI STICKER ============
    // Jimp doesn't support emoji well, so create text sticker
    async createFromEmoji(emoji, options = {}) {
        const { pack = 'MEGAN MD', author = 'MEGAN-MD' } = options;
        
        try {
            const width = 512;
            const height = 512;
            
            // Create transparent background
            const image = new Jimp(width, height, 0x00000000);
            
            // Load a font
            const font = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
            
            // Print emoji text (as fallback)
            image.print(font, 0, 0, {
                text: emoji,
                alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
                alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
            }, width, height);
            
            // Get buffer as PNG
            const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
            
            // Convert to WebP
            const webpImage = await Jimp.read(pngBuffer);
            const webpBuffer = await webpImage.getBufferAsync(Jimp.MIME_WEBP);
            
            // Add metadata
            const finalBuffer = await this.addMetadata(webpBuffer, pack, author);
            
            return {
                buffer: finalBuffer,
                type: 'image/webp',
                size: finalBuffer.length
            };
        } catch (error) {
            // Fallback - create colored sticker with text
            const fallbackImage = new Jimp(512, 512, '#0000FF');
            const font = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
            fallbackImage.print(font, 10, 200, `Emoji: ${emoji}`);
            
            const pngBuffer = await fallbackImage.getBufferAsync(Jimp.MIME_PNG);
            const webpImage = await Jimp.read(pngBuffer);
            const webpBuffer = await webpImage.getBufferAsync(Jimp.MIME_WEBP);
            
            const finalBuffer = await this.addMetadata(webpBuffer, pack, author);
            
            return {
                buffer: finalBuffer,
                type: 'image/webp',
                size: finalBuffer.length
            };
        }
    }

    // ============ STICKER TO IMAGE ============
    async convertToImage(buffer) {
        try {
            const image = await Jimp.read(buffer);
            const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG);
            
            return {
                buffer: pngBuffer,
                type: 'image/png',
                size: pngBuffer.length
            };
        } catch (error) {
            throw new Error(`Failed to convert sticker to image: ${error.message}`);
        }
    }

    // ============ ADD METADATA ============
    async addMetadata(webpBuffer, pack = 'MEGAN MD', author = 'MEGAN-MD') {
        try {
            const img = new webp.Image();
            await img.load(webpBuffer);
            
            const exif = this.createExif(pack, author);
            img.exif = exif;
            
            return await img.save(null);
        } catch (error) {
            return webpBuffer;
        }
    }

    createExif(pack, author) {
        const exif = {
            'sticker-pack-id': require('crypto').randomBytes(8).toString('hex'),
            'sticker-pack-name': pack,
            'sticker-pack-publisher': author,
            'emojis': ['😊'],
            'android-app-store-link': 'https://play.google.com/store/apps/details?id=com.whatsapp',
            'ios-app-store-link': 'https://apps.apple.com/app/whatsapp-messenger/id310633997'
        };
        
        const exifString = JSON.stringify(exif);
        const exifBuffer = Buffer.from(exifString);
        const exifHeader = Buffer.from([0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
        const exifHeaderLength = Buffer.alloc(4);
        exifHeaderLength.writeUInt32LE(exifBuffer.length, 0);
        
        return Buffer.concat([exifHeader, exifHeaderLength, exifBuffer]);
    }

    cleanup() {
        try {
            const files = fs.readdirSync(this.tmpDir);
            const now = Date.now();
            files.forEach(file => {
                const filePath = path.join(this.tmpDir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > 3600000) {
                    fs.unlinkSync(filePath);
                }
            });
        } catch (error) {}
    }
}

module.exports = StickerCreator;
