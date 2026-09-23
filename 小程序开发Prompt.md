# 微信小程序开发 Prompt（可直接复制给 AI 用）

> 配套文档：`小程序API文档.md`（接口细节）、`API文档.md`（后台全量接口）
>
> **使用方法**：把「① 通用约束」+ 你需要的那个 Prompt 一起发给 AI。
> 建议先把 `小程序API文档.md` 作为附件/上下文一起提供，效果最好。

---

## ① 通用约束（每次都要带上）

```text
【项目背景】
这是「国科大民族管弦乐团管理平台」的微信小程序，对接已有的 Node/Express + MySQL 后端。
后端已完成，不要修改后端代码，只写小程序端。

【后端信息】
- Base URL: https://zzzrrll.xin    接口前缀: /api
- 必须使用 HTTPS；请提示我在微信公众平台配置 request / downloadFile / uploadFile 合法域名
- 响应统一格式: { success: boolean, data?: any, message?: string, total?: number }
- 认证: 小程序无法用 Cookie，必须用请求头 Authorization: Bearer <token>
  - token 由 POST /api/auth/login 返回，7 天有效，存 wx.setStorageSync('token', ...)
  - 任何请求返回 401 → 清除 token 并 reLaunch 到登录页

【⚠️ 时间字段的坑（务必遵守）】
后端把 DATETIME 序列化成 UTC ISO 字符串，比北京时间少 8 小时。
所有时间显示必须统一走这个函数，禁止直接用 new Date(v).toLocaleString()：
  function fmtCN(v) { /* +8h 后按 UTC 格式化，见 小程序API文档.md §1.4 */ }
例外：GET /api/reservations 的 date("YYYY-MM-DD") 和 startTime/endTime("HH:mm") 已是本地字符串，不要再加 8 小时。

【领域常量】
job: 0=普通成员 1=声部长 2=琴房负责人 3=发展成员
section: ['民族管乐声部','弹拨一组','弹拨二组','胡琴声部','提琴声部','西洋木管声部','西洋铜管声部','低音声部','钢琴声部','打击声部','无声部']
campus: {0:'中关村校区',1:'玉泉路校区',3:'雁栖湖校区',4:'京内其他地区',5:'京外其他地区'}
文章类型: 0=排练通知 1=演出通知 2=乐团新闻

【代码要求】
- 微信原生小程序（WXML/WXSS/JS），不要用 uni-app / Taro，除非我另说
- 封装统一的 request(path, {method, data, auth}) 工具（见 小程序API文档.md §8），带 401 处理、loading、错误 toast
- 头像统一用 https://zzzrrll.xin/api/persons/{personalId}/avatar（公开接口，无头像返回 404，请在 binderror 里换默认图）
- 乐器徽章用 GET /api/instruments/badges?name=A&name=B 批量获取，禁止逐行请求
- 列表页要做分页 + 下拉刷新 + 上拉加载更多
- 代码加中文注释，变量命名清晰

【输出方式】
- 按「文件路径 + 完整代码」逐个给出，可直接覆盖创建
- 最后给出 app.json / project.config.json 和需要我在微信后台配置的项
```

---

## ② Prompt A：从零做一版完整小程序

