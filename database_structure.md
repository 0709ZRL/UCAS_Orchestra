# MySQL 数据库结构文档

> 生成时间：2026-08-03（更新）
> 服务器：`iZ0jlcm4t54a5hifk94o7lZ`

---

## 数据库总览

| 数据库名称 | 类型 | 说明 |
|-----------|------|------|
| `orchestra` | 用户数据库 | 乐团在线管理平台 |
| `mysql` | 系统数据库 | MySQL 系统表 |
| `information_schema` | 系统数据库 | 元数据信息 |
| `performance_schema` | 系统数据库 | 性能监控 |
| `sys` | 系统数据库 | 性能分析视图 |

> 以下仅详细列出用户数据库 `orchestra` 的结构，系统数据库为 MySQL 内置标准库。

---

## `orchestra` — 国科大民族管弦乐团管理平台

### 1. `persons` — 个人信息

> 注：`personalId` 由后端系统自动生成，格式为 `P` + 36进制时间戳 + 4位随机数。前端新增时无需传入。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `personalId` | `varchar(64)` | NO | **PRI** | — | 唯一标识符，系统自动生成 |
| `account` | `varchar(64)` | NO | **UNI** | `''` | 登录账号 |
| `password` | `varchar(255)` | NO | — | `''` | 登录密码（bcrypt 加密） |
| `name` | `varchar(100)` | NO | — | — | 姓名 |
| `gender` | `tinyint(1)` | NO | — | `0` | 性别（0=女，1=男） |
| `institute` | `varchar(128)` | YES | — | `NULL` | 学院 |
| `grade` | `varchar(32)` | YES | — | `NULL` | 年级 |
| `campus` | `tinyint` | NO | — | `0` | 校区（0=中关村，1=玉泉路，3=雁栖湖，4=京内其他，5=京外其他） |
| `section` | `tinyint` | NO | — | `0` | 声部（0=民族管乐，1=弹拨一组，2=弹拨二组，3=胡琴，4=提琴，5=西洋木管，6=西洋铜管，7=低音，8=钢琴，9=打击，10=无声部） |
| `job` | `tinyint` | NO | — | `0` | 职位（0=普通成员，1=声部长） |
| `isManager` | `tinyint(1)` | NO | — | `0` | 是否管理人员（0=否，1=是） |
| `managerJob` | `tinyint` | NO | — | `0` | 管理职责（0=普通干事，1=团长，2=业务副团长，3=人事副团长，4=后勤组组长，5=宣传组组长，6=学生指挥，7=指挥助理，8=指挥） |
| `instrument` | `varchar(256)` | YES | — | `NULL` | 乐器/工具，多个用分号分隔 |
| `isMaster` | `tinyint(1)` | NO | — | `0` | 声部首席（0=否，1=是） |
| `avatarhash` | `varchar(255)` | YES | — | `NULL` | 头像文件 SHA256 哈希 |
| `isOrchestraMember` | `tinyint(1)` | NO | — | `1` | 是否乐团成员（0=否，1=是，琴房预约用） |

**索引：**
- 主键：`personalId`
- 唯一键：`UNQ_Persons_Account`（`account`）

