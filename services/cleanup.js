const cron = require('node-cron');
const database = require('../config/database');
const logger = require('../utils/logger');

class CleanupService {
  constructor() {
    this.jobs = {};
    this.db = database.db;
  }

  // شروع همه زمانبندی‌های فعال
  async startAllJobs() {
    try {
      const schedules = await this.getAllActiveSchedules();
      console.log(`📋 ${schedules.length} زمانبندی پاک‌سازی یافت شد`);
      
      for (const schedule of schedules) {
        await this.startJob(schedule);
      }
    } catch (error) {
      console.error('خطا در شروع زمانبندی‌های پاک‌سازی:', error);
    }
  }

  // شروع یک زمانبندی پاک‌سازی
  async startJob(schedule) {
    // متوقف کردن job قبلی اگر وجود دارد
    if (this.jobs[schedule.id]) {
      this.jobs[schedule.id].stop();
      delete this.jobs[schedule.id];
    }

    console.log(`▶️ شروع زمانبندی پاک‌سازی ID=${schedule.id}, Cron="${schedule.cron_expression}"`);

    const job = cron.schedule(schedule.cron_expression, async () => {
      console.log(`🧹 اجرای زمانبندی پاک‌سازی: ${schedule.name}`);
      
      try {
        const result = await this.performCleanup(schedule.keep_articles_count);
        console.log(`✅ پاک‌سازی با موفقیت انجام شد: ${result.deletedCount} مقاله پاک شد، ${result.remainingCount} مقاله باقی ماند`);
        
        await this.logCleanupOperation(schedule.id, 'success', 
          `پاک‌سازی موفق: ${result.deletedCount} مقاله پاک شد`);
          
      } catch (error) {
        console.error(`❌ خطا در پاک‌سازی:`, error.message);
        
        await this.logCleanupOperation(schedule.id, 'error', 
          `خطا در پاک‌سازی: ${error.message}`);
      }
    }, {
      scheduled: false
    });

    job.start();
    console.log(`✅ زمانبندی پاک‌سازی ID=${schedule.id} با موفقیت شروع شد`);
    
    this.jobs[schedule.id] = job;
  }

  // اجرای پاک‌سازی
  async performCleanup(keepCount = 1000) {
    return new Promise((resolve, reject) => {
      // ابتدا تعداد کل مقالات را بشماریم
      this.db.get('SELECT COUNT(*) as total FROM articles', [], (err, countResult) => {
        if (err) {
          reject(err);
          return;
        }

        const totalArticles = countResult.total;
        
        if (totalArticles <= keepCount) {
          resolve({
            deletedCount: 0,
            remainingCount: totalArticles,
            message: `تعداد مقالات (${totalArticles}) کمتر از حد نگهداری (${keepCount}) است`
          });
          return;
        }

        const deleteCount = totalArticles - keepCount;

        // پاک کردن قدیمی‌ترین مقالات
        const deleteQuery = `
          DELETE FROM articles 
          WHERE id IN (
            SELECT id FROM articles 
            ORDER BY created_at ASC 
            LIMIT ?
          )
        `;

        this.db.run(deleteQuery, [deleteCount], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({
              deletedCount: this.changes,
              remainingCount: keepCount,
              totalBefore: totalArticles
            });
          }
        });
      });
    });
  }

  // دریافت همه زمانبندی‌های فعال
  async getAllActiveSchedules() {
    return new Promise((resolve, reject) => {
      // سازگار با PostgreSQL و SQLite
      const query = 'SELECT * FROM cleanup_schedules WHERE is_active = true ORDER BY id';
      this.db.all(query, [], (err, rows) => {
        if (err) {
          console.error('خطا در بارگذاری زمانبندی‌های پاک‌سازی:', err.message);
          return resolve([]);
        }
        const safeRows = Array.isArray(rows) ? rows : [];
        resolve(safeRows);
      });
    });
  }

  // ایجاد زمانبندی جدید
  async createSchedule(name, cronExpression, keepArticlesCount, isActive = true) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO cleanup_schedules (name, cron_expression, keep_articles_count, is_active)
        VALUES (?, ?, ?, ?)
      `;
      
      this.db.run(query, [name, cronExpression, keepArticlesCount, isActive], function(err) {
        if (err) reject(err);
        resolve({ id: this.lastID });
      });
    });
  }

  // به‌روزرسانی زمانبندی
  async updateSchedule(id, name, cronExpression, keepArticlesCount, isActive) {
    return new Promise((resolve, reject) => {
      const query = `
        UPDATE cleanup_schedules 
        SET name = ?, cron_expression = ?, keep_articles_count = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `;
      
      this.db.run(query, [name, cronExpression, keepArticlesCount, isActive, id], function(err) {
        if (err) reject(err);
        resolve({ changes: this.changes });
      });
    });
  }

  // حذف زمانبندی
  async deleteSchedule(id) {
    // متوقف کردن job
    if (this.jobs[id]) {
      this.jobs[id].stop();
      delete this.jobs[id];
    }

    return new Promise((resolve, reject) => {
      const query = 'DELETE FROM cleanup_schedules WHERE id = ?';
      this.db.run(query, [id], function(err) {
        if (err) reject(err);
        resolve({ success: this.changes > 0 });
      });
    });
  }

  // متوقف کردن زمانبندی
  stopJob(id) {
    if (this.jobs[id]) {
      this.jobs[id].stop();
      delete this.jobs[id];
      console.log(`⏹️ زمانبندی پاک‌سازی ID=${id} متوقف شد`);
    }
  }

  // دریافت یک زمانبندی
  async getScheduleById(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM cleanup_schedules WHERE id = ?';
      this.db.get(query, [id], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
  }

  // اجرای دستی پاک‌سازی
  async runManualCleanup(keepCount) {
    console.log(`🧹 شروع پاک‌سازی دستی (نگهداری ${keepCount} مقاله)...`);
    
    try {
      const result = await this.performCleanup(keepCount);
      console.log(`✅ پاک‌سازی دستی تکمیل شد: ${result.deletedCount} مقاله پاک شد`);
      return result;
    } catch (error) {
      console.error(`❌ خطا در پاک‌سازی دستی:`, error);
      throw error;
    }
  }

  // ثبت لاگ عملیات پاک‌سازی
  async logCleanupOperation(scheduleId, status, message) {
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO operation_logs (source_id, action, status, message, details)
        VALUES (?, 'cleanup', ?, ?, ?)
      `;
      
      const details = JSON.stringify({ scheduleId, timestamp: new Date().toISOString() });
      
      this.db.run(query, [null, status, message, details], function(err) {
        if (err) {
          console.warn('خطا در ثبت لاگ پاک‌سازی:', err.message);
          resolve(); // ادامه عملیات حتی در صورت خطا در لاگ
        } else {
          resolve(this.lastID);
        }
      });
    });
  }
}

module.exports = new CleanupService();