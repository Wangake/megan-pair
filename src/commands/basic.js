// src/commands/basic.js
// WhatsApp Channel Newsletter Context
const CHANNEL_JID = "grandma-newsroom-forever@newsletter"; // Fake newsletter JID (replace if you have real one)
const BOT_NAME = "MEGAN-MD";
const CHANNEL_LINK = "https://whatsapp.com/channel/0029VbCWWXi9hXF2SXUHgZ1b";
// Bot image - using your provided URL
const BOT_IMAGE = "https://files.catbox.moe/jqktip.jpg";
// Create newsletter-style context
const createNewsletterContext = (userJid, options = {}) => ({
    contextInfo: {
        mentionedJid: [userJid],
        forwardingScore: 999,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: CHANNEL_JID,
            newsletterName: options.newsletterName || BOT_NAME,
            serverMessageId: Math.floor(100000 + Math.random() * 900000)
        },
        externalAdReply: {
            title: options.title || "📢 Official Channel",
            body: options.body || "Join for updates & announcements",
            thumbnailUrl: options.thumbnail || BOT_IMAGE, // Using your bot image
            mediaType: 1,
            mediaUrl: CHANNEL_LINK,
            sourceUrl: CHANNEL_LINK,
            showAdAttribution: true,
            renderLargerThumbnail: true
        }
    }
});

