#!/usr/bin/env node

/**
 * Migration script to transfer data from SQLite to PostgreSQL
 * Usage: node migrate-to-postgres.js
 */

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Configuration
const SQLITE_DB_PATH = path.join(__dirname, 'crawler.db');
const LEGACY_DB_PATH = path.join(__dirname, 'farsnews.db');

const PG_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'farsnews_crawler',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

class DataMigrator {
  constructor() {
    this.sqliteDb = null;
    this.legacyDb = null;
    this.pgPool = null;
  }

  async init() {
    console.log('🔧 Initializing migration...');
    
    // Initialize PostgreSQL connection
    this.pgPool = new Pool(PG_CONFIG);
    
    try {
      await this.pgPool.query('SELECT 1');
      console.log('✅ PostgreSQL connection established');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error.message);
      process.exit(1);
    }

    // Initialize SQLite connections
    if (fs.existsSync(SQLITE_DB_PATH)) {
      this.sqliteDb = new sqlite3.Database(SQLITE_DB_PATH);
      console.log('✅ Main SQLite database found');
    }

    if (fs.existsSync(LEGACY_DB_PATH)) {
      this.legacyDb = new sqlite3.Database(LEGACY_DB_PATH);
      console.log('✅ Legacy SQLite database found');
    }

    if (!this.sqliteDb && !this.legacyDb) {
      console.log('⚠️  No SQLite databases found. Starting with empty PostgreSQL database.');
      return;
    }
  }

  async migrateSqliteQuery(db, query, targetTable, mapFunction = null) {
    return new Promise((resolve, reject) => {
      db.all(query, [], async (err, rows) => {
        if (err) {
          console.error(`❌ Error reading from SQLite: ${err.message}`);
          reject(err);
          return;
        }

        if (rows.length === 0) {
          console.log(`📄 No data found for ${targetTable}`);
          resolve(0);
          return;
        }

        let migrated = 0;
        const client = await this.pgPool.connect();

        try {
          for (const row of rows) {
            const mappedRow = mapFunction ? mapFunction(row) : row;
            
            // Create INSERT query
            const columns = Object.keys(mappedRow).join(', ');
            const placeholders = Object.keys(mappedRow).map((_, i) => `$${i + 1}`).join(', ');
            const values = Object.values(mappedRow);
            
            const insertQuery = `INSERT INTO ${targetTable} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
            
            try {
              await client.query(insertQuery, values);
              migrated++;
            } catch (insertError) {
              console.warn(`⚠️  Failed to insert row into ${targetTable}:`, insertError.message);
            }
          }
        } finally {
          client.release();
        }

        console.log(`✅ Migrated ${migrated}/${rows.length} records to ${targetTable}`);
        resolve(migrated);
      });
    });
  }

  async migrateMainDatabase() {
    if (!this.sqliteDb) return;

    console.log('\n📦 Migrating main database (crawler.db)...');

    // Migrate news sources
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM news_sources',
      'news_sources',
      (row) => ({
        id: row.id,
        name: row.name,
        base_url: row.base_url,
        list_selector: row.list_selector,
        title_selector: row.title_selector,
        content_selector: row.content_selector,
        link_selector: row.link_selector,
        active: row.active === 1,
        created_at: row.created_at,
        updated_at: row.updated_at
      })
    );

    // Migrate articles
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM articles',
      'articles',
      (row) => ({
        id: row.id,
        source_id: row.source_id,
        title: row.title,
        link: row.link,
        content: row.content,
        hash: row.hash,
        depth: row.depth || 0,
        is_read: row.is_read === 1,
        created_at: row.created_at
      })
    );

    // Migrate admin users
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM admin_users',
      'admin_users',
      (row) => ({
        id: row.id,
        username: row.username,
        password_hash: row.password_hash,
        email: row.email,
        active: row.active === 1,
        created_at: row.created_at
      })
    );

    // Migrate crawl logs
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM crawl_logs',
      'crawl_logs'
    );

    // Migrate operation logs
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM operation_logs',
      'operation_logs'
    );

    // Migrate crawl history
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM crawl_history',
      'crawl_history'
    );

    // Migrate schedules
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM schedules',
      'schedules',
      (row) => ({
        id: row.id,
        source_id: row.source_id,
        cron_expression: row.cron_expression,
        is_active: row.is_active === 1,
        crawl_depth: row.crawl_depth || 1,
        full_content: row.full_content === 1,
        article_limit: row.article_limit || 10,
        timeout_ms: row.timeout_ms || 30000,
        follow_links: row.follow_links === 1,
        created_at: row.created_at,
        updated_at: row.updated_at
      })
    );

    // Migrate cleanup schedules
    await this.migrateSqliteQuery(
      this.sqliteDb,
      'SELECT * FROM cleanup_schedules',
      'cleanup_schedules',
      (row) => ({
        id: row.id,
        name: row.name,
        cron_expression: row.cron_expression,
        is_active: row.is_active === 1,
        keep_articles_count: row.keep_articles_count || 1000,
        created_at: row.created_at,
        updated_at: row.updated_at
      })
    );
  }

  async migrateLegacyDatabase() {
    if (!this.legacyDb) return;

    console.log('\n📰 Migrating legacy database (farsnews.db)...');

    // Migrate legacy articles to main articles table
    await this.migrateSqliteQuery(
      this.legacyDb,
      'SELECT * FROM articles',
      'articles',
      (row) => ({
        title: row.title,
        link: row.link,
        content: row.content,
        hash: row.hash,
        depth: row.depth || 0,
        is_read: row.is_new === 0,
        created_at: row.crawled_date || new Date().toISOString(),
        source_id: 1 // Assign to default FarsNews source
      })
    );

    // Migrate legacy crawl history
    await this.migrateSqliteQuery(
      this.legacyDb,
      'SELECT * FROM crawl_history',
      'crawl_history',
      (row) => ({
        total_found: row.articles_found || 0,
        new_articles: row.new_articles || 0,
        created_at: row.crawl_date || new Date().toISOString(),
        source_id: 1 // Assign to default FarsNews source
      })
    );
  }

  async updateSequences() {
    console.log('\n🔢 Updating PostgreSQL sequences...');
    
    const sequences = [
      'news_sources_id_seq',
      'articles_id_seq', 
      'admin_users_id_seq',
      'crawl_logs_id_seq',
      'operation_logs_id_seq',
      'crawl_history_id_seq',
      'schedules_id_seq',
      'cleanup_schedules_id_seq'
    ];

    const client = await this.pgPool.connect();
    try {
      for (const seq of sequences) {
        const tableName = seq.replace('_id_seq', '');
        try {
          await client.query(`SELECT setval('${seq}', COALESCE((SELECT MAX(id) FROM ${tableName}), 1))`);
          console.log(`✅ Updated sequence: ${seq}`);
        } catch (error) {
          console.warn(`⚠️  Could not update sequence ${seq}:`, error.message);
        }
      }
    } finally {
      client.release();
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    
    if (this.legacyDb) {
      this.legacyDb.close();
    }
    
    if (this.pgPool) {
      await this.pgPool.end();
    }
  }

  async run() {
    try {
      await this.init();
      await this.migrateMainDatabase();
      await this.migrateLegacyDatabase();
      await this.updateSequences();
      
      console.log('\n🎉 Migration completed successfully!');
      console.log('📝 Next steps:');
      console.log('   1. Set DB_TYPE=postgres in your .env file');
      console.log('   2. Restart your application');
      console.log('   3. Test the application functionality');
      console.log('   4. Backup your SQLite files if migration was successful');
      
    } catch (error) {
      console.error('\n❌ Migration failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migrator = new DataMigrator();
  migrator.run().catch(console.error);
}

module.exports = DataMigrator;