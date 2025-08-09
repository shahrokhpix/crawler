# Fars News Crawler 🕷️

A powerful, production-ready web crawler for Fars News website built with Node.js, Puppeteer, and PostgreSQL. Now with full Docker support for easy deployment on Ubuntu servers.

[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

سیستم خبرخوان خودکار فارس نیوز با قابلیت کرال چندمنبعه و مدیریت هوشمند محتوا

## 🚀 Quick Start (Docker)

### One-Command Installation

```bash
curl -fsSL https://raw.githubusercontent.com/shahrokhpix/crawler/main/quick-start.sh | bash
```

### Manual Docker Installation

```bash
# Clone repository
git clone https://github.com/shahrokhpix/crawler.git
cd crawler

# Copy environment file
cp .env.docker .env

# Start with Docker Compose
docker compose -f docker-compose.simple.yml up -d

# Access admin panel
open http://localhost:3004/admin
```

**Default credentials**: admin / admin123 (change in production)

## ویژگی‌های کلیدی

- 🚀 **کرال چندمنبعه**: پشتیبانی از منابع خبری متعدد
- 🔄 **زمان‌بندی خودکار**: کرال دوره‌ای با cron jobs
- 🎯 **تشخیص تکراری**: جلوگیری از ذخیره مقالات تکراری
- 📊 **پنل مدیریت**: رابط کاربری وب برای مدیریت
- 🐳 **Docker Ready**: نصب آسان با Docker
- 📈 **مانیتورینگ**: نظارت بر عملکرد سیستم
- 🔒 **امنیت**: احراز هویت و کنترل دسترسی
- 📊 **Production Monitoring**: Prometheus and Grafana integration
- 🔄 **Load Balancing**: Multiple app instances with Nginx

## نصب سریع با Docker

### پیش‌نیازها

- Docker Engine 20.10+
- Docker Compose 2.0+
- حداقل 2GB RAM
- حداقل 5GB فضای ذخیره‌سازی

### نصب Docker روی Ubuntu

```bash
# به‌روزرسانی سیستم
sudo apt update && sudo apt upgrade -y

# نصب Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# افزودن کاربر به گروه docker
sudo usermod -aG docker $USER

# نصب Docker Compose
sudo apt install docker-compose-plugin -y

# راه‌اندازی Docker
sudo systemctl enable docker
sudo systemctl start docker
```

### راه‌اندازی پروژه

```bash
# کلون پروژه
git clone https://github.com/shahrokhpix/crawler.git
cd crawler

# کپی فایل تنظیمات
cp .env.example .env

# ویرایش تنظیمات (اختیاری)
nano .env

# راه‌اندازی با Docker Compose
docker compose up -d

# مشاهده لاگ‌ها
docker compose logs -f
```

### دسترسی به پنل مدیریت

پس از راه‌اندازی موفق:

- **پنل مدیریت**: http://localhost:3004/admin
- **API**: http://localhost:3004/api
- **نام کاربری**: admin
- **رمز عبور**: admin123 (قابل تغییر در .env)

## پیش‌نیازها (نصب دستی)

- Node.js 20 یا بالاتر
- npm یا yarn
- Chromium Browser
- SQLite3

## نصب روی سرور

1. کلون کردن مخزن:
```bash
git clone [repository-url]
cd farsnews
```

2. اجرای اسکریپت نصب:
```bash
chmod +x install-server.sh
./install-server.sh
```

3. ویرایش فایل `.env`:
```bash
nano .env
```
تنظیمات مورد نیاز را وارد کنید.

## مدیریت برنامه

- مشاهده وضعیت:
```bash
pm2 status
```

- مشاهده لاگ‌ها:
```bash
pm2 logs farsnews-crawler
```

- راه‌اندازی مجدد:
```bash
pm2 restart farsnews-crawler
```

- توقف:
```bash
pm2 stop farsnews-crawler
```

## دسترسی به پنل ادمین

پنل ادمین در آدرس زیر در دسترس است:
```
http://[server-ip]:3004/admin
```

نام کاربری و رمز عبور پیش‌فرض:
- نام کاربری: admin
- رمز عبور: admin123

⚠️ حتماً بعد از نصب، رمز عبور پیش‌فرض را تغییر دهید.

## ساختار دایرکتوری‌ها

- `data/`: دیتابیس و فایل‌های ذخیره شده
- `logs/`: لاگ‌های برنامه
- `config/`: فایل‌های پیکربندی
- `public/`: فایل‌های استاتیک و پنل ادمین

## پشتیبان‌گیری

برای پشتیبان‌گیری از دیتابیس:
```bash
cp data/crawler.db data/crawler.db.backup
```

## مشکلات رایج

1. خطای دسترسی به Chromium:
```bash
sudo chmod -R 755 /usr/bin/chromium-browser
```

2. خطای پورت:
پورت 3004 باید در دسترس باشد. می‌توانید پورت را در فایل `.env` تغییر دهید.

## امنیت

- حتماً رمز عبور پیش‌فرض را تغییر دهید
- از فایروال استفاده کنید
- دسترسی‌های فایل را محدود کنید
- از HTTPS استفاده کنید

## پشتیبانی

برای گزارش مشکلات یا درخواست قابلیت‌های جدید، لطفاً Issue ایجاد کنید.