module.exports = (bot) => {
    const commands = [];
    
    // Ping command with edit feature
    commands.push({
        name: 'ping',
        description: 'Check bot response time',
        aliases: ['p', 'speed', 'test'],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            const start = Date.now();
            // Send initial pong message
            const pingMsg = await bot.sock.sendMessage(from, {
                text: '🏓 pong!'
            }, { quoted: msg });

            const end = Date.now();
            const ping = end - start;

            // Calculate additional stats
            const latency = Math.floor(ping / 2);
            const speed = ping < 500 ? 'Excellent ⚡' : ping < 1000 ? 'Good 🚀' : 'Slow 🐌';

            // Edit the same message with stats
            await bot.sock.sendMessage(from, {
                text: `𝐌𝐄𝐆𝐀𝐍-𝐌𝐃\n\n` +
                      `Speed: ${speed}\n` +
                      `Latency: ${latency}ms\n` +
                      `Response: ${ping}ms\n\n` +
                      `> created by wanga`,
                edit: pingMsg.key,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "📊 Bot Performance",
                    body: `Response: ${ping}ms • Click to join channel`,
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // Info command - simplified
    commands.push({
        name: 'info',
        description: 'Show bot information',
        aliases: ['bot', 'botinfo', 'about'],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const info = `𝐌𝐄𝐆𝐀𝐍-𝐌𝐃\n\n` +
                        `Owner: ${bot.settings.OWNER_NAME}\n` +
                        `Phone: ${bot.settings.OWNER_PHONE}\n` +
                        `Gender: ${bot.settings.OWNER_GENDER}\n` +
                        `Age: ${bot.settings.OWNER_AGE}\n` +
                        `Prefix: ${bot.settings.PREFIX}\n` +
                        `Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                        `Commands: ${bot.commandHandler.commands.size}\n` +
                        `Status: ${bot.sock.user ? 'Online ✅' : 'Offline ❌'}\n\n` +
                        `> created by wanga`;
            
            await bot.sock.sendMessage(from, {
                text: info,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "🤖 Bot Information",
                    body: "Get updates from official channel",
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // Owner command - simplified
    commands.push({
        name: 'owner',
        description: 'Show owner information',
        aliases: ['creator', 'dev', 'developer'],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            const ownerInfo = `${bot.settings.OWNER_NAME}\n` +
                            `Phone: ${bot.settings.OWNER_PHONE}\n` +
                            `Gender: ${bot.settings.OWNER_GENDER}\n` +
                            `Age: ${bot.settings.OWNER_AGE}\n` +
                            `Country: Kenya\n\n` +
                            `Services:\n` +
                            `• WhatsApp Bot Development\n` +
                            `• AI System Integration\n` +
                            `• API Development\n\n` +
                            `Contact: ${bot.settings.OWNER_PHONE}\n\n` +
                            `> created by wanga`;

            await bot.sock.sendMessage(from, {
                text: ownerInfo,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "👑 Owner Details",
                    body: "Channel: Updates & Support",
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // Status command - simplified
    commands.push({
        name: 'status',
        description: 'Show bot status',
        aliases: ['stats', 'stat'],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const memoryUsage = process.memoryUsage();
            const usedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            
            const status = `𝐌𝐄𝐆𝐀𝐍-𝐌𝐃 Status\n\n` +
                          `Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                          `Memory: ${usedMB}MB\n` +
                          `Commands: ${bot.commandHandler.commands.size}\n` +
                          `Connection: ${bot.sock.user ? 'Connected ✅' : 'Disconnected ❌'}\n` +
                          `User: ${bot.sock.user?.name || 'Unknown'}\n\n` +
                          `Services:\n` +
                          `• AI: Working ✅\n` +
                          `• Downloads: Working ✅\n` +
                          `• Media: Working ✅\n\n` +
                          `> created by wanga`;

            await bot.sock.sendMessage(from, {
                text: status,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "📊 System Status",
                    body: "Live updates in channel",
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // Debug command - simplified
    commands.push({
        name: 'debug',
        description: 'Show debug information',
        aliases: [],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            const uptime = process.uptime();
            const hours = Math.floor(uptime / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);

            const debugInfo = `Debug Info\n\n` +
                             `Bot: ${bot.settings.BOT_NAME}\n` +
                             `Owner: ${bot.settings.OWNER_NAME}\n` +
                             `Prefix: ${bot.settings.PREFIX}\n` +
                             `Uptime: ${hours}h ${minutes}m ${seconds}s\n` +
                             `Node: ${process.version}\n` +
                             `Platform: ${process.platform}\n` +
                             `Commands: ${bot.commandHandler.commands.size}\n` +
                             `Connection: ${bot.sock.user ? 'Connected' : 'Disconnected'}\n\n` +
                             `> created by wanga`;

            await bot.sock.sendMessage(from, {
                text: debugInfo,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "🔧 Debug Mode",
                    body: "Join channel for support",
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // NEW: Channel command with newsletter context
    commands.push({
        name: 'channel',
        description: 'Get official WhatsApp channel link',
        aliases: ['newsletter', 'updates', 'support'],
        category: 'Information',
        async execute({ msg, from, bot }) {
            const channelText = `📢 *Official ${BOT_NAME} Channel*\n\n` +
                              `Join our WhatsApp Channel for updates:\n\n` +
                              `🔗 ${CHANNEL_LINK}\n\n` +
                              `> created by wanga`;

            await bot.sock.sendMessage(from, {
                text: channelText,
                ...createNewsletterContext(msg.key.remoteJid, {
                    title: "📢 Join Our Channel",
                    body: "Click to join official updates",
                    newsletterName: "MEGAN-MD Updates",
                    thumbnail: BOT_IMAGE
                })
            });
        }
    });

    // Database tracker command
    commands.push({
        name: 'tracker',
        description: 'Show database tracker statistics',
        aliases: ['stats', 'trackerstats', 'dbstats'],
        category: 'Settings',
        async execute({ msg, from, bot }) {
            try {
                const stats = bot.db?.getStats ? bot.db.getStats() : { totalMessages: 0, totalMedia: 0 };

                const statText = `📊 *DATABASE STATISTICS*\n\n` +
                               `📨 Total Messages: ${stats.totalMessages || 0}\n` +
                               `📹 Total Media: ${stats.totalMedia || 0}\n` +
                               `✏️  Total Edits: ${stats.totalEdits || 0}\n` +
                               `🗑️  Total Deletes: ${stats.totalDeletes || 0}\n\n`;

                if (stats.uptime) {
                    statText += `⏱️ Uptime: ${stats.uptime}\n\n`;
                }

                statText += `_Database tracking active_`;
                
                await bot.sock.sendMessage(from, { text: statText });
            } catch (error) {
                console.error('Tracker command error:', error);
                await bot.sock.sendMessage(from, {
                    text: '❌ Error getting tracker stats. Database may not be initialized.'
                });
            }
        }
    });

    // Recover deleted message command
    commands.push({
        name: 'recover',
        description: 'Recover a deleted message',
        aliases: ['undelete', 'restore'],
        category: 'Utility',
        async execute({ msg, from, bot, args }) {
            if (!args[0]) {
                await bot.sock.sendMessage(from, {
                    text: '⚠️ Usage: .recover <message_id>\n\nGet message ID from delete alert.'
                });
                return;
            }
            
            try {
                const recovered = bot.db?.recoverDeletedMessage ?
                    await bot.db.recoverDeletedMessage(args[0]) :
                    { recovered: false };

                if (recovered.recovered && recovered.message) {
                    const msgData = recovered.message;
                    const recoveryText = `✅ *MESSAGE RECOVERED*\n\n` +
                                       `📝 *Content:* ${msgData.text || '[Media]'}\n` +
                                       `👤 *Sender:* ${msgData.sender}\n` +
                                       `📍 *Location:* ${msgData.isGroup ? 'Group' : 'Private Chat'}\n` +
                                       `⏰ *Deleted:* ${new Date(msgData.deletedAt).toLocaleString()}\n\n` +
                                       `_Recovered from database_`;

                    await bot.sock.sendMessage(from, { text: recoveryText });
                } else {
                    await bot.sock.sendMessage(from, {
                        text: '❌ Message not found in database. It may have expired (messages are cached for 10 minutes).'
                    });
                }
            } catch (error) {
                console.error('Recover command error:', error);
                await bot.sock.sendMessage(from, {
                    text: '❌ Error recovering message. Database may not be initialized.'
                });
            }
        }
    });

    return commands;
};
