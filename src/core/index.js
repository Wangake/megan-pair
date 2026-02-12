const Utils = require('./utils');
const Downloader = require('./downloader');
const FunCommands = require('./fun');
const MediaProcessor = require('./media-processor');
const StickerCreator = require('./sticker-creator');
const StreamHelpers = require('./stream');
const FfmpegDetector = require('./ffmpeg-detector');

class Core {
    constructor(bot = null) {
        this.bot = bot;
        this.utils = new Utils(bot);
        this.downloader = new Downloader();
        this.fun = new FunCommands();
        this.mediaProcessor = new MediaProcessor();
        this.sticker = new StickerCreator();
        this.streamHelpers = StreamHelpers;
        this.ffmpeg = FfmpegDetector;
    }
    
    async initialize() {
        try {
            await this.utils.ensureTmpDir();
            
            // Log FFmpeg status
            if (this.ffmpeg.hasFfmpeg()) {
                this.bot.logger.log(`FFmpeg detected at: ${this.ffmpeg.getFfmpegPath()}`, 'success', '🎬');
            } else {
                this.bot.logger.log('FFmpeg not found - audio/video features limited', 'warn', '⚠️');
            }
            
            setInterval(() => {
                this.utils.cleanTmpFiles();
                if (this.mediaProcessor.cleanup) this.mediaProcessor.cleanup();
                if (this.sticker.cleanup) this.sticker.cleanup();
            }, 3600000);
            
            this.bot.logger.log('Core initialized', 'success', '✅');
            return true;
        } catch (error) {
            this.bot.logger.error(error, 'Core.initialize');
            return false;
        }
    }
    
    getUtils() { return this.utils; }
    getDownloader() { return this.downloader; }
    getFun() { return this.fun; }
    getMediaProcessor() { return this.mediaProcessor; }
    getSticker() { return this.sticker; }
    getFfmpegDetector() { return this.ffmpeg; }

    async streamToBuffer(stream) {
        return this.streamHelpers.streamToBuffer(stream);
    }
    
    bufferToStream(buffer) {
        return this.streamHelpers.bufferToStream(buffer);
    }
    
    success(data, message = 'Success') {
        return { success: true, message, data };
    }

    error(message = 'Error', data = null) {
        return { success: false, message, data };
    }
}

module.exports = Core;
