module.exports = {
  apps: [
    {
      name: 'bkjw-bridge',
      script: 'bkjw_bridge.js',
      cwd: __dirname,
      interpreter: 'C:\\Program Files\\nodejs\\node.exe',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        PORT: 3456,
        BRIDGE_TOKEN: 'bkjw-bridge-4edf75e83c95',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/bridge-error.log',
      out_file: 'logs/bridge-out.log',
      merge_logs: true,
    },
    {
      name: 'mini-server',
      script: 'src/index.js',
      cwd: __dirname,
      interpreter: 'C:\\Program Files\\nodejs\\node.exe',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/server-error.log',
      out_file: 'logs/server-out.log',
      merge_logs: true,
    },
  ],
};
