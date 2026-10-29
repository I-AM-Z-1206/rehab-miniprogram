# server —— 康复训练小程序后端

Fastify 5 + `node:sqlite`。**没有额外的数据库进程**，整个后端跑在一个 Node 进程里，常驻内存约 90 MB。

生产部署在这台机器上：

| 项 | 值 |
| --- | --- |
| 地址 | `http://47.112.18.198/api`（备案后换 https 域名） |
| 进程 | PM2 `rehab-api`，fork 单实例，监听 `127.0.0.1:8787` |
| 入口 | nginx `/api/` → `127.0.0.1:8787`（不开放 8787 到公网） |
| 数据 | `/opt/rehab/data/rehab.db`（SQLite，WAL 模式） |
| 备份 | `/etc/cron.d/rehab-backup`，每 6 小时一份，保留 7 天 |
| 日志 | `/opt/rehab/logs/{out,error}.log` |

```
server/
├── app.js              Fastify 实例：插件、鉴权、错误处理、优雅退出
├── db.js               SQLite 连接（WAL / 外键 / busy_timeout / 自动建表）
├── schema.sql          建表语句（10 表 + 3 视图）
├── lib/
│   ├── wx.js           code2session（含无 Secret 的开发模式）
│   ├── ids.js          id 生成、患者编号递增
│   └── errors.js       统一 HttpError
├── routes/
│   ├── auth.js         登录、/me、开发期提权
│   ├── records.js      记录上报/查询/软删
│   ├── config.js       参数下发/更新（带乐观锁）
│   └── therapist.js    患者列表、待认领、认领、周报
├── index.js            ⚠️ LEGACY：v1 的零依赖实现，已被 app.js 取代，不要再用
└── store.js            ⚠️ LEGACY：v1 的 JSON 文件存储
```

---

## 一、接口

所有业务接口都要 `Authorization: Bearer <JWT>`，token 有效期 2 小时，小程序端 `utils/api.js` 会自动续期。

### 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/auth/login` | `{ code, devId?, nickname? }` → token + 患者档案。**首次登录自动建档，不需要邀请码** |
| GET | `/api/v1/me` | 当前用户、患者档案、绑定治疗师、各游戏参数版本 |
| POST | `/api/v1/auth/dev-promote` | 仅 `DEV_LOGIN=1` 且非生产可用，把当前账号提为治疗师 |

### 记录

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/records` | 单条或 `{ records: [...] }`（≤20 条）。`recordId` 幂等 |
| GET | `/api/v1/records` | `?gameId=&from=&to=&limit=&includeSimulation=` 默认排除模拟数据 |
| DELETE | `/api/v1/records/:id` | 软删除（`deleted_at`） |

**patientId 不由客户端传**：服务端从 JWT 推导，患者只能写自己的记录，治疗师不能走这个接口。这是安全边界，不是遗漏。

### 参数

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/config/:gameId` | `?since=N` 版本未变时只回 `changed:false` |
| PUT | `/api/v1/config/:gameId` | `?patientId=` 仅治疗师；`expectedVersion` 做乐观锁 |

服务端**不校验参数的业务合法性**（范围、步长）。客户端 `ConfigStore.patch()` 会做类型转换与范围裁剪，服务端只负责存与发。这样治疗师即使塞了越界值，也只会被客户端裁到合法区间。

### 治疗师

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/therapist/patients` | 患者列表 + 本周次数 + 上次训练 + 异常标记 |
| GET | `/api/v1/therapist/unclaimed` | 待认领池（已登录但没绑治疗师） |
| POST | `/api/v1/patients` | 门诊建档（患者还没登录也能先建） |
| POST | `/api/v1/patients/:id/claim` | 认领，可带 `mergeIntoId` 合并门诊档案 |
| GET | `/api/v1/patients/:id/report` | 按周聚合 + 分游戏统计 + 最近记录 |

### 运维

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` 或 `/api/health` | 免鉴权，返回 db 状态、schema 版本、微信配置状态 |

---

## 二、环境变量

