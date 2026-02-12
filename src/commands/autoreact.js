// src/commands/autoreact.js
const CHANNEL_JID = "grandma-newsroom-forever@newsletter";
const BOT_IMAGE = "https://files.catbox.moe/jqktip.jpg";

const createNewsletterContext = (userJid, options = {}) => ({
    contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: CHANNEL_JID,
            newsletterName: options.newsletterName || "MEGAN-MD",
            serverMessageId: Math.floor(100000 + Math.random() * 900000)
        },
        externalAdReply: {
            title: options.title || "📢 Official Channel",
            body: options.body || "Join for updates & announcements",
            thumbnailUrl: options.thumbnail || BOT_IMAGE,
            mediaType: 1,
            mediaUrl: "https://whatsapp.com/channel/0029VbCWWXi9hXF2SXUHgZ1b",
            sourceUrl: "https://whatsapp.com/channel/0029VbCWWXi9hXF2SXUHgZ1b",
            showAdAttribution: true,
            renderLargerThumbnail: true
        }
    }
});

module.exports = (bot) => {
    const commands = [];

    // AutoReact main command
    commands.push({
        name: 'autoreact',
        description: 'Auto-react to messages',
        aliases: ['ar'],
        category: 'Settings',
        async execute({ msg, from, bot, args }) {
            if (!bot.autoReact) {
                return bot.sock.sendMessage(from, {
                    text: '❌ AutoReact system not initialized',
                    ...createNewsletterContext(msg.key.remoteJid)
                }, { quoted: msg });
            }

            if (args.length === 0) {
                const status = bot.autoReact.getStatus();
                const statusText = status.enabled ? '✅ ON' : '❌ OFF';
                const modeText = status.mode.toUpperCase();
                
                return bot.sock.sendMessage(from, {
                    text: `🤖 *AUTO-REACT SYSTEM*\n\n` +
                          `Status: ${statusText}\n` +
                          `Mode: ${modeText}\n` +
                          `Emojis: ${status.emojiCount}+ emojis\n` +
                          `Recent reactions: ${status.lastReactedCount}\n\n` +
                          `📝 *Usage:*\n` +
                          `.autoreact on - Turn ON for all chats\n` +
                          `.autoreact off - Turn OFF\n` +
                          `.autoreact dm - Only in DMs\n\n` +
                          `> created by wanga`,
                    ...createNewsletterContext(msg.key.remoteJid, {
                        title: "🤖 Auto-React System",
                        body: "Auto react to messages with emojis"
                    })
                }, { quoted: msg });
            }

            const action = args[0].toLowerCase();
            let response = '';

            switch (action) {
                case 'on':
                    bot.autoReact.toggle(true, 'on');
                    response = '✅ Auto-react turned ON for all chats\n\nI will react to every message with random emojis!';
                    break;
                    
                case 'off':
                    bot.autoReact.toggle(false, 'off');
                    response = '❌ Auto-react turned OFF';
                    break;
                    
                case 'dm':
                    bot.autoReact.toggle(true, 'dm');
                    response = '💬 Auto-react turned ON for DMs only\n\nI will only react to messages in private chats.';
                    break;
                    
                default:
                    response = '❌ Invalid option\n\nUse: .autoreact on/off/dm';
                    break;
            }

            await bot.sock.sendMessage(from, {
                text: response,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "🤖 Auto-React Updated",
                    body: "Settings updated successfully"
                })
            }, { quoted: msg });
        }
    });

    return commands;
};
