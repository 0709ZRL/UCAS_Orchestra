// 字段定义
const fields = {
  persons: [
    { key:'personalId', label:'用户ID', readonly:true },
    { key:'name', label:'姓名', required:true },
    { key:'gender', label:'性别', type:'select', options:[{v:0,t:'女'},{v:1,t:'男'}], default:0 },
    { key:'institute', label:'学院' },
    { key:'grade', label:'年级' },
    { key:'campus', label:'校区', type:'select', options:[{v:0,t:'中关村校区'},{v:1,t:'玉泉路校区'},{v:3,t:'雁栖湖校区'},{v:4,t:'京内其他地区'},{v:5,t:'京外其他地区'}], default:0 },
    { key:'section', label:'声部', type:'select', options:[{v:0,t:'民族管乐声部'},{v:1,t:'弹拨一组'},{v:2,t:'弹拨二组'},{v:3,t:'胡琴声部'},{v:4,t:'提琴声部'},{v:5,t:'西洋木管声部'},{v:6,t:'西洋铜管声部'},{v:7,t:'低音声部'},{v:8,t:'钢琴声部'},{v:9,t:'打击声部'},{v:10,t:'无声部'}], default:0 },
    { key:'job', label:'职位', type:'select', options:[{v:0,t:'普通成员'},{v:1,t:'声部长'},{v:2,t:'琴房负责人'},{v:3,t:'发展成员'}], default:0 },
    { key:'isManager', label:'是否管理人员', type:'select', options:[{v:0,t:'否'},{v:1,t:'是'}], default:0 },
    { key:'managerJob', label:'管理职责', type:'select', options:[{v:0,t:'普通干事'},{v:1,t:'团长'},{v:2,t:'业务副团长'},{v:3,t:'人事副团长'},{v:4,t:'后勤组组长'},{v:5,t:'宣传组组长'},{v:6,t:'学生指挥'},{v:7,t:'指挥助理'},{v:8,t:'指挥'},{v:9,t:'谱务'}], default:0 },
    { key:'instrument', label:'乐器（多个用分号分隔）' },
    { key:'isMaster', label:'声部首席', type:'select', options:[{v:0,t:'否'},{v:1,t:'是'}], default:0 }
  ],
  scores: [
    { key:'scoreId', label:'乐谱ID', readonly:true },
    { key:'title', label:'乐谱名', required:true },
    { key:'isTotal', label:'是否为总谱', type:'select', options:[{v:0,t:'分谱'},{v:1,t:'总谱'}], default:0 },
    { key:'section', label:'所属声部', type:'select', options:[
      {v:'民族管乐声部', t:'民族管乐声部'},{v:'弹拨一组', t:'弹拨一组'},{v:'弹拨二组', t:'弹拨二组'},
      {v:'胡琴声部', t:'胡琴声部'},{v:'提琴声部', t:'提琴声部'},{v:'西洋木管声部', t:'西洋木管声部'},
      {v:'西洋铜管声部', t:'西洋铜管声部'},{v:'低音声部', t:'低音声部'},{v:'钢琴声部', t:'钢琴声部'},
      {v:'打击声部', t:'打击声部'},{v:'无声部', t:'无声部'}
    ], default:'' },
    { key:'file', label:'PDF 文件', type:'file', accept:'.pdf' }
  ],
  articles: [
    { key:'title', label:'标题', required:true },
    { key:'type', label:'分类', type:'select', options:[{v:0,t:'排练通知'},{v:1,t:'演出通知'},{v:2,t:'乐团新闻'}], default:0 },
    { key:'startTime', label:'活动开始时间', type:'datetime-local' },
    { key:'endTime', label:'活动结束时间', type:'datetime-local' },
    { key:'content', label:'内容', type:'textarea' },
    { key:'images', label:'图片（可多选）', type:'file', accept:'image/*', multiple:true }
  ],
  logistics: [
    { key:'itemId', label:'物品ID', readonly:true },
    { key:'name', label:'物品名', required:true },
    { key:'campus', label:'校区', type:'select', options:[{v:0,t:'中关村校区'},{v:1,t:'玉泉路校区'},{v:3,t:'雁栖湖校区'}], default:0 },
    { key:'address', label:'位置' },
    { key:'image', label:'图片', type:'file', accept:'image/*' },
    { key:'isPublic', label:'是否公用', type:'select', options:[{v:0,t:'私有'},{v:1,t:'公用'}], default:1 },
    { key:'belongsToId', label:'所属人ID(私有)' }
  ]
};

// 个人信息映射
const PROFILE_LABELS = {
  name:'姓名', gender:'性别', account:'账号', personalId:'用户ID',
  institute:'学院', grade:'年级', campus:'校区', section:'声部',
  job:'职位', isManager:'管理人员', managerJob:'管理职责', instrument:'乐器', isMaster:'声部首席'
};

