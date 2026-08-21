# 乐团管理平台 API 接口文档

本文档供外部程序（如微信小程序、第三方系统）对接使用，包含**平台功能总览、数据表结构、全部 API 说明**。

- 服务地址：`http://<服务器IP>:3000`（生产环境经 Nginx 反代到 `http://<服务器IP>/`，所有 API 统一前缀 `/api`）
- 数据格式：JSON
- 字符编码：UTF-8

---

## 一、平台功能总览

| 模块 | 功能 | 面向角色 |
|---|---|---|
| 登录注册 | 账号注册、登录、退出 | 所有人 |
| 成员管理 | 团员档案增删改查、数据大屏统计 | 查看：所有人；增删改：管理员/声部长（本声部） |
| 文章管理 | 发布排练通知、演出通知、乐团新闻（含图片/附件/打卡地点） | 仅管理员 |
| 出勤管理 | 报名/签到记录管理、统计大屏、Excel 导出、声部明细 | 查看：所有人；增删：管理员/声部长（本声部） |
| 活动打卡 | 基于地理位置（10 米内）现场打卡 | 所有人 |
| 活动报名 | 报名/取消报名、我的报名列表 | 所有人 |
| 琴房预约 | 琴房列表、按周查看课表、创建/修改/取消预约 | 所有人（非管理员仅操作自己的预约） |
| 乐谱管理 | 乐谱上传/替换/删除/下载（PDF） | 查看下载：所有人；上传删除：管理员/声部长（本声部分谱） |
| 后勤管理 | 物品登记（含图片）、查询 | 所有登录用户可管理 |
| 地理编码 | 地名 → 经纬度搜索（OpenStreetMap Nominatim） | 所有人 |
| 个人信息 | 查看/修改资料、上传头像 | 本人 |

---

## 二、通用约定

### 2.1 认证方式
采用 **JWT**，支持两种传递方式（二选一即可）：

**方式 A：`Authorization` 请求头（推荐小程序/外部程序使用）**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**方式 B：Cookie（浏览器使用）**
```
Cookie: token=eyJhbGciOiJIUzI1NiIs...
```

登录/注册成功后，服务端会同时：① 在响应体返回 `token` 字段；② 通过 `Set-Cookie` 下发 token（`httpOnly:false`，有效期 7 天）。

> **注意（微信小程序）**：微信小程序真机无法携带 Cookie，请使用**方式 A**——登录后取响应体里的 `token`，每次请求放在 `header: { Authorization: 'Bearer ' + token }` 即可。

### 2.2 响应格式
- 成功：`{ "success": true, "data": ..., "message": "..." }`
- 失败：`{ "success": false, "message": "错误说明" }`
- 列表类接口：`{ "success": true, "data": [...], "total": 100, "page": 1, "limit": 20 }`

### 2.3 HTTP 状态码
| 状态码 | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 参数错误 |
| 401 | 未登录 / 登录过期 |
| 403 | 无权限（角色不符 / 声部长越权） |
| 404 | 资源不存在 |
| 409 | 冲突（重复报名、时间被占等） |

### 2.4 角色与权限
| 角色 | 判定字段 |
|---|---|
| 管理员 | `persons.isManager = 1` |
| 声部长 | `persons.job = 1` |
| 学生指挥 | `persons.managerJob = 6` |
| 普通成员 | 其他 |

### 2.5 分页参数
列表接口通用 `page`（页码，默认 1）与 `limit`（每页条数，各接口默认值不同）。

---

## 三、数据表结构

数据库：`orchestra`（MySQL 8，utf8mb4）

