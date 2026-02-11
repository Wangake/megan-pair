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

// ============ SIMPLE SQLITE AUTH - NO COMPLEXITY ============
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./sessions.db');

// Create table - ONE TABLE, SIMPLE
db.run(`CREATE TABLE IF NOT EXISTS sessions (
  phone TEXT PRIMARY KEY,
  session_data TEXT,
  base64 TEXT,
  created_at INTEGER
)`);

// ============ EXACT SAME METHOD THAT WORKED ============
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

    // ============ USE EXACT MULTIFILE METHOD ============
    // Create temp session folder - works exactly like userland
    const sessionDir = `./temp_${phone}`;
    await fs.ensureDir(sessionDir);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ["Ubuntu", "Chrome", "20"] // Works with notifications
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

    // Wait for connection
    sock.ev.on('connection.update', async (update) => {
      const { connection } = update;
      
      if (connection === 'open') {
        console.log(`✅ Connected: ${phone}`);
        
        // Wait 5 seconds for stability
        await new Promise(r => setTimeout(r, 5000));
        
        // ============ READ CREDS.JSON LIKE USERLAND ============
        const credsPath = `${sessionDir}/creds.json`;
        if (fs.existsSync(credsPath)) {
          // Read the creds file
          const credsData = fs.readFileSync(credsPath, 'utf8');
          
          // Convert entire session folder to Base64
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
            'INSERT OR REPLACE INTO sessions (phone, session_data, base64, created_at) VALUES (?, ?, ?, ?)',
            [phone, credsData, base64Session, Date.now()]
          );
          
          console.log(`✅ Session saved for: ${phone}`);
        }
        
        // Keep connected for 30 seconds then cleanup like userland
        setTimeout(async () => {
          sock.end();
          await fs.remove(sessionDir);
          console.log(`🧹 Cleaned: ${phone}`);
        }, 30000);
      }
    });

  } catch (error) {
    console.error(`❌ Error for ${req.query.phone}:`, error.message);
    res.json({
      megan_md: false,
      success: false,
      reason: 'Failed to generate pairing code',
      error: error.message
    });
  }
});

// ============ GET SESSION - SIMPLE ============
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

// ============ HEALTH ============
app.get('/', (req, res) => {
  res.json({ 
    megan_md: true, 
    status: 'online',
    message: 'Send /api/pair?phone=254XXXXXXXXX' 
  });
});

app.listen(PORT, () => {
  console.log(`✅ Megan-MD API on port ${PORT}`);
});