const PROFILE_MAP = {
  gender:{0:'女',1:'男'},
  campus:{0:'中关村',1:'玉泉路',3:'雁栖湖',4:'京内其他',5:'京外其他'},
  section:{0:'民族管乐',1:'弹拨一组',2:'弹拨二组',3:'胡琴',4:'提琴',5:'西洋木管',6:'西洋铜管',7:'低音',8:'钢琴',9:'打击',10:'无声部'},
  job:{0:'普通成员',1:'声部长',2:'琴房负责人',3:'发展成员'},
  isManager:{0:'否',1:'是'},
  isMaster:{0:'否',1:'是'},
  managerJob:{0:'普通干事',1:'团长',2:'业务副团长',3:'人事副团长',4:'后勤组长',5:'宣传组长',6:'学生指挥',7:'指挥助理',8:'指挥',9:'谱务'}
};

// 文章类型
const TYPE_LABELS = ['排练通知','演出通知','乐团新闻','乐谱下载'];
const TYPE_TAGS = ['t0','t1','t2','t3'];

// 职位（与后端 persons.job 一致）
const JOB_PLAIN = 0;          // 普通成员
const JOB_SECTION_LEADER = 1; // 声部长
const JOB_ROOM_MANAGER = 2;   // 琴房负责人（非管理员，可任意增删改琴房预约）
const JOB_DEV_MEMBER = 3;     // 发展成员（仅可看琴房/个人信息，预约需四位密码）

// 搜索字段配置（每个页面）
function getSearchFields(page) {
  const map = {
    persons:[
      {key:'name',label:'姓名'},
      {key:'section',label:'声部',type:'select',options:[{v:0,t:'民族管乐'},{v:1,t:'弹拨一组'},{v:2,t:'弹拨二组'},{v:3,t:'胡琴'},{v:4,t:'提琴'},{v:5,t:'西洋木管'},{v:6,t:'西洋铜管'},{v:7,t:'低音'},{v:8,t:'钢琴'},{v:9,t:'打击'},{v:10,t:'无声部'}]},
      {key:'campus',label:'校区',type:'select',options:[{v:0,t:'中关村'},{v:1,t:'玉泉路'},{v:3,t:'雁栖湖'},{v:4,t:'京内其他'},{v:5,t:'京外其他'}]},
      {key:'isManager',label:'管理人员',type:'select',options:[{v:0,t:'否'},{v:1,t:'是'}]},
      {key:'isMaster',label:'首席',type:'select',options:[{v:0,t:'否'},{v:1,t:'是'}]}
    ],
    scores:[{key:'title',label:'乐谱名'},{key:'section',label:'声部'}],
    articles:[{key:'title',label:'标题'},{key:'type',label:'分类',type:'select',options:[{v:0,t:'排练通知'},{v:1,t:'演出通知'},{v:2,t:'乐团新闻'}]}],
    logistics:[{key:'name',label:'物品名'},{key:'campus',label:'校区'}]
  };
  return map[page] || [];
}

// 列配置
function getColumnConfig(page) {
  const map = {
    persons:[
      // 第一列 key 保持 personalId，删除按钮依赖它取主键
      {key:'personalId',label:'成员',render:(row)=> typeof memberCellHTML === 'function' ? memberCellHTML(row) : row.personalId},
      {key:'gender',label:'性别',render:(row)=> row.gender==1 ? '<span class="tag tag-male">男</span>' : '<span class="tag tag-female">女</span>'},
      {key:'grade',label:'年级',render:(row)=> row.grade ? escHtml(row.grade) : '<span class="cell-empty">—</span>'},
      {key:'section',label:'声部',render:(row)=> `<span class="tag tag-section">${escHtml(PROFILE_MAP.section[row.section] || '无声部')}</span>`},
      {key:'campus',label:'校区',render:(row)=> `<span class="tag tag-campus">${escHtml(PROFILE_MAP.campus[row.campus] || '—')}</span>`},
      {key:'job',label:'职位',render:(row)=> typeof personTagsHTML === 'function' ? personTagsHTML(row) : ''},
      {key:'instrument',label:'乐器',render:(row)=> instrumentSlotHTML(row.instrument)}
    ],
    scores:[{key:'scoreId',label:'ID'},{key:'title',label:'乐谱名'},{key:'isTotal',label:'类型'},{key:'section',label:'声部'},{key:'filehash',label:'PDF',render:(r)=>r.filehash?`<a href="/api/scores/${r.scoreId}/file" target="_blank" class="btn" style="padding:2px 10px;font-size:12px;background:#1890ff">📄 预览</a>`:'<span style="color:#999">无文件</span>'}],
    logistics:[{key:'itemId',label:'物品ID'},{key:'name',label:'物品名'},{key:'campus',label:'校区'},{key:'address',label:'位置'},{key:'isPublic',label:'状态'},{key:'belongsToId',label:'所属人'},{key:'imagehash',label:'图片',render:(r)=>r.imagehash?`<img src="/api/logistics/${r.itemId}/image" style="width:80px;height:80px;object-fit:cover;border-radius:6px;cursor:pointer" onclick="openLightbox('/api/logistics/${r.itemId}/image')" title="点击查看大图">`:'<span style="color:#999">无</span>'}]
  };
  return map[page] || [];
}

function getIdKey(page) {
  const map = { persons:'personalId', scores:'scoreId', logistics:'itemId', articles:'articleId', attendance:'attendanceId' };
  return map[page] || 'id';
}

function getPageLabel(page) {
  const map = { persons:'成员', scores:'乐谱', logistics:'物品' };
  return map[page] || page;
}
