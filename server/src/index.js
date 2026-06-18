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

// 初始化数据库
initDB();

// 路由
app.use('/api/pet', petRoutes);
app.use('/api', miniRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Server] 启动成功 → http://localhost:${PORT}`);
});
