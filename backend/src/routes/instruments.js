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
// 2) 竹笛/曲笛/梆笛/新笛/洞箫/萧 等中国民族笛子 → 笛箫
// 3) 大管/巴松 → 大管
// 4) 高音笙/中音笙/低音笙 → 笙
// 5) 仅输入「萨克斯」时 → 次中音萨克斯
// 6) 贝斯/贝司/低音贝司/低音贝斯/倍低音提琴 → 低音提琴
const ALIAS = {
  // 胡琴族
  '胡琴': '胡琴', '二胡': '胡琴', '高胡': '胡琴', '中胡': '胡琴', '京胡': '胡琴', '板胡': '胡琴',
  // 笛箫族（中国民族笛子）
  '笛箫': '笛箫', '竹笛': '笛箫', '曲笛': '笛箫', '梆笛': '笛箫', '新笛': '笛箫', '洞箫': '笛箫',
  '萧': '笛箫', '箫': '笛箫', '笛子': '笛箫', '笛': '笛箫',
  // 低音提琴
  '低音提琴': '低音提琴', '贝斯': '低音提琴', '贝司': '低音提琴',
  '低音贝司': '低音提琴', '低音贝斯': '低音提琴', '倍低音提琴': '低音提琴',
  // 大管
  '大管': '大管', '巴松': '大管',
  // 笙族
  '笙': '笙', '高音笙': '笙', '中音笙': '笙', '低音笙': '笙',
  // 萨克斯：仅输入「萨克斯」时默认按次中音萨克斯匹配
  '萨克斯': '次中音萨克斯'
};

// 规范化输入：去首尾空白、去内部空白（如「中 胡」→「中胡」）
function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, '');
}

// 多个乐器之间的分隔符：中文分号；、英文分号;、中文逗号，、英文逗号,、顿号、
// 以及空白（空格/全角空格/制表/换行）
const SPLIT_RE = /[；;，,、\s]+/;

// 将「多乐器字符串」拆分为单个乐器名（去空、保序）
function splitInstruments(name) {
  return String(name || '')
    .split(SPLIT_RE)
    .map(s => s.trim())
    .filter(Boolean);
}

// 单个乐器名 → 规范名；未匹配返回 null
function resolveOne(name) {
  const key = normalizeName(name);
  if (!key) return null;
  // 1) 先查别名规则
  if (ALIAS[key]) return ALIAS[key];
  // 2) 目录中存在同名图片 → 直接匹配
  return getCanonicalNames().includes(key) ? key : null;
}

/**
 * 解析乐器（支持多乐器）→ 规范名数组（去重、保序）
 * 输入可用 中文分号；/英文分号;/中文逗号，/英文逗号,/顿号、/空格 分隔，例如：
 *   「二胡; 中胡」 「二胡；唢呐；竹笛」 「二胡,中胡」 「二胡 中胡」
 * 兼容：若整串本身就是一个乐器（含被空格拆散，如「中 胡」），优先按整串匹配
 */
function resolveBadges(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  // 1) 整体优先：整串能匹配上，就不再拆分（兼容「中 胡」这类单乐器）
  const whole = resolveOne(raw);
  if (whole) return [whole];
  // 2) 按分隔符拆分后逐个匹配，规范名去重
  const out = [];
  for (const part of splitInstruments(raw)) {
    const canon = resolveOne(part);
    if (canon && !out.includes(canon)) out.push(canon);
  }
  return out;
}

// 拆分输入中「未匹配上徽章」的部分（便于调用方提示/排查）
function unmatchedParts(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  if (resolveOne(raw)) return [];
  return splitInstruments(raw).filter(p => !resolveOne(p));
}

// 规范名 → 徽章图片地址
function badgeUrl(canonical) {
  return '/instruments/' + encodeURIComponent(canonical) + '.png';
}

/**
 * GET /api/instruments/badge?name=二胡
 * GET /api/instruments/badge?name=二胡;中胡&index=1
 * 返回徽章图片（重定向到 /instruments/<规范名>.png），便于 <img> 直接引用
 * 多乐器时默认取第 1 个匹配（可用 index 指定第几个，从 0 开始）
 * 未匹配返回 404
 */
router.get('/badge', (req, res) => {
  const list = resolveBadges(req.query.name);
  if (!list.length) {
    return res.status(404).json({ success: false, message: `未找到乐器「${req.query.name || ''}」对应的徽章` });
  }
  let idx = parseInt(req.query.index, 10);
  if (!Number.isFinite(idx) || idx < 0) idx = 0;
  if (idx >= list.length) idx = list.length - 1;
  res.redirect(badgeUrl(list[idx]));
});

/**
 * GET /api/instruments/badge-info?name=二胡;中胡
 * 返回映射信息 JSON（供小程序/前端判断是否匹配及图片地址）
 * 支持单个或多个乐器（用 中/英分号、中/英逗号、顿号、空格 分隔）
 */
router.get('/badge-info', (req, res) => {
  const input = String(req.query.name || '').trim();
  const parts = input ? splitInstruments(input) : [];
  const whole = input ? resolveOne(input) : null;
  const list = resolveBadges(input);
  if (!list.length) {
    return res.json({
      success: false,
      matched: false,
      input,
      count: 0,
      badges: [],
      urls: [],
      unmatched: parts,
      message: `未找到乐器「${input}」对应的徽章`
    });
  }
  // 逐项明细（整串命中时只有一项）
  const items = whole
    ? [{ input, badge: whole, url: badgeUrl(whole) }]
    : parts
        .map(p => ({ input: p, badge: resolveOne(p) }))
        .filter(it => it.badge)
        .map(it => ({ ...it, url: badgeUrl(it.badge) }));
  res.json({
    success: true,
    matched: true,
    input,
    count: list.length,
    badges: list,
    urls: list.map(badgeUrl),
    items,
    unmatched: unmatchedParts(input),
    // 兼容单乐器用法（取第 1 个）
    badge: list[0],
    url: badgeUrl(list[0]),
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
