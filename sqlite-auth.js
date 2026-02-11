const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, 'sessions.db')
  : './sessions.db';

async function useSQLiteAuthState(sessionId) {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Enable WAL mode for concurrent access
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA synchronous = NORMAL;');

  // Create tables if not exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      phone TEXT,
      creds TEXT,
      keys TEXT,
      base64 TEXT,
      status TEXT DEFAULT 'pending',
      created_at INTEGER,
      updated_at INTEGER
    )
  `);

  // Read existing session
  const row = await db.get('SELECT * FROM sessions WHERE id = ?', sessionId);
  
  let creds = {};
  let keys = {};

  if (row) {
    try {
      creds = JSON.parse(row.creds || '{}');
      keys = JSON.parse(row.keys || '{}');
    } catch (e) {}
  }

  const saveCreds = async () => {
    await db.run(
      `INSERT OR REPLACE INTO sessions (id, creds, keys, updated_at, status) 
       VALUES (?, ?, ?, ?, ?)`,
      sessionId,
      JSON.stringify(creds),
      JSON.stringify(keys),
      Date.now(),
      'authenticated'
    );
  };

  // Save Base64 session
  const saveBase64 = async (base64) => {
    await db.run(
      `UPDATE sessions SET base64 = ?, status = ?, updated_at = ? WHERE id = ?`,
      base64,
      'completed',
      Date.now(),
      sessionId
    );
  };

  // Get session by phone
  const getByPhone = async (phone) => {
    return db.get('SELECT * FROM sessions WHERE phone = ? ORDER BY created_at DESC LIMIT 1', phone);
  };

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          return ids.map(id => keys[`${type}-${id}`]);
        },
        set: async (data) => {
          for (const item of data) {
            keys[`${item.type}-${item.id}`] = item.value;
          }
          await saveCreds();
        }
      }
    },
    saveCreds,
    saveBase64,
    getByPhone,
    db
  };
}

module.exports = { useSQLiteAuthState };