```text
请按上面的【通用约束】，从零实现一个「乐团助手」微信小程序。

【页面结构】
tabBar 4 个：
1. 首页（通知）  2. 琴房预约  3. 活动  4. 我的

【页面明细】

A. pages/login/login —— 登录 / 注册
   - 登录：POST /api/auth/login → 存 token → reLaunch 到首页
   - 注册（正式成员）：POST /api/auth/register，字段：账号、密码、真实姓名、性别、学院、年级、校区、乐器
   - 「忘记密码 / 重置密码」入口：POST /api/auth/forgot（账号 + 真实姓名 + 新密码）
   - 底部小字入口「🌱 发展成员入口」→ 跳 pages/dev/dev

B. pages/dev/dev —— 发展成员入口
   - 三个视图：登录 / 注册 / 修改密码
   - 登录走 POST /api/auth/login，成功后调 GET /api/auth/me 检查 job===3，
     不是发展成员就提示「请使用正式成员入口登录」并退出
   - 注册走 POST /api/auth/register-dev（只有：账号、密码、姓名、性别、学院、年级、校区、乐器，没有职位/管理人员）
   - 发展成员登录后 tabBar 只显示「琴房预约」和「我的」两个 tab，其余隐藏

C. pages/home/home —— 首页
   - GET /api/articles/latest 渲染三栏卡片（排练通知 / 演出通知 / 乐团新闻），点击进详情
   - GET /api/events/ongoing 显示进行中的活动（可能为空数组）
   - 走马灯或列表展示最新通知

D. pages/article/detail?id= —— 文章详情
   - GET /api/articles/:id，content 是 HTML → 用 rich-text 渲染
   - images 是逗号分隔文件名 → 拼 https://zzzrrll.xin/uploads/articles/{文件名}，可点击预览（wx.previewImage）
   - 底部按钮：报名（POST /api/register/event/:articleId）/ 取消报名（DELETE）

E. pages/rooms/rooms —— 琴房预约（重点）
   - GET /api/rooms 拿琴房列表（选择器）
   - 按周展示课表：GET /api/reservations?roomId=&dateFrom=&dateTo=
     建议用「周切换 + 每日列表」而不是画完整时间轴网格，移动端更好用
   - 点空白处「＋ 预约」→ 填写日期/起止时间/参与人
   - 参与人搜索：GET /api/persons/search?q=，最多 6 人（含自己）
   - ⚠️ 当前用户 job===3（发展成员）时，表单必须多一个「🔑 预约密码（4 位数字）」输入框，
     把值作为 roomPassword 一起 POST；密码错误时后端返回 message「预约密码错误，请联系琴房负责人获得预约密码」，
     直接 toast 出来，并提示「请联系琴房负责人获得预约密码」
   - 正式成员（job 0/1/2）与管理员不需要密码，不要显示该输入框
   - 点自己的预约可修改（PUT）/ 取消（DELETE）；管理员、琴房负责人可操作任何人的预约

F. pages/activity/activity —— 活动
   - 三个 tab：可报名活动 / 我的报名 / 打卡历史
   - 可报名：GET /api/register/next-event（null 时显示空状态）
   - 我的报名：GET /api/register/my，method=0 已报名未打卡、method=1 已打卡
   - 打卡：wx.getLocation({type:'gcj02'}) 拿经纬度 → POST /api/checkin {eventId, userLat, userLng}
     需要在 app.json 声明 permission.scope.userLocation
     失败时把后端 message 原样提示（例如「距离活动地点太远…」）
   - 打卡历史：GET /api/checkin/history?limit=20，用 startTime 显示时间
     ⚠️ 不要使用 checkedAt 字段（后端目前返回的是 attendanceId，不是时间）

G. pages/profile/profile —— 我的
   - GET /api/auth/me + GET /api/persons/:personalId
   - 展示：头像、姓名、性别、用户ID、账号、学院、年级、校区、声部、职位、乐器徽章
   - ⚠️ 如果 job===3（发展成员），不显示「管理人员 / 管理职责 / 声部首席」三行
   - 乐器徽章：POST 不了就用 GET /api/instruments/badge-info?name=<instrument>，
     把 instrument 按「；;，,、" "」拆成多段逐个 badge，或者直接调
     GET /api/instruments/badges?name=<instrument> 拿 badges[] + urls[]，再拼 https://zzzrrll.xin{url}
   - 编辑资料：PUT /api/auth/profile（姓名/性别/学院/年级/校区/声部/乐器）
     非管理员不要显示职位、管理人员、管理职责、声部首席（后端也会忽略）
   - 换头像：wx.chooseMedia → POST /api/auth/avatar（wx.uploadFile，字段名 avatar）
   - 修改密码：POST /api/auth/forgot（账号+姓名+新密码）
   - 退出登录：清 token → reLaunch 登录页

H. pages/scores/scores —— 乐谱（可选，放在「我的」里做二级入口）
   - GET /api/scores?title=&section=&page=&limit=
   - 点击：wx.downloadFile → wx.openDocument({fileType:'pdf'})

【交付顺序】
1) 统一 request 工具 + 时间格式化工具 + 常量 2) app.json/app.js 3) 登录/发展成员入口
4) 首页+文章详情 5) 琴房预约 6) 活动+打卡 7) 我的 8) 乐谱
每步给完整文件代码。
```

---

