# Windows（VDI 桌面）部署手册

> 适用：Windows 10 / 11 / Windows Server 的虚拟桌面（VDI）。
> **先读第 0 节判断 VDI 能不能当正式后端**，再决定走哪条路。
>
> 关键背景：微信小程序的 `request` **只接受 HTTPS + 已备案域名**。
> 所以无论后端跑在哪，备案完成前只能在开发者工具 / 真机调试（勾选「不校验合法域名」）下联调。

---

## 0. 先判断：这台 VDI 能不能对外提供服务？

在 VDI 上跑一条命令，拿到它的 IP：

```powershell
ipconfig | findstr /i "IPv4"
```

然后在**另一台机器**（比如你自己的电脑）上：

```powershell
curl http://那个IP:8787/health
```

| 结果 | 说明 | 能做什么 |
| --- | --- | --- |
| 能通 | VDI 有局域网可达 IP | 可以当联调服务器；能否当生产要看有没有**公网 IP** |
| 不通 | VDI 在内网 / 有防火墙 | 只能当本地开发机，生产还是用那台 Ubuntu 服务器 |
| 通，但用 `https://公网IP` 才行 | 有公网映射 | 可以当生产，但小程序仍要求域名 + 备案 |

**VDI 的常见限制**（提前知道，省得白忙）：

1. 大多数 VDI 在企业内网，**没有公网 IP**，小程序访问不到
2. VDI 会话被回收 / 注销时，前台跑的进程会被杀掉 → 必须做成**服务**才能常驻
3. VDI 常禁用虚拟化（Hyper-V / WSL2），**Docker Desktop 通常跑不起来** → 用 Node 裸跑
4. 公司 IT 可能禁止在 VDI 上开端口 / 跑服务 → 先问一句 IT

> 如果 VDI 没有公网 IP：**别把它当生产后端**，继续用那台 Ubuntu（见 `UBUNTU-DEBIAN.md`）。
> VDI 用来做开发和联调非常合适——不用装双系统、不用 VPN。

---

## 1. 装 Node（5 分钟）

管理员 PowerShell：

```powershell
# 方式 A：winget（Windows 10 1809+ 自带）
winget install OpenJS.NodeJS.LTS

# 方式 B：官网安装包
# https://nodejs.org/dist/v20.x.x/node-v20.x.x-x64.msi  下载后一路下一步

# 装完重开一个 PowerShell 验证
node -v      # 需要 v18+
npm -v
```

## 2. 放好代码

把部署包（`dist/rehab-server-20261027.tar.gz`）传到 VDI：
可用共享盘、剪贴板、或在 VDI 上直接从项目里复制。

```powershell
# 在 VDI 上，假设包已放到 C:\opt\
cd C:\opt
tar -xzf rehab-server-20261027.tar.gz
cd rehab-server
dir          # 应该看到 index.js store.js deploy\ 等
```

> Windows 10+ 自带 `tar`，不需要额外装 7-Zip。

## 3. 生成令牌并试跑

```powershell
# 生成一个 48 位随机令牌
$t = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$t      # ← 抄下来保存好，小程序要填同一个

# 设置环境变量并启动
$env:UPLOAD_TOKEN = $t
$env:PORT = "8787"
node index.js
```

看到 `{"ok":true,...}` 相关日志即可。**新开一个 PowerShell** 验证：

```powershell
curl http://127.0.0.1:8787/health
```

按 Ctrl+C 停掉试跑的进程（下一步做成服务）。

## 4. 放行防火墙

```powershell
New-NetFirewallRule -DisplayName "RehabServer 8787" `
  -Direction Inbound -LocalPort 8787 -Protocol TCP `
  -Action Allow -Profile Domain,Private
```

> 公司 VDI 如果连了域，`Profile` 里的 `Domain` 别删，否则域内访问会被拦。
> 之后再用第 0 节的方式从另一台机器 curl 一次，确认能通。

## 5. 做成 Windows 服务（开机自启、注销也不停）

### 方式 A：NSSM（推荐，一个 exe 搞定）

