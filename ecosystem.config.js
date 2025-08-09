module.exports = {
  apps: [{
    name: 'farsnews-crawler',
    script: 'index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
      PORT: 3004
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3004,
      DB_TYPE: 'postgres',
      DB_HOST: 'localhost',
      DB_PORT: 5432,
      DB_NAME: 'farsnews_crawler',
      DB_USER: 'postgres',
      DB_PASSWORD: 'farsnews_secure_password_2024'
    },
    error_file: 'logs/pm2/error.log',
    out_file: 'logs/pm2/output.log',
    time: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
}; 