| 变量 | 必填 | 默认 | 说明 |
| --- | --- | --- | --- |
| `SESSION_SECRET` | **生产必填** | 开发用固定值 | JWT 签名密钥，`openssl rand -hex 32` |
| `PORT` | | `8787` | |
| `HOST` | | `0.0.0.0` | 生产建议 `127.0.0.1`，只让本机 nginx 访问 |
| `DATA_DIR` | | `./data` | 生产用 `/opt/rehab/data` |
| `WX_APPID` / `WX_SECRET` | | 空 | 微信登录。不配则必须开 `DEV_LOGIN` |
| `DEV_LOGIN` | | 空 | `1` = 允许开发登录。**生产必须关闭** |
| `THERAPIST_OPENIDS` | | 空 | 治疗师 openid 白名单，逗号分隔 |
| `CORS_ORIGIN` | | 空 | 设了才开 CORS（小程序不需要） |
| `LOG_LEVEL` | | `info` | `silent` 可关闭日志 |

### ⚠️ 当前部署开了 `DEV_LOGIN=1`

因为还没有 `WX_APPID` / `WX_SECRET`。开发模式下，客户端传的 `devId` 直接派生 openid——**任何人都能伪造任意身份**。

目前数据库是空的，风险可控。但：

1. 拿到小程序 AppID/AppSecret 后，**立刻**把 `DEV_LOGIN` 改成 `0`；
2. 用 `THERAPIST_OPENIDS` 指定治疗师，不要再用 `devId` 前缀；
3. 部署后 `pm2 restart rehab-api --update-env` 并 `pm2 save`。

启动日志里每次都会打这条警告，看到它说明还没配微信。

---

## 三、本地跑

```bash
cd server
npm install

# Node 23.4+ 直接跑；Node 22.5~23.3 要加 --experimental-sqlite
DATA_DIR=../.tmp-data PORT=8787 SESSION_SECRET=dev-secret DEV_LOGIN=1 node app.js
```

验证：

```bash
curl http://127.0.0.1:8787/health
```

跑端到端自检（54 项，覆盖登录到周报）：

```bash
node tools/server-smoke-test.js
```

---

## 四、部署（本机实际情况）

**不要装 Docker**，这台机器已有 Node 24 + PM2 + nginx，装 Docker 会多占 200~300 MB 且和宝塔 iptables 冲突。

```bash
# 1. 上传（本地执行，排除 node_modules）
tar -czf /tmp/srv.tgz --exclude=server/node_modules --exclude=server/data server
scp /tmp/srv.tgz zzyuan:/opt/rehab/

# 2. 服务器上
ssh zzyuan
cd /opt/rehab && tar -xzf srv.tgz && rm srv.tgz
cd server && npm i --omit=dev

# 3. 建表（首次；app.js 启动时也会自动建）
sqlite3 /opt/rehab/data/rehab.db < /opt/rehab/server/schema.sql

# 4. 启动
export PATH=/www/server/nodejs/v24.21.0/bin:$PATH
pm2 start /opt/rehab/ecosystem.config.js
pm2 save
```

**改动 `ecosystem.config.js` 后必须 `pm2 delete` + `pm2 start`**：`pm2 restart` 不会重读配置文件里的 `env`。

---

## 五、运维

```bash
export PATH=/www/server/nodejs/v24.21.0/bin:$PATH

pm2 list                       # 进程状态
pm2 logs rehab-api --lines 50  # 日志
pm2 restart rehab-api
pm2 delete rehab-api && pm2 start /opt/rehab/ecosystem.config.js   # 改了配置

# 健康检查
curl http://127.0.0.1:8787/health
curl http://47.112.18.198/api/health

# 数据库
sqlite3 /opt/rehab/data/rehab.db "SELECT COUNT(*) FROM record;"
sqlite3 /opt/rehab/data/rehab.db ".backup '/opt/rehab/backup/manual.db'"
```

数据库**不要用 Navicat 直接改**：会绕过 `data_source` 白名单、`recordId` 幂等和参数快照，`audit_log` 也留不下痕。查可以，写走 API。

---

## 六、已知限制

| 项 | 说明 |
| --- | --- |
| 单实例 | SQLite 写串行，PM2 必须 `instances: 1`。开 cluster 会 `SQLITE_BUSY` |
| 无时间点恢复 | 只有每 6 小时的 `.backup`，误删最多丢 6 小时 |
| 无网络协议 | 不能多机共享，Navicat 只能打开本地副本 |
| 单点 | 这台机器挂了服务就停。居家康复可接受，等有付费用户再考虑 |

换 Postgres 的触发条件：记录 > 50 万条 / 需要多实例 / 需要 PITR / 对接医院 HIS。迁移只改 `db.js` 和 `routes/` 里的 SQL，`strftime` 要换成 `to_char`。