## ③ Prompt B：只改某一处（增量修改模板）

```text
【通用约束】见上文，请遵守。

现在只改一处，不要动其它页面：
【要改的页面/文件】pages/rooms/rooms
【现状】...
【期望】...
【接口】...（贴 小程序API文档.md 里对应片段）
【验收标准】
- ...
- ...
请只输出被修改文件的**完整代码**（方便我整文件替换），并说明改了哪些地方。
```

### B-1 例：给琴房预约加上「琴房负责人」的密码管理

```text
在 pages/rooms/rooms 里增加：如果当前用户 job===2（琴房负责人）或 isManager===1，
页面顶部显示一张卡片「🔑 您设置的预约密码为：XXXX」+ 一个【修改预约密码】按钮。

- 进页面时调 GET /api/reservations/password 拿密码（403 就整块隐藏，不报错）
- 点按钮弹输入框，限制只能输入 4 位数字（input type="number" maxlength="4"，并过滤非数字）
- 提交 PUT /api/reservations/password { password }
- 前端也要校验 /^\d{4}$/，不合法提示「预约密码必须是 4 位数字」
- 成功后原地更新卡片上的数字 + toast「预约密码已更新」
只输出 rooms.js / rooms.wxml / rooms.wxss 的完整代码。
```

### B-2 例：发展成员的 tabBar 限制

```text
发展成员（job===3）登录后只能看到「琴房预约」和「我的」两个 tab。

注意：微信小程序的 tabBar 是静态配置，不能动态增删。
请用以下方案实现：
1) app.json 里 tabBar 保留全部 4 个 tab
2) 在 app.js 的 onLaunch / 每个 tab 页的 onShow 里，读取全局 me（GET /api/auth/me）
   如果是 job===3，就用 wx.hideTabBarRedDot / 自定义 tabBar 的方式只显示两个
   如果嫌自定义 tabBar 太重，就改成：非发展成员的 tab 在点击时
   wx.showToast('该功能仅对正式成员开放') 并 wx.switchTab 回琴房页
3) 同时在每个「非允许页面」的 onLoad 里做拦截，job===3 就 wx.reLaunch 到琴房页

请给出 app.js / 自定义 tabBar（如果采用）/ 各页面拦截的完整代码，
并说明哪种方案在你的实现里更好、为什么。
```

---

## ④ Prompt C：只做接口层（不动 UI）

```text
请按 小程序API文档.md，在 utils/api.js 里实现一个完整、类型清晰的接口封装层，
覆盖：认证、个人信息、头像、通知文章、报名、打卡、琴房（含预约密码）、成员、乐器徽章、乐谱。

要求：
1) 底层一个 request(path, {method, data, auth})，统一处理：
   - 自动加 Base URL 和 Authorization: Bearer token
   - 401 → 清 token + reLaunch 登录页
   - success===false → reject 一个带 message 的 Error
   - 可选 showLoading
2) 上层按模块导出语义化方法，例如：
   api.login(account, password)
   api.getMe()
   api.getRooms()
   api.getReservations(roomId, dateFrom, dateTo)
   api.createReservation({roomId, date, startTime, endTime, participants, roomPassword})
   api.getReservationPassword()
   api.setReservationPassword(pwd)
   api.getInstrumentBadges(instrumentList)   // 内部转成重复的 name 参数
   api.checkin(eventId, lat, lng)
   ...（其余按文档补全）
3) 每个方法写清 JSDoc（参数含义、返回结构）
4) 额外导出时间工具 fmtCN(v)（+8h）和领域常量 JOB / SECTION / CAMPUS / ARTICLE_TYPE
5) 不要写任何 UI 代码

只输出 utils/api.js、utils/format.js、utils/constants.js 的完整代码。
```

---

## ⑤ 小贴士

- **先让 AI 读文档**：把 `小程序API文档.md` 一起贴进去，比口头描述准确得多。
- **一次只改一个页面**：用 Prompt B 的模板，避免 AI 顺手改坏别的页面。
- **要求「输出完整文件」**：比起 diff，整文件替换更不容易出错。
- **时区坑务必强调**：不提醒的话 AI 基本一定会用 `toLocaleString()`，时间会显示成早 8 小时。
- **域名配置别忘**：代码写对但没配微信后台的合法域名，真机上所有请求都会失败。
