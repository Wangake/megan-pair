const axios = require('axios');
const fs = require('fs');
const path = require('path');

class AIHandler {
    constructor(bot) {
        this.bot = bot;
        this.config = {
            ownerName: "Tracker Wanga",
            ownerPhone: "254107655023",
            botName: "Megan MD",
            defaultPrefix: ".",
            website: "https://megan-ai.vercel.app",
            country: "Kenya"
        };
        
        // API configurations
        this.apis = {
            // EliteProTech API (for .chatgpt command)
            eliteprotech: {
                url: "https://eliteprotech-apis.zone.id/copilot",
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                transformRequest: (message) => ({
                    message: message
                }),
                transformResponse: (data) => data.text || data.response || data
            },
            
            // Llama API (for .llama command)
            llama: {
                url: "https://api.gurusensei.workers.dev/llama",
                method: "GET",
                params: (message) => ({
                    prompt: message
                }),
                transformResponse: (data) => data.response?.response || data.text || data
            },
            
            // Cloudflare Worker (for .megan command ONLY)
            cloudflare: {
                url: "https://late-salad-9d56.youngwanga254.workers.dev",
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                transformRequest: (message, model = '@cf/meta/llama-3.1-8b-instruct') => ({
                    prompt: message,
                    model: model
                }),
                transformResponse: (data) => data.data?.response || data
            },
            
            // Gemini API
            gemini: {
                url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
                method: "POST",
                headers: (apiKey) => ({
                    'Content-Type': 'application/json'
                }),
                params: (apiKey) => ({
                    key: apiKey
                }),
                transformRequest: (message) => ({
                    contents: [{
                        parts: [{ text: message }]
                    }]
                }),
                transformResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text || data
            }
        };
        
        // Gemini API keys
        this.geminiKeys = [
            "AIzaSyBVA4dfVb9i--tv6i46nFnk_R6op4eKXA4",
            "AIzaSyAGjBqv2TfDk5BBmWAr4nj3Q5BMcRu6ddo"
        ];
        this.currentGeminiKey = 0;
        
        // Megan chat history storage (auto-clear after 10 minutes)
        this.meganHistory = new Map();
        this.maxHistory = 10;
        
        // Start cleanup interval for Megan history
        this.startCleanupInterval();
        
        // Megan model setting
        this.meganModel = '@cf/meta/llama-3.1-8b-instruct';
    }
    
    // Start auto-cleanup for Megan history (every 10 minutes)
    startCleanupInterval() {
        setInterval(() => {
            this.cleanupOldHistory();
        }, 10 * 60 * 1000); // 10 minutes
    }
    
    // Cleanup old history
    cleanupOldHistory() {
        const now = Date.now();
        const tenMinutesAgo = now - (10 * 60 * 1000);
        
        for (const [userId, history] of this.meganHistory.entries()) {
            const filtered = history.filter(msg => msg.timestamp > tenMinutesAgo);
            if (filtered.length === 0) {
                this.meganHistory.delete(userId);
            } else {
                this.meganHistory.set(userId, filtered);
            }
        }
        
        console.log(`๐งน Cleaned Megan chat history (older than 10 minutes)`);
    }
    
    // ==================== MEGAN AI SPECIFIC ====================
    
    // Get response from Megan AI (Cloudflare)
    async meganAI(message, userId) {
        try {
            const config = this.apis.cloudflare;
            
            // Create context-aware prompt for Megan
            const contextPrompt = this.createMeganPrompt(userId, message);
            
            const response = await axios({
                method: config.method,
                url: config.url,
                headers: config.headers,
                data: config.transformRequest(contextPrompt, this.meganModel),
                timeout: 20000
            });
            
            let result = config.transformResponse(response.data);
            
            // Apply Megan-specific formatting
            result = this.formatMeganResponse(result);
            
            // Add to Megan history
            this.addToMeganHistory(userId, 'assistant', result);
            
            return result;
        } catch (error) {
            console.error("Megan AI error:", error.message);
            return this.getMeganFallback();
        }
    }
    
    // Create Megan-specific prompt with history
    createMeganPrompt(userId, message) {
        const history = this.getMeganHistory(userId);
        
        if (history.length === 0) {
            return `You are Megan AI, a helpful assistant created by ${this.config.ownerName}, made in ${this.config.country}. 
            Your website is ${this.config.website}. 
            Be friendly, helpful, and concise in your responses.
            
            User: ${message}`;
        }
        
        let context = `You are Megan AI, a helpful assistant created by ${this.config.ownerName} in ${this.config.country}.
        Website: ${this.config.website}
        Conversation history:\n\n`;
        
        history.forEach(msg => {
            const role = msg.role === 'user' ? 'User' : 'Megan AI';
            context += `${role}: ${msg.content}\n`;
        });
        
        context += `\nUser: ${message}`;
        return context;
    }
    
    // Format Megan response with proper branding
    formatMeganResponse(text) {
        // Remove any "Cloudflare AI" mentions
        text = text.replace(/Cloudflare AI/g, 'Megan AI');
        text = text.replace(/cloudflare ai/gi, 'Megan AI');
        
        // Ensure proper creator name
        text = text.replace(/youngwanga254/gi, this.config.ownerName);
        text = text.replace(/youngwanga254@gmail.com/gi, this.config.ownerName);
        
        return text;
    }
    
