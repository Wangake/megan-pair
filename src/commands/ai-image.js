const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = (bot) => {
    const commands = [];
    
    // API Configuration
    const API_ENDPOINTS = {
        // For .flux command
        flux: {
            url: 'https://eliteprotech-apis.zone.id/flux',
            method: 'GET',
            params: (prompt) => ({ prompt: prompt }),
            responseType: 'arraybuffer',
            directImage: true // Returns image directly, not JSON
        },
        
        // For .dream command
        dream: {
            url: 'https://api.gurusensei.workers.dev/dream',
            method: 'GET',
            params: (prompt) => ({ prompt: prompt }),
            responseType: 'arraybuffer',
            directImage: true // Returns image directly
        },
        
        // For .generate command (image search)
        generate: {
            url: 'https://api-aswin-sparky.koyeb.app/api/search/imageai',
            method: 'GET',
            params: (prompt) => ({ search: prompt }),
            responseType: 'json',
            directImage: false // Returns JSON with image URLs
        },
        
        // For .create command (firelogo)
        create: {
            url: 'https://eliteprotech-apis.zone.id/firelogo',
            method: 'GET',
            params: (prompt) => ({ text: prompt }),
            responseType: 'json',
            directImage: false // Returns JSON with image URL
        }
    };
    
    // Temp directory for images
    const TEMP_DIR = path.join(__dirname, '../../temp');
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    // Helper function to download image
    async function downloadImage(url, filename) {
        const filePath = path.join(TEMP_DIR, filename);
        
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*'
                },
                timeout: 60000 // 60 seconds for image downloads
            });
            
            fs.writeFileSync(filePath, response.data);
            return filePath;
        } catch (error) {
            throw new Error(`Failed to download image: ${error.message}`);
        }
    }
    
    // Helper function to send image
    async function sendImageMessage(bot, from, imagePath, caption, quotedMsg) {
        try {
            const buffer = fs.readFileSync(imagePath);
            
            // Determine image type from extension
            const ext = path.extname(imagePath).toLowerCase();
            let mimeType = 'image/jpeg';
            
            if (ext === '.png') mimeType = 'image/png';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.webp') mimeType = 'image/webp';
            
            await bot.sock.sendMessage(from, {
                image: buffer,
                caption: caption,
                mimetype: mimeType
            }, { quoted: quotedMsg });
            
            // Clean up temp file
            fs.unlinkSync(imagePath);
            
            return true;
        } catch (error) {
            // Clean up on error
            if (fs.existsSync(imagePath)) {
                try { fs.unlinkSync(imagePath); } catch {}
            }
            throw error;
        }
    }
    
    // ==================== COMMAND 1: FLUX ====================
    commands.push({
        name: 'flux',
        description: 'Generate AI images with Flux model',
        aliases: ['fluxai', 'aiimage'],
        category: 'AI Image',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `✨ *Flux AI Image Generation*\n\nUsage: ${bot.settings.PREFIX}flux <prompt>\n\nExample: ${bot.settings.PREFIX}flux a beautiful sunset over mountains\n\n*Note:* Generates high-quality AI images`
                }, { quoted: msg });
            }
            
            const prompt = args.join(' ');
            let tempFile = null;
            
            try {
                // Send processing message
                await bot.sock.sendMessage(from, {
                    text: `✨ *Generating Flux AI image...*\n\n*Prompt:* "${prompt}"\n\nPlease wait, this may take up to 30 seconds.`
                }, { quoted: msg });
                
                const config = API_ENDPOINTS.flux;
                
                // Get image directly from API
                const response = await axios({
                    method: config.method,
                    url: config.url,
                    params: config.params(prompt),
                    responseType: config.responseType,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/*'
                    },
                    timeout: 45000 // 45 seconds for generation
                });
                
                // Save image to temp file
                const filename = `flux_${Date.now()}.png`;
                tempFile = path.join(TEMP_DIR, filename);
                fs.writeFileSync(tempFile, response.data);
                
                // Send image with caption
                const caption = `✨ *Flux AI Generated*\n\n*Prompt:* ${prompt}\n*Model:* Flux AI\n*Creator:* Tracker Wanga`;
                
                await sendImageMessage(bot, from, tempFile, caption, msg);
                
                // Send success message
                await bot.sock.sendMessage(from, {
                    text: `✅ *Flux AI Image Generated!*\n\n*Prompt:* "${prompt}"\n\nImage sent successfully!`
                }, { quoted: msg });
                
            } catch (error) {
                bot.logger.error(error, 'flux command');
                
                let errorMsg = `❌ *Flux AI Generation Failed*\n\n`;
                if (error.message.includes('timeout')) {
                    errorMsg += `The image generation is taking too long.\n`;
                    errorMsg += `• Try a simpler prompt\n`;
                    errorMsg += `• The API might be busy\n`;
                } else if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
                    errorMsg += `API server is currently unavailable.\n`;
                    errorMsg += `• Try again in a few minutes\n`;
                } else {
                    errorMsg += `Error: ${error.message}\n`;
                }
                
                errorMsg += `\nTry using ${bot.settings.PREFIX}dream for alternative AI images.`;
                
                await bot.sock.sendMessage(from, {
                    text: errorMsg
                }, { quoted: msg });
                
                // Cleanup
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });
    
    // ==================== COMMAND 2: DREAM ====================
    commands.push({
        name: 'dream',
        description: 'Generate AI images with Dream model',
        aliases: ['dreamai', 'aiart'],
        category: 'AI Image',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🌌 *Dream AI Image Generation*\n\nUsage: ${bot.settings.PREFIX}dream <prompt>\n\nExample: ${bot.settings.PREFIX}dream fantasy castle in the clouds\n\n*Note:* Generates artistic AI images`
                }, { quoted: msg });
            }
            
            const prompt = args.join(' ');
            let tempFile = null;
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🌌 *Generating Dream AI image...*\n\n*Prompt:* "${prompt}"\n\nCreating your dream image...`
                }, { quoted: msg });
                
                const config = API_ENDPOINTS.dream;
                
                // Get image directly from API
                const response = await axios({
                    method: config.method,
                    url: config.url,
                    params: config.params(prompt),
                    responseType: config.responseType,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'image/*'
                    },
                    timeout: 45000
                });
                
                // Save image to temp file
                const filename = `dream_${Date.now()}.png`;
                tempFile = path.join(TEMP_DIR, filename);
                fs.writeFileSync(tempFile, response.data);
                
                // Send image with caption
                const caption = `🌌 *Dream AI Generated*\n\n*Prompt:* ${prompt}\n*Model:* Dream AI\n*Creator:* Tracker Wanga`;
                
                await sendImageMessage(bot, from, tempFile, caption, msg);
                
                await bot.sock.sendMessage(from, {
                    text: `✅ *Dream AI Image Created!*\n\nYour dream has been visualized!`
                }, { quoted: msg });
                
            } catch (error) {
                bot.logger.error(error, 'dream command');
                
                let errorMsg = `❌ *Dream AI Generation Failed*\n\n`;
                if (error.message.includes('timeout')) {
                    errorMsg += `Image generation timeout.\n`;
                    errorMsg += `• The model might be busy\n`;
                    errorMsg += `• Try a shorter prompt\n`;
                } else {
                    errorMsg += `Error: ${error.message}\n`;
                }
                
                errorMsg += `\nTry using ${bot.settings.PREFIX}flux for alternative AI images.`;
                
                await bot.sock.sendMessage(from, {
                    text: errorMsg
                }, { quoted: msg });
                
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });
    
    // ==================== COMMAND 3: GENERATE ====================
    commands.push({
        name: 'generate',
        description: 'Generate/Search for AI images',
        aliases: ['gen', 'image', 'searchimg'],
        category: 'AI Image',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🖼️ *AI Image Search & Generation*\n\nUsage: ${bot.settings.PREFIX}generate <prompt>\n\nExample: ${bot.settings.PREFIX}generate girl in dark aesthetic\n\n*Note:* Searches and generates multiple AI images`
                }, { quoted: msg });
            }
            
            const prompt = args.join(' ');
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🔍 *Searching AI images...*\n\n*Query:* "${prompt}"\n\nFinding the best AI-generated images...`
                }, { quoted: msg });
                
                const config = API_ENDPOINTS.generate;
                
                // Get JSON response with image URLs
                const response = await axios({
                    method: config.method,
                    url: config.url,
                    params: config.params(prompt),
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 30000
                });
                
                if (!response.data?.status || !response.data.data || response.data.data.length === 0) {
                    throw new Error('No images found');
                }
                
                const imageUrls = response.data.data.slice(0, 5); // Get first 5 images
                
                // Send info about found images
                await bot.sock.sendMessage(from, {
                    text: `✅ *Found ${imageUrls.length} AI Images*\n\n*Query:* "${prompt}"\n\nDownloading and sending images...`
                }, { quoted: msg });
                
                // Download and send each image
                for (let i = 0; i < Math.min(imageUrls.length, 3); i++) { // Limit to 3 images
                    try {
                        const url = imageUrls[i];
                        const filename = `gen_${Date.now()}_${i}.jpg`;
                        
                        // Download image
                        const imagePath = await downloadImage(url, filename);
                        
                        // Send image
                        const caption = `🖼️ *AI Image ${i+1}/${Math.min(imageUrls.length, 3)}*\n\n*Query:* ${prompt}\n*Source:* AI Image Search`;
                        
                        await sendImageMessage(bot, from, imagePath, caption, i === 0 ? msg : null);
                        
                        // Small delay between images
                        if (i < Math.min(imageUrls.length, 3) - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (imgError) {
                        console.error(`Failed to send image ${i+1}:`, imgError.message);
                        continue; // Continue with next image
                    }
                }
                
                // Send completion message
                if (imageUrls.length > 3) {
                    await bot.sock.sendMessage(from, {
                        text: `✅ *AI Image Search Complete!*\n\nFound ${imageUrls.length} images for "${prompt}"\nSent first 3 images.\n\n*API:* Aswin Sparky\n*Creator:* Tracker Wanga`
                    }, { quoted: msg });
                } else {
                    await bot.sock.sendMessage(from, {
                        text: `✅ *All ${imageUrls.length} images sent!*\n\nSearch completed successfully.`
                    }, { quoted: msg });
                }
                
            } catch (error) {
                bot.logger.error(error, 'generate command');
                
                let errorMsg = `❌ *AI Image Search Failed*\n\n`;
                if (error.message.includes('No images found')) {
                    errorMsg += `No AI images found for "${prompt}"\n`;
                    errorMsg += `• Try different keywords\n`;
                    errorMsg += `• Be more specific\n`;
                } else if (error.message.includes('timeout')) {
                    errorMsg += `Search took too long.\n`;
                    errorMsg += `• Try again in a moment\n`;
                } else {
                    errorMsg += `Error: ${error.message}\n`;
                }
                
                errorMsg += `\nTry using ${bot.settings.PREFIX}flux for direct AI generation.`;
                
                await bot.sock.sendMessage(from, {
                    text: errorMsg
                }, { quoted: msg });
            }
        }
    });
    
    // ==================== COMMAND 4: CREATE ====================
    commands.push({
        name: 'create',
        description: 'Create logo/text images with FireLogo',
        aliases: ['firelogo', 'logo', 'textimage'],
        category: 'AI Image',
        async execute({ msg, from, args, bot }) {
            if (!args.length) {
                return bot.sock.sendMessage(from, {
                    text: `🔥 *FireLogo Creator*\n\nUsage: ${bot.settings.PREFIX}create <text>\n\nExample: ${bot.settings.PREFIX}create Cyberpunk Lizard\n\n*Note:* Creates stylish logo/text images`
                }, { quoted: msg });
            }
            
            const text = args.join(' ');
            let tempFile = null;
            
            try {
                await bot.sock.sendMessage(from, {
                    text: `🔥 *Creating FireLogo...*\n\n*Text:* "${text}"\n\nGenerating your logo image...`
                }, { quoted: msg });
                
                const config = API_ENDPOINTS.create;
                
                // Get JSON response with image URL
                const response = await axios({
                    method: config.method,
                    url: config.url,
                    params: config.params(text),
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 30000
                });
                
                if (!response.data?.success || !response.data.image) {
                    throw new Error('No logo generated');
                }
                
                const imageUrl = response.data.image;
                
                // Download image
                const filename = `logo_${Date.now()}.png`;
                tempFile = await downloadImage(imageUrl, filename);
                
                // Send image with caption
                const caption = `🔥 *FireLogo Created*\n\n*Text:* ${text}\n*Tool:* FireLogo AI\n*Creator:* Tracker Wanga`;
                
                await sendImageMessage(bot, from, tempFile, caption, msg);
                
                await bot.sock.sendMessage(from, {
                    text: `✅ *FireLogo Created Successfully!*\n\n*Text:* "${text}"\n\nLogo image sent!`
                }, { quoted: msg });
                
            } catch (error) {
                bot.logger.error(error, 'create command');
                
                let errorMsg = `❌ *FireLogo Creation Failed*\n\n`;
                if (error.message.includes('No logo generated')) {
                    errorMsg += `Could not generate logo for "${text}"\n`;
                    errorMsg += `• Try different text\n`;
                    errorMsg += `• Keep it shorter\n`;
                } else if (error.message.includes('timeout')) {
                    errorMsg += `Logo generation timeout.\n`;
                } else {
                    errorMsg += `Error: ${error.message}\n`;
                }
                
                await bot.sock.sendMessage(from, {
                    text: errorMsg
                }, { quoted: msg });
                
                if (tempFile && fs.existsSync(tempFile)) {
                    try { fs.unlinkSync(tempFile); } catch {}
                }
            }
        }
    });
    
    // ==================== COMMAND 5: AI IMAGE MENU ====================
    commands.push({
        name: 'aimage',
        description: 'Show AI image generation commands',
        aliases: ['aiimg', 'imageai'],
        category: 'AI Image',
        async execute({ msg, from, bot }) {
            const menu = `🖼️ *AI IMAGE GENERATION COMMANDS*\n
*🎨 Generate AI Images:*
• ${bot.settings.PREFIX}flux <prompt> - Generate with Flux AI
• ${bot.settings.PREFIX}dream <prompt> - Generate with Dream AI
• ${bot.settings.PREFIX}generate <prompt> - Search AI images
• ${bot.settings.PREFIX}create <text> - Create FireLogo images

*📝 Examples:*
• ${bot.settings.PREFIX}flux a cyberpunk city at night
• ${bot.settings.PREFIX}dream mystical forest with fairies
• ${bot.settings.PREFIX}generate sunset beach aesthetic
• ${bot.settings.PREFIX}create Megan AI Logo

*⚡ Features:*
• High-quality AI image generation
• Multiple AI models available
• Fast response times
• All images include creator credit

*👤 Creator:*
• Tracker Wanga
• Made in Kenya
• All AI images powered by Megan MD

*💡 Tips:*
• Be descriptive with your prompts
• Use .flux for realistic images
• Use .dream for artistic images
• Use .generate for multiple options
• Use .create for logos/text`;

            await bot.sock.sendMessage(from, {
                text: menu
            }, { quoted: msg });
        }
    });
    
    return commands;
};
