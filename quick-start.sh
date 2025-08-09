#!/bin/bash

# Fars News Crawler - Quick Start Script
# This script quickly sets up and runs the crawler with Docker

set -e

echo "🚀 Fars News Crawler - Quick Start"
echo "=================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    echo "Run: curl -fsSL https://get.docker.com | sh"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    print_error "Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Use docker compose or docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

print_status "Using: $DOCKER_COMPOSE"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    print_status "Creating .env file from template..."
    if [ -f ".env.docker" ]; then
        cp .env.docker .env
    elif [ -f ".env.example" ]; then
        cp .env.example .env
    else
        print_error ".env template not found"
        exit 1
    fi
    
    # Generate secure passwords
    DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
    JWT_SECRET=$(openssl rand -base64 64 | tr -d "=+/" | cut -c1-50)
    ADMIN_PASSWORD=$(openssl rand -base64 16 | tr -d "=+/" | cut -c1-12)
    
    # Update passwords in .env
    sed -i "s/farsnews123/$DB_PASSWORD/g" .env
    sed -i "s/your_jwt_secret_key_here_change_this_in_production/$JWT_SECRET/g" .env
    sed -i "s/admin123/$ADMIN_PASSWORD/g" .env
    
    print_status "Generated secure passwords"
    print_warning "Admin password: $ADMIN_PASSWORD"
    echo "$ADMIN_PASSWORD" > .admin_password
    print_warning "Admin password saved to .admin_password file"
fi

# Create necessary directories
print_status "Creating directories..."
mkdir -p logs data

# Stop any existing containers
print_status "Stopping existing containers..."
$DOCKER_COMPOSE down 2>/dev/null || true

# Build and start containers
print_status "Building and starting containers..."
$DOCKER_COMPOSE up -d --build

# Wait for services to be ready
print_status "Waiting for services to start..."
sleep 30

# Check if application is running
print_status "Checking application status..."
for i in {1..30}; do
    if curl -f http://localhost:3004/ >/dev/null 2>&1; then
        print_status "✅ Application is running!"
        break
    fi
    if [ $i -eq 30 ]; then
        print_warning "⚠️ Application may still be starting up"
    fi
    sleep 2
done

# Show container status
print_status "Container status:"
$DOCKER_COMPOSE ps

# Get admin password
if [ -f ".admin_password" ]; then
    ADMIN_PASSWORD=$(cat .admin_password)
else
    ADMIN_PASSWORD=$(grep "ADMIN_PASSWORD=" .env | cut -d '=' -f2)
fi

echo ""
echo "🎉 Fars News Crawler is now running!"
echo ""
echo "📋 Access Information:"
echo "   • Admin Panel: http://localhost:3004/admin"
echo "   • API: http://localhost:3004/api"
echo "   • Username: admin"
echo "   • Password: $ADMIN_PASSWORD"
echo ""
echo "📝 Useful Commands:"
echo "   • View logs: $DOCKER_COMPOSE logs -f"
echo "   • Stop: $DOCKER_COMPOSE down"
echo "   • Restart: $DOCKER_COMPOSE restart"
echo "   • Update: git pull && $DOCKER_COMPOSE up -d --build"
echo ""
print_status "Quick start completed successfully!"