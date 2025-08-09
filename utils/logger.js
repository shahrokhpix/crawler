const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const database = require('../config/database');

class Logger {
  constructor() {
    this.logDir = path.join(__dirname, '..', 'logs');
    this.ensureLogDir();
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName() {
    const date = moment().tz('Asia/Tehran').format('YYYY-MM-DD');
    return path.join(this.logDir, `crawler-${date}.log`);
  }

  formatMessage(level, message, data = null) {
    const timestamp = moment().tz('Asia/Tehran').format();
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${logData}\n`;
  }

  writeToFile(level, message, data = null) {
    const logMessage = this.formatMessage(level, message, data);
    const logFile = this.getLogFileName();
    
    fs.appendFile(logFile, logMessage, (err) => {
      if (err) {
        console.error('خطا در نوشتن لاگ:', err);
      }
    });
  }

  info(message, data = null) {
    console.log(`ℹ️ ${message}`, data || '');
    this.writeToFile('info', message, data);
  }

  error(message, error = null) {
    const errorData = error ? {
      message: error.message,
      stack: error.stack
    } : null;
    
    console.error(`❌ ${message}`, errorData || '');
    this.writeToFile('error', message, errorData);
  }

  warn(message, data = null) {
    console.warn(`⚠️ ${message}`, data || '');
    this.writeToFile('warn', message, data);
  }

  success(message, data = null) {
    console.log(`✅ ${message}`, data || '');
    this.writeToFile('success', message, data);
  }

  // لاگ کرال در دیتابیس
  async logCrawlOperation(sourceId, action, status, message, stats = {}) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = `
        INSERT INTO crawl_logs 
        (source_id, action, status, message, articles_found, articles_processed, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(query, [
        sourceId,
        action,
        status,
        message,
        stats.articlesFound || 0,
        stats.articlesProcessed || 0,
        stats.duration || 0
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // دریافت لاگ‌های اخیر
  async getRecentLogs(limit = 50) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = `
        SELECT cl.*, ns.name as source_name
        FROM crawl_logs cl
        LEFT JOIN news_sources ns ON cl.source_id = ns.id
        ORDER BY cl.created_at DESC
        LIMIT ?
      `;
      
      db.all(query, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // پاک کردن لاگ‌های قدیمی
  async cleanOldLogs(daysToKeep = 30) {
    const db = database.db;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    return new Promise((resolve, reject) => {
      const query = `DELETE FROM crawl_logs WHERE created_at < ?`;
      
      db.run(query, [cutoffDate.toISOString()], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }
}

module.exports = new Logger();