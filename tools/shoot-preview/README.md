# 射击训练 · 浏览器预览与界面回归

不用微信开发者工具，直接在 Chrome 里跑 `pages/shoot`，用来抓渲染问题和 JS 报错。

改造后**游戏页只剩一块画布**（开始页 / 暂停 / 结算 / 底部按钮条都画在画布里），
治疗师参数搬到了 `pages/shoot-settings`，所以预览也只需要一个 canvas。

## 一、页面预览

```bash
node_modules/.bin/esbuild tools/shoot-preview/main.js --bundle --format=iife \
  --target=es2018 --define:global=window --outfile=tools/shoot-preview/bundle.js

# 拷到任意目录，然后
chrome --headless=new --window-size=390,844 --force-device-scale-factor=2 \
  --virtual-time-budget=4000 --screenshot=out.png \
  "file:///.../index.html?bare=1&screen=ready"
```

| 参数 | 说明 |
| --- | --- |
| `?screen=ready\|running\|paused\|ended` | 进入哪个状态（默认 ready） |
| `?angle=2` | 固定模拟倾角；不传就慢慢左右摆 |
| `?hz=50` | 模拟传感器帧率，`0` = 不喂数据（看「未连接 · 触屏模拟」） |
| `?bare=1` | 去掉外框留白 |

页面用真实代码：`onLoad → onReady → initCanvas`，点击换算成 `onTouchStart/onTouchEnd`，
所以按钮热区、状态切换、引擎事件都是真的在跑。

> headless 下 `requestAnimationFrame` 几乎不推进，`running/ended` 会在预览脚本里
> 手动推 150 帧（2.5 秒），否则截出来全是 0 分。

## 二、纯画布预览（只看引擎，不含页面层 UI）

```bash
node_modules/.bin/esbuild tools/shoot-preview/canvas-main.js --bundle --format=iife \
  --target=es2018 --define:global=window --outfile=tools/shoot-preview/canvas-bundle.js
chrome --headless=new --window-size=390,600 --force-device-scale-factor=2 \
  --screenshot=out.png "file:///.../canvas.html?w=390&h=600&dpr=2&state=paused"
```

参数：`?w= &h= &dpr= &state=ready|running|paused|ended&angle=`。

## 三、界面回归

```bash
node tools/shoot-ui-test.js     # 42 项
```

锁住四件事：

1. **开始 / 暂停 / 结算遮罩必须画在 dpr 变换之内**（曾经画在 `restore()` 之后，
   遮罩只盖左上 1/4、卡片半尺寸挤在左上角）；
2. 状态变化后 `canvas.width/height` 与 `engine.resize()` 要跟上；
3. 页面层 UI 的按钮热区（开始页只有开始/返回/设置；训练中才有暂停；暂停页主操作在卡片里）；
4. `afterRender` 注入的页面层同样要套 dpr 变换。

## 四、截图

`shots/` 下是改造后的实际渲染：

| 文件 | 说明 |
| --- | --- |
| `page-ready.png` | 开始页（玩法三步 + 本局参数 + 开始训练） |
| `page-running.png` | 训练中（HUD + 保持区 + 底部 返回/设置/暂停） |
| `page-paused.png` | 暂停（继续 / 重来 / 调整参数） |
| `page-ended.png` | 结算（总分 + 命中/连击/在界率 + 再来一局） |
