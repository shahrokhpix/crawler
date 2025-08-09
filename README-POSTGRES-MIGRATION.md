# مهاجرت به PostgreSQL - راهنمای کامل

## 📋 فهرست مطالب

1. [مقدمه](#مقدمه)
2. [پیش‌نیازها](#پیش‌نیازها)
3. [نصب PostgreSQL](#نصب-postgresql)
4. [راه‌اندازی پایگاه داده](#راه‌اندازی-پایگاه-داده)
5. [مهاجرت داده‌ها](#مهاجرت-داده‌ها)
6. [تنظیمات محیط](#تنظیمات-محیط)
7. [اجرای برنامه](#اجرای-برنامه)
8. [استفاده از Docker](#استفاده-از-docker)
9. [عیب‌یابی](#عیب‌یابی)
10. [بازگشت به SQLite](#بازگشت-به-sqlite)

---

## 🚀 مقدمه

این راهنما شرح کاملی از فرآیند مهاجرت سیستم فارس‌نیوز کرالر از SQLite به PostgreSQL ارائه می‌دهد. این مهاجرت **بدون تغییر در عملکرد پلتفرم** انجام شده است.

### ویژگی‌های مهاجرت:
- ✅ حفظ کامل عملکرد و API موجود
- ✅ سازگاری کامل با کدهای legacy
- ✅ پشتیبانی همزمان از SQLite و PostgreSQL
- ✅ مهاجرت خودکار داده‌ها
- ✅ تنظیمات production-ready

---

## 📋 پیش‌نیازها

- Node.js v16 یا بالاتر
- npm یا yarn
- PostgreSQL 12 یا بالاتر
- دسترسی به terminal/command prompt

---

## 🐘 نصب PostgreSQL

### Windows (نصب دستی):

1. **دانلود PostgreSQL:**
   ```
   https://www.postgresql.org/download/windows/
   ```

2. **نصب و تنظیم:**
   - رمز عبور برای کاربر `postgres`: `farsnews_secure_password_2024`
   - پورت پیش‌فرض: `5432`

3. **بررسی نصب:**
   ```cmd
   psql --version
   ```

### Linux (Ubuntu/Debian):

```bash
# نصب PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib

# تنظیم رمز عبور
sudo -u postgres psql
ALTER USER postgres PASSWORD 'farsnews_secure_password_2024';
\q
```

### macOS:

```bash
# با Homebrew
brew install postgresql
brew services start postgresql

# تنظیم رمز عبور
psql postgres
ALTER USER postgres PASSWORD 'farsnews_secure_password_2024';
\q
```

---

## 🗄️ راه‌اندازی پایگاه داده

### 1. ایجاد پایگاه داده:

```sql
-- اتصال به PostgreSQL
psql -U postgres -h localhost

-- ایجاد پایگاه داده
CREATE DATABASE farsnews_crawler;

-- اتصال به پایگاه داده جدید
\c farsnews_crawler;

-- اجرای اسکریپت اولیه
\i init-postgres.sql
```

یا به صورت دستوری:

```bash
# ایجاد پایگاه داده
createdb -U postgres farsnews_crawler

# اجرای اسکریپت اولیه
psql -U postgres -d farsnews_crawler -f init-postgres.sql
```

---

## 📦 مهاجرت داده‌ها

### 1. اجرای اسکریپت مهاجرت:

```bash
# مهاجرت داده‌ها از SQLite به PostgreSQL
node migrate-to-postgres.js
```

این اسکریپت:
- داده‌ها را از `crawler.db` و `farsnews.db` می‌خواند
- آن‌ها را به PostgreSQL منتقل می‌کند
- گزارش کاملی از فرآیند مهاجرت ارائه می‌دهد

### 2. بررسی موفقیت مهاجرت:

```sql
-- بررسی تعداد رکوردها
SELECT 'articles' as table_name, count(*) from articles
UNION ALL
SELECT 'news_sources', count(*) from news_sources
UNION ALL
SELECT 'schedules', count(*) from schedules;
```

---

## ⚙️ تنظیمات محیط

### 1. استفاده از فایل `.env.postgres`:

```bash
# کپی کردن فایل تنظیمات
cp .env.postgres .env
```

### 2. یا تنظیم دستی متغیرهای محیط:

```bash
# متغیرهای پایگاه داده
export DB_TYPE=postgres
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=farsnews_crawler
export DB_USER=postgres
export DB_PASSWORD=farsnews_secure_password_2024

# متغیرهای برنامه
export NODE_ENV=production
export PORT=3004
export JWT_SECRET=your-secret-key
```

### 3. تنظیمات PM2 (Production):

```bash
# استفاده از PM2 با تنظیمات PostgreSQL
pm2 start ecosystem.config.js --env production
```

---

## 🚀 اجرای برنامه

### 1. نصب وابستگی‌ها:

```bash
npm install
```

### 2. تست اتصال پایگاه داده:

```bash
# تست سازگاری adapter
node test-db-adapter.js
```

### 3. اجرای برنامه:

```bash
# حالت توسعه
npm start

# یا حالت production
NODE_ENV=production npm start
```

### 4. بررسی عملکرد:

- وب سایت: `http://localhost:3004`
- پنل ادمین: `http://localhost:3004/admin`
- API Docs: `http://localhost:3004/api`

---

## 🐳 استفاده از Docker

### 1. اجرای با Docker Compose:

```bash
# راه‌اندازی PostgreSQL و برنامه
docker-compose -f docker-compose.postgres.yml up -d
```

### 2. بررسی وضعیت:

```bash
# مشاهده logs
docker-compose -f docker-compose.postgres.yml logs -f

# بررسی وضعیت سرویس‌ها
docker-compose -f docker-compose.postgres.yml ps
```

### 3. اجرای مهاجرت در Docker:

```bash
# اجرای اسکریپت مهاجرت داخل container
docker exec -it farsnews-app node migrate-to-postgres.js
```

---

## 🔧 عیب‌یابی

### مشکلات رایج و راه‌حل‌ها:

#### 1. خطای اتصال به PostgreSQL:

```bash
# بررسی وضعیت PostgreSQL
sudo systemctl status postgresql  # Linux
brew services list | grep postgres  # macOS

# راه‌اندازی مجدد
sudo systemctl restart postgresql  # Linux
brew services restart postgresql  # macOS
```

#### 2. خطای احراز هویت:

```sql
-- تنظیم مجدد رمز عبور
sudo -u postgres psql
ALTER USER postgres PASSWORD 'farsnews_secure_password_2024';
```

#### 3. خطای دسترسی به پایگاه داده:

```bash
# بررسی فایل pg_hba.conf
sudo nano /etc/postgresql/*/main/pg_hba.conf

# اضافه کردن خط زیر:
# local   all             all                                     md5
```

#### 4. مشکل در مهاجرت داده‌ها:

```bash
# بررسی فایل‌های SQLite
ls -la *.db

# اجرای مجدد مهاجرت با پاک‌سازی
psql -U postgres -d farsnews_crawler -c "TRUNCATE articles, news_sources, schedules CASCADE;"
node migrate-to-postgres.js
```

### لاگ‌ها و بررسی:

```bash
# مشاهده لاگ‌های برنامه
tail -f logs/app.log

# مشاهده لاگ‌های PostgreSQL
tail -f /var/log/postgresql/postgresql-*.log  # Linux
tail -f /usr/local/var/log/postgres.log       # macOS
```

---

## 🔄 بازگشت به SQLite

در صورت نیاز به بازگشت موقت به SQLite:

### 1. تغییر متغیر محیط:

```bash
# حذف یا تغییر نوع پایگاه داده
unset DB_TYPE
# یا
export DB_TYPE=sqlite
```

### 2. راه‌اندازی مجدد:

```bash
# راه‌اندازی مجدد برنامه
pm2 restart farsnews-crawler
```

---

## 📊 مقایسه عملکرد

### SQLite vs PostgreSQL:

| ویژگی | SQLite | PostgreSQL |
|--------|--------|------------|
| همزمانی | محدود | عالی |
| مقیاس‌پذیری | پایین | بالا |
| پشتیبان‌گیری | ساده | پیشرفته |
| کارایی | خوب برای حجم کم | عالی برای حجم بالا |
| مدیریت | ساده | پیشرفته |

---

## 🛡️ امنیت

### تنظیمات امنیتی PostgreSQL:

1. **تغییر رمز عبور پیش‌فرض:**
   ```sql
   ALTER USER postgres PASSWORD 'your-strong-password';
   ```

2. **محدود کردن دسترسی شبکه:**
   ```bash
   # در فایل postgresql.conf
   listen_addresses = 'localhost'
   ```

3. **تنظیم احراز هویت:**
   ```bash
   # در فایل pg_hba.conf
   local   all             all                                     md5
   host    all             all             127.0.0.1/32            md5
   ```

---

## 📞 پشتیبانی

در صورت بروز مشکل:

1. بررسی این راهنما
2. مطالعه فایل‌های لاگ
3. اجرای تست‌های تشخیصی:
   ```bash
   node test-db-adapter.js
   ```
4. بررسی GitHub Issues

---

## 📝 یادداشت‌های مهم

- ✅ **عملکرد پلتفرم تغییر نکرده است**
- ✅ تمام API‌های موجود سازگار هستند
- ✅ سرعت و کارایی بهبود یافته است
- ✅ امکان مقیاس‌پذیری فراهم شده است
- ✅ پشتیبان‌گیری و بازیابی بهبود یافته است

---

## 🎯 نتیجه‌گیری

مهاجرت به PostgreSQL با موفقیت انجام شده و پلتفرم آماده بهره‌برداری در محیط production است. تمام ویژگی‌ها و عملکردهای قبلی حفظ شده و عملکرد کلی سیستم بهبود یافته است.