### 3.1 persons — 成员档案
| 字段 | 类型 | 说明 |
|---|---|---|
| personalId | VARCHAR(64) PK | 用户ID |
| account | VARCHAR(64) UNIQUE | 登录账号 |
| password | VARCHAR(255) | 登录密码（bcrypt 加密） |
| name | VARCHAR(100) | 姓名 |
| gender | TINYINT | 0=女 1=男 |
| institute | VARCHAR(128) | 学院 |
| grade | VARCHAR(32) | 年级 |
| campus | TINYINT | 0=中关村 1=玉泉路 3=雁栖湖 4=京内其他 5=京外其他 |
| section | TINYINT | 0=民族管乐 1=弹拨一组 2=弹拨二组 3=胡琴 4=提琴 5=西洋木管 6=西洋铜管 7=低音 8=钢琴 9=打击 10=无声部 |
| job | TINYINT | 0=普通成员 1=声部长 |
| isManager | TINYINT | 0=否 1=是（管理员） |
| managerJob | TINYINT | 0=普通干事 1=团长 2=业务副团长 3=人事副团长 4=后勤组长 5=宣传组长 6=学生指挥 7=指挥助理 8=指挥 |
| instrument | VARCHAR(256) | 乐器（分号分隔） |
| isMaster | TINYINT | 0=否 1=声部首席 |
| avatarhash | VARCHAR(255) | 头像文件 SHA256 |
| isOrchestraMember | TINYINT | 0=非乐团成员 1=乐团成员 |

### 3.2 articles — 文章（通知/新闻/活动）
| 字段 | 类型 | 说明 |
|---|---|---|
| articleId | INT PK AUTO | 文章ID |
| type | TINYINT | 0=排练通知 1=演出通知 2=乐团新闻 |
| title | VARCHAR(200) | 标题 |
| content | TEXT | 正文 |
| startTime / endTime | DATETIME | 活动起止时间 |
| images | TEXT | 图片文件名（逗号分隔） |
| attachments | TEXT | 附件 JSON `[{name,filename,size}]` |
| createdAt / updatedAt | DATETIME | 创建/更新时间 |
| location | VARCHAR(255) | 打卡地点坐标「纬度,经度」 |

### 3.3 events — 活动（旧表，与 articles 并存）
| 字段 | 类型 | 说明 |
|---|---|---|
| eventId | VARCHAR(64) PK | 活动ID |
| year / month / date | SMALLINT/TINYINT | 日期 |
| startTime / endTime | DATETIME | 起止时间 |
| title | VARCHAR(200) | 标题 |
| appendix | TEXT | 备注 |
| location | VARCHAR(255) | 打卡地点「纬度,经度」 |

### 3.4 attendance — 出勤/报名记录
| 字段 | 类型 | 说明 |
|---|---|---|
| attendanceId | INT PK AUTO | 记录ID |
| personalId | VARCHAR(64) FK | 成员 |
| eventId | VARCHAR(64) FK | 活动（支持 `ARTICLE_数字` 或 events.eventId） |
| title | VARCHAR(200) | 活动标题快照 |
| method | TINYINT | 0=报名 1=打卡/参加 |

唯一键 `(personalId, eventId)`：同一人同一活动只有一条记录。

### 3.5 scores — 乐谱
| 字段 | 类型 | 说明 |
|---|---|---|
| scoreId | INT PK AUTO | 乐谱ID |
| title | VARCHAR(200) | 乐谱名 |
| isTotal | TINYINT | 0=分谱 1=总谱 |
| section | VARCHAR(64) | 所属声部（字符串，如「民族管乐声部」） |
| filehash | VARCHAR(255) UNIQUE | PDF 文件哈希 |

### 3.6 logistics — 后勤物品
| 字段 | 类型 | 说明 |
|---|---|---|
| itemId | VARCHAR(64) PK | 物品ID |
| name | VARCHAR(200) | 物品名 |
| campus | VARCHAR(64) | 校区 |
| address | VARCHAR(255) | 位置 |
| imagehash | VARCHAR(255) | 图片文件哈希 |
| isPublic | TINYINT | 0=私有 1=公用 |
| belongsToId | VARCHAR(64) FK | 所属人 personalId（私有时） |

### 3.7 rooms — 琴房
| 字段 | 类型 | 说明 |
|---|---|---|
| roomId | VARCHAR(64) PK | 琴房ID（校区名，如「玉泉路琴房」） |
| campus | VARCHAR(64) | 校区 |
| name | VARCHAR(100) | 琴房名 |
| description | VARCHAR(255) | 描述 |

