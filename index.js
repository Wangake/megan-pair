const express = require('express');
const cors = require('cors');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs-extra');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ============ SQLITE SETUP ============
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sessions.db');
db.run(`CREATE TABLE IF NOT EXISTS sessions (
  phone TEXT PRIMARY KEY,
  base64 TEXT,
  created_at INTEGER
)`);

// ============ FIXED: EXACT USERLAND MATCH ============
app.get('/api/pair', async (req, res) => {
  try {
    let { phone } = req.query;
    if (!phone) {
      return res.json({ megan_md: false, success: false, reason: 'Phone required' });
    }
    
    phone = phone.replace(/\D/g, '');
    if (!phone.startsWith('254') || phone.length < 12) {
      return res.json({ megan_md: false, success: false, reason: 'Invalid phone' });
    }

    console.log(`📱 Pairing: ${phone}`);

    // Create unique session folder
    const sessionDir = `./temp_${phone}_${Date.now()}`;
    await fs.ensureDir(sessionDir);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    // ============ CRITICAL FIX: EXACT USERLAND CONFIG ============
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ["Ubuntu", "Chrome", "20"], // Same as userland
      syncFullHistory: false,
      generateHighQualityLink: false,
      defaultQueryTimeoutMs: 60000,
      // Don't override any other settings - keep exactly like userland
    });

    sock.ev.on('creds.update', saveCreds);

    // Generate pairing code
    const code = await sock.requestPairingCode(phone);
    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
    
    console.log(`✅ Code for ${phone}: ${formattedCode}`);
    
    // Send code immediately
    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      pairing_code: formattedCode
    });

    // ============ FIXED: BETTER CONNECTION HANDLING ============
    let connected = false;
    
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;
      
      if (connection === 'open' && !connected) {
        connected = true;
        console.log(`✅ Connected: ${phone} as Ubuntu/Chrome`);
        
        // Wait longer for notifications to register
        await new Promise(r => setTimeout(r, 8000));
        
        // Read creds.json
        const credsPath = `${sessionDir}/creds.json`;
        if (fs.existsSync(credsPath)) {
          // Package entire session folder
          const sessionFiles = {};
          const files = await fs.readdir(sessionDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              sessionFiles[file] = JSON.parse(fs.readFileSync(`${sessionDir}/${file}`, 'utf8'));
            }
          }
          
          const base64Session = Buffer.from(JSON.stringify(sessionFiles)).toString('base64');
          
          // Save to SQLite
          db.run(
            'INSERT OR REPLACE INTO sessions (phone, base64, created_at) VALUES (?, ?, ?)',
            [phone, base64Session, Date.now()]
          );
          
          console.log(`✅ Session saved for: ${phone}`);
        }
        
        // Keep connected for 45 seconds - longer for notifications
        setTimeout(async () => {
          sock.end();
          await fs.remove(sessionDir);
          console.log(`🧹 Cleaned: ${phone}`);
        }, 45000);
      }
      
      if (connection === 'close') {
        const reason = lastDisconnect?.error?.output?.statusCode;
        if (reason === DisconnectReason.loggedOut) {
          console.log(`🚫 Logged out: ${phone}`);
        }
      }
    });

    // Auto-cleanup after 2 minutes
    setTimeout(async () => {
      if (!connected) {
        sock.end();
        await fs.remove(sessionDir);
        console.log(`⏰ Timeout: ${phone}`);
      }
    }, 120000);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.json({
      megan_md: false,
      success: false,
      reason: 'Failed to generate pairing code',
      error: error.message
    });
  }
});

// ============ GET SESSION ============
app.get('/api/session', (req, res) => {
  const phone = req.query.phone?.replace(/\D/g, '');
  if (!phone) {
    return res.json({ megan_md: false, success: false, reason: 'Phone required' });
  }
  
  db.get('SELECT base64 FROM sessions WHERE phone = ?', [phone], (err, row) => {
    if (err || !row) {
      return res.json({ megan_md: false, success: false, reason: 'Session not found' });
    }
    
    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      session: row.base64
    });
  });
});

// ============ STATUS ============
app.get('/', (req, res) => {
  res.json({ 
    megan_md: true, 
    status: 'online',
    version: '1.0',
    browser: 'Ubuntu Chrome 20'
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  Megan-MD API - Ubuntu Chrome 20   ║
║  Port: ${PORT}                           ║
║  Status: ONLINE                    ║
╚════════════════════════════════════╝
  `);
});