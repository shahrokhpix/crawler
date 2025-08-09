# Docker Installation Guide for Fars News Crawler

This guide will help you install and run the Fars News Crawler using Docker on Ubuntu server.

## Prerequisites

- Ubuntu 20.04 LTS or newer
- At least 2GB RAM
- At least 2 CPU cores
- At least 10GB free disk space
- Internet connection

## Quick Installation

### Option 1: One-Command Installation

```bash
curl -fsSL https://raw.githubusercontent.com/shahrokhpix/crawler/main/quick-start.sh | bash
```

### Option 2: Manual Installation

#### Step 1: Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install prerequisites
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# Add Docker's official GPG key
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Add Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Logout and login again, or run:
newgrp docker
```

#### Step 2: Clone Repository

```bash
git clone https://github.com/shahrokhpix/crawler.git
cd crawler
```

#### Step 3: Setup Environment

```bash
# Copy environment file
cp .env.docker .env

# Edit environment variables (optional)
nano .env
```

#### Step 4: Start Application

```bash
# Using simple compose file
docker compose -f docker-compose.simple.yml up -d

# Or using full production setup
docker compose -f docker-compose.production.yml up -d
```

## Configuration

### Environment Variables

Key environment variables you may want to modify in `.env`:

```bash
# Database password (change in production)
DB_PASSWORD=your_secure_password

# JWT secret (change in production)
JWT_SECRET=your_jwt_secret_key

# Admin password (change in production)
ADMIN_PASSWORD=your_admin_password

# Application settings
WORKERS=2
MAX_MEMORY=512M
```

### Firewall Configuration

```bash
# Allow HTTP traffic
sudo ufw allow 3004/tcp

# Enable firewall if not already enabled
sudo ufw enable
```

## Usage

### Access the Application

- **Admin Panel**: http://your-server-ip:3004/admin
- **API**: http://your-server-ip:3004/api
- **Default Credentials**: admin / admin123 (change in production)

### Common Commands

```bash
# View logs
docker compose logs -f

# Stop application
docker compose down

# Restart application
docker compose restart

# Update application
git pull
docker compose up -d --build

# View container status
docker compose ps

# Access container shell
docker compose exec app bash
```

### Backup and Restore

#### Backup Database

```bash
# Create backup
docker compose exec postgres pg_dump -U farsnews_user farsnews_crawler > backup.sql

# Or with timestamp
docker compose exec postgres pg_dump -U farsnews_user farsnews_crawler > backup_$(date +%Y%m%d_%H%M%S).sql
```

#### Restore Database

```bash
# Restore from backup
docker compose exec -T postgres psql -U farsnews_user farsnews_crawler < backup.sql
```

## Monitoring

### Health Check

```bash
# Check application health
curl http://localhost:3004/

# Check container health
docker compose ps
```

### Log Management

```bash
# View application logs
docker compose logs app

# View database logs
docker compose logs postgres

# Follow logs in real-time
docker compose logs -f
```

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   sudo netstat -tulpn | grep :3004
   sudo kill -9 <PID>
   ```

2. **Permission denied**:
   ```bash
   sudo chown -R $USER:$USER .
   ```

3. **Database connection issues**:
   ```bash
   docker compose logs postgres
   docker compose restart postgres
   ```

4. **Memory issues**:
   ```bash
   # Reduce workers in .env
   WORKERS=1
   MAX_MEMORY=256M
   ```

### Reset Everything

```bash
# Stop and remove all containers, networks, and volumes
docker compose down -v

# Remove all images
docker system prune -a

# Start fresh
docker compose up -d --build
```

## Security Recommendations

1. **Change default passwords** in `.env` file
2. **Use HTTPS** with a reverse proxy (nginx/apache)
3. **Restrict access** using firewall rules
4. **Regular backups** of database and logs
5. **Keep Docker updated**:
   ```bash
   sudo apt update && sudo apt upgrade docker-ce docker-ce-cli containerd.io
   ```

## Production Deployment

For production deployment, use `docker-compose.production.yml` which includes:

- Load balancer with multiple app instances
- Redis for caching
- Prometheus and Grafana for monitoring
- Proper resource limits
- Health checks

```bash
docker compose -f docker-compose.production.yml up -d
```

## Support

If you encounter any issues:

1. Check the logs: `docker compose logs`
2. Verify system requirements
3. Check firewall settings
4. Ensure Docker is running: `sudo systemctl status docker`

For more help, please check the main README.md file or create an issue on GitHub.