#!/bin/bash

# Fars News Crawler Installation Script
# This script installs and configures the Fars News Crawler on Ubuntu with Docker

set -e

echo "🚀 Fars News Crawler Docker Installation Script"
echo "==============================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# بررسی دسترسی root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        print_error "لطفاً این اسکریپت را با کاربر عادی اجرا کنید (نه root)"
        exit 1
    fi
}

# بررسی سیستم عامل
check_os() {
    if [[ ! -f /etc/os-release ]]; then
        print_error "سیستم عامل پشتیبانی نمی‌شود"
        exit 1
    fi
    
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]] && [[ "$ID_LIKE" != *"debian"* ]]; then
        print_error "این اسکریپت فقط برای Ubuntu و سیستم‌های مبتنی بر Debian طراحی شده است"
        exit 1
    fi
    
    print_success "سیستم عامل: $PRETTY_NAME"
}

# بررسی منابع سیستم
check_resources() {
    print_status "بررسی منابع سیستم..."
    
    # بررسی RAM
    total_ram=$(free -m | awk 'NR==2{printf "%.0f", $2}')
    if [[ $total_ram -lt 1800 ]]; then
        print_warning "RAM کم است: ${total_ram}MB (حداقل توصیه شده: 2GB)"
    else
        print_success "RAM: ${total_ram}MB"
    fi
    
    # بررسی فضای دیسک
    available_space=$(df / | awk 'NR==2 {print $4}')
    available_space_gb=$((available_space / 1024 / 1024))
    if [[ $available_space_gb -lt 8 ]]; then
        print_warning "فضای دیسک کم است: ${available_space_gb}GB (حداقل توصیه شده: 10GB)"
    else
        print_success "فضای دیسک: ${available_space_gb}GB"
    fi
}

# نصب Docker
install_docker() {
    if command -v docker &> /dev/null; then
        print_success "Docker از قبل نصب است"
        return
    fi
    
    print_status "نصب Docker..."
    
    # به‌روزرسانی سیستم
    sudo apt update
    
    # نصب پیش‌نیازها
    sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # افزودن کلید GPG Docker
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # افزودن مخزن Docker
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # نصب Docker
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # افزودن کاربر به گروه docker
    sudo usermod -aG docker $USER
    
    # راه‌اندازی Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    
    print_success "Docker با موفقیت نصب شد"
}

# نصب Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        print_success "Docker Compose از قبل نصب است"
        return
    fi
    
    print_status "نصب Docker Compose..."
    
    # دریافت آخرین نسخه
    DOCKER_COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
    
    # دانلود و نصب
    sudo curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    print_success "Docker Compose با موفقیت نصب شد"
}

# تنظیم دایرکتوری پروژه
setup_project_directory() {
    PROJECT_DIR="/opt/farsnews-crawler"
    
    print_status "تنظیم دایرکتوری پروژه..."
    
    # ایجاد دایرکتوری
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    
    # کپی فایل‌های پروژه
    if [[ -f "docker-compose.yml" ]]; then
        cp -r . $PROJECT_DIR/
        print_success "فایل‌های پروژه کپی شدند"
    else
        print_error "فایل‌های پروژه یافت نشدند. لطفاً اسکریپت را در دایرکتوری پروژه اجرا کنید."
        exit 1
    fi
    
    # ایجاد دایرکتوری‌های مورد نیاز
    mkdir -p $PROJECT_DIR/data $PROJECT_DIR/logs
    chmod 755 $PROJECT_DIR/data $PROJECT_DIR/logs
    
    cd $PROJECT_DIR
}

# ساخت و راه‌اندازی کانتینر
start_application() {
    print_status "ساخت و راه‌اندازی کانتینر..."
    
    # ساخت ایمیج
    docker-compose build
    
    # راه‌اندازی سرویس
    docker-compose up -d
    
    # انتظار برای راه‌اندازی
    print_status "انتظار برای راه‌اندازی سرویس..."
    sleep 30
    
    # بررسی وضعیت
    if docker-compose ps | grep -q "Up"; then
        print_success "سرویس با موفقیت راه‌اندازی شد"
    else
        print_error "خطا در راه‌اندازی سرویس"
        docker-compose logs
        exit 1
    fi
}

# تنظیم فایروال
setup_firewall() {
    if command -v ufw &> /dev/null; then
        print_status "تنظیم فایروال..."
        sudo ufw allow 3004
        print_success "پورت 3004 در فایروال باز شد"
    fi
}

# نمایش اطلاعات نهایی
show_final_info() {
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo
    echo "==========================================="
    print_success "نصب با موفقیت تکمیل شد!"
    echo "==========================================="
    echo
    echo "🌐 آدرس دسترسی به سایت:"
    echo "   http://$SERVER_IP:3004"
    echo
    echo "⚙️  آدرس پنل ادمین:"
    echo "   http://$SERVER_IP:3004/admin"
    echo
    echo "🔑 اطلاعات ورود پیش‌فرض:"
    echo "   نام کاربری: admin"
    echo "   رمز عبور: admin123"
    echo
    echo "📋 دستورات مفید:"
    echo "   مشاهده وضعیت: docker-compose ps"
    echo "   مشاهده لاگ‌ها: docker-compose logs -f"
    echo "   توقف سرویس: docker-compose stop"
    echo "   راه‌اندازی مجدد: docker-compose restart"
    echo
    echo "⚠️  هشدار امنیتی:"
    echo "   حتماً پس از اولین ورود، رمز عبور را تغییر دهید!"
    echo
    echo "📖 برای اطلاعات بیشتر README-Docker.md را مطالعه کنید"
    echo "==========================================="
}

# تابع اصلی
main() {
    echo "==========================================="
    echo "🚀 FarsNews Crawler - نصب خودکار"
    echo "==========================================="
    echo
    
    check_root
    check_os
    check_resources
    
    echo
    read -p "آیا می‌خواهید ادامه دهید؟ (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_warning "نصب لغو شد"
        exit 0
    fi
    
    install_docker
    install_docker_compose
    setup_project_directory
    start_application
    setup_firewall
    
    show_final_info
    
    print_warning "لطفاً سیستم را restart کنید یا از سیستم خارج شده و مجدداً وارد شوید تا تغییرات گروه docker اعمال شود."
}

# اجرای تابع اصلی
main "$@"