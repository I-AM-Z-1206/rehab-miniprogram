-- ============================================================================
-- server/schema.sql —— 家用版后端目标库表（SQLite 方言）
-- ----------------------------------------------------------------------------
-- 目标环境：Ubuntu 24.04 / 2 核 / 1.7GB 内存 / Node 24（已实测原生支持 node:sqlite，无需任何标志）
-- 用途：P3 的目标结构。现阶段跑 JSON 文件，这份 schema 当"设计契约"用；
--       换库时执行：sqlite3 data/rehab.db < server/schema.sql
--
-- 三组核心：
--   身份    app_user    —— 能登录的人（患者、治疗师），openid 是根
--   档案    patient     —— 患者档案，独立于账号，可先建档后绑定
--   关系    care_link   —— 患者 ↔ 治疗师（多对多，支持转诊）
--   参数    care_plan / game_config
--   记录    record      —— 带 patient_id + 参数快照
--
-- ★ 为什么 patient 和 app_user 要分开
--   治疗师常在门诊时先建纸质档案（有诊断、患侧、禁忌），而患者回家才第一次登录。
--   如果档案和账号强绑在一张表，就会出现"必须先让患者登录才能建档"的倒挂。
--   拆开后：patient 可以先存在（user_id 为 NULL），患者登录后认领，全程不需要邀请码。
--
-- 迁移到 Postgres 时只需改三处：
--   1. 时间戳 INTEGER(ms) → BIGINT 或 TIMESTAMPTZ
--   2. TEXT 存 JSON → JSONB（省空间，可建 GIN 索引）
--   3. strftime 语法 → 等价 Postgres 函数
-- ============================================================================

PRAGMA journal_mode = WAL;      -- 读写并发更好，崩溃不留半个写
PRAGMA foreign_keys = ON;       -- ★ 连接级开关，每个应用连接都要重新执行
PRAGMA synchronous = NORMAL;    -- WAL 下足够安全，性能明显好于 FULL

-- ---------------------------------------------------------------- 元信息
CREATE TABLE IF NOT EXISTS schema_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_meta(key, value, updated_at)
VALUES ('schema_version', '2', CAST(strftime('%s','now') AS INTEGER) * 1000);