    // Megan fallback response
    getMeganFallback() {
        const responses = [
            `I'm Megan AI, a helpful assistant created by ${this.config.ownerName} in ${this.config.country}. My website is ${this.config.website}. I'm having trouble connecting right now, but you can try again shortly!`,
            `Hi there! I'm Megan AI, created by ${this.config.ownerName}. Currently experiencing connection issues. Please try again in a moment.`,
            `Megan AI here! Created in ${this.config.country} by ${this.config.ownerName}. I'm temporarily unavailable, but will be back soon!`
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }
    
    // Get Megan history
    getMeganHistory(userId) {
        if (!this.meganHistory.has(userId)) {
            this.meganHistory.set(userId, []);
        }
        return this.meganHistory.get(userId);
    }
    
    // Add to Megan history
    addToMeganHistory(userId, role, content) {
        const history = this.getMeganHistory(userId);
        history.push({ role, content, timestamp: Date.now() });
        
        // Keep only last N messages
        if (history.length > this.maxHistory) {
            this.meganHistory.set(userId, history.slice(-this.maxHistory));
        }
    }
    
    // Clear Megan history
    clearMeganHistory(userId) {
        this.meganHistory.delete(userId);
    }
    
    // Set Megan model
    setMeganModel(model) {
        const validModels = [
            '@cf/meta/llama-3.1-8b-instruct',
            '@hf/thebloke/llama-2-13b-chat-awq'
        ];
        
        if (validModels.includes(model)) {
            this.meganModel = model;
            return true;
        }
        return false;
    }
    
    // Get current Megan model
    getMeganModel() {
        return this.meganModel;
    }
    
    // ==================== OTHER AI SERVICES (No History) ====================
    
    // Get response from EliteProTech (.chatgpt command)
    async chatgptAI(message) {
        try {
            const config = this.apis.eliteprotech;
            const response = await axios({
                method: config.method,
                url: config.url,
                headers: config.headers,
                data: config.transformRequest(message),
                timeout: 15000
            });
            
            let result = config.transformResponse(response.data);
            
            // Format ChatGPT response
            return this.formatChatGPTResponse(result);
        } catch (error) {
            console.error("ChatGPT API error:", error.message);
            return "I'm having trouble connecting to the AI service right now. Please try again in a moment!";
        }
    }
    
    // Format ChatGPT response
    formatChatGPTResponse(text) {
        // Clean up response
        text = text.replace(/EliteProTech/gi, '');
        text = text.replace(/eliteprotech/gi, '');
        text = text.trim();
        
        return text;
    }
    
    // Get response from Llama (.llama command)
    async llamaAI(message) {
        try {
            const config = this.apis.llama;
            const response = await axios({
                method: config.method,
                url: config.url,
                params: config.params(message),
                timeout: 15000
            });
            
            let result = config.transformResponse(response.data);
            
            // Format Llama response
            return this.formatLlamaResponse(result);
        } catch (error) {
            console.error("Llama API error:", error.message);
            return "The llama seems to be resting right now! Try again shortly.";
        }
    }
    
    // Format Llama response
    formatLlamaResponse(text) {
        // Clean up response
        text = text.replace(/Guru/gi, '');
        text = text.trim();
        
        return text;
    }
    
    // Get response from Gemini (.gemini command)
    async geminiAI(message) {
        let lastError = null;
        
        // Try all available keys
        for (let i = 0; i < this.geminiKeys.length; i++) {
            const keyIndex = (this.currentGeminiKey + i) % this.geminiKeys.length;
            const apiKey = this.geminiKeys[keyIndex];
            
            try {
                const config = this.apis.gemini;
                const response = await axios({
                    method: config.method,
                    url: config.url,
                    headers: config.headers(apiKey),
                    params: config.params(apiKey),
                    data: config.transformRequest(message),
                    timeout: 20000
                });
                
                let result = config.transformResponse(response.data);
                
                // Rotate to next key for next request
                this.currentGeminiKey = (keyIndex + 1) % this.geminiKeys.length;
                
                // Format Gemini response
                return this.formatGeminiResponse(result);
            } catch (error) {
                lastError = error;
                console.error(`Gemini API key ${keyIndex + 1} failed:`, error.message);
                continue;
            }
        }
        
        console.error("All Gemini keys failed:", lastError?.message);
        return "Google Gemini AI is currently unavailable. Try another AI command!";
    }
    
    // Format Gemini response
    formatGeminiResponse(text) {
        // Clean up response
        text = text.replace(/Google/gi, '');
        text = text.replace(/Gemini/gi, '');
        text = text.trim();
        
        return text;
    }
    
    // ==================== RESPONSE FORMATTING ====================
    
    // Format Megan final response with proper branding
    formatFinalMeganResponse(text) {
        return `*๐ค– Megan AI:*\n${text}\n\n> created by Wanga\n_๐’ก Powered by Megan MD_`;
    }
    
    // Format ChatGPT final response
    formatFinalChatGPTResponse(text) {
        return `*๐’ฌ ChatGPT:*\n${text}\n\n> created by Wanga\n_๐’ก Powered by Megan MD_`;
    }
    
    // Format Llama final response
    formatFinalLlamaResponse(text) {
        return `*๐ฆ Llama AI:*\n${text}\n\n> created by Wanga\n_๐’ก Powered by Megan MD_`;
    }
    
    // Format Gemini final response
    formatFinalGeminiResponse(text) {
        return `*โจ Gemini AI:*\n${text}\n\n> created by Wanga\n_๐’ก Powered by Megan MD_`;
    }
}

module.exports = AIHandler;
