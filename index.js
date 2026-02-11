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

// ============ FIXED: SAFARI IOS ============
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
    
    // ============ CRITICAL: SAFARI IOS ============
    // This makes WhatsApp think it's an iPhone - ALWAYS gets notifications
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ["Safari", "iOS", "15.0"], // iPhone - notifications ALWAYS work
      syncFullHistory: false,
      generateHighQualityLink: false
    });

    sock.ev.on('creds.update', saveCreds);

    // Generate pairing code
    const code = await sock.requestPairingCode(phone);
    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
    
    console.log(`✅ Code for ${phone}: ${formattedCode}`);
    console.log(`📱 Device: Safari iOS 15.0 (iPhone)`);
    
    // Send code immediately
    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      pairing_code: formattedCode,
      device: "iPhone (Safari)" // Show it's iPhone
    });

    // Wait for connection
    let connected = false;
    
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      
      if (connection === 'open' && !connected) {
        connected = true;
        console.log(`✅ Connected: ${phone} as iPhone`);
        
        // Wait for session to stabilize
        await new Promise(r => setTimeout(r, 5000));
        
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
          
          console.log(`✅ Session saved for: ${phone} (iPhone)`);
        }
        
        // Keep connected for 30 seconds
        setTimeout(async () => {
          sock.end();
          await fs.remove(sessionDir);
          console.log(`🧹 Cleaned: ${phone}`);
        }, 30000);
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
    device: 'iPhone (Safari iOS 15.0)',
    notifications: '✅ ALWAYS ON'
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║     Megan-MD API - iPhone Mode     ║
║     Device: Safari iOS 15.0        ║
║     Notifications: ✅ FORCED ON    ║
║     Port: ${PORT}                        ║
╚════════════════════════════════════╝
  `);
});