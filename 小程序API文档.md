# 国科大民族管弦乐团管理平台 — 微信小程序 API 文档

> 面向小程序（微信原生 / uni-app / Taro）开发者。已按小程序的使用场景筛选，只列出小程序会用到的接口，并标注小程序特有的注意事项。
>
> 完整的后台接口清单见 `API文档.md`（本文件是它的**小程序子集**）。

---

## 一、基础约定

### 1.1 服务器地址

```
Base URL: https://zzzrrll.xin
接口前缀: /api
示例:     https://zzzrrll.xin/api/auth/login
```

> ⚠️ **微信小程序必须使用 HTTPS**，且需在
> 小程序后台 →「开发」→「开发设置」→「服务器域名」中把 `https://zzzrrll.xin` 加入：
> - **request 合法域名**
> - **downloadFile 合法域名**（下载乐谱 PDF）
> - **uploadFile 合法域名**（上传头像）
> - **image 无需配置**（`<image>` 组件不受域名限制，但建议一并配置以便排查）

### 1.2 统一响应格式

所有接口都返回 JSON，且有 `success` 字段：

```jsonc
// 成功
{ "success": true, "data": ..., "message": "可选提示" }

// 失败
{ "success": false, "message": "错误原因" }
```

HTTP 状态码参考：

| 状态码 | 含义 |
|---|---|
| 200 / 201 | 成功 |
| 400 | 参数错误（`message` 里有具体原因） |
| 401 | 未登录 / token 失效 → **重新登录** |
| 403 | 已登录但无权限（如非琴房负责人改预约密码） |
| 404 | 资源不存在 |
| 409 | 冲突（账号已注册 / 预约时间段被占用） |

### 1.3 认证方式（重要）

小程序**无法使用 Cookie**，必须用 `Authorization` 请求头：

```
Authorization: Bearer <token>
```

- token 由 `POST /api/auth/login` 或注册接口返回，**有效期 7 天**
- 登录成功后在本地持久化（`wx.setStorageSync('token', token)`），并在每次 `wx.request` 的 header 中带上
- 收到 **401** 时清掉本地 token 并跳回登录页

### 1.4 ⚠️ 时间字段的时区坑（必读）

后端把 `DATETIME` 序列化成 **UTC ISO 字符串**，因此**比北京时间少 8 小时**：

```js
// 接口返回
"createdAt": "2026-09-18T03:10:26.000Z"   // 实际是北京时间 2026-09-18 11:10

// 正确做法：加 8 小时再按 UTC 取各字段
function fmtCN(v) {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v).slice(0, 16).replace('T', ' ');
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())} ` +
         `${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}`;
}
```

**例外（已经是可直接显示的本地字符串，不要再 +8h）：**

| 接口 | 字段 |
|---|---|
| `GET /api/reservations` | `date`（`YYYY-MM-DD`）、`startTime` / `endTime`（`HH:mm`） |
| 其它 | 纯 `date` / `time` 类型字段 |

### 1.5 领域常量（直接写在小程序里）

```js
// 职位 persons.job
const JOB = { 0:'普通成员', 1:'声部长', 2:'琴房负责人', 3:'发展成员' };

// 声部 persons.section
const SECTION = ['民族管乐声部','弹拨一组','弹拨二组','胡琴声部','提琴声部','西洋木管声部',
                 '西洋铜管声部','低音声部','钢琴声部','打击声部','无声部'];

// 校区 persons.campus
const CAMPUS = { 0:'中关村校区', 1:'玉泉路校区', 3:'雁栖湖校区', 4:'京内其他地区', 5:'京外其他地区' };

// 管理职责 persons.managerJob
const MANAGER_JOB = { 0:'普通干事',1:'团长',2:'业务副团长',3:'人事副团长',4:'后勤组组长',
                      5:'宣传组组长',6:'学生指挥',7:'指挥助理',8:'指挥',9:'谱务' };

// 文章类型 articles.type
const ARTICLE_TYPE = { 0:'排练通知', 1:'演出通知', 2:'乐团新闻' };
```

---

## 二、认证 / 账号

### 2.1 登录

```
POST /api/auth/login
```
```json
{ "account": "newfish", "password": "123456" }
```
```json
{ "success": true, "message": "登录成功", "name": "小赵",
  "token": "eyJhbGciOiJIUzI1NiIs..." }
