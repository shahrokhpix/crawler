const DatabaseAdapter = require('./database-adapter');
const path = require('path');
require('dotenv').config();

class Database {
  constructor() {
    this.db = null;
    this.init();
  }

  init() {
    // Check for PostgreSQL configuration
    const wantsPostgres = process.env.DB_TYPE === 'postgres' || 
                       process.env.DATABASE_URL ||
                       process.env.DB_HOST;

    if (wantsPostgres) {
      console.log('🐘 Using PostgreSQL database');
      this.db = new (require('./database-adapter'))({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        database: process.env.DB_NAME || 'farsnews_crawler',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'password'
      });
    } else {
      console.log('📁 Using SQLite database (fallback)');
      this.db = new (require('./database-adapter'))({ type: 'sqlite' });
    }
    
    this.createTables();
  }

  createTables() {
    // جدول منابع خبری
    this.db.run(`
      CREATE TABLE IF NOT EXISTS news_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        base_url TEXT NOT NULL,
        list_selector TEXT NOT NULL,
        title_selector TEXT,
        content_selector TEXT,
        link_selector TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول اخبار
    this.db.run(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        title TEXT NOT NULL,
        link TEXT NOT NULL UNIQUE,
        content TEXT,
        hash TEXT UNIQUE,
        depth INTEGER DEFAULT 0,
        is_read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id)
      )
    `);

    // جدول کاربران ادمین
    this.db.run(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // جدول لاگ‌ها
    this.db.run(`
      CREATE TABLE IF NOT EXISTS crawl_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        articles_found INTEGER DEFAULT 0,
        articles_processed INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id)
      )
    `);

    // جدول لاگ‌های عملیات
    this.db.run(`
      CREATE TABLE IF NOT EXISTS operation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        action TEXT NOT NULL,
        status TEXT NOT NULL,
        message TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id)
      )
    `);

    // جدول تاریخچه کرال
    this.db.run(`
      CREATE TABLE IF NOT EXISTS crawl_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER,
        total_found INTEGER DEFAULT 0,
        total_processed INTEGER DEFAULT 0,
        new_articles INTEGER DEFAULT 0,
        crawl_depth INTEGER DEFAULT 0,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id)
      )
    `);

    // جدول زمان‌بندی کرال
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        cron_expression TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        crawl_depth INTEGER DEFAULT 1,
        full_content BOOLEAN DEFAULT 0,
        article_limit INTEGER DEFAULT 10,
        timeout_ms INTEGER DEFAULT 30000,
        follow_links BOOLEAN DEFAULT 1,
        last_run DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id) ON DELETE CASCADE
      )
    `);

    // اضافه کردن ستون‌های جدید به جدول schedules اگر وجود نداشته باشند
    this.db.run(`ALTER TABLE schedules ADD COLUMN last_run DATETIME`, () => {});

    // جدول زمان‌بندی پاک‌سازی اخبار
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cleanup_schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        keep_articles_count INTEGER DEFAULT 1000,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // اضافه کردن ستون‌های جدید به جدول schedules اگر وجود نداشته باشند
    this.db.run(`ALTER TABLE schedules ADD COLUMN crawl_depth INTEGER DEFAULT 1`, () => {});
    this.db.run(`ALTER TABLE schedules ADD COLUMN full_content BOOLEAN DEFAULT 0`, () => {});
    this.db.run(`ALTER TABLE schedules ADD COLUMN article_limit INTEGER DEFAULT 10`, () => {});
    this.db.run(`ALTER TABLE schedules ADD COLUMN timeout_ms INTEGER DEFAULT 30000`, () => {});
    this.db.run(`ALTER TABLE schedules ADD COLUMN follow_links BOOLEAN DEFAULT 1`, () => {});
    this.db.run(`ALTER TABLE schedules ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`, () => {});

    // اضافه کردن فیلد crawler_type به جدول news_sources
    this.db.run(`ALTER TABLE news_sources ADD COLUMN crawler_type TEXT DEFAULT 'puppeteer'`, () => {});

    // ایجاد جدول source_selectors برای مدیریت چندین سلکتور
    this.db.run(`
      CREATE TABLE IF NOT EXISTS source_selectors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        selector_type VARCHAR(50) NOT NULL,
        selector_value TEXT NOT NULL,
        selector_name VARCHAR(100),
        is_active BOOLEAN DEFAULT 1,
        priority INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES news_sources (id) ON DELETE CASCADE
      )
    `);

    // ایجاد index برای جدول source_selectors
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_selectors_source_id ON source_selectors(source_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_selectors_type ON source_selectors(selector_type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_selectors_active ON source_selectors(is_active)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_source_selectors_priority ON source_selectors(priority)`);

    // اضافه کردن منبع پیش‌فرض فارس‌نیوز
    this.db.run(`
      INSERT OR IGNORE INTO news_sources 
      (name, base_url, list_selector, title_selector, content_selector, link_selector) 
      VALUES 
      ('فارس‌نیوز', 'https://www.farsnews.ir/showcase', 
       'a[href*="/news/"]', 'h1, .title', 
       '.story, .content, .news-content, p', 'a')
    `);

    // اضافه کردن کاربر ادمین پیش‌فرض
    const bcrypt = require('bcryptjs');
    
    // بررسی اینکه آیا کاربر admin وجود دارد
    this.db.get('SELECT id FROM admin_users WHERE username = ?', ['admin'], (err, row) => {
      if (err) {
        console.error('خطا در بررسی کاربر admin:', err);
        return;
      }
      
      if (!row) {
        // اگر کاربر admin وجود ندارد، ایجاد کن
        const defaultPassword = bcrypt.hashSync('admin123', 10);
        this.db.run(`
          INSERT INTO admin_users (username, password_hash, email) 
          VALUES ('admin', ?, 'admin@crawler.local')
        `, [defaultPassword], function(err) {
          if (err) {
            console.error('خطا در ایجاد کاربر admin:', err);
          } else {
            console.log('✅ کاربر admin پیش‌فرض ایجاد شد');
          }
        });
      } else {
        // اگر کاربر admin وجود دارد، رمز عبور را به‌روزرسانی کن
        const defaultPassword = bcrypt.hashSync('admin123', 10);
        this.db.run(`
          UPDATE admin_users SET password_hash = ? WHERE username = 'admin'
        `, [defaultPassword], function(err) {
          if (err) {
            console.error('خطا در به‌روزرسانی رمز عبور admin:', err);
          } else {
            console.log('✅ رمز عبور admin به‌روزرسانی شد');
          }
        });
      }
    });
  }

  getDb() {
    return this.db;
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = new Database();