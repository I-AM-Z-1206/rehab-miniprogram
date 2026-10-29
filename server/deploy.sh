#!/usr/bin/env bash
# ============================================================================
# deploy.sh —— 在服务器上执行的一键部署脚本
#   Docker 可用 → 走容器；否则用 Node + systemd；再否则前台 nohup
#
# 用法（在解压后的目录里）：
#   UPLOAD_TOKEN=$(openssl rand -hex 24) bash deploy.sh
#   PORT=8787 bash deploy.sh          # 换端口
#   MODE=systemd bash deploy.sh       # 强制用 systemd（不用 Docker）
# ============================================================================
set -euo pipefail

PORT="${PORT:-8787}"
MODE="${MODE:-auto}"
TOKEN="${UPLOAD_TOKEN:-}"

say()  { printf '\033[36m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$TOKEN" ] || fail "请先设置令牌：UPLOAD_TOKEN=\$(openssl rand -hex 24) bash deploy.sh"

# ---------------------------------------------------------------- 选路径
use_docker=false
if [ "$MODE" != "systemd" ] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  use_docker=true
fi

if $use_docker; then
  say "使用 Docker 部署（端口 $PORT）"
  printf 'UPLOAD_TOKEN=%s\n' "$TOKEN" > .env
  mkdir -p data static
  PORT="$PORT" docker compose up -d --build
else
  command -v node >/dev/null 2>&1 || fail "没找到 node，也没找到 docker。先装其一：
  Debian/Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
  CentOS/RHEL : sudo dnf install -y nodejs
或安装 Docker 后重跑本脚本。"

  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$NODE_MAJOR" -ge 18 ] || fail "Node 版本过低（当前 $(node -v)），需要 18 及以上"

  if [ "$(id -u)" = "0" ] && command -v systemctl >/dev/null 2>&1 && [ "$MODE" != "node" ]; then
    say "使用 systemd 安装到 /opt/rehab-server"
    mkdir -p /opt/rehab-server
    cp -r index.js store.js static /opt/rehab-server/ 2>/dev/null || true
    mkdir -p /opt/rehab-server/data /opt/rehab-server/static
    sed -e "s#/opt/rehab-server#/opt/rehab-server#g" \
        -e "s#Environment=UPLOAD_TOKEN=REPLACE_ME#Environment=UPLOAD_TOKEN=$TOKEN#" \
        -e "s#Environment=PORT=8787#Environment=PORT=$PORT#" \
        deploy/rehab-server.service > /etc/systemd/system/rehab-server.service
    systemctl daemon-reload
    systemctl enable --now rehab-server
    say "已启动：systemctl status rehab-server / journalctl -u rehab-server -f"
  else
    say "没有 root 或 systemd，用 nohup 前台守护（端口 $PORT）"
    mkdir -p data static
    UPLOAD_TOKEN="$TOKEN" PORT="$PORT" nohup node index.js > server.log 2>&1 &
    echo $! > server.pid
    say "已后台启动，PID $(cat server.pid)；日志：tail -f server.log"
  fi
fi

# ---------------------------------------------------------------- 自检
sleep 1.5
say "健康检查："
if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:$PORT/health" && echo || fail "健康检查失败，看日志排查"
else
  node -e "fetch('http://127.0.0.1:$PORT/health').then(r=>r.text()).then(console.log).catch(()=>process.exit(1))" \
    || fail "健康检查失败"
fi

cat <<TIP

下一步：
  1) 用 Nginx/Caddy 反代到 127.0.0.1:$PORT 并配 HTTPS（参考 deploy/Caddyfile 或 deploy/nginx.conf.example）
  2) 小程序「训练设置 → 训练数据上报」填：https://你的域名/api/v1/records
  3) 微信公众平台 → 服务器域名 → request 合法域名 加上你的域名
  4) 令牌务必自己存好，丢了就在服务器上改 UPLOAD_TOKEN 后重启服务

TIP
