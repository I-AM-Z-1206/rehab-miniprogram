# Ubuntu / Debian 部署手册（域名未备案阶段）

> 目标：**今天就让后端在服务器上跑起来**，先用 `http://服务器IP:8787` 联调；
> 备案通过后再补 HTTPS，然后才进小程序正式版。
>
> 说明：微信小程序的 `request` **只接受 HTTPS + 已备案域名**，
> 所以备案前只能在「微信开发者工具 → 详情 → 本地设置 → 不校验合法域名」下联调，这是正常的。

---

## 0. 前提

- 服务器：Ubuntu 20.04 / 22.04 / 24.04 或 Debian 11 / 12，能 SSH 登录
- 你的电脑：能跑 `scp`（Windows 10+ 自带 OpenSSH 客户端）
- 云厂商控制台：安全组放行 **22**、**80**、**443**；联调期再临时放行 **8787**

---

## 1. 装运行环境（二选一，推荐 Docker）

```bash
# —— 方案 A：Docker ——
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
docker compose version     # 有输出即可

# —— 方案 B：只装 Node 20 ——
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v                    # 需要 v18+
```

## 2. 上传部署包

在你自己的电脑上，进入项目根目录：

```bash
scp dist/rehab-server-20261027.tar.gz root@你的服务器IP:/opt/
```

提示 `Permission denied` 就把 `root@` 换成你的登录用户，后面的命令加 `sudo`。

## 3. 部署

```bash
ssh root@你的服务器IP
cd /opt
tar -xzf rehab-server-20261027.tar.gz
cd rehab-server

# 生成一个强令牌（记下来，小程序要填同一个）
UPLOAD_TOKEN=$(openssl rand -hex 24) bash deploy.sh
```

看到下面这样就成功了：

```
{"ok":true,"ts":...,"tokenConfigured":true}
```

> 登录用户不是 root 时，`deploy.sh` 会自动退化成 `nohup` 方式；
> 想用 systemd 就加 `sudo`：`sudo UPLOAD_TOKEN=xxx bash deploy.sh`，再 `sudo systemctl status rehab-server`。

## 4. 从外网验证

在你自己的电脑上：

```bash
curl http://你的服务器IP:8787/health
```

- 通 → 继续第 5 步
- 不通 → 99% 是云厂商**安全组**没放行 8787（或服务器开了 ufw）：

```bash
sudo ufw allow 22,80,443/tcp
sudo ufw allow 8787/tcp      # 联调期临时开，配好反代后可以关掉
sudo ufw status
```

## 5. 小程序联调（备案前）

1. 微信开发者工具 → 详情 → 本地设置 → 勾选 **不校验合法域名、web-view、TLS 版本以及 HTTPS 证书**
2. 小程序里进「训练设置 → 训练数据上报」：
   - 地址：`http://你的服务器IP:8787/api/v1/records`
   - 令牌：第 3 步那串 `UPLOAD_TOKEN`
3. 玩一局 → 结算 → 「上传本局」→ 提示「已上传」即打通
4. 服务器上核对：

```bash
cd /opt/rehab-server && ls -l data/ && head -c 300 data/records.json
# 容器方式：
docker compose exec rehab-server sh -c 'head -c 300 /app/data/records.json'
```

## 6. 备案（并行去做，7~20 天）

1. 服务器必须是**中国大陆节点**，购买时长满足要求（通常 ≥3 个月）
2. 域名先完成**实名认证**（个人 / 企业）
3. 在云厂商「备案」控制台提交主体信息 + 网站信息 + 域名，按提示做核验（人脸 / 拍照）
4. 备案期间不要把域名解析切到境外，也不要关站
5. 通过后拿到备案号，把域名解析到服务器 IP

## 7. 备案通过后：开 HTTPS

```bash
# 解析生效后验证
dig +short api.example.com     # 应返回你的服务器 IP

# 装 Caddy（自动申请并续期证书）
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy

# 换成带 HTTPS 的配置（把 api.example.com 换成你的域名）
sudo cp /opt/rehab-server/deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/api.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy

# 验证
curl https://你的域名/health
```

> 80 / 443 必须在安全组里放行，否则证书签不下来。
> 没装 Caddy 也可以用 `deploy/Caddyfile.http` 先跑 80 端口做纯浏览器验证。

## 8. 切到正式域名

1. 小程序设置页把地址改成 `https://你的域名/api/v1/records`
2. 微信公众平台 → 开发管理 → 服务器域名 → **request 合法域名** 加 `https://你的域名`
3. 重新编译、真机验证，上传记录成功即完成
4. 收掉临时开放的 8787：`sudo ufw delete allow 8787/tcp`，安全组一并关闭

---

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 本机 `127.0.0.1:8787` 通、外网不通 | 安全组 / ufw 没放行端口 |
| 小程序提示 `url not in domain list` | 没配 request 合法域名，或域名未备案 / 不是 HTTPS |
| 上传返回 401 | 设置页令牌与服务端 `UPLOAD_TOKEN` 不一致 |
| 上传返回 503 | 服务端没配 `UPLOAD_TOKEN`（`journalctl -u rehab-server` 看启动日志） |
| Docker 起不来 | `docker compose logs` 看端口占用；换端口 `PORT=8788 bash deploy.sh` |
| 数据文件在哪 | `/opt/rehab-server/data/records.json`；容器里 `/app/data/records.json`（已挂卷） |
| 想备份 | `tar -czf /backup/rehab-$(date +%F).tar.gz -C /opt/rehab-server data` |
| 想换令牌 | 改 systemd 单元或 `.env` 里的 `UPLOAD_TOKEN`，重启服务，再改小程序设置页 |