内置 3 间：玉泉路琴房 / 雁栖湖琴房 / 奥运村琴房。

### 3.8 reservations — 琴房预约
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT PK AUTO | 预约ID |
| roomId | VARCHAR(64) FK | 琴房 |
| bookerId | VARCHAR(64) FK | 主预约人 |
| date | DATE | 预约日期 |
| startTime / endTime | TIME | 起止时间（07:00–22:30） |
| participants | JSON | 参与人 personalId 数组（含主预约人，≤6 人） |
| createdAt | DATETIME | 创建时间 |

### 3.9 rehearsal_records — 排练记录
| 字段 | 类型 | 说明 |
|---|---|---|
| id | INT UNSIGNED PK AUTO | 记录ID |
| eventId | VARCHAR(64) NOT NULL | 关联的活动/文章（`ARTICLE_x` 或 events.eventId） |
| eventTitle | VARCHAR(200) | 活动标题（创建时自动从活动带出） |
| recordDate | DATE | 排练日期（创建时自动取活动开始日期） |
| content | TEXT NOT NULL | 排练要点内容 |
| createdBy | VARCHAR(64) | 记录人 personalId |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

索引：`idx_event(eventId)`、`idx_date(recordDate)`。仅学生指挥（`managerJob=6`）可读写，可编辑/删除任意记录。

---

## 四、API 详细说明

### 4.1 认证 `/api/auth`

**POST /api/auth/register** — 注册
```json
{ "account":"test","password":"123456","name":"张三","gender":1,
  "institute":"软件所","grade":"博一","campus":0,"section":3,
  "job":0,"isManager":0,"managerJob":0,"instrument":"二胡","isMaster":0 }
```
成功：`201 { success:true, personalId, name, token }`

**POST /api/auth/login** — 登录
```json
{ "account":"test","password":"123456" }
```
成功：`{ success:true, name, token }`（token 同时写入 Cookie 与响应体，小程序等外部程序可直接取 `token` 字段）

**GET /api/auth/me** — 当前登录用户的**完整个人信息**（不含密码）
```json
{ "success":true, "data":{
  "personalId":"...","account":"...","name":"...","gender":1,
  "institute":"软件所","grade":"博一","campus":0,"section":3,
  "job":0,"isManager":0,"managerJob":0,"instrument":"二胡",
  "isMaster":0,"avatarhash":null,"isOrchestraMember":1 } }
```

**POST /api/auth/logout** — 退出（清除 cookie）

**POST /api/auth/avatar** — 上传头像（multipart/form-data，字段 `avatar`，jpg/png/gif/webp ≤5MB）

**GET /api/auth/avatar** — 获取**当前登录用户**自己的头像（图片流，需带登录 Cookie；无头像返回 404）

**GET /api/persons/:personalId/avatar** — 按 personalId 获取**任意用户**的头像（**公开，无需登录**，供小程序/外部程序在成员列表中展示头像；无头像返回 404）

**PUT /api/auth/profile** — 修改个人信息（本人，可含 name/gender/institute/grade/campus/section/job/instrument 等字段）

---

### 4.2 成员 `/api/persons`

**GET /api/persons** — 列表
参数：`name`(模糊) `section` `campus` `isManager` `isMaster` `page` `limit`(默认50)

**GET /api/persons/stats** — 统计（总数/男女/声部/校区分布，供大屏）

**GET /api/persons/search?q=姓名或ID** — 搜索（用于预约参与者选择），返回 `[{personalId,name,isOrchestraMember}]`

**GET /api/persons/:personalId** — 单个详情

**POST /api/persons** — 新增（管理员任意；声部长仅本声部；普通成员 403）
```json
{ "name":"李四","gender":0,"campus":0,"section":3,"job":0,... }
```

**PUT /api/persons/:personalId** — 更新（管理员任意；声部长仅本声部成员且不可转调其他声部）

**DELETE /api/persons/:personalId** — 删除（管理员任意；声部长仅本声部）

---

