module.exports = {
    // Bot Identity
    BOT_NAME: "🤖 MEGAN MD",
    OWNER_NAME: "Tracker Wanga",
    OWNER_PHONE: "254107655023",
    OWNER_GENDER: "Male",
    OWNER_AGE: "19",

    // Prefix (force to dot)
    PREFIX: ".",

    // Session Management
    SESSION_DIR: "./session",

    // Database Configuration
    DATABASE: {
        ENABLED: true,
        TYPE: "mongodb", // mongodb or json
        MONGODB_URI: "mongodb://localhost:27017/megan-bot",
        JSON_PATH: "./database/data.json"
    },

    // Auto Features
    AUTO_VIEW_STATUS: true,
    AUTO_READ: true,

    // Anti Features
    ANTI_DELETE: true,
    ANTI_DELETE_ALERT: true,
    ANTI_DELETE_FORWARD: true,
    ANTI_LINK: true,
    ANTI_LINK_ACTION: "warn",
    ANTI_SPAM: false,
    ANTI_CALL: false,
    ANTI_TAG_ADMIN: false,

    // Message Caching
    CACHE_MESSAGES: true,
    CACHE_DURATION: 3600000, // 1 hour

    // Rate Limiting
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    RATE_LIMIT_MAX: 10, // 10 requests per minute

    // Response Settings
    REPLY_TO_ALL: true,
    REPLY_DELAY: 1000,

    // Group Settings
    AUTO_WELCOME: true,
    WELCOME_MESSAGE: "👋 Welcome {user} to {group}!",
    GOODBYE_MESSAGE: "👋 Goodbye {user}!",
    AUTO_GOODBYE: true,

    // Security
    PRIVATE_MODE: false,
    ALLOWED_USERS: [],
    BLOCKED_USERS: [],

    // Bot Status
    BOT_ONLINE: true,
    BOT_AWAY: false,
    BOT_BUSY: false,

    // Anti-Delete Alert Settings
    ALERT_ORIGINAL_SENDER: true,
    ALERT_OWNER: true,
    ALERT_IN_GROUP: false,

    // Owner Settings
    OWNER_COMMANDS_ENABLED: true,
    SUDO_USERS: [], // Additional users with owner privileges

    // Channel Settings
    CHANNEL_JID: "254107655023@s.whatsapp.net",
    CHANNEL_FORWARDING: true,

    // Performance
    MESSAGE_CACHE_SIZE: 1000,
    CONNECTION_TIMEOUT: 30000,
    RECONNECT_ATTEMPTS: 5
};