-- ---------------------------------------------------------------- 身份
-- 只存"能登录的人"。患者和治疗师共用一张表，用 role 区分。
CREATE TABLE IF NOT EXISTS app_user (
  id            TEXT PRIMARY KEY,              -- u_ + 随机串
  openid        TEXT NOT NULL,                 -- 微信 openid，身份根；换手机不丢
  unionid       TEXT,                          -- 有开放平台时才有，跨应用识别同一人
  role          TEXT NOT NULL,                 -- 'patient' | 'therapist' | 'admin'
  display_name  TEXT NOT NULL,                 -- 微信昵称，仅作初始值，可改
  avatar_url    TEXT,
  org_id        TEXT NOT NULL DEFAULT 'default',
  created_at    INTEGER NOT NULL,
  last_login_at INTEGER,
  disabled_at   INTEGER,                       -- 非空 = 停用（离职/结疗），不物理删
  CHECK (role IN ('patient', 'therapist', 'admin'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_openid ON app_user(openid);
CREATE INDEX IF NOT EXISTS idx_user_role ON app_user(role, disabled_at);

-- ---------------------------------------------------------------- 患者档案
-- ★ 刻意不复用 app_user：患者可能在登录之前就已经有病历了。
--   user_id 为空 = "纸质档案阶段"，治疗师已建档，患者还没登录
--   user_id 非空 = 患者已登录并认领
CREATE TABLE IF NOT EXISTS patient (
  id           TEXT PRIMARY KEY,               -- p_ + 随机串（内部 id）
  code         TEXT NOT NULL,                  -- 治疗师可见编号：P-0231
  display_name TEXT NOT NULL,                  -- 化名：张*爷（不存真实姓名）
  birth_year   INTEGER,                        -- 只存年份，不存生日
  sex          TEXT,                           -- 'M' | 'F' | NULL，康复评估常用
  note         TEXT,                           -- 诊断 / 患侧 / 禁忌，自由文本
  user_id      TEXT REFERENCES app_user(id),   -- 认领后填充；NULL = 还没有账号
  org_id       TEXT NOT NULL DEFAULT 'default',
  created_by   TEXT REFERENCES app_user(id),   -- 谁建的档（治疗师）
  created_at   INTEGER NOT NULL,
  archived_at  INTEGER,
  CHECK (sex IS NULL OR sex IN ('M', 'F')),
  CHECK (birth_year IS NULL OR (birth_year BETWEEN 1900 AND 2100))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_code ON patient(code);
-- 一个登录账号只能认领一个患者档案
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_user ON patient(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_patient_unclaimed ON patient(user_id, archived_at);

-- 患者 ↔ 治疗师：多对多
-- 转诊、会诊、换治疗师都不该丢历史，所以不做一对一的"主治医师"字段。
CREATE TABLE IF NOT EXISTS care_link (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patient(id),
  therapist_id TEXT NOT NULL REFERENCES app_user(id),
  status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'revoked'
  linked_at    INTEGER NOT NULL,
  revoked_at   INTEGER,
  CHECK (status IN ('active', 'revoked'))
);
CREATE INDEX IF NOT EXISTS idx_link_therapist ON care_link(therapist_id, status);
CREATE INDEX IF NOT EXISTS idx_link_patient ON care_link(patient_id, status);

-- ---------------------------------------------------------------- 疗程与参数
-- 疗程处方：治疗师说"这周做 3 次，每次两个游戏"。
-- 居家康复失败的主因是不练（不是练错），所以"该练几次"必须落库才谈得上依从性。
CREATE TABLE IF NOT EXISTS care_plan (
  id           TEXT PRIMARY KEY,
  patient_id   TEXT NOT NULL REFERENCES patient(id),
  therapist_id TEXT NOT NULL REFERENCES app_user(id),
  title        TEXT,
  games        TEXT NOT NULL,                   -- JSON: [{"gameId":"fruit","timesPerWeek":3,"difficulty":2}]
  start_date   TEXT NOT NULL,                   -- 'YYYY-MM-DD'，按本地日期，不做时区换算
  end_date     TEXT NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'finished' | 'cancelled'
  created_at   INTEGER NOT NULL,
  CHECK (status IN ('active', 'finished', 'cancelled')),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS idx_plan_patient ON care_plan(patient_id, status, start_date);
CREATE INDEX IF NOT EXISTS idx_plan_therapist ON care_plan(therapist_id, status);

-- 可下发的游戏参数
-- version 单调递增，客户端带本地 version 来问，只有变了才下发全量。
-- payload 的键必须和客户端 ConfigStore 的 SCHEMA 同名，这样 patch() 能直接吃，
-- 服务端不必实现第二套类型转换和范围校验（校验仍由客户端 validate() 兜底）。
CREATE TABLE IF NOT EXISTS game_config (
  patient_id  TEXT NOT NULL REFERENCES patient(id),
  game_id     TEXT NOT NULL,                    -- 'fruit' | 'wire' | 'rhythm' | 'shoot' | 'race'
  version     INTEGER NOT NULL DEFAULT 1,
  payload     TEXT NOT NULL,                    -- JSON: {"difficulty":2,"holdToleranceDeg":6,...}
  updated_by  TEXT REFERENCES app_user(id),     -- 谁改的（审计）
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (patient_id, game_id),
  CHECK (version >= 1)
);

-- ---------------------------------------------------------------- 训练记录
CREATE TABLE IF NOT EXISTS record (
  id              TEXT PRIMARY KEY,             -- 客户端 recordId，天然幂等（重传不重复计分）
  patient_id      TEXT NOT NULL REFERENCES patient(id),
  game_id         TEXT NOT NULL,
  started_at      INTEGER NOT NULL,             -- 训练开始（客户端时钟）；允许迟到上报
  ended_at        INTEGER,
  duration_sec    REAL NOT NULL,
  -- 抽成列的通用指标：只有能聚合/排序的才值得建列
  score           INTEGER,
  accuracy        REAL,
  -- 游戏特有指标：fruit 的 holdRate、rhythm 的 rhythmAccuracy、wire 的 stableSec……
  -- 放 JSON，将来加第 6 个游戏不用改表结构
  metrics         TEXT NOT NULL,
  -- 本次训练用的完整参数 + version。存在的理由不是存档，是让历史数据可比较：
  -- 容差从 6° 改成 4° 之后，稳定率的绝对值不能直接跨周对比。
  config_snapshot TEXT NOT NULL,
  -- 'sensor' | 'simulation'。查询层默认必须排除 simulation，
  -- 演示数据混进康复报告是最容易出的医疗事故。
  data_source     TEXT NOT NULL,
  interrupted     INTEGER NOT NULL DEFAULT 0,   -- 传感器中断过
  interrupted_sec REAL NOT NULL DEFAULT 0,      -- 累计中断秒数：中断率高时不该参与均值
  client_ver      TEXT,                         -- 小程序版本，排查线上问题用
  created_at      INTEGER NOT NULL,             -- 服务端接收时间
  deleted_at      INTEGER,                      -- 软删；隐私删除走"标记 + 30 天后物理清"
  CHECK (data_source IN ('sensor', 'simulation')),
  CHECK (duration_sec >= 0)
);
CREATE INDEX IF NOT EXISTS idx_record_patient_time ON record(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_game_time ON record(game_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_record_sensor ON record(patient_id, data_source, started_at DESC);

-- ---------------------------------------------------------------- 依从性与提醒
-- 微信订阅消息：一次性订阅发一条扣一次，所以要把授权"攒"起来。
CREATE TABLE IF NOT EXISTS push_subscription (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES app_user(id),
  template_id  TEXT NOT NULL,
  remaining    INTEGER NOT NULL DEFAULT 1,      -- 剩余可发送次数
  granted_at   INTEGER NOT NULL,
  last_sent_at INTEGER,
  CHECK (remaining >= 0)
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscription(user_id, template_id, remaining);

CREATE TABLE IF NOT EXISTS reminder (
  id         TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patient(id),
  plan_id    TEXT REFERENCES care_plan(id),
  fire_at    INTEGER NOT NULL,
  sent_at    INTEGER,
  result     TEXT,                              -- 'sent' | 'rejected' | 'expired' | 'skipped'
  CHECK (result IS NULL OR result IN ('sent', 'rejected', 'expired', 'skipped'))
);
CREATE INDEX IF NOT EXISTS idx_reminder_due ON reminder(sent_at, fire_at);

-- ---------------------------------------------------------------- 审计
-- 谁在什么时候改了谁的参数。医疗相关系统这条不能省。
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,                    -- 'config.update' | 'plan.create' | 'record.delete' | 'patient.claim'
  target_type TEXT NOT NULL,                    -- 'game_config' | 'care_plan' | 'record' | 'patient'
  target_id   TEXT NOT NULL,
  diff        TEXT,                             -- JSON: { before, after }
  ip          TEXT,
  at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_log(target_type, target_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id, at DESC);

-- ---------------------------------------------------------------- 视图
-- 按周汇总，直接喂给治疗师看板。
-- 两个硬规则：排除 simulation（演示数据不进康复报告）、排除软删。
-- 时区用 '+8 hours' 而不是 'localtime'，避免容器默认 UTC 导致周归属错位（中国无夏令时）。
DROP VIEW IF EXISTS v_patient_week;
CREATE VIEW v_patient_week AS
SELECT
  patient_id,
  strftime('%Y-%W', started_at / 1000, 'unixepoch', '+8 hours') AS week,
  COUNT(*)                       AS sessions,
  ROUND(SUM(duration_sec), 1)    AS total_sec,
  ROUND(AVG(score), 1)           AS avg_score,
  ROUND(AVG(accuracy), 4)        AS avg_accuracy,
  SUM(CASE WHEN interrupted = 1 THEN 1 ELSE 0 END) AS interrupted_sessions
FROM record
WHERE deleted_at IS NULL
  AND data_source = 'sensor'
GROUP BY patient_id, week;

-- 每个患者最近一次训练：治疗师列表页用来算"几天没练了"
DROP VIEW IF EXISTS v_patient_last;
CREATE VIEW v_patient_last AS
SELECT
  patient_id,
  MAX(started_at) AS last_started_at,
  COUNT(*)        AS total_sessions
FROM record
WHERE deleted_at IS NULL
  AND data_source = 'sensor'
GROUP BY patient_id;

-- 待认领池：已登录、但还没有任何治疗师关联的患者。
-- 这就是"不要邀请码"的实现基础 —— 患者登录即自动进入这个池子，治疗师点一下即可认领。
DROP VIEW IF EXISTS v_unclaimed_patient;
CREATE VIEW v_unclaimed_patient AS
SELECT
  p.id, p.code, p.display_name, p.created_at,
  u.last_login_at, u.avatar_url
FROM patient p
JOIN app_user u ON u.id = p.user_id
WHERE p.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM care_link l
    WHERE l.patient_id = p.id AND l.status = 'active'
  );
