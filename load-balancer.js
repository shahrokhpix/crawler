const cluster = require('cluster');
const os = require('os');
const path = require('path');
const Logger = require('./utils/logger');

// تعداد CPU cores
const numCPUs = os.cpus().length;

// تنظیمات load balancer
const config = {
  workers: process.env.WORKERS || Math.min(numCPUs, 4), // حداکثر 4 worker
  maxMemory: process.env.MAX_MEMORY || '512M',
  restartDelay: 5000, // 5 ثانیه تاخیر برای restart
  maxRestarts: 5 // حداکثر تعداد restart در ساعت
};

if (cluster.isMaster) {
  console.log(`🚀 Master process ${process.pid} is running`);
  console.log(`🔧 Starting ${config.workers} workers...`);
  
  const workerRestarts = new Map();
  
  // ایجاد worker processes
  for (let i = 0; i < config.workers; i++) {
    createWorker(i);
  }
  
  // مدیریت worker processes
  cluster.on('exit', (worker, code, signal) => {
    const workerId = worker.id;
    console.log(`⚠️ Worker ${workerId} died (${signal || code}). Restarting...`);
    
    // بررسی تعداد restart ها
    const now = Date.now();
    const restarts = workerRestarts.get(workerId) || [];
    const recentRestarts = restarts.filter(time => now - time < 3600000); // آخرین ساعت
    
    if (recentRestarts.length < config.maxRestarts) {
      setTimeout(() => {
        createWorker(workerId);
        recentRestarts.push(now);
        workerRestarts.set(workerId, recentRestarts);
      }, config.restartDelay);
    } else {
      console.error(`❌ Worker ${workerId} restarted too many times. Stopping.`);
      process.exit(1);
    }
  });
  
  // مدیریت سیگنال‌های سیستم
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  
  function createWorker(id) {
    const worker = cluster.fork({ WORKER_ID: id });
    
    // تنظیم محدودیت حافظه
    if (worker.process && worker.process.stdout) {
      worker.process.stdout.on('data', (data) => {
        if (data.toString().includes('FATAL ERROR: Ineffective mark-compacts')) {
          console.log(`💾 Worker ${id} memory issue detected. Restarting...`);
          worker.kill();
        }
      });
    }
    
    console.log(`✅ Worker ${id} started with PID ${worker.process.pid}`);
    return worker;
  }
  
  function gracefulShutdown() {
    console.log('🛑 Received shutdown signal. Gracefully shutting down...');
    
    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }
    
    setTimeout(() => {
      console.log('🔴 Force shutdown');
      process.exit(0);
    }, 10000); // 10 ثانیه برای graceful shutdown
  }
  
  // نمایش آمار workers
  setInterval(() => {
    const workers = Object.keys(cluster.workers).length;
    console.log(`📊 Active workers: ${workers}/${config.workers}`);
  }, 30000); // هر 30 ثانیه
  
} else {
  // Worker process
  const workerId = process.env.WORKER_ID || cluster.worker.id;
  console.log(`🔧 Worker ${workerId} starting...`);
  
  // تنظیم محدودیت حافظه برای worker
  if (config.maxMemory) {
    const maxMemoryBytes = parseMemory(config.maxMemory);
    
    setInterval(() => {
      const usage = process.memoryUsage();
      if (usage.heapUsed > maxMemoryBytes) {
        console.log(`⚠️ Worker ${workerId} memory limit exceeded. Restarting...`);
        process.exit(1);
      }
    }, 10000); // بررسی هر 10 ثانیه
  }
  
  // راه‌اندازی سرور اصلی
  require('./index.js');
}

// تابع کمکی برای تبدیل رشته حافظه به بایت
function parseMemory(memStr) {
  const units = { B: 1, K: 1024, M: 1024 * 1024, G: 1024 * 1024 * 1024 };
  const match = memStr.match(/^(\d+)([BKMG]?)$/i);
  if (!match) return 512 * 1024 * 1024; // پیش‌فرض 512MB
  
  const value = parseInt(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  return value * (units[unit] || 1);
}

// Export برای استفاده در جاهای دیگر
module.exports = {
  config,
  isWorker: !cluster.isMaster,
  workerId: cluster.worker ? cluster.worker.id : 0
};