### 4.3 文章 `/api/articles`（增删改仅管理员）

**GET /api/articles** — 列表
参数：`type`(0/1/2) `title` `dateFrom` `dateTo` `page` `limit`(默认20)

**GET /api/articles/latest** — 各类型最新一条，返回 `{ data:{ 0:..., 1:..., 2:... } }`

**GET /api/articles/:id** — 详情

**POST /api/articles** — 新增（管理员）
```json
{ "type":0,"title":"排练通知","content":"...","startTime":"2026-08-01T19:00",
  "endTime":"2026-08-01T21:00","location":"39.9,116.3" }
```
`type=0/1` 为活动（可设起止时间与打卡地点），`type=2` 为新闻。

**PUT /api/articles/:id** — 更新（管理员）
**DELETE /api/articles/:id** — 删除（管理员）
**POST /api/articles/upload-image** — 上传图片（multipart，字段 `image`，≤10MB），返回 `{url}`
**POST /api/articles/upload-file** — 上传附件（multipart，字段 `file`，≤50MB），返回 `{filename,originalName,size,url}`

---

### 4.4 出勤 `/api/attendance`

**GET /api/attendance** — 列表
参数：`personalId` `eventId`(纯数字自动转 `ARTICLE_` 前缀) `page` `limit`(默认100)
返回含 `personName`、`personSection`、`eventTitle`。

**POST /api/attendance/lookup** — 按姓名/活动名查找确认
```json
{ "personName":"张三","eventTitle":"排练" }
```
返回 `{ person, event, personOptions, eventOptions }`

**POST /api/attendance** — 新增签到（管理员任意；声部长仅本声部成员；普通成员 403）
```json
{ "personalId":"...","eventId":"ARTICLE_120","title":"活动名","method":0 }
```
`method`：0=报名 1=参加。

**DELETE /api/attendance/:attendanceId** — 删除记录（管理员任意；声部长仅本声部）

**GET /api/attendance/activities** — 可用于统计的活动列表（articles type0/1 + events 合并，按开始时间倒序，取前100）

**GET /api/attendance/dashboard** — 大屏统计
参数：`type`(signup/checkin) `activityId`(可选) `dateFrom` `dateTo`
- 指定活动 → `scope:"activity"`，返回 `{activity,total,sections,members}`
- 不指定活动（时间段）→ `scope:"range"`，返回 `{activityCount,totalTimes,avgPerActivity,sections,top,members}`
- `members` 为全体成员按次数降序明细（含 0 次），`top` 为参与成员前 20（连续名次）

**GET /api/attendance/section-detail** — 声部明细（管理员任意声部；声部长仅本声部；普通成员 403）
参数：`section` `activityId`(可选) `dateFrom` `dateTo`
返回 `{section,sectionName,totalMembers,mode,members:[{rank,personalId,name,signup,checkin}]}`

**GET /api/attendance/export** — 导出 Excel（.xlsx）
参数：`type` `activityId`(可选) `dateFrom` `dateTo`
返回文件流，内容为全体成员 `排名/姓名/用户ID/声部/次数` 降序表。

---

### 4.5 乐谱 `/api/scores`

**GET /api/scores** — 列表
参数：`title` `section` `isTotal` `page` `limit`(默认50)

**GET /api/scores/:scoreId** — 详情
**GET /api/scores/:scoreId/file** — 下载 PDF（inline 预览）

**POST /api/scores/upload** — 上传（multipart：`file`(PDF≤50MB) `title` `isTotal` `section`）
权限：管理员任意；声部长仅本声部分谱；普通成员 403。

**PUT /api/scores/:scoreId/file** — 替换 PDF（multipart，同上）
**PUT /api/scores/:scoreId** — 更新元信息 `{title,isTotal,section}`
**DELETE /api/scores/:scoreId** — 删除（同步删除文件）

---

### 4.6 后勤 `/api/logistics`（所有登录用户可管理）

**GET /api/logistics** — 列表
参数：`name` `campus` `isPublic` `belongsToId` `page` `limit`(默认50)
返回含 `ownerName`。

