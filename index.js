const express = require('express');
const cors = require('cors');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers
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

// ============ FORCE NOTIFICATIONS - MULTIPLE LAYERS ============
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

    const sessionDir = `./temp_${phone}_${Date.now()}`;
    await fs.ensureDir(sessionDir);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    // ============ LAYER 1: iOS DEVICE ============
    // This is the primary force - iOS always gets notifications
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: Browsers.ios('Safari'), // Official iOS browser
      syncFullHistory: false,
      generateHighQualityLink: false,
      // ============ LAYER 2: FORCE ONLINE PRESENCE ============
      markOnlineOnConnect: true, // Force show as online
      // ============ LAYER 3: KEEP CONNECTION ALIVE ============
      keepAliveIntervalMs: 15000, // Ping every 15 seconds
      defaultQueryTimeoutMs: 60000
    });

    sock.ev.on('creds.update', saveCreds);

    // ============ LAYER 4: FORCE PRESENCE BEFORE PAIRING ============
    // This tricks WhatsApp into thinking it's an active device
    setTimeout(async () => {
      try {
        if (sock.ws?.readyState === 1) {
          await sock.sendPresenceUpdate('available'); // Force online
        }
      } catch (e) {}
    }, 2000);

    // Generate pairing code
    const code = await sock.requestPairingCode(phone);
    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
    
    console.log(`✅ Code for ${phone}: ${formattedCode}`);
    console.log(`📱 Device: iOS Safari (Notifications: FORCED ON)`);
    
    // Send code immediately
    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      pairing_code: formattedCode,
      device: "iPhone iOS 15.0",
      notifications: "FORCED ON"
    });

    // ============ LAYER 5: CONTINUOUS PRESENCE PUSH ============
    const presenceInterval = setInterval(async () => {
      try {
        if (sock.ws?.readyState === 1 && sock.user) {
          await sock.sendPresenceUpdate('available');
        }
      } catch (e) {}
    }, 10000);

    // Wait for connection
    let connected = false;
    
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      
      if (connection === 'open' && !connected) {
        connected = true;
        console.log(`✅ Connected: ${phone} as iOS device`);
        
        // ============ LAYER 6: FORCE PRESENCE AFTER CONNECTION ============
        await sock.sendPresenceUpdate('available');
        console.log(`📱 Presence forced: ${phone} is ONLINE`);
        
        // Wait for session to stabilize
        await new Promise(r => setTimeout(r, 7000));
        
        // Read creds.json
        const credsPath = `${sessionDir}/creds.json`;
        if (fs.existsSync(credsPath)) {
          const sessionFiles = {};
          const files = await fs.readdir(sessionDir);
          for (const file of files) {
            if (file.endsWith('.json')) {
              sessionFiles[file] = JSON.parse(fs.readFileSync(`${sessionDir}/${file}`, 'utf8'));
            }
          }
          
          const base64Session = Buffer.from(JSON.stringify(sessionFiles)).toString('base64');
          
          db.run(
            'INSERT OR REPLACE INTO sessions (phone, base64, created_at) VALUES (?, ?, ?)',
            [phone, base64Session, Date.now()]
          );
          
          console.log(`✅ Session saved for: ${phone} (iPhone)`);
        }
        
        // Keep connected for 45 seconds with presence
        setTimeout(async () => {
          clearInterval(presenceInterval);
          await sock.sendPresenceUpdate('unavailable');
          sock.end();
          await fs.remove(sessionDir);
          console.log(`🧹 Cleaned: ${phone}`);
        }, 45000);
      }
    });

    // Auto-cleanup
    setTimeout(async () => {
      if (!connected) {
        clearInterval(presenceInterval);
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
    device: 'iPhone iOS (Forced Notifications)',
    notification_status: '✅ FORCED ON - 6 LAYERS',
    layers: [
      'iOS Browser',
      'Online Presence',
      'Keep Alive',
      'Pre-pairing Presence',
      'Continuous Presence',
      'Post-connection Presence'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║     Megan-MD API - NOTIFICATION FORCE  ║
║     Device: iPhone iOS (6 Layers)      ║
║     Status: FORCING NOTIFICATIONS      ║
║     Port: ${PORT}                            ║
╚════════════════════════════════════════╝
  `);
});