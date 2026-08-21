const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// ===== 乐器徽章（backend/instruments/*.png）=====

// instruments 图片目录（位于项目根：/root/GKD_Orchestra/instruments，为 backend 的同级）
const IMG_DIR = path.join(__dirname, '..', '..', '..', 'instruments');

// 规范名 → 图片文件名（不含扩展名），从目录动态读取，避免硬编码遗漏
function getCanonicalNames() {
  try {
    return fs.readdirSync(IMG_DIR)
      .filter(f => f.toLowerCase().endsWith('.png'))
      .map(f => f.replace(/\.png$/i, ''));
  } catch (e) {
    return [];
  }
}

// 乐器中文名 → 规范名 的映射规则
// 1) 二胡/高胡/中胡/京胡/板胡 → 胡琴
// 2) 竹笛/曲笛/梆笛/洞箫/萧 等中国民族笛子 → 笛箫
// 3) 大管/巴松 → 大管
// 4) 高音笙/中音笙/低音笙 → 笙
const ALIAS = {
  // 胡琴族
  '胡琴': '胡琴', '二胡': '胡琴', '高胡': '胡琴', '中胡': '胡琴', '京胡': '胡琴', '板胡': '胡琴',
  // 笛箫族（中国民族笛子）
  '笛箫': '笛箫', '竹笛': '笛箫', '曲笛': '笛箫', '梆笛': '笛箫', '洞箫': '笛箫',
  '萧': '笛箫', '箫': '笛箫', '笛子': '笛箫', '笛': '笛箫',
  // 大管
  '大管': '大管', '巴松': '大管',
  // 笙族
  '笙': '笙', '高音笙': '笙', '中音笙': '笙', '低音笙': '笙'
};

// 规范化输入：去首尾空白、去内部空白（如「中 胡」→「中胡」）
function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, '');
}

// 将乐器中文名解析为规范名；未匹配返回 null
function resolveBadge(name) {
  const key = normalizeName(name);
  if (!key) return null;
  // 1) 先查别名规则
  if (ALIAS[key]) return ALIAS[key];
  // 2) 目录中存在同名图片 → 直接匹配
  const canon = getCanonicalNames();
  if (canon.includes(key)) return key;
  return null;
}

/**
 * GET /api/instruments/badge?name=二胡
 * 返回徽章图片（重定向到 /instruments/<规范名>.png），便于 <img> 直接引用
 * 未匹配返回 404
 */
router.get('/badge', (req, res) => {
  const canonical = resolveBadge(req.query.name);
  if (!canonical) {
    return res.status(404).json({ success: false, message: `未找到乐器「${req.query.name || ''}」对应的徽章` });
  }
  const url = '/instruments/' + encodeURIComponent(canonical) + '.png';
  res.redirect(url);
});

/**
 * GET /api/instruments/badge-info?name=二胡
 * 返回映射信息 JSON（供小程序/前端判断是否匹配及图片地址）
 */
router.get('/badge-info', (req, res) => {
  const input = String(req.query.name || '').trim();
  const canonical = resolveBadge(input);
  if (!canonical) {
    return res.json({
      success: false,
      matched: false,
      input,
      message: `未找到乐器「${input}」对应的徽章`
    });
  }
  res.json({
    success: true,
    matched: true,
    input,
    badge: canonical,
    url: '/instruments/' + encodeURIComponent(canonical) + '.png',
    fullUrl: '/api/instruments/badge?name=' + encodeURIComponent(input)
  });
});

/**
 * GET /api/instruments/list
 * 返回全部可用的规范徽章列表
 */
router.get('/list', (_req, res) => {
  res.json({ success: true, data: getCanonicalNames() });
});

module.exports = router;
