const axios = require('axios');
const yts = require('yt-search');
const fs = require('fs');
const path = require('path');

module.exports = (bot) => {
    const commands = [];

    // API Configuration (from your original code)
    const API_BASE = 'https://api-aswin-sparky.koyeb.app/api/downloader';
    const API_ENDPOINTS = {
        song: (url) => `${API_BASE}/song?search=${encodeURIComponent(url)}`,
        ytv: (url) => `${API_BASE}/ytv?url=${encodeURIComponent(url)}`,
        spotify: (url) => `${API_BASE}/spotify?url=${encodeURIComponent(url)}`,
        tiktok: (url) => `${API_BASE}/tiktok?url=${encodeURIComponent(url)}`,
    };

    // Temp directory
    const TEMP_DIR = path.join(__dirname, '../../temp');
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // ==================== HELPER FUNCTIONS ====================
    
    async function searchYoutube(query, limit = 10) {
        try {
            const search = await yts(query);
            return search.videos.slice(0, limit);
        } catch (error) {
            return [];
        }
    }

    async function downloadFile(url, filename) {
        const filePath = path.join(TEMP_DIR, filename);
        const writer = fs.createWriteStream(filePath);

        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 300000 // 5 minutes for large files
        });

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', () => resolve(filePath));
            writer.on('error', reject);
        });
    }

    function cleanFilename(filename) {
        return filename.replace(/[^\w\s.-]/gi, '').substring(0, 50);
    }

    function extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
        return match ? match[1] : null;
    }

    // ==================== COMMAND 1: PLAY (Audio Message) ====================
    commands.push({
        name: 'play',
        description: 'Search and download song as audio message',
        aliases: ['song', 'audio'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🎵 *Usage:* ${bot.settings.PREFIX}play <song name>\n*Example:* ${bot.settings.PREFIX}play like you by tatiana manoise`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            let tempFile = null;
            
            try {
                // Step 1: Search
                await bot.sock.sendMessage(from, {
                    text: `🔍 *Searching for:*\n"${query}"...`
                }, { quoted: msg });

                const videos = await searchYoutube(query, 5);
                if (videos.length === 0) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ No results found. Try different keywords.'
                    }, { quoted: msg });
                }

                // Step 2: Get first result
                const video = videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';
                const author = video.author?.name || 'Unknown';

                // Step 3: Get download URL from API
                await bot.sock.sendMessage(from, {
                    text: `⬇️ *Downloading Audio:*\n${title}\n⏰ ${timestamp}\n👤 ${author}`
                }, { quoted: msg });

                const apiUrl = API_ENDPOINTS.song(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No audio link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Step 4: Download file
                const filename = `audio_${Date.now()}.mp3`;
                tempFile = await downloadFile(downloadURL, filename);

                // Step 5: Read file and send as AUDIO (not document)
                const buffer = fs.readFileSync(tempFile);

                // Send as audio message
                await bot.sock.sendMessage(from, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    ptt: false, // false for music, true for voice note
                    fileName: cleanFilename(title) + '.mp3'
                }, { quoted: msg });

                // Step 6: Send success message
                await bot.sock.sendMessage(from, {
                    text: `✅ *Audio Downloaded Successfully!*\n\n🎵 *Title:* ${title}\n⏰ *Duration:* ${timestamp}\n👤 *Artist:* ${author}`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'play command');
                await bot.sock.sendMessage(from, {
                    text: `❌ Audio download failed.\n\nError: ${error.message}\n\nTry again or use different song.`
                }, { quoted: msg });
            } finally {
                // Cleanup
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 2: MP3 (Document) ====================
    commands.push({
        name: 'mp3',
        description: 'Search and download song as document',
        aliases: ['songdoc', 'musicdoc'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `📁 *Usage:* ${bot.settings.PREFIX}mp3 <song name>\n*Example:* ${bot.settings.PREFIX}mp3 nandy asante`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            let tempFile = null;
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🔍 *Searching for MP3:*\n"${query}"...`
                }, { quoted: msg });

                const videos = await searchYoutube(query, 5);
                if (videos.length === 0) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ No results found.'
                    }, { quoted: msg });
                }

                // Get first result
                const video = videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';

                await bot.sock.sendMessage(from, {
                    text: `⬇️ *Downloading MP3 Document:*\n${title}\n⏰ ${timestamp}`
                }, { quoted: msg });

                // Get download URL from API
                const apiUrl = API_ENDPOINTS.song(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No audio link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Download file
                const filename = `mp3doc_${Date.now()}.mp3`;
                tempFile = await downloadFile(downloadURL, filename);

                // Send as DOCUMENT (not audio message)
                const buffer = fs.readFileSync(tempFile);
                const stats = fs.statSync(tempFile);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                await bot.sock.sendMessage(from, {
                    document: buffer,
                    fileName: cleanFilename(title) + '.mp3',
                    mimetype: 'audio/mpeg',
                    caption: `🎵 *MP3 Document*\n\n📁 *Title:* ${title}\n⏰ *Duration:* ${timestamp}\n💾 *Size:* ${fileSizeMB} MB`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'mp3 command');
                await bot.sock.sendMessage(from, {
                    text: '❌ Failed to download MP3 document.\nTry different song or check connection.'
                }, { quoted: msg });
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 3: YTS (Stylish Search) ====================
    commands.push({
        name: 'yts',
        description: 'Search YouTube videos (styled)',
        aliases: ['ytsearch', 'search'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🔍 *Usage:* ${bot.settings.PREFIX}yts <search query>\n*Example:* ${bot.settings.PREFIX}yts gospel music 2024`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `✨ *Searching YouTube for:*\n"${query}"`
                }, { quoted: msg });

                const videos = await searchYoutube(query, 15);
                if (videos.length === 0) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ *No results found.*\nTry different keywords.'
                    }, { quoted: msg });
                }

                // Stylish formatted results
                let resultText = `📺 *YouTube Search Results*\n`;
                resultText += `━━━━━━━━━━━━━━━━━━━━\n`;
                resultText += `🔍 *Query:* "${query}"\n`;
                resultText += `📊 *Found:* ${videos.length} videos\n`;
                resultText += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                videos.forEach((video, i) => {
                    resultText += `*${i+1}.* ${video.title}\n`;
                    resultText += `   ├─ 🕒 ${video.timestamp || video.duration}\n`;
                    resultText += `   ├─ 👁️ ${video.views}\n`;
                    resultText += `   ├─ 👤 ${video.author?.name || 'Unknown'}\n`;
                    resultText += `   └─ 🔗 ${video.url}\n\n`;
                });

                resultText += `━━━━━━━━━━━━━━━━━━━━\n`;
                resultText += `🎵 *Download Audio:*\n`;
                resultText += `• ${bot.settings.PREFIX}play <number> - As audio message\n`;
                resultText += `• ${bot.settings.PREFIX}mp3 <number> - As MP3 document\n\n`;
                resultText += `🎬 *Download Video:*\n`;
                resultText += `• ${bot.settings.PREFIX}ytv <number> - As video\n`;
                resultText += `• ${bot.settings.PREFIX}mp4 <number> - As MP4 document\n\n`;
                resultText += `📝 *Reply with number 1-${videos.length}* to download`;

                await bot.sock.sendMessage(from, { text: resultText }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'yts command');
                await bot.sock.sendMessage(from, {
                    text: '❌ Search failed. Please try again.'
                }, { quoted: msg });
            }
        }
    });

    // ==================== COMMAND 4: YTV (Search & Download Video) ====================
    commands.push({
        name: 'ytv',
        description: 'Search and download YouTube video',
        aliases: ['ytvideo'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🎬 *Usage:* ${bot.settings.PREFIX}ytv <video name>\n*Example:* ${bot.settings.PREFIX}ytv cartoon funny videos`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            let tempFile = null;
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🔍 *Searching videos:*\n"${query}"...`
                }, { quoted: msg });

                const videos = await searchYoutube(query, 5);
                if (videos.length === 0) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ No video results found.'
                    }, { quoted: msg });
                }

                // Get first result
                const video = videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';

                await bot.sock.sendMessage(from, {
                    text: `⬇️ *Downloading Video:*\n${title}\n⏰ ${timestamp}`
                }, { quoted: msg });

                // Get download URL from API
                const apiUrl = API_ENDPOINTS.ytv(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No video link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Download file
                const filename = `video_${Date.now()}.mp4`;
                tempFile = await downloadFile(downloadURL, filename);

                // Send as video
                const buffer = fs.readFileSync(tempFile);
                const stats = fs.statSync(tempFile);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                if (parseFloat(fileSizeMB) > 100) {
                    // Too large, send as document
                    await bot.sock.sendMessage(from, {
                        document: buffer,
                        fileName: cleanFilename(title) + '.mp4',
                        mimetype: 'video/mp4',
                        caption: `🎬 *Video (Large File)*\n\n📹 ${title}\n⏰ ${timestamp}\n💾 ${fileSizeMB} MB\n\nSent as document due to size.`
                    }, { quoted: msg });
                } else {
                    // Send as normal video
                    await bot.sock.sendMessage(from, {
                        video: buffer,
                        caption: `🎬 ${title}\n⏰ ${timestamp}`,
                        fileName: cleanFilename(title) + '.mp4'
                    }, { quoted: msg });
                }

                await bot.sock.sendMessage(from, {
                    text: `✅ *Video Downloaded!*\n\n📹 ${title}\n⏰ ${timestamp}\n💾 ${fileSizeMB} MB`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'ytv command');
                await bot.sock.sendMessage(from, {
                    text: '❌ Failed to download video.\nVideo might be too long or restricted.'
                }, { quoted: msg });
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 5: MP4 (Video Document) ====================
    commands.push({
        name: 'mp4',
        description: 'Search and download video as document',
        aliases: ['videodoc'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `📁 *Usage:* ${bot.settings.PREFIX}mp4 <video name>\n*Example:* ${bot.settings.PREFIX}mp4 tutorial videos`
                }, { quoted: msg });
            }

            const query = args.join(' ');
            let tempFile = null;
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🔍 *Searching for videos:*\n"${query}"...`
                }, { quoted: msg });

                const videos = await searchYoutube(query, 5);
                if (videos.length === 0) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ No videos found.'
                    }, { quoted: msg });
                }

                // Get first result
                const video = videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';

                await bot.sock.sendMessage(from, {
                    text: `⬇️ *Downloading as MP4 Document:*\n${title}\n⏰ ${timestamp}`
                }, { quoted: msg });

                // Get download URL from API
                const apiUrl = API_ENDPOINTS.ytv(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No video link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Download file
                const filename = `mp4doc_${Date.now()}.mp4`;
                tempFile = await downloadFile(downloadURL, filename);

                // Send as DOCUMENT
                const buffer = fs.readFileSync(tempFile);
                const stats = fs.statSync(tempFile);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                await bot.sock.sendMessage(from, {
                    document: buffer,
                    fileName: cleanFilename(title) + '.mp4',
                    mimetype: 'video/mp4',
                    caption: `🎬 *MP4 Document*\n\n📹 ${title}\n⏰ ${timestamp}\n💾 ${fileSizeMB} MB\n\nSent as MP4 document file.`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'mp4 command');
                await bot.sock.sendMessage(from, {
                    text: '❌ Failed to download MP4 document.'
                }, { quoted: msg });
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 6: YTMP3 (URL to Audio) ====================
    commands.push({
        name: 'ytmp3',
        description: 'Convert YouTube URL to audio',
        aliases: ['ytaudio'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🎵 *Usage:* ${bot.settings.PREFIX}ytmp3 <YouTube URL>\n*Example:* ${bot.settings.PREFIX}ytmp3 https://youtube.com/watch?v=...`
                }, { quoted: msg });
            }

            const url = args[0];
            let tempFile = null;
            
            try {
                // Validate URL
                if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ Invalid YouTube URL.\nPlease provide a valid YouTube link (youtube.com or youtu.be).'
                    }, { quoted: msg });
                }

                await bot.sock.sendMessage(from, {
                    text: '🎵 *Converting YouTube URL to audio...*\nPlease wait.'
                }, { quoted: msg });

                // Get video info
                const videoId = extractVideoId(url);
                if (!videoId) {
                    throw new Error('Could not extract video ID from URL');
                }

                const videoInfo = await yts({ videoId });
                if (!videoInfo.videos || videoInfo.videos.length === 0) {
                    throw new Error('Video not found');
                }

                const video = videoInfo.videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';

                // Get download URL from API
                const apiUrl = API_ENDPOINTS.song(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No audio link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Download file
                const filename = `ytmp3_${Date.now()}.mp3`;
                tempFile = await downloadFile(downloadURL, filename);

                // Send as audio message
                const buffer = fs.readFileSync(tempFile);
                
                await bot.sock.sendMessage(from, {
                    audio: buffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: cleanFilename(title) + '.mp3'
                }, { quoted: msg });

                await bot.sock.sendMessage(from, {
                    text: `✅ *URL to Audio Complete!*\n\n🎵 ${title}\n⏰ ${timestamp}\n🔗 From: ${url}`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'ytmp3 command');
                await bot.sock.sendMessage(from, {
                    text: `❌ Failed to convert URL to audio.\n\nError: ${error.message}\n\nMake sure the URL is valid and public.`
                }, { quoted: msg });
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 7: YTMP4 (URL to Video) ====================
    commands.push({
        name: 'ytmp4',
        description: 'Convert YouTube URL to video',
        aliases: ['ytmp4'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🎬 *Usage:* ${bot.settings.PREFIX}ytmp4 <YouTube URL>\n*Example:* ${bot.settings.PREFIX}ytmp4 https://youtube.com/watch?v=...`
                }, { quoted: msg });
            }

            const url = args[0];
            let tempFile = null;
            
            try {
                if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
                    return bot.sock.sendMessage(from, {
                        text: '❌ Invalid YouTube URL.\nPlease provide a valid YouTube link.'
                    }, { quoted: msg });
                }

                await bot.sock.sendMessage(from, {
                    text: '🎬 *Converting YouTube URL to video...*\nThis may take a while for longer videos.'
                }, { quoted: msg });

                // Get video info
                const videoId = extractVideoId(url);
                if (!videoId) {
                    throw new Error('Could not extract video ID from URL');
                }

                const videoInfo = await yts({ videoId });
                if (!videoInfo.videos || videoInfo.videos.length === 0) {
                    throw new Error('Video not found');
                }

                const video = videoInfo.videos[0];
                const title = video.title;
                const timestamp = video.timestamp || video.duration || 'Unknown';

                // Get download URL from API
                const apiUrl = API_ENDPOINTS.ytv(video.url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) {
                    throw new Error('No video link from API');
                }

                const { url: downloadURL } = response.data.data;

                // Download file
                const filename = `ytmp4_${Date.now()}.mp4`;
                tempFile = await downloadFile(downloadURL, filename);

                // Send as video
                const buffer = fs.readFileSync(tempFile);
                const stats = fs.statSync(tempFile);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                if (parseFloat(fileSizeMB) > 100) {
                    // Too large, send as document
                    await bot.sock.sendMessage(from, {
                        document: buffer,
                        fileName: cleanFilename(title) + '.mp4',
                        mimetype: 'video/mp4',
                        caption: `🎬 *Video from URL (Large File)*\n\n📹 ${title}\n⏰ ${timestamp}\n💾 ${fileSizeMB} MB\n🔗 From: ${url}`
                    }, { quoted: msg });
                } else {
                    // Send as normal video
                    await bot.sock.sendMessage(from, {
                        video: buffer,
                        caption: `🎬 ${title}\n⏰ ${timestamp}\n🔗 From: ${url}`,
                        fileName: cleanFilename(title) + '.mp4'
                    }, { quoted: msg });
                }

                await bot.sock.sendMessage(from, {
                    text: `✅ *URL to Video Complete!*\n\n📹 ${title}\n⏰ ${timestamp}\n💾 ${fileSizeMB} MB`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'ytmp4 command');
                await bot.sock.sendMessage(from, {
                    text: '❌ Failed to convert URL to video.\nVideo might be too long, restricted, or private.'
                }, { quoted: msg });
            } finally {
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });

    // ==================== COMMAND 8: Cleanup ====================
    commands.push({
        name: 'cleanup',
        description: 'Clean temporary files',
        category: 'Downloader',
        async execute({ msg, from, bot }) {
            try {
                const files = fs.readdirSync(TEMP_DIR);
                let deleted = 0;
                let totalSize = 0;

                for (const file of files) {
                    try {
                        const filePath = path.join(TEMP_DIR, file);
                        const stats = fs.statSync(filePath);
                        totalSize += stats.size;
                        fs.unlinkSync(filePath);
                        deleted++;
                    } catch (e) {
                        // Skip files that can't be deleted
                    }
                }

                const totalMB = (totalSize / (1024 * 1024)).toFixed(2);
                await bot.sock.sendMessage(from, {
                    text: `🧹 *Cleanup Complete*\n\n🗑️ *Deleted:* ${deleted} files\n💾 *Freed:* ${totalMB} MB\n\nTemp directory cleaned successfully.`
                }, { quoted: msg });
            } catch (error) {
                await bot.sock.sendMessage(from, {
                    text: '✅ Temp directory is already clean.'
                }, { quoted: msg });
            }
        }
    });

    // ==================== Keep existing commands for compatibility ====================
    
    // Spotify command (from original)
    commands.push({
        name: 'spotify',
        description: 'Download from Spotify',
        aliases: ['spoti'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            try {
                if (!args.length) {
                    return bot.sock.sendMessage(from, {
                        text: `❌ Please provide Spotify URL\nExample: ${bot.settings.PREFIX}spotify https://open.spotify.com/track/...`
                    }, { quoted: msg });
                }

                const url = args[0];
                await bot.sock.sendMessage(from, {
                    text: '⬇️ Downloading from Spotify...'
                }, { quoted: msg });

                const apiUrl = API_ENDPOINTS.spotify(url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) throw new Error('Spotify download failed');

                const { title, artist, download } = response.data.data;

                // Download file
                const fileResponse = await axios.get(download, {
                    responseType: 'arraybuffer',
                    timeout: 120000
                });

                const buffer = Buffer.from(fileResponse.data);

                await bot.sock.sendMessage(from, {
                    document: buffer,
                    fileName: `${cleanFilename(title)}.mp3`,
                    mimetype: 'audio/mpeg',
                    caption: `🎵 ${title}\n👤 ${artist || 'Unknown'}`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'spotify command');
                await bot.sock.sendMessage(from, {
                    text: `❌ Spotify download failed\nCheck URL format.`
                }, { quoted: msg });
            }
        }
    });

    // TikTok command (from original)
    commands.push({
        name: 'tiktok',
        description: 'Download from TikTok',
        aliases: ['tt'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            try {
                if (!args.length) {
                    return bot.sock.sendMessage(from, {
                        text: `❌ Please provide TikTok URL\nExample: ${bot.settings.PREFIX}tiktok https://vt.tiktok.com/...`
                    }, { quoted: msg });
                }

                const url = args[0];
                await bot.sock.sendMessage(from, {
                    text: '⬇️ Downloading from TikTok...'
                }, { quoted: msg });

                const apiUrl = API_ENDPOINTS.tiktok(url);
                const response = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });

                if (!response.data?.status) throw new Error('TikTok download failed');

                const { title, author, video } = response.data.data;
                const authorName = author?.nickname || 'Unknown';

                const videoResponse = await axios.get(video, {
                    responseType: 'arraybuffer',
                    timeout: 120000
                });

                const buffer = Buffer.from(videoResponse.data);

                await bot.sock.sendMessage(from, {
                    video: buffer,
                    caption: `📱 ${title || 'TikTok Video'}\n👤 ${authorName}`,
                    fileName: `tiktok_${Date.now()}.mp4`
                }, { quoted: msg });

            } catch (error) {
                bot.logger.error(error, 'tiktok command');
                await bot.sock.sendMessage(from, {
                    text: `❌ TikTok download failed\nCheck URL format.`
                }, { quoted: msg });
            }
        }
    });

    // DL - Auto detect (from original)
    commands.push({
        name: 'dl',
        description: 'Download from any platform (auto-detect)',
        aliases: ['download'],
        category: 'Downloader',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `❌ Please provide URL\nExample: ${bot.settings.PREFIX}dl https://...`
                }, { quoted: msg });
            }

            const url = args[0];

            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                await bot.sock.sendMessage(from, {
                    text: `🎵 *YouTube Detected*\n\nUse:\n• ${bot.settings.PREFIX}ytmp3 ${url} (audio)\n• ${bot.settings.PREFIX}ytmp4 ${url} (video)`
                }, { quoted: msg });
            } else if (url.includes('spotify.com')) {
                await bot.sock.sendMessage(from, {
                    text: `🎵 *Spotify Detected*\n\nDownloading...`
                }, { quoted: msg });
                await commands.find(c => c.name === 'spotify').execute({
                    msg, from, args: [url], bot
                });
            } else if (url.includes('tiktok.com')) {
                await bot.sock.sendMessage(from, {
                    text: `📱 *TikTok Detected*\n\nDownloading...`
                }, { quoted: msg });
                await commands.find(c => c.name === 'tiktok').execute({
                    msg, from, args: [url], bot
                });
            } else {
                await bot.sock.sendMessage(from, {
                    text: `❌ Platform not recognized\nSupported: YouTube, Spotify, TikTok`
                }, { quoted: msg });
            }
        }
    });

    return commands;
};
