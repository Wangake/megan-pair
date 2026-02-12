const axios = require('axios');
const cheerio = require('cheerio');
const ytdl = require('ytdl-core');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');
const Utils = require('./utils');

class Downloader {
    constructor() {
        this.utils = new Utils();
        this.tmpDir = path.join(__dirname, '../../temp');
        this.ensureTmpDir();
    }
    
    ensureTmpDir() {
        if (!fs.existsSync(this.tmpDir)) {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }
    
    // Enhanced YouTube download with format options
    async youtubeDownload(url, options = {}) {
        try {
            if (!ytdl.validateURL(url)) {
                throw new Error('Invalid YouTube URL');
            }
            
            const info = await ytdl.getInfo(url);
            let format;
            
            if (options.audioOnly) {
                format = ytdl.chooseFormat(info.formats, {
                    quality: 'highestaudio',
                    filter: 'audioonly'
                });
            } else if (options.quality) {
                format = ytdl.chooseFormat(info.formats, {
                    quality: options.quality,
                    filter: options.audioOnly ? 'audioonly' : 'audioandvideo'
                });
            } else {
                format = ytdl.chooseFormat(info.formats, {
                    quality: 'lowest',
                    filter: 'audioandvideo'
                });
            }
            
            if (!format) {
                throw new Error('No suitable format found');
            }
            
            return {
                info: {
                    title: info.videoDetails.title,
                    duration: info.videoDetails.lengthSeconds,
                    channel: info.videoDetails.author.name,
                    views: info.videoDetails.viewCount,
                    description: info.videoDetails.description
                },
                format: {
                    url: format.url,
                    quality: format.qualityLabel,
                    hasAudio: format.hasAudio,
                    hasVideo: format.hasVideo,
                    contentLength: format.contentLength,
                    mimeType: format.mimeType
                },
                stream: ytdl(url, { format })
            };
        } catch (error) {
            throw new Error(`YouTube download failed: ${error.message}`);
        }
    }
    
    // YouTube search
    async youtubeSearch(query, limit = 5) {
        try {
            const search = await yts(query);
            return search.videos.slice(0, limit).map(video => ({
                title: video.title,
                url: video.url,
                duration: video.duration?.timestamp || video.duration,
                views: video.views,
                thumbnail: video.thumbnail,
                channel: video.author?.name,
                uploaded: video.ago
            }));
        } catch (error) {
            throw new Error(`Search failed: ${error.message}`);
        }
    }
    
    // Instagram downloader (basic - you'll need to expand this)
    async instagramDownload(url) {
        try {
            const response = await axios.get(`https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}`);
            // This is basic - you'll need a proper Instagram API
            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            throw new Error(`Instagram download failed: ${error.message}`);
        }
    }
    
    // TikTok downloader (basic)
    async tiktokDownload(url) {
        try {
            // You'll need to implement TikTok API or use a service
            throw new Error('TikTok downloader not implemented yet');
        } catch (error) {
            throw new Error(`TikTok download failed: ${error.message}`);
        }
    }
    
    // Generic file download
    async downloadFile(url, options = {}) {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    ...options.headers
                },
                timeout: 30000
            });
            
            return {
                stream: response.data,
                headers: response.headers,
                status: response.status
            };
        } catch (error) {
            throw new Error(`Download failed: ${error.message}`);
        }
    }
    
    // Get file info from URL
    async getUrlInfo(url) {
        try {
            const response = await axios.head(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });
            
            return {
                size: response.headers['content-length'] ? 
                    this.utils.formatSize(parseInt(response.headers['content-length'])) : 'Unknown',
                type: response.headers['content-type'],
                status: response.status,
                filename: this.extractFilename(url, response.headers)
            };
        } catch (error) {
            return { error: error.message };
        }
    }
    
    extractFilename(url, headers) {
        // From Content-Disposition header
        if (headers['content-disposition']) {
            const match = headers['content-disposition'].match(/filename="?([^"]+)"?/i);
            if (match) return match[1];
        }
        
        // From URL
        const urlPath = new URL(url).pathname;
        return path.basename(urlPath) || 'download.file';
    }
}

module.exports = Downloader;