```

### 2.2 普通注册（正式成员）

```
POST /api/auth/register
```
```json
{ "account":"test","password":"123456","name":"张三","gender":1,
  "institute":"软件所","grade":"博一","campus":0,"section":3,"instrument":"二胡" }
```
- `job` 白名单只有 `0`（普通成员）/`1`（声部长），传其它值按 `0` 处理
- 成功返回 `token`，可直接进入首页

### 2.3 发展成员注册

```
POST /api/auth/register-dev
```
```json
{ "account":"dev1","password":"123456","name":"李四","gender":1,
  "institute":"软件所","grade":"研一","campus":0,"instrument":"二胡" }
```
- 强制 `job=3`（发展成员）、`isOrchestraMember=0`
- 密码至少 6 位
- 成功返回 `token`

### 2.4 当前登录用户

```
GET /api/auth/me
```
```json
{ "success": true, "data": {
  "personalId":"PMUDS8BVW7136","account":"newfish","name":"小赵",
  "gender":1,"institute":"软件所","grade":"研一","campus":0,"section":10,
  "job":3,"isManager":0,"managerJob":0,"instrument":"二胡","isMaster":0,
  "avatarhash":null,"isOrchestraMember":0 } }
```
> 小程序启动时调一次，用于判断身份、决定显示哪些 tab。

### 2.5 退出登录

```
POST /api/auth/logout
```
> 小程序端主要是清掉本地 token，这个接口可调可不调。

### 2.6 重置 / 修改密码

```
POST /api/auth/forgot
```
```json
{ "account":"test", "name":"张三", "newPassword":"654321" }
```
> 通过「账号 + 真实姓名」校验后重置，忘记密码和「修改密码」都用它。新密码至少 6 位。

### 2.7 修改个人资料

```
PUT /api/auth/profile
```
```json
{ "name":"张三","gender":1,"institute":"软件所","grade":"研一",
  "campus":0,"section":3,"instrument":"二胡; 中胡" }
```
- `instrument` 支持**数组**提交（如徽章多选）：`["二胡","中胡"]`，后端会用 `;` 拼接
- `job` / `isManager` / `managerJob` / `isMaster` **仅管理员**可改，其他账号提交一律忽略

### 2.8 头像

```
POST /api/auth/avatar          // 上传（multipart/form-data，字段名 avatar）
GET  /api/auth/avatar          // 获取当前登录用户的头像（需登录）
GET  /api/persons/:personalId/avatar   // 获取任意用户头像（公开，无需登录 ✅）
```

小程序上传示例：

```js
wx.uploadFile({
  url: 'https://zzzrrll.xin/api/auth/avatar',
  filePath: tempFilePath,
  name: 'avatar',                       // 字段名必须是 avatar
  header: { Authorization: 'Bearer ' + token },
  success: res => { /* res.data 是 JSON 字符串，需 JSON.parse */ }
});
```

展示头像（公开接口，可直接给 `<image>`）：

```html
<image src="https://zzzrrll.xin/api/persons/{{personalId}}/avatar" mode="aspectFill"/>
<!-- 无头像时接口返回 404，请在 binderror 里换成默认头像 -->
```

---

## 三、首页 / 通知公告

### 3.1 文章列表

```
GET /api/articles?type=0&page=1&limit=20&title=排练
```
| 参数 | 说明 |
|---|---|
| `type` | 0=排练通知 1=演出通知 2=乐团新闻，不传=全部 |
| `title` | 标题模糊搜索 |
| `page` / `limit` | 分页，默认 1 / 20 |

```json
{ "success":true, "total":127, "page":1, "limit":20, "data":[
  { "articleId":149, "type":0, "title":"大艺节展演排练通知",
    "summary":"<div>排练时间：14:00-17:00</div>...",
    "createdAt":"2026-09-18T03:10:26.000Z",
    "startTime":"2026-09-19T05:30:00.000Z",
    "endTime":"2026-09-19T09:00:00.000Z" } ] }
