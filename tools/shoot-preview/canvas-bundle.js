(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // pkgShoot/games/shoot/config.js
  var require_config = __commonJS({
    "pkgShoot/games/shoot/config.js"(exports, module) {
      var STORAGE_KEY = "shoot_cfg_v2";
      var SAVE_DELAY = 300;
      var SCHEMA = {
        // ---------- 计时与计分 ----------
        gameDuration: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u6E38\u620F\u65F6\u957F", unit: "\u79D2", type: "num", min: 0, max: 300, step: 5, def: 60, tip: "0 \u8868\u793A\u4E0D\u9650\u65F6" },
        baseScorePerSecond: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u6BCF\u79D2\u57FA\u7840\u5206", unit: "\u5206", type: "num", min: 0, max: 10, step: 0.5, def: 1, tip: "\u6BCF\u79D2\u7ED3\u7B97\u4E00\u6B21\uFF0C\u4EC5\u5728\u4FDD\u6301\u8303\u56F4\u5185\u7D2F\u52A0" },
        tickMs: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u5224\u5B9A\u523B\u5EA6", unit: "ms", type: "num", min: 100, max: 500, step: 100, def: 100, hidden: true, tip: "0.1s = 100ms" },
        baseTickMs: { group: "\u8BA1\u65F6\u4E0E\u8BA1\u5206", label: "\u8BA1\u5206\u523B\u5EA6", unit: "ms", type: "num", min: 1e3, max: 1e3, step: 1e3, def: 1e3, hidden: true },
        // ---------- 子弹 ----------
        fireRate: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u53D1\u5C04\u9891\u7387", unit: "\u53D1/\u79D2", type: "num", min: 0.5, max: 12, step: 0.5, def: 3 },
        bulletSpeed: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u5B50\u5F39\u901F\u5EA6", unit: "px/s", type: "num", min: 300, max: 1400, step: 20, def: 760, hidden: true },
        spreadDeg: { group: "\u5B50\u5F39\u53D1\u5C04", label: "\u6563\u5C04\u89D2", unit: "\xB0", type: "num", min: 0, max: 10, step: 0.5, def: 0, hidden: true },
        // ---------- 判定 ----------
        hitRange: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u51FB\u4E2D\u5224\u5B9A\u534A\u5F84", unit: "px", type: "num", min: 8, max: 200, step: 2, def: 60, tip: "\u51FB\u4E2D\u8303\u56F4=\u4EE5\u5149\u6838\u4E2D\u5FC3\u4E3A\u539F\u70B9\u7684\u5BB9\u9519\u534A\u5F84\uFF0C\u6E38\u620F\u8FDB\u884C\u4E2D\u53EF\u5B9E\u65F6\u4FEE\u6539" },
        comboWindowMs: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u8FDE\u51FB\u7A97\u53E3", unit: "ms", type: "num", min: 100, max: 1e3, step: 50, def: 100, tip: "\u9ED8\u8BA4 100ms\uFF080.1 \u79D2\u523B\u5EA6\u5185\u8FDE\u7EED\u51FB\u4E2D\uFF09" },
        comboStep: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u6BCF\u7EA7\u8FDE\u51FB\u52A0\u6210", unit: "", type: "num", min: 0, max: 1, step: 0.05, def: 0.15, hidden: true },
        comboMaxMul: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u8FDE\u51FB\u52A0\u6210\u4E0A\u9650", unit: "\u500D", type: "num", min: 1, max: 6, step: 0.5, def: 3, hidden: true },
        // ---------- 得分浮动区间 ----------
        scoreMin: { group: "\u5F97\u5206\u6D6E\u52A8", label: "\u5355\u6B21\u5F97\u5206\u4E0B\u9650", unit: "\u5206", type: "num", min: 0, max: 99, step: 1, def: 1 },
        scoreMax: { group: "\u5F97\u5206\u6D6E\u52A8", label: "\u5355\u6B21\u5F97\u5206\u4E0A\u9650", unit: "\u5206", type: "num", min: 0, max: 99, step: 1, def: 3 },
        // ---------- 保持范围（体感，静态保持） ----------
        // 按实机佩戴方向，左右移动读取 Pitch 轴（实测该轴对应左右方向）；Roll 仅缓存。
        // 游戏小人按“镜像”方式跟随（见 pose.js），因此不再提供左右轴切换 / 反向开关。
        keepRangeDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u5141\u8BB8\u504F\u79BB\u89D2\u5EA6", unit: "\xB1\xB0", type: "num", min: 1, max: 60, step: 1, def: 6, tip: "\u9759\u6001\u4FDD\u6301\uFF1A\u8EAB\u4F53\u504F\u79BB\u8D85\u8FC7\u8BE5\u89D2\u5EA6\u5373\u63D0\u793A\u56DE\u5230\u4E2D\u95F4\uFF0C\u5E76\u6682\u505C\u57FA\u7840\u5206\uFF08\u5B50\u5F39\u4ECD\u4F1A\u53D1\u5C04\uFF09" },
        maxLeanDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u6EE1\u91CF\u7A0B\u503E\u659C\u89D2", unit: "\xB0", type: "num", min: 8, max: 60, step: 1, def: 20, tip: "\u8D8A\u5C0F\u8D8A\u7075\u654F\uFF1A\u503E\u659C\u5230\u8BE5\u89D2\u5EA6\u65F6\u51C6\u661F\u5230\u8FBE\u5C4F\u5E55\u8FB9\u7F18" },
        deadzoneDeg: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u4E2D\u5FC3\u6B7B\u533A", unit: "\xB0", type: "num", min: 0, max: 10, step: 0.5, def: 1, hidden: true },
        // smooth 是“跟手度”（0.5…1，越大越跟手）；默认 0.6，低于 0.5 会明显拖影，故不开放
        smooth: { group: "\u4FDD\u6301\u8303\u56F4", label: "\u59FF\u6001\u8DDF\u624B\u5EA6", type: "num", min: 0.5, max: 1, step: 0.05, def: 0.6, tip: "\u8D8A\u5927\u8D8A\u8DDF\u624B\u3001\u5EF6\u8FDF\u8D8A\u4F4E\uFF1B0.5 \u4EE5\u4E0B\u4F1A\u660E\u663E\u62D6\u5F71\uFF0C\u6545\u4E0D\u5F00\u653E" },
        // ---------- 目标（城市光核） ----------
        targetRadius: { group: "\u76EE\u6807", label: "\u5149\u6838\u5927\u5C0F", unit: "px", type: "num", min: 12, max: 48, step: 2, def: 22, hidden: true },
        // ---------- 难度 ----------
        difficulty: { group: "\u96BE\u5EA6", label: "\u96BE\u5EA6\u6863\u4F4D", type: "enum", def: "normal", options: ["easy", "normal", "hard", "expert"] },
        // ---------- 显示 / 音频 ----------
        showHitArea: { group: "\u663E\u793A", label: "\u663E\u793A\u5224\u5B9A\u5708", type: "bool", def: false },
        sfxOn: { group: "\u97F3\u9891", label: "\u97F3\u6548", type: "bool", def: true },
        bgmOn: { group: "\u97F3\u9891", label: "\u80CC\u666F\u97F3\u4E50", type: "bool", def: true }
      };
      var DIFFICULTIES = {
        easy: {
          label: "\u7B80\u5355",
          scoreMul: 0.8,
          fireRate: 2,
          hitRange: 88,
          scoreMin: 1,
          scoreMax: 2,
          keepRangeDeg: 10,
          maxLeanDeg: 24,
          comboStep: 0.1,
          comboMaxMul: 2,
          targetRadius: 26
        },
        normal: {
          label: "\u6807\u51C6",
          scoreMul: 1,
          fireRate: 3,
          hitRange: 60,
          scoreMin: 1,
          scoreMax: 3,
          keepRangeDeg: 6,
          maxLeanDeg: 20,
          comboStep: 0.15,
          comboMaxMul: 3,
          targetRadius: 22
        },
        hard: {
          label: "\u56F0\u96BE",
          scoreMul: 1.5,
          fireRate: 4,
          hitRange: 44,
          scoreMin: 2,
          scoreMax: 5,
          keepRangeDeg: 4,
          maxLeanDeg: 18,
          comboStep: 0.2,
          comboMaxMul: 4,
          targetRadius: 20
        },
        expert: {
          label: "\u6781\u9650",
          scoreMul: 2,
          fireRate: 5,
          hitRange: 32,
          scoreMin: 3,
          scoreMax: 8,
          keepRangeDeg: 2,
          maxLeanDeg: 16,
          comboStep: 0.25,
          comboMaxMul: 5,
          targetRadius: 18
        }
      };
      var PANEL_GROUPS = ["\u8BA1\u65F6\u4E0E\u8BA1\u5206", "\u5B50\u5F39\u53D1\u5C04", "\u51FB\u4E2D\u5224\u5B9A", "\u5F97\u5206\u6D6E\u52A8", "\u4FDD\u6301\u8303\u56F4", "\u76EE\u6807", "\u96BE\u5EA6", "\u663E\u793A", "\u97F3\u9891"];
      function isNum(v) {
        return typeof v === "number" && isFinite(v);
      }
      function clampNum(value, meta) {
        let v = Number(value);
        if (!isFinite(v)) v = meta.def;
        if (isNum(meta.min) && v < meta.min) v = meta.min;
        if (isNum(meta.max) && v > meta.max) v = meta.max;
        if (meta.step) v = Math.round(v / meta.step) * meta.step;
        return Math.round(v * 100) / 100;
      }
      function coerce(key, value) {
        const meta = SCHEMA[key];
        if (!meta) return void 0;
        if (meta.type === "bool") {
          if (typeof value === "boolean") return value;
          if (value === "true" || value === 1 || value === "1") return true;
          if (value === "false" || value === 0 || value === "0") return false;
          return meta.def;
        }
        if (meta.type === "enum") {
          const opts = meta.options || Object.keys(DIFFICULTIES);
          return opts.indexOf(value) >= 0 ? value : meta.def;
        }
        return clampNum(value, meta);
      }
      function defaults() {
        const d = {};
        Object.keys(SCHEMA).forEach((k) => {
          d[k] = SCHEMA[k].def;
        });
        return d;
      }
      var DEFAULT_CONFIG = defaults();
      var ConfigStore = class {
        constructor(options) {
          const opt = options || {};
          this.key = opt.storageKey || STORAGE_KEY;
          this.persistEnabled = opt.persist !== false;
          this.state = defaults();
          this.listeners = [];
          this.saveTimer = null;
          if (this.persistEnabled) this.load();
        }
        // ---------- 读写 ----------
        get(key) {
          if (key === void 0) return this.state;
          const v = this.state[key];
          return v === void 0 ? SCHEMA[key] ? SCHEMA[key].def : void 0 : v;
        }
        all() {
          return Object.assign({}, this.state);
        }
        /** 批量修改（治疗师面板 / 远程 API 都走这里），返回真正变化的键 */
        patch(partial, source) {
          if (!partial) return [];
          const changed = [];
          Object.keys(partial).forEach((k) => {
            if (!SCHEMA[k]) return;
            const next = coerce(k, partial[k]);
            if (next === void 0) return;
            if (this.state[k] !== next) {
              this.state[k] = next;
              changed.push(k);
            }
          });
          if (!changed.length) return changed;
          this.fixScoreRange(changed);
          this.scheduleSave();
          this.emit(changed, source || "patch");
          return changed;
        }
        set(key, value, source) {
          const p = {};
          p[key] = value;
          const changed = this.patch(p, source || "set:" + key);
          return changed.length ? this.state[key] : this.get(key);
        }
        fixScoreRange(changed) {
          if (changed.indexOf("scoreMin") >= 0 && this.state.scoreMin > this.state.scoreMax) {
            this.state.scoreMax = this.state.scoreMin;
          }
          if (changed.indexOf("scoreMax") >= 0 && this.state.scoreMax < this.state.scoreMin) {
            this.state.scoreMin = this.state.scoreMax;
          }
        }
        /** 得分浮动区间 [min, max]（已保证 min <= max） */
        getScoreRange() {
          const a = this.state.scoreMin;
          const b = this.state.scoreMax;
          return a <= b ? [a, b] : [b, a];
        }
        // ---------- 难度 ----------
        listDifficulty() {
          return Object.keys(DIFFICULTIES).map((k) => ({
            key: k,
            label: DIFFICULTIES[k].label,
            scoreMul: DIFFICULTIES[k].scoreMul
          }));
        }
        getDifficulty() {
          return DIFFICULTIES[this.state.difficulty] || DIFFICULTIES.normal;
        }
        getScoreMul() {
          return this.getDifficulty().scoreMul;
        }
        /** 套用难度预设（可只改难度不改参数：immediate=false 只记档位） */
        applyDifficulty(level, applyPreset) {
          const preset = DIFFICULTIES[level];
          if (!preset) return [];
          const p = { difficulty: level };
          if (applyPreset !== false) {
            Object.keys(preset).forEach((k) => {
              if (k === "label") return;
              if (SCHEMA[k]) p[k] = preset[k];
            });
          }
          return this.patch(p, "difficulty:" + level);
        }
        // ---------- 订阅 ----------
        subscribe(fn) {
          if (typeof fn !== "function") return () => {
          };
          this.listeners.push(fn);
          const that = this;
          return function off() {
            const i = that.listeners.indexOf(fn);
            if (i >= 0) that.listeners.splice(i, 1);
          };
        }
        emit(changed, source) {
          const payload = { config: this.all(), changed, source };
          this.listeners.slice().forEach((fn) => {
            try {
              fn(payload);
            } catch (e) {
              console.error("[game.config] listener error", e);
            }
          });
        }
        // ---------- 持久化 ----------
        load() {
          let saved = null;
          try {
            saved = wx.getStorageSync(this.key);
          } catch (e) {
          }
          if (saved && typeof saved === "object") {
            Object.keys(SCHEMA).forEach((k) => {
              if (saved[k] !== void 0) this.state[k] = coerce(k, saved[k]);
            });
            this.fixScoreRange(["scoreMin", "scoreMax"]);
          }
          return this.state;
        }
        scheduleSave() {
          if (!this.persistEnabled) return;
          if (this.saveTimer) return;
          const that = this;
          this.saveTimer = setTimeout(function() {
            that.saveTimer = null;
            that.save();
          }, SAVE_DELAY);
        }
        save() {
          if (!this.persistEnabled) return;
          try {
            wx.setStorageSync(this.key, this.state);
          } catch (e) {
          }
        }
        /** 恢复出厂参数 */
        reset() {
          const changed = [];
          Object.keys(DEFAULT_CONFIG).forEach((k) => {
            if (this.state[k] !== DEFAULT_CONFIG[k]) {
              this.state[k] = DEFAULT_CONFIG[k];
              changed.push(k);
            }
          });
          this.save();
          if (changed.length) this.emit(changed, "reset");
          return changed;
        }
      };
      var sharedStore = null;
      function getStore2() {
        if (!sharedStore) sharedStore = new ConfigStore();
        return sharedStore;
      }
      module.exports = {
        ConfigStore,
        getStore: getStore2,
        SCHEMA,
        DEFAULT_CONFIG,
        DIFFICULTIES,
        PANEL_GROUPS,
        STORAGE_KEY,
        coerce
      };
    }
  });

  // pkgShoot/games/shoot/sprites.js
  var require_sprites = __commonJS({
    "pkgShoot/games/shoot/sprites.js"(exports, module) {
      var DEFAULT_BASE = "/assets/games/shoot/";
      var BASE = DEFAULT_BASE;
      function setBase(p) {
        BASE = p || DEFAULT_BASE;
      }
      var ASSETS = {
        laser: "laser.png",
        // 子弹（9×37）
        star: "star.png",
        // 粒子（25×24）
        // 战机：项目内用 Blender 脚本建的低模（313 顶点 / 251 面），离线渲染成
        // 306×216 PNG，比例正好是 engine._shipBox 的 68:48，drawImage 可以直接铺满。
        // **运行时没有任何 3D** —— 就是一张位图。加载失败时引擎自动退回矢量版。
        fighter: "fighter.png"
      };
      function readAsDataUri(src) {
        try {
          const fs = wx.getFileSystemManager();
          const b64 = fs.readFileSync(src.replace(/^\//, ""), "base64");
          return "data:image/png;base64," + b64;
        } catch (e) {
          return "";
        }
      }
      function makeImage(canvas2) {
        if (canvas2 && typeof canvas2.createImage === "function") {
          try {
            return canvas2.createImage();
          } catch (e) {
          }
        }
        if (typeof Image !== "undefined") {
          try {
            return new Image();
          } catch (e) {
          }
        }
        return null;
      }
      function loadOne(canvas2, src) {
        return new Promise((resolve) => {
          let img = null;
          try {
            img = makeImage(canvas2);
          } catch (e) {
            resolve(null);
            return;
          }
          if (!img) {
            resolve(null);
            return;
          }
          let settled = false;
          const finish = (val) => {
            if (settled) return;
            settled = true;
            resolve(val);
          };
          img.onload = () => finish(img);
          img.onerror = () => {
            const uri = readAsDataUri(src);
            if (!uri) {
              finish(null);
              return;
            }
            let img2 = null;
            try {
              img2 = makeImage(canvas2);
            } catch (e) {
              finish(null);
              return;
            }
            if (!img2) {
              finish(null);
              return;
            }
            img2.onload = () => finish(img2);
            img2.onerror = () => finish(null);
            img2.src = uri;
          };
          img.src = src;
          setTimeout(() => {
            if (settled) return;
            if (img && img.width > 0) finish(img);
            else finish(null);
          }, 5e3);
        });
      }
      var SpriteBank = class {
        constructor(canvas2) {
          this.canvas = canvas2;
          this.map = {};
          this.count = 0;
          this.total = Object.keys(ASSETS).length;
          this.loading = false;
        }
        /** 异步加载全部贴图，返回成功数量（失败也不抛错） */
        load() {
          if (this.loading) return Promise.resolve(this.count);
          this.loading = true;
          const that = this;
          const tasks = Object.keys(ASSETS).map((key) => loadOne(this.canvas, BASE + ASSETS[key]).then((img) => {
            if (img) {
              that.map[key] = img;
              that.count += 1;
            }
          }));
          return Promise.all(tasks).then(() => {
            that.loading = false;
            return that.count;
          });
        }
        get(key) {
          return this.map[key] || null;
        }
        has(key) {
          return !!this.map[key];
        }
        /** 是否全部就绪（用于决定用贴图还是矢量） */
        isReady() {
          return this.count >= this.total;
        }
      };
      module.exports = { SpriteBank, ASSETS, BASE: DEFAULT_BASE, DEFAULT_BASE, setBase };
    }
  });

  // pkgShoot/games/shoot/score.js
  var require_score = __commonJS({
    "pkgShoot/games/shoot/score.js"(exports, module) {
      var ScoreManager = class {
        /**
         * @param {ConfigStore} cfg 配置中心（运行时读取，随时改随时生效）
         * @param {Object} options { rng: ()=>number }
         */
        constructor(cfg2, options) {
          const opt = options || {};
          this.cfg = cfg2;
          this.rng = typeof opt.rng === "function" ? opt.rng : Math.random;
          this.reset();
        }
        reset() {
          this.score = 0;
          this.baseScore = 0;
          this.hits = 0;
          this.shots = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.tick = 0;
          this.lastHitTick = -99999;
          this.elapsedSec = 0;
          this.inZoneSec = 0;
          this.hitTicks = 0;
          this.comboEvents = 0;
          this.baseCarry = 0;
        }
        // ---------- 刻度换算 ----------
        comboWindowTicks() {
          const tick = Math.max(1, Number(this.cfg.get("tickMs")) || 100);
          const win = Math.max(tick, Number(this.cfg.get("comboWindowMs")) || 100);
          return Math.max(1, Math.round(win / tick));
        }
        /** 得分浮动区间内取一个整数（含端点） */
        rollBase() {
          const range = this.cfg.getScoreRange();
          const lo = Math.round(range[0]);
          const hi = Math.round(range[1]);
          if (hi <= lo) return lo;
          return lo + Math.floor(this.rng() * (hi - lo + 1));
        }
        // ---------- 0.1s 刻度：击中累计 + 连击 ----------
        /**
         * @param {number} tickIndex 刻度序号（0,1,2...）
         * @param {Array}  hits      本刻度内发生的命中（[{x,y,targetId}]），可为空
         * @returns {Array} 事件列表，交给引擎配音效 / 飘字
         */
        onTick(tickIndex, hits) {
          this.tick = tickIndex;
          const list = hits && hits.length ? hits : [];
          const events = [];
          if (list.length) {
            this.hitTicks += 1;
            const windowTicks = this.comboWindowTicks();
            for (let i = 0; i < list.length; i++) {
              const h = list[i];
              const continuous = tickIndex - this.lastHitTick <= windowTicks;
              this.combo = continuous ? this.combo + 1 : 1;
              this.lastHitTick = tickIndex;
              if (this.combo > this.maxCombo) this.maxCombo = this.combo;
              const base = this.rollBase();
              const step = Number(this.cfg.get("comboStep")) || 0;
              const cap = Number(this.cfg.get("comboMaxMul")) || 1;
              const mul = Math.min(1 + (this.combo - 1) * step, cap);
              const gain = Math.max(0, Math.round(base * this.cfg.getScoreMul() * mul));
              this.score += gain;
              this.hits += 1;
              if (this.combo >= 2) this.comboEvents += 1;
              events.push({
                type: "hit",
                x: h.x,
                y: h.y,
                gain,
                base,
                mul: Math.round(mul * 100) / 100,
                combo: this.combo,
                score: this.score
              });
            }
            if (events.length > 1) {
              events[events.length - 1].multi = events.length;
            }
            return events;
          }
          if (this.combo > 0 && tickIndex - this.lastHitTick > this.comboWindowTicks()) {
            const broken = this.combo;
            this.combo = 0;
            events.push({ type: "comboEnd", combo: broken });
          }
          return events;
        }
        // ---------- 1.0s 基础刻度 ----------
        /**
         * @param {boolean} inZone 本秒是否保持在允许范围内
         * @returns {Object} { type:'second', elapsed, inZone, gain }
         */
        onSecond(inZone) {
          this.elapsedSec += 1;
          let gain = 0;
          if (inZone) {
            this.inZoneSec += 1;
            const per = Number(this.cfg.get("baseScorePerSecond")) || 0;
            this.baseCarry += per;
            gain = Math.floor(this.baseCarry + 1e-9);
            this.baseCarry = Math.max(0, this.baseCarry - gain);
            this.baseScore += gain;
            this.score += gain;
          }
          return { type: "second", elapsed: this.elapsedSec, inZone: !!inZone, gain };
        }
        // ---------- 统计 ----------
        stats() {
          const total = Math.max(1, this.elapsedSec);
          return {
            score: Math.round(this.score),
            baseScore: Math.round(this.baseScore),
            hits: this.hits,
            shots: this.shots,
            combo: this.combo,
            maxCombo: this.maxCombo,
            elapsedSec: this.elapsedSec,
            inZoneSec: this.inZoneSec,
            zoneRate: Math.round(this.inZoneSec / total * 100),
            accuracy: this.shots > 0 ? Math.round(this.hits / this.shots * 100) : 0,
            comboEvents: this.comboEvents
          };
        }
      };
      module.exports = { ScoreManager };
    }
  });

  // pkgShoot/games/shoot/bullet.js
  var require_bullet = __commonJS({
    "pkgShoot/games/shoot/bullet.js"(exports, module) {
      var BulletSystem = class {
        constructor(cfg2, options) {
          const opt = options || {};
          this.cfg = cfg2;
          this.width = opt.width || 375;
          this.height = opt.height || 600;
          this.list = [];
          this.pool = [];
          this.max = opt.max || 160;
          this.seq = 0;
          this.nearY = 0;
          this.farY = 0;
        }
        resize(width, height) {
          this.width = width;
          this.height = height;
        }
        /**
         * 纵深参考面：nearY = 枪口所在屏幕 y（最近），farY = 目标所在屏幕 y（最远）。
         * 子弹按「飞过的距离占比」从 1 缩到 0.45，形成「射向深处」的观感。
         */
        setDepthRange(nearY, farY) {
          this.nearY = Number(nearY) || 0;
          this.farY = Number(farY) || 0;
        }
        /**
         * 由飞行进度推纵深缩放。
         * 不用地面透视公式，因为光核悬在地平线之上（MONSTER_Y_RATIO 0.40 <
         * HORIZON_RATIO 0.52），地面那套 y = horizonY + floorH/u 对它不成立。
         * 打空后子弹继续往上飞，t 锁在 1，不再继续缩小（否则会缩成一个点，像消失了）。
         */
        _depthOf(b) {
          const span = b.oy - this.farY;
          if (!(span > 1)) {
            b.k = 1;
            b.a = 1;
            return;
          }
          let t = (b.oy - b.y) / span;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          b.k = 1 - 0.55 * t;
          b.a = 1 - 0.22 * t;
        }
        /** 开火：从 (x, y) 向上发射一颗子弹 */
        fire(x, y, extra) {
          const speed = Number(this.cfg.get("bulletSpeed")) || 760;
          const spread = (Number(this.cfg.get("spreadDeg")) || 0) * Math.PI / 180;
          const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * spread;
          const bullet = this.pool.pop() || {};
          bullet.id = ++this.seq;
          bullet.x = x;
          bullet.y = y;
          bullet.px = x;
          bullet.py = y;
          bullet.vx = Math.cos(angle) * speed;
          bullet.vy = Math.sin(angle) * speed;
          bullet.r = 3.4;
          bullet.life = 0;
          bullet.alive = true;
          bullet.oy = y;
          bullet.k = 1;
          bullet.a = 1;
          if (extra && extra.color) bullet.color = extra.color;
          this.list.push(bullet);
          if (this.list.length > this.max) this.recycle(0);
          return bullet;
        }
        recycle(index) {
          const b = this.list[index];
          if (!b) return;
          this.list.splice(index, 1);
          b.alive = false;
          if (this.pool.length < 120) this.pool.push(b);
        }
        update(dt) {
          const w = this.width;
          const h = this.height;
          for (let i = this.list.length - 1; i >= 0; i--) {
            const b = this.list[i];
            b.px = b.x;
            b.py = b.y;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life += dt;
            this._depthOf(b);
            if (b.y < -24 || b.x < -24 || b.x > w + 24 || b.y > h + 24) {
              this.recycle(i);
            }
          }
        }
        /** 命中后移除 */
        kill(bullet) {
          const i = this.list.indexOf(bullet);
          if (i >= 0) this.recycle(i);
        }
        clear() {
          while (this.list.length) this.recycle(this.list.length - 1);
        }
        get count() {
          return this.list.length;
        }
      };
      module.exports = { BulletSystem };
    }
  });

  // pkgShoot/games/shoot/hit.js
  var require_hit = __commonJS({
    "pkgShoot/games/shoot/hit.js"(exports, module) {
      var MIN_RANGE = 8;
      var MAX_RANGE = 200;
      function dist2(ax, ay, bx, by) {
        const dx = ax - bx;
        const dy = ay - by;
        return dx * dx + dy * dy;
      }
      var HitDetector = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.lastHits = 0;
        }
        /** 当前判定半径（px） */
        getRange() {
          return Number(this.cfg.get("hitRange")) || 0;
        }
        /** 实时调整判定范围：返回收敛后的值 */
        setRange(range) {
          let r = Number(range);
          if (!isFinite(r)) r = this.getRange();
          r = Math.max(MIN_RANGE, Math.min(MAX_RANGE, r));
          this.cfg.set("hitRange", r, "api:setHitArea");
          return this.cfg.get("hitRange");
        }
        /** 圆-圆：点是否落在判定范围内 */
        test(x, y, target) {
          const r = this.getRange();
          const tr = target.radius || 0;
          const radius = Math.max(r, tr);
          return dist2(x, y, target.x, target.y) <= radius * radius;
        }
        /**
         * 线段-圆扫掠：子弹从 (x0,y0) 走到 (x1,y1)，是否穿过判定圈
         * @returns {Object|null} 命中时返回 { x, y, distance }
         */
        sweep(x0, y0, x1, y1, target) {
          const r = Math.max(this.getRange(), target.radius || 0);
          const dx = x1 - x0;
          const dy = y1 - y0;
          const len2 = dx * dx + dy * dy;
          let t = 0;
          if (len2 > 1e-6) {
            t = ((target.x - x0) * dx + (target.y - y0) * dy) / len2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
          }
          const cx = x0 + dx * t;
          const cy = y0 + dy * t;
          const d2 = dist2(cx, cy, target.x, target.y);
          if (d2 > r * r) return null;
          return { x: cx, y: cy, distance: Math.sqrt(d2) };
        }
        /**
         * 批量结算：一次遍历，每颗子弹只消耗一次，每个目标同一帧只记一次
         * @param {Array} bullets BulletSystem.list
         * @param {Array} targets 目标数组
         * @param {Function} onHit (bullet, target, point) => void
         */
        resolve(bullets, targets, onHit) {
          let count = 0;
          for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (!b || !b.alive) continue;
            for (let j = 0; j < targets.length; j++) {
              const t = targets[j];
              if (!t || t.dead || t.hitThisFrame) continue;
              const hit = this.sweep(b.px, b.py, b.x, b.y, t);
              if (!hit) continue;
              t.hitThisFrame = true;
              count += 1;
              if (typeof onHit === "function") onHit(b, t, hit);
              break;
            }
          }
          this.lastHits = count;
          return count;
        }
      };
      module.exports = { HitDetector, MIN_RANGE, MAX_RANGE };
    }
  });

  // pkgShoot/games/shoot/pose.js
  var require_pose = __commonJS({
    "pkgShoot/games/shoot/pose.js"(exports, module) {
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      var MIRROR_SIGN = -1;
      var PoseTracker = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.roll = 0;
          this.pitch = 0;
          this.angle = 0;
          this.bodyAngle = 0;
          this.norm = 0;
          this.x01 = 0.5;
          this.inZone = true;
          this.dir = "center";
          this.stale = true;
          this.hasSignal = false;
          this.lastSignalAt = 0;
          this.simAngle = 0;
          this.age = 0;
          this.rateHz = 0;
          this._rateAt = 0;
          this._rateCount = 0;
        }
        /** 传感器数据帧：{ roll, pitch } —— 只要带 roll/pitch 的帧就刷新信号时间 */
        feed(frame) {
          if (!frame) return;
          if (typeof frame.roll === "number") this.roll = frame.roll;
          if (typeof frame.pitch === "number") this.pitch = frame.pitch;
          if (typeof frame.roll === "number" || typeof frame.pitch === "number") {
            this.hasSignal = true;
            this.lastSignalAt = Date.now();
            this.stale = false;
            const now = this.lastSignalAt;
            if (!this._rateAt) {
              this._rateAt = now;
              this._rateCount = 0;
            }
            this._rateCount += 1;
            const span = now - this._rateAt;
            if (span >= 1e3) {
              this.rateHz = Math.round(this._rateCount * 1e3 / span);
              this._rateAt = now;
              this._rateCount = 0;
            }
          }
        }
        /** 触屏模拟（未连接传感器 / 没有真机时用来演示） */
        setSimAngle(deg) {
          this.simAngle = deg;
        }
        isSimulating() {
          return this.stale || !this.hasSignal;
        }
        /** 左右移动读取的原始角度：按实机佩戴方向，Pitch 对应左右 */
        rawAngle() {
          return this.pitch;
        }
        /** 每帧更新（now 为引擎时间戳，dt 用于做帧率无关的平滑） */
        update(now, dt) {
          const age = now - this.lastSignalAt;
          if (this.hasSignal && age > 1200) this.stale = true;
          this.age = age;
          const cfg2 = this.cfg;
          const raw = this.rawAngle();
          const target = this.stale ? this.simAngle : MIRROR_SIGN * raw;
          const targetBody = this.stale ? this.simAngle : raw;
          const smoothCfg = Number(cfg2.get("smooth"));
          const base = clamp(isFinite(smoothCfg) ? Math.max(0.5, smoothCfg) : 0.6, 0.05, 1);
          const step = clamp(Number(dt) || 1 / 60, 1e-3, 0.1);
          const alpha = 1 - Math.pow(1 - base, step * 60);
          this.angle += (target - this.angle) * alpha;
          this.bodyAngle += (targetBody - this.bodyAngle) * alpha;
          const dead = Number(cfg2.get("deadzoneDeg")) || 0;
          let v = this.angle;
          if (Math.abs(v) < dead) v = 0;
          let bodyV = this.bodyAngle;
          if (Math.abs(bodyV) < dead) bodyV = 0;
          const maxLean = Math.max(5, Number(cfg2.get("maxLeanDeg")) || 20);
          const keep = Math.max(1, Number(cfg2.get("keepRangeDeg")) || 6);
          this.norm = clamp(v / maxLean, -1, 1);
          this.x01 = (this.norm + 1) / 2;
          this.inZone = Math.abs(bodyV) <= keep + 1e-3;
          const thr = 2;
          if (bodyV < -thr) this.dir = "left";
          else if (bodyV > thr) this.dir = "right";
          else this.dir = "center";
          return this;
        }
        /** 当前患者身体偏离角度（°），用于 HUD / 页面显示 */
        getAngle() {
          return Math.round(this.bodyAngle * 10) / 10;
        }
        /** 保持范围内还剩多少余量（0…1），用于画进度条 */
        zoneRatio() {
          const keep = Math.max(1, Number(this.cfg.get("keepRangeDeg")) || 6);
          return clamp(1 - Math.abs(this.bodyAngle) / keep, 0, 1);
        }
        reset() {
          this.angle = 0;
          this.bodyAngle = 0;
          this.norm = 0;
          this.x01 = 0.5;
          this.inZone = true;
          this.dir = "center";
        }
      };
      module.exports = { PoseTracker };
    }
  });

  // pkgShoot/games/shoot/scene2d.js
  var require_scene2d = __commonJS({
    "pkgShoot/games/shoot/scene2d.js"(exports, module) {
      var TAU = Math.PI * 2;
      var HORIZON_RATIO = 0.52;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function softShadow(ctx2, x, y, rx, ry, alpha) {
        if (rx <= 0 || ry <= 0) return;
        const a = clamp(alpha, 0, 1);
        ctx2.save();
        ctx2.translate(x, y);
        ctx2.scale(1, ry / rx);
        const g = ctx2.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, "rgba(0,0,0," + a.toFixed(3) + ")");
        g.addColorStop(0.5, "rgba(0,0,0," + (a * 0.55).toFixed(3) + ")");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.arc(0, 0, rx, 0, TAU);
        ctx2.fill();
        ctx2.restore();
      }
      function fillEllipse(ctx2, x, y, rx, ry, style) {
        if (rx <= 0 || ry <= 0) return;
        ctx2.save();
        ctx2.translate(x, y);
        ctx2.scale(1, ry / rx);
        ctx2.fillStyle = style;
        ctx2.beginPath();
        ctx2.arc(0, 0, rx, 0, TAU);
        ctx2.fill();
        ctx2.restore();
      }
      function ringEllipse(ctx2, x, y, rx, ry, style, lw) {
        if (rx <= 0 || ry <= 0) return;
        ctx2.save();
        ctx2.translate(x, y);
        ctx2.scale(1, ry / rx);
        ctx2.beginPath();
        ctx2.arc(0, 0, rx, 0, TAU);
        ctx2.strokeStyle = style;
        ctx2.lineWidth = lw || 1;
        ctx2.stroke();
        ctx2.restore();
      }
      function hash01(i, salt) {
        const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
        return x - Math.floor(x);
      }
      function buildGrain(w, h, quality) {
        const q = quality === void 0 ? 2 : quality;
        const n = q >= 2 ? 300 : q === 1 ? 140 : 0;
        const frames = [];
        if (!n) return frames;
        for (let f = 0; f < 4; f++) {
          const dark = [];
          const light = [];
          for (let i = 0; i < n; i++) {
            const p = {
              x: Math.round(Math.random() * w),
              y: Math.round(Math.random() * h),
              // 85% 是 1px，少量 2px —— 全是 1px 会像均匀的抖动噪点，不像颗粒
              s: Math.random() < 0.85 ? 1 : 2
            };
            if (Math.random() < 0.62) dark.push(p);
            else light.push(p);
          }
          frames.push({ dark, light });
        }
        return frames;
      }
      function buildScene(w, h, quality) {
        const q = quality === void 0 ? 2 : quality;
        const horizonY = h * HORIZON_RATIO;
        const stars = [];
        const mul = q >= 2 ? 1 : q === 1 ? 0.6 : 0.35;
        const layers = [
          { n: Math.round(w * h / 11e3 * mul), r0: 0.45, r1: 0.9, a0: 0.18, a1: 0.45, sp: 3 },
          { n: Math.round(w * h / 22e3 * mul), r0: 0.7, r1: 1.5, a0: 0.3, a1: 0.65, sp: 9 },
          { n: Math.round(w * h / 3e4 * mul), r0: 1.1, r1: 2.1, a0: 0.45, a1: 0.85, sp: 20 }
        ];
        for (let L = 0; L < layers.length; L++) {
          const cfg2 = layers[L];
          for (let i = 0; i < cfg2.n; i++) {
            stars.push({
              x: Math.random() * w,
              y: Math.random() * h * 0.92,
              // 尺寸长尾分布：均匀随机在缩略图上是一层「沙」，
              // 只有少数几颗明显更大更亮，天空才有景深。
              r: (cfg2.r0 + Math.random() * (cfg2.r1 - cfg2.r0)) * (Math.random() < 0.055 ? 2.5 : 1),
              a: cfg2.a0 + Math.random() * (cfg2.a1 - cfg2.a0),
              sp: cfg2.sp * (0.7 + Math.random() * 0.6),
              p: Math.random() * TAU,
              near: L === 2,
              // 近层星点带一点色偏，别全是纯白
              tint: Math.random() < 0.25 ? "198,228,255" : "226,240,255"
            });
          }
        }
        const nebula = [];
        const nebColors = ["92,84,190", "40,150,170"];
        for (let i = 0; i < 2; i++) {
          const bx = w * (0.2 + Math.random() * 0.6);
          const by = horizonY * (0.22 + Math.random() * 0.5);
          const br = Math.max(w, h) * (0.26 + Math.random() * 0.16);
          nebula.push({
            blobs: [
              { ox: 0, oy: 0, r: br },
              { ox: br * (0.42 + Math.random() * 0.3), oy: br * (0.18 + Math.random() * 0.22), r: br * 0.68 }
            ],
            x: bx,
            y: by,
            c: nebColors[i % nebColors.length],
            a: 0.055 + Math.random() * 0.03,
            dx: (Math.random() - 0.5) * 6,
            dy: (Math.random() - 0.5) * 3
          });
        }
        const dust = [];
        const dustN = q >= 2 ? 9 : q === 1 ? 5 : 2;
        for (let i = 0; i < dustN; i++) {
          dust.push({
            x: Math.random() * w,
            y: horizonY + Math.random() * (h - horizonY),
            r: 0.8 + Math.random() * 1.8,
            a: 0.1 + Math.random() * 0.22,
            sp: 4 + Math.random() * 9,
            p: Math.random() * TAU
          });
        }
        const spires = [];
        const CITY_SCALE = 1.5;
        const spireN = Math.max(14, Math.round(w / 10));
        for (let i = 0; i < spireN; i++) {
          const r1 = hash01(i, 11);
          const r2 = hash01(i, 23);
          const r3 = hash01(i, 37);
          const r4 = hash01(i, 53);
          if (r4 < 0.22) continue;
          const tall = r2 > 0.93;
          spires.push({
            x: (i + r1 * 0.85) / spireN,
            h: (tall ? 0.092 + r3 * 0.036 : 0.012 + r2 * r2 * 0.06) * CITY_SCALE,
            w: ((tall ? 62e-4 : 32e-4) + r3 * 72e-4) * CITY_SCALE,
            tip: r3 > 0.72,
            // 少量塔带倾角：异星建筑最省力的「不地球」信号
            lean: r4 > 0.86 ? (r1 - 0.5) * 0.3 : 0
          });
        }
        const lamps = [];
        for (let i = 0; i < spires.length; i++) {
          const s = spires[i];
          if (s.h * w < 0.014 * w) continue;
          const nWin = Math.max(1, Math.min(13, Math.round(s.h * w / 4.5)));
          for (let k = 0; k < nWin; k++) {
            const nx = s.x + (hash01(i, 300 + k) - 0.5) * s.w * 1.15;
            lamps.push({
              // 归一化坐标（0..1），绘制时按含超扫的全宽映射，和尖塔同一套
              nx,
              // 从塔尖往下 0.16~0.86 分布
              ny: s.h * (0.16 + hash01(i, 400 + k) * 0.7),
              warm: hash01(i, 500 + k) > 0.32,
              // 点亮顺序：离屏幕中心越近越先亮
              d: Math.abs(nx - 0.5)
            });
          }
        }
        lamps.sort(function(a, b) {
          return a.d - b.d;
        });
        const street = [];
        const streetN = q >= 2 ? 200 : q === 1 ? 100 : 0;
        for (let i = 0; i < streetN; i++) {
          street.push({
            nx: (i + Math.random() * 0.85) / streetN,
            // 归一化 y：贴着地平线往上 0.6~11px（乘 w）。
            // 幂次 1.7 让绝大部分挤在底部：街道最亮，越往上越稀 ——
            // 均匀分布会读成一条横线，不是一片城。
            ny: 15e-4 + Math.pow(Math.random(), 1.7) * 0.04,
            warm: Math.random() > 0.22,
            ph: Math.random() * TAU
          });
        }
        return {
          w,
          h,
          horizonY,
          // 异星尖塔剪影：地平线上的一圈建筑。
          // 用「窄峰」而不是「平滑起伏」——平滑的会被读成地球上的远山，
          // 只有垂直的窄峰才读得出「异星城市」。
          spires,
          // 城市灯火（已按点亮顺序排好）。数量就是这一局的「满格」。
          lamps,
          // 街道灯带：整体亮度跟 light，不逐个点亮
          street,
          // 背景视差（px）：引擎每帧按患者侧屈写入，本文件只在绘制时读取。
          // 只作用于装饰层（星 / 行星 / 山脊），绝不参与任何逻辑坐标。
          parallax: 0,
          stars,
          nebula,
          dust,
          // 全屏颗粒（4 帧循环），见 buildGrain。画在暗角和 HUD 之间。
          grain: buildGrain(w, h, q),
          planet: {
            // 放在左上偏下（避开两块 HUD 卡片），做远景点缀而不是主角
            x: w * (0.13 + Math.random() * 0.04),
            y: horizonY * (0.34 + Math.random() * 0.08),
            r: Math.max(13, w * 0.055),
            tilt: -0.34
          }
        };
      }
      function drawSky(ctx2, sc, o) {
        const w = sc.w;
        const h = sc.h;
        const hz = sc.horizonY;
        const g = ctx2.createLinearGradient(0, 0, 0, hz);
        g.addColorStop(0, "#02040a");
        g.addColorStop(0.42, "#040b16");
        g.addColorStop(0.78, "#071422");
        g.addColorStop(1, "#0a1c2b");
        ctx2.fillStyle = g;
        ctx2.fillRect(0, 0, w, h);
        const halo = ctx2.createRadialGradient(
          w * 0.5,
          hz,
          4,
          w * 0.5,
          hz,
          Math.max(w, h) * 0.62
        );
        halo.addColorStop(0, "rgba(48,206,186,0.155)");
        halo.addColorStop(0.35, "rgba(32,150,160,0.062)");
        halo.addColorStop(1, "rgba(10,40,60,0)");
        ctx2.fillStyle = halo;
        ctx2.fillRect(0, 0, w, h);
        const warm = ctx2.createRadialGradient(
          w * 0.88,
          hz * 1.04,
          4,
          w * 0.88,
          hz * 1.04,
          Math.max(w, h) * 0.46
        );
        warm.addColorStop(0, "rgba(255,146,78,0.058)");
        warm.addColorStop(0.48, "rgba(224,108,52,0.022)");
        warm.addColorStop(1, "rgba(180,80,40,0)");
        ctx2.fillStyle = warm;
        ctx2.fillRect(0, 0, w, h);
      }
      function drawNebula(ctx2, sc, t) {
        const list = sc.nebula;
        for (let i = 0; i < list.length; i++) {
          const n = list[i];
          const x = n.x + Math.sin(t * 0.07 + i) * n.dx * 3;
          const y = n.y + Math.cos(t * 0.05 + i * 2) * n.dy * 3;
          const blobs = n.blobs || [];
          for (let k = 0; k < blobs.length; k++) {
            const b = blobs[k];
            const bx = x + b.ox;
            const by = y + b.oy;
            const a = n.a * (k ? 0.55 : 1);
            const g = ctx2.createRadialGradient(bx, by, 0, bx, by, b.r);
            g.addColorStop(0, "rgba(" + n.c + "," + a.toFixed(3) + ")");
            g.addColorStop(0.42, "rgba(" + n.c + "," + (a * 0.38).toFixed(3) + ")");
            g.addColorStop(1, "rgba(" + n.c + ",0)");
            ctx2.fillStyle = g;
            ctx2.beginPath();
            ctx2.arc(bx, by, b.r, 0, TAU);
            ctx2.fill();
          }
        }
      }
      function drawStars(ctx2, sc, t) {
        const list = sc.stars;
        const h = sc.h;
        ctx2.save();
        for (let i = 0; i < list.length; i++) {
          const s = list[i];
          const y = (s.y + t * s.sp) % h;
          const tw = 0.7 + 0.3 * Math.sin(t * 1.7 + s.p);
          const a = s.a * tw;
          if (s.near) {
            const len = 3 + s.sp * 0.35;
            const g = ctx2.createLinearGradient(s.x, y - len, s.x, y + len * 0.2);
            g.addColorStop(0, "rgba(" + s.tint + ",0)");
            g.addColorStop(1, "rgba(" + s.tint + "," + a.toFixed(3) + ")");
            ctx2.strokeStyle = g;
            ctx2.lineWidth = s.r * 0.9;
            ctx2.lineCap = "round";
            ctx2.beginPath();
            ctx2.moveTo(s.x, y - len);
            ctx2.lineTo(s.x, y + s.r * 0.4);
            ctx2.stroke();
          } else {
            ctx2.fillStyle = "rgba(" + s.tint + "," + a.toFixed(3) + ")";
            ctx2.beginPath();
            ctx2.arc(s.x, y, s.r, 0, TAU);
            ctx2.fill();
          }
        }
        ctx2.restore();
      }
      function drawPlanet(ctx2, sc, t) {
        const p = sc.planet;
        const r = p.r;
        if (r < 4) return;
        const x = p.x;
        const y = p.y;
        const glow = ctx2.createRadialGradient(x, y, r * 0.6, x, y, r * 2.6);
        glow.addColorStop(0, "rgba(120,170,255,0.16)");
        glow.addColorStop(1, "rgba(120,170,255,0)");
        ctx2.fillStyle = glow;
        ctx2.beginPath();
        ctx2.arc(x, y, r * 2.6, 0, TAU);
        ctx2.fill();
        drawRing(ctx2, x, y, r, p.tilt, false, 0.55);
        const g = ctx2.createRadialGradient(x - r * 0.36, y - r * 0.4, r * 0.1, x, y, r * 1.15);
        g.addColorStop(0, "rgba(186,208,255,0.95)");
        g.addColorStop(0.45, "rgba(108,124,196,0.92)");
        g.addColorStop(1, "rgba(38,42,84,0.95)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.arc(x, y, r, 0, TAU);
        ctx2.fill();
        ctx2.save();
        ctx2.beginPath();
        ctx2.arc(x, y, r, 0, TAU);
        ctx2.clip();
        ctx2.globalAlpha = 0.16;
        ctx2.fillStyle = "#dfe8ff";
        for (let i = -2; i <= 2; i++) {
          const off = (t * 3 + i * r * 0.42) % (r * 2.6) - r * 1.3;
          ctx2.save();
          ctx2.translate(x, y + off);
          ctx2.rotate(0.18);
          ctx2.fillRect(-r * 1.4, 0, r * 2.8, r * 0.16);
          ctx2.restore();
        }
        ctx2.restore();
        drawRing(ctx2, x, y, r, p.tilt, true, 0.85);
      }
      function drawRing(ctx2, x, y, r, tilt, front, alpha) {
        ctx2.save();
        ctx2.translate(x, y);
        ctx2.rotate(tilt);
        ctx2.scale(1, 0.3);
        ctx2.beginPath();
        if (front) ctx2.arc(0, 0, r * 1.62, 0.02, Math.PI - 0.02);
        else ctx2.arc(0, 0, r * 1.62, Math.PI + 0.02, TAU - 0.02);
        ctx2.strokeStyle = "rgba(178,206,255," + alpha.toFixed(2) + ")";
        ctx2.lineWidth = r * 0.34;
        ctx2.stroke();
        ctx2.restore();
      }
      function drawGround(ctx2, sc, o) {
        const w = sc.w;
        const h = sc.h;
        const hz = sc.horizonY;
        const cx = o.cx;
        const floorH = h - hz;
        if (floorH <= 0) return;
        const q = o.quality === void 0 ? 2 : o.quality;
        const g = ctx2.createLinearGradient(0, hz, 0, h);
        g.addColorStop(0, "rgba(18,60,72,0.62)");
        g.addColorStop(0.16, "rgba(9,34,47,0.86)");
        g.addColorStop(0.55, "rgba(4,13,21,0.96)");
        g.addColorStop(1, "rgba(1,4,8,1)");
        ctx2.fillStyle = g;
        ctx2.fillRect(0, hz, w, floorH);
        const cols = q >= 2 ? 8 : q === 1 ? 5 : 3;
        ctx2.beginPath();
        for (let i = -cols; i <= cols; i++) {
          const bx = cx + i * (w * 0.17);
          const tx = cx + i * (w * 0.012);
          if (bx < -w || bx > w * 2) continue;
          ctx2.moveTo(tx, hz);
          ctx2.lineTo(bx, h);
        }
        ctx2.strokeStyle = "rgba(58,214,198,0.085)";
        ctx2.lineWidth = 1;
        ctx2.stroke();
        ctx2.beginPath();
        ctx2.moveTo(cx, hz);
        ctx2.lineTo(cx, h);
        ctx2.strokeStyle = "rgba(120,255,235,0.07)";
        ctx2.stroke();
        const rows = q >= 2 ? 11 : q === 1 ? 8 : 5;
        const phase = o.t * 0.5 % 1;
        const bands = [
          { lo: 6, hi: 999, a: 0.062 },
          { lo: 2.8, hi: 6, a: 0.095 },
          { lo: 0, hi: 2.8, a: 0.145 }
        ];
        ctx2.lineWidth = 1;
        for (let b = 0; b < bands.length; b++) {
          const band = bands[b];
          for (let i = 1; i <= rows + 1; i++) {
            const u = i - phase;
            if (u < 0.06) continue;
            if (u < band.lo || u >= band.hi) continue;
            const y = hz + floorH / u;
            if (y > h + 4 || y < hz + 1) continue;
            const jitter = 0.55 + hash01(i, b * 7 + 3) * 0.95;
            ctx2.strokeStyle = "rgba(64,214,200," + (band.a * jitter).toFixed(3) + ")";
            ctx2.beginPath();
            if (hash01(i, b * 13 + 9) < 0.32) {
              const cut = 0.26 + hash01(i, b + 41) * 0.42;
              ctx2.moveTo(0, y);
              ctx2.lineTo(w * cut, y);
              ctx2.moveTo(w * (cut + 0.15), y);
              ctx2.lineTo(w, y);
            } else {
              ctx2.moveTo(0, y);
              ctx2.lineTo(w, y);
            }
            ctx2.stroke();
          }
        }
        const side = ctx2.createLinearGradient(0, 0, w, 0);
        side.addColorStop(0, "rgba(3,9,15,0.96)");
        side.addColorStop(0.2, "rgba(3,9,15,0.58)");
        side.addColorStop(0.42, "rgba(3,9,15,0.10)");
        side.addColorStop(0.5, "rgba(3,9,15,0)");
        side.addColorStop(0.58, "rgba(3,9,15,0.10)");
        side.addColorStop(0.8, "rgba(3,9,15,0.58)");
        side.addColorStop(1, "rgba(3,9,15,0.96)");
        ctx2.fillStyle = side;
        ctx2.fillRect(0, hz, w, floorH);
        const bottom = ctx2.createLinearGradient(0, h - floorH * 0.34, 0, h);
        bottom.addColorStop(0, "rgba(2,6,10,0)");
        bottom.addColorStop(1, "rgba(2,6,10,0.72)");
        ctx2.fillStyle = bottom;
        ctx2.fillRect(0, h - floorH * 0.34, w, floorH * 0.34);
        ctx2.save();
        ctx2.translate(cx, hz);
        ctx2.scale(1, 0.042);
        const fogR = Math.max(w * 0.66, 180);
        const fog = ctx2.createRadialGradient(0, 0, 0, 0, 0, fogR);
        fog.addColorStop(0, "rgba(80,222,206,0.115)");
        fog.addColorStop(0.5, "rgba(66,200,190,0.042)");
        fog.addColorStop(1, "rgba(66,200,190,0)");
        ctx2.fillStyle = fog;
        ctx2.beginPath();
        ctx2.arc(0, 0, fogR, 0, TAU);
        ctx2.fill();
        ctx2.restore();
        const line = ctx2.createLinearGradient(0, 0, w, 0);
        line.addColorStop(0, "rgba(160,255,242,0)");
        line.addColorStop(0.42, "rgba(170,255,244,0.075)");
        line.addColorStop(0.5, "rgba(190,255,248,0.125)");
        line.addColorStop(0.58, "rgba(170,255,244,0.075)");
        line.addColorStop(1, "rgba(160,255,242,0)");
        ctx2.fillStyle = line;
        ctx2.fillRect(0, hz - 0.5, w, 1);
        const dust = sc.dust;
        if (dust && dust.length) {
          for (let i = 0; i < dust.length; i++) {
            const d = dust[i];
            const y = d.y - o.t * d.sp % (h - hz + 20);
            const yy = y < hz ? h - (hz - y) : y;
            const a = d.a * (0.5 + 0.5 * Math.sin(o.t * 2 + d.p)) * 0.7;
            if (yy <= hz) continue;
            ctx2.fillStyle = "rgba(180,255,240," + a.toFixed(3) + ")";
            ctx2.beginPath();
            ctx2.arc(d.x + Math.sin(o.t * 0.6 + d.p) * 5, yy, d.r, 0, TAU);
            ctx2.fill();
          }
        }
      }
      function drawRidge(ctx2, sc) {
        const w = sc.w;
        const hz = sc.horizonY;
        const PAD = 32;
        const x0 = -PAD;
        const x1 = w + PAD;
        const span = x1 - x0;
        ctx2.beginPath();
        ctx2.moveTo(x0, hz + 2);
        for (let x = x0; x <= x1; x += 6) {
          const u = x / w;
          const wave = Math.sin(u * 6.1 + 1.3) * 0.5 + Math.sin(u * 13.7 + 2.6) * 0.3 + Math.sin(u * 29.3 + 3.9) * 0.14;
          ctx2.lineTo(x, hz - (wave + 0.9) * w * 0.032);
        }
        ctx2.lineTo(x1, hz + 2);
        ctx2.closePath();
        ctx2.fillStyle = "rgba(7,24,34,0.62)";
        ctx2.fill();
        const sp = sc.spires || [];
        if (sp.length) {
          ctx2.beginPath();
          ctx2.moveTo(x0, hz + 2);
          ctx2.lineTo(x0, hz - w * 0.012);
          ctx2.lineTo(x1, hz - w * 0.012);
          ctx2.lineTo(x1, hz + 2);
          ctx2.closePath();
          ctx2.fillStyle = "rgba(3,11,18,0.94)";
          ctx2.fill();
          ctx2.beginPath();
          ctx2.moveTo(x0, hz + 2);
          for (let i = 0; i < sp.length; i++) {
            const s = sp[i];
            const bx = x0 + s.x * span;
            const bw = Math.max(1.4, s.w * w);
            const top = hz - s.h * w;
            const lx = bx + (s.lean || 0) * s.h * w;
            if (s.tip) {
              ctx2.lineTo(bx - bw, hz + 1);
              ctx2.lineTo(lx, top);
              ctx2.lineTo(bx + bw, hz + 1);
            } else {
              ctx2.lineTo(bx - bw, hz + 1);
              ctx2.lineTo(lx - bw, top);
              ctx2.lineTo(lx + bw, top);
              ctx2.lineTo(bx + bw, hz + 1);
            }
          }
          ctx2.lineTo(x1, hz + 2);
          ctx2.closePath();
          ctx2.fillStyle = "rgba(3,11,18,0.94)";
          ctx2.fill();
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          for (let i = 0; i < sp.length; i++) {
            const s = sp[i];
            const bx = x0 + s.x * span;
            if (bx < -4 || bx > w + 4) continue;
            const top = hz - s.h * w;
            const lx = bx + (s.lean || 0) * s.h * w;
            if (i % 6 === 0) {
              ctx2.fillStyle = "rgba(140,240,255,0.50)";
              ctx2.beginPath();
              ctx2.arc(lx, top + 1, 1.1, 0, TAU);
              ctx2.fill();
            }
          }
          ctx2.restore();
        }
      }
      function drawFloorPath(ctx2, sc, o) {
        const hz = sc.horizonY;
        const half = o.half;
        const bottom = o.bottom;
        const farY = hz + 3;
        if (!(half > 0) || !(bottom > farY)) return;
        const cx = o.cx;
        const farHalf = Math.max(1.5, half * 0.16);
        const core = o.inZone ? "88,232,210" : "255,110,100";
        ctx2.save();
        ctx2.globalCompositeOperation = "lighter";
        const g = ctx2.createLinearGradient(0, bottom, 0, farY);
        g.addColorStop(0, "rgba(" + core + ",0.16)");
        g.addColorStop(0.35, "rgba(" + core + ",0.075)");
        g.addColorStop(1, "rgba(" + core + ",0)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.moveTo(cx - half, bottom);
        ctx2.lineTo(cx - farHalf, farY);
        ctx2.lineTo(cx + farHalf, farY);
        ctx2.lineTo(cx + half, bottom);
        ctx2.closePath();
        ctx2.fill();
        ctx2.strokeStyle = "rgba(" + core + ",0.18)";
        ctx2.lineWidth = 1.2;
        ctx2.beginPath();
        ctx2.moveTo(cx - half, bottom);
        ctx2.lineTo(cx - farHalf, farY);
        ctx2.moveTo(cx + half, bottom);
        ctx2.lineTo(cx + farHalf, farY);
        ctx2.stroke();
        ctx2.restore();
      }
      function drawFloorGlow(ctx2, sc, o) {
        const hz = sc.horizonY;
        const h = sc.h;
        if (o.bottom >= h) return;
        const spread = Math.min(o.half * 1.9, (h - o.bottom) * 1.2);
        if (spread <= 0) return;
        const col = o.inZone ? "88,232,210" : "255,110,100";
        ctx2.save();
        ctx2.globalCompositeOperation = "lighter";
        const g = ctx2.createLinearGradient(0, o.bottom, 0, o.bottom + spread * 0.9);
        g.addColorStop(0, "rgba(" + col + ",0.075)");
        g.addColorStop(1, "rgba(" + col + ",0)");
        ctx2.fillStyle = g;
        ctx2.beginPath();
        ctx2.moveTo(o.cx - o.half * 0.86, o.bottom);
        ctx2.lineTo(o.cx + o.half * 0.86, o.bottom);
        ctx2.lineTo(o.cx + spread, o.bottom + spread * 0.9);
        ctx2.lineTo(o.cx - spread, o.bottom + spread * 0.9);
        ctx2.closePath();
        ctx2.fill();
        ctx2.restore();
      }
      function drawKeepPillar(ctx2, o) {
        const left = o.cx - o.half;
        const right = o.cx + o.half;
        const top = o.top;
        const bottom = o.bottom;
        const ok = o.inZone;
        const span = bottom - top;
        if (right <= left || bottom <= top) return;
        const core = ok ? "88,232,210" : "255,110,100";
        const edge = ok ? "126,255,232" : "255,150,140";
        const g = ctx2.createLinearGradient(left, 0, right, 0);
        g.addColorStop(0, "rgba(" + core + ",0)");
        g.addColorStop(0.16, "rgba(" + core + ",0.075)");
        g.addColorStop(0.5, "rgba(" + core + ",0.125)");
        g.addColorStop(0.84, "rgba(" + core + ",0.075)");
        g.addColorStop(1, "rgba(" + core + ",0)");
        ctx2.fillStyle = g;
        const SEG = 26;
        for (let i = 0; i < SEG; i++) {
          const p = (i + 0.5) / SEG;
          const env = 0.04 + Math.pow(p, 1.45) * 0.96;
          ctx2.globalAlpha = env * (0.86 + hash01(i, 149) * 0.28);
          ctx2.fillRect(left, top + span * (i / SEG), right - left, span / SEG + 1);
        }
        ctx2.globalAlpha = 1;
        const BL = 7;
        for (let side = 0; side < 2; side++) {
          const x = side ? right : left;
          const gx0 = side ? x : x - BL;
          const gx1 = side ? x + BL : x;
          const bg = ctx2.createLinearGradient(gx0, 0, gx1, 0);
          if (side) {
            bg.addColorStop(0, "rgba(" + edge + ",0.62)");
            bg.addColorStop(0.2, "rgba(" + edge + ",0.20)");
            bg.addColorStop(1, "rgba(" + edge + ",0)");
          } else {
            bg.addColorStop(0, "rgba(" + edge + ",0)");
            bg.addColorStop(0.8, "rgba(" + edge + ",0.20)");
            bg.addColorStop(1, "rgba(" + edge + ",0.62)");
          }
          ctx2.fillStyle = bg;
          for (let i = 0; i < SEG; i++) {
            const p = (i + 0.5) / SEG;
            const wob = (hash01(i + side * 57, 163) - 0.5) * 1.8;
            const bw = Math.max(1, BL + wob);
            ctx2.globalAlpha = (0.05 + Math.pow(p, 1.8) * 0.95) * (0.86 + hash01(i, 173) * 0.24);
            if (side) ctx2.fillRect(x, top + span * (i / SEG), bw, span / SEG + 1);
            else ctx2.fillRect(x - bw, top + span * (i / SEG), bw, span / SEG + 1);
          }
          ctx2.globalAlpha = 1;
        }
        ctx2.save();
        ctx2.globalCompositeOperation = "lighter";
        fillEllipse(
          ctx2,
          o.cx,
          bottom,
          o.half * 1.05,
          Math.max(8, o.half * 0.16),
          "rgba(" + core + ",0.16)"
        );
        ctx2.restore();
      }
      function drawShock(ctx2, x, y, k, color) {
        const p = clamp(k, 0, 1);
        const r = 5 + Math.pow(p, 0.55) * 42;
        const a = Math.pow(1 - p, 1.9) * 0.9;
        if (a < 0.02) return;
        ctx2.save();
        ctx2.globalCompositeOperation = "lighter";
        ctx2.strokeStyle = color || "rgba(190,255,240,1)";
        ctx2.globalAlpha = a;
        ctx2.lineWidth = 2.6 * (1 - p) + 0.4;
        const SEG = 5;
        for (let i = 0; i < SEG; i++) {
          const a0 = i / SEG * TAU + p * 0.7 + i * 0.19;
          const a1 = a0 + TAU / SEG * (0.44 + i % 3 * 0.13);
          const rr = r * (0.9 + i % 2 * 0.12);
          ctx2.beginPath();
          ctx2.arc(x, y, rr, a0, a1);
          ctx2.stroke();
        }
        ctx2.restore();
      }
      function drawCityLights(ctx2, sc, light, t) {
        const lamps = sc.lamps;
        if (!lamps || !lamps.length) return;
        const w = sc.w;
        const hz = sc.horizonY;
        const PAD = 32;
        const x0 = -PAD;
        const span = w + PAD * 2;
        const n = lamps.length;
        const L = clamp(light, 0, 1);
        const lit = L * n;
        if (L > 0.015) {
          const gr = Math.max(w * 0.74, 210);
          ctx2.save();
          ctx2.translate(w * 0.5, hz + 2);
          ctx2.scale(1, 0.135);
          const gg = ctx2.createRadialGradient(0, 0, 6, 0, 0, gr);
          const a = 0.6 * Math.pow(L, 1.25);
          gg.addColorStop(0, "rgba(255,178,104," + a.toFixed(3) + ")");
          gg.addColorStop(0.42, "rgba(228,132,66," + (a * 0.36).toFixed(3) + ")");
          gg.addColorStop(1, "rgba(180,90,40,0)");
          ctx2.fillStyle = gg;
          ctx2.beginPath();
          ctx2.arc(0, 0, gr, 0, TAU);
          ctx2.fill();
          ctx2.restore();
        }
        ctx2.save();
        ctx2.globalCompositeOperation = "lighter";
        for (let i = 0; i < n; i++) {
          const lamp = lamps[i];
          const k = lit - i;
          if (k <= 0) continue;
          const f = k > 1 ? 1 : k;
          const flick = lamp.warm ? 0.88 + 0.12 * Math.sin(t * 3.1 + i * 1.7) : 1;
          const a = clamp(f * flick, 0, 1);
          const x = x0 + lamp.nx * span;
          if (x < -4 || x > w + 4) continue;
          const y = hz - lamp.ny * w;
          if (lamp.warm) {
            ctx2.fillStyle = "rgba(255,198,122," + (a * 0.62).toFixed(3) + ")";
          } else {
            ctx2.fillStyle = "rgba(158,230,255," + (a * 0.52).toFixed(3) + ")";
          }
          ctx2.fillRect(x, y, 1.5, 2);
        }
        const street = sc.street;
        if (street && street.length && L > 6e-3) {
          const sa = Math.pow(L, 0.85);
          for (let i = 0; i < street.length; i++) {
            const sl = street[i];
            const flick = 0.82 + 0.18 * Math.sin(t * 2.3 + sl.ph);
            const x = x0 + sl.nx * span;
            if (x < -4 || x > w + 4) continue;
            const y = hz - sl.ny * w;
            if (sl.warm) {
              ctx2.fillStyle = "rgba(255,192,112," + (sa * flick * 0.56).toFixed(3) + ")";
            } else {
              ctx2.fillStyle = "rgba(172,234,255," + (sa * flick * 0.44).toFixed(3) + ")";
            }
            ctx2.fillRect(x, y, 1.6, 2);
          }
        }
        ctx2.restore();
      }
      function drawVignette(ctx2, sc) {
        const w = sc.w;
        const h = sc.h;
        const g = ctx2.createRadialGradient(
          w * 0.5,
          h * 0.46,
          Math.min(w, h) * 0.34,
          w * 0.5,
          h * 0.5,
          Math.max(w, h) * 0.78
        );
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(0.7, "rgba(0,0,0,0.18)");
        g.addColorStop(1, "rgba(0,0,0,0.58)");
        ctx2.fillStyle = g;
        ctx2.fillRect(0, 0, w, h);
      }
      function drawGrain(ctx2, sc, t) {
        const frames = sc.grain;
        if (!frames || !frames.length) return;
        let idx = Math.floor(t * 9) % frames.length;
        if (!(idx >= 0)) idx = 0;
        const f = frames[idx];
        if (!f) return;
        ctx2.save();
        ctx2.fillStyle = "rgba(0,0,0,0.060)";
        const dark = f.dark;
        for (let i = 0; i < dark.length; i++) {
          const p = dark[i];
          ctx2.fillRect(p.x, p.y, p.s, p.s);
        }
        ctx2.fillStyle = "rgba(176,214,255,0.030)";
        const light = f.light;
        for (let i = 0; i < light.length; i++) {
          const p = light[i];
          ctx2.fillRect(p.x, p.y, p.s, p.s);
        }
        ctx2.restore();
      }
      module.exports = {
        HORIZON_RATIO,
        buildScene,
        drawSky,
        drawNebula,
        drawStars,
        drawPlanet,
        drawGround,
        drawRidge,
        drawFloorPath,
        drawFloorGlow,
        drawKeepPillar,
        drawCityLights,
        drawShock,
        drawVignette,
        drawGrain,
        softShadow,
        fillEllipse,
        ringEllipse
      };
    }
  });

  // pkgShoot/games/shoot/engine.js
  var require_engine = __commonJS({
    "pkgShoot/games/shoot/engine.js"(exports, module) {
      var { ScoreManager } = require_score();
      var { BulletSystem } = require_bullet();
      var { HitDetector } = require_hit();
      var { PoseTracker } = require_pose();
      var { SpriteBank } = require_sprites();
      var scene = require_scene2d();
      var STATE2 = {
        READY: "ready",
        RUNNING: "running",
        PAUSED: "paused",
        ENDED: "ended"
      };
      var PAD = 16;
      var GROUND_RATIO = 0.87;
      var PLAYER_H = 76;
      var MONSTER_Y_RATIO = 0.36;
      var LIGHT_PER_HIT = 7e-3;
      var LIGHT_DECAY = 0.035;
      var SENSOR_HZ = 60;
      var SENSOR_STEP_MS = 1e3 / SENSOR_HZ;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function roundRect(ctx2, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx2.beginPath();
        ctx2.moveTo(x + rr, y);
        ctx2.lineTo(x + w - rr, y);
        ctx2.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
        ctx2.lineTo(x + w, y + h - rr);
        ctx2.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
        ctx2.lineTo(x + rr, y + h);
        ctx2.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
        ctx2.lineTo(x, y + rr);
        ctx2.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
        ctx2.closePath();
      }
      var GameEngine2 = class {
        /**
         * @param {Object} opts
         *   cfg      ConfigStore
         *   canvas   Canvas 2D 节点
         *   ctx      CanvasRenderingContext2D
         *   width/height  逻辑尺寸(CSS px)
         *   dpr      devicePixelRatio
         *   audio    AudioKit（可选）
         *   handlers { onState, onEvent }
         */
        constructor(opts) {
          const o = opts || {};
          this.cfg = o.cfg;
          this.canvas = o.canvas;
          this.ctx = o.ctx;
          this.dpr = o.dpr || 1;
          this.audio = o.audio || null;
          this.handlers = o.handlers || {};
          this.insetTop = 0;
          this.externalOverlay = false;
          this.afterRender = null;
          this.width = o.width || 375;
          this.height = o.height || 600;
          this.score = new ScoreManager(this.cfg);
          this.bullets = new BulletSystem(this.cfg, { width: this.width, height: this.height });
          this.hit = new HitDetector(this.cfg);
          this.pose = new PoseTracker(this.cfg);
          this.sprites = new SpriteBank(this.canvas);
          this.sprites.load().then((loaded) => {
            if (this.destroyed) return;
            if (this.state !== STATE2.RUNNING) this.render();
            this._emitState(true);
            if (loaded < this.sprites.total) {
              console.warn("[game] \u90E8\u5206\u8D34\u56FE\u672A\u52A0\u8F7D\uFF0C\u5DF2\u56DE\u9000\u77E2\u91CF\u7ED8\u5236\uFF1A" + loaded + "/" + this.sprites.total);
            }
          });
          this.state = STATE2.READY;
          this.monster = null;
          this.particles = [];
          this.floats = [];
          this.hitBucket = [];
          this.seq = 0;
          this.tickIndex = 0;
          this.secIndex = 0;
          this.accTick = 0;
          this.accSec = 0;
          this.poseAcc = 0;
          this.fireAcc = 0;
          this.elapsedMs = 0;
          this.t = 0;
          this.playerX = this.width / 2;
          this.recoil = 0;
          this.muzzle = 0;
          this.shake = 0;
          this.flash = 0;
          this.rangeFlash = 0;
          this.wasInZone = true;
          this.outSince = 0;
          this.destroyed = false;
          this.stateEmitAt = 0;
          this.lastTs = 0;
          this.rafId = 0;
          this.usingRaf = false;
          this.quality = void 0;
          this._qualityLocked = false;
          this._slowFrames = 0;
          this.scene = null;
          this.shocks = [];
          this.zoom = 0;
          this.light = 0;
          this.lampsLit = 0;
          this._layout();
          this._resetMonster();
          this._unsub = this.cfg.subscribe((p) => this._onConfig(p));
        }
        // ---------------------------------------------------------------- 尺寸 / 布局
        resize(width, height, dpr) {
          this.width = Math.max(160, width);
          this.height = Math.max(200, height);
          this.dpr = dpr || this.dpr;
          this.bullets.resize(this.width, this.height);
          this._layout();
          this.playerX = clamp(this.playerX, PAD, this.width - PAD);
          if (this.monster) this.monster.x = this.cx;
          if (this.state !== STATE2.RUNNING) this.render();
        }
        _layout() {
          this.cx = this.width / 2;
          this.groundY = this.height * GROUND_RATIO;
          this.monsterY = this.height * MONSTER_Y_RATIO;
          this.scale = clamp(this.width / 375, 0.72, 1.6);
          if (this.bullets) {
            this.bullets.setDepthRange(this.groundY - 26 * this.scale, this.monsterY);
          }
          if (!this._qualityLocked) {
            const area = this.width * this.height;
            const dpr = this.dpr || 1;
            this.quality = area > 52e4 || dpr >= 3.5 ? 1 : 2;
          }
          this.scene = scene.buildScene(this.width, this.height, this.quality);
        }
        _resetMonster() {
          this.monster = {
            id: "monster",
            x: this.cx,
            y: this.monsterY,
            radius: Number(this.cfg.get("targetRadius")) || 22,
            sad: 0,
            smug: false,
            hitThisFrame: false,
            dead: false
          };
        }
        /** 保持范围在屏幕上的半宽(px) */
        keepHalfPx() {
          const keep = Number(this.cfg.get("keepRangeDeg")) || 6;
          const maxLean = Math.max(5, Number(this.cfg.get("maxLeanDeg")) || 20);
          const half = Math.min(1, keep / maxLean) * (this.width / 2 - 10);
          return Math.max(18, half);
        }
        // ---------------------------------------------------------------- 生命周期
        start() {
          if (this.state === STATE2.RUNNING) return;
          if (this.state === STATE2.ENDED) this._resetRound();
          this.state = STATE2.RUNNING;
          this.lastTs = 0;
          this._emitEvent({ type: "start" });
          if (this.audio) {
            this.audio.init();
            this.audio.sfx("ui");
            this.audio.startBgm();
          }
          this._startLoop();
        }
        pause() {
          if (this.state !== STATE2.RUNNING) return;
          this.state = STATE2.PAUSED;
          this._stopLoop();
          if (this.audio) this.audio.pauseBgm();
          this.render();
          this._emitEvent({ type: "pause" });
          this._emitState(true);
        }
        resume() {
          if (this.state !== STATE2.PAUSED) return;
          this.state = STATE2.RUNNING;
          this.lastTs = 0;
          if (this.audio) this.audio.startBgm();
          this._startLoop();
          this._emitEvent({ type: "resume" });
        }
        toggle() {
          if (this.state === STATE2.RUNNING) this.pause();
          else if (this.state === STATE2.PAUSED) this.resume();
          else this.start();
        }
        restart() {
          this._stopLoop();
          this._resetRound();
          this.state = STATE2.READY;
          this.render();
          this.start();
        }
        destroy() {
          this.destroyed = true;
          this._stopLoop();
          if (this._unsub) this._unsub();
          this._unsub = null;
          if (this.audio) {
            this.audio.stopBgm();
            this.audio.destroy();
          }
          this.bullets.clear();
          this.particles = [];
          this.floats = [];
        }
        _resetRound() {
          this.score.reset();
          this.bullets.clear();
          this.particles = [];
          this.floats = [];
          this.hitBucket = [];
          this.tickIndex = 0;
          this.secIndex = 0;
          this.accTick = 0;
          this.accSec = 0;
          this.fireAcc = 0;
          this.elapsedMs = 0;
          this.t = 0;
          this.recoil = 0;
          this.muzzle = 0;
          this.shake = 0;
          this.flash = 0;
          this.zoom = 0;
          this.shocks = [];
          this.light = 0;
          this.lampsLit = 0;
          this.wasInZone = this.pose.inZone;
          this.pose.reset();
          this.playerX = this.cx;
          this._resetMonster();
          this._emitEvent({ type: "reset" });
        }
        // ---------------------------------------------------------------- 帧循环
        _startLoop() {
          if (this.rafId) return;
          const that = this;
          const step = function() {
            that.rafId = 0;
            if (that.destroyed || that.state !== STATE2.RUNNING) return;
            const now = Date.now();
            let dt = that.lastTs ? (now - that.lastTs) / 1e3 : 0.016;
            if (!isFinite(dt) || dt <= 0) dt = 0.016;
            if (dt > 0.12) dt = 0.016;
            that.lastTs = now;
            that.t += dt;
            that.update(dt, now);
            that.render();
            that._emitState(false);
            if (that.state !== STATE2.RUNNING) {
              that.rafId = 0;
              return;
            }
            that.rafId = that._raf(step);
          };
          this.lastTs = 0;
          this.rafId = this._raf(step);
        }
        _stopLoop() {
          if (!this.rafId) return;
          if (this.usingRaf && this.canvas && typeof this.canvas.cancelAnimationFrame === "function") {
            try {
              this.canvas.cancelAnimationFrame(this.rafId);
            } catch (e) {
            }
          } else {
            try {
              clearTimeout(this.rafId);
            } catch (e) {
            }
          }
          this.rafId = 0;
        }
        _raf(fn) {
          if (this.canvas && typeof this.canvas.requestAnimationFrame === "function") {
            this.usingRaf = true;
            return this.canvas.requestAnimationFrame(fn);
          }
          this.usingRaf = false;
          return setTimeout(function() {
            fn(Date.now());
          }, 16);
        }
        // ---------------------------------------------------------------- 传感器
        feedSensor(frame) {
          this.pose.feed(frame);
        }
        setSimAngle(deg) {
          this.pose.setSimAngle(deg);
        }
        // ---------------------------------------------------------------- 一帧逻辑
        update(dt, now) {
          const cfg2 = this.cfg;
          this.poseAcc += dt * 1e3;
          let samples = 0;
          while (this.poseAcc >= SENSOR_STEP_MS && samples < 4) {
            this.poseAcc -= SENSOR_STEP_MS;
            this.pose.update(now - this.poseAcc, SENSOR_STEP_MS / 1e3);
            samples += 1;
          }
          if (!samples) this.pose.update(now, dt);
          this.elapsedMs += dt * 1e3;
          const targetX = PAD + this.pose.x01 * (this.width - PAD * 2);
          const follow = 1 - Math.exp(-60 * dt);
          this.playerX += (targetX - this.playerX) * follow;
          const m = this.monster;
          m.radius = Number(cfg2.get("targetRadius")) || 22;
          m.smug = !this.pose.inZone;
          if (m.sad > 0) m.sad = Math.max(0, m.sad - dt);
          if (this.pose.inZone !== this.wasInZone) {
            this.wasInZone = this.pose.inZone;
            if (this.pose.inZone) {
              this.outSince = 0;
              this._emitEvent({ type: "back", angle: this.pose.getAngle() });
            } else {
              this.outSince = now;
              this._emitEvent({
                type: "out",
                dir: this.pose.dir,
                charDir: this.pose.norm < -0.12 ? "left" : this.pose.norm > 0.12 ? "right" : "center",
                angle: this.pose.getAngle()
              });
              this.fireAcc = 0;
              this.bullets.clear();
              if (this.audio) this.audio.sfx("miss");
              this._vibrate();
            }
          }
          if (!this.pose.inZone && this.outSince && now - this.outSince > 2500) {
            this.outSince = now;
            this._emitEvent({ type: "outHint", dir: this.pose.dir });
          }
          if (this.pose.inZone) {
            const rate = Math.max(0.1, Number(cfg2.get("fireRate")) || 1);
            const interval = 1 / rate;
            this.fireAcc += dt;
            let guard = 0;
            while (this.fireAcc >= interval && guard < 24) {
              this.fireAcc -= interval;
              this._fire();
              guard += 1;
            }
          } else {
            this.fireAcc = 0;
          }
          this.bullets.update(dt);
          this._collide();
          const tickMs = Math.max(20, Number(cfg2.get("tickMs")) || 100);
          this.accTick += dt * 1e3;
          let tickGuard = 0;
          while (this.accTick >= tickMs && tickGuard < 8) {
            this.accTick -= tickMs;
            this._tick();
            tickGuard += 1;
          }
          const baseMs = Math.max(1, Number(cfg2.get("baseTickMs")) || 1e3);
          this.accSec += dt * 1e3;
          let secGuard = 0;
          while (this.accSec >= baseMs && secGuard < 4) {
            this.accSec -= baseMs;
            this._second();
            secGuard += 1;
          }
          this.recoil = Math.max(0, this.recoil - dt * 4);
          this.muzzle = Math.max(0, this.muzzle - dt);
          this.shake = Math.max(0, this.shake - dt * 3.5);
          this.flash = Math.max(0, this.flash - dt * 2);
          this.rangeFlash = Math.max(0, this.rangeFlash - dt);
          if (this.state === STATE2.RUNNING && !this.pose.inZone) {
            this.light = Math.max(0, this.light - LIGHT_DECAY * dt);
          }
          this.zoom = this.zoom > 5e-4 ? this.zoom * Math.exp(-7 * dt) : 0;
          this._updateEffects(dt);
          if (dt > 0.036) this._slowFrames += 1;
          else if (this._slowFrames > 0) this._slowFrames -= 1;
          if (this._slowFrames > 110 && this.quality > 0) {
            this.quality -= 1;
            this._qualityLocked = true;
            this._slowFrames = 0;
            this.scene = scene.buildScene(this.width, this.height, this.quality);
          }
          const duration = Number(cfg2.get("gameDuration")) || 0;
          if (duration > 0 && this.elapsedMs >= duration * 1e3) {
            this._end();
          }
        }
        _tick() {
          this.tickIndex += 1;
          const events = this.score.onTick(this.tickIndex, this.hitBucket);
          this.hitBucket = [];
          for (let i = 0; i < events.length; i++) {
            const ev = events[i];
            if (ev.type === "hit") {
              this._addFloat(ev.x, ev.y + 52, "+" + ev.gain, ev.combo >= 2 ? "#ffd166" : "#e6fff8", ev.combo >= 2 ? 1.15 : 1);
              if (ev.combo >= 3) this._addFloat(ev.x, ev.y + 74, "COMBO x" + ev.combo, "#ff9f43", 0.9);
              if (this.audio) this.audio.sfx(ev.combo >= 3 ? "combo" : "hit");
              this.flash = Math.min(1, this.flash + 0.35);
              if (ev.combo >= 5) this._vibrate();
              this._emitEvent(ev);
            } else if (ev.type === "comboEnd") {
              this._emitEvent(ev);
            }
          }
        }
        _second() {
          this.secIndex += 1;
          const ev = this.score.onSecond(this.pose.inZone);
          if (ev.gain > 0) {
            this._addFloat(this.playerX, this.groundY - PLAYER_H - 10, "+" + ev.gain, "#9fe8ff", 0.85);
          }
          this._emitEvent(ev);
          this._emitState(true);
        }
        _end() {
          if (this.state === STATE2.ENDED) return;
          this.state = STATE2.ENDED;
          this._stopLoop();
          const stats = this.score.stats();
          if (this.audio) {
            this.audio.sfx("combo");
            this.audio.stopBgm();
          }
          this._emitEvent({ type: "end", stats });
          this._emitState(true);
          this.render();
        }
        _vibrate() {
          if (typeof wx === "undefined" || !wx.vibrateShort) return;
          try {
            wx.vibrateShort({ type: "light" });
          } catch (e) {
          }
        }
        // ---------------------------------------------------------------- 开火 / 碰撞
        _fire() {
          if (!this.pose.inZone) return false;
          const gunX = this.playerX;
          const gunY = this.gunY();
          this.bullets.fire(gunX, gunY);
          this.score.shots += 1;
          this.recoil = Math.min(1, this.recoil + 0.45);
          this.muzzle = 0.07;
          if (this.audio) this.audio.sfx("shoot");
          return true;
        }
        _collide() {
          const m = this.monster;
          m.hitThisFrame = false;
          const hits = [];
          for (let i = this.bullets.list.length - 1; i >= 0; i--) {
            const b = this.bullets.list[i];
            if (m.hitThisFrame) break;
            const hit = this.hit.sweep(b.px, b.py, b.x, b.y, m);
            if (!hit) continue;
            this.bullets.kill(b);
            m.hitThisFrame = true;
            m.sad = 0.7;
            hits.push({ x: hit.x, y: hit.y, targetId: "monster" });
            this._burst(hit.x, hit.y);
            this.shake = Math.min(1, this.shake + 0.25);
            this.shocks.push({
              x: hit.x,
              y: hit.y,
              life: 0.22,
              max: 0.22,
              color: "rgba(190,255,240,1)"
            });
            if (this.shocks.length > 8) this.shocks.shift();
            const combo = this.score.combo || 0;
            this.zoom = Math.min(0.026, this.zoom + 8e-3 + Math.min(0.012, combo * 15e-4));
            this.light = Math.min(1, this.light + LIGHT_PER_HIT);
          }
          if (hits.length) {
            this.hitBucket = this.hitBucket.concat(hits);
          }
        }
        // ---------------------------------------------------------------- 特效
        _burst(x, y) {
          const color = "#ff9f6e";
          for (let i = 0; i < 12; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 40 + Math.random() * 150;
            this.particles.push({
              x,
              y,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              r: 1 + Math.random() * 2.6,
              life: 0.45 + Math.random() * 0.35,
              max: 0.8,
              color
            });
          }
        }
        _addFloat(x, y, text, color, scale) {
          this.floats.push({ x, y, text, color: color || "#fff", scale: scale || 1, life: 0.9, max: 0.9 });
        }
        _updateEffects(dt) {
          for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 260 * dt;
            p.vx *= 0.98;
            p.life -= dt;
            if (p.life <= 0) this.particles.splice(i, 1);
          }
          for (let i = this.floats.length - 1; i >= 0; i--) {
            const f = this.floats[i];
            f.y -= 34 * dt;
            f.life -= dt;
            if (f.life <= 0) this.floats.splice(i, 1);
          }
          for (let i = this.shocks.length - 1; i >= 0; i--) {
            this.shocks[i].life -= dt;
            if (this.shocks[i].life <= 0) this.shocks.splice(i, 1);
          }
        }
        // ---------------------------------------------------------------- 状态外发
        _emitEvent(ev) {
          if (this.handlers.onEvent) {
            try {
              this.handlers.onEvent(ev);
            } catch (e) {
              console.error("[engine] onEvent", e);
            }
          }
        }
        _emitState(force) {
          const now = Date.now();
          if (!force && now - this.stateEmitAt < 66) return;
          this.stateEmitAt = now;
          if (this.handlers.onState) {
            try {
              this.handlers.onState(this.getState());
            } catch (e) {
              console.error("[engine] onState", e);
            }
          }
        }
        getState() {
          const duration = Number(this.cfg.get("gameDuration")) || 0;
          const elapsed = this.elapsedMs / 1e3;
          const st = this.score.stats();
          return {
            state: this.state,
            running: this.state === STATE2.RUNNING,
            paused: this.state === STATE2.PAUSED,
            ended: this.state === STATE2.ENDED,
            score: st.score,
            hits: st.hits,
            shots: st.shots,
            combo: this.score.combo,
            maxCombo: st.maxCombo,
            zoneRate: st.zoneRate,
            elapsed: Math.round(elapsed * 10) / 10,
            timeLeft: duration > 0 ? Math.max(0, Math.round((duration - elapsed) * 10) / 10) : -1,
            duration,
            angle: this.pose.getAngle(),
            inZone: this.pose.inZone,
            dir: this.pose.dir,
            // 屏幕里小人的左右（镜像后的位置），回中提示按它给方向
            charDir: this.pose.norm < -0.12 ? "left" : this.pose.norm > 0.12 ? "right" : "center",
            zoneRatio: Math.round(this.pose.zoneRatio() * 100),
            sensorStale: this.pose.stale,
            sensorHz: this.pose.rateHz || 0,
            samplingHz: SENSOR_HZ,
            fireRate: this.cfg.get("fireRate"),
            hitRange: this.cfg.get("hitRange"),
            comboWindowMs: this.cfg.get("comboWindowMs"),
            difficulty: this.cfg.get("difficulty"),
            bullets: this.bullets.count,
            monsterState: this.monster.smug ? "smug" : this.monster.sad > 0 ? "sad" : "idle"
          };
        }
        // ---------------------------------------------------------------- 配置热更新
        _onConfig(payload) {
          if (!payload) return;
          if (payload.changed.indexOf("hitRange") >= 0) this.rangeFlash = 1.4;
          if (this.audio) this.audio.sync();
          this._emitState(true);
          if (this.state !== STATE2.RUNNING) this.render();
        }
        // ---------------------------------------------------------------- 对外参数 API
        setHitArea(range) {
          const v = this.hit.setRange(range);
          this.rangeFlash = 2;
          this._emitState(true);
          return v;
        }
        setFireRate(fps) {
          const v = this.cfg.set("fireRate", fps, "api:setFireRate");
          this.fireAcc = 0;
          return v;
        }
        setDifficulty(level, applyPreset) {
          const changed = this.cfg.applyDifficulty(level, applyPreset !== false);
          const mul = this.cfg.getScoreMul();
          this.rangeFlash = 1.6;
          return { level: this.cfg.get("difficulty"), scoreMul: mul, changed };
        }
        setScoreRange(min, max) {
          this.cfg.patch({ scoreMin: min, scoreMax: max }, "api:setScoreRange");
          return this.cfg.getScoreRange();
        }
        setKeepRange(deg) {
          return this.cfg.set("keepRangeDeg", deg, "api:setKeepRange");
        }
        setMaxLean(deg) {
          return this.cfg.set("maxLeanDeg", deg, "api:setMaxLean");
        }
        // ================================================================ 渲染
        render() {
          const ctx2 = this.ctx;
          if (!ctx2) return;
          const w = this.width;
          const h = this.height;
          ctx2.save();
          ctx2.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx2.clearRect(0, 0, w, h);
          if (this.shake > 0) {
            const s = this.shake * 4;
            ctx2.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
          }
          if (this.zoom > 5e-4) {
            const z = 1 + this.zoom;
            ctx2.translate(this.cx, this.groundY);
            ctx2.scale(z, z);
            ctx2.translate(-this.cx, -this.groundY);
          }
          this._drawBackground();
          this._drawKeepZone();
          this._drawAimLine();
          this._drawBeacon();
          this._drawPlayer();
          this._drawBullets();
          this._drawParticles();
          this._drawFloats();
          if (this.scene) scene.drawVignette(this.ctx, this.scene);
          if (this.scene && this.scene.grain && this.scene.grain.length) {
            ctx2.save();
            ctx2.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            scene.drawGrain(ctx2, this.scene, this.t);
            ctx2.restore();
          }
          this._drawShockwaves();
          this._drawHud();
          if (this.state !== STATE2.RUNNING && !this.externalOverlay) this._drawOverlay();
          ctx2.restore();
          if (typeof this.afterRender === "function") {
            ctx2.save();
            ctx2.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            try {
              this.afterRender();
            } catch (e) {
              console.error("[engine] afterRender", e);
            }
            ctx2.restore();
          }
        }
        // ---------------------------------------------------------------- 背景（2.5D）
        // 层次：天空渐变 → 星云 → 三层视差星 → 行星 → 透视地面 → 暗角
        // 不用 bg.png 平铺：平铺做不出纵深，换成按消失点投影的程序化地面
        _drawBackground() {
          const ctx2 = this.ctx;
          const sc = this.scene;
          if (!sc) return;
          const t = this.t;
          const q = this.quality === void 0 ? 2 : this.quality;
          const px = this.width > 0 ? (this.playerX - this.cx) / (this.width / 2) * (this.width * 0.014) : 0;
          sc.parallax = isFinite(px) ? clamp(px, -this.width * 0.02, this.width * 0.02) : 0;
          scene.drawSky(ctx2, sc, { t });
          if (q >= 1) scene.drawNebula(ctx2, sc, t);
          ctx2.save();
          ctx2.translate(sc.parallax * 0.35, 0);
          scene.drawStars(ctx2, sc, t);
          ctx2.restore();
          if (q >= 2) {
            ctx2.save();
            ctx2.translate(sc.parallax * 0.6, 0);
            scene.drawPlanet(ctx2, sc, t);
            ctx2.restore();
          }
          ctx2.save();
          ctx2.translate(sc.parallax, 0);
          scene.drawRidge(ctx2, sc);
          ctx2.restore();
          scene.drawGround(ctx2, sc, {
            cx: this.cx,
            t,
            quality: q
          });
          ctx2.save();
          ctx2.translate(sc.parallax, 0);
          scene.drawCityLights(ctx2, sc, this.light, t);
          ctx2.restore();
        }
        _drawKeepZone() {
          const ctx2 = this.ctx;
          const half = this.keepHalfPx();
          const top = 74 * this.scale + (this.insetTop || 0);
          const bottom = this.groundY - 30;
          const inZone = this.pose.inZone;
          const dim = this.state === STATE2.RUNNING ? 1 : this.state === STATE2.PAUSED ? 0.32 : 0;
          ctx2.save();
          ctx2.globalAlpha = dim;
          scene.drawFloorPath(ctx2, this.scene, {
            cx: this.cx,
            half,
            bottom,
            inZone
          });
          scene.drawKeepPillar(ctx2, {
            w: this.width,
            cx: this.cx,
            half,
            top,
            bottom,
            inZone,
            t: this.t
          });
          scene.drawFloorGlow(ctx2, this.scene, {
            cx: this.cx,
            half,
            bottom,
            inZone
          });
          const fs = Math.round(11 * this.scale);
          ctx2.font = fs + "px sans-serif";
          ctx2.textAlign = "center";
          ctx2.textBaseline = "bottom";
          ctx2.fillStyle = inZone ? "rgba(126,255,232,0.95)" : "rgba(255,150,140,0.98)";
          ctx2.fillText("\u4FDD \u6301 \u533A  \xB1" + this.cfg.get("keepRangeDeg") + "\xB0", this.cx, top - 6);
          ctx2.restore();
        }
        _drawAimLine() {
          if (this.state !== STATE2.RUNNING) return;
          const ctx2 = this.ctx;
          const x = this.playerX;
          const y = this.gunY();
          ctx2.save();
          ctx2.setLineDash([2, 8]);
          ctx2.lineWidth = 1;
          ctx2.strokeStyle = this.pose.inZone ? "rgba(88,214,199,0.35)" : "rgba(255,120,120,0.3)";
          ctx2.beginPath();
          ctx2.moveTo(x, y);
          ctx2.lineTo(x, 74 * this.scale);
          ctx2.stroke();
          ctx2.restore();
        }
        // ---------------------------------------------------------------- 城市光核（靶）
        // 这里原来是「机械哨兵」—— 一个要被打败的敌人。换成光核的原因不是造型，是语义：
        //   1. 五个游戏里只有射击是「攻击」，其余是收集 / 平衡 / 竞速；
        //   2. 出界时敌人「得意」，是用羞耻驱动患者 —— 居家自助训练没人接住这个情绪；
        //   3. 它全身都在动（浮游炮绕轨 / 机械臂摆动 / 三层环反向旋转 / 扫描缝），
        //      而它的职责是当视线锚点。每一样动态都在把视线从中心带走。
        //
        // 光核只有一个状态量：**亮度**。亮度就是「你维持得怎么样」。
        // 把它当一块电压表来画，而不是当一个角色来画。
        //
        // 红线不变：绘制中心严格等于判定中心（m.x / m.y）。
        // 所有动态只允许改亮度、环的半径、射线的长度 —— 不许整体平移或缩放。
        _drawBeacon() {
          const ctx2 = this.ctx;
          const m = this.monster;
          if (!m) return;
          if (this.state !== STATE2.RUNNING && !this.externalOverlay) return;
          const x = m.x;
          const y = m.y;
          const r = m.radius;
          const t = this.t;
          const light = clamp(this.light, 0, 1);
          const hurt = m.sad > 0;
          const warn = !!m.smug;
          const RGB = warn ? "255,132,104" : "128,242,212";
          const beamTop = y + r * 0.86;
          const beamBot = this.scene ? this.scene.horizonY - 1 : y + r * 6;
          if (beamBot > beamTop + 4) {
            ctx2.save();
            ctx2.globalCompositeOperation = "lighter";
            const bg = ctx2.createLinearGradient(0, beamBot, 0, beamTop);
            const a0 = 0.03 + light * 0.08;
            const a1 = 0.06 + light * 0.19;
            bg.addColorStop(0, "rgba(" + RGB + "," + (a0 * 0.35).toFixed(3) + ")");
            bg.addColorStop(0.55, "rgba(" + RGB + "," + a0.toFixed(3) + ")");
            bg.addColorStop(1, "rgba(" + RGB + "," + a1.toFixed(3) + ")");
            ctx2.fillStyle = bg;
            const bw = 1.1 + light * 2.1;
            ctx2.fillRect(x - bw / 2, beamTop, bw, beamBot - beamTop);
            ctx2.restore();
          }
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          const haloR = r * (1.9 + light * 1.15) * (warn ? 1.22 : 1);
          const ha = (0.15 + light * 0.17) * (warn ? 1.22 : 1);
          const hg = ctx2.createRadialGradient(x, y, r * 0.15, x, y, haloR);
          hg.addColorStop(0, "rgba(" + RGB + "," + ha.toFixed(3) + ")");
          hg.addColorStop(0.44, "rgba(" + RGB + "," + (ha * 0.28).toFixed(3) + ")");
          hg.addColorStop(1, "rgba(" + RGB + ",0)");
          ctx2.fillStyle = hg;
          ctx2.beginPath();
          ctx2.arc(x, y, haloR, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.restore();
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          for (let i = 0; i < 3; i++) {
            const dir = i % 2 ? -1 : 1;
            const spin = t * (0.55 + i * 0.22) * dir;
            const rr = r * (0.96 + i * 0.22) * (1 - light * 0.1);
            const alpha = (0.3 + light * 0.46) * (1 - i * 0.2) * (warn ? 0.8 : 1);
            ctx2.strokeStyle = warn ? "rgba(255,224,214," + alpha.toFixed(3) + ")" : "rgba(226,255,250," + alpha.toFixed(3) + ")";
            ctx2.lineWidth = Math.max(1, r * 0.05);
            ctx2.beginPath();
            ctx2.arc(x, y, rr, spin + i * 2.1, spin + i * 2.1 + 3.66);
            ctx2.stroke();
          }
          ctx2.restore();
          const pulse = 0.94 + 0.06 * Math.sin(t * 2.4);
          const cr = r * (0.46 + light * 0.2) * pulse;
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          const cg = ctx2.createRadialGradient(x, y, 0, x, y, cr * 1.5);
          cg.addColorStop(0, "rgba(255,255,255," + (0.42 + light * 0.26).toFixed(3) + ")");
          cg.addColorStop(0.22, "rgba(" + RGB + "," + (0.52 + light * 0.3).toFixed(3) + ")");
          cg.addColorStop(0.62, "rgba(" + RGB + "," + (0.16 + light * 0.2).toFixed(3) + ")");
          cg.addColorStop(1, "rgba(" + RGB + ",0)");
          ctx2.fillStyle = cg;
          ctx2.beginPath();
          ctx2.arc(x, y, cr * 1.5, 0, Math.PI * 2);
          ctx2.fill();
          if (hurt) {
            ctx2.globalAlpha = Math.min(0.55, m.sad * 0.8);
            ctx2.fillStyle = "rgba(255,255,255,1)";
            ctx2.beginPath();
            ctx2.arc(x, y, cr * (1.6 + m.sad * 1.4), 0, Math.PI * 2);
            ctx2.fill();
            ctx2.globalAlpha = 1;
            const k = m.sad;
            ctx2.strokeStyle = "rgba(" + RGB + "," + (0.85 * k).toFixed(3) + ")";
            ctx2.lineWidth = Math.max(1, r * 0.055);
            ctx2.lineCap = "round";
            for (let i = 0; i < 6; i++) {
              const a = i * Math.PI / 3 + 0.4;
              const r0 = r * (0.42 + 0.34 * (1 - k));
              const r1 = r0 + r * 0.46 * k;
              ctx2.beginPath();
              ctx2.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
              ctx2.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
              ctx2.stroke();
            }
          }
          ctx2.restore();
        }
        /**
         * 战机的几何尺寸（未乘 scale 的基准 × scale）。
         * 绘制与 gunY() 共用同一份，否则「枪口」和「机头」会慢慢对不上。
         */
        _shipBox() {
          const s = this.scale;
          return {
            s,
            w: 68 * s,
            h: 48 * s,
            cy: this.groundY - 32 * s + this.recoil * 4
          };
        }
        /** 子弹出生点：机头尖端 */
        gunY() {
          const b = this._shipBox();
          return b.cy - b.h * 0.5 + 2;
        }
        // ---------------------------------------------------------------- 战机（玩家）
        // 后视/追尾视角：机头朝上（飞向远处），双引擎朝下（对着镜头）。
        // 之前用的是 Kenney 的俯视飞船贴图，摆在一个透视地面上 = 视角矛盾：
        // 俯视的机翼和「地面透视」永远不会是同一个相机。
        _drawPlayer() {
          const ctx2 = this.ctx;
          const b = this._shipBox();
          const x = this.playerX;
          const cy = b.cy;
          const gy = this.groundY;
          const s = b.s;
          const W2 = b.w;
          const H2 = b.h;
          const hw = W2 / 2;
          const hh = H2 / 2;
          const leanRaw = clamp(this.pose.angle / Math.max(6, this.cfg.get("maxLeanDeg")), -1, 1);
          const tilt = (leanRaw < 0 ? -1 : 1) * Math.pow(Math.abs(leanRaw), 0.75) * 0.42;
          scene.softShadow(ctx2, x + tilt * 22 * s, gy - 24 * s, 24 * s, 6.5 * s, 0.32);
          const wash = 0.09 + 0.03 * Math.sin(this.t * 7.3);
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          scene.fillEllipse(ctx2, x, gy + 2 * s, W2 * 0.66, 9 * s, "rgba(88,220,255," + wash.toFixed(3) + ")");
          ctx2.restore();
          ctx2.save();
          ctx2.translate(x, cy);
          ctx2.rotate(tilt);
          ctx2.scale(Math.cos(tilt * 1.5), 1);
          const ship = this.sprites.get("fighter");
          const SHIP_K = 1.32;
          if (ship) {
            ctx2.save();
            ctx2.shadowColor = "rgba(122,226,255,0.55)";
            ctx2.shadowBlur = 4 * s;
            ctx2.drawImage(ship, -hw * SHIP_K, -hh * SHIP_K, W2 * SHIP_K, H2 * SHIP_K);
            ctx2.restore();
          } else {
            const hull = () => {
              ctx2.beginPath();
              ctx2.moveTo(0, -hh);
              ctx2.lineTo(hw * 0.17, -hh * 0.4);
              ctx2.lineTo(hw * 0.99, hh * 0.3);
              ctx2.lineTo(hw * 0.78, hh * 0.7);
              ctx2.lineTo(hw * 0.4, hh * 0.56);
              ctx2.lineTo(hw * 0.4, hh * 0.92);
              ctx2.lineTo(hw * 0.16, hh * 0.76);
              ctx2.lineTo(-hw * 0.16, hh * 0.76);
              ctx2.lineTo(-hw * 0.4, hh * 0.92);
              ctx2.lineTo(-hw * 0.4, hh * 0.56);
              ctx2.lineTo(-hw * 0.78, hh * 0.7);
              ctx2.lineTo(-hw * 0.99, hh * 0.3);
              ctx2.lineTo(-hw * 0.17, -hh * 0.4);
              ctx2.closePath();
            };
            hull();
            ctx2.save();
            ctx2.clip();
            ctx2.fillStyle = "#0C1726";
            ctx2.fillRect(-hw * 1.05, -hh * 1.15, hw * 2.1, hh * 2.3);
            ctx2.fillStyle = "#1E3048";
            for (let sd = 0; sd < 2; sd++) {
              const k = sd ? 1 : -1;
              ctx2.beginPath();
              ctx2.moveTo(k * hw * 0.19, -hh * 0.38);
              ctx2.lineTo(k * hw * 1.02, hh * 0.3);
              ctx2.lineTo(k * hw * 0.78, hh * 0.72);
              ctx2.lineTo(k * hw * 0.38, hh * 0.58);
              ctx2.closePath();
              ctx2.fill();
            }
            ctx2.fillStyle = "#3B5578";
            ctx2.beginPath();
            ctx2.moveTo(0, -hh);
            ctx2.lineTo(hw * 0.2, -hh * 0.36);
            ctx2.lineTo(hw * 0.18, hh * 0.78);
            ctx2.lineTo(-hw * 0.18, hh * 0.78);
            ctx2.lineTo(-hw * 0.2, -hh * 0.36);
            ctx2.closePath();
            ctx2.fill();
            ctx2.fillStyle = "rgba(255,168,88,0.34)";
            for (let sd = 0; sd < 2; sd++) {
              const k = sd ? 1 : -1;
              ctx2.beginPath();
              ctx2.moveTo(k * hw * 0.63, hh * 0.04);
              ctx2.lineTo(k * hw * 0.95, hh * 0.27);
              ctx2.lineTo(k * hw * 0.89, hh * 0.41);
              ctx2.lineTo(k * hw * 0.57, hh * 0.18);
              ctx2.closePath();
              ctx2.fill();
            }
            ctx2.strokeStyle = "rgba(2,6,14,0.58)";
            ctx2.lineWidth = 3.4 * s;
            ctx2.beginPath();
            for (let sd = 0; sd < 2; sd++) {
              const k = sd ? 1 : -1;
              ctx2.moveTo(k * hw * 0.19, -hh * 0.38);
              ctx2.lineTo(k * hw * 0.38, hh * 0.58);
            }
            ctx2.stroke();
            ctx2.strokeStyle = "rgba(4,10,20,0.55)";
            ctx2.lineWidth = 1.4 * s;
            ctx2.beginPath();
            for (let sd = 0; sd < 2; sd++) {
              const k = sd ? 1 : -1;
              ctx2.moveTo(k * hw * 0.31, -hh * 0.2);
              ctx2.lineTo(k * hw * 0.43, hh * 0.5);
            }
            ctx2.stroke();
            ctx2.strokeStyle = "rgba(150,225,255,0.24)";
            ctx2.lineWidth = 2.2 * s;
            ctx2.beginPath();
            ctx2.moveTo(0, -hh);
            ctx2.lineTo(hw * 0.17, -hh * 0.4);
            ctx2.lineTo(hw * 0.99, hh * 0.3);
            ctx2.moveTo(0, -hh);
            ctx2.lineTo(-hw * 0.17, -hh * 0.4);
            ctx2.lineTo(-hw * 0.99, hh * 0.3);
            ctx2.stroke();
            ctx2.restore();
            hull();
            ctx2.strokeStyle = "rgba(126,238,255,0.40)";
            ctx2.lineWidth = Math.max(1, 1 * s);
            ctx2.stroke();
            ctx2.save();
            ctx2.translate(0, -hh * 0.34);
            ctx2.scale(1, 1.5);
            ctx2.fillStyle = "#14243C";
            ctx2.beginPath();
            ctx2.arc(0, 0, hw * 0.115, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.strokeStyle = "rgba(120,190,230,0.38)";
            ctx2.lineWidth = 1.2 * s;
            ctx2.stroke();
            ctx2.strokeStyle = "rgba(196,246,255,0.62)";
            ctx2.lineWidth = 1.7 * s;
            ctx2.beginPath();
            ctx2.arc(0, 0, hw * 0.082, Math.PI * 1.12, Math.PI * 1.78);
            ctx2.stroke();
            ctx2.restore();
          }
          const blink = 0.55 + 0.45 * Math.sin(this.t * 4.2);
          ctx2.globalAlpha = blink;
          const tipX = hw * 0.96 * SHIP_K;
          const tipY = hh * 0.3 * SHIP_K;
          ctx2.fillStyle = "#ff6b6b";
          ctx2.beginPath();
          ctx2.arc(-tipX, tipY, 1.7 * s, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.fillStyle = "#7bff9d";
          ctx2.beginPath();
          ctx2.arc(tipX, tipY, 1.7 * s, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.globalAlpha = 1;
          const boost = this.recoil * 0.9;
          const eDX = ship ? hw * 0.115 * SHIP_K : hw * 0.28;
          const eDY = ship ? hh * 0.71 * SHIP_K : hh * 0.88;
          const eBase = ship ? 4.4 : 6.4;
          ctx2.save();
          ctx2.globalCompositeOperation = "lighter";
          for (let i = 0; i < 2; i++) {
            const nx = (i ? 1 : -1) * eDX;
            const ny = eDY;
            const pulse = 1 + 0.12 * Math.sin(this.t * 26 + i * 1.9);
            const gr = (eBase * pulse + boost * (ship ? 2.2 : 3)) * s;
            const plume = ctx2.createRadialGradient(nx, ny, 0, nx, ny, gr * 1.32);
            plume.addColorStop(0, "rgba(255,255,255,0.98)");
            plume.addColorStop(0.26, "rgba(176,250,255,0.86)");
            plume.addColorStop(0.56, "rgba(80,180,255,0.34)");
            plume.addColorStop(1, "rgba(56,110,255,0)");
            ctx2.fillStyle = plume;
            ctx2.beginPath();
            ctx2.arc(nx, ny, gr * 1.32, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.fillStyle = "rgba(255,255,255,0.92)";
            ctx2.beginPath();
            ctx2.arc(nx, ny + gr * 0.12, gr * 0.4, 0, Math.PI * 2);
            ctx2.fill();
          }
          if (this.muzzle > 0) {
            ctx2.globalAlpha = this.muzzle / 0.07;
            const mg = ctx2.createRadialGradient(0, -hh * 0.92, 1, 0, -hh * 0.92, 15 * s);
            mg.addColorStop(0, "rgba(255,255,255,1)");
            mg.addColorStop(0.45, "rgba(120,255,220,0.9)");
            mg.addColorStop(1, "rgba(60,220,180,0)");
            ctx2.fillStyle = mg;
            ctx2.beginPath();
            ctx2.arc(0, -hh * 0.92, 15 * s, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.globalAlpha = 1;
          }
          ctx2.restore();
          ctx2.restore();
        }
        _drawBullets() {
          const ctx2 = this.ctx;
          const laser = this.sprites.get("laser");
          for (let i = 0; i < this.bullets.list.length; i++) {
            const b = this.bullets.list[i];
            const k = b.k > 0 ? b.k : 1;
            const ba = b.a > 0 ? b.a : 1;
            if (laser) {
              const h = 28 * k;
              const w = h * (9 / 37);
              ctx2.save();
              ctx2.globalCompositeOperation = "lighter";
              const tg = ctx2.createLinearGradient(b.x, b.y + 30 * k, b.x, b.y - 4 * k);
              tg.addColorStop(0, "rgba(110,255,215,0)");
              tg.addColorStop(0.55, "rgba(140,255,228,0.26)");
              tg.addColorStop(1, "rgba(200,255,245,0.62)");
              ctx2.fillStyle = tg;
              ctx2.fillRect(b.x - 1.7 * k, b.y - 4 * k, 3.4 * k, 34 * k);
              ctx2.restore();
              ctx2.globalAlpha = 0.96 * ba;
              ctx2.drawImage(laser, b.x - w / 2, b.y - h / 2, w, h);
              ctx2.globalAlpha = 1;
              ctx2.save();
              ctx2.globalCompositeOperation = "lighter";
              ctx2.globalAlpha = ba;
              ctx2.fillStyle = "rgba(255,255,255,0.9)";
              ctx2.beginPath();
              ctx2.arc(b.x, b.y - 2 * k, 1.9 * k, 0, Math.PI * 2);
              ctx2.fill();
              ctx2.restore();
              continue;
            }
            const tx = b.x - b.vx * 0.022 * k;
            const ty = b.y - b.vy * 0.022 * k;
            const g = ctx2.createLinearGradient(tx, ty, b.x, b.y);
            g.addColorStop(0, "rgba(120,255,220,0)");
            g.addColorStop(1, "rgba(200,255,245,0.95)");
            ctx2.strokeStyle = g;
            ctx2.lineWidth = 3.2 * k;
            ctx2.lineCap = "round";
            ctx2.beginPath();
            ctx2.moveTo(tx, ty);
            ctx2.lineTo(b.x, b.y);
            ctx2.stroke();
            ctx2.fillStyle = "rgba(235,255,250,0.95)";
            ctx2.beginPath();
            ctx2.arc(b.x, b.y, 2.6 * k, 0, Math.PI * 2);
            ctx2.fill();
          }
        }
        _drawParticles() {
          const ctx2 = this.ctx;
          for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const k = Math.max(0, p.life / p.max);
            if (k <= 0) continue;
            ctx2.globalAlpha = k;
            const vx = p.vx || 0;
            const vy = p.vy || 0;
            const sp = Math.sqrt(vx * vx + vy * vy) || 1;
            const len = Math.min(p.r * 3.4, sp * 0.028);
            ctx2.strokeStyle = p.color;
            ctx2.lineWidth = Math.max(0.9, p.r * 0.5);
            ctx2.lineCap = "round";
            ctx2.beginPath();
            ctx2.moveTo(p.x, p.y);
            ctx2.lineTo(p.x - vx / sp * len, p.y - vy / sp * len);
            ctx2.stroke();
            ctx2.fillStyle = "rgba(255,248,238,0.9)";
            ctx2.beginPath();
            ctx2.arc(p.x, p.y, Math.max(0.7, p.r * 0.42), 0, Math.PI * 2);
            ctx2.fill();
          }
          ctx2.globalAlpha = 1;
        }
        _drawFloats() {
          const ctx2 = this.ctx;
          for (let i = 0; i < this.floats.length; i++) {
            const f = this.floats[i];
            const a = Math.max(0, f.life / f.max);
            const size = Math.round(16 * this.scale * f.scale);
            ctx2.globalAlpha = a;
            ctx2.font = "bold " + size + "px sans-serif";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "bottom";
            ctx2.lineJoin = "round";
            ctx2.lineWidth = Math.max(2, size * 0.2);
            ctx2.strokeStyle = "rgba(5,12,22,0.86)";
            ctx2.strokeText(f.text, f.x, f.y);
            ctx2.fillStyle = f.color;
            ctx2.fillText(f.text, f.x, f.y);
          }
          ctx2.globalAlpha = 1;
        }
        /** 玻璃质感卡片：上浅下深的底 + 顶部高光 + 细描边（HUD 统一用它） */
        _glassCard(x, y, w, h) {
          const ctx2 = this.ctx;
          const s = this.scale;
          const r = 12 * s;
          const g = ctx2.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, "rgba(26,48,72,0.74)");
          g.addColorStop(1, "rgba(6,14,26,0.62)");
          ctx2.fillStyle = g;
          roundRect(ctx2, x, y, w, h, r);
          ctx2.fill();
          ctx2.save();
          roundRect(ctx2, x, y, w, h, r);
          ctx2.clip();
          const hl = ctx2.createLinearGradient(0, y, 0, y + h * 0.55);
          hl.addColorStop(0, "rgba(150,225,255,0.13)");
          hl.addColorStop(1, "rgba(150,225,255,0)");
          ctx2.fillStyle = hl;
          ctx2.fillRect(x, y, w, h * 0.55);
          ctx2.restore();
          ctx2.strokeStyle = "rgba(120,190,225,0.22)";
          ctx2.lineWidth = 1;
          roundRect(ctx2, x, y, w, h, r);
          ctx2.stroke();
          ctx2.beginPath();
          ctx2.moveTo(x + r, y + 0.5);
          ctx2.lineTo(x + w - r, y + 0.5);
          ctx2.strokeStyle = "rgba(190,255,245,0.26)";
          ctx2.stroke();
        }
        /** 命中冲击环：从命中点扩散的同心圆，配合 zoom 形成打击感 */
        _drawShockwaves() {
          if (!this.shocks || !this.shocks.length) return;
          const ctx2 = this.ctx;
          for (let i = 0; i < this.shocks.length; i++) {
            const s = this.shocks[i];
            const k = 1 - Math.max(0, s.life / s.max);
            scene.drawShock(ctx2, s.x, s.y, k, s.color);
          }
        }
        _drawHud() {
          const ctx2 = this.ctx;
          const s = this.scale;
          const st = this.getState();
          const pad = 14 * s;
          const top0 = pad + (this.insetTop || 0);
          const cardW1 = 112 * s;
          const cardW2 = 118 * s;
          const cardH = 86 * s;
          this._glassCard(pad - 8 * s, top0 - 8 * s, cardW1, cardH);
          this._glassCard(this.width - pad - cardW2 + 8 * s, top0 - 8 * s, cardW2, cardH);
          ctx2.textAlign = "left";
          ctx2.textBaseline = "top";
          ctx2.fillStyle = "rgba(160,196,224,0.85)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText("\u5F97\u5206", pad, top0 + 2);
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(34 * s) + "px sans-serif";
          ctx2.fillText(String(st.score), pad, top0 + 16 * s);
          const lampTotal = this.scene && this.scene.lamps ? this.scene.lamps.length : 0;
          const lampLit = Math.round(this.light * lampTotal);
          ctx2.fillStyle = "rgba(255,196,130,0.92)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText("\u70B9\u4EAE " + lampLit + " \u76CF", pad, top0 + 56 * s);
          const lw = cardW1 - 16 * s;
          const ly = top0 + 70 * s;
          ctx2.fillStyle = "rgba(255,255,255,0.14)";
          roundRect(ctx2, pad, ly, lw, 4 * s, 2 * s);
          ctx2.fill();
          if (this.light > 4e-3) {
            ctx2.fillStyle = "#ffb268";
            roundRect(ctx2, pad, ly, Math.max(2, lw * this.light), 4 * s, 2 * s);
            ctx2.fill();
          }
          ctx2.textAlign = "right";
          const dur = st.duration;
          const label = dur > 0 ? "\u5012\u8BA1\u65F6" : "\u5DF2\u7528\u65F6";
          const numText = dur > 0 ? Math.ceil(st.timeLeft) + "s" : Math.floor(st.elapsed) + "s";
          ctx2.fillStyle = "rgba(160,196,224,0.85)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText(label, this.width - pad, top0 + 2);
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(36 * s) + "px sans-serif";
          ctx2.fillText(numText, this.width - pad, top0 + 15 * s);
          const barW = 92 * s;
          const barX = this.width - pad - barW;
          const barY = top0 + 62 * s;
          const ratio = dur > 0 ? clamp(st.timeLeft / dur, 0, 1) : 0;
          ctx2.fillStyle = "rgba(255,255,255,0.16)";
          roundRect(ctx2, barX, barY, barW, 6 * s, 3 * s);
          ctx2.fill();
          ctx2.fillStyle = ratio > 0.25 ? "#4fd1c5" : "#ff8a65";
          roundRect(ctx2, barX, barY, Math.max(4, barW * ratio), 6 * s, 3 * s);
          ctx2.fill();
          if (st.combo >= 2) {
            const bob = 1 + 0.06 * Math.sin(this.t * 12);
            ctx2.save();
            ctx2.translate(this.cx, 150 * s);
            ctx2.scale(bob, bob);
            ctx2.textAlign = "center";
            ctx2.fillStyle = "#ffd166";
            ctx2.font = "bold " + Math.round(26 * s) + "px sans-serif";
            ctx2.fillText("COMBO x" + st.combo, 0, 0);
            ctx2.fillStyle = "rgba(255,209,102,0.75)";
            ctx2.font = Math.round(11 * s) + "px sans-serif";
            ctx2.fillText("\u8FDE\u51FB\u52A0\u6210\u4E2D", 0, 20 * s);
            ctx2.restore();
          }
          const zoneOk = st.inZone;
          if (this.state === STATE2.READY) return;
          ctx2.textAlign = "left";
          ctx2.textBaseline = "bottom";
          const infoY = this.groundY - 6 * s;
          ctx2.lineJoin = "round";
          ctx2.lineWidth = 3 * s;
          ctx2.strokeStyle = "rgba(3,9,15,0.72)";
          const line1 = (st.sensorStale ? "\u6A21\u62DF " : "\u503E\u89D2 ") + (st.angle > 0 ? "+" : "") + st.angle + "\xB0";
          const line2 = zoneOk ? "\u81EA\u52A8\u5F00\u706B\u4E2D" : "\u57FA\u7840\u5206\u6682\u505C";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.strokeText(line2, pad, infoY - 18 * s);
          ctx2.fillStyle = "rgba(170,204,230,0.85)";
          ctx2.fillText(line2, pad, infoY - 18 * s);
          ctx2.font = "bold " + Math.round(13 * s) + "px sans-serif";
          ctx2.strokeText(line1, pad, infoY);
          ctx2.fillStyle = zoneOk ? "rgba(125,255,207,0.98)" : "rgba(255,138,128,0.98)";
          ctx2.fillText(line1, pad, infoY);
          if (!zoneOk && this.state === STATE2.RUNNING) {
            const pulse = 0.35 + 0.25 * Math.sin(this.t * 6);
            ctx2.globalAlpha = pulse;
            ctx2.strokeStyle = "#ff5a5a";
            ctx2.lineWidth = 6 * s;
            ctx2.strokeRect(0, 0, this.width, this.height);
            ctx2.globalAlpha = 1;
            ctx2.textAlign = "center";
            ctx2.textBaseline = "middle";
            ctx2.fillStyle = "#ffb3ad";
            ctx2.font = "bold " + Math.round(17 * s) + "px sans-serif";
            const tip = st.charDir === "left" ? "\u8BF7\u5411\u53F3\u504F  \u2192" : st.charDir === "right" ? "\u2190  \u8BF7\u5411\u5DE6\u504F" : "\u8BF7\u56DE\u5230\u4E2D\u95F4";
            ctx2.fillText(tip, this.cx, this.groundY - 140 * s);
          }
        }
        _drawOverlay() {
          if (this.externalOverlay) return;
          const ctx2 = this.ctx;
          const s = this.scale;
          const st = this.getState();
          ctx2.fillStyle = "rgba(4,9,18,0.52)";
          ctx2.fillRect(0, 0, this.width, this.height);
          const w = this.width * 0.8;
          const hh = st.ended ? 250 * s : 176 * s;
          const x = (this.width - w) / 2;
          const y = (this.height - hh) / 2;
          ctx2.fillStyle = "rgba(16,32,52,0.96)";
          roundRect(ctx2, x, y, w, hh, 16 * s);
          ctx2.fill();
          ctx2.strokeStyle = "rgba(79,209,197,0.45)";
          ctx2.lineWidth = 1.2;
          ctx2.stroke();
          ctx2.textAlign = "center";
          ctx2.textBaseline = "top";
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(21 * s) + "px sans-serif";
          const title = st.ended ? "\u8BAD\u7EC3\u7ED3\u675F" : st.paused ? "\u5DF2\u6682\u505C" : "\u5C04\u51FB\u8BAD\u7EC3";
          ctx2.fillText(title, this.cx, y + 22 * s);
          ctx2.fillStyle = "rgba(170,200,225,0.85)";
          ctx2.font = Math.round(12 * s) + "px sans-serif";
          if (st.ended) {
            const stats = this.score.stats();
            const lampTotal = this.scene && this.scene.lamps ? this.scene.lamps.length : 0;
            const lampLit = Math.round(this.light * lampTotal);
            ctx2.fillStyle = "#ffc078";
            ctx2.font = "bold " + Math.round(15 * s) + "px sans-serif";
            ctx2.fillText("\u70B9\u4EAE " + lampLit + " / " + lampTotal + " \u76CF\u706F\u706B", this.cx, y + 52 * s);
            ctx2.fillStyle = "rgba(170,200,225,0.85)";
            ctx2.font = Math.round(12 * s) + "px sans-serif";
            const lines = [
              "\u603B\u5206 " + stats.score + " \u5206 \xB7 \u547D\u4E2D " + stats.hits + " \u6B21",
              "\u6700\u9AD8\u8FDE\u51FB x" + stats.maxCombo,
              "\u4FDD\u6301\u5728\u8303\u56F4\u5185 " + stats.zoneRate + "% \u7684\u65F6\u95F4"
            ];
            for (let i = 0; i < lines.length; i++) {
              ctx2.fillText(lines[i], this.cx, y + 80 * s + i * 22 * s);
            }
          } else if (st.paused) {
            ctx2.fillText("\u70B9\u51FB\u300C\u7EE7\u7EED\u300D\u56DE\u5230\u8BAD\u7EC3", this.cx, y + 58 * s);
            ctx2.fillText("\u6CBB\u7597\u5E08\u53EF\u5728\u4E0B\u65B9\u9762\u677F\u5B9E\u65F6\u8C03\u6574\u53C2\u6570", this.cx, y + 82 * s);
          } else {
            ctx2.fillText("\u4FDD\u6301\u8EAB\u4F53\u5728\u4E2D\u95F4\uFF0C\u5149\u6838\u4F1A\u81EA\u52A8\u5F00\u706B\u70B9\u4EAE\u57CE\u5E02", this.cx, y + 54 * s);
            ctx2.fillText("\u504F\u79BB\u4FDD\u6301\u8303\u56F4\u4F1A\u505C\u706B\uFF0C\u5DF2\u7ECF\u4EAE\u8D77\u7684\u706F\u4F1A\u7184\u706D", this.cx, y + 76 * s);
            ctx2.fillText("\u672A\u8FDE\u63A5\u4F20\u611F\u5668\u65F6\uFF0C\u53EF\u5DE6\u53F3\u62D6\u52A8\u753B\u9762\u6A21\u62DF", this.cx, y + 98 * s);
          }
          ctx2.fillStyle = "#0f9c8c";
          roundRect(ctx2, this.cx - 62 * s, y + hh - 52 * s, 124 * s, 36 * s, 18 * s);
          ctx2.fill();
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(15 * s) + "px sans-serif";
          ctx2.textBaseline = "middle";
          const btnText = st.ended ? "\u518D\u6765\u4E00\u5C40" : st.paused ? "\u7EE7\u7EED\u8BAD\u7EC3" : "\u5F00\u59CB\u8BAD\u7EC3";
          ctx2.fillText(btnText, this.cx, y + hh - 34 * s);
        }
        /** 覆盖层按钮的命中检测（页面 tap 时调用） */
        isOverlayButtonHit(x, y) {
          if (this.state === STATE2.RUNNING) return false;
          const s = this.scale;
          const st = this.getState();
          const hh = st.ended ? 250 * s : 176 * s;
          const cy = (this.height - hh) / 2 + hh - 52 * s;
          return x >= this.cx - 70 * s && x <= this.cx + 70 * s && y >= cy - 6 * s && y <= cy + 42 * s;
        }
      };
      module.exports = { GameEngine: GameEngine2, STATE: STATE2 };
    }
  });

  // tools/shoot-preview/canvas-main.js
  var params = new URLSearchParams(location.search);
  var W = Number(params.get("w") || 390);
  var H = Number(params.get("h") || 600);
  var DPR = Number(params.get("dpr") || 2);
  var STATE = (params.get("state") || "ready").toLowerCase();
  var ANGLE = Number(params.get("angle") || 0);
  var store = {};
  window.wx = {
    getStorageSync: (k) => k in store ? store[k] : "",
    setStorageSync: (k, v) => {
      store[k] = v;
    },
    removeStorageSync: (k) => {
      delete store[k];
    },
    getWindowInfo: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
    getSystemInfoSync: () => ({ windowWidth: W, windowHeight: H, pixelRatio: DPR }),
    createInnerAudioContext: () => ({
      play() {
      },
      pause() {
      },
      stop() {
      },
      seek() {
      },
      destroy() {
      },
      onEnded() {
      },
      onError() {
      },
      onPlay() {
      },
      onStop() {
      },
      offEnded() {
      },
      offError() {
      }
    }),
    showToast() {
    },
    vibrateShort() {
    },
    nextTick: (fn) => setTimeout(fn, 0)
  };
  var canvas = document.getElementById("c");
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  canvas.requestAnimationFrame = (fn) => window.requestAnimationFrame(fn);
  canvas.cancelAnimationFrame = (id) => window.cancelAnimationFrame(id);
  var { getStore } = require_config();
  require_sprites().setBase("../../assets/games/shoot/");
  var { GameEngine } = require_engine();
  var cfg = getStore();
  var ctx = canvas.getContext("2d");
  var engine = new GameEngine({
    canvas,
    ctx,
    width: W,
    height: H,
    dpr: DPR,
    cfg,
    handlers: { onState() {
    }, onEvent() {
    } }
  });
  function freezeEngine() {
    if (typeof engine._stopLoop === "function") engine._stopLoop();
  }
  var LIGHT_RAW = params.get("light");
  var LIGHT = LIGHT_RAW === null || LIGHT_RAW === "" ? null : Math.max(0, Math.min(1, Number(LIGHT_RAW) || 0));
  var FACE = (params.get("face") || "").toLowerCase();
  function lockFace() {
    if (!engine.monster || !FACE) return;
    engine.monster.sad = FACE === "hit" ? 0.7 : 0;
    engine.monster.smug = FACE === "smug";
  }
  engine.render();
  if (STATE === "running" || STATE === "paused" || STATE === "ended") {
    engine.start();
    for (let i = 0; i < 180; i++) {
      engine.feedSensor({ pitch: ANGLE, roll: 0 });
      engine.update(1 / 60, performance.now() + i * 16.7);
    }
    freezeEngine();
    if (STATE === "paused") engine.pause();
    if (STATE === "ended") {
      engine._end();
      freezeEngine();
    }
    lockFace();
    engine.render();
  }
  lockFace();
  setTimeout(function() {
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    lockFace();
    if (LIGHT !== null) engine.light = LIGHT;
    engine.render();
    window.requestAnimationFrame = raf;
  }, 400);
  var ZOOM = Number(params.get("zoom") || 1);
  if (ZOOM > 1) {
    const zx = Number(params.get("zx") || W / 2);
    const zy = Number(params.get("zy") || H / 2);
    document.body.style.overflow = "hidden";
    canvas.style.position = "absolute";
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = "scale(" + ZOOM + ")";
    canvas.style.left = W / 2 - zx * ZOOM + "px";
    canvas.style.top = H / 2 - zy * ZOOM + "px";
    setTimeout(function() {
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = () => 0;
      if (LIGHT !== null) engine.light = LIGHT;
      engine.render();
      window.requestAnimationFrame = raf;
    }, 500);
  }
})();