```powershell
# 装 NSSM
winget install NSSM.NSSM
# 或下载 https://nssm.cc/download  解压后把 nssm.exe 放进 C:\opt\rehab-server

nssm install RehabServer "C:\Program Files\nodejs\node.exe"
nssm set RehabServer AppParameters "C:\opt\rehab-server\index.js"
nssm set RehabServer AppDirectory   "C:\opt\rehab-server"
nssm set RehabServer AppEnvironmentExtra UPLOAD_TOKEN=你的令牌 DATA_DIR=C:\opt\rehab-server\data STATIC_DIR=C:\opt\rehab-server\static
nssm set RehabServer Start SERVICE_AUTO_START
nssm set RehabServer AppStdout "C:\opt\rehab-server\server.log"
nssm set RehabServer AppStderr "C:\opt\rehab-server\server.err.log"

nssm start RehabServer
nssm status RehabServer     # 应显示 SERVICE_RUNNING
```

常用运维命令：

```powershell
nssm restart RehabServer
nssm stop    RehabServer
Get-Content C:\opt\rehab-server\server.log -Tail 50
```

### 方式 B：任务计划程序（不想装第三方）

用**当前登录用户**（不要用 SYSTEM，否则读不到用户级环境变量）：

```powershell
$env:UPLOAD_TOKEN = "你的令牌"      # 先设好
$action = New-ScheduledTaskAction -Execute "C:\Program Files\nodejs\node.exe" `
  -Argument "C:\opt\rehab-server\index.js" -WorkingDirectory "C:\opt\rehab-server"
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName "RehabServer" -Action $action -Trigger $trigger `
  -User "$env:USERNAME" -RunLevel Highest -Force
Start-ScheduledTask -TaskName "RehabServer"
```

> 注意：任务计划里的环境变量来自「注册任务时」那一层，不随系统重启变。
> 令牌换掉时，重新执行 `Register-ScheduledTask` 覆盖即可。

## 6. （可选）配 HTTPS —— 有域名时才做

小程序正式版必须 HTTPS。Caddy 有 Windows 版，用法和 Linux 一致：

```powershell
# 下载 caddy_windows_amd64.exe，改名 caddy.exe 放 C:\opt\
cd C:\opt
.\caddy.exe run --config rehab-server\deploy\Caddyfile
# 把 Caddyfile 里的 api.example.com 换成你的域名（域名解析到这台 VDI 的公网 IP）
```

验证：

```powershell
curl https://你的域名/health
```

域名未备案时：先用 `deploy/Caddyfile.http`（80 端口纯验证），
但**小程序正式版仍然上不了线**，等备案。

## 7. 小程序侧怎么配

| 阶段 | 地址 | 说明 |
| --- | --- | --- |
| 开发者工具本机联调 | `http://127.0.0.1:8787/api/v1/records` | 勾「不校验合法域名」即可 |
| 真机调试 | `http://VDI的局域网IP:8787/api/v1/records` | 手机和 VDI 必须同一网络；同样要勾「不校验」 |
| 正式版 | `https://你的域名/api/v1/records` | 需要 HTTPS + 已备案域名 + 公众平台加 **request 合法域名** |

地址填在小程序「训练设置 → 训练数据上报」里，令牌填同一个 `UPLOAD_TOKEN`（四个游戏各填一次）。

---

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 本机 `curl 127.0.0.1:8787` 通，别的机器不通 | 防火墙规则没生效，或 VDI 没有互通 IP（第 0 节） |
| 服务装好但启动即停 | 看 `server.err.log`；多半是令牌没设或端口被占（`netstat -ano | findstr 8787`） |
| VDI 注销后服务停了 | 没做成服务，用的前台运行；按第 5 节做 NSSM |
| Docker Desktop 装不上 / 起不来 | VDI 常禁用虚拟化，直接用 Node 裸跑即可，不必强求 Docker |
| 小程序提示 `url not in domain list` | 只有正式版要求；联调时勾「不校验合法域名」 |
| 上传返回 401 | 设置页令牌和服务端 `UPLOAD_TOKEN` 不一致 |
| 想换令牌 | NSSM：`nssm set RehabServer AppEnvironmentExtra UPLOAD_TOKEN=新值` → `nssm restart RehabServer`；计划任务：重新注册任务 |

---

## 结论建议

- **VDI 只做开发/联调**：第 1~4 步，跑 `node index.js` 就够，不用做成服务。
- **VDI 想当生产**：先确认有公网 IP + 公司允许，再按第 5、6 步做服务和 HTTPS。
- **多数情况下**：生产继续用那台 Ubuntu 服务器（`UBUNTU-DEBIAN.md`），VDI 留着开发，两边共用同一个 `UPLOAD_TOKEN` 即可。