```
> `summary` 是 HTML 片段（`LEFT(content,200)`），小程序用 `rich-text` 渲染或先剥标签。

### 3.2 各类别最新一条（首页三栏）

```
GET /api/articles/latest
```
```json
{ "success":true, "data": { "0":{...}, "1":{...}, "2":{...} } }
```
> 按 `type` 为键的对象，某类型无数据时值为 `null`。

### 3.3 文章详情

```
GET /api/articles/:id
```
```json
{ "success":true, "data": {
  "articleId":149,"type":0,"title":"大艺节展演排练通知",
  "content":"<div>...</div>",           // HTML，用 rich-text 渲染
  "images":"a.jpg,b.jpg",               // 逗号分隔的文件名，需拼 /uploads/articles/xxx
  "attachments":null,
  "location":"39.910000,116.250000",    // "纬度,经度"，打卡时用
  "startTime":"2026-09-19T05:30:00.000Z",
  "endTime":"2026-09-19T09:00:00.000Z",
  "createdAt":"2026-09-18T03:10:26.000Z" } }
```
图片地址拼法：`https://zzzrrll.xin/uploads/articles/<文件名>`

---

## 四、活动报名 / 打卡

### 4.1 下一个可报名活动

```
GET /api/register/next-event
```
```json
{ "success":true, "data": { "articleId":149,"type":0,"title":"...",
  "content":"...","startTime":"...","endTime":"...","registered":true } }
```
> 无活动时 `data` 为 `null`。

### 4.2 报名 / 取消报名

```
POST   /api/register/event/:articleId    // 报名
DELETE /api/register/event/:articleId    // 取消报名
```
- 重复报名返回 **409**；仅未结束的活动可取消

### 4.3 我的报名

```
GET /api/register/my
```
```json
{ "success":true, "data":[
  { "attendanceId":321,"eventId":"ARTICLE_149","attTitle":"大艺节展演排练通知",
    "method":0,"articleId":149,"type":0,"title":"大艺节展演排练通知",
    "startTime":"2026-09-19T05:30:00.000Z","endTime":"2026-09-19T09:00:00.000Z" } ] }
```
> `method`：`0`=仅报名，`1`=已打卡

### 4.4 现场打卡

```
POST /api/checkin
```
```json
{ "eventId":"ARTICLE_149", "userLat":39.9100, "userLng":116.2500 }
```

流程（小程序）：

1. `wx.getLocation({ type:'gcj02' })` → 拿到 `latitude` / `longitude`
2. 用活动详情里的 `location`（`"纬度,经度"`）作为**目标点**
3. `POST /api/checkin`，服务端用 Haversine 计算距离，**>10 米判定失败**

返回示例：

```json
{ "success":true, "message":"打卡成功" }
{ "success":false, "message":"距离活动地点太远（当前 123 米，需在 10 米内）" }
```

需要在 `app.json` 声明权限：

```json
{ "permission": { "scope.userLocation": { "desc": "用于活动现场打卡" } } }
```

### 4.5 打卡历史

```
GET /api/checkin/history?limit=20
```
```json
{ "success":true, "data":[
  { "attendanceId":312,"eventId":"ARTICLE_147","title":"电脑端打卡测试2",
    "method":1,"checkedAt":312,
    "startTime":"2026-09-06T02:50:00.000Z","endTime":"2026-09-06T03:50:00.000Z",
    "location":"39.980000,116.340000" } ] }
```
> ⚠️ **已知问题**：`checkedAt` 目前**等于 `attendanceId`**（后端 `attendance` 表没有打卡时间列），**不要用它显示时间**。建议按 `startTime` 显示活动时间，或等后端补列。详见文末「已知问题」。

---

## 五、琴房预约

### 5.1 琴房列表

```
GET /api/rooms
```
```json
{ "success":true, "data":[
  { "roomId":"玉泉路琴房","campus":"玉泉路琴房","name":"玉泉路琴房","description":null },
  { "roomId":"雁栖湖琴房", ... }, { "roomId":"奥运村琴房", ... } ] }
```

### 5.2 按日期范围查预约（周课表）

```
GET /api/reservations?roomId=玉泉路琴房&dateFrom=2026-09-21&dateTo=2026-09-27
```
```json
{ "success":true, "data":[
  { "id":33,"roomId":"玉泉路琴房","bookerId":"PMUDS8BVW7136",
    "date":"2026-09-23","startTime":"10:00","endTime":"11:00",
    "participants":[ {"personalId":"PMU...","name":"小赵"} ],
    "bookerName":"小赵","createdAt":"2026-09-23T07:22:10.000Z" } ] }
```
> `date` / `startTime` / `endTime` **已是本地字符串**，直接用。
> `roomId` 含中文，记得 `encodeURIComponent`。

### 5.3 创建预约

```
POST /api/reservations
```
```json
{ "roomId":"玉泉路琴房","date":"2026-09-25","startTime":"19:00","endTime":"20:00",
  "participants":["PMU...","PMU..."],
  "roomPassword":"8912" }
```

