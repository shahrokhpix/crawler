const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const database = require('../config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'crawler-secret-key-2024';
const JWT_EXPIRES_IN = '24h';

class AuthMiddleware {
  // ایجاد توکن JWT
  generateToken(user) {
    return jwt.sign(
      { 
        id: user.id, 
        username: user.username,
        email: user.email 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // تأیید توکن JWT
  verifyToken(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '') || 
                  req.cookies?.auth_token;

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'توکن احراز هویت مورد نیاز است' 
      });
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      logger.warn('توکن نامعتبر:', { token: token.substring(0, 20) + '...' });
      return res.status(401).json({ 
        success: false, 
        message: 'توکن نامعتبر است' 
      });
    }
  }

  // ورود کاربر
  async login(username, password) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM admin_users WHERE username = ? AND active = true';
      
      db.get(query, [username], async (err, user) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!user) {
          resolve({ success: false, message: 'کاربر یافت نشد' });
          return;
        }
        
        try {
          const isValidPassword = await bcrypt.compare(password, user.password_hash);
          
          if (!isValidPassword) {
            logger.warn('تلاش ورود ناموفق:', { username });
            resolve({ success: false, message: 'رمز عبور اشتباه است' });
            return;
          }
          
          const token = this.generateToken(user);
          
          logger.info('ورود موفقیت‌آمیز:', { username, userId: user.id });
          
          resolve({
            success: true,
            message: 'ورود موفقیت‌آمیز',
            token,
            user: {
              id: user.id,
              username: user.username,
              email: user.email
            }
          });
          
        } catch (bcryptError) {
          reject(bcryptError);
        }
      });
    });
  }

  // ایجاد کاربر جدید
  async createUser(userData) {
    const db = database.db;
    const { username, password, email } = userData;
    
    try {
      const passwordHash = await bcrypt.hash(password, 10);
      
      return new Promise((resolve, reject) => {
        const query = `
          INSERT INTO admin_users (username, password_hash, email)
          VALUES (?, ?, ?)
        `;
        
        db.run(query, [username, passwordHash, email], function(err) {
          if (err) {
            if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
              resolve({ success: false, message: 'نام کاربری قبلاً استفاده شده است' });
            } else {
              reject(err);
            }
          } else {
            logger.info('کاربر جدید ایجاد شد:', { username, userId: this.lastID });
            resolve({
              success: true,
              message: 'کاربر با موفقیت ایجاد شد',
              userId: this.lastID
            });
          }
        });
      });
      
    } catch (error) {
      throw error;
    }
  }

  // تغییر رمز عبور
  async changePassword(userId, oldPassword, newPassword) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      // ابتدا کاربر را پیدا کنیم
      const getUserQuery = 'SELECT * FROM admin_users WHERE id = ?';
      
      db.get(getUserQuery, [userId], async (err, user) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!user) {
          resolve({ success: false, message: 'کاربر یافت نشد' });
          return;
        }
        
        try {
          // بررسی رمز عبور قدیمی
          const isValidOldPassword = await bcrypt.compare(oldPassword, user.password_hash);
          
          if (!isValidOldPassword) {
            resolve({ success: false, message: 'رمز عبور قدیمی اشتباه است' });
            return;
          }
          
          // هش کردن رمز عبور جدید
          const newPasswordHash = await bcrypt.hash(newPassword, 10);
          
          // به‌روزرسانی رمز عبور
          const updateQuery = 'UPDATE admin_users SET password_hash = ? WHERE id = ?';
          
          db.run(updateQuery, [newPasswordHash, userId], function(err) {
            if (err) {
              reject(err);
            } else {
              logger.info('رمز عبور تغییر کرد:', { userId });
              resolve({
                success: true,
                message: 'رمز عبور با موفقیت تغییر کرد'
              });
            }
          });
          
        } catch (bcryptError) {
          reject(bcryptError);
        }
      });
    });
  }

  // دریافت اطلاعات کاربر
  async getUserInfo(userId) {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT id, username, email, created_at FROM admin_users WHERE id = ? AND active = true';
      
      db.get(query, [userId], (err, user) => {
        if (err) {
          reject(err);
        } else {
          resolve(user);
        }
      });
    });
  }

  // لیست کاربران (فقط برای ادمین اصلی)
  async getAllUsers() {
    const db = database.db;
    
    return new Promise((resolve, reject) => {
      const query = 'SELECT id, username, email, active, created_at FROM admin_users ORDER BY created_at DESC';
      
      db.all(query, [], (err, users) => {
        if (err) {
          reject(err);
        } else {
          resolve(users);
        }
      });
    });
  }
}

module.exports = new AuthMiddleware();