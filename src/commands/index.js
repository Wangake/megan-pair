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

        // Filter to get only .js files that are not index.js or backup/old files
        const commandFiles = allFiles.filter(file => {
            // Must be a .js file
            if (!file.endsWith('.js')) return false;

            // Skip index.js files
            if (file === 'index.js' || file.startsWith('index-')) return false;
            
            // Skip backup files (optional - remove these lines if you want to include backups)
            if (file.includes('backup')) return false;
            if (file.includes('-backup')) return false;
            if (file.endsWith('.backup.js')) return false;

            return true;
        });

        this.bot.logger.log(`Found ${commandFiles.length} command files`, 'info', '📁');

        let totalCommands = 0;
        
        for (const file of commandFiles) {
            const filePath = path.join(commandsDir, file);

            try {
                // Clear require cache to allow hot reload
                delete require.cache[require.resolve(filePath)];
                
                const commandModule = require(filePath);
                
                if (typeof commandModule === 'function') {
                    const commands = commandModule(this.bot);
                    
                    if (Array.isArray(commands)) {
                        commands.forEach(cmd => {
                            if (cmd && cmd.name && cmd.execute) {
                                this.registerCommand(cmd);
                                totalCommands++;
                            }
                        });

                        this.bot.logger.log(`Loaded ${commands.length} commands from ${file}`, 'info', '📦');
                    } else {
                        this.bot.logger.log(`Invalid command format in ${file} - expected array`, 'warn', '⚠️');
                    }
                } else {
                    this.bot.logger.log(`Skipping ${file} - not a valid command module`, 'warn', '⚠️');
                }
            } catch (error) {
                this.bot.logger.error(error, `CommandHandler.loadCommands (${file})`);
            }
        }
        
        this.bot.logger.log(`Total commands loaded: ${totalCommands}`, 'success', '✅');

        // Log available commands
        const commandList = Array.from(this.commands.keys()).sort();
        this.bot.logger.log(`Available commands: ${commandList.length} commands`, 'debug', '📋');

        // Log AI chat commands specifically
        const aiCommands = commandList.filter(cmd =>
            ['megan', 'chatgpt', 'llama', 'gemini', 'aimenu', 'clearmegan', 'changemeganmodel', 'aistatus'].includes(cmd)
        );
        if (aiCommands.length > 0) {
            this.bot.logger.log(`AI Chat Commands loaded: ${aiCommands.join(', ')}`, 'info', '🤖');
        }
        
        // Log AI Image commands specifically
        const aiImageCommands = commandList.filter(cmd =>
            ['flux', 'dream', 'generate', 'create', 'aimage'].includes(cmd)
        );
        if (aiImageCommands.length > 0) {
            this.bot.logger.log(`AI Image Commands loaded: ${aiImageCommands.join(', ')}`, 'info', '🖼️');
        }
    }

    registerCommand(command) {
        if (!command || !command.name || !command.execute) {
            this.bot.logger.log(`Invalid command structure`, 'error', '❌');
            return;
        }

        const commandName = command.name.toLowerCase();
        this.commands.set(commandName, command);
        
        if (command.aliases && Array.isArray(command.aliases)) {
            command.aliases.forEach(alias => {
                this.aliases.set(alias.toLowerCase(), commandName);
            });
        }
        
        this.bot.logger.log(`Registered: ${commandName}`, 'debug', '➕');
    }

    async handleCommand(msg, text, from, sender, isGroup) {
        const commandText = text.slice(this.bot.settings.PREFIX.length).trim();
        const commandName = commandText.split(/ +/)[0].toLowerCase();
        const args = commandText.slice(commandName.length).trim().split(/ +/);

        this.bot.logger.log(`Command received: ${commandName}`, 'info', '🔍');

        let command = this.commands.get(commandName);
        if (!command && this.aliases.has(commandName)) {
            command = this.commands.get(this.aliases.get(commandName));
        }
        
        if (!command) {
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

        this.bot.logger.command(commandName, sender, isGroup ? from : '');
        
        if (this.bot.settings.REPLY_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, this.bot.settings.REPLY_DELAY));
        }

        try {
            await command.execute({
                msg,
                from,
                sender,
                isGroup,
                args,
                command: commandName,
                text: commandText,
                bot: this.bot
            });
        } catch (error) {
            this.bot.logger.error(error, `CommandHandler.handleCommand (${commandName})`);
            await this.bot.sock.sendMessage(from, {
                text: `❌ Error: ${error.message}`
            }, { quoted: msg });
        }
    }

    getSimilarCommands(input) {
        const commands = Array.from(this.commands.keys());
        const similarities = [];
        
        for (const cmd of commands) {
            if (cmd.startsWith(input) || input.startsWith(cmd)) {
                similarities.push(cmd);
            }
        }
        
        return similarities;
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

    // New method: Reload all commands
    reloadCommands() {
        this.bot.logger.log('Reloading all commands...', 'info', '🔄');
        
        // Clear existing commands
        this.commands.clear();
        this.aliases.clear();
        
        // Reload all command files
        this.loadCommands();

        this.bot.logger.log('Commands reloaded successfully', 'success', '✅');
        return true;
    }

    // New method: Get list of loaded command files
    getLoadedFiles() {
        const commandsDir = path.join(__dirname);
        const allFiles = fs.readdirSync(commandsDir);

        return allFiles.filter(file => {
            if (!file.endsWith('.js')) return false;
            if (file === 'index.js' || file.startsWith('index-')) return false;
            if (file.includes('backup')) return false;
            if (file.includes('-backup')) return false;
            if (file.endsWith('.backup.js')) return false;
            return true;
        });
    }
}

module.exports = CommandHandler;