规则：

- 营业时间 **07:00–22:30**，结束时间必须晚于开始时间，不可跨天
- 每笔最多 **6 人**（含主预约人，后端会自动把你加进 `participants`）
- 时间段冲突返回 **409** `该时间段已被占用，请选择其他时间`
- 管理员 / 琴房负责人可覆盖冲突
- **只有发展成员（`job=3`）需要 `roomPassword`**（琴房负责人设置的四位数字）：

| 场景 | 返回 |
|---|---|
| 发展成员未传密码 | `400 { "message":"请输入预约密码", "needPassword":true }` |
| 发展成员密码错误 | `403 { "message":"预约密码错误，请联系琴房负责人获得预约密码", "needPassword":true }` |
| 正式成员（job 0/1/2）或管理员 | 不需要密码，传了也会被忽略 |

> 小程序判断依据：`me.job === 3` 时才显示密码输入框。

### 5.4 修改 / 取消预约

```
PUT    /api/reservations/:id     // 修改（body: startTime / endTime / participants）
DELETE /api/reservations/:id     // 取消
```
- 管理员、琴房负责人：可改/删**任何人**的预约，不受时间规则限制
- 其他用户：**仅主预约人**可改/删自己的预约
  - 预约已结束 → 不可改不可删
  - 预约进行中 → 只能改结束时间

### 5.5 预约密码（琴房负责人 / 管理员）

```
GET /api/reservations/password
```
```json
{ "success":true, "data":{ "password":"8912" } }
```

```
PUT /api/reservations/password
```
```json
{ "password":"5678" }
```
- **必须是 4 位数字**，否则 `400 { "message":"预约密码必须是 4 位数字" }`
- 非琴房负责人（`job=2`）/管理员调用返回 **403**

---

## 六、成员 / 乐器徽章

### 6.1 成员列表

```
GET /api/persons?name=张&section=3&campus=0&page=1&limit=20
```
> **默认不含发展成员**（`job=3`）。传 `job=3` 可单独查发展成员。

```json
{ "success":true, "total":63, "page":1, "limit":20, "data":[
  { "personalId":"PMB...","account":"...","name":"张相皓","gender":1,
    "institute":"中国科学院空天信息创新研究院","grade":"博二","campus":0,
    "section":3,"job":0,"isManager":0,"managerJob":0,
    "instrument":"二胡","isMaster":0,"avatarhash":null,"isOrchestraMember":1 } ] }
```
> ⚠️ 响应里**不含 password**，但含 `account` 等字段；小程序只展示需要的即可。

### 6.2 成员详情 / 搜索 / 统计

```
GET /api/persons/:personalId              // 单个成员
GET /api/persons/search?q=姓名或personId   // 搜索（预约选择参与人用）
GET /api/persons/stats                    // 统计（总数 / 男女 / 声部 / 校区分布）
```

### 6.3 乐器徽章 ⭐

小程序展示乐器徽章时，**用批量接口一次拿完**，不要逐行请求。

```
GET /api/instruments/badges?name=二胡; 中胡&name=大提琴;贝斯&name=古代编钟
```
```json
{ "success":true, "data":[
  { "input":"二胡; 中胡","matched":true,
    "badges":["胡琴"],"urls":["/instruments/%E8%83%A1%E7%90%B4.png"],"unmatched":[] },
  { "input":"大提琴;贝斯","matched":true,
    "badges":["大提琴","低音提琴"],
    "urls":["/instruments/%E5%A4%A7%E6%8F%90%E7%90%B4.png","/instruments/%E4%BD%8E%E9%9F%B3%E6%8F%90%E7%90%B4.png"],
    "unmatched":[] },
  { "input":"古代编钟","matched":false,"badges":[],"urls":[],"unmatched":["古代编钟"] } ] }
```

单个乐器：

```
GET /api/instruments/badge-info?name=二胡
```
```json
{ "success":true,"matched":true,"count":1,
  "badge":"胡琴","badges":["胡琴"],
  "url":"/instruments/%E8%83%A1%E7%90%B4.png",
  "urls":["/instruments/%E8%83%A1%E7%90%B4.png"],
  "items":[{"input":"二胡","badge":"胡琴","url":"..."}],
  "unmatched":[] }
```

图片地址：`https://zzzrrll.xin/instruments/<规范名>.png`（`urls` 已给出可直接用的路径）

