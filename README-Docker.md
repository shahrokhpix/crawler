# راهنمای نصب و راه‌اندازی با Docker

## پیش‌نیازهای سرور

### مشخصات سرور توصیه شده:
- **سیستم عامل**: Ubuntu 20.04 LTS یا بالاتر
- **RAM**: حداقل 2GB، توصیه شده 4GB
- **CPU**: حداقل 2 هسته
- **فضای ذخیره‌سازی**: حداقل 10GB فضای خالی
- **شبکه**: دسترسی به اینترنت برای دانلود وابستگی‌ها

### نرم‌افزارهای مورد نیاز:
- Docker Engine
- Docker Compose
- Git (اختیاری)

## نصب Docker روی Ubuntu

### 1. به‌روزرسانی سیستم
```bash
sudo apt update
sudo apt upgrade -y
```

### 2. نصب Docker
```bash
# حذف نسخه‌های قدیمی Docker
sudo apt remove docker docker-engine docker.io containerd runc

# نصب پیش‌نیازها
sudo apt install apt-transport-https ca-certificates curl gnupg lsb-release -y

# افزودن کلید GPG رسمی Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# افزودن مخزن Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# نصب Docker Engine
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y

# افزودن کاربر به گروه docker
sudo usermod -aG docker $USER

# راه‌اندازی Docker
sudo systemctl enable docker
sudo systemctl start docker
```

### 3. نصب Docker Compose (در صورت عدم نصب)
```bash
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 4. تأیید نصب
```bash
docker --version
docker-compose --version
```

## راه‌اندازی پروژه

### 1. کپی فایل‌های پروژه
```bash
# ایجاد دایرکتوری پروژه
mkdir -p /opt/farsnews-crawler
cd /opt/farsnews-crawler

# کپی فایل‌های پروژه (از طریق scp، rsync یا git)
# مثال با scp:
# scp -r /path/to/project/* user@server:/opt/farsnews-crawler/
```

### 2. ایجاد دایرکتوری‌های مورد نیاز
```bash
mkdir -p data logs
chmod 755 data logs
```

### 3. ساخت و راه‌اندازی کانتینر
```bash
# ساخت ایمیج
docker-compose build

# راه‌اندازی سرویس
docker-compose up -d
```

### 4. بررسی وضعیت
```bash
# بررسی وضعیت کانتینرها
docker-compose ps

# مشاهده لاگ‌ها
docker-compose logs -f

# بررسی سلامت سرویس
curl http://localhost:3004
```

## دسترسی به پنل ادمین

پس از راه‌اندازی موفقیت‌آمیز، می‌توانید از طریق آدرس زیر به پنل ادمین دسترسی پیدا کنید:

```
http://YOUR_SERVER_IP:3004/admin
```

**اطلاعات ورود پیش‌فرض:**
- نام کاربری: `admin`
- رمز عبور: `admin123`

⚠️ **هشدار امنیتی**: حتماً پس از اولین ورود، رمز عبور را تغییر دهید.

## دستورات مفید

### مدیریت کانتینر
```bash
# توقف سرویس
docker-compose stop

# راه‌اندازی مجدد
docker-compose restart

# حذف کانتینرها
docker-compose down

# حذف کانتینرها و volumes
docker-compose down -v

# به‌روزرسانی ایمیج
docker-compose pull
docker-compose up -d
```

### مشاهده لاگ‌ها
```bash
# مشاهده لاگ‌های زنده
docker-compose logs -f

# مشاهده لاگ‌های 100 خط آخر
docker-compose logs --tail=100

# مشاهده لاگ‌های یک سرویس خاص
docker-compose logs farsnews-crawler
```

### دسترسی به کانتینر
```bash
# ورود به کانتینر
docker-compose exec farsnews-crawler bash

# اجرای دستور در کانتینر
docker-compose exec farsnews-crawler npm --version
```

## تنظیمات فایروال

اگر از UFW استفاده می‌کنید:

```bash
# اجازه دسترسی به پورت 3004
sudo ufw allow 3004

# بررسی وضعیت فایروال
sudo ufw status
```

## پشتیبان‌گیری

### پشتیبان‌گیری از پایگاه داده
```bash
# کپی فایل پایگاه داده
cp data/database.sqlite data/database_backup_$(date +%Y%m%d_%H%M%S).sqlite
```

### پشتیبان‌گیری کامل
```bash
# ایجاد آرشیو از کل دایرکتوری
tar -czf farsnews_backup_$(date +%Y%m%d_%H%M%S).tar.gz /opt/farsnews-crawler/
```

## عیب‌یابی

### مشکلات رایج

1. **کانتینر راه‌اندازی نمی‌شود:**
   ```bash
   docker-compose logs
   ```

2. **مشکل دسترسی به پورت:**
   ```bash
   sudo netstat -tlnp | grep 3004
   ```

3. **مشکل حافظه:**
   ```bash
   docker stats
   free -h
   ```

4. **مشکل دیسک:**
   ```bash
   df -h
   docker system df
   ```

### پاک‌سازی فضای Docker
```bash
# حذف ایمیج‌های استفاده نشده
docker image prune -a

# حذف volumes استفاده نشده
docker volume prune

# پاک‌سازی کامل سیستم
docker system prune -a
```

## به‌روزرسانی

```bash
# توقف سرویس
docker-compose down

# دریافت آخرین تغییرات (اگر از git استفاده می‌کنید)
git pull

# ساخت مجدد ایمیج
docker-compose build --no-cache

# راه‌اندازی مجدد
docker-compose up -d
```

## نظارت و مانیتورینگ

### بررسی منابع سیستم
```bash
# استفاده CPU و RAM
top
htop

# استفاده دیسک
df -h
du -sh /opt/farsnews-crawler/

# آمار Docker
docker stats farsnews-crawler
```

### تنظیم Cron برای نظارت
```bash
# افزودن به crontab
crontab -e

# بررسی سلامت هر 5 دقیقه
*/5 * * * * curl -f http://localhost:3004/ > /dev/null 2>&1 || docker-compose -f /opt/farsnews-crawler/docker-compose.yml restart
```

## امنیت

### تنظیمات امنیتی توصیه شده:

1. **تغییر رمز عبور پیش‌فرض**
2. **استفاده از HTTPS** (با Nginx یا Traefik)
3. **محدودیت دسترسی IP** (در صورت نیاز)
4. **به‌روزرسانی منظم سیستم**
5. **نظارت بر لاگ‌ها**

### مثال تنظیم Nginx به عنوان Reverse Proxy:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3004;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## پشتیبانی

در صورت بروز مشکل، لطفاً موارد زیر را بررسی کنید:

1. لاگ‌های کانتینر: `docker-compose logs`
2. وضعیت سیستم: `docker stats`
3. فضای دیسک: `df -h`
4. وضعیت شبکه: `netstat -tlnp`

برای گزارش باگ یا درخواست ویژگی جدید، لطفاً issue جدیدی در مخزن پروژه ایجاد کنید.