**DDL：**
```sql
CREATE TABLE `persons` (
  `personalId` varchar(64) NOT NULL,
  `account` varchar(64) NOT NULL DEFAULT '' COMMENT '登录账号',
  `password` varchar(255) NOT NULL DEFAULT '' COMMENT '登录密码(已加密)',
  `name` varchar(100) NOT NULL,
  `gender` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0=女 1=男',
  `institute` varchar(128) DEFAULT NULL,
  `grade` varchar(32) DEFAULT NULL,
  `campus` tinyint NOT NULL DEFAULT '0' COMMENT '0=中关村 1=玉泉路 3=雁栖湖 4=京内其他 5=京外其他',
  `section` tinyint NOT NULL DEFAULT '0' COMMENT '0=民族管乐 1=弹拨一组 2=弹拨二组 3=胡琴 4=提琴 5=西洋木管 6=西洋铜管 7=低音 8=钢琴 9=打击 10=无声部',
  `job` tinyint NOT NULL DEFAULT '0' COMMENT '0=普通成员 1=声部长',
  `isManager` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0=否 1=是',
  `managerJob` tinyint NOT NULL DEFAULT '0' COMMENT '0=普通干事 1=团长 2=业务副团长 3=人事副团长 4=后勤组长 5=宣传组长 6=学生指挥 7=指挥助理 8=指挥',
  `instrument` varchar(256) DEFAULT NULL COMMENT '多个乐器用分号分隔',
  `isMaster` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0=否 1=是（声部首席）',
  `avatarhash` varchar(255) DEFAULT NULL COMMENT '头像图片SHA256哈希',
  `isOrchestraMember` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0=非乐团成员 1=乐团成员',
  PRIMARY KEY (`personalId`),
  UNIQUE KEY `UNQ_Persons_Account` (`account`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 2. `articles` — 文章（排练通知 / 演出通知 / 乐团新闻）

> 活动类文章（type=0/1）带起止时间与可选打卡地点，支持图片与附件。
> 文章类活动以 `ARTICLE_数字` 作为 eventId 被 `attendance` 引用（打卡、报名均用该 ID）。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `articleId` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `type` | `tinyint` | NO | — | `0` | 分类（0=排练通知，1=演出通知，2=乐团新闻） |
| `title` | `varchar(200)` | NO | — | — | 标题 |
| `content` | `text` | YES | — | `NULL` | 正文 |
| `startTime` | `datetime` | YES | — | `NULL` | 活动开始时间 |
| `endTime` | `datetime` | YES | — | `NULL` | 活动结束时间 |
| `images` | `text` | YES | — | `NULL` | 图片文件名（逗号分隔） |
| `attachments` | `text` | YES | — | `NULL` | 附件 JSON `[{name,filename,size}]` |
| `createdAt` | `datetime` | NO | — | 当前时间 | 创建时间 |
| `updatedAt` | `datetime` | NO | — | 当前时间 | 更新时间（自动更新） |
| `location` | `varchar(255)` | YES | — | `NULL` | 打卡地点坐标（格式：纬度,经度） |

**索引：**
- 主键：`articleId`
- 普通键：`idx_type`（`type`）、`idx_created`（`createdAt`）

**DDL：**
```sql
CREATE TABLE `articles` (
  `articleId` int unsigned NOT NULL AUTO_INCREMENT,
  `type` tinyint NOT NULL DEFAULT '0' COMMENT '0=排练通知 1=演出通知 2=乐团新闻',
  `title` varchar(200) NOT NULL,
  `content` text,
  `startTime` datetime DEFAULT NULL COMMENT '活动开始时间',
  `endTime` datetime DEFAULT NULL COMMENT '活动结束时间',
  `images` text COMMENT '图片文件名(逗号分隔)',
  `attachments` text COMMENT '附件JSON [{name,filename,size}]',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `location` varchar(255) DEFAULT NULL COMMENT '打卡地点坐标（格式：纬度,经度）',
  PRIMARY KEY (`articleId`),
  KEY `idx_type` (`type`),
  KEY `idx_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 3. `events` — 活动信息

> 注：`eventId` 由后端自动生成（格式 `E` + 36进制时间戳 + 4位随机数）。  
> 新增时 `startTime` 默认当前时间，`endTime` 默认当前时间 +3小时，标题默认"乐团活动"。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `eventId` | `varchar(64)` | NO | **PRI** | — | 唯一标识符，系统自动生成 |
| `year` | `smallint` | NO | — | — | 年（从 startTime 自动提取） |
| `month` | `tinyint` | NO | — | — | 月（从 startTime 自动提取） |
| `date` | `tinyint` | NO | — | — | 日（从 startTime 自动提取） |
| `startTime` | `datetime` | YES | — | `NULL` | 起始时间（年月日时分） |
| `endTime` | `datetime` | YES | — | `NULL` | 结束时间（年月日时分） |
| `title` | `varchar(200)` | YES | — | `'乐团活动'` | 标题 |
| `appendix` | `text` | YES | — | `NULL` | 备注 |
| `location` | `varchar(255)` | YES | — | `NULL` | 打卡地点坐标（格式：纬度,经度） |

**索引：**
- 主键：`eventId`

**DDL：**
```sql
CREATE TABLE `events` (
  `eventId` varchar(64) NOT NULL,
  `year` smallint NOT NULL,
  `month` tinyint NOT NULL,
  `date` tinyint NOT NULL,
  `startTime` datetime DEFAULT NULL,
  `endTime` datetime DEFAULT NULL,
  `title` varchar(200) DEFAULT '乐团活动',
  `appendix` text,
  `location` varchar(255) DEFAULT NULL COMMENT '打卡地点坐标（格式：纬度,经度）',
  PRIMARY KEY (`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 4. `attendance` — 出勤信息

> 用户通过姓名和活动名搜索，系统自动匹配 ID；支持报名/参加两种方式。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `attendanceId` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `personalId` | `varchar(64)` | NO | **MUL** | — | 用户ID（外键→`persons`） |
| `eventId` | `varchar(64)` | NO | **MUL** | — | 活动ID（外键→`events`） |
| `title` | `varchar(200)` | YES | — | `NULL` | 标题 |
| `method` | `tinyint(1)` | NO | — | `0` | 参加方式（0=报名，1=参加） |

**索引：**
- 主键：`attendanceId`
- 唯一键：`UNQ_Attendance_Personal_Event`（`personalId`, `eventId`）
- 普通键：`FK_Attendance_Personal`（`personalId`）
- 普通键：`FK_Attendance_Event`（`eventId`）

**外键约束：**
| 约束名 | 字段 | 引用 | 删除规则 | 更新规则 |
|--------|------|------|----------|----------|
| `FK_Attendance_Person` | `personalId` | `persons(personalId)` | CASCADE | CASCADE |
| `FK_Attendance_Event` | `eventId` | `events(eventId)` | CASCADE | CASCADE |

**DDL：**
```sql
CREATE TABLE `attendance` (
  `attendanceId` int unsigned NOT NULL AUTO_INCREMENT,
  `personalId` varchar(64) NOT NULL,
  `eventId` varchar(64) NOT NULL,
  `title` varchar(200) DEFAULT NULL,
  `method` tinyint(1) NOT NULL DEFAULT '0' COMMENT '0=报名 1=参加',
  PRIMARY KEY (`attendanceId`),
  UNIQUE KEY `UNQ_Attendance_Personal_Event` (`personalId`,`eventId`),
  KEY `FK_Attendance_Personal` (`personalId`),
  KEY `FK_Attendance_Event` (`eventId`),
  CONSTRAINT `FK_Attendance_Event` FOREIGN KEY (`eventId`) REFERENCES `events` (`eventId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_Attendance_Person` FOREIGN KEY (`personalId`) REFERENCES `persons` (`personalId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 5. `scores` — 乐谱信息

> 用户通过上传 PDF 文件添加乐谱，后端自动计算 SHA256 哈希存入 `filehash` 字段，原始文件以哈希值命名存储在 `uploads/scores/` 目录下。  
> 前端支持在线预览 PDF 和下载。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `scoreId` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `title` | `varchar(200)` | NO | **MUL** | — | 乐谱名 |
| `isTotal` | `tinyint(1)` | NO | — | `0` | 是否为总谱（1=是，0=否） |
| `section` | `varchar(64)` | NO | — | `''` | 所属声部（分谱使用） |
| `filehash` | `varchar(255)` | NO | **UNI** | — | 文件 SHA256 哈希（后端自动计算） |

**索引：**
- 主键：`scoreId`
- 唯一键：`UNQ_Scores_Filehash`（`filehash`）
- 唯一键：`UNQ_Scores_Title_Type_Section`（`title`, `isTotal`, `section`）— 同一名称、同类型、同声部不重复

**DDL：**
```sql
CREATE TABLE `scores` (
  `scoreId` int unsigned NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `isTotal` tinyint(1) NOT NULL DEFAULT '0',
  `section` varchar(64) NOT NULL DEFAULT '',
  `filehash` varchar(255) NOT NULL,
  PRIMARY KEY (`scoreId`),
  UNIQUE KEY `UNQ_Scores_Filehash` (`filehash`),
  UNIQUE KEY `UNQ_Scores_Title_Type_Section` (`title`,`isTotal`,`section`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 6. `logistics` — 后勤信息

> 支持上传图片（jpg/png/gif/webp），后端自动计算 SHA256 哈希存入 `imagehash` 字段。  
> `itemId` 由后端自动生成（格式 `I` + 36进制时间戳 + 4位随机数）。  
> 前端列表显示缩略图，点击可查看原图。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `itemId` | `varchar(64)` | NO | **PRI** | — | 唯一标识符，物品ID |
| `name` | `varchar(200)` | NO | — | — | 物品名 |
| `campus` | `varchar(64)` | YES | — | `NULL` | 所在校区 |
| `address` | `varchar(255)` | YES | — | `NULL` | 具体位置 |
| `imagehash` | `varchar(255)` | YES | — | `NULL` | 图片 SHA256 哈希（后端自动计算） |
| `isPublic` | `tinyint(1)` | NO | — | `0` | 是否为公用（1=公用，0=私有） |
| `belongsToId` | `varchar(64)` | YES | **MUL** | `NULL` | 私有物品所属人ID（外键→`persons`） |

**索引：**
- 主键：`itemId`
- 普通键：`FK_Logistics_Owner`（`belongsToId`）

**外键约束：**
| 约束名 | 字段 | 引用 | 删除规则 | 更新规则 |
|--------|------|------|----------|----------|
| `FK_Logistics_Owner` | `belongsToId` | `persons(personalId)` | SET NULL | CASCADE |

**DDL：**
```sql
CREATE TABLE `logistics` (
  `itemId` varchar(64) NOT NULL,
  `name` varchar(200) NOT NULL,
  `campus` varchar(64) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `imagehash` varchar(255) DEFAULT NULL COMMENT '图片文件SHA256哈希',
  `isPublic` tinyint(1) NOT NULL DEFAULT '0',
  `belongsToId` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`itemId`),
  KEY `FK_Logistics_Owner` (`belongsToId`),
  CONSTRAINT `FK_Logistics_Owner` FOREIGN KEY (`belongsToId`) REFERENCES `persons` (`personalId`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 7. `rooms` — 琴房

> 每校区一间琴房（无 A/B/C 细分），`roomId` 直接使用校区名。内置 3 间：玉泉路琴房 / 雁栖湖琴房 / 奥运村琴房。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `roomId` | `varchar(64)` | NO | **PRI** | — | 琴房ID（校区名） |
| `campus` | `varchar(64)` | NO | — | — | 校区 |
| `name` | `varchar(100)` | NO | — | — | 琴房名称 |
| `description` | `varchar(255)` | YES | — | `NULL` | 琴房描述 |

**DDL：**
```sql
CREATE TABLE `rooms` (
  `roomId` varchar(64) NOT NULL,
  `campus` varchar(64) NOT NULL COMMENT '校区：玉泉路琴房/雁栖湖琴房/奥运村琴房',
  `name` varchar(100) NOT NULL COMMENT '琴房名称',
  `description` varchar(255) DEFAULT NULL COMMENT '琴房描述',
  PRIMARY KEY (`roomId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 8. `reservations` — 琴房预约

> 预约规则：07:00–22:30、结束>开始、不跨天、≤6 人（含主预约人）。`participants` 存参与人 personalId 数组（含主预约人）。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `id` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `roomId` | `varchar(64)` | NO | **MUL** | — | 琴房ID（外键→`rooms`） |
| `bookerId` | `varchar(64)` | NO | **MUL** | — | 主预约人 personalId（外键→`persons`） |
| `date` | `date` | NO | **MUL** | — | 预约日期 |
| `startTime` | `time` | NO | — | — | 开始时间 |
| `endTime` | `time` | NO | — | — | 结束时间 |
| `participants` | `json` | YES | — | `NULL` | 参与人 personalId 数组（含主预约人） |
| `createdAt` | `datetime` | NO | — | 当前时间 | 创建时间 |

**索引：**
- 主键：`id`
- 普通键：`idx_room_date`（`roomId`, `date`）、`idx_booker`（`bookerId`）

**外键约束：**
| 约束名 | 字段 | 引用 | 删除规则 | 更新规则 |
|--------|------|------|----------|----------|
| `FK_Reservations_Room` | `roomId` | `rooms(roomId)` | CASCADE | CASCADE |
| `FK_Reservations_Booker` | `bookerId` | `persons(personalId)` | CASCADE | CASCADE |

**DDL：**
```sql
CREATE TABLE `reservations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `roomId` varchar(64) NOT NULL,
  `bookerId` varchar(64) NOT NULL COMMENT '主预约人 personalId',
  `date` date NOT NULL COMMENT '预约日期',
  `startTime` time NOT NULL COMMENT '开始时间',
  `endTime` time NOT NULL COMMENT '结束时间',
  `participants` json DEFAULT NULL COMMENT '参与人 personalId 数组（含主预约人）',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_room_date` (`roomId`, `date`),
  KEY `idx_booker` (`bookerId`),
  CONSTRAINT `FK_Reservations_Room` FOREIGN KEY (`roomId`) REFERENCES `rooms` (`roomId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_Reservations_Booker` FOREIGN KEY (`bookerId`) REFERENCES `persons` (`personalId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 9. `rehearsal_records` — 排练记录

> 学生指挥（`managerJob=6`）专用：记录每次排练的要点；可查看、记录、编辑、删除任意记录。`eventTitle` / `recordDate` 在创建时由关联活动自动带出。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `id` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `eventId` | `varchar(64)` | NO | **MUL** | — | 关联活动（`ARTICLE_x` 或 events.eventId） |
| `eventTitle` | `varchar(200)` | YES | — | `NULL` | 活动标题（自动带出） |
| `recordDate` | `date` | YES | **MUL** | `NULL` | 排练日期（取活动开始日期） |
| `content` | `text` | NO | — | — | 排练要点内容 |
| `createdBy` | `varchar(64)` | YES | — | `NULL` | 记录人 personalId |
| `createdAt` | `datetime` | NO | — | 当前时间 | 创建时间 |
| `updatedAt` | `datetime` | YES | — | `NULL` | 更新时间 |

**索引：** 主键 `id`；普通键 `idx_event`（`eventId`）、`idx_date`（`recordDate`）

**DDL：**
```sql
CREATE TABLE `rehearsal_records` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `eventId` varchar(64) NOT NULL COMMENT '关联活动/文章',
  `eventTitle` varchar(200) DEFAULT NULL COMMENT '活动标题（自动带出）',
  `recordDate` date DEFAULT NULL COMMENT '排练日期（取活动开始日期）',
  `content` text NOT NULL COMMENT '排练要点',
  `createdBy` varchar(64) DEFAULT NULL COMMENT '记录人 personalId',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_event` (`eventId`),
  KEY `idx_date` (`recordDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

## 实体关系简图（ER）

```mermaid
erDiagram
    persons ||--o{ attendance : "报名/打卡"
    articles ||--o{ attendance : "被报名(ARTICLE_)"
    events   ||--o{ attendance : "被报名"
    persons ||--o{ logistics : "拥有"
    rooms ||--o{ reservations : "被预约"
    persons ||--o{ reservations : "主预约"
    persons ||--o{ rehearsal_records : "记录排练要点"

    persons {
        varchar(64) personalId PK
        varchar(64) account UK "登录账号"
        varchar(100) name
        tinyint gender "0女 1男"
        tinyint section "0民乐 1弹拨一…"
        tinyint job "0普通 1声部长"
        tinyint isManager "0否 1是"
        tinyint isMaster "0否 1首席"
        tinyint isOrchestraMember "0否 1是"
    }

    articles {
        int unsigned articleId PK
        tinyint type "0排练 1演出 2新闻"
        varchar(200) title
        datetime startTime
        datetime endTime
        varchar(255) location "打卡坐标"
    }

    events {
        varchar(64) eventId PK
        datetime startTime
        datetime endTime
        varchar(200) title "默认:乐团活动"
        varchar(255) location "打卡坐标"
    }

    attendance {
        int unsigned attendanceId PK
        varchar(64) personalId FK
        varchar(64) eventId FK
        tinyint method "0报名 1参加"
    }

    scores {
        int unsigned scoreId PK
        varchar(200) title
        tinyint(1) isTotal
        varchar(64) section
        varchar(255) filehash UK
    }

    logistics {
        varchar(64) itemId PK
        varchar(200) name
        varchar(255) imagehash "SHA256"
        tinyint(1) isPublic
        varchar(64) belongsToId FK
    }

    rooms {
        varchar(64) roomId PK "校区名"
        varchar(64) campus
        varchar(100) name
    }

    reservations {
        int unsigned id PK
        varchar(64) roomId FK
        varchar(64) bookerId FK
        date date
        time startTime
        time endTime
        json participants "含主预约人"
    }

    rehearsal_records {
        int unsigned id PK
        varchar(64) eventId "活动/文章"
        varchar(200) eventTitle
        date recordDate "排练日期"
        text content "排练要点"
        varchar(64) createdBy FK "记录人"
    }
```

---

> **注：** `scores`（乐谱）为独立实体，不依赖其他表；`attendance.eventId` 既可能指向 `articles`（`ARTICLE_数字`）也可能指向 `events`。