**GET /api/logistics/:itemId** — 详情
**GET /api/logistics/:itemId/image** — 图片流

**POST /api/logistics** — 新增
```json
{ "name":"谱架","campus":0,"address":"排练厅","isPublic":1,"belongsToId":null }
```

**POST /api/logistics/upload** — 新增（multipart：`image`(≤20MB) + 各字段）
**PUT /api/logistics/:itemId** — 更新 `{name,campus,address,isPublic,belongsToId}`
**DELETE /api/logistics/:itemId** — 删除（同步删除图片）

---

### 4.7 活动 `/api/events`（旧活动表）

**GET /api/events** — 列表
参数：`page` `limit` `title` `status`(ongoing/ended/upcoming)

**GET /api/events/ongoing** — 进行中且设置了打卡地点的活动（events + articles 合并，用于打卡页）
返回 `[{id,title,startTime,endTime,location,source}]`

**GET /api/events/:id** — 详情
**POST /api/events** — 新增 `{title,startTime,endTime,appendix,location}`
**PUT /api/events/:id** — 更新
**DELETE /api/events/:id** — 删除

---

### 4.8 打卡 `/api/checkin`

**POST /api/checkin** — 活动打卡
```json
{ "eventId":"ARTICLE_120","userLat":39.9,"userLng":116.3 }
```
校验：活动进行中、已设地点、距打卡点 ≤10 米。成功返回 `{distance,eventTitle}`。
已打卡（method=1）返回 409；超出距离返回 403 并附 `distance`。

> **打卡地点（location）容错**：后端解析活动 `location` 时兼容多种格式——纯坐标 `"纬度,经度"`、含历史后缀 `"纬度,经度|地点名"`（取 `|` 前坐标）、以及全角逗号 `"纬度，经度"`。旧数据无需修改即可正常打卡。建议新写入的数据统一存纯坐标 `"纬度,经度"`。

**GET /api/checkin/history** — 当前用户打卡历史（method=1 的记录，含活动时间与地点）

---

### 4.9 报名 `/api/register`

**GET /api/register/next-event** — 下一个可报名的活动（未结束的最近一个排练/演出通知），返回 `{data:{articleId,type,title,content,startTime,endTime,registered}}`；未登录返回 `data:null`。

**POST /api/register/event/:articleId** — 报名（写入 attendance，method=0；重复报名 409）

**GET /api/register/my** — 我的报名列表（含活动类型/时间）

**DELETE /api/register/event/:articleId** — 取消报名（仅未结束活动可取消）

---

### 4.10 琴房 `/api/rooms`

**GET /api/rooms** — 琴房列表
参数：`campus`
**POST /api/rooms** — 新增 `{roomId,campus,name,description}`

---

### 4.11 预约 `/api/reservations`

**GET /api/reservations** — 某琴房某日期范围预约
参数：`roomId`(必填) `dateFrom` `dateTo`
返回 `[{id,roomId,bookerId,date,startTime,endTime,participants:[{personalId,name}],bookerName,createdAt}]`

**POST /api/reservations** — 创建（需登录）
```json
{ "roomId":"玉泉路琴房","date":"2026-08-05","startTime":"10:00","endTime":"11:00",
  "participants":["PMRxxx"] }
```
规则：07:00–22:30、结束>开始、不跨天、≤6 人；主预约人自动加入 participants；冲突返回 409；管理员可无视冲突（覆盖）。

**GET /api/reservations/:id** — 详情
**PUT /api/reservations/:id** — 修改（非管理员仅主预约人；进行中仅可改结束时间）
**DELETE /api/reservations/:id** — 取消（非管理员仅主预约人，已结束不可取消）

---

### 4.12 地理编码 `/api/geocode`

**GET /api/geocode/search?q=地名** — 返回 `{data:[{name,lat,lng,type}]}`（最多8条）

---

### 4.13 健康检查

**GET /api/health** — `{ success:true, message:'Orchestra API is running', time }`（可用于小程序探测服务连通性）

---

