require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// 异步启动
async function start() {
  await initDB();

  // 定时任务
  const { startScheduler } = require('./services/scheduler');
  startScheduler();

  app.listen(PORT, () => {
    console.log(`[Server] 启动成功 → http://localhost:${PORT}`);
  });
}

start().catch(e => {
  console.error('[Server] 启动失败:', e);
  process.exit(1);
});
