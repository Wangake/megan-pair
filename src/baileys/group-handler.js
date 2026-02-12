class GroupHandler {
    constructor(bot, config, logger) {
        this.bot = bot;
        this.config = config;
        this.logger = logger;
        this.groupCache = new Map();
        this.groupSettings = new Map();
    }

    async handleGroupsUpdate(updates) {
        for (const update of updates) {
            const { id, subject, desc, announce, restrict, membershipApprovalMode } = update;
            
            if (id) {
                // Update cache
                this.groupCache.set(id, {
                    ...(this.groupCache.get(id) || {}),
                    subject,
                    desc,
                    announce,
                    restrict,
                    membershipApprovalMode
                });

                this.logger.log(`Group updated: ${subject || id}`, 'info', '👥');
            }
        }
    }

    async handleGroupParticipantsUpdate(update) {
        const { id, participants, action } = update;
        
        if (!id || !participants || !action) return;

        const groupMetadata = await this.getGroupMetadata(id);
        const groupName = groupMetadata?.subject || id.split('@')[0];

        for (const participant of participants) {
            const user = participant.split('@')[0];
            
            switch (action) {
                case 'add':
                    this.logger.log(`User ${user} added to ${groupName}`, 'info', '➕');
                    await this.handleWelcomeMessage(id, participant);
                    break;
                    
                case 'remove':
                    this.logger.log(`User ${user} removed from ${groupName}`, 'info', '➖');
                    break;
                    
                case 'promote':
                    this.logger.log(`User ${user} promoted to admin in ${groupName}`, 'info', '👑');
                    break;
                    
                case 'demote':
                    this.logger.log(`User ${user} demoted from admin in ${groupName}`, 'info', '👤');
                    break;
            }
        }
    }

    async getGroupMetadata(jid) {
        if (!jid.endsWith('@g.us')) return null;

        try {
            // Check cache first
            if (this.groupCache.has(jid)) {
                return this.groupCache.get(jid);
            }

            // Fetch from WhatsApp
            const metadata = await this.bot.groupMetadata(jid);
            this.groupCache.set(jid, metadata);
            
            // Set cache timeout (5 minutes)
            setTimeout(() => {
                this.groupCache.delete(jid);
            }, 5 * 60 * 1000);

            return metadata;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.getGroupMetadata');
            return null;
        }
    }

    async getGroupAdmins(jid) {
        try {
            const metadata = await this.getGroupMetadata(jid);
            if (!metadata) return [];

            return metadata.participants
                .filter(p => p.admin !== null)
                .map(p => p.id);
        } catch (error) {
            this.logger.error(error, 'GroupHandler.getGroupAdmins');
            return [];
        }
    }

    async isUserAdmin(jid, userId) {
        try {
            const admins = await this.getGroupAdmins(jid);
            return admins.includes(userId);
        } catch (error) {
            this.logger.error(error, 'GroupHandler.isUserAdmin');
            return false;
        }
    }

    async isBotAdmin(jid) {
        const botId = this.bot.user?.id;
        if (!botId) return false;
        
        return this.isUserAdmin(jid, botId);
    }

    async tagAllMembers(jid, message = '') {
        try {
            const metadata = await this.getGroupMetadata(jid);
            if (!metadata) return false;

            const participants = metadata.participants.map(p => p.id);
            let tagMessage = message || '📢 *Attention All Members!*\n\n';
            
            participants.forEach((participant, index) => {
                tagMessage += `@${participant.split('@')[0]} `;
                if ((index + 1) % 5 === 0) tagMessage += '\n';
            });

            await this.bot.sendMessage(jid, {
                text: tagMessage,
                mentions: participants
            });

            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.tagAllMembers');
            return false;
        }
    }

    async tagAdmins(jid, message = '') {
        try {
            const admins = await this.getGroupAdmins(jid);
            if (admins.length === 0) return false;

            let tagMessage = message || '👑 *Attention Admins!*\n\n';
            admins.forEach((admin, index) => {
                tagMessage += `@${admin.split('@')[0]} `;
                if ((index + 1) % 5 === 0) tagMessage += '\n';
            });

            await this.bot.sendMessage(jid, {
                text: tagMessage,
                mentions: admins
            });

            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.tagAdmins');
            return false;
        }
    }

    async promoteUsers(jid, users) {
        try {
            await this.bot.groupParticipantsUpdate(jid, users, 'promote');
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.promoteUsers');
            return false;
        }
    }

    async demoteUsers(jid, users) {
        try {
            await this.bot.groupParticipantsUpdate(jid, users, 'demote');
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.demoteUsers');
            return false;
        }
    }

    async addUsers(jid, users) {
        try {
            await this.bot.groupParticipantsUpdate(jid, users, 'add');
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.addUsers');
            return false;
        }
    }

    async removeUsers(jid, users) {
        try {
            await this.bot.groupParticipantsUpdate(jid, users, 'remove');
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.removeUsers');
            return false;
        }
    }

    async getInviteLink(jid) {
        try {
            const code = await this.bot.groupInviteCode(jid);
            return `https://chat.whatsapp.com/${code}`;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.getInviteLink');
            return null;
        }
    }

    async revokeInviteLink(jid) {
        try {
            await this.bot.groupRevokeInvite(jid);
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.revokeInviteLink');
            return false;
        }
    }

    async updateGroupSettings(jid, settings) {
        try {
            // Save settings to cache/database
            this.groupSettings.set(jid, {
                ...(this.groupSettings.get(jid) || {}),
                ...settings
            });

            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.updateGroupSettings');
            return false;
        }
    }

    async getGroupSettings(jid) {
        return this.groupSettings.get(jid) || {
            antiLink: true,
            antiSpam: true,
            welcomeMessage: true,
            antiTagAdmin: true,
            autoSticker: false,
            autoReply: false,
            autoReact: false
        };
    }

    async handleWelcomeMessage(jid, userId) {
        const settings = await this.getGroupSettings(jid);
        
        if (settings.welcomeMessage) {
            const metadata = await this.getGroupMetadata(jid);
            const userName = userId.split('@')[0];
            const groupName = metadata?.subject || 'the group';
            
            const welcomeMessage = `👋 Welcome @${userName} to ${groupName}!\n\n` +
                                 `Please read the group rules and introduce yourself.`;
            
            await this.bot.sendMessage(jid, {
                text: welcomeMessage,
                mentions: [userId]
            });
        }
    }

    async createPoll(jid, pollName, pollOptions) {
        try {
            await this.bot.sendMessage(jid, {
                poll: {
                    name: pollName,
                    values: pollOptions,
                    selectableCount: 1
                }
            });
            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.createPoll');
            return false;
        }
    }

    async sendAnnouncement(jid, message) {
        try {
            const metadata = await this.getGroupMetadata(jid);
            const participants = metadata?.participants?.map(p => p.id) || [];

            await this.bot.sendMessage(jid, {
                text: `📢 *ANNOUNCEMENT*\n\n${message}`,
                mentions: participants
            });

            return true;
        } catch (error) {
            this.logger.error(error, 'GroupHandler.sendAnnouncement');
            return false;
        }
    }
}

module.exports = GroupHandler;
