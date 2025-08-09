const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class DatabaseAdapter {
  constructor(config = {}) {
    this.isPostgres = config.type === 'postgres';
    this.pool = null;
    this.sqliteDb = null;
    this.txClient = null; // active transaction client when using Postgres
    
    if (this.isPostgres) {
      this.pool = new Pool({
        host: config.host || process.env.DB_HOST || 'localhost',
        port: config.port || process.env.DB_PORT || 5432,
        database: config.database || process.env.DB_NAME || 'farsnews_crawler',
        user: config.user || process.env.DB_USER || 'postgres',
        password: config.password || process.env.DB_PASSWORD || 'password',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });
    } else {
      // Fallback to SQLite
      const sqlite3 = require('sqlite3').verbose();
      const path = require('path');
      const dbPath = path.join(__dirname, '..', 'crawler.db');
      this.sqliteDb = new sqlite3.Database(dbPath);
    }
  }

  async connectTest() {
    if (!this.isPostgres) return true;
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      return true;
    } finally {
      client.release();
    }
  }

  // Convert SQLite queries to PostgreSQL
  convertQuery(query, params = []) {
    if (!this.isPostgres) {
      return { query, params };
    }

    let pgQuery = query;
    let pgParams = [...params];

    // Replace SQLite-specific syntax with PostgreSQL equivalents
    pgQuery = pgQuery
      // Replace INTEGER PRIMARY KEY AUTOINCREMENT with SERIAL PRIMARY KEY
      .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
      // Replace AUTOINCREMENT with blank (handled by SERIAL)
      .replace(/AUTOINCREMENT/gi, '')
      // Replace DATETIME with TIMESTAMP
      .replace(/DATETIME/gi, 'TIMESTAMP')
      // Replace BOOLEAN with BOOLEAN (already compatible)
      .replace(/BOOLEAN/gi, 'BOOLEAN')
      // Normalize boolean defaults to Postgres literals
      .replace(/BOOLEAN\s+DEFAULT\s+0\b/gi, 'BOOLEAN DEFAULT FALSE')
      .replace(/BOOLEAN\s+DEFAULT\s+1\b/gi, 'BOOLEAN DEFAULT TRUE')
      // Replace CURRENT_TIMESTAMP
      .replace(/CURRENT_TIMESTAMP/gi, 'CURRENT_TIMESTAMP')
      // Replace INSERT OR IGNORE with INSERT ... ON CONFLICT
      .replace(/INSERT OR IGNORE INTO ([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/gi, 
        'INSERT INTO $1 ($2) VALUES ($3) ON CONFLICT DO NOTHING RETURNING id')
      // Add RETURNING id to simple INSERT statements for PostgreSQL
      .replace(/INSERT INTO ([^\s(]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?!\s*ON\s+CONFLICT)(?!\s*RETURNING)/gi,
        'INSERT INTO $1 ($2) VALUES ($3) RETURNING id')
      // Replace sqlite_master with information_schema
      .replace(/SELECT name FROM sqlite_master WHERE type='table' AND name='([^']+)'/gi,
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='$1'")
      // Replace SQLite date functions with PostgreSQL equivalents
      .replace(/datetime\("now",\s*"([^"]+)"\)/gi, (match, interval) => {
        // Convert SQLite datetime("now", "-24 hours") to PostgreSQL NOW() + INTERVAL
        if (interval.startsWith('-')) {
          const cleanInterval = interval.substring(1); // Remove the minus sign
          return `NOW() - INTERVAL '${cleanInterval}'`;
        } else if (interval.startsWith('+')) {
          const cleanInterval = interval.substring(1); // Remove the plus sign
          return `NOW() + INTERVAL '${cleanInterval}'`;
        } else {
          return `NOW() + INTERVAL '${interval}'`;
        }
      })
      // Replace datetime("now") with NOW()
      .replace(/datetime\("now"\)/gi, 'NOW()')
      // Also handle when previous replacements changed function to TIMESTAMP("now", ...)
      .replace(/TIMESTAMP\("now",\s*"([^"]+)"\)/gi, (match, interval) => {
        if (interval.startsWith('-')) {
          const cleanInterval = interval.substring(1);
          return `NOW() - INTERVAL '${cleanInterval}'`;
        } else if (interval.startsWith('+')) {
          const cleanInterval = interval.substring(1);
          return `NOW() + INTERVAL '${cleanInterval}'`;
        } else {
          return `NOW() + INTERVAL '${interval}'`;
        }
      })
      // Replace TIMESTAMP("now") with NOW() if encountered
      .replace(/TIMESTAMP\("now"\)/gi, 'NOW()')
      // Replace strftime functions with PostgreSQL date formatting
      .replace(/strftime\('([^']+)',\s*"now"\)/gi, (match, format) => {
        // Convert common SQLite strftime formats to PostgreSQL
        const formatMap = {
          '%Y-%m-%d': 'YYYY-MM-DD',
          '%Y-%m-%d %H:%M:%S': 'YYYY-MM-DD HH24:MI:SS',
          '%H:%M:%S': 'HH24:MI:SS',
          '%Y': 'YYYY',
          '%m': 'MM',
          '%d': 'DD'
        };
        const pgFormat = formatMap[format] || format;
        return `TO_CHAR(NOW(), '${pgFormat}')`;
      })
      // Handle IF NOT EXISTS for tables
      .replace(/CREATE TABLE IF NOT EXISTS/gi, 'CREATE TABLE IF NOT EXISTS');

    // Add IF NOT EXISTS for ADD COLUMN when on Postgres to avoid errors on repeated migrations
    pgQuery = pgQuery.replace(/ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS ');

    // Convert ? placeholders to PostgreSQL style ($1, $2, etc.)
    let paramIndex = 1;
    pgQuery = pgQuery.replace(/\?/g, () => `$${paramIndex++}`);

    return { query: pgQuery, params: pgParams };
  }

  // Execute query with proper error handling
  async execute(query, params = []) {
    if (this.isPostgres) {
      const client = this.txClient || (await this.pool.connect());
      // Prepare converted query early so we can log it on error
      const { query: pgQuery, params: pgParams } = this.convertQuery(query, params);
      try {
        const result = await client.query(pgQuery, pgParams);
        return result;
      } catch (err) {
        // Log offending query for easier debugging across dialects
        console.error('❌ PG query failed:', pgQuery, '\nParams:', pgParams, '\nError:', err && err.message ? err.message : err);
        throw err;
      } finally {
        if (!this.txClient) {
          client.release();
        }
      }
    } else {
      // SQLite execution - return promise-wrapped version
      return new Promise((resolve, reject) => {
        this.sqliteDb.run(query, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }

  // Begin transaction (PostgreSQL only)
  async beginTransaction(callback) {
    if (!this.isPostgres) {
      // For SQLite, emulate via run if callback provided
      if (typeof callback === 'function') callback();
      return;
    }
    if (this.txClient) {
      throw new Error('Transaction already in progress');
    }
    this.txClient = await this.pool.connect();
    await this.txClient.query('BEGIN');
    if (typeof callback === 'function') callback();
  }

  // Commit transaction (PostgreSQL only)
  async commit(callback) {
    if (!this.isPostgres) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (!this.txClient) {
      throw new Error('No active transaction');
    }
    try {
      await this.txClient.query('COMMIT');
    } finally {
      this.txClient.release();
      this.txClient = null;
    }
    if (typeof callback === 'function') callback();
  }

  // Rollback transaction (PostgreSQL only)
  async rollback(callback) {
    if (!this.isPostgres) {
      if (typeof callback === 'function') callback();
      return;
    }
    if (!this.txClient) {
      throw new Error('No active transaction');
    }
    try {
      await this.txClient.query('ROLLBACK');
    } finally {
      this.txClient.release();
      this.txClient = null;
    }
    if (typeof callback === 'function') callback();
  }

  // SQLite-compatible run method
  run(query, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (this.isPostgres) {
      this.execute(query, params)
        .then(result => {
          if (typeof callback === 'function') {
            // Extract ID from RETURNING clause or use rowCount
            let lastID = null;
            if (result.rows && result.rows.length > 0 && result.rows[0].id !== undefined) {
              lastID = result.rows[0].id;
            }
            
            const context = {
              lastID: lastID,
              changes: result.rowCount || 0
            };
            callback.call(context, null);
          }
        })
        .catch(err => {
          if (typeof callback === 'function') callback(err);
        });
    } else {
      this.sqliteDb.run(query, params, callback);
    }
  }

  // SQLite-compatible get method
  get(query, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (this.isPostgres) {
      this.execute(query, params)
        .then(result => {
          const row = result.rows && result.rows.length > 0 ? result.rows[0] : null;
          if (typeof callback === 'function') callback(null, row);
        })
        .catch(err => {
          if (typeof callback === 'function') callback(err);
        });
    } else {
      this.sqliteDb.get(query, params, callback);
    }
  }

  // SQLite-compatible all method
  all(query, params = [], callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    if (this.isPostgres) {
      this.execute(query, params)
        .then(result => {
          if (typeof callback === 'function') callback(null, result.rows || []);
        })
        .catch(err => {
          if (typeof callback === 'function') callback(err);
        });
    } else {
      this.sqliteDb.all(query, params, callback);
    }
  }

  // SQLite-compatible prepare method
  prepare(query) {
    if (this.isPostgres) {
      return new PostgresPreparedStatement(this, query);
    } else {
      return this.sqliteDb.prepare(query);
    }
  }

  // SQLite-compatible serialize method
  serialize(callback) {
    if (this.isPostgres) {
      // PostgreSQL doesn't need serialization; simply run the callback
      if (typeof callback === 'function') callback();
    } else {
      this.sqliteDb.serialize(callback);
    }
  }

  // Close connection
  close(callback) {
    if (this.isPostgres) {
      this.pool.end().then(() => {
        if (typeof callback === 'function') callback();
      }).catch(err => {
        if (typeof callback === 'function') callback(err);
      });
    } else {
      this.sqliteDb.close(callback);
    }
  }
}

// PostgreSQL prepared statement wrapper to mimic SQLite behavior
class PostgresPreparedStatement {
  constructor(adapter, query) {
    this.adapter = adapter;
    this.query = query;
  }

  run(params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    this.adapter.run(this.query, params, callback);
  }

  get(params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    this.adapter.get(this.query, params, callback);
  }

  all(params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    this.adapter.all(this.query, params, callback);
  }

  finalize(callback) {
    // PostgreSQL doesn't need finalization
    if (typeof callback === 'function') callback();
  }
}

module.exports = DatabaseAdapter;