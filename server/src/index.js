require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const log = require('./utils/logger');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db/database');

const petRoutes = require('./routes/pet');
const miniRoutes = require('./routes/mini');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 路由
app.use('/api/pet', petRoutes);
app.use('/api', miniRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 网页仪表盘
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// ===== 404 JSON 处理 =====
app.use((req, res) => {
  res.status(404).json({ status: 'error', message: `路由 ${req.method} ${req.path} 不存在` });
});

// ===== 全局错误处理中间件 =====
app.use((err, req, res, next) => {
  log.error(`[Error] ${req.method} ${req.path}: ${err.message}`, { stack: err.stack });
  res.status(err.status || 500).json({
    status: 'error',
    message: err.message || '服务器内部错误'
  });
});

// 异步启动
async function start() {
  await initDB();

  // 定时任务
  const { startScheduler } = require('./services/scheduler');
  startScheduler();

  app.listen(PORT, () => {
    log.info(`[Server] 启动成功 → http://localhost:${PORT}`);
  });
}

start().catch(e => {
  log.error('[Server] 启动失败:', e);
  process.exit(1);
});
