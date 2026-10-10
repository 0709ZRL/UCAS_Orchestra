// ===== 乐谱声部相关的共享常量与权限判断 =====
// scores.js 与 scoreFolders.js 共用，避免两处规则漂移

const { isManager } = require('../middleware/auth');

// 成员声部数字 → 乐谱声部名称（scores.section 为字符串，可存逗号分隔多声部）
const SCORE_SECTION_BY_INT = {
  0:'民族管乐声部',1:'弹拨一组',2:'弹拨二组',3:'胡琴声部',4:'提琴声部',5:'西洋木管声部',
  6:'西洋铜管声部',7:'低音声部',8:'钢琴声部',9:'打击声部',10:'无声部'
};

// 合法声部名集合
const SCORE_SECTIONS = Object.values(SCORE_SECTION_BY_INT);

// 解析分谱的声部列表（逗号分隔存储）；总谱强制无声部
// sections / section 均兼容：数组（多选）、单个字符串、逗号分隔字符串
function resolveSection(isTotal, section, sections) {
  if (parseInt(isTotal || 0) === 1) return '';
  const list = [];
  const collect = (v) => {
    if (Array.isArray(v)) v.forEach(x => { if (x !== undefined && x !== null) list.push(String(x)); });
    else if (v !== undefined && v !== null && v !== '') list.push(String(v));
  };
  collect(sections);
  collect(section);
  const cleaned = list.map(s => s.trim()).filter(Boolean).filter(s => SCORE_SECTIONS.includes(s));
  return [...new Set(cleaned)].join(',');
}

// 声部长能否操作该乐谱：仅本声部 分谱（isTotal=0，且声部列表包含本声部）
function sectionLeaderCanOperate(user, record) {
  if (isManager(user)) return true;
  if (user.job != 1) return false;
  if (record.isTotal == 1) return false;
  const mySection = SCORE_SECTION_BY_INT[user.section] || '';
  const sections = String(record.section || '').split(',').map(s => s.trim()).filter(Boolean);
  return sections.includes(mySection);
}

module.exports = { SCORE_SECTION_BY_INT, SCORE_SECTIONS, resolveSection, sectionLeaderCanOperate };
