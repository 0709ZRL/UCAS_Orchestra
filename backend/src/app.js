const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const personsRouter = require('./routes/persons');
const eventsRouter = require('./routes/events');
const attendanceRouter = require('./routes/attendance');
const scoresRouter = require('./routes/scores');
const logisticsRouter = require('./routes/logistics');
const authRouter = require('./routes/auth');
const articlesRouter = require('./routes/articles');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// 静态文件（JS/CSS/图片等，不含 HTML）
app.use('/css', express.static(path.join(__dirname, '../public/css')));
app.use('/js', express.static(path.join(__dirname, '../public/js')));
app.use('/cropper.min.css', express.static(path.join(__dirname, '../public/cropper.min.css')));
app.use('/cropper.min.js', express.static(path.join(__dirname, '../public/cropper.min.js')));
// 暴露上传目录用于 PDF 预览
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// MPA 页面路由
const pageRoutes = {
  '/': 'home.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/home': 'home.html',
  '/profile': 'profile.html',
  '/persons': 'persons.html',
  '/events': 'events.html',
  '/attendance': 'attendance.html',
  '/scores': 'scores.html',
  '/logistics': 'logistics.html',
  '/articles': 'articles.html'
};
Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, '../public', file));
  });
});

// 文章详情页路由（共享首页模板，JS 自行判断渲染内容）
app.get('/article/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'home.html'));
});

// 按类型查看文章列表路由
app.get('/articles/type/:typeId', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'home.html'));
});

// 乐谱详情页路由
app.get('/score/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'home.html'));
});

// 乐谱列表页路由
app.get('/scores-list', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'home.html'));
});

// API 路由
app.use('/api/persons', personsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/auth', authRouter);
app.use('/api/articles', articlesRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Orchestra API is running', time: new Date().toISOString() });
});

// 错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Orchestra API server running on http://localhost:${PORT}`);
});