```
GET /api/instruments/badge?name=二胡&index=0   // 302 跳转到图片，可直接给 <image>
GET /api/instruments/list                       // 全部规范名列表
```

**多乐器分隔符**（可混用）：中文分号 `；`、英文分号 `;`、中文逗号 `，`、英文逗号 `,`、顿号 `、`、空格
> 例：`二胡; 中胡`、`钢琴；大提琴`、`古筝;大阮`、`二胡 中胡`、`中 胡`（整体识别）

**别名规则**（自动归一）：
| 输入 | 徽章 |
|---|---|
| 二胡 / 高胡 / 中胡 / 京胡 / 板胡 | 胡琴 |
| 竹笛 / 曲笛 / 梆笛 / 新笛 / 洞箫 / 萧 / 箫 / 笛子 / 笛 | 笛箫 |
| 贝斯 / 贝司 / 低音贝司 / 低音贝斯 / 倍低音提琴 / 低音提琴 | 低音提琴 |
| 大管 / 巴松 | 大管 |
| 高音笙 / 中音笙 / 低音笙 / 笙 | 笙 |
| 萨克斯 | 次中音萨克斯 |

---

## 七、乐谱

```
GET /api/scores?title=写意山水&section=胡琴声部&page=1&limit=20
GET /api/scores/:scoreId/file          // 下载 PDF
GET /api/scores/:scoreId               // 详情
```
```json
{ "success":true, "total":80, "data":[
  { "scoreId":135,"title":"（修正版）写意山水 - 民族管弦乐专供 - 胡琴 - 首调 - 小提琴 1+高胡-1",
    "isTotal":0,"section":"胡琴声部","filehash":"94ac33..." } ] }
```

小程序打开 PDF：

```js
wx.downloadFile({
  url: `https://zzzrrll.xin/api/scores/${scoreId}/file`,
  success: res => {
    wx.openDocument({
      filePath: res.tempFilePath, fileType: 'pdf',
      fail: () => wx.showToast({ title: '打开失败', icon: 'none' })
    });
  }
});
```

> `isTotal`：`1`=总谱，`0`=分谱；`section` 可能是**逗号分隔的多个声部**。

---

## 八、错误处理模板

```js
function request(path, { method = 'GET', data, auth = true } = {}) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://zzzrrll.xin/api' + path,
      method,
      data,
      header: {
        'Content-Type': 'application/json',
        ...(auth && wx.getStorageSync('token')
          ? { Authorization: 'Bearer ' + wx.getStorageSync('token') } : {})
      },
      success: res => {
        if (res.statusCode === 401) {
          wx.removeStorageSync('token');
          wx.reLaunch({ url: '/pages/login/login' });
          return reject(new Error('未登录'));
        }
        if (res.data && res.data.success) resolve(res.data);
        else reject(new Error((res.data && res.data.message) || '请求失败'));
      },
      fail: () => reject(new Error('网络错误，请稍后重试'))
    });
  });
}
```

---

## 九、已知问题 / 注意事项

1. **`GET /api/checkin/history` 的 `checkedAt` 字段不可用**
   后端 `attendance` 表没有「打卡时间」列，接口里写的是 `attendanceId AS checkedAt`，返回的是自增主键而不是时间。
   → 小程序暂时用 `startTime` 显示活动时间；如需真实打卡时间，需要后端加列（见下）。

2. **时区**：见 §1.4，除 `reservations` 的 `date/startTime/endTime` 外，所有 DATETIME 都要 `+8h`。

3. **Cookie 不可用**：必须走 `Authorization: Bearer`。

4. **中文参数**：`roomId`、`name`、`section` 等含中文，拼接 query 时用 `encodeURIComponent`。

5. **权限矩阵（小程序端判断用）**

   | 角色 | 判定 | 能力 |
   |---|---|---|
   | 管理员 | `isManager === 1` | 全部 |
   | 声部长 | `job === 1` | 本声部成员/乐谱增删改 |
   | 琴房负责人 | `job === 2` | 任意增删改琴房预约、查看/改预约密码 |
   | 发展成员 | `job === 3` | 仅「琴房预约 + 个人信息」；预约需四位密码 |
   | 普通成员 | 其它 | 只读 + 预约琴房 |

6. **发展成员首页**：登录/注册应走 `register-dev`，登录后只给两个 tab（琴房预约、我的）。
