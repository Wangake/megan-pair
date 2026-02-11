const express = require('express');
const cors = require('cors');
const pino = require('pino');
const {
  default: makeWASocket,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { useSQLiteAuthState } = require('./sqlite-auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store active pairing processes
const activePairings = new Map();

// ====================================
// PAIRING API ENDPOINT
// ====================================
app.get('/api/pair', async (req, res) => {
  const startTime = Date.now();
  
  try {
    let { phone } = req.query;
    
    // Validate phone number
    if (!phone) {
      return res.status(400).json({
        megan_md: false,
        success: false,
        reason: 'Phone number required',
        code: 'NO_PHONE',
        timestamp: Date.now()
      });
    }

    // Clean phone number
    phone = phone.replace(/\D/g, '');
    
    // Validate format (254XXXXXXXXX)
    if (!phone.startsWith('254') || phone.length < 12 || phone.length > 13) {
      return res.status(400).json({
        megan_md: false,
        success: false,
        reason: 'Invalid phone format. Use 254XXXXXXXXX',
        code: 'INVALID_PHONE',
        timestamp: Date.now()
      });
    }

    // Check if already pairing
    if (activePairings.has(phone)) {
      const existing = activePairings.get(phone);
      if (Date.now() - existing.startTime < 120000) { // 2 minutes timeout
        return res.status(429).json({
          megan_md: false,
          success: false,
          reason: 'Pairing already in progress for this number',
          code: 'PAIRING_IN_PROGRESS',
          pairing_code: existing.code,
          timestamp: Date.now()
        });
      } else {
        activePairings.delete(phone);
      }
    }

    // Generate unique session ID
    const sessionId = `megan_${phone}_${Date.now()}`;
    
    // Initialize auth state
    const { state, saveCreds, saveBase64, db } = await useSQLiteAuthState(sessionId);
    
    // Store phone in session
    await db.run(
      'UPDATE sessions SET phone = ? WHERE id = ?',
      phone, sessionId
    );

    // Get Baileys version
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`📱 Using WA v${version.join('.')}, latest: ${isLatest}`);

    // Create socket with REAL browser configuration
    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      browser: ["Ubuntu", "Chrome", "20"], // CRITICAL: Real browser ID for notifications
      syncFullHistory: false,
      generateHighQualityLink: false,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 30000,
      printQRInTerminal: false,
      markOnlineOnConnect: true // Shows as online in WhatsApp
    });

    // Request pairing code
    let pairingCode = null;
    try {
      pairingCode = await sock.requestPairingCode(phone);
      // Format code as WhatsApp expects it (no dashes in actual code, but we format for display)
      pairingCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
    } catch (error) {
      console.error(`❌ Pairing code generation failed for ${phone}:`, error);
      sock.end();
      return res.status(500).json({
        megan_md: false,
        success: false,
        reason: 'Failed to generate pairing code',
        code: 'PAIRING_FAILED',
        error: error.message,
        timestamp: Date.now()
      });
    }

    // Store in active pairings
    activePairings.set(phone, {
      sessionId,
      sock,
      code: pairingCode,
      startTime: Date.now(),
      db
    });

    // Send immediate response
    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      pairing_code: pairingCode,
      code: 'PAIRING_GENERATED',
      expires_in: 120, // seconds
      message: 'Enter this code in WhatsApp → Linked Devices → Link with code',
      device: 'Ubuntu Chrome 20', // Show real device
      timestamp: Date.now()
    });

    console.log(`📱 Pairing code generated for ${phone}: ${pairingCode}`);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`📱 QR received for ${phone} (should not happen in pairing mode)`);
      }

      if (connection === 'open') {
        console.log(`✅ WhatsApp connected: ${phone} (Ubuntu Chrome 20)`);
        
        // Wait for connection to fully stabilize
        await new Promise(r => setTimeout(r, 5000));

        // Convert session to Base64
        try {
          const row = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
          if (row && row.creds) {
            const sessionData = {
              creds: JSON.parse(row.creds),
              keys: JSON.parse(row.keys || '{}')
            };
            const base64Session = Buffer.from(JSON.stringify(sessionData)).toString('base64');
            
            // Save Base64 to database
            await saveBase64(base64Session);
            
            console.log(`✅ Session saved for: ${phone} (Ubuntu Chrome 20)`);
          }
        } catch (error) {
          console.error(`❌ Session conversion failed: ${phone}`, error);
        }

        // Keep connection alive for 60 seconds to ensure notifications work
        setTimeout(async () => {
          try {
            // Mark as offline before disconnecting
            if (sock.ws) {
              await sock.sendPresenceUpdate('unavailable');
            }
            sock.end();
            activePairings.delete(phone);
            await db.close();
            console.log(`🧹 Cleaned up: ${phone} (Ubuntu Chrome 20)`);
          } catch (e) {}
        }, 60000);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message || statusCode;
        
        console.log(`❌ Disconnected: ${phone} - ${reason}`);
        
        if (statusCode === DisconnectReason.loggedOut) {
          console.log(`🚫 Logged out: ${phone}`);
          activePairings.delete(phone);
        } else if (statusCode === DisconnectReason.connectionClosed) {
          // Normal closure, ignore
        } else {
          // Unexpected disconnect, but we'll let it retry
          console.log(`⚠️ Unexpected disconnect for ${phone}:`, reason);
        }
      }
    });

    // Handle messages to confirm device is working
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message) return;
      
      const from = msg.key.remoteJid;
      if (from === sock.user?.id) {
        console.log(`📨 Message received from ${phone} (Ubuntu Chrome 20 works!)`);
      }
    });

    // Auto-cleanup on timeout
    setTimeout(() => {
      if (activePairings.has(phone)) {
        const pairing = activePairings.get(phone);
        try {
          if (pairing.sock?.ws) {
            pairing.sock.sendPresenceUpdate('unavailable');
          }
          pairing.sock?.end();
        } catch (e) {}
        activePairings.delete(phone);
        console.log(`⏰ Timeout cleanup: ${phone} (Ubuntu Chrome 20)`);
      }
    }, 120000);

  } catch (error) {
    console.error('❌ Pairing error:', error);
    res.status(500).json({
      megan_md: false,
      success: false,
      reason: 'Internal server error',
      code: 'SERVER_ERROR',
      error: error.message,
      timestamp: Date.now()
    });
  }
});

