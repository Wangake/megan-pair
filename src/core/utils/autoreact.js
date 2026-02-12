const fs = require('fs-extra');
const path = require('path');

class AutoReact {
    constructor(bot) {
        this.bot = bot;
        this.emojiList = this.getAllEmojis();
        this.settings = {
            enabled: false,
            mode: 'off'
        };
        this.lastReacted = new Map(); // Store this separately
        this.loadSettings();
    }

    getAllEmojis() {
        return [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
            '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
            '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
            '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
            '😖', '😫', '😩', '🥺', '😢', '😭', '😤.', '😠', '😡', '🤬',
            '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗',
            '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯',
            '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
            '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈',
            '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾',
            '🤖', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
            '❤️‍🔥', '❤️‍🩹', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
            '🔥', '✨', '🌟', '💫', '⭐', '☄️', '💥', '💢', '💦', '💨',
            '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '👋', '🤚', '🖐️',
            '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈',
            '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛',
            '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳',
            '💪', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🦷', '🦴', '👀',
            '🎉', '🎊', '🎈', '🎁', '🎀', '🎗️', '🎟️', '🎫', '🎖️', '🏆',
            '🥇', '🥈', '🥉', '⚽', '⚾', '🏀', '🏐', '🏈', '🏉', '🎾',
            '🏓', '🏸', '🥅', '🏒', '🏑', '🥍', '🏏', '🎱', '🪀', '🏹',
            '🎣', '🥊', '🥋', '🎽', '🛹', '🛼', '⛸️', '🎿', '⛷️', '🏂',
            '🪂', '🏋️', '🤼', '🤸', '🤺', '⛹️', '🤾', '🏌️', '🏇', '🧘',
            '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏',
            '🍐', '🍑', '🍒', '🍓', '🥝', '🍅', '🥥', '🥑', '🍆', '🥔',
            '🥕', '🌽', '🌶️', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜',
            '🌰', '🍞', '🥐', '🥖', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖',
            '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯',
            '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🥣', '🥗', '🍿', '🧈',
            '🧂', '🥫', '🍝', '🍜', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙'
        ];
    }

    loadSettings() {
        try {
            const settingsPath = path.join(__dirname, '../../database/autoreact.json');
            if (fs.existsSync(settingsPath)) {
                const data = fs.readJsonSync(settingsPath);
                this.settings = { ...this.settings, ...data };
                
                // Convert lastReacted from plain object to Map
                if (data.lastReacted && typeof data.lastReacted === 'object') {
                    this.lastReacted = new Map(Object.entries(data.lastReacted));
                }
            }
        } catch (error) {
            console.log('AutoReact: Using default settings');
        }
    }

    saveSettings() {
        try {
            const settingsPath = path.join(__dirname, '../../database/autoreact.json');
            const dir = path.dirname(settingsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Convert Map to plain object for JSON
            const dataToSave = {
                ...this.settings,
                lastReacted: Object.fromEntries(this.lastReacted)
            };
            
            fs.writeJsonSync(settingsPath, dataToSave);
        } catch (error) {
            console.error('AutoReact: Failed to save settings:', error);
        }
    }

    getRandomEmoji() {
        const randomIndex = Math.floor(Math.random() * this.emojiList.length);
        return this.emojiList[randomIndex];
    }

    shouldReact(jid, sender) {
        if (!this.settings.enabled) return false;
        
        const isDM = jid.endsWith('@s.whatsapp.net');
        
        switch (this.settings.mode) {
            case 'off':
                return false;
            case 'on':
                return true;
            case 'dm':
                return isDM;
            default:
                return false;
        }
    }

    async autoReact(msg) {
        try {
            const jid = msg.key.remoteJid;
            const sender = msg.key.participant || jid;
            
            if (!this.shouldReact(jid, sender)) {
                return false;
            }

            const now = Date.now();
            const lastReact = this.lastReacted.get(sender) || 0;
            const timeDiff = now - lastReact;
            
            if (timeDiff < 1000) { // 1 second cooldown (not 60 seconds)
                return false;
            }

            const emoji = this.getRandomEmoji();
            
            await this.bot.sock.sendMessage(jid, {
                react: {
                    text: emoji,
                    key: msg.key
                }
            });

            this.lastReacted.set(sender, now);
            this.saveSettings();

            console.log(`AutoReact: Reacted with ${emoji} to ${sender.split('@')[0]}`);
            return true;
        } catch (error) {
            console.error('AutoReact failed:', error.message);
            return false;
        }
    }

    toggle(state, mode = 'on') {
        this.settings.enabled = state;
        this.settings.mode = mode;
        this.saveSettings();
        return this.settings;
    }

    getStatus() {
        return {
            enabled: this.settings.enabled,
            mode: this.settings.mode,
            emojiCount: this.emojiList.length,
            lastReactedCount: this.lastReactedsize
        };
    }
}

module.exports = AutoReact;
