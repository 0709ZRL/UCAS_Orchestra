module.exports = {
  apps: [{
    name: 'orchestra-api',
    script: 'src/app.js',
    cwd: __dirname,
    // 崩溃后自动重启
    autorestart: true,
    // 崩溃后等待 3 秒再重启
    restart_delay: 3000,
    // 最大重启次数（防止无限循环）
    max_restarts: 30,
    // 指数退避：首次重启延迟 1s，第二次 2s，第三次 4s ...
    exp_backoff_restart_delay: 100,
    // 日志配置
    error_file: '/root/.pm2/logs/orchestra-api-error.log',
    out_file: '/root/.pm2/logs/orchestra-api-out.log',
    // 时间戳
    time: true,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
