# FarsNews Load Balancer Setup

## Overview
This project now includes a comprehensive load balancing solution with monitoring, caching, and production-ready deployment options.

## Architecture

### Load Balancer Components
1. **Node.js Cluster Manager** (`load-balancer.js`)
2. **Nginx Reverse Proxy** (for production)
3. **Redis Cache** (for session management)
4. **PostgreSQL Database** (for production data)
5. **Monitoring Stack** (Prometheus + Grafana)

### Performance Optimizations
- **Compression**: Gzip compression for all responses
- **Rate Limiting**: API endpoint protection
- **Security Headers**: Helmet.js security middleware
- **Static File Caching**: Optimized static asset delivery
- **Memory Management**: Automatic worker restart on high memory usage
- **Health Checks**: Comprehensive monitoring endpoints

## Quick Start

### Development Mode
```bash
# Start with load balancer (2 workers)
npm run dev:cluster

# Start single instance (development)
npm run dev

# Start production cluster (4 workers)
npm run start:cluster
```

### Production Deployment

#### Option 1: Docker Compose (Recommended)
```bash
# Build and start all services
docker-compose -f docker-compose.production.yml up -d

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Scale application instances
docker-compose -f docker-compose.production.yml up -d --scale app1=2 --scale app2=2
```

#### Option 2: Manual Setup
```bash
# Install dependencies
npm install

# Set environment
export NODE_ENV=production

# Start with load balancer
npm run start:production
```

## Configuration

### Environment Variables
Create `.env.production` file:
```env
NODE_ENV=production
WORKERS=4
MAX_MEMORY=512M
DB_HOST=localhost
DB_PORT=5432
DB_NAME=farsnews_prod
DB_USER=farsnews_user
DB_PASSWORD=secure_password
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_jwt_secret_here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=secure_admin_password
```

### Load Balancer Settings
- **Workers**: Number of Node.js processes (default: CPU cores)
- **Max Memory**: Memory limit per worker (default: 512MB)
- **Restart Limit**: Max restarts per hour (default: 5)
- **Health Check Interval**: Worker health monitoring (default: 30s)

## Monitoring

### Health Endpoints
- `GET /health` - Application health status
- `GET /api/health` - Detailed health metrics
- `GET /nginx_status` - Nginx status (port 8080)

### Metrics Dashboard
- **Grafana**: http://localhost:3000 (admin/admin123)
- **Prometheus**: http://localhost:9090

### Key Metrics
- Request rate and response times
- Memory and CPU usage
- Crawler performance
- Database connection status
- Error rates and alerts

## Load Balancing Strategies

### Nginx Configuration
- **Algorithm**: Least connections
- **Health Checks**: Automatic failover
- **Rate Limiting**: Per-endpoint limits
- **SSL Termination**: HTTPS support

### Node.js Cluster
- **Round Robin**: Default load distribution
- **Sticky Sessions**: Redis-based session storage
- **Graceful Shutdown**: Zero-downtime deployments
- **Auto Restart**: Failed worker recovery

## Performance Tuning

### Database Optimization
```sql
-- Enable connection pooling
SET max_connections = 200;
SET shared_buffers = '256MB';
SET effective_cache_size = '1GB';
```

### Redis Configuration
```redis
# Memory optimization
maxmemory 256mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000
```

### Nginx Tuning
```nginx
# Worker processes
worker_processes auto;
worker_connections 1024;

# Keepalive
keepalive_timeout 65;
keepalive_requests 100;
```

## Security Features

### Rate Limiting
- **General**: 100 requests/15 minutes
- **API**: 30 requests/minute
- **Crawler**: 10 requests/5 minutes

### Security Headers
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

### Authentication
- JWT-based API authentication
- Admin panel protection
- Session management with Redis

## Scaling Guidelines

### Horizontal Scaling
1. Add more application instances
2. Configure load balancer upstream
3. Monitor resource usage
4. Adjust database connections

### Vertical Scaling
1. Increase worker memory limits
2. Add more CPU cores
3. Optimize database queries
4. Tune cache settings

## Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check worker memory
ps aux | grep node

# Monitor in real-time
top -p $(pgrep -d',' node)
```

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# View connection count
psql -c "SELECT count(*) FROM pg_stat_activity;"
```

#### Load Balancer Problems
```bash
# Check Nginx status
sudo nginx -t
sudo systemctl status nginx

# View access logs
tail -f /var/log/nginx/access.log
```

### Performance Debugging

#### Enable Debug Logging
```env
DEBUG=farsnews:*
LOG_LEVEL=debug
```

#### Monitor Metrics
```bash
# CPU usage
top -p $(pgrep -d',' node)

# Memory usage
free -h

# Network connections
netstat -tulpn | grep :3004
```

## Deployment Checklist

### Pre-deployment
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates installed
- [ ] Monitoring setup verified
- [ ] Backup strategy implemented

### Post-deployment
- [ ] Health checks passing
- [ ] Load balancer distributing traffic
- [ ] Monitoring alerts configured
- [ ] Performance metrics baseline
- [ ] Error tracking enabled

## Support

For issues and questions:
1. Check application logs: `docker-compose logs -f`
2. Monitor health endpoints: `/health`
3. Review Grafana dashboards
4. Check Prometheus alerts

## Version History

### v2.0.0 - Load Balancer Release
- Added Node.js cluster support
- Implemented Nginx load balancing
- Added Redis caching
- PostgreSQL production database
- Comprehensive monitoring
- Docker production deployment
- Security enhancements
- Performance optimizations