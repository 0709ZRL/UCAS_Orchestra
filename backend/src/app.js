const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const errorHandler = require('./middleware/errorHandler');
const personsRouter = require('./routes/persons');
// eventsRouter removed — merged into articles
const attendanceRouter = require('./routes/attendance');
const scoresRouter = require('./routes/scores');
const logisticsRouter = require('./routes/logistics');
const authRouter = require('./routes/auth');
const articlesRouter = require('./routes/articles');
const registerRouter = require('./routes/register');
const eventsRouter = require('./routes/events');
const checkinRouter = require('./routes/checkin');
const geocodeRouter = require('./routes/geocode');
const roomsRouter = require('./routes/rooms');
const reservationsRouter = require('./routes/reservations');
const rehearsalsRouter = require('./routes/rehearsals');
const instrumentsRouter = require('./routes/instruments');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// 静态文件（JS/CSS/图片等，不含 HTML）
// 禁用缓存，确保前端更新后用户能立即看到最新版本（避免旧 JS 残留）
const noCache = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};
app.use('/css', noCache, express.static(path.join(__dirname, '../public/css')));
app.use('/js', noCache, express.static(path.join(__dirname, '../public/js')));
app.use('/cropper.min.css', express.static(path.join(__dirname, '../public/cropper.min.css')));
app.use('/cropper.min.js', express.static(path.join(__dirname, '../public/cropper.min.js')));
// 暴露上传目录用于 PDF 预览
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// 暴露乐器徽章图片目录（位于项目根，为 backend 的同级）
app.use('/instruments', express.static(path.join(__dirname, '..', '..', 'instruments')));

// 注入到 HTML <head> 的角色脚本：根据 localStorage 提前给 <html> 加 is-manager / is-conductor 类，
// 配合 shared.css 的 html:not(.is-manager) 等规则在首次绘制前隐藏无权限导航（彻底防闪现）
const ROLE_HEAD_SCRIPT = '<script>(function(){try{var m=JSON.parse(localStorage.getItem(\'_me\')||\'null\');if(m&&m.isManager==1)document.documentElement.classList.add(\'is-manager\');if(m&&m.managerJob==6)document.documentElement.classList.add(\'is-conductor\')}catch(e){}})();</script>';

// 注入到侧栏的导航项（排练记录，仅学生指挥可见，由 shared.css 的 is-conductor 规则控制显隐）
const SIDEBAR_EXTRA_ITEM = '<a href="/rehearsals">🎬 排练记录</a>';

function servePage(file) {
  return (req, res) => {
    const p = path.join(__dirname, '../public', file);
    fs.readFile(p, 'utf8', (err, html) => {
      if (err) return res.status(404).send('Not found');
      if (html.includes('<head>')) {
        html = html.replace('<head>', '<head>' + ROLE_HEAD_SCRIPT);
      }
      // 有侧栏的页面统一注入「排练记录」导航项（当前页高亮）
      if (html.includes('<nav class="sidebar">') && html.includes('</nav>')) {
        const active = req.path === '/rehearsals' ? ' class="active"' : '';
        const item = '<a href="/rehearsals"' + active + '>🎬 排练记录</a>';
        html = html.replace('</nav>', item + '</nav>');
      }
      res.type('html').send(html);
    });
  };
}

// MPA 页面路由
const pageRoutes = {
  '/': 'home.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/home': 'home.html',
  '/profile': 'profile.html',
  '/persons': 'persons.html',
  '/attendance': 'attendance.html',
  '/scores': 'scores.html',
  '/logistics': 'logistics.html',
  '/articles': 'articles.html',
  '/checkin': 'checkin.html',
  '/rooms': 'rooms.html',
  '/rehearsals': 'rehearsals.html'
};
// 活动管理重定向到文章管理
app.get('/events', (_req, res) => { res.redirect('/articles'); });
Object.entries(pageRoutes).forEach(([route, file]) => {
  app.get(route, servePage(file));
});

// 文章详情页路由（共享首页模板，JS 自行判断渲染内容）
app.get('/article/:id', servePage('home.html'));

// 按类型查看文章列表路由
app.get('/articles/type/:typeId', servePage('home.html'));

// 乐谱详情页路由
app.get('/score/:id', servePage('home.html'));

// 乐谱列表页路由
app.get('/scores-list', servePage('home.html'));

// 我的报名页路由
app.get('/my-registrations', servePage('home.html'));

// API 路由
app.use('/api/persons', personsRouter);
// app.use('/api/events') removed
app.use('/api/attendance', attendanceRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/logistics', logisticsRouter);
app.use('/api/auth', authRouter);
app.use('/api/articles', articlesRouter);
app.use('/api/register', registerRouter);
app.use('/api/events', eventsRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/rehearsals', rehearsalsRouter);
app.use('/api/instruments', instrumentsRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'Orchestra API is running', time: new Date().toISOString() });
});

// 错误处理
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`✅ Orchestra API server running on http://localhost:${PORT}`);
});
