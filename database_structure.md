# MySQL 数据库结构文档

> 生成时间：2026-07-03
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

## `orchestra` — 乐团管理平台

### 1. `persons` — 个人信息

> 注：`personalId` 由后端系统自动生成，格式为 `P` + 36进制时间戳 + 4位随机数。前端新增时无需传入。

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `personalId` | `varchar(64)` | NO | **PRI** | — | 唯一标识符，系统自动生成 |
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

**索引：**
- 主键：`personalId`

**DDL：**
```sql
CREATE TABLE `persons` (
  `personalId` varchar(64) NOT NULL,
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
  PRIMARY KEY (`personalId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 2. `events` — 活动信息

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
  PRIMARY KEY (`eventId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 3. `attendance` — 出勤信息

| 字段 | 类型 | 空 | 键 | 默认值 | 说明 |
|------|------|----|----|--------|------|
| `attendanceId` | `int unsigned` | NO | **PRI** | — | 自增主键 |
| `personalId` | `varchar(64)` | NO | **MUL** | — | 用户ID（外键→`persons`） |
| `eventId` | `varchar(64)` | NO | **MUL** | — | 活动ID（外键→`events`） |
| `title` | `varchar(200)` | YES | — | `NULL` | 标题 |

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
  PRIMARY KEY (`attendanceId`),
  UNIQUE KEY `UNQ_Attendance_Personal_Event` (`personalId`,`eventId`),
  KEY `FK_Attendance_Personal` (`personalId`),
  KEY `FK_Attendance_Event` (`eventId`),
  CONSTRAINT `FK_Attendance_Event` FOREIGN KEY (`eventId`) REFERENCES `events` (`eventId`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_Attendance_Person` FOREIGN KEY (`personalId`) REFERENCES `persons` (`personalId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

---

### 4. `scores` — 乐谱信息

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

### 5. `logistics` — 后勤信息

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

## 实体关系简图（ER）

```mermaid
erDiagram
    persons ||--o{ attendance : "签到"
    events  ||--o{ attendance : "被签到"
    persons ||--o{ logistics : "拥有"

    persons {
        varchar(64) personalId PK
        varchar(100) name
        tinyint gender "0女 1男"
        varchar(128) institute
        varchar(32) grade
        tinyint campus "0中关村 1玉泉路 3雁栖湖…"
        tinyint section "0民乐 1弹拨一…"
        tinyint job "0普通 1声部长"
        tinyint isManager "0否 1是"
        tinyint managerJob "0干事 1团长…"
        varchar(256) instrument "分号分隔"
        tinyint isMaster "0否 1是"
    }

    events {
        varchar(64) eventId PK
        smallint year
        tinyint month
        tinyint date
        datetime startTime
        datetime endTime
        varchar(200) title "默认:乐团活动"
        text appendix
    }

    attendance {
        int unsigned attendanceId PK
        varchar(64) personalId FK
        varchar(64) eventId FK
        varchar(200) title
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
        varchar(64) campus
        varchar(255) address
        varchar(255) imagehash "SHA256"
        tinyint(1) isPublic
        varchar(64) belongsToId FK
    }
```

---

> **注：** `scores` 表暂不依赖其他表，属独立实体。
