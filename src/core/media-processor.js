const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { exec } = require('child_process');
const { promisify } = require('util');
const Utils = require('./utils');
const FfmpegDetector = require('./ffmpeg-detector');

class MediaProcessor {
    constructor() {
        this.utils = new Utils();
        this.tmpDir = path.join(__dirname, '../../temp');
        this.ensureTmpDir();
        
        // Auto-detect FFmpeg path
        this.ffmpegPath = FfmpegDetector.getFfmpegPath();
        this.hasFfmpeg = FfmpegDetector.hasFfmpeg();
        
        // Set FFmpeg path if found
        if (this.hasFfmpeg) {
            try {
                ffmpeg.setFfmpegPath(this.ffmpegPath);
                console.log(`✅ FFmpeg detected at: ${this.ffmpegPath}`);
            } catch (e) {
                console.log(`⚠️ FFmpeg path set failed, using default`);
            }
        } else {
            console.log(`⚠️ FFmpeg not found - audio/video features disabled`);
        }
    }

    ensureTmpDir() {
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }

    generateTempFile(extension = '.tmp') {
        return path.join(this.tmpDir, `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${extension}`);
    }

    // Convert audio to WhatsApp-compatible format - with FFmpeg check
    async convertToWhatsAppAudio(inputBuffer, options = {}) {
        if (!this.hasFfmpeg) {
            // Return original audio if FFmpeg not available
            return {
                buffer: inputBuffer,
                mimeType: 'audio/mpeg',
                extension: '.mp3',
                duration: options.duration || 0,
                fileSize: inputBuffer.length,
                warning: 'FFmpeg not installed - audio not optimized'
            };
        }

        const inputPath = this.generateTempFile('.input');
        const outputPath = this.generateTempFile('.ogg');
        
        try {
            fs.writeFileSync(inputPath, inputBuffer);

            return new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .inputFormat(options.inputFormat || 'mp3')
                    .audioCodec('libopus')
                    .audioBitrate('64k')
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format('ogg')
                    .outputOptions([
                        '-application', 'voip',
                        '-frame_duration', '60',
                        '-compression_level', '10'
                    ])
                    .output(outputPath)
                    .on('end', () => {
                        try {
                            const outputBuffer = fs.readFileSync(outputPath);
                            const fileSize = outputBuffer.length;
                            
                            fs.unlinkSync(inputPath);
                            fs.unlinkSync(outputPath);
                            
                            resolve({
                                buffer: outputBuffer,
                                mimeType: 'audio/ogg; codecs=opus',
                                extension: '.ogg',
                                duration: options.duration || 0,
                                fileSize: fileSize
                            });
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .on('error', (err) => {
                        try { fs.unlinkSync(inputPath); } catch {}
                        try { fs.unlinkSync(outputPath); } catch {}
                        
                        // Fallback: return original audio
                        resolve({
                            buffer: inputBuffer,
                            mimeType: 'audio/mpeg',
                            extension: '.mp3',
                            duration: options.duration || 0,
                            fileSize: inputBuffer.length,
                            error: err.message
                        });
                    })
                    .run();
            });
        } catch (error) {
            // Fallback to original
            return {
                buffer: inputBuffer,
                mimeType: 'audio/mpeg',
                extension: '.mp3',
                duration: options.duration || 0,
                fileSize: inputBuffer.length
            };
        }
    }

    // Extract audio from video - with FFmpeg check
    async extractAudioFromVideo(videoBuffer) {
        if (!this.hasFfmpeg) {
            throw new Error('FFmpeg not available - cannot extract audio from video');
        }

        const videoPath = this.generateTempFile('.mp4');
        const audioPath = this.generateTempFile('.ogg');
        
        try {
            fs.writeFileSync(videoPath, videoBuffer);
            
            return new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .noVideo()
                    .audioCodec('libopus')
                    .audioBitrate('64k')
                    .audioChannels(1)
                    .audioFrequency(48000)
                    .format('ogg')
                    .outputOptions([
                        '-application', 'voip',
                        '-frame_duration', '60'
                    ])
                    .output(audioPath)
                    .on('end', () => {
                        try {
                            const audioBuffer = fs.readFileSync(audioPath);
                            fs.unlinkSync(videoPath);
                            fs.unlinkSync(audioPath);
                            resolve(audioBuffer);
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .on('error', (err) => {
                        try { fs.unlinkSync(videoPath); } catch {}
                        try { fs.unlinkSync(audioPath); } catch {}
                        reject(new Error(`Audio extraction failed: ${err.message}`));
                    })
                    .run();
            });
        } catch (error) {
            throw new Error(`Audio extraction failed: ${error.message}`);
        }
    }

    // Get media info - with FFmpeg check
    async getMediaInfo(buffer, extension) {
        if (!this.hasFfmpeg) {
            // Basic info without FFmpeg
            return {
                format: path.extname(extension).slice(1) || 'unknown',
                size: buffer.length,
                duration: 0,
                note: 'FFmpeg not installed - limited info'
            };
        }

        const inputPath = this.generateTempFile(extension);
        
        try {
            fs.writeFileSync(inputPath, buffer);
            
            return new Promise((resolve, reject) => {
                ffmpeg.ffprobe(inputPath, (err, metadata) => {
                    try { fs.unlinkSync(inputPath); } catch {}
                    
                    if (err) {
                        resolve({
                            format: path.extname(extension).slice(1) || 'unknown',
                            size: buffer.length,
                            duration: 0
                        });
                        return;
                    }
                    
                    const info = {
                        format: metadata.format.format_name || 'unknown',
                        size: buffer.length,
                        duration: metadata.format.duration || 0
                    };
                    
                    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
                    if (videoStream) {
                        info.video = {
                            codec: videoStream.codec_name || 'unknown',
                            width: videoStream.width || 0,
                            height: videoStream.height || 0,
                            fps: eval(videoStream.r_frame_rate) || 0
                        };
                    }
                    
                    const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
                    if (audioStream) {
                        info.audio = {
                            codec: audioStream.codec_name || 'unknown',
                            sampleRate: audioStream.sample_rate || 0,
                            channels: audioStream.channels || 0
                        };
                    }
                    
                    resolve(info);
                });
            });
        } catch (error) {
            return {
                format: 'unknown',
                size: buffer.length,
                duration: 0
            };
        }
    }

    // Convert image format - NO FFMPEG NEEDED (uses sharp)
    async convertImage(buffer, format) {
        const sharp = require('sharp');
        const outputBuffer = await sharp(buffer)
            .toFormat(format)
            .toBuffer();
        
        return {
            buffer: outputBuffer,
            mimeType: `image/${format}`,
            size: outputBuffer.length
        };
    }

    // Compress video - with FFmpeg check
    async convertToWhatsAppVideo(buffer) {
        if (!this.hasFfmpeg) {
            throw new Error('FFmpeg not available - cannot compress video');
        }

        const inputPath = this.generateTempFile('.mp4');
        const outputPath = this.generateTempFile('.mp4');
        
        try {
            fs.writeFileSync(inputPath, buffer);
            
            return new Promise((resolve, reject) => {
                ffmpeg(inputPath)
                    .videoCodec('libx264')
                    .size('?720x1280')
                    .autopad()
                    .outputOptions([
                        '-crf', '28',
                        '-preset', 'fast',
                        '-movflags', '+faststart',
                        '-profile:v', 'baseline',
                        '-level', '3.0'
                    ])
                    .audioCodec('aac')
                    .audioBitrate('128k')
                    .format('mp4')
                    .output(outputPath)
                    .on('end', () => {
                        try {
                            const outputBuffer = fs.readFileSync(outputPath);
                            fs.unlinkSync(inputPath);
                            fs.unlinkSync(outputPath);
                            
                            resolve({
                                buffer: outputBuffer,
                                mimeType: 'video/mp4',
                                size: outputBuffer.length
                            });
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .on('error', (err) => {
                        try { fs.unlinkSync(inputPath); } catch {}
                        try { fs.unlinkSync(outputPath); } catch {}
                        reject(new Error(`Video compression failed: ${err.message}`));
                    })
                    .run();
            });
        } catch (error) {
            throw new Error(`Video processing failed: ${error.message}`);
        }
    }

    // Check if FFmpeg is available
    isFfmpegAvailable() {
        return this.hasFfmpeg;
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

module.exports = MediaProcessor;
