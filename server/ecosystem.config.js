// PM2 生态系统配置
// 安装: npm install -g pm2
// 启动: pm2 start ecosystem.config.js
// 保存: pm2 save
// 设置开机自启: pm2 startup

const NODE_PATH = 'C:\\Program Files\\nodejs\\node.exe';

module.exports = {
  apps: [
    {
      name: 'bkjw-server',
      script: 'src/index.js',
      cwd: __dirname,
      interpreter: NODE_PATH,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: '256M',
      kill_timeout: 10000,
      env: {
        PORT: 3000,
        BRIDGE_URL: 'http://localhost:3456',
        BRIDGE_TOKEN: 'bkjw-bridge-4edf75e83c95',
        BRIDGE_CRED_TOKEN: 'bridge-cred-4a7f3b2e8c11',
        MINI_TOKEN: 'mini_secret_token_here',
        ENCRYPTION_KEY: 'njust-schedule-default-key-32chr!',
      },
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'bkjw-bridge',
      script: 'bkjw_bridge.js',
      cwd: __dirname,
      interpreter: NODE_PATH,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      max_memory_restart: '512M',
      kill_timeout: 15000,
      env: {
        PORT: 3456,
        BRIDGE_MAIN_URL: 'http://localhost:3000',
        BRIDGE_CRED_TOKEN: 'bridge-cred-4a7f3b2e8c11',
      },
      error_file: './logs/bridge-error.log',
      out_file: './logs/bridge-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
