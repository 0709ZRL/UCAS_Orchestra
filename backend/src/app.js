const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const personsRouter = require('./routes/persons');
const eventsRouter = require('./routes/events');
const attendanceRouter = require('./routes/attendance');
const scoresRouter = require('./routes/scores');
const logisticsRouter = require('./routes/logistics');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
// 暴露上传目录用于 PDF 预览
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API 路由
app.use('/api/persons', personsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/logistics', logisticsRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Orchestra API is running', time: new Date().toISOString() });
});

// 错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Orchestra API server running on http://localhost:${PORT}`);
});