// ====================================
// GET SESSION BY PHONE
// ====================================
app.get('/api/session', async (req, res) => {
  try {
    let { phone } = req.query;
    
    if (!phone) {
      return res.status(400).json({
        megan_md: false,
        success: false,
        reason: 'Phone number required',
        code: 'NO_PHONE'
      });
    }

    phone = phone.replace(/\D/g, '');
    
    const { getByPhone } = await useSQLiteAuthState('temp');
    const session = await getByPhone(phone);

    if (!session) {
      return res.status(404).json({
        megan_md: false,
        success: false,
        reason: 'No session found for this number',
        code: 'SESSION_NOT_FOUND'
      });
    }

    if (!session.base64) {
      return res.status(202).json({
        megan_md: true,
        success: false,
        reason: 'Pairing in progress',
        code: 'PAIRING_PENDING',
        status: session.status,
        created_at: session.created_at
      });
    }

    res.json({
      megan_md: true,
      success: true,
      phone: phone,
      session: session.base64,
      code: 'SESSION_READY',
      device: 'Ubuntu Chrome 20', // Shows real device
      created_at: session.created_at,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('❌ Session retrieval error:', error);
    res.status(500).json({
      megan_md: false,
      success: false,
      reason: 'Failed to retrieve session',
      code: 'SESSION_ERROR',
      error: error.message
    });
  }
});

// ====================================
// HEALTH CHECK
// ====================================
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'Megan-MD Pairing API',
    active_pairings: activePairings.size,
    device: 'Ubuntu Chrome 20',
    timestamp: Date.now()
  });
});

// ====================================
// ROOT ENDPOINT
//===================================
app.get('/', (req, res) => {
  res.json({
    name: 'Megan-MD Pairing API',
    version: '1.0.0',
    endpoints: {
      pair: '/api/pair?phone=254XXXXXXXXX',
      session: '/api/session?phone=254XXXXXXXXX',
      health: '/health'
    },
    documentation: 'Send GET request to /api/pair with phone number',
    device: 'Ubuntu Chrome 20', // Real WhatsApp Web device
    author: 'Tracker Wanga',
    timestamp: Date.now()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(500).json({
    megan_md: false,
    success: false,
    reason: 'Internal server error',
    code: 'UNHANDLED_ERROR',
    timestamp: Date.now()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║         Megan-MD Pairing API v1.0             ║
║         Device: Ubuntu Chrome 20              ║
║         Status: ONLINE                        ║
║         Port: ${PORT}                              ║
║         Notifications: ✅ ENABLED             ║
╚════════════════════════════════════════════════╝
  `);
});