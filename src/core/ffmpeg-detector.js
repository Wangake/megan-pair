// src/core/ffmpeg-detector.js - Auto-detect FFmpeg on any platform
const { execSync } = require('child_process');
const fs = require('fs');

class FfmpegDetector {
    static findFfmpeg() {
        // Try to find ffmpeg in common locations
        const possiblePaths = [
            'ffmpeg', // System PATH
            '/usr/bin/ffmpeg',
            '/usr/local/bin/ffmpeg',
            '/opt/homebrew/bin/ffmpeg', // macOS Homebrew
            'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', // Windows
            'C:\\ffmpeg\\bin\\ffmpeg.exe', // Windows alternative
            process.env.FFMPEG_PATH // Custom env var
        ];

        for (const path of possiblePaths) {
            try {
                // Check if ffmpeg exists and works
                const output = execSync(`${path} -version`, { stdio: 'pipe', encoding: 'utf8' });
                if (output && output.includes('ffmpeg')) {
                    return path;
                }
            } catch (e) {
                // Try next path
            }
        }

        // Check if we're on Termux Android
        try {
            if (fs.existsSync('/data/data/com.termux/files/usr/bin/ffmpeg')) {
                return '/data/data/com.termux/files/usr/bin/ffmpeg';
            }
        } catch (e) {}

        return null;
    }

    static hasFfmpeg() {
        return this.findFfmpeg() !== null;
    }

    static getFfmpegPath() {
        const path = this.findFfmpeg();
        return path || 'ffmpeg'; // Fallback to hoping it's in PATH
    }
}

module.exports = FfmpegDetector;
