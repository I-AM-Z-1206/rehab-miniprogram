(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // utils/game/config.js
  var require_config = __commonJS({
    "utils/game/config.js"(exports, module) {
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
        hitRange: { group: "\u51FB\u4E2D\u5224\u5B9A", label: "\u51FB\u4E2D\u5224\u5B9A\u534A\u5F84", unit: "px", type: "num", min: 8, max: 200, step: 2, def: 60, tip: "\u51FB\u4E2D\u8303\u56F4=\u4EE5\u602A\u517D\u5706\u5FC3\u4E3A\u539F\u70B9\u7684\u5BB9\u9519\u534A\u5F84\uFF0C\u6E38\u620F\u8FDB\u884C\u4E2D\u53EF\u5B9E\u65F6\u4FEE\u6539" },
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
        // ---------- 目标（固定小怪兽） ----------
        targetRadius: { group: "\u76EE\u6807", label: "\u602A\u517D\u5927\u5C0F", unit: "px", type: "num", min: 12, max: 48, step: 2, def: 22, hidden: true },
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

  // utils/game/score.js
  var require_score = __commonJS({
    "utils/game/score.js"(exports, module) {
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

  // utils/game/bullet.js
  var require_bullet = __commonJS({
    "utils/game/bullet.js"(exports, module) {
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
        }
        resize(width, height) {
          this.width = width;
          this.height = height;
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

  // utils/game/hit.js
  var require_hit = __commonJS({
    "utils/game/hit.js"(exports, module) {
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

  // utils/game/pose.js
  var require_pose = __commonJS({
    "utils/game/pose.js"(exports, module) {
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

  // utils/game/sprites.js
  var require_sprites = __commonJS({
    "utils/game/sprites.js"(exports, module) {
      var BASE = "/assets/games/shoot/";
      var ASSETS = {
        bg: "bg.png",
        // 星空背景（256×256，平铺）
        ship: "ship.png",
        // 玩家飞船（99×75）
        laser: "laser.png",
        // 子弹（9×37）
        star: "star.png",
        // 粒子（25×24）
        monsterBody: "monster_body.png",
        // 怪兽身体（141×194）
        monsterEye: "monster_eye.png",
        // 眼睛（64×69）
        mouthIdle: "mouth_idle.png",
        // 平静（张嘴笑）
        mouthSad: "mouth_sad.png",
        // 悲伤（撇嘴）
        browSmug: "brow_smug.png"
        // 得意时的眉毛
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
      function loadOne(canvas2, src) {
        return new Promise((resolve) => {
          if (!canvas2 || typeof canvas2.createImage !== "function") {
            resolve(null);
            return;
          }
          let img = null;
          try {
            img = canvas2.createImage();
          } catch (e) {
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
              img2 = canvas2.createImage();
            } catch (e) {
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
      module.exports = { SpriteBank, ASSETS, BASE };
    }
  });

  // utils/game/engine.js
  var require_engine = __commonJS({
    "utils/game/engine.js"(exports, module) {
      var { ScoreManager } = require_score();
      var { BulletSystem } = require_bullet();
      var { HitDetector } = require_hit();
      var { PoseTracker } = require_pose();
      var { SpriteBank } = require_sprites();
      var STATE2 = {
        READY: "ready",
        RUNNING: "running",
        PAUSED: "paused",
        ENDED: "ended"
      };
      var PAD = 16;
      var GROUND_RATIO = 0.87;
      var PLAYER_H = 76;
      var MONSTER_Y_RATIO = 0.4;
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
          this.stars = [];
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
          this.bgScroll = 0;
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
          this._layout();
          this._makeStars();
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
          this._makeStars();
          this.playerX = clamp(this.playerX, PAD, this.width - PAD);
          if (this.monster) this.monster.x = this.cx;
          if (this.state !== STATE2.RUNNING) this.render();
        }
        _layout() {
          this.cx = this.width / 2;
          this.groundY = this.height * GROUND_RATIO;
          this.monsterY = this.height * MONSTER_Y_RATIO;
          this.scale = clamp(this.width / 375, 0.72, 1.6);
        }
        _makeStars() {
          this.stars = [];
          const n = Math.round(this.width * this.height / 9e3);
          for (let i = 0; i < n; i++) {
            this.stars.push({
              x: Math.random() * this.width,
              y: Math.random() * this.height * 0.72,
              r: 0.6 + Math.random() * 1.4,
              a: 0.25 + Math.random() * 0.55,
              p: Math.random() * Math.PI * 2
            });
          }
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
          this.bgScroll += dt * 16;
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
          this._updateEffects(dt);
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
              this._addFloat(ev.x, ev.y, "+" + ev.gain, ev.combo >= 2 ? "#ffd166" : "#7dffcf", ev.combo >= 2 ? 1.15 : 1);
              if (ev.combo >= 3) this._addFloat(ev.x, ev.y - 16, "COMBO x" + ev.combo, "#ff9f43", 0.9);
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
          this._drawBackground();
          this._drawKeepZone();
          this._drawAimLine();
          this._drawMonster();
          this._drawPlayer();
          this._drawBullets();
          this._drawParticles();
          this._drawFloats();
          this._drawHud();
          if (this.state !== STATE2.RUNNING) this._drawOverlay();
          ctx2.restore();
        }
        _drawBackground() {
          const ctx2 = this.ctx;
          const w = this.width;
          const h = this.height;
          const bg = this.sprites.get("bg");
          if (bg) {
            const tile = Math.max(200, Math.round(w * 0.66));
            const off = this.bgScroll % tile;
            ctx2.save();
            for (let y = -tile - off; y < h + tile; y += tile) {
              for (let x = -tile * 0.5; x < w + tile; x += tile) {
                ctx2.drawImage(bg, x, y, tile, tile);
              }
            }
            ctx2.restore();
            const shade = ctx2.createLinearGradient(0, 0, 0, h);
            shade.addColorStop(0, "rgba(6,9,20,0.55)");
            shade.addColorStop(0.5, "rgba(6,9,20,0.20)");
            shade.addColorStop(1, "rgba(6,9,20,0.66)");
            ctx2.fillStyle = shade;
            ctx2.fillRect(0, 0, w, h);
            const glow2 = ctx2.createRadialGradient(this.cx, this.groundY + 30, 8, this.cx, this.groundY + 30, this.width * 0.9);
            glow2.addColorStop(0, "rgba(15,156,140,0.22)");
            glow2.addColorStop(1, "rgba(15,156,140,0)");
            ctx2.fillStyle = glow2;
            ctx2.fillRect(0, this.groundY - 80, w, h - this.groundY + 80);
            return;
          }
          const g = ctx2.createLinearGradient(0, 0, 0, h);
          g.addColorStop(0, "#070d1c");
          g.addColorStop(0.5, "#0d1a31");
          g.addColorStop(1, "#122a47");
          ctx2.fillStyle = g;
          ctx2.fillRect(0, 0, w, h);
          for (let i = 0; i < this.stars.length; i++) {
            const s = this.stars[i];
            const a = s.a * (0.65 + 0.35 * Math.sin(this.t * 1.6 + s.p));
            ctx2.globalAlpha = a;
            ctx2.fillStyle = "#cfe8ff";
            ctx2.beginPath();
            ctx2.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx2.fill();
          }
          ctx2.globalAlpha = 1;
          const glow = ctx2.createRadialGradient(this.cx, this.groundY, 8, this.cx, this.groundY, this.width * 0.85);
          glow.addColorStop(0, "rgba(15,156,140,0.30)");
          glow.addColorStop(1, "rgba(15,156,140,0)");
          ctx2.fillStyle = glow;
          ctx2.fillRect(0, this.groundY - this.width * 0.5, this.width, this.width * 0.9);
          const floor = ctx2.createLinearGradient(0, this.groundY, 0, h);
          floor.addColorStop(0, "rgba(12,32,52,0.92)");
          floor.addColorStop(1, "#050a14");
          ctx2.fillStyle = floor;
          ctx2.fillRect(0, this.groundY, w, h - this.groundY);
        }
        _drawKeepZone() {
          const ctx2 = this.ctx;
          const half = this.keepHalfPx();
          const top = 74 * this.scale;
          const bottom = this.groundY - 30;
          const inZone = this.pose.inZone;
          const accent = inZone ? "rgba(15,156,140,1)" : "rgba(255,86,86,1)";
          const fill = inZone ? "rgba(15,156,140,0.10)" : "rgba(255,86,86,0.12)";
          ctx2.fillStyle = fill;
          ctx2.fillRect(this.cx - half, top, half * 2, bottom - top);
          ctx2.save();
          ctx2.setLineDash([7, 7]);
          ctx2.lineWidth = 1.4;
          ctx2.strokeStyle = inZone ? "rgba(88,214,199,0.55)" : "rgba(255,120,120,0.7)";
          ctx2.beginPath();
          ctx2.moveTo(this.cx - half, top);
          ctx2.lineTo(this.cx - half, bottom);
          ctx2.moveTo(this.cx + half, top);
          ctx2.lineTo(this.cx + half, bottom);
          ctx2.stroke();
          ctx2.restore();
          ctx2.save();
          ctx2.setLineDash([3, 9]);
          ctx2.strokeStyle = "rgba(255,255,255,0.16)";
          ctx2.lineWidth = 1;
          ctx2.beginPath();
          ctx2.moveTo(this.cx, top);
          ctx2.lineTo(this.cx, bottom);
          ctx2.stroke();
          ctx2.restore();
          const fs = Math.round(11 * this.scale);
          ctx2.font = fs + "px sans-serif";
          ctx2.textAlign = "center";
          ctx2.textBaseline = "bottom";
          ctx2.fillStyle = accent;
          ctx2.globalAlpha = 0.95;
          ctx2.fillText("\u4FDD \u6301 \u533A  \xB1" + this.cfg.get("keepRangeDeg") + "\xB0", this.cx, top - 6);
          ctx2.globalAlpha = 1;
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
        // ---------------------------------------------------------------- 怪兽
        _drawMonster() {
          const ctx2 = this.ctx;
          const m = this.monster;
          if (!m) return;
          const showRange = !!this.cfg.get("showHitArea") || this.rangeFlash > 0;
          const range = this.cfg.get("hitRange");
          const s = this.scale;
          const x = m.x;
          const smug = !!m.smug;
          const sad = m.sad > 0;
          const laugh = smug ? Math.abs(Math.sin(this.t * 9)) * 2.6 * s : 0;
          const y = m.y + Math.sin(this.t * 2.2) * 3 * s - laugh;
          const r = m.radius;
          if (showRange) {
            ctx2.save();
            ctx2.setLineDash([4, 5]);
            ctx2.lineWidth = 1.2;
            ctx2.strokeStyle = "rgba(255,255,255,0.42)";
            ctx2.beginPath();
            ctx2.arc(x, y, Math.max(range, r), 0, Math.PI * 2);
            ctx2.stroke();
            ctx2.restore();
          }
          const haloColor = smug ? "rgba(255,120,110,0.30)" : "rgba(255,209,102,0.26)";
          const halo = ctx2.createRadialGradient(x, y, r * 0.4, x, y, r * 2.2);
          halo.addColorStop(0, haloColor);
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx2.fillStyle = halo;
          ctx2.beginPath();
          ctx2.arc(x, y, r * 2.2, 0, Math.PI * 2);
          ctx2.fill();
          const body = this.sprites.get("monsterBody");
          if (body) {
            const bh = r * 2.62 * (smug ? 1.03 : 1);
            const bw = bh * (141 / 194);
            const bx = x - bw / 2;
            const by = y - bh / 2;
            ctx2.drawImage(body, bx, by, bw, bh);
            const eye = this.sprites.get("monsterEye");
            if (eye) {
              const ew = bw * 0.32;
              const eh = ew * (69 / 64);
              ctx2.drawImage(eye, x - ew / 2, by + bh * 0.41 - eh / 2, ew, eh);
            }
            const mouthKey = sad && !smug ? "mouthSad" : "mouthIdle";
            const mouth = this.sprites.get(mouthKey);
            if (mouth) {
              const mw = bw * (smug ? 0.42 : mouthKey === "mouthIdle" ? 0.36 : 0.33);
              const mh = mw * (mouth.height / mouth.width);
              ctx2.drawImage(mouth, x - mw / 2, by + bh * 0.63, mw, mh);
            }
            if (smug) {
              const brow = this.sprites.get("browSmug");
              if (brow) {
                const brw = bw * 0.3;
                const brh = brw * (brow.height / brow.width);
                ctx2.save();
                ctx2.translate(x + bw * 0.03, by + bh * 0.22);
                ctx2.rotate(-0.16);
                ctx2.globalAlpha = 0.95;
                ctx2.drawImage(brow, -brw / 2, -brh / 2, brw, brh);
                ctx2.restore();
              }
            }
            return;
          }
          const g = ctx2.createLinearGradient(x, y - r, x, y + r);
          g.addColorStop(0, "#a78bfa");
          g.addColorStop(1, "#6d5bd0");
          ctx2.fillStyle = g;
          ctx2.beginPath();
          ctx2.arc(x, y, r, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.fillStyle = "#ffd166";
          ctx2.beginPath();
          ctx2.moveTo(x - r * 0.7, y - r * 0.85);
          ctx2.lineTo(x - r * 0.9, y - r * 1.35);
          ctx2.lineTo(x - r * 0.35, y - r * 0.95);
          ctx2.closePath();
          ctx2.fill();
          ctx2.beginPath();
          ctx2.moveTo(x + r * 0.7, y - r * 0.85);
          ctx2.lineTo(x + r * 0.9, y - r * 1.35);
          ctx2.lineTo(x + r * 0.35, y - r * 0.95);
          ctx2.closePath();
          ctx2.fill();
          this._drawMonsterFace(x, y, r, m);
        }
        _drawMonsterFace(x, y, r, m) {
          const ctx2 = this.ctx;
          const eyeY = y - r * 0.12;
          const eyeDx = r * 0.38;
          const eyeR = r * 0.14;
          ctx2.fillStyle = "#2b2440";
          ctx2.strokeStyle = "#2b2440";
          ctx2.lineWidth = Math.max(1.4, r * 0.08);
          ctx2.lineCap = "round";
          if (m.smug) {
            ctx2.beginPath();
            ctx2.arc(x - eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
            ctx2.stroke();
            ctx2.beginPath();
            ctx2.arc(x + eyeDx, eyeY + eyeR * 0.35, eyeR * 0.95, Math.PI * 1.15, Math.PI * 1.85);
            ctx2.stroke();
            ctx2.fillStyle = "#2b2440";
            ctx2.beginPath();
            ctx2.arc(x, y + r * 0.24, r * 0.32, 0, Math.PI);
            ctx2.closePath();
            ctx2.fill();
            ctx2.fillStyle = "#ff7a8a";
            ctx2.beginPath();
            ctx2.arc(x, y + r * 0.3, r * 0.19, 0, Math.PI);
            ctx2.closePath();
            ctx2.fill();
          } else if (m.sad > 0) {
            ctx2.beginPath();
            ctx2.arc(x - eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2);
            ctx2.moveTo(x + eyeDx + eyeR, eyeY);
            ctx2.arc(x + eyeDx, eyeY, eyeR, Math.PI, Math.PI * 2);
            ctx2.stroke();
            ctx2.fillStyle = "#7cc7ff";
            ctx2.beginPath();
            ctx2.arc(x - eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2);
            ctx2.arc(x + eyeDx + eyeR * 0.4, eyeY + eyeR * 1.2, eyeR * 0.4, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.strokeStyle = "#2b2440";
            ctx2.beginPath();
            ctx2.arc(x, y + r * 0.62, r * 0.3, Math.PI * 1.15, Math.PI * 1.85);
            ctx2.stroke();
          } else {
            ctx2.fillStyle = "#2b2440";
            ctx2.beginPath();
            ctx2.arc(x - eyeDx, eyeY, eyeR, 0, Math.PI * 2);
            ctx2.arc(x + eyeDx, eyeY, eyeR, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.fillStyle = "#fff";
            ctx2.beginPath();
            ctx2.arc(x - eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2);
            ctx2.arc(x + eyeDx + eyeR * 0.35, eyeY - eyeR * 0.35, eyeR * 0.35, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.strokeStyle = "#2b2440";
            ctx2.beginPath();
            ctx2.arc(x, y + r * 0.32, r * 0.3, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx2.stroke();
          }
        }
        /** 子弹出生点（贴图飞船时对准机头，矢量小人时对准枪口） */
        gunY() {
          if (this.sprites.get("ship")) return this.groundY - 50 * this.scale;
          return this.groundY - PLAYER_H + 4;
        }
        _drawPlayer() {
          const ctx2 = this.ctx;
          const x = this.playerX;
          const gy = this.groundY;
          const tilt = clamp(this.pose.angle / Math.max(6, this.cfg.get("maxLeanDeg")), -1, 1) * 0.22;
          const recoil = this.recoil * 4;
          const s = this.scale;
          const ship = this.sprites.get("ship");
          if (ship) {
            const shipH = 46 * s;
            const shipW = shipH * (99 / 75);
            const cy = gy - 24 * s + recoil;
            const flame = 12 * s + Math.sin(this.t * 26) * 3 * s + this.recoil * 8 * s;
            const fg = ctx2.createLinearGradient(x, cy + shipH * 0.3, x, cy + shipH * 0.3 + flame);
            fg.addColorStop(0, "rgba(255,255,255,0.95)");
            fg.addColorStop(0.4, "rgba(120,230,255,0.8)");
            fg.addColorStop(1, "rgba(60,120,255,0)");
            ctx2.fillStyle = fg;
            ctx2.beginPath();
            ctx2.moveTo(x - 7 * s, cy + shipH * 0.26);
            ctx2.lineTo(x, cy + shipH * 0.26 + flame);
            ctx2.lineTo(x + 7 * s, cy + shipH * 0.26);
            ctx2.closePath();
            ctx2.fill();
            ctx2.save();
            ctx2.translate(x, cy);
            ctx2.rotate(tilt);
            ctx2.drawImage(ship, -shipW / 2, -shipH / 2, shipW, shipH);
            ctx2.restore();
            if (this.muzzle > 0) {
              const mm = this.muzzle / 0.07;
              ctx2.globalAlpha = mm;
              const mg = ctx2.createRadialGradient(x, cy - shipH * 0.5, 1, x, cy - shipH * 0.5, 16 * s);
              mg.addColorStop(0, "rgba(255,255,255,1)");
              mg.addColorStop(0.45, "rgba(120,255,220,0.9)");
              mg.addColorStop(1, "rgba(60,220,180,0)");
              ctx2.fillStyle = mg;
              ctx2.beginPath();
              ctx2.arc(x, cy - shipH * 0.5, 16 * s, 0, Math.PI * 2);
              ctx2.fill();
              ctx2.globalAlpha = 1;
            }
            return;
          }
          ctx2.save();
          ctx2.fillStyle = "rgba(0,0,0,0.45)";
          ctx2.translate(x, gy + 4);
          ctx2.scale(1, 0.27);
          ctx2.beginPath();
          ctx2.arc(0, 0, 26 * s, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.restore();
          ctx2.save();
          ctx2.translate(x, gy);
          ctx2.rotate(tilt);
          const bodyW = 24 * s;
          const bodyH = 34 * s;
          const bodyY = -PLAYER_H * s;
          ctx2.strokeStyle = "#2d4a6b";
          ctx2.lineWidth = 7 * s;
          ctx2.lineCap = "round";
          ctx2.beginPath();
          ctx2.moveTo(-6 * s, bodyY + bodyH - 2 * s);
          ctx2.lineTo(-9 * s, -2);
          ctx2.moveTo(6 * s, bodyY + bodyH - 2 * s);
          ctx2.lineTo(9 * s, -2);
          ctx2.stroke();
          const bg = ctx2.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
          bg.addColorStop(0, "#4fd1c5");
          bg.addColorStop(1, "#0f9c8c");
          ctx2.fillStyle = bg;
          roundRect(ctx2, -bodyW / 2, bodyY, bodyW, bodyH, 8 * s);
          ctx2.fill();
          ctx2.fillStyle = this.pose.inZone ? "#eafff9" : "#ff8a80";
          ctx2.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 4);
          ctx2.beginPath();
          ctx2.arc(0, bodyY + bodyH * 0.55, 4 * s, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.globalAlpha = 1;
          ctx2.fillStyle = "#e8f6ff";
          ctx2.beginPath();
          ctx2.arc(0, bodyY - 8 * s, 9 * s, 0, Math.PI * 2);
          ctx2.fill();
          ctx2.fillStyle = "#0f9c8c";
          ctx2.beginPath();
          ctx2.arc(0, bodyY - 8 * s, 5.4 * s, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx2.fill();
          const gunY = bodyY + 4 * s - recoil * 0.75;
          ctx2.fillStyle = "#d7e6f5";
          roundRect(ctx2, -3.2 * s, gunY - 16 * s, 6.4 * s, 20 * s, 2 * s);
          ctx2.fill();
          ctx2.fillStyle = "#8fb0cc";
          roundRect(ctx2, -7 * s, gunY + 2 * s, 14 * s, 6 * s, 2 * s);
          ctx2.fill();
          if (this.muzzle > 0) {
            const mm = this.muzzle / 0.07;
            ctx2.globalAlpha = mm;
            const mg = ctx2.createRadialGradient(0, gunY - 18 * s, 1, 0, gunY - 18 * s, 14 * s);
            mg.addColorStop(0, "rgba(255,255,255,1)");
            mg.addColorStop(0.4, "rgba(255,214,102,0.9)");
            mg.addColorStop(1, "rgba(255,138,101,0)");
            ctx2.fillStyle = mg;
            ctx2.beginPath();
            ctx2.arc(0, gunY - 18 * s, 14 * s, 0, Math.PI * 2);
            ctx2.fill();
            ctx2.globalAlpha = 1;
          }
          ctx2.restore();
        }
        _drawBullets() {
          const ctx2 = this.ctx;
          const laser = this.sprites.get("laser");
          for (let i = 0; i < this.bullets.list.length; i++) {
            const b = this.bullets.list[i];
            if (laser) {
              const h = 36;
              const w = h * (9 / 37);
              ctx2.globalAlpha = 0.96;
              ctx2.drawImage(laser, b.x - w / 2, b.y - h / 2, w, h);
              ctx2.globalAlpha = 1;
              continue;
            }
            const tx = b.x - b.vx * 0.022;
            const ty = b.y - b.vy * 0.022;
            const g = ctx2.createLinearGradient(tx, ty, b.x, b.y);
            g.addColorStop(0, "rgba(120,255,220,0)");
            g.addColorStop(1, "rgba(200,255,245,0.95)");
            ctx2.strokeStyle = g;
            ctx2.lineWidth = 3.2;
            ctx2.lineCap = "round";
            ctx2.beginPath();
            ctx2.moveTo(tx, ty);
            ctx2.lineTo(b.x, b.y);
            ctx2.stroke();
            ctx2.fillStyle = "rgba(235,255,250,0.95)";
            ctx2.beginPath();
            ctx2.arc(b.x, b.y, 2.6, 0, Math.PI * 2);
            ctx2.fill();
          }
        }
        _drawParticles() {
          const ctx2 = this.ctx;
          const star = this.sprites.get("star");
          for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx2.globalAlpha = Math.max(0, p.life / p.max);
            if (star) {
              const sz = p.r * 4.2;
              ctx2.drawImage(star, p.x - sz / 2, p.y - sz / 2, sz, sz);
            } else {
              ctx2.fillStyle = p.color;
              ctx2.beginPath();
              ctx2.arc(p.x, p.y, p.r, 0, Math.PI * 2);
              ctx2.fill();
            }
          }
          ctx2.globalAlpha = 1;
        }
        _drawFloats() {
          const ctx2 = this.ctx;
          for (let i = 0; i < this.floats.length; i++) {
            const f = this.floats[i];
            const a = Math.max(0, f.life / f.max);
            ctx2.globalAlpha = a;
            ctx2.fillStyle = f.color;
            ctx2.font = "bold " + Math.round(16 * this.scale * f.scale) + "px sans-serif";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "bottom";
            ctx2.fillText(f.text, f.x, f.y);
          }
          ctx2.globalAlpha = 1;
        }
        _drawHud() {
          const ctx2 = this.ctx;
          const s = this.scale;
          const st = this.getState();
          const pad = 14 * s;
          const cardW1 = 112 * s;
          const cardW2 = 118 * s;
          const cardH = 76 * s;
          ctx2.fillStyle = "rgba(8,16,32,0.55)";
          roundRect(ctx2, pad - 8 * s, pad - 8 * s, cardW1, cardH, 12 * s);
          ctx2.fill();
          roundRect(ctx2, this.width - pad - cardW2 + 8 * s, pad - 8 * s, cardW2, cardH, 12 * s);
          ctx2.fill();
          ctx2.strokeStyle = "rgba(120,180,220,0.18)";
          ctx2.lineWidth = 1;
          roundRect(ctx2, pad - 8 * s, pad - 8 * s, cardW1, cardH, 12 * s);
          ctx2.stroke();
          roundRect(ctx2, this.width - pad - cardW2 + 8 * s, pad - 8 * s, cardW2, cardH, 12 * s);
          ctx2.stroke();
          ctx2.textAlign = "left";
          ctx2.textBaseline = "top";
          ctx2.fillStyle = "rgba(160,196,224,0.85)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText("\u5F97\u5206", pad, pad + 2);
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(34 * s) + "px sans-serif";
          ctx2.fillText(String(st.score), pad, pad + 16 * s);
          ctx2.fillStyle = "rgba(140,170,200,0.85)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText("\u547D\u4E2D " + st.hits + " \u6B21", pad, pad + 58 * s);
          ctx2.textAlign = "right";
          const dur = st.duration;
          const label = dur > 0 ? "\u5012\u8BA1\u65F6" : "\u5DF2\u7528\u65F6";
          const numText = dur > 0 ? Math.ceil(st.timeLeft) + "s" : Math.floor(st.elapsed) + "s";
          ctx2.fillStyle = "rgba(160,196,224,0.85)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText(label, this.width - pad, pad + 2);
          ctx2.fillStyle = "#ffffff";
          ctx2.font = "bold " + Math.round(36 * s) + "px sans-serif";
          ctx2.fillText(numText, this.width - pad, pad + 15 * s);
          const barW = 92 * s;
          const barX = this.width - pad - barW;
          const barY = pad + 62 * s;
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
          ctx2.textAlign = "left";
          ctx2.textBaseline = "bottom";
          const infoY = this.groundY - 6 * s;
          ctx2.fillStyle = zoneOk ? "rgba(125,255,207,0.95)" : "rgba(255,138,128,0.95)";
          ctx2.font = "bold " + Math.round(13 * s) + "px sans-serif";
          ctx2.fillText(
            (st.sensorStale ? "\u6A21\u62DF " : "\u503E\u89D2 ") + (st.angle > 0 ? "+" : "") + st.angle + "\xB0",
            pad,
            infoY
          );
          ctx2.fillStyle = "rgba(160,196,224,0.8)";
          ctx2.font = Math.round(11 * s) + "px sans-serif";
          ctx2.fillText(
            zoneOk ? "\u4FDD\u6301\u5728\u8303\u56F4\u5185 \xB7 \u81EA\u52A8\u5F00\u706B" : "\u8D85\u51FA\u4FDD\u6301\u8303\u56F4 \xB7 \u57FA\u7840\u5206\u6682\u505C",
            pad,
            infoY - 18 * s
          );
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
          if (st.sensorStale && this.state !== STATE2.READY) {
            const txt = "\u672A\u8FDE\u63A5\u4F20\u611F\u5668 \xB7 \u53EF\u5DE6\u53F3\u62D6\u52A8\u753B\u9762\u6A21\u62DF";
            ctx2.textAlign = "center";
            ctx2.textBaseline = "middle";
            ctx2.font = Math.round(11 * s) + "px sans-serif";
            const tw = Math.max(120 * s, ctx2.measureText(txt).width + 24 * s);
            const ty = this.height - 20 * s;
            ctx2.fillStyle = "rgba(8,16,28,0.72)";
            roundRect(ctx2, this.cx - tw / 2, ty - 11 * s, tw, 22 * s, 11 * s);
            ctx2.fill();
            ctx2.fillStyle = "rgba(255,214,102,0.95)";
            ctx2.fillText(txt, this.cx, ty + 0.5 * s);
          }
        }
        _drawOverlay() {
          const ctx2 = this.ctx;
          const s = this.scale;
          const st = this.getState();
          ctx2.fillStyle = "rgba(4,9,18,0.72)";
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
            const lines = [
              "\u603B\u5206 " + stats.score + " \u5206",
              "\u547D\u4E2D " + stats.hits + " \u6B21",
              "\u6700\u9AD8\u8FDE\u51FB x" + stats.maxCombo,
              "\u4FDD\u6301\u5728\u8303\u56F4\u5185 " + stats.zoneRate + "% \u7684\u65F6\u95F4"
            ];
            for (let i = 0; i < lines.length; i++) {
              ctx2.fillText(lines[i], this.cx, y + 56 * s + i * 22 * s);
            }
          } else if (st.paused) {
            ctx2.fillText("\u70B9\u51FB\u300C\u7EE7\u7EED\u300D\u56DE\u5230\u8BAD\u7EC3", this.cx, y + 58 * s);
            ctx2.fillText("\u6CBB\u7597\u5E08\u53EF\u5728\u4E0B\u65B9\u9762\u677F\u5B9E\u65F6\u8C03\u6574\u53C2\u6570", this.cx, y + 82 * s);
          } else {
            ctx2.fillText("\u4FDD\u6301\u8EAB\u4F53\u5728\u4E2D\u95F4\uFF0C\u5BF9\u51C6\u5C0F\u602A\u517D\u81EA\u52A8\u5F00\u706B", this.cx, y + 54 * s);
            ctx2.fillText("\u504F\u79BB\u4FDD\u6301\u8303\u56F4\u4F1A\u505C\u706B\uFF0C\u5916\u661F\u4EBA\u8FD8\u4F1A\u7B11\u4F60", this.cx, y + 76 * s);
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
  engine.render();
  if (STATE === "running" || STATE === "paused" || STATE === "ended") {
    engine.start();
    for (let i = 0; i < 180; i++) {
      engine.feedSensor({ pitch: ANGLE, roll: 0 });
      engine.update(1 / 60, performance.now() + i * 16.7);
    }
    engine.stopLoop && engine.stopLoop();
    if (STATE === "paused") engine.pause();
    if (STATE === "ended") {
      engine._end();
      engine.stopLoop && engine.stopLoop();
    }
    engine.render();
  }
  var raf = window.requestAnimationFrame;
  window.requestAnimationFrame = () => 0;
  engine.render();
  window.requestAnimationFrame = raf;
})();