### 4.15 乐器徽章 `/api/instruments`（公开，无需登录）

> 目录 `backend/instruments/*.png`（项目根下的 `instruments/`）存放乐器徽章图片。用户上传乐器中文名时，返回对应徽章图片。公开接口，无需登录，适合小程序直接引用。

**GET /api/instruments/badge?name=二胡** — 返回徽章图片（302 重定向到 `/instruments/<规范名>.png`，供 `<img src>` 直接引用）
- 未匹配返回 `404`
```json
// 302 → Location: /instruments/%E8%83%A1%E7%90%B4.png
```

**GET /api/instruments/badge-info?name=二胡** — 返回映射信息 JSON（推荐小程序先查此接口判断是否匹配）
```json
{ "success":true, "matched":true, "input":"二胡", "badge":"胡琴",
  "url":"/instruments/%E8%83%A1%E7%90%B4.png",
  "fullUrl":"/api/instruments/badge?name=%E4%BA%8C%E8%83%A1" }
```
未匹配：`{ "success":false, "matched":false, "input":"未知", "message":"未找到乐器「未知」对应的徽章" }`

**GET /api/instruments/list** — 全部可用规范徽章名列表 `{ success:true, data:["上低音号","中提琴",...] }`

**名称映射规则：**
1. `二胡 / 高胡 / 中胡 / 京胡 / 板胡` → `胡琴`
2. `竹笛 / 曲笛 / 梆笛 / 洞箫 / 萧 / 箫 / 笛子 / 笛` → `笛箫`
3. `大管 / 巴松` → `大管`
4. `高音笙 / 中音笙 / 低音笙` → `笙`
5. 其余名称若与 `instruments/` 目录中某图片同名则直接匹配（如 琵琶/古筝/钢琴/小提琴/唢呐…）；否则 404

**静态图片地址：** `/instruments/<规范名>.png`（如 `/instruments/胡琴.png`），需对中文做 URL 编码。

---

### 4.14 排练记录 `/api/rehearsals`（仅学生指挥 managerJob=6）

> 权限：所有接口仅**学生指挥**（`managerJob=6`）可用；其他角色返回 403，未登录返回 401。支持 Cookie 与 `Authorization: Bearer <token>` 两种认证。

**GET /api/rehearsals** — 排练记录列表（按排练日期倒序）
返回：
```json
{ "success":true, "data":[
  { "id":1, "eventId":"ARTICLE_127", "eventTitle":"暑期合练", "recordDate":"2026-07-20",
    "content":"……", "createdBy":"PMSxxx", "creatorName":"秦雪晴",
    "createdAt":"2026-08-17T11:06:30.000Z", "updatedAt":"2026-08-17T11:06:30.000Z" } ] }
```

**GET /api/rehearsals/events** — 可记录的排练活动（已结束的排练通知/演出，按开始时间倒序，按标题去重，最多100条）
返回：`{ "success":true, "data":[{ "eventId":"ARTICLE_131", "title":"测试打卡", "startTime":"...", "endTime":"..." }] }`

**POST /api/rehearsals** — 为某次排练记录排练要点
请求体：`{ "eventId":"ARTICLE_127", "content":"本次排练要点……" }`
- `eventTitle` 与 `recordDate` 由后端根据活动自动带出；活动不存在返回 404；content 为空返回 400
返回：`{ "success":true, "message":"排练要点已记录", "id":1 }`

**PUT /api/rehearsals/:id** — 编辑排练要点
请求体：`{ "content":"更新后的要点" }`（可选 `eventId` 更换关联活动）；记录不存在返回 404
返回：`{ "success":true, "message":"排练要点已更新" }`

**DELETE /api/rehearsals/:id** — 删除排练要点
返回：`{ "success":true, "message":"已删除" }`；记录不存在返回 404

---

## 五、数据大屏数据 API（供外部大屏 / 小程序展示）

> 除特别注明外均为**公开接口，无需登录**，可直接用 GET 调用，适合投屏大屏、小程序图表等场景。

### 5.1 成员数据大屏

