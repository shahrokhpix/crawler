const express = require('express');
const router = express.Router();
const moment = require('moment-timezone');
const UniversalCrawler = require('../services/crawler');
const database = require('../config/database');
const logger = require('../utils/logger');
const auth = require('../middleware/auth');
const scheduler = require('../services/scheduler');
const cleanup = require('../services/cleanup');

const crawler = new UniversalCrawler();

// ==================== AUTH ROUTES ====================

// ورود
router.post('/auth/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'نام کاربری و رمز عبور الزامی است'
      });
    }
    
    const result = await auth.login(username, password);
    
    if (result.success) {
      // تنظیم کوکی
      res.cookie('auth_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 ساعت
      });
    }
    
    res.json(result);
    
  } catch (error) {
    next(error);
  }
});

// خروج
router.post('/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({
    success: true,
    message: 'خروج موفقیت‌آمیز'
  });
});

// اطلاعات کاربر
router.get('/auth/me', auth.verifyToken, async (req, res, next) => {
  try {
    const user = await auth.getUserInfo(req.user.id);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
});

// ==================== DATABASE MANAGEMENT ROUTES ====================

// تخلیه کامل مقالات و اخبار دیتابیس
router.post('/database/clear-all', auth.verifyToken, async (req, res, next) => {
  try {
    const db = database.db;
    
    // شروع تراکنش
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      try {
        // حذف تمام مقالات
        db.run('DELETE FROM articles', function(err) {
          if (err) {
            db.run('ROLLBACK');
            logger.error('خطا در حذف مقالات:', err);
            return res.status(500).json({
              success: false,
              message: 'خطا در حذف مقالات: ' + err.message
            });
          }
          
          const articlesDeleted = this.changes;
          logger.info(`تعداد ${articlesDeleted} مقاله حذف شد`);
          
          // حذف تمام تاریخچه کرال
          db.run('DELETE FROM crawl_history', function(err) {
            if (err) {
              db.run('ROLLBACK');
              logger.error('خطا در حذف تاریخچه کرال:', err);
              return res.status(500).json({
                success: false,
                message: 'خطا در حذف تاریخچه کرال: ' + err.message
              });
            }
            
            const historyDeleted = this.changes;
            logger.info(`تعداد ${historyDeleted} رکورد تاریخچه کرال حذف شد`);
            
            // حذف تمام لاگ‌های عملیات (اگر جدول وجود داشته باشد)
            db.run('DELETE FROM operation_logs', function(err) {
              if (err) {
                // اگر جدول وجود ندارد، نادیده بگیر
                logger.warn('جدول operation_logs وجود ندارد یا خطا در حذف:', err.message);
                const logsDeleted = 0;
                
                // تایید تراکنش
                db.run('COMMIT', function(err) {
                  if (err) {
                    logger.error('خطا در تایید تراکنش:', err);
                    return res.status(500).json({
                      success: false,
                      message: 'خطا در تایید تراکنش: ' + err.message
                    });
                  }
                  
                  logger.success('تخلیه کامل دیتابیس با موفقیت انجام شد');
                  
                  res.json({
                    success: true,
                    message: 'تخلیه کامل دیتابیس با موفقیت انجام شد',
                    details: {
                      articlesDeleted,
                      historyDeleted,
                      logsDeleted,
                      totalDeleted: articlesDeleted + historyDeleted + logsDeleted
                    }
                  });
                });
              } else {
                const logsDeleted = this.changes;
                logger.info(`تعداد ${logsDeleted} لاگ عملیات حذف شد`);
                
                // تایید تراکنش
                db.run('COMMIT', function(err) {
                  if (err) {
                    logger.error('خطا در تایید تراکنش:', err);
                    return res.status(500).json({
                      success: false,
                      message: 'خطا در تایید تراکنش: ' + err.message
                    });
                  }
                  
                  logger.success('تخلیه کامل دیتابیس با موفقیت انجام شد');
                  
                  res.json({
                    success: true,
                    message: 'تخلیه کامل دیتابیس با موفقیت انجام شد',
                    details: {
                      articlesDeleted,
                      historyDeleted,
                      logsDeleted,
                      totalDeleted: articlesDeleted + historyDeleted + logsDeleted
                    }
                  });
                });
              }
            });
          });
        });
        
      } catch (error) {
        db.run('ROLLBACK');
        logger.error('خطا در تخلیه دیتابیس:', error);
        res.status(500).json({
          success: false,
          message: 'خطا در تخلیه دیتابیس: ' + error.message
        });
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// دریافت آمار دیتابیس
router.get('/database/stats', auth.verifyToken, async (req, res, next) => {
  try {
    const db = database.db;
    
    const stats = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as articlesCount FROM articles', (err, articlesRow) => {
        if (err) return reject(err);
        
        db.get('SELECT COUNT(*) as historyCount FROM crawl_history', (err, historyRow) => {
          if (err) return reject(err);
          
          // بررسی وجود جدول operation_logs
          db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='operation_logs'", (err, tableRow) => {
            if (err) return reject(err);
            
            if (tableRow) {
              // جدول وجود دارد
              db.get('SELECT COUNT(*) as logsCount FROM operation_logs', (err, logsRow) => {
                if (err) return reject(err);
                
                resolve({
                  articlesCount: articlesRow.articlesCount,
                  historyCount: historyRow.historyCount,
                  logsCount: logsRow.logsCount
                });
              });
            } else {
              // جدول وجود ندارد
              resolve({
                articlesCount: articlesRow.articlesCount,
                historyCount: historyRow.historyCount,
                logsCount: 0
              });
            }
          });
        });
      });
    });
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== SCHEDULES ROUTES ====================

// دریافت لیست زمان‌بندی‌ها
router.get('/schedules', auth.verifyToken, async (req, res, next) => {
  try {
    const schedules = await scheduler.getAllSchedules();
    const formattedSchedules = schedules.map(s => ({
      ...s,
      last_run: s.last_run && s.last_run !== 'null' && s.last_run !== 'undefined' ? moment(s.last_run).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : null,
      next_run: s.next_run && s.next_run !== 'null' && s.next_run !== 'undefined' ? moment(s.next_run).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : null,
      created_at: s.created_at ? moment(s.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : null,
      updated_at: s.updated_at && s.updated_at !== 'null' && s.updated_at !== 'undefined' ? moment(s.updated_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : null
    }));
    res.json(formattedSchedules);
  } catch (error) {
    next(error);
  }
});

// دریافت یک زمان‌بندی خاص
router.get('/schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    const schedule = await scheduler.getScheduleById(req.params.id);
    if (schedule) {
      res.json(schedule);
    } else {
      res.status(404).json({ message: 'زمان‌بندی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// ایجاد یک زمان‌بندی جدید
router.post('/schedules', auth.verifyToken, async (req, res, next) => {
  try {
    const { source_id, cron_expression, is_active, crawl_settings } = req.body;
    
    // اعتبارسنجی عبارت cron
    const cron = require('node-cron');
    if (!cron.validate(cron_expression)) {
      return res.status(400).json({ 
        success: false, 
        message: 'عبارت cron نامعتبر است. لطفاً فرمت صحیح را استفاده کنید (مثال: */10 * * * * برای هر 10 دقیقه)' 
      });
    }
    
    const crawlSettings = crawl_settings || {
      crawl_depth: 0,
      full_content: false,
      article_limit: 10,
      timeout_ms: 300000,
      follow_links: true
    };
    
    const newSchedule = await scheduler.createSchedule(source_id, cron_expression, is_active, crawlSettings);
    
    // شروع job اگر فعال است
    if (is_active) {
      const schedule = await scheduler.getScheduleById(newSchedule.id);
      scheduler.startJob(schedule);
    }
    
    res.status(201).json({ success: true, schedule: newSchedule });
  } catch (error) {
    next(error);
  }
});

// به‌روزرسانی یک زمان‌بندی
router.put('/schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    const { source_id, cron_expression, is_active, crawl_settings } = req.body;
    
    // اعتبارسنجی عبارت cron
    const cron = require('node-cron');
    if (!cron.validate(cron_expression)) {
      return res.status(400).json({ 
        success: false, 
        message: 'عبارت cron نامعتبر است. لطفاً فرمت صحیح را استفاده کنید (مثال: */10 * * * * برای هر 10 دقیقه)' 
      });
    }
    
    const crawlSettings = crawl_settings || {
      crawl_depth: 0,
      full_content: false,
      article_limit: 10,
      timeout_ms: 300000,
      follow_links: true
    };
    
    const updatedSchedule = await scheduler.updateSchedule(req.params.id, source_id, cron_expression, is_active, crawlSettings);
    
    // مدیریت job بر اساس وضعیت فعال/غیرفعال
    if (is_active) {
      const schedule = await scheduler.getScheduleById(req.params.id);
      scheduler.startJob(schedule);
    } else {
      scheduler.stopJob(req.params.id);
    }
    
    if (updatedSchedule) {
      res.json({ success: true, schedule: updatedSchedule });
    } else {
      res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// اجرای دستی یک زمان‌بندی
router.post('/schedules/:id/run', auth.verifyToken, async (req, res, next) => {
  try {
    const schedule = await scheduler.getScheduleById(req.params.id);
    if (schedule) {
      // اجرای وظیفه به صورت غیرهمزمان
      scheduler.runJob(schedule.id);
      res.json({ success: true, message: `زمان‌بندی ${schedule.id} به صورت دستی اجرا شد.` });
    } else {
      res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// حذف یک زمان‌بندی
router.delete('/schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    // متوقف کردن job قبل از حذف
    scheduler.stopJob(req.params.id);
    
    const success = await scheduler.deleteSchedule(req.params.id);
    if (success) {
      res.json({ success: true, message: 'زمان‌بندی با موفقیت حذف شد' });
    } else {
      res.status(404).json({ success: false, message: 'زمان‌بندی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// ==================== NEWS SOURCES ROUTES ====================

// Get selectors for a specific source
router.get('/sources/:id/selectors', auth.verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const db = database.db;
  
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM source_selectors WHERE source_id = ? ORDER BY priority ASC, created_at ASC', [id], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });
    
    res.json({
      success: true,
      selectors: rows
    });
  } catch (error) {
    next(error);
  }
});

// Add new selector to a source
router.post('/sources/:id/selectors', auth.verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const { selector_type, selector_value, selector_name, priority } = req.body;
  
  if (!selector_type || !selector_value) {
    return res.status(400).json({
      success: false,
      message: 'نوع سلکتور و مقدار سلکتور الزامی است'
    });
  }
  
  const db = database.db;
  const query = `
    INSERT INTO source_selectors 
    (source_id, selector_type, selector_value, selector_name, priority)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  try {
    const result = await new Promise((resolve, reject) => {
      db.run(query, [id, selector_type, selector_value, selector_name || '', priority || 1], function(err) {
        if (err) reject(err);
        resolve({ lastID: this.lastID });
      });
    });
    
    logger.info('سلکتور جدید اضافه شد:', { source_id: id, selector_type, id: result.lastID });
    
    res.json({
      success: true,
      message: 'سلکتور با موفقیت اضافه شد',
      selector_id: result.lastID
    });
  } catch (error) {
    next(error);
  }
});

// Update a selector
router.put('/sources/:sourceId/selectors/:selectorId', auth.verifyToken, async (req, res, next) => {
  const { sourceId, selectorId } = req.params;
  const { selector_type, selector_value, selector_name, priority, is_active } = req.body;
  
  const db = database.db;
  const query = `
    UPDATE source_selectors 
    SET selector_type = ?, selector_value = ?, selector_name = ?, priority = ?, is_active = ?
    WHERE id = ? AND source_id = ?
  `;
  
  try {
    const result = await new Promise((resolve, reject) => {
      db.run(query, [selector_type, selector_value, selector_name, priority, is_active, selectorId, sourceId], function(err) {
        if (err) reject(err);
        resolve({ changes: this.changes });
      });
    });
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'سلکتور یافت نشد'
      });
    }
    
    logger.info('سلکتور به‌روزرسانی شد:', { source_id: sourceId, selector_id: selectorId });
    
    res.json({
      success: true,
      message: 'سلکتور با موفقیت به‌روزرسانی شد'
    });
  } catch (error) {
    next(error);
  }
});

// Delete a selector
router.delete('/sources/:sourceId/selectors/:selectorId', auth.verifyToken, async (req, res, next) => {
  const { sourceId, selectorId } = req.params;
  const db = database.db;
  
  try {
    const result = await new Promise((resolve, reject) => {
      db.run('DELETE FROM source_selectors WHERE id = ? AND source_id = ?', [selectorId, sourceId], function(err) {
        if (err) reject(err);
        resolve({ changes: this.changes });
      });
    });
    
    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'سلکتور یافت نشد'
      });
    }
    
    logger.info('سلکتور حذف شد:', { source_id: sourceId, selector_id: selectorId });
    
    res.json({
      success: true,
      message: 'سلکتور با موفقیت حذف شد'
    });
  } catch (error) {
    next(error);
  }
});

// دریافت فید RSS برای یک منبع خاص
router.get('/sources/:id/rss', async (req, res, next) => {
  const { id } = req.params;
  const db = database.db;

  try {
    const articles = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM articles WHERE source_id = ? ORDER BY created_at DESC LIMIT 20', [id], (err, rows) => {
        if (err) reject(err);
        resolve(rows);
      });
    });

    const source = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM news_sources WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!source) {
      return res.status(404).json({ success: false, message: 'منبع یافت نشد' });
    }

    const RSS = require('rss');
    const feed = new RSS({
      title: `آخرین اخبار ${source.name}`,
      description: `آخرین اخبار و اخبار از منبع ${source.name}`,
      feed_url: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      site_url: source.base_url,
      language: 'fa',
    });

    articles.forEach(article => {
      feed.item({
        title: article.title,
        description: article.content,
        url: article.link,
        guid: article.article_hash,
        date: article.created_at ? moment(article.created_at).tz('Asia/Tehran').toDate() : new Date(),
      });
    });

    res.set('Content-Type', 'application/rss+xml');
    res.send(feed.xml());

  } catch (error) {
    next(error);
  }
});

// دریافت لیست منابع خبری
router.get('/sources', auth.verifyToken, async (req, res, next) => {
  const db = database.db;
  
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM news_sources ORDER BY created_at DESC', [], (err, rows) => {
        if (err) reject(err);
        // تبدیل زمان‌ها به تهران
        const formattedRows = rows.map(row => ({
          ...row,
          created_at: row.created_at ? moment(row.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : row.created_at,
          updated_at: row.updated_at ? moment(row.updated_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : row.updated_at
        }));
        resolve(formattedRows);
      });
    });
    
    res.json({
      success: true,
      sources: rows
    });
  } catch (error) {
    next(error);
  }
});

// دریافت منبع خاص
router.get('/sources/:id', auth.verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const db = database.db;
  
  try {
    const { id } = req.params;
    const db = database.db;
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM news_sources WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!row) {
      return res.status(404).json({ success: false, message: 'منبع یافت نشد' });
    }

    res.json({
      success: true,
      source: row
    });
  } catch (error) {
    next(error);
  }
});

// اضافه کردن منبع جدید
router.post('/sources', auth.verifyToken, async (req, res, next) => {
  const { name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type } = req.body;
  
  if (!name || !base_url || !list_selector) {
    return res.status(400).json({
      success: false,
      message: 'نام، URL پایه و سلکتور لیست الزامی است'
    });
  }
  
  const db = database.db;
  const query = `
    INSERT INTO news_sources 
    (name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  try {
    const { name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type } = req.body;

    if (!name || !base_url || !list_selector) {
      return res.status(400).json({
        success: false,
        message: 'نام، URL پایه و سلکتور لیست الزامی است'
      });
    }

    const db = database.db;
    const query = `
      INSERT INTO news_sources 
      (name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const result = await new Promise((resolve, reject) => {
      db.run(query, [name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type || 'puppeteer'], function(err) {
        if (err) reject(err);
        resolve({ lastID: this.lastID });
      });
    });

    logger.info('منبع جدید اضافه شد:', { name, id: result.lastID });

    res.json({
      success: true,
      message: 'منبع با موفقیت اضافه شد',
      sourceId: result.lastID
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed: news_sources.name')) {
      return res.status(400).json({ 
        success: false, 
        message: 'منبع با این نام قبلاً وجود دارد' 
      });
    }
    next(error);
  }
});

// به‌روزرسانی منبع
router.put('/sources/:id', auth.verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const { name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type, active } = req.body;
  
  const db = database.db;
  const query = `
    UPDATE news_sources 
    SET name = ?, base_url = ?, list_selector = ?, title_selector = ?, 
        content_selector = ?, link_selector = ?, crawler_type = ?, active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  
  try {
    const { id } = req.params;
    const { name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type, active } = req.body;

    const db = database.db;
    const query = `
      UPDATE news_sources 
      SET name = ?, base_url = ?, list_selector = ?, title_selector = ?, 
          content_selector = ?, link_selector = ?, crawler_type = ?, active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    const result = await new Promise((resolve, reject) => {
      db.run(query, [name, base_url, list_selector, title_selector, content_selector, link_selector, crawler_type || 'puppeteer', active, id], function(err) {
        if (err) reject(err);
        resolve({ changes: this.changes });
      });
    });

    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'منبع یافت نشد' });
    }

    logger.info('منبع به‌روزرسانی شد:', { id, name });

    res.json({
      success: true,
      message: 'منبع با موفقیت به‌روزرسانی شد'
    });
  } catch (error) {
    next(error);
  }
});

// حذف منبع
router.delete('/sources/:id', auth.verifyToken, async (req, res, next) => {
  const { id } = req.params;
  const db = database.db;
  
  try {
    // First check if the source exists
    const sourceExists = await new Promise((resolve, reject) => {
      db.get('SELECT id, name FROM news_sources WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });

    if (!sourceExists) {
      return res.status(404).json({ success: false, message: 'منبع یافت نشد' });
    }

    // For PostgreSQL with foreign key constraints, we need to delete dependent records first
    // or use a transaction to ensure atomicity
    if (db.isPostgres) {
      await db.beginTransaction();
      
      try {
        // Delete dependent records in the correct order
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM crawl_logs WHERE source_id = ?', [id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM operation_logs WHERE source_id = ?', [id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM crawl_history WHERE source_id = ?', [id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM articles WHERE source_id = ?', [id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        // schedules already has ON DELETE CASCADE, but delete explicitly for clarity
        await new Promise((resolve, reject) => {
          db.run('DELETE FROM schedules WHERE source_id = ?', [id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        // Finally delete the news source
        const result = await new Promise((resolve, reject) => {
          db.run('DELETE FROM news_sources WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            resolve({ changes: this.changes });
          });
        });

        await db.commit();
        
        logger.info('منبع و تمام رکوردهای وابسته حذف شدند:', { id, name: sourceExists.name });

        res.json({
          success: true,
          message: 'منبع و تمام اطلاعات مرتبط با موفقیت حذف شدند'
        });
        
      } catch (txError) {
        await db.rollback();
        throw txError;
      }
    } else {
      // For SQLite, foreign keys might not be enforced, but let's be safe
      const result = await new Promise((resolve, reject) => {
        db.run('DELETE FROM news_sources WHERE id = ?', [id], function(err) {
          if (err) reject(err);
          resolve({ changes: this.changes });
        });
      });

      if (result.changes === 0) {
        return res.status(404).json({ success: false, message: 'منبع یافت نشد' });
      }

      logger.info('منبع حذف شد:', { id, name: sourceExists.name });

      res.json({
        success: true,
        message: 'منبع با موفقیت حذف شد'
      });
    }
  } catch (error) {
    logger.error('خطا در حذف منبع:', { id, error: error.message });
    
    // Handle specific PostgreSQL foreign key constraint errors
    if (error.message && error.message.includes('foreign key constraint')) {
      return res.status(400).json({
        success: false,
        message: 'نمی‌توان منبع را حذف کرد زیرا اطلاعات مرتبط با آن وجود دارد. لطفاً ابتدا اطلاعات مرتبط را حذف کنید.'
      });
    }
    
    next(error);
  }
});

// ==================== CRAWLER ROUTES ====================

// کرال جامع (Universal Crawler)
router.post('/crawler/crawl', auth.verifyToken, async (req, res) => {
  try {
    const { source_id, limit = 10, depth = 0, full_content = true } = req.body;
    
    if (!source_id) {
      return res.status(400).json({
        success: false,
        message: 'شناسه منبع الزامی است'
      });
    }
    
    const result = await crawler.crawlSource(parseInt(source_id), {
      limit: parseInt(limit),
      crawlDepth: parseInt(depth),
      fullContent: full_content
    });
    
    res.json({
      success: true,
      processed: result.processed || 0,
      new_articles: result.newArticles || 0,
      duplicates: result.duplicates || 0,
      errors: result.errors || 0,
      message: 'کرال با موفقیت انجام شد'
    });
    
  } catch (error) {
    logger.error('خطا در کرال جامع:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در کرال',
      error: error.message
    });
  }
});

// کرال منبع خاص
router.get('/crawl/:sourceId', auth.verifyToken, async (req, res) => {
  try {
    const { sourceId } = req.params;
    const { limit = 10, depth = 0, full = true } = req.query;
    
    const result = await crawler.crawlSource(parseInt(sourceId), {
      limit: parseInt(limit),
      crawlDepth: parseInt(depth),
      fullContent: full === 'true'
    });
    
    res.json(result);
    
  } catch (error) {
    logger.error('خطا در کرال:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در کرال',
      error: error.message
    });
  }
});

// کرال فارس‌نیوز (برای سازگاری)
router.get('/farsnews', async (req, res) => {
  try {
    const { limit = 10, depth = 0, full = true } = req.query;
    
    // فارس‌نیوز همیشه sourceId = 1
    const result = await crawler.crawlSource(1, {
      limit: parseInt(limit),
      crawlDepth: parseInt(depth),
      fullContent: full === 'true'
    });
    
    res.json(result);
    
  } catch (error) {
    logger.error('خطا در کرال فارس‌نیوز:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در کرال',
      error: error.message
    });
  }
});

// تست سلکتور (بدون احراز هویت - برای استفاده عمومی)
router.post('/test-selector', async (req, res) => {
  try {
    const { url, selector, type = 'list' } = req.body;
    
    // اعتبارسنجی ورودی
    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        message: 'URL و سلکتور الزامی است',
        code: 'MISSING_PARAMETERS'
      });
    }
    
    // بررسی فرمت URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'فرمت URL نامعتبر است',
        code: 'INVALID_URL'
      });
    }
    
    // اجرای تست سلکتور
    const result = await crawler.testSelector(url, selector, type);
    
    if (result.success) {
      // فرمت کردن نتیجه برای frontend
      const response = {
        success: true,
        message: `✅ ${result.result.count} عنصر یافت شد`,
        data: {
          count: result.result.count,
          samples: result.result.samples,
          performance: result.performance,
          metadata: {
            url: result.url,
            selector: result.selector,
            type: result.type,
            duration: result.duration,
            timestamp: result.timestamp
          }
        }
      };
      
      // فرمت خاص برای نوع list
      if (type === 'list') {
        response.data.formattedSamples = result.result.samples.map(sample => ({
          index: sample.index,
          url: sample.href || url,
          text: sample.text,
          element: {
            tag: sample.tagName,
            class: sample.className,
            id: sample.id
          }
        }));
      }
      
      res.json(response);
      
    } else {
      // مدیریت خطاهای مختلف
      const errorResponse = {
        success: false,
        message: `❌ ${result.error}`,
        error: {
          type: result.errorType || 'unknown',
          suggestion: result.suggestion || 'لطفاً سلکتور یا URL را بررسی کنید',
          details: result.error
        },
        metadata: {
          url: result.url,
          selector: result.selector,
          type: result.type,
          duration: result.duration,
          timestamp: result.timestamp
        }
      };
      
      // اضافه کردن پیشنهادات و اطلاعات صفحه در صورت وجود
      if (result.suggestions && result.suggestions.length > 0) {
        errorResponse.suggestions = result.suggestions;
      }
      
      if (result.pageInfo) {
        errorResponse.pageInfo = result.pageInfo;
      }
      
      // تعیین کد وضعیت HTTP بر اساس نوع خطا
      let statusCode = 400;
      if (result.errorType === 'timeout' || result.errorType === 'network') {
        statusCode = 408; // Request Timeout
      } else if (result.errorType === 'browser') {
        statusCode = 503; // Service Unavailable
      }
      
      res.status(statusCode).json(errorResponse);
    }
    
  } catch (error) {
    logger.error('خطای غیرمنتظره در تست سلکتور:', error);
    
    res.status(500).json({
      success: false,
      message: '❌ خطای داخلی سرور در تست سلکتور',
      error: {
        type: 'internal_server_error',
        suggestion: 'لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید',
        details: error.message
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

// تست سلکتور (با احراز هویت)
router.post('/crawler/test-selector', auth.verifyToken, async (req, res) => {
  try {
    const { url, selector, type = 'list' } = req.body;
    
    // اعتبارسنجی ورودی
    if (!url || !selector) {
      return res.status(400).json({
        success: false,
        message: 'URL و سلکتور الزامی است',
        code: 'MISSING_PARAMETERS'
      });
    }
    
    // بررسی فرمت URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'فرمت URL نامعتبر است',
        code: 'INVALID_URL'
      });
    }
    
    // اجرای تست سلکتور
    const result = await crawler.testSelector(url, selector, type);
    
    if (result.success) {
      // فرمت کردن نتیجه برای frontend
      const response = {
        success: true,
        message: `✅ ${result.result.count} عنصر یافت شد`,
        data: {
          count: result.result.count,
          samples: result.result.samples,
          performance: result.performance,
          metadata: {
            url: result.url,
            selector: result.selector,
            type: result.type,
            duration: result.duration,
            timestamp: result.timestamp
          }
        }
      };
      
      // فرمت خاص برای نوع list
      if (type === 'list') {
        response.data.formattedSamples = result.result.samples.map(sample => ({
          index: sample.index,
          url: sample.href || url,
          text: sample.text,
          element: {
            tag: sample.tagName,
            class: sample.className,
            id: sample.id
          }
        }));
      }
      
      res.json(response);
      
    } else {
      // مدیریت خطاهای مختلف
      const errorResponse = {
        success: false,
        message: `❌ ${result.error}`,
        error: {
          type: result.errorType || 'unknown',
          suggestion: result.suggestion || 'لطفاً سلکتور یا URL را بررسی کنید',
          details: result.error
        },
        metadata: {
          url: result.url,
          selector: result.selector,
          type: result.type,
          duration: result.duration,
          timestamp: result.timestamp
        }
      };
      
      // اضافه کردن پیشنهادات و اطلاعات صفحه در صورت وجود
      if (result.suggestions && result.suggestions.length > 0) {
        errorResponse.suggestions = result.suggestions;
      }
      
      if (result.pageInfo) {
        errorResponse.pageInfo = result.pageInfo;
      }
      
      // تعیین کد وضعیت HTTP بر اساس نوع خطا
      let statusCode = 400;
      if (result.errorType === 'timeout' || result.errorType === 'network') {
        statusCode = 408; // Request Timeout
      } else if (result.errorType === 'browser') {
        statusCode = 503; // Service Unavailable
      }
      
      res.status(statusCode).json(errorResponse);
    }
    
  } catch (error) {
    logger.error('خطای غیرمنتظره در تست سلکتور:', error);
    
    res.status(500).json({
      success: false,
      message: '❌ خطای داخلی سرور در تست سلکتور',
      error: {
        type: 'internal_server_error',
        suggestion: 'لطفاً دوباره تلاش کنید یا با پشتیبانی تماس بگیرید',
        details: error.message
      },
      metadata: {
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ==================== ARTICLES ROUTES ====================

// Legacy route, will be deprecated
router.get('/articles', async (req, res, next) => {
  const { source_id, full, limit = 10, newOnly, page = 1 } = req.query;
  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

  // Query for counting total articles
  let countQuery = `
    SELECT COUNT(*) as total
    FROM articles a
    LEFT JOIN news_sources ns ON a.source_id = ns.id
  `;
  
  // Query for fetching articles
  let query = `
    SELECT 
      a.*,
      ns.name as source_name
    FROM articles a
    LEFT JOIN news_sources ns ON a.source_id = ns.id
  `;
  const params = [];
  const countParams = [];
  const conditions = [];

  if (source_id) {
    conditions.push('a.source_id = ?');
    params.push(source_id);
    countParams.push(source_id);
  }

  if (newOnly === 'true') {
    conditions.push('COALESCE(CASE WHEN a.is_read THEN 1 ELSE 0 END, 0) = 0');
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    query += whereClause;
    countQuery += whereClause;
  }

  query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit, 10), offset);

  try {
    const db = database.db;
    
    // Get total count
    const totalCount = await new Promise((resolve, reject) => {
      db.get(countQuery, countParams, (err, result) => {
        if (err) reject(err);
        resolve(result.total);
      });
    });
    
    // Get articles
    const rows = await new Promise((resolve, reject) => {
      db.all(query, params, (err, results) => {
        if (err) reject(err);
        // تبدیل زمان‌ها به تهران با moment.js
        const processedRows = results.map(row => ({
          ...row,
          created_at: row.created_at ? moment(row.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : row.created_at
        }));
        resolve(processedRows);
      });
    });

    if (full !== 'true') {
      rows.forEach(row => {
        delete row.content;
      });
    }

    const totalPages = Math.ceil(totalCount / parseInt(limit, 10));
    const currentPage = parseInt(page, 10);

    res.json({
      success: true,
      articles: rows,
      pagination: {
        currentPage,
        totalPages,
        totalCount,
        limit: parseInt(limit, 10),
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1
      }
    });

    if (newOnly === 'true' && rows.length > 0) {
      const ids = rows.map(row => row.id);
      const updateQuery = `UPDATE articles SET is_read = (1=1) WHERE id IN (${ids.map(() => '?').join(',')})`;
      await new Promise((resolve, reject) => {
        db.run(updateQuery, ids, (err) => {
          if (err) reject(err);
          resolve();
        });
      });
    }
  } catch (error) {
    next(error);
  }
});

// دریافت یک مقاله خاص
router.get('/articles/:id', async (req, res, next) => {
  const { id } = req.params;
  const db = database.db;

  try {
    const article = await new Promise((resolve, reject) => {
      const query = `
        SELECT 
          a.*,
          ns.name as source_name
        FROM articles a
        LEFT JOIN news_sources ns ON a.source_id = ns.id
        WHERE a.id = ?
      `;
      db.get(query, [id], (err, result) => {
        if (err) reject(err);
        if (result) {
          const processedArticle = {
            ...result,
            created_at: result.created_at ? moment(result.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : result.created_at
          };
          resolve(processedArticle);
        } else {
          resolve(null);
        }
      });
    });

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'مقاله یافت نشد'
      });
    }

    res.json({
      success: true,
      article
    });

  } catch (error) {
    next(error);
  }
});

// علامت‌گذاری مقاله به عنوان خوانده‌شده
router.put('/articles/:id/read', (req, res) => {
  const { id } = req.params;
  const db = database.db;
  
  db.run('UPDATE articles SET is_read = (1=1) WHERE id = ?', [id], function(err) {
    if (err) {
      logger.error('خطا در به‌روزرسانی مقاله:', err);
      return res.status(500).json({ success: false, message: 'خطای دیتابیس' });
    }
    
    res.json({
      success: true,
      message: 'مقاله به عنوان خوانده‌شده علامت‌گذاری شد'
    });
  });
});

// ==================== STATS & LOGS ROUTES ====================

// آمار کلی
router.get('/stats', (req, res) => {
  const db = database.db;
  
  const queries = {
    totalArticles: 'SELECT COUNT(*) as count FROM articles',
    newArticles: 'SELECT COUNT(*) as count FROM articles WHERE COALESCE(CASE WHEN is_read THEN 1 ELSE 0 END, 0) = 0',
    totalSources: 'SELECT COUNT(*) as count FROM news_sources WHERE COALESCE(CASE WHEN active THEN 1 ELSE 0 END, 0) = 1',
    recentCrawls: 'SELECT COUNT(*) as count FROM crawl_history WHERE created_at > datetime("now", "-24 hours")',
    topSources: `
      SELECT ns.name, COUNT(a.id) as article_count
      FROM news_sources ns
      LEFT JOIN articles a ON ns.id = a.source_id
      WHERE COALESCE(CASE WHEN ns.active THEN 1 ELSE 0 END, 0) = 1
      GROUP BY ns.id, ns.name
      ORDER BY article_count DESC
      LIMIT 5
    `
  };
  
  const stats = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, [], (err, rows) => {
      if (err) {
        logger.error(`خطا در آمار ${key}:`, err);
        stats[key] = key === 'topSources' ? [] : 0;
      } else {
        stats[key] = key === 'topSources' ? rows : rows[0].count;
      }
      
      completed++;
      if (completed === total) {
        res.json({
          success: true,
          stats
        });
      }
    });
  });
});

// دریافت لاگ‌های
router.get('/logs', auth.verifyToken, async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await logger.getRecentLogs(parseInt(limit));
    
    // تبدیل زمان‌ها به تهران
    const formattedLogs = logs.map(log => ({
      ...log,
      timestamp: log.timestamp ? moment(log.timestamp).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : log.timestamp,
      created_at: log.created_at ? moment(log.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : log.created_at
    }));
    
    res.json({
      success: true,
      logs: formattedLogs
    });
  } catch (error) {
    logger.error('خطا در دریافت لاگ‌های:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت لاگ‌های'
    });
  }
});

// تاریخچه کرال
router.get('/crawl-history', auth.verifyToken, (req, res) => {
  const { source, limit = 20 } = req.query;
  const db = database.db;
  
  let query = `
    SELECT ch.*, ns.name as source_name
    FROM crawl_history ch
    LEFT JOIN news_sources ns ON ch.source_id = ns.id
  `;
  
  const params = [];
  
  if (source) {
    query += ' WHERE ch.source_id = ?';
    params.push(source);
  }
  
  query += ' ORDER BY ch.created_at DESC LIMIT ?';
  params.push(parseInt(limit));
  
  db.all(query, params, (err, rows) => {
    if (err) {
      logger.error('خطا در دریافت تاریخچه:', err);
      return res.status(500).json({ success: false, message: 'خطای دیتابیس' });
    }
    
    // تبدیل زمان‌ها به تهران
    const formattedHistory = rows.map(row => ({
      ...row,
      created_at: row.created_at ? moment(row.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : row.created_at,
      crawl_date: row.crawl_date ? moment(row.crawl_date).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : row.crawl_date
    }));
    
    res.json({
      success: true,
      history: formattedHistory
    });
  });
});



// ==================== CLEANUP SCHEDULES ROUTES ====================

// دریافت همه زمانبندی‌های پاک‌سازی
router.get('/cleanup-schedules', auth.verifyToken, async (req, res, next) => {
  try {
    const schedules = await cleanup.getAllActiveSchedules();
    
    const formattedSchedules = schedules.map(schedule => ({
      ...schedule,
      created_at: schedule.created_at ? moment(schedule.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : schedule.created_at,
      updated_at: schedule.updated_at ? moment(schedule.updated_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : schedule.updated_at
    }));
    
    res.json({ success: true, schedules: formattedSchedules });
  } catch (error) {
    next(error);
  }
});

// دریافت یک زمانبندی پاک‌سازی
router.get('/cleanup-schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    const schedule = await cleanup.getScheduleById(req.params.id);
    
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'زمانبندی پاک‌سازی یافت نشد' });
    }
    
    const formattedSchedule = {
      ...schedule,
      created_at: schedule.created_at ? moment(schedule.created_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : schedule.created_at,
      updated_at: schedule.updated_at ? moment(schedule.updated_at).tz('Asia/Tehran').format('YYYY/MM/DD HH:mm:ss') : schedule.updated_at
    };
    
    res.json({ success: true, schedule: formattedSchedule });
  } catch (error) {
    next(error);
  }
});

// ایجاد زمانبندی پاک‌سازی جدید
router.post('/cleanup-schedules', auth.verifyToken, async (req, res, next) => {
  try {
    const { name, cron_expression, keep_articles_count, is_active } = req.body;
    
    // اعتبارسنجی عبارت cron
    const cron = require('node-cron');
    if (!cron.validate(cron_expression)) {
      return res.status(400).json({ 
        success: false, 
        message: 'عبارت cron نامعتبر است. لطفاً فرمت صحیح را استفاده کنید (مثال: 0 2 * * * برای ساعت 2 شب هر روز)' 
      });
    }
    
    const newSchedule = await cleanup.createSchedule(name, cron_expression, keep_articles_count, is_active);
    
    // شروع job اگر فعال است
    if (is_active) {
      const schedule = await cleanup.getScheduleById(newSchedule.id);
      await cleanup.startJob(schedule);
    }
    
    res.status(201).json({ success: true, schedule: newSchedule });
  } catch (error) {
    next(error);
  }
});

// به‌روزرسانی زمانبندی پاک‌سازی
router.put('/cleanup-schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    const { name, cron_expression, keep_articles_count, is_active } = req.body;
    
    // اعتبارسنجی عبارت cron
    const cron = require('node-cron');
    if (!cron.validate(cron_expression)) {
      return res.status(400).json({ 
        success: false, 
        message: 'عبارت cron نامعتبر است. لطفاً فرمت صحیح را استفاده کنید (مثال: 0 2 * * * برای ساعت 2 شب هر روز)' 
      });
    }
    
    const updatedSchedule = await cleanup.updateSchedule(req.params.id, name, cron_expression, keep_articles_count, is_active);
    
    // مدیریت job بر اساس وضعیت فعال/غیرفعال
    if (is_active) {
      const schedule = await cleanup.getScheduleById(req.params.id);
      await cleanup.startJob(schedule);
    } else {
      cleanup.stopJob(req.params.id);
    }
    
    if (updatedSchedule.changes > 0) {
      res.json({ success: true, schedule: updatedSchedule });
    } else {
      res.status(404).json({ success: false, message: 'زمانبندی پاک‌سازی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// حذف زمانبندی پاک‌سازی
router.delete('/cleanup-schedules/:id', auth.verifyToken, async (req, res, next) => {
  try {
    const result = await cleanup.deleteSchedule(req.params.id);
    if (result.success) {
      res.json({ success: true, message: 'زمانبندی پاک‌سازی با موفقیت حذف شد' });
    } else {
      res.status(404).json({ success: false, message: 'زمانبندی پاک‌سازی یافت نشد' });
    }
  } catch (error) {
    next(error);
  }
});

// اجرای دستی پاک‌سازی
router.post('/cleanup-schedules/:id/run', auth.verifyToken, async (req, res, next) => {
  try {
    const schedule = await cleanup.getScheduleById(req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, message: 'زمانبندی پاک‌سازی یافت نشد' });
    }
    
    const result = await cleanup.runManualCleanup(schedule.keep_articles_count);
    res.json({ 
      success: true, 
      message: `پاک‌سازی با موفقیت انجام شد: ${result.deletedCount} مقاله پاک شد`,
      result 
    });
  } catch (error) {
    next(error);
  }
});

// پاک‌سازی دستی با تعداد دلخواه
router.post('/cleanup/manual', auth.verifyToken, async (req, res, next) => {
  try {
    const { keep_articles_count } = req.body;
    
    if (!keep_articles_count || keep_articles_count < 1) {
      return res.status(400).json({ 
        success: false, 
        message: 'تعداد مقالات نگهداری شده باید حداقل 1 باشد' 
      });
    }
    
    const result = await cleanup.runManualCleanup(keep_articles_count);
    res.json({ 
      success: true, 
      message: `پاک‌سازی دستی با موفقیت انجام شد: ${result.deletedCount} مقاله پاک شد`,
      result 
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;