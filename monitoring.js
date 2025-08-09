const os = require('os');
const cluster = require('cluster');
const Logger = require('./utils/logger');

class SystemMonitor {
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      requests: 0,
      errors: 0,
      crawls: 0,
      lastHealthCheck: Date.now()
    };
    
    this.thresholds = {
      memoryUsage: 0.85, // 85% حافظه
      cpuUsage: 0.80,    // 80% CPU
      responseTime: 5000  // 5 ثانیه
    };
    
    this.startMonitoring();
  }
  
  startMonitoring() {
    // بررسی سلامت سیستم هر 30 ثانیه
    setInterval(() => {
      this.performHealthCheck();
    }, 30000);
    
    // گزارش آمار هر 5 دقیقه
    setInterval(() => {
      this.reportMetrics();
    }, 300000);
  }
  
  async performHealthCheck() {
    try {
      const health = await this.getSystemHealth();
      this.metrics.lastHealthCheck = Date.now();
      
      // بررسی آستانه‌های خطر
      if (health.memory.usage > this.thresholds.memoryUsage) {
        Logger.warn(`⚠️ High memory usage: ${(health.memory.usage * 100).toFixed(1)}%`);
      }
      
      if (health.cpu.usage > this.thresholds.cpuUsage) {
        Logger.warn(`⚠️ High CPU usage: ${(health.cpu.usage * 100).toFixed(1)}%`);
      }
      
      // ذخیره آمار سلامت
      this.saveHealthMetrics(health);
      
    } catch (error) {
      Logger.error('خطا در بررسی سلامت سیستم:', error);
    }
  }
  
  async getSystemHealth() {
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // محاسبه CPU usage
    const cpuUsage = await this.getCPUUsage();
    
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        usage: usedMem / totalMem,
        heap: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          usage: memUsage.heapUsed / memUsage.heapTotal
        }
      },
      cpu: {
        usage: cpuUsage,
        cores: os.cpus().length,
        loadAvg: os.loadavg()
      },
      workers: cluster.isMaster ? Object.keys(cluster.workers).length : 1,
      requests: this.metrics.requests,
      errors: this.metrics.errors,
      crawls: this.metrics.crawls
    };
  }
  
  getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = Date.now();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = Date.now();
        
        const totalTime = (endTime - startTime) * 1000; // میکروثانیه
        const totalUsage = endUsage.user + endUsage.system;
        const usage = totalUsage / totalTime;
        
        resolve(Math.min(usage, 1)); // حداکثر 100%
      }, 100);
    });
  }
  
  saveHealthMetrics(health) {
    // ذخیره در فایل لاگ یا دیتابیس
    const logData = {
      timestamp: health.timestamp,
      memory_usage: (health.memory.usage * 100).toFixed(1),
      cpu_usage: (health.cpu.usage * 100).toFixed(1),
      workers: health.workers,
      requests: health.requests,
      errors: health.errors,
      uptime: Math.floor(health.uptime)
    };
    
    Logger.info('📊 System Health:', logData);
  }
  
  reportMetrics() {
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    
    Logger.info(`📈 System Metrics Report:`);
    Logger.info(`   Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
    Logger.info(`   Total Requests: ${this.metrics.requests}`);
    Logger.info(`   Total Errors: ${this.metrics.errors}`);
    Logger.info(`   Total Crawls: ${this.metrics.crawls}`);
    Logger.info(`   Error Rate: ${((this.metrics.errors / Math.max(this.metrics.requests, 1)) * 100).toFixed(2)}%`);
    
    if (cluster.isMaster) {
      Logger.info(`   Active Workers: ${Object.keys(cluster.workers).length}`);
    }
  }
  
  // متدهای شمارش
  incrementRequests() {
    this.metrics.requests++;
  }
  
  incrementErrors() {
    this.metrics.errors++;
  }
  
  incrementCrawls() {
    this.metrics.crawls++;
  }
  
  // Health check endpoint
  getHealthStatus() {
    const now = Date.now();
    const timeSinceLastCheck = now - this.metrics.lastHealthCheck;
    
    return {
      status: timeSinceLastCheck < 60000 ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      pid: process.pid,
      version: process.version,
      metrics: this.metrics
    };
  }
}

// Singleton instance
const monitor = new SystemMonitor();

// Express middleware برای شمارش درخواست‌ها
const requestCounter = (req, res, next) => {
  monitor.incrementRequests();
  
  // شمارش خطاها
  const originalSend = res.send;
  res.send = function(data) {
    if (res.statusCode >= 400) {
      monitor.incrementErrors();
    }
    return originalSend.call(this, data);
  };
  
  next();
};

// Health check route
const healthCheckRoute = (req, res) => {
  const health = monitor.getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
};

module.exports = {
  SystemMonitor,
  monitor,
  requestCounter,
  healthCheckRoute
};