**GET /api/persons/stats**
返回：
```json
{ "success":true, "data":{
  "total": 18,
  "gender": { "male":10, "female":8 },
  "sections": [ { "key":0, "name":"民族管乐", "count":7 } ],
  "campuses": [ { "key":0, "name":"中关村校区", "count":9 } ] } }
```

### 5.2 出勤数据大屏

**GET /api/attendance/activities** — 统计可选的活动列表
返回 `[{ id, title, startTime, endTime }]`（articles type0/1 + events 合并，按开始时间倒序，取前100）

**GET /api/attendance/dashboard** — 核心统计
参数：
- `type`：`signup`=报名（method=0）| `checkin`=出勤/打卡（method=1）
- `activityId`：可选，指定某活动 → 活动模式（`scope=activity`）
- `dateFrom` `dateTo`：可选，不指定活动时按时间段汇总（`scope=range`）

**活动模式**返回：
```json
{ "scope":"activity",
  "activity": { "id":"ARTICLE_120","title":"夏季专场音乐会彩排","startTime":"...","endTime":"..." },
  "total": 11,
  "sections": [ { "name":"民族管乐","count":6,"totalMembers":7,"pct":86 } ],
  "members": [ { "rank":1,"personalId":"PMRxxx","name":"张三","section":"民族管乐","count":1 } ] }
```
**时间段模式**返回：
```json
{ "scope":"range","dateFrom":"2026-07-01","dateTo":"2026-08-01",
  "activityCount":10,"totalTimes":66,"avgPerActivity":6.6,
  "sections": [ { "name":"民族管乐","times":31,"avg":3.1,"totalMembers":7,"pct":44 } ],
  "top": [ { "rank":1,"personalId":"PMRxxx","name":"张三","section":"民族管乐","count":6 } ],
  "members": [ { "rank":2,"personalId":"PMRxxx","name":"李四","section":"胡琴","count":5 } ] }
```
字段说明：`sections`=各声部汇总；`top`=参与成员排行（连续名次，并列同名次不跳号，最多20）；`members`=全体成员按次数降序（含 0 次，供导出/明细用）。

**GET /api/attendance/section-detail** — 声部成员明细（**需登录**：管理员任意声部，声部长仅本声部，普通成员 403）
参数：`section` `activityId`(可选) `dateFrom` `dateTo`
返回 `{ section, sectionName, totalMembers, mode, members:[{rank,personalId,name,signup,checkin}] }`
（signup/checkin：活动模式为 1/0，时间段模式为次数）

**GET /api/attendance/export** — 导出 Excel（.xlsx 文件流，公开）
参数：`type` `activityId`(可选) `dateFrom` `dateTo`
内容：全体成员 `排名/姓名/用户ID/声部/次数` 按次数降序（活动模式含未参加者=0，时间段模式含0次成员）。

---

## 六、外部程序对接示例（伪代码）

```
1. 登录拿 token（Cookie 与 Bearer 均可）：
   POST /api/auth/login  {"account":"test","password":"123456"}
   → 响应体直接返回 token，保存后可用作 Bearer

2. 查询进行中活动：
   GET /api/events/ongoing   (带 Cookie: token=... 或 Authorization: Bearer <token>)

3. 打卡：
   POST /api/checkin  {"eventId":"ARTICLE_120","userLat":39.9,"userLng":116.3}

4. 我的打卡历史：
   GET /api/checkin/history

5. 排练记录（学生指挥）：
   查看已结束的排练：  GET  /api/rehearsals/events   (Bearer)
   记录排练要点：      POST /api/rehearsals  {"eventId":"ARTICLE_120","content":"要点……"}   (Bearer)
   查看记录列表：      GET  /api/rehearsals          (Bearer)
   编辑要点：          PUT  /api/rehearsals/1  {"content":"更新后要点"}   (Bearer)
   删除要点：          DELETE /api/rehearsals/1      (Bearer)
```

> 注意：所有写操作与个人数据接口都需要携带登录凭证（Cookie 或 `Authorization: Bearer <token>`）；未登录统一返回 401，无权限返回 403。
