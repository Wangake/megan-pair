const pino = require('pino');
const chalk = require('chalk');
const moment = require('moment');

// Create a proper Pino logger that Baileys can use
const pinoLogger = pino({
    level: 'silent', // We'll handle all logging ourselves
    transport: null
});

// Custom logging class
class MeganLogger {
    constructor(botName = 'MEGAN') {
        this.botName = botName;
    }

    formatMessage(level, message, emoji = '') {
        const timestamp = chalk.gray(`[${moment().format('HH:mm:ss')}]`);
        const botTag = chalk.magenta(`[${this.botName}]`);
        
        let coloredMessage = '';
        let logEmoji = emoji;
        
        switch(level) {
            case 'success':
                coloredMessage = chalk.green(`✅ ${logEmoji} ${message}`);
                break;
            case 'error':
                coloredMessage = chalk.red(`❌ ${logEmoji} ${message}`);
                logEmoji = '❌';
                break;
            case 'warning':
                coloredMessage = chalk.yellow(`⚠️ ${logEmoji} ${message}`);
                logEmoji = '⚠️';
                break;
            case 'info':
                coloredMessage = chalk.cyan(`ℹ️ ${logEmoji} ${message}`);
                logEmoji = 'ℹ️';
                break;
            case 'debug':
                coloredMessage = chalk.magenta(`🐛 ${logEmoji} ${message}`);
                break;
            case 'message':
                coloredMessage = chalk.blue(`💬 ${logEmoji} ${message}`);
                break;
            case 'event':
                coloredMessage = chalk.cyan(`🎯 ${logEmoji} ${message}`);
                break;
            case 'connection':
                coloredMessage = chalk.green(`🔌 ${logEmoji} ${message}`);
                break;
            case 'command':
                coloredMessage = chalk.yellow(`⌨️ ${logEmoji} ${message}`);
                break;
            default:
                coloredMessage = chalk.white(`${logEmoji} ${message}`);
        }

        console.log(`${timestamp} ${botTag} ${coloredMessage}`);
    }

    log(message, level = 'info', emoji = '') {
        this.formatMessage(level, message, emoji);
    }

    connection(status, details = '') {
        let emoji = '';
        switch(status) {
            case 'connecting': emoji = '🔄'; break;
            case 'connected': emoji = '✅'; break;
            case 'disconnected': emoji = '❌'; break;
            case 'reconnecting': emoji = '🔄'; break;
            case 'closing': emoji = '🛑'; break;
        }
        this.log(details, 'connection', emoji);
    }

    command(cmd, user, group = '') {
        const userInfo = user.split('@')[0];
        const groupInfo = group ? ` in ${group.split('@')[0]}` : '';
        this.log(`Command: ${cmd} from ${userInfo}${groupInfo}`, 'command', '⌨️');
    }

    message(type, from, content = '') {
        const fromInfo = from.split('@')[0];
        const shortContent = content.length > 50 ? content.substring(0, 50) + '...' : content;
        this.log(`${type}: ${fromInfo} - ${shortContent}`, 'message', '💬');
    }

    error(error, context = '') {
        const contextMsg = context ? ` [${context}]` : '';
        this.log(`Error${contextMsg}: ${error.message}`, 'error', '❌');
    }
}

// Export the Pino logger for Baileys and our custom logger
module.exports = pinoLogger;
module.exports.MeganLogger = MeganLogger;
module.exports.createLogger = (botName) => new MeganLogger(botName);
