-- Orchestra management platform table definitions
-- Execute this file in MySQL after logging in with valid credentials.

CREATE DATABASE IF NOT EXISTS orchestra
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE orchestra;

-- 个人信息
CREATE TABLE IF NOT EXISTS persons (
  personalId VARCHAR(64) NOT NULL,
  account VARCHAR(64) NOT NULL DEFAULT '' COMMENT '登录账号',
  password VARCHAR(255) NOT NULL DEFAULT '' COMMENT '登录密码(已加密)',
  name VARCHAR(100) NOT NULL,
  gender TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=女 1=男',
  institute VARCHAR(128),
  grade VARCHAR(32),
  campus TINYINT NOT NULL DEFAULT 0 COMMENT '0=中关村 1=玉泉路 3=雁栖湖 4=京内其他 5=京外其他',
  section TINYINT NOT NULL DEFAULT 0 COMMENT '0=民族管乐 1=弹拨一组 2=弹拨二组 3=胡琴 4=提琴 5=西洋木管 6=西洋铜管 7=低音 8=钢琴 9=打击 10=无声部',
  job TINYINT NOT NULL DEFAULT 0 COMMENT '0=普通成员 1=声部长',
  isManager TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=否 1=是',
  managerJob TINYINT NOT NULL DEFAULT 0 COMMENT '0=普通干事 1=团长 2=业务副团长 3=人事副团长 4=后勤组长 5=宣传组长 6=学生指挥 7=指挥助理 8=指挥',
  instrument VARCHAR(256) COMMENT '多个乐器用分号分隔',
  isMaster TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=否 1=是（声部首席）',
  PRIMARY KEY (personalId),
  UNIQUE KEY UNQ_Persons_Account (account)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 活动信息
CREATE TABLE IF NOT EXISTS events (
  eventId VARCHAR(64) NOT NULL,
  year SMALLINT NOT NULL,
  month TINYINT NOT NULL,
  date TINYINT NOT NULL,
  startTime DATETIME,
  endTime DATETIME,
  title VARCHAR(200) DEFAULT '乐团活动',
  appendix TEXT,
  PRIMARY KEY (eventId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 出勤信息
CREATE TABLE IF NOT EXISTS attendance (
  attendanceId INT UNSIGNED NOT NULL AUTO_INCREMENT,
  personalId VARCHAR(64) NOT NULL,
  eventId VARCHAR(64) NOT NULL,
  title VARCHAR(200),
  method TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0=报名 1=参加',
  PRIMARY KEY (attendanceId),
  UNIQUE KEY UNQ_Attendance_Personal_Event (personalId, eventId),
  KEY FK_Attendance_Personal (personalId),
  KEY FK_Attendance_Event (eventId),
  CONSTRAINT FK_Attendance_Person FOREIGN KEY (personalId) REFERENCES persons(personalId) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT FK_Attendance_Event FOREIGN KEY (eventId) REFERENCES events(eventId) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 乐谱信息
CREATE TABLE IF NOT EXISTS scores (
  scoreId INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  isTotal TINYINT(1) NOT NULL DEFAULT 0,
  section VARCHAR(64) NOT NULL DEFAULT '',
  filehash VARCHAR(255) NOT NULL,
  PRIMARY KEY (scoreId),
  UNIQUE KEY UNQ_Scores_Filehash (filehash),
  UNIQUE KEY UNQ_Scores_Title_Type_Section (title, isTotal, section)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 后勤信息
CREATE TABLE IF NOT EXISTS logistics (
  itemId VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  campus VARCHAR(64),
  address VARCHAR(255),
  imagehash VARCHAR(255) COMMENT '图片文件SHA256哈希',
  isPublic TINYINT(1) NOT NULL DEFAULT 0,
  belongsToId VARCHAR(64),
  PRIMARY KEY (itemId),
  KEY FK_Logistics_Owner (belongsToId),
  CONSTRAINT FK_Logistics_Owner FOREIGN KEY (belongsToId) REFERENCES persons(personalId) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
