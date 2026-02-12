const fs = require('fs');
const path = require('path');

class CommandHandler {
    constructor(bot) {
        this.bot = bot;
        this.commands = new Map();
        this.aliases = new Map();
        this.loadCommands();
    }

    loadCommands() {
        const commandsDir = path.join(__dirname);

        // Get ALL .js files in the commands directory
        const allFiles = fs.readdirSync(commandsDir);

        // SIMPLE FILTER - only exclude index.js and obvious backups
        const commandFiles = allFiles.filter(file => {
            // Must be .js file
            if (!file.endsWith('.js')) return false;
            
            // ONLY skip the main index.js file
            if (file === 'index.js') return false;
            
            // Skip actual backup files (optional)
            if (file.includes('.backup.') || file.endsWith('.backup.js')) return false;
            
            // ALL other .js files are command files - INCLUDING basic.js, media.js, etc.
            return true;
        });

        this.bot.logger.log(`Found ${commandFiles.length} command files: ${commandFiles.join(', ')}`, 'success', '📁');

        let totalCommands = 0;
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsDir, file);

            try {
                // Clear require cache to allow hot reload
                delete require.cache[require.resolve(filePath)];
                
                const commandModule = require(filePath);
                
                // Check if it's a function that returns commands array
                if (typeof commandModule === 'function') {
                    const commands = commandModule(this.bot);
                    
                    if (Array.isArray(commands)) {
                        commands.forEach(cmd => {
                            if (cmd && cmd.name && typeof cmd.execute === 'function') {
                                this.registerCommand(cmd);
                                totalCommands++;
                            } else {
                                this.bot.logger.log(`Invalid command in ${file}: missing name or execute`, 'warn', '⚠️');
                            }
                        });

                        this.bot.logger.log(`✅ Loaded ${commands.length} commands from ${file}`, 'success', '📦');
                    } else {
                        this.bot.logger.log(`⚠️ ${file} did not return an array`, 'warn', '⚠️');
                    }
                } else {
                    this.bot.logger.log(`⏭️ Skipping ${file} - not a function`, 'debug', '⏭️');
                }
            } catch (error) {
                this.bot.logger.error(error, `CommandHandler.loadCommands (${file})`);
            }
        }
        
        this.bot.logger.log(`✅ TOTAL COMMANDS LOADED: ${totalCommands}`, 'success', '🚀');
        this.bot.logger.log(`📋 Command list: ${Array.from(this.commands.keys()).sort().join(', ')}`, 'info', '📋');
    }

    registerCommand(command) {
        if (!command || !command.name || !command.execute) {
            this.bot.logger.log(`Invalid command structure`, 'error', '❌');
            return;
        }

        const commandName = command.name.toLowerCase();
        
        // Don't register duplicate commands
        if (this.commands.has(commandName)) {
            this.bot.logger.log(`⚠️ Duplicate command: ${commandName} - skipping`, 'debug', '⚠️');
            return;
        }
        
        this.commands.set(commandName, command);
        
        // Register aliases
        if (command.aliases && Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                const aliasLower = alias.toLowerCase();
                if (!this.aliases.has(aliasLower)) {
                    this.aliases.set(aliasLower, commandName);
                }
            });
        }
        
        this.bot.logger.log(`➕ Registered: ${commandName}`, 'debug', '➕');
    }

    async handleCommand(msg, text, from, sender, isGroup) {
        // Extract command name and args
        const commandText = text.slice(this.bot.settings.PREFIX.length).trim();
        const parts = commandText.split(/ +/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        this.bot.logger.log(`🔍 Command received: ${commandName}`, 'info', '🔍');

        // Find command
        let command = this.commands.get(commandName);
        if (!command && this.aliases.has(commandName)) {
            const mainCommandName = this.aliases.get(commandName);
            command = this.commands.get(mainCommandName);
        }
        
        if (!command) {
            // Command not found
            const similarCommands = this.getSimilarCommands(commandName);
            let suggestion = '';
            if (similarCommands.length > 0) {
                suggestion = `\n\nDid you mean: ${similarCommands.slice(0, 3).map(cmd => `*${this.bot.settings.PREFIX}${cmd}*`).join(', ')}?`;
            }
            
            await this.bot.sock.sendMessage(from, {
                text: `❌ Unknown command: *${commandName}*${suggestion}\n\nType *${this.bot.settings.PREFIX}help* to see available commands.`
            }, { quoted: msg });
            return;
        }
        
        // Check group-only commands
        if (command.groupOnly && !isGroup) {
            await this.bot.sock.sendMessage(from, {
                text: `❌ This command only works in groups.`
            }, { quoted: msg });
            return;
        }

        // Check owner-only commands
        if (command.ownerOnly) {
            const ownerJid = `${this.bot.settings.OWNER_PHONE}@s.whatsapp.net`;
            if (sender !== ownerJid) {
                await this.bot.sock.sendMessage(from, {
                    text: `❌ This command is only for the bot owner.`
                }, { quoted: msg });
                return;
            }
        }

        this.bot.logger.command(commandName, sender, isGroup ? from : '');
        
        // Optional delay
        if (this.bot.settings.REPLY_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, this.bot.settings.REPLY_DELAY));
        }

        // Execute command with ALL parameters
        try {
            await command.execute({
                msg,
                from,
                sender,
                isGroup,
                args,
                command: commandName,
                text: commandText,
                bot: this.bot,
                sock: this.bot.sock
            });
        } catch (error) {
            this.bot.logger.error(error, `CommandHandler.handleCommand (${commandName})`);
            
            // Send user-friendly error
            const errorMessage = error.message || 'Unknown error';
            await this.bot.sock.sendMessage(from, {
                text: `❌ Error executing command: ${errorMessage.substring(0, 100)}`
            }, { quoted: msg });
        }
    }

    getSimilarCommands(input) {
        const commands = Array.from(this.commands.keys());
        return commands.filter(cmd => 
            cmd.includes(input) || 
            input.includes(cmd) || 
            this.calculateLevenshtein(cmd, input) < 3
        ).slice(0, 5);
    }

    calculateLevenshtein(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[b.length][a.length];
    }

    getAllCommands() {
        return Array.from(this.commands.values());
    }

    getCommand(name) {
        const cmd = this.commands.get(name.toLowerCase());
        if (cmd) return cmd;
        const alias = this.aliases.get(name.toLowerCase());
        if (alias) return this.commands.get(alias);
        return null;
    }

    reloadCommands() {
        this.bot.logger.log('🔄 Reloading all commands...', 'info', '🔄');
        this.commands.clear();
        this.aliases.clear();
        this.loadCommands();
        this.bot.logger.log('✅ Commands reloaded successfully', 'success', '✅');
        return true;
    }
}

module.exports = CommandHandler;