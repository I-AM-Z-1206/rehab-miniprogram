(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // utils/config-store.js
  var require_config_store = __commonJS({
    "utils/config-store.js"(exports, module) {
      var SAVE_DELAY = 260;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function num(v, def) {
        const n = Number(v);
        return isFinite(n) ? n : def;
      }
      function coerceWith(schema, key, value) {
        const meta = schema[key];
        if (!meta) return void 0;
        if (meta.type === "bool") {
          if (typeof value === "boolean") return value;
          if (value === 1 || value === "1" || value === "true") return true;
          if (value === 0 || value === "0" || value === "false") return false;
          return meta.def;
        }
        if (meta.type === "enum") {
          const opts = meta.options || [];
          if (opts.indexOf(value) >= 0) return value;
          const asNum = Number(value);
          if (opts.indexOf(asNum) >= 0) return asNum;
          return meta.def;
        }
        let v = num(value, meta.def);
        if (meta.step) v = Math.round(v / meta.step) * meta.step;
        v = clamp(v, meta.min, meta.max);
        return Math.round(v * 1e3) / 1e3;
      }
      function createConfigStore(opts) {
        const o = opts || {};
        const SCHEMA = o.schema || {};
        const PRESETS = o.presets || {};
        const validateFn = o.validate || (() => ({ ok: true, errors: [], warnings: [] }));
        const SAVE_DELAY_MS = num(o.saveDelay, SAVE_DELAY);
        const LOG_TAG = o.logTag || "config";
        const DEFAULT_LV = num(o.defaultDifficulty, 3);
        const defaults = () => {
          const d = {};
          Object.keys(SCHEMA).forEach((k) => {
            d[k] = SCHEMA[k].def;
          });
          return d;
        };
        const DEFAULT_CONFIG = defaults();
        const coerce = (key, value) => coerceWith(SCHEMA, key, value);
        class ConfigStore {
          constructor(storeOpts) {
            const so = storeOpts || {};
            this.key = so.storageKey || o.key;
            this.persistEnabled = so.persist !== false;
            this.state = defaults();
            this.listeners = [];
            this.timer = null;
            if (this.persistEnabled) this.load();
          }
          get(key) {
            if (key === void 0) return this.all();
            const v = this.state[key];
            return v === void 0 ? SCHEMA[key] ? SCHEMA[key].def : void 0 : v;
          }
          all() {
            return Object.assign({}, this.state);
          }
          patch(partial, source) {
            if (!partial) return [];
            const changed = [];
            Object.keys(partial).forEach((k) => {
              if (!SCHEMA[k]) return;
              const next = coerce(k, partial[k]);
              if (next === void 0 || next === this.state[k]) return;
              this.state[k] = next;
              changed.push(k);
            });
            if (!changed.length) return changed;
            this.scheduleSave();
            this.emit(changed, source || "patch");
            return changed;
          }
          set(key, value, source) {
            const p = {};
            p[key] = value;
            this.patch(p, source || "set:" + key);
            return this.get(key);
          }
          applyDifficulty(level, applyPreset) {
            const lv = clamp(Math.round(num(level, DEFAULT_LV)), 1, 5);
            const preset = PRESETS[lv];
            if (!preset) return [];
            const p = { difficulty: lv };
            if (applyPreset !== false) {
              Object.keys(preset).forEach((k) => {
                if (k === "label") return;
                if (SCHEMA[k]) p[k] = preset[k];
              });
            }
            return this.patch(p, "difficulty:" + lv);
          }
          difficultyLabel(level) {
            const p = PRESETS[clamp(Math.round(num(level, DEFAULT_LV)), 1, 5)];
            return p ? p.label : "";
          }
          validate() {
            return validateFn(this.state);
          }
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
                console.error("[" + LOG_TAG + "] listener", e);
              }
            });
          }
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
            }
            return this.state;
          }
          scheduleSave() {
            if (!this.persistEnabled || this.timer) return;
            const that = this;
            this.timer = setTimeout(function() {
              that.timer = null;
              that.save();
            }, SAVE_DELAY_MS);
          }
          save() {
            if (!this.persistEnabled) return;
            try {
              wx.setStorageSync(this.key, this.state);
            } catch (e) {
            }
          }
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
        }
        let shared = null;
        function getStore2(storeOpts) {
          if (storeOpts && storeOpts.fresh) return new ConfigStore(storeOpts);
          if (!shared) shared = new ConfigStore(storeOpts);
          return shared;
        }
        return { ConfigStore, getStore: getStore2, defaults, coerce, DEFAULT_CONFIG };
      }
      module.exports = { createConfigStore, coerceWith, clamp, num, SAVE_DELAY };
    }
  });

  // utils/wire-config.js
  var require_wire_config = __commonJS({
    "utils/wire-config.js"(exports, module) {
      var STORAGE_KEY = "wire_cfg_v1";
      var SCHEMA = {
        // ---------------- 难度 ----------------
        difficulty: {
          group: "\u96BE\u5EA6",
          label: "\u96BE\u5EA6\u6863\u4F4D",
          type: "num",
          unit: "\u6863",
          min: 1,
          max: 5,
          step: 1,
          def: 2,
          tip: "\u7B2C 1 \u6863\u6700\u5BBD\u677E\uFF08\u5E45\u5EA6\u5C0F\u3001\u901F\u5EA6\u6162\uFF09\uFF0C\u7B2C 5 \u6863\u8981\u6C42\u6700\u7A33"
        },
        // ---------------- 画面 ----------------
        characterId: {
          group: "\u753B\u9762",
          label: "\u89D2\u8272",
          type: "enum",
          def: "fox",
          options: ["fox", "rabbit", "panda"],
          labels: { fox: "\u5C0F\u72D0\u72F8", rabbit: "\u5C0F\u5154\u5B50", panda: "\u5C0F\u718A\u732B" },
          // 纯外观，**不影响手感**。治疗师要拿同一档位做前后对比，
          // 角色如果带属性（比如熊猫更稳），换角色就等于换难度，前后对比就废了。
          tip: "\u53EA\u6709\u5916\u89C2\u4E0D\u540C\uFF0C\u4E0D\u5F71\u54CD\u5224\u5B9A\u3001\u901F\u5EA6\u4E0E\u96BE\u5EA6"
        },
        // ---------------- 训练目标 ----------------
        durationSec: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u8BAD\u7EC3\u65F6\u957F",
          type: "num",
          unit: "\u79D2",
          min: 20,
          max: 300,
          step: 5,
          def: 90,
          tip: "\u771F\u5B9E\u7ECF\u8FC7\u65F6\u95F4\uFF0C\u4E0D\u542B\u6682\u505C\u4E0E\u4F20\u611F\u5668\u4E2D\u65AD"
        },
        trackLength: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u94A2\u4E1D\u957F\u5EA6",
          type: "num",
          unit: "\u7C73",
          min: 10,
          max: 300,
          step: 5,
          def: 100,
          // 2026-11-01：40 米 → 100 米。40 米配 90 秒等于 0.44 m/s，
          // 临床上属于慢速步态（普通人 1.2~1.4 m/s），画面读起来就是「怎么这么慢」。
          tip: "\u6E38\u620F\u4E16\u754C\u5185\u7684\u524D\u8FDB\u91CC\u7A0B\uFF0C\u4E0D\u662F\u771F\u5B9E\u7A7A\u95F4\u4F4D\u79FB\u3002100 \u7C73 \u2248 \u771F\u5B9E\u6B65\u901F\u8D70 90 \u79D2"
        },
        forwardSpeed: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u524D\u8FDB\u901F\u5EA6",
          type: "num",
          unit: "\u7C73/\u79D2",
          min: 0.1,
          max: 3,
          step: 0.05,
          def: 1.2,
          // 这里只是**画面的**前进速度。患者并不真的走路，只做重心转移，
          // 所以调快它不会要求患者动得更快 —— 这一点必须写清楚，
          // 否则治疗师会以为「调快 = 加难度」。实际难度由稳定要求与失衡模型决定。
          tip: "\u5E73\u8861\u826F\u597D\u65F6\u7684\u753B\u9762\u524D\u8FDB\u901F\u5EA6\uFF08\u4E0D\u5F71\u54CD\u60A3\u8005\u52A8\u4F5C\u96BE\u5EA6\uFF09\u3002\u5931\u8861\u6309\u5E73\u8861\u503C\u6BD4\u4F8B\u51CF\u901F\uFF0C\u8D8A\u754C\u51E0\u4E4E\u505C\u4F4F"
        },
        // ---------------- 体感输入 ----------------
        axisX: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u5DE6\u53F3\u8F74",
          type: "enum",
          def: "pitch",
          options: ["pitch", "roll"],
          tip: "\u5B9E\u6D4B\u672C\u9879\u76EE\u4F69\u6234\u65B9\u5F0F\u4E0B\u5DE6\u53F3\u79FB\u52A8\u8BFB pitch\uFF1B\u6362\u4F69\u6234\u65B9\u5411\u65F6\u6539\u8FD9\u91CC"
        },
        axisY: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u524D\u540E\u8F74",
          type: "enum",
          def: "roll",
          options: ["roll", "pitch"]
        },
        invertX: { group: "\u4F53\u611F\u8F93\u5165", label: "\u5DE6\u53F3\u53CD\u5411", type: "bool", def: true, tip: "\u89D2\u8272\u4E0E\u8EAB\u4F53\u540C\u5411\u65F6\u5173\u95ED" },
        invertY: { group: "\u4F53\u611F\u8F93\u5165", label: "\u524D\u540E\u53CD\u5411", type: "bool", def: false },
        sensitivity: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u63A7\u5236\u7075\u654F\u5EA6",
          type: "num",
          unit: "\u500D",
          min: 0.4,
          max: 2,
          step: 0.05,
          def: 1,
          tip: "\u8D8A\u5927\uFF0C\u540C\u6837\u7684\u8EAB\u4F53\u504F\u79FB\u4EA7\u751F\u7684\u63A7\u5236\u91CF\u8D8A\u5927"
        },
        deadzoneDeg: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u4E2D\u5FC3\u6B7B\u533A",
          type: "num",
          unit: "\xB0",
          min: 0,
          max: 8,
          step: 0.5,
          def: 1.5,
          tip: "\u5C0F\u4E8E\u8BE5\u89D2\u5EA6\u7684\u547C\u5438\u6296\u52A8\u4E0D\u8BA1\u5165\u63A7\u5236\u91CF"
        },
        smooth: {
          group: "\u4F53\u611F\u8F93\u5165",
          label: "\u8DDF\u624B\u5EA6",
          type: "num",
          unit: "",
          min: 0.2,
          max: 1,
          step: 0.02,
          def: 0.55,
          tip: "\u8D8A\u5927\u8D8A\u8DDF\u624B\u3001\u8D8A\u5C0F\u8D8A\u5E73\u987A\uFF1B\u8FC7\u4F4E\u4F1A\u62D6\u5F71"
        },
        // ---------------- 活动边界 ----------------
        leftLimit: { group: "\u6D3B\u52A8\u8FB9\u754C", label: "\u5DE6\u4FA7\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 14 },
        rightLimit: { group: "\u6D3B\u52A8\u8FB9\u754C", label: "\u53F3\u4FA7\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 14 },
        forwardLimit: { group: "\u6D3B\u52A8\u8FB9\u754C", label: "\u524D\u65B9\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        backLimit: { group: "\u6D3B\u52A8\u8FB9\u754C", label: "\u540E\u65B9\u8FB9\u754C", type: "num", unit: "\xB0", min: 3, max: 45, step: 1, def: 12 },
        // ---------------- 平衡模型 ----------------
        recoveryRate: {
          group: "\u5E73\u8861\u6A21\u578B",
          label: "\u5E73\u8861\u6062\u590D\u901F\u5EA6",
          type: "num",
          unit: "/\u79D2",
          min: 0.1,
          max: 1.2,
          step: 0.05,
          def: 0.5,
          tip: "\u56DE\u5230\u4E2D\u5FC3\uFF08\u504F\u79FB < 0.18\uFF09\u540E\u5E73\u8861\u503C\u56DE\u5347\u7684\u5FEB\u6162\u3002\u8FD9\u4E2A\u6570\u8D8A\u5C0F\uFF0C\u56DE\u6B63\u540E\u8981\u7B49\u8D8A\u4E45\u624D\u91CD\u65B0\u8D70\u8D77\u6765"
        },
        instability: {
          group: "\u5E73\u8861\u6A21\u578B",
          label: "\u5931\u8861\u6076\u5316\u901F\u5EA6",
          type: "num",
          unit: "/\u79D2",
          min: 0.3,
          max: 2,
          step: 0.05,
          def: 0.95,
          // 平衡值现在**直接就是速度系数**：跌到 0 就彻底停住，
          // 唯一出路是患者自己把重心找回来（回到舒适区后按恢复速度回升）。
          tip: "\u504F\u79FB\u8D8A\u5927\u3001\u8D8A\u4E45\uFF0C\u5E73\u8861\u503C\u4E0B\u964D\u8D8A\u5FEB\u3002\u5E73\u8861\u503C = \u524D\u8FDB\u901F\u5EA6\u7CFB\u6570\uFF0C\u6389\u5230 0 \u5C31\u505C\u4F4F"
        },
        warnThreshold: {
          group: "\u5E73\u8861\u6A21\u578B",
          label: "\u5931\u8861\u8B66\u6212\u9608\u503C",
          type: "num",
          unit: "",
          min: 0.3,
          max: 0.95,
          step: 0.01,
          def: 0.66,
          tip: "\u5F52\u4E00\u5316\u504F\u79FB\u8D85\u8FC7\u8BE5\u503C\u63D0\u793A\u5931\u8861\uFF0C\u5E76\u5F00\u59CB\u6263\u7A33\u5B9A\u5206"
        },
        // ---------------- 保险绳 ----------------
        ropeEnabled: { group: "\u4FDD\u9669\u7EF3", label: "\u542F\u7528\u4FDD\u9669\u7EF3", type: "bool", def: true },
        ropeTrigger: {
          group: "\u4FDD\u9669\u7EF3",
          label: "\u89E6\u53D1\u9608\u503C",
          type: "num",
          unit: "",
          min: 0.4,
          max: 1,
          step: 0.01,
          def: 0.88,
          tip: "\u9AD8\u4E8E\u8B66\u6212\u9608\u503C\uFF1B\u89E6\u53D1\u540E\u89D2\u8272\u88AB\u8F7B\u62C9\u56DE\uFF0C\u4E0D\u7ED3\u675F\u672C\u5C40"
        },
        ropeRelease: {
          group: "\u4FDD\u9669\u7EF3",
          label: "\u89E3\u9664\u9608\u503C",
          type: "num",
          unit: "",
          min: 0.15,
          max: 0.9,
          step: 0.01,
          def: 0.52,
          tip: "\u56DE\u843D\u5230\u8BE5\u503C\u4EE5\u4E0B\u5E76\u4FDD\u6301\u4E00\u6BB5\u65F6\u95F4\u624D\u89E3\u9664\uFF0C\u907F\u514D\u8FB9\u754C\u53CD\u590D\u89E6\u53D1"
        },
        ropeHoldMs: { group: "\u4FDD\u9669\u7EF3", label: "\u89E3\u9664\u4FDD\u6301\u65F6\u95F4", type: "num", unit: "ms", min: 200, max: 2e3, step: 50, def: 600 },
        ropeCooldownMs: { group: "\u4FDD\u9669\u7EF3", label: "\u518D\u6B21\u89E6\u53D1\u95F4\u9694", type: "num", unit: "ms", min: 300, max: 4e3, step: 100, def: 1500 },
        ropePull: {
          group: "\u4FDD\u9669\u7EF3",
          label: "\u5F15\u5BFC\u5F3A\u5EA6",
          type: "num",
          unit: "",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.6,
          // 2026-11-01：这个参数原来叫「回拉强度」，做的是**自动把患者拉回中线**
          // （把控制量乘上 1-pull）。那是替患者站稳，学不到东西。现在绳索不碰
          // 控制量，这个值改成引导强度：方向光带多亮、语音多急、绳索音多重。
          tip: "\u5931\u8861\u65F6\u5F15\u5BFC\u7684\u5F3A\u5EA6\uFF08\u5149\u5E26\u4EAE\u5EA6 / \u8BED\u97F3\u9891\u6B21 / \u7EF3\u7D22\u97F3\uFF09\u3002\u5DF2\u7ECF\u4E0D\u53C2\u4E0E\u5224\u5B9A"
        },
        failRule: {
          group: "\u4FDD\u9669\u7EF3",
          label: "\u5173\u95ED\u4FDD\u9669\u7EF3\u65F6\u7684\u8D8A\u754C\u89C4\u5219",
          type: "enum",
          def: "penalty",
          options: ["penalty", "terminate"],
          tip: "penalty\uFF1A\u8D8A\u754C\u6682\u505C\u524D\u8FDB\u5E76\u6263\u5206\uFF1Bterminate\uFF1A\u76F4\u63A5\u7ED3\u675F\u672C\u5C40"
        },
        penaltyScore: { group: "\u4FDD\u9669\u7EF3", label: "\u8D8A\u754C\u6263\u5206", type: "num", unit: "\u5206", min: 0, max: 20, step: 1, def: 3 },
        failGraceSec: {
          group: "\u4FDD\u9669\u7EF3",
          label: "\u8D8A\u754C\u5BB9\u5FCD\u65F6\u95F4",
          type: "num",
          unit: "\u79D2",
          min: 0.2,
          max: 3,
          step: 0.1,
          def: 0.8,
          tip: "\u8D8A\u8FC7\u8FB9\u754C\u6301\u7EED\u8BE5\u65F6\u957F\u624D\u5224\u5B9A\u8D8A\u754C\uFF0C\u907F\u514D\u77AC\u65F6\u6296\u52A8\u8BEF\u5224"
        },
        // ---------------- 计分 ----------------
        scorePerMeter: { group: "\u8BA1\u5206", label: "\u6BCF\u7C73\u524D\u8FDB\u5F97\u5206", type: "num", unit: "\u5206", min: 0, max: 20, step: 0.5, def: 1.5 },
        stableScorePerSec: { group: "\u8BA1\u5206", label: "\u6BCF\u79D2\u7A33\u5B9A\u5F97\u5206", type: "num", unit: "\u5206", min: 0, max: 10, step: 0.5, def: 2 },
        comboStep: { group: "\u8BA1\u5206", label: "\u6BCF\u7EA7\u8FDE\u51FB\u52A0\u6210", type: "num", unit: "", min: 0, max: 0.5, step: 0.05, def: 0.1 },
        comboMaxMul: { group: "\u8BA1\u5206", label: "\u8FDE\u51FB\u52A0\u6210\u4E0A\u9650", type: "num", unit: "\u500D", min: 1, max: 4, step: 0.1, def: 2 },
        finishBonus: { group: "\u8BA1\u5206", label: "\u8D70\u5B8C\u5168\u7A0B\u5956\u52B1", type: "num", unit: "\u5206", min: 0, max: 300, step: 10, def: 60 },
        // ---------------- 反馈 ----------------
        sfxOn: { group: "\u53CD\u9988", label: "\u97F3\u6548", type: "bool", def: true },
        voiceOn: { group: "\u53CD\u9988", label: "\u8BED\u97F3\u63D0\u793A", type: "bool", def: true },
        vibrateOn: { group: "\u53CD\u9988", label: "\u632F\u52A8\u53CD\u9988", type: "bool", def: true },
        showTrail: { group: "\u53CD\u9988", label: "\u663E\u793A\u91CD\u5FC3\u8F68\u8FF9", type: "bool", def: false }
      };
      var GROUPS = ["\u96BE\u5EA6", "\u753B\u9762", "\u8BAD\u7EC3\u76EE\u6807", "\u4F53\u611F\u8F93\u5165", "\u6D3B\u52A8\u8FB9\u754C", "\u5E73\u8861\u6A21\u578B", "\u4FDD\u9669\u7EF3", "\u8BA1\u5206", "\u53CD\u9988"];
      var PRESETS = {
        1: {
          // 2026-11-01：里程 ×3.5、速度 ×2.6 —— 原来 90 秒走 40 米 = 0.44 m/s，
          // 临床上属于慢速步态，画面读起来就是「怎么这么慢」。
          // 注意：这是**画面前进速度**，不增加患者动作难度。
          label: "\u7B2C 1 \u6863 \xB7 \u5165\u95E8",
          durationSec: 120,
          trackLength: 110,
          forwardSpeed: 1.05,
          sensitivity: 1.15,
          deadzoneDeg: 2,
          smooth: 0.5,
          leftLimit: 16,
          rightLimit: 16,
          forwardLimit: 14,
          backLimit: 14,
          recoveryRate: 0.6,
          instability: 0.7,
          warnThreshold: 0.72,
          ropeTrigger: 0.92,
          ropeRelease: 0.58,
          ropePull: 0.72
        },
        2: {
          label: "\u7B2C 2 \u6863 \xB7 \u8F7B\u677E",
          durationSec: 90,
          trackLength: 100,
          forwardSpeed: 1.2,
          sensitivity: 1,
          deadzoneDeg: 1.5,
          smooth: 0.55,
          leftLimit: 14,
          rightLimit: 14,
          forwardLimit: 12,
          backLimit: 12,
          recoveryRate: 0.5,
          instability: 0.95,
          warnThreshold: 0.66,
          ropeTrigger: 0.88,
          ropeRelease: 0.52,
          ropePull: 0.6
        },
        3: {
          label: "\u7B2C 3 \u6863 \xB7 \u6807\u51C6",
          durationSec: 80,
          trackLength: 100,
          forwardSpeed: 1.4,
          sensitivity: 0.95,
          deadzoneDeg: 1.2,
          smooth: 0.6,
          leftLimit: 12,
          rightLimit: 12,
          forwardLimit: 11,
          backLimit: 11,
          recoveryRate: 0.45,
          instability: 1.1,
          warnThreshold: 0.62,
          ropeTrigger: 0.86,
          ropeRelease: 0.5,
          ropePull: 0.58
        },
        4: {
          label: "\u7B2C 4 \u6863 \xB7 \u8FDB\u9636",
          durationSec: 70,
          trackLength: 100,
          forwardSpeed: 1.6,
          sensitivity: 0.9,
          deadzoneDeg: 1,
          smooth: 0.66,
          leftLimit: 10,
          rightLimit: 10,
          forwardLimit: 9,
          backLimit: 9,
          recoveryRate: 0.4,
          instability: 1.25,
          warnThreshold: 0.58,
          ropeTrigger: 0.84,
          ropeRelease: 0.48,
          ropePull: 0.55
        },
        5: {
          label: "\u7B2C 5 \u6863 \xB7 \u6311\u6218",
          durationSec: 60,
          trackLength: 95,
          forwardSpeed: 1.8,
          sensitivity: 0.85,
          deadzoneDeg: 0.8,
          smooth: 0.72,
          leftLimit: 9,
          rightLimit: 9,
          forwardLimit: 8,
          backLimit: 8,
          recoveryRate: 0.35,
          instability: 1.4,
          warnThreshold: 0.54,
          ropeTrigger: 0.82,
          ropeRelease: 0.46,
          ropePull: 0.5
        }
      };
      var HARD_LIMIT = { angle: 45, duration: 300 };
      function validate(state) {
        const s = state || {};
        const errors = [];
        const warnings = [];
        if (!(s.durationSec >= 20 && s.durationSec <= HARD_LIMIT.duration)) {
          errors.push("\u8BAD\u7EC3\u65F6\u957F\u9700\u5728 20~300 \u79D2\u4E4B\u95F4");
        }
        if (!(s.trackLength >= 10)) errors.push("\u94A2\u4E1D\u957F\u5EA6\u9700\u4E0D\u5C0F\u4E8E 10 \u7C73");
        if (!(s.forwardSpeed > 0)) errors.push("\u524D\u8FDB\u901F\u5EA6\u9700\u5927\u4E8E 0");
        if (["fox", "rabbit", "panda"].indexOf(s.characterId) < 0) errors.push("\u89D2\u8272\u4E0D\u5B58\u5728\uFF1A" + s.characterId);
        const angles = ["leftLimit", "rightLimit", "forwardLimit", "backLimit"];
        angles.forEach((k) => {
          const v = s[k];
          if (!(v >= 3 && v <= HARD_LIMIT.angle)) {
            errors.push(SCHEMA[k].label + "\u9700\u5728 3\xB0~45\xB0 \u4E4B\u95F4");
          }
        });
        if (s.warnThreshold >= s.ropeTrigger) {
          errors.push("\u5931\u8861\u8B66\u6212\u9608\u503C\u9700\u5C0F\u4E8E\u4FDD\u9669\u7EF3\u89E6\u53D1\u9608\u503C");
        }
        if (s.ropeRelease >= s.ropeTrigger) {
          errors.push("\u4FDD\u9669\u7EF3\u89E3\u9664\u9608\u503C\u9700\u5C0F\u4E8E\u89E6\u53D1\u9608\u503C");
        }
        if (s.ropePull < 0 || s.ropePull > 1) errors.push("\u4FDD\u9669\u7EF3\u56DE\u62C9\u5F3A\u5EA6\u9700\u5728 0~1 \u4E4B\u95F4");
        if (s.ropeTrigger > 1.0001) errors.push("\u4FDD\u9669\u7EF3\u89E6\u53D1\u9608\u503C\u4E0D\u80FD\u5927\u4E8E 1\uFF08\u8FB9\u754C\uFF09");
        if (s.axisX === s.axisY) errors.push("\u5DE6\u53F3\u8F74\u4E0E\u524D\u540E\u8F74\u4E0D\u80FD\u4F7F\u7528\u540C\u4E00\u4E2A\u8F74");
        if (s.warnThreshold > 0.9) warnings.push("\u8B66\u6212\u9608\u503C\u8FC7\u9AD8\uFF0C\u5931\u8861\u63D0\u793A\u4F1A\u5F88\u5C11\u51FA\u73B0");
        if (s.instability < 0.5) warnings.push("\u5931\u8861\u6076\u5316\u901F\u5EA6\u5F88\u4F4E\uFF0C\u51E0\u4E4E\u4E0D\u4F1A\u5931\u8861");
        if (s.ropeEnabled && s.ropePull < 0.2) warnings.push("\u4FDD\u9669\u7EF3\u56DE\u62C9\u5F3A\u5EA6\u8FC7\u4F4E\uFF0C\u4ECB\u5165\u6548\u679C\u4E0D\u660E\u663E");
        if (!s.ropeEnabled && s.failRule === "terminate") warnings.push("\u4FDD\u9669\u7EF3\u5DF2\u5173\u95ED\uFF0C\u8D8A\u754C\u4F1A\u76F4\u63A5\u7ED3\u675F\u672C\u5C40");
        if (s.sensitivity > 1.4) warnings.push("\u7075\u654F\u5EA6\u8FC7\u9AD8\uFF0C\u5C0F\u52A8\u4F5C\u4F1A\u88AB\u653E\u5927");
        return { ok: errors.length === 0, errors, warnings };
      }
      var { createConfigStore } = require_config_store();
      var base = createConfigStore({
        key: STORAGE_KEY,
        schema: SCHEMA,
        presets: PRESETS,
        validate,
        defaultDifficulty: 2,
        logTag: "wire-config"
      });
      var { ConfigStore, getStore: baseGetStore, coerce, DEFAULT_CONFIG } = base;
      var RULESET_KEY = "wire_ruleset";
      var RULESET_VERSION = 2;
      var RULESET_V2 = {
        // 旧：第 1~5 档 0.40 / 0.50 / 0.62 / 0.72 / 0.82（以及旧默认 0.5）
        forwardSpeed: { 0.4: 1.05, 0.5: 1.2, 0.62: 1.4, 0.72: 1.6, 0.82: 1.8 },
        // 旧：30 / 40 / 45 / 50 / 55，默认 40
        trackLength: { 30: 110, 40: 100, 45: 100, 50: 100, 55: 95 },
        // 里程翻 2.5 倍，每米得分要跟着降，否则总分翻倍、和旧记录完全不可比
        scorePerMeter: { 4: 1.5 }
      };
      function rulesetPatch(state) {
        const s = state || {};
        const out = {};
        Object.keys(RULESET_V2).forEach((k) => {
          const cur = Number(s[k]);
          if (!isFinite(cur)) return;
          const table = RULESET_V2[k];
          Object.keys(table).forEach((from) => {
            if (Math.abs(Number(from) - cur) < 1e-3) out[k] = table[from];
          });
        });
        return out;
      }
      var rulesetChecked = false;
      function getStore2(opts) {
        const store = baseGetStore(opts);
        if (rulesetChecked || opts && opts.fresh) return store;
        rulesetChecked = true;
        try {
          if (typeof wx === "undefined" || !wx.getStorageSync) return store;
          const ver = Number(wx.getStorageSync(RULESET_KEY)) || 0;
          if (ver >= RULESET_VERSION) return store;
          const patch = rulesetPatch(store.all());
          const keys = Object.keys(patch);
          if (keys.length) store.patch(patch, "ruleset:v2");
          try {
            wx.setStorageSync(RULESET_KEY, RULESET_VERSION);
          } catch (e) {
          }
          if (keys.length) console.log("[wire-config] \u89C4\u5219\u96C6\u8FC1\u79FB v2\uFF1A" + keys.join(","));
        } catch (e) {
          console.warn("[wire-config] \u89C4\u5219\u96C6\u8FC1\u79FB\u5931\u8D25", e);
        }
        return store;
      }
      module.exports = {
        WireConfigStore: ConfigStore,
        getStore: getStore2,
        SCHEMA,
        GROUPS,
        PRESETS,
        DEFAULT_CONFIG,
        STORAGE_KEY,
        RULESET_KEY,
        RULESET_VERSION,
        rulesetPatch,
        validate,
        coerce
      };
    }
  });

  // utils/zero.js
  var require_zero = __commonJS({
    "utils/zero.js"(exports, module) {
      var KEY = "wt_zero_v1";
      var DEF = { roll: 0, pitch: 0, set: false, at: 0 };
      var state = null;
      function wrap180(v) {
        let x = v % 360;
        if (x > 180) x -= 360;
        if (x < -180) x += 360;
        return x;
      }
      function round2(v) {
        return Math.round(v * 100) / 100;
      }
      function syncApp(s) {
        const app = typeof getApp === "function" ? getApp() : null;
        if (app) {
          app.globalData = app.globalData || {};
          app.globalData.zero = s;
        }
      }
      function persist(s) {
        try {
          wx.setStorageSync(KEY, s);
        } catch (e) {
        }
      }
      function load() {
        if (state) return state;
        let s = null;
        try {
          s = wx.getStorageSync(KEY);
        } catch (e) {
        }
        if (s && typeof s.roll === "number" && typeof s.pitch === "number") {
          state = { roll: wrap180(s.roll), pitch: wrap180(s.pitch), set: !!s.set, at: Number(s.at) || 0 };
        } else {
          state = { roll: DEF.roll, pitch: DEF.pitch, set: DEF.set, at: DEF.at };
        }
        syncApp(state);
        return state;
      }
      function get() {
        const s = load();
        return { roll: s.roll, pitch: s.pitch, set: s.set, at: s.at };
      }
      function set(roll, pitch) {
        state = {
          roll: round2(wrap180(Number(roll) || 0)),
          pitch: round2(wrap180(Number(pitch) || 0)),
          set: true,
          // 标定时刻：零点是**设备级**的，传感器每次佩戴位置变了就不准了。
          // 光有 set=true 不够 —— 它一旦为真就永远为真，第二天戴上还是「已标定」。
          at: Date.now()
        };
        persist(state);
        syncApp(state);
        return get();
      }
      function reset() {
        state = { roll: 0, pitch: 0, set: false, at: 0 };
        persist(state);
        syncApp(state);
        return get();
      }
      function setFromAngles(rawRoll, rawPitch) {
        return set(-(Number(rawRoll) || 0), -(Number(rawPitch) || 0));
      }
      function setFromSamples(samples) {
        if (!samples || !samples.length) return null;
        let sr = 0;
        let sp = 0;
        let n = 0;
        samples.forEach((s) => {
          if (!s) return;
          if (typeof s.roll === "number") sr += s.roll;
          if (typeof s.pitch === "number") sp += s.pitch;
          n++;
        });
        if (!n) return null;
        return set(-sr / n, -sp / n);
      }
      function apply(d) {
        if (!d) return d;
        if (typeof d.roll !== "number" && typeof d.pitch !== "number") return d;
        const z = load();
        const out = Object.assign({}, d);
        if (typeof d.roll === "number") {
          out.rawRoll = d.rawRoll === void 0 ? d.roll : d.rawRoll;
          out.roll = wrap180(d.roll + z.roll);
        }
        if (typeof d.pitch === "number") {
          out.rawPitch = d.rawPitch === void 0 ? d.pitch : d.rawPitch;
          out.pitch = wrap180(d.pitch + z.pitch);
        }
        return out;
      }
      function reload() {
        state = null;
        return load();
      }
      module.exports = {
        get,
        set,
        reset,
        reload,
        setFromAngles,
        setFromSamples,
        apply,
        wrap180
      };
    }
  });

  // utils/motion.js
  var require_motion = __commonJS({
    "utils/motion.js"(exports, module) {
      var zero = require_zero();
      var CAL_TOTAL_MS = 3e3;
      var CAL_BASE_MS = 800;
      var CAL_MIN_SAMPLES = 15;
      var CAL_STD_LIMIT = 2.6;
      var CAL_MAX_SWING = 9;
      var STALE_MS = 1200;
      var OUTLIER_JUMP = 45;
      var SWAY_BUCKETS = [0.2, 0.4, 0.6, 0.8, 1];
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function round(v, d) {
        const p = Math.pow(10, d || 0);
        return Math.round(v * p) / p;
      }
      function stdDev(arr) {
        if (!arr.length) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        const m = s / arr.length;
        let v = 0;
        for (let i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m);
        return Math.sqrt(v / arr.length);
      }
      function mean(arr) {
        if (!arr.length) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
      }
      var MotionTracker = class {
        /**
         * @param {object} cfg utils/wire-config 的 store（提供活动边界 / 灵敏度 / 死区 / 轴向）
         */
        constructor(cfg2) {
          this.cfg = cfg2;
          this.roll = 0;
          this.pitch = 0;
          this.rawRoll = 0;
          this.rawPitch = 0;
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.load = 0;
          this.dir = "center";
          this.stale = true;
          this.hasSignal = false;
          this.lastFrameAt = 0;
          this.rateHz = 0;
          this.outliers = 0;
          this.quality = 1;
          this.simMode = false;
          this.simX = 0;
          this.simY = 0;
          this.simTargetX = 0;
          this.simTargetY = 0;
          this.cal = {
            active: false,
            startedAt: 0,
            elapsed: 0,
            total: CAL_TOTAL_MS,
            samples: [],
            result: null,
            // null | 'ok' | 'unstable' | 'no_data'
            message: ""
          };
          this.traj = {
            pathLength: 0,
            seconds: 0,
            peak: 0,
            sway: [0, 0, 0, 0, 0],
            samples: 0
          };
          this.prevNx = 0;
          this.prevNy = 0;
          this._rateAt = 0;
          this._rateCount = 0;
          this._deltaAcc = 0;
          this._deltaAt = 0;
        }
        // ---------------------------------------------------------------- 输入
        /** 传感器一帧：{ roll, pitch }（已由 witble 叠加全局零点） */
        feed(frame) {
          if (!frame) return;
          const hasRoll = typeof frame.roll === "number";
          const hasPitch = typeof frame.pitch === "number";
          if (!hasRoll && !hasPitch) return;
          const now = Date.now();
          const nextRoll = hasRoll ? frame.roll : this.roll;
          const nextPitch = hasPitch ? frame.pitch : this.pitch;
          if (this.hasSignal && now - this.lastFrameAt < 400) {
            const jump = Math.max(Math.abs(nextRoll - this.roll), Math.abs(nextPitch - this.pitch));
            if (jump > OUTLIER_JUMP) {
              this.outliers += 1;
              this.lastFrameAt = now;
              this._countRate(now);
              return;
            }
          }
          this.roll = nextRoll;
          this.pitch = nextPitch;
          if (typeof frame.rawRoll === "number") this.rawRoll = frame.rawRoll;
          if (typeof frame.rawPitch === "number") this.rawPitch = frame.rawPitch;
          this.hasSignal = true;
          this.stale = false;
          this.lastFrameAt = now;
          this._countRate(now);
          if (this.cal.active) {
            const r = typeof frame.rawRoll === "number" ? frame.rawRoll : nextRoll;
            const p = typeof frame.rawPitch === "number" ? frame.rawPitch : nextPitch;
            this.cal.samples.push({ t: now, roll: r, pitch: p });
          }
        }
        _countRate(now) {
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
            const bad = clamp(this.outliers / Math.max(4, this.rateHz), 0, 1);
            this.quality = round(1 - bad * 0.8, 2);
            this.outliers = 0;
          }
        }
        // ---------------------------------------------------------------- 模拟
        setSimMode(on) {
          this.simMode = !!on;
          if (!this.simMode) {
            this.simTargetX = 0;
            this.simTargetY = 0;
          }
        }
        /** 模拟输入（归一化 -1~1），带 0.35s 缓动，避免瞬移 */
        setSimTarget(x, y) {
          this.simTargetX = clamp(Number(x) || 0, -1, 1);
          if (typeof y === "number") this.simTargetY = clamp(y, -1, 1);
        }
        nudgeSim(dx, dy) {
          this.simTargetX = clamp(this.simTargetX + (dx || 0), -1, 1);
          this.simTargetY = clamp(this.simTargetY + (dy || 0), -1, 1);
        }
        centerSim() {
          this.simTargetX = 0;
          this.simTargetY = 0;
        }
        get source() {
          return this.simMode ? "simulation" : "real";
        }
        /** 真实数据是否可用（模拟模式下恒为 true） */
        isLive() {
          return this.simMode || !this.stale && this.hasSignal;
        }
        // ---------------------------------------------------------------- 标定
        /**
         * 是否已有可用的零点。
         * 零点存在 utils/zero.js 里，全 App 共用一份：零点标定页标过、或别的游戏标过，
         * 这里都应当算数。以前各游戏只认「本次进入游戏内做过的标定」，导致已经标好的
         * 用户每进一个游戏都被要求再标一次，重复劳动。
         */
        hasZero() {
          if (this.cal && this.cal.result === "ok") return true;
          try {
            return !!zero.get().set;
          } catch (e) {
            return false;
          }
        }
        /** 当前零点偏移量（度）。界面用它说明"沿用的是哪个零点" */
        zeroInfo() {
          try {
            const z = zero.get();
            return { roll: z.roll, pitch: z.pitch, set: !!z.set };
          } catch (e) {
            return { roll: 0, pitch: 0, set: false };
          }
        }
        beginCalibration() {
          this.cal.active = true;
          this.cal.startedAt = Date.now();
          this.cal.elapsed = 0;
          this.cal.samples = [];
          this.cal.result = null;
          this.cal.message = "";
        }
        cancelCalibration() {
          this.cal.active = false;
          this.cal.elapsed = 0;
          this.cal.samples = [];
        }
        /** 每帧推进标定；返回 true 表示刚刚完成（结果见 cal.result） */
        _tickCalibration(now) {
          if (!this.cal.active) return false;
          this.cal.elapsed = now - this.cal.startedAt;
          if (this.cal.elapsed < CAL_TOTAL_MS) return false;
          const samples = this.cal.samples || [];
          this.cal.active = false;
          this.cal.elapsed = CAL_TOTAL_MS;
          if (samples.length < CAL_MIN_SAMPLES) {
            this.cal.result = "no_data";
            this.cal.message = "\u6CA1\u6709\u6536\u5230\u8DB3\u591F\u7684\u59FF\u6001\u6570\u636E\uFF0C\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5";
            return true;
          }
          const rolls = samples.map((s) => s.roll);
          const pitches = samples.map((s) => s.pitch);
          const sdRoll = stdDev(rolls);
          const sdPitch = stdDev(pitches);
          const swing = Math.max(
            Math.max.apply(null, rolls) - Math.min.apply(null, rolls),
            Math.max.apply(null, pitches) - Math.min.apply(null, pitches)
          );
          if (sdRoll > CAL_STD_LIMIT || sdPitch > CAL_STD_LIMIT || swing > CAL_MAX_SWING) {
            this.cal.result = "unstable";
            this.cal.message = "\u68C0\u6D4B\u5230\u8EAB\u4F53\u6643\u52A8\uFF08" + round(Math.max(sdRoll, sdPitch), 1) + "\xB0\uFF09\uFF0C\u8BF7\u5750\u7A33\u6216\u7AD9\u7A33\u540E\u91CD\u65B0\u6807\u5B9A";
            return true;
          }
          const tail = samples.filter((s) => now - s.t <= CAL_BASE_MS);
          const use = tail.length >= 5 ? tail : samples;
          const baseRoll = mean(use.map((s) => s.roll));
          const basePitch = mean(use.map((s) => s.pitch));
          zero.set(-baseRoll, -basePitch);
          this.cal.result = "ok";
          this.cal.message = "\u6807\u5B9A\u5B8C\u6210\uFF1A\u9759\u6B62\u59FF\u6001\u5DF2\u8BB0\u4E3A\u4E2D\u7ACB\u4F4D";
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.prevNx = 0;
          this.prevNy = 0;
          return true;
        }
        // ---------------------------------------------------------------- 每帧更新
        update(dt) {
          const now = Date.now();
          const step = clamp(Number(dt) || 1 / 60, 1e-3, 0.1);
          this._tickCalibration(now);
          if (!this.simMode && this.hasSignal && now - this.lastFrameAt > STALE_MS) this.stale = true;
          const cfg2 = this.cfg;
          const axisX = cfg2.get("axisX");
          const axisY = cfg2.get("axisY");
          const sens = Number(cfg2.get("sensitivity")) || 1;
          const dead = Number(cfg2.get("deadzoneDeg")) || 0;
          const leftLimit = Math.max(3, Number(cfg2.get("leftLimit")) || 12);
          const rightLimit = Math.max(3, Number(cfg2.get("rightLimit")) || 12);
          const fwdLimit = Math.max(3, Number(cfg2.get("forwardLimit")) || 12);
          const backLimit = Math.max(3, Number(cfg2.get("backLimit")) || 12);
          let targetX;
          let targetY;
          if (this.simMode) {
            const a = 1 - Math.pow(1 - 0.22, step * 60);
            this.simX += (this.simTargetX - this.simX) * a;
            this.simY += (this.simTargetY - this.simY) * a;
            targetX = this.simX;
            targetY = this.simY;
            this.angleX = targetX * (targetX < 0 ? leftLimit : rightLimit);
            this.angleY = targetY * (targetY < 0 ? backLimit : fwdLimit);
            this.stale = false;
          } else {
            const rawX = cfg2.get("invertX") ? -1 : 1;
            const rawY = cfg2.get("invertY") ? -1 : 1;
            const ax = axisX === "roll" ? this.roll : this.pitch;
            const ay = axisY === "roll" ? this.roll : this.pitch;
            const degX = rawX * ax;
            const degY = rawY * ay;
            const dx = Math.abs(degX) < dead ? 0 : degX - (degX > 0 ? dead : -dead);
            const dy = Math.abs(degY) < dead ? 0 : degY - (degY > 0 ? dead : -dead);
            this.angleX = degX;
            this.angleY = degY;
            targetX = clamp(dx * sens / (dx < 0 ? leftLimit : rightLimit), -1, 1);
            targetY = clamp(dy * sens / (dy < 0 ? backLimit : fwdLimit), -1, 1);
          }
          const smooth = clamp(Number(cfg2.get("smooth")) || 0.55, 0.2, 1);
          if (!this.simMode && this.stale) {
            const back = 1 - Math.pow(1 - 0.08, step * 60);
            this.nx += (0 - this.nx) * back;
            this.ny += (0 - this.ny) * back;
          } else {
            const alpha = 1 - Math.pow(1 - smooth, step * 60);
            this.nx += (targetX - this.nx) * alpha;
            this.ny += (targetY - this.ny) * alpha;
          }
          this.nx = clamp(this.nx, -1, 1);
          this.ny = clamp(this.ny, -1, 1);
          this.load = Math.max(Math.abs(this.nx), Math.abs(this.ny) * 0.75);
          const sideTh = clamp(Number(cfg2.get("sideThreshold")) || 0.1, 0.02, 1);
          if (this.nx < -sideTh) this.dir = "left";
          else if (this.nx > sideTh) this.dir = "right";
          else this.dir = "center";
          return this;
        }
        // ---------------------------------------------------------------- 轨迹统计
        resetTrajectory() {
          this.traj = { pathLength: 0, seconds: 0, peak: 0, sway: [0, 0, 0, 0, 0], samples: 0 };
          this.prevNx = this.nx;
          this.prevNy = this.ny;
        }
        /** 每帧累计（仅 PLAYING 时调用）：归一化单位，不是厘米 */
        tickTrajectory(dt) {
          const step = clamp(Number(dt) || 0, 0, 0.1);
          if (step <= 0) return;
          const d = Math.sqrt(
            (this.nx - this.prevNx) * (this.nx - this.prevNx) + (this.ny - this.prevNy) * (this.ny - this.prevNy)
          );
          this.prevNx = this.nx;
          this.prevNy = this.ny;
          const t = this.traj;
          t.pathLength += d;
          t.seconds += step;
          t.samples += 1;
          if (Math.abs(this.nx) > t.peak) t.peak = Math.abs(this.nx);
          const a = Math.abs(this.nx);
          let idx = 0;
          while (idx < SWAY_BUCKETS.length - 1 && a > SWAY_BUCKETS[idx]) idx++;
          t.sway[idx] += step;
        }
        /** 轨迹摘要：明确标注为「姿态代理指标」 */
        getTrajectory() {
          const t = this.traj;
          const total = t.sway.reduce((a, b) => a + b, 0);
          const dist = SWAY_BUCKETS.map((b, i) => {
            const lo = i === 0 ? 0 : SWAY_BUCKETS[i - 1];
            return { label: lo.toFixed(1) + "~" + b.toFixed(1), ratio: total > 0 ? t.sway[i] / total : 0 };
          });
          return {
            pathLength: round(t.pathLength, 2),
            seconds: round(t.seconds, 2),
            peak: round(t.peak, 2),
            avgRate: t.seconds > 0.5 ? round(t.pathLength / t.seconds, 3) : 0,
            sway: dist,
            note: "\u5F52\u4E00\u5316\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u975E\u771F\u5B9E\u4F4D\u79FB"
          };
        }
        reset() {
          this.nx = 0;
          this.ny = 0;
          this.angleX = 0;
          this.angleY = 0;
          this.load = 0;
          this.dir = "center";
          this.prevNx = 0;
          this.prevNy = 0;
          this.resetTrajectory();
          this.cancelCalibration();
        }
      };
      module.exports = {
        MotionTracker,
        CAL_TOTAL_MS,
        CAL_BASE_MS,
        STALE_MS,
        SWAY_BUCKETS
      };
    }
  });

  // pkgWire/games/wire/safety.js
  var require_safety = __commonJS({
    "pkgWire/games/wire/safety.js"(exports, module) {
      var SAFETY_STATE = {
        IDLE: "IDLE",
        WARN: "WARN",
        ENGAGED: "ENGAGED",
        RECOVERING: "RECOVERING"
      };
      var LEVEL = { OK: 0, WARN: 1, OVER: 2 };
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      var SafetyRope = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.reset();
        }
        reset() {
          this.state = SAFETY_STATE.IDLE;
          this.enabled = true;
          this.tension = 0;
          this.triggers = 0;
          this.engagedSec = 0;
          this.longestEngage = 0;
          this.warnSec = 0;
          this.level = LEVEL.OK;
          this.guideDir = 0;
          this.guideAxis = "";
          this.guideStrength = 0;
          this._engagedStart = 0;
          this._holdStart = 0;
          this._lastEndAt = 0;
          this._warned = false;
          this.events = [];
        }
        get engaged() {
          return this.state === SAFETY_STATE.ENGAGED;
        }
        get warning() {
          return this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.ENGAGED;
        }
        /** 该往哪边压：nx > 0（偏右）→ 要往左压 → -1 */
        getStateLabel() {
          if (!this.enabled) return "\u5DF2\u5173\u95ED";
          if (this.state === SAFETY_STATE.ENGAGED) return "\u8D8A\u754C\uFF1A\u8BF7\u56DE\u6B63";
          if (this.state === SAFETY_STATE.RECOVERING) return "\u6B63\u5728\u56DE\u6B63";
          if (this.state === SAFETY_STATE.WARN) return "\u5931\u8861\uFF1A\u8BF7\u56DE\u6B63";
          return "\u5F85\u547D";
        }
        /** HUD 用的短文案 */
        getShortLabel() {
          if (!this.enabled) return "\u5173\u95ED";
          if (this.state === SAFETY_STATE.ENGAGED) return "\u8D8A\u754C";
          if (this.state === SAFETY_STATE.RECOVERING) return "\u56DE\u6B63\u4E2D";
          if (this.state === SAFETY_STATE.WARN) return "\u5931\u8861";
          return "\u5F85\u547D";
        }
        _push(type, extra) {
          this.events.push(Object.assign({ type, at: Date.now() }, extra || {}));
        }
        /**
         * @param {object} o
         *   dt    秒
         *   load  归一化偏移量 0~1（原始值，不经过任何抑制）
         *   nx    带符号的左右偏移 -1~1（用来算引导方向）
         *   ny    前后偏移
         */
        update(o) {
          const opts = o || {};
          const cfg2 = this.cfg;
          const now = Date.now();
          const step = Math.max(0, Math.min(0.1, Number(opts.dt) || 0));
          const nx = Number(opts.nx) || 0;
          const ny = Number(opts.ny) || 0;
          this.events = [];
          this.enabled = !!cfg2.get("ropeEnabled");
          const warn = Number(cfg2.get("warnThreshold")) || 0.66;
          const trigger = Math.max(warn + 0.02, Number(cfg2.get("ropeTrigger")) || 0.88);
          const release = Math.min(trigger - 0.02, Number(cfg2.get("ropeRelease")) || 0.52);
          const holdMs = Number(cfg2.get("ropeHoldMs")) || 600;
          const cooldown = Number(cfg2.get("ropeCooldownMs")) || 1500;
          const v = clamp(Number(opts.load) || 0, 0, 1);
          const ax = Math.abs(nx);
          const ay = Math.abs(ny);
          this.guideAxis = "";
          if (v < 0.22) {
            this.guideDir = 0;
          } else if (ax >= ay) {
            this.guideDir = nx > 0 ? -1 : 1;
            this.guideAxis = "x";
          } else {
            this.guideDir = 0;
            this.guideAxis = "y";
          }
          const pull = clamp(Number(cfg2.get("ropePull")) || 0.6, 0, 1);
          this.guideStrength = this.guideDir === 0 ? 0 : clamp(pull * (0.35 + 0.65 * (v / Math.max(0.01, trigger))), 0, 1);
          if (!this.enabled) {
            if (this.state !== SAFETY_STATE.IDLE) {
              this.state = SAFETY_STATE.IDLE;
              this._push("rope:off");
            }
            this.level = v >= warn ? LEVEL.WARN : LEVEL.OK;
            this.tension += (0 - this.tension) * Math.min(1, step * 4);
            if (v >= warn && !this._warned) {
              this._warned = true;
              this._push("warn", { load: v, dir: this.guideDir });
            } else if (v < warn * 0.9 && this._warned) {
              this._warned = false;
              this._push("warnEnd");
            }
            return this;
          }
          switch (this.state) {
            case SAFETY_STATE.IDLE:
              if (v >= trigger && now - this._lastEndAt >= cooldown) {
                this._engage(now, v);
              } else if (v >= warn) {
                this.state = SAFETY_STATE.WARN;
                if (!this._warned) {
                  this._warned = true;
                  this._push("warn", { load: v, dir: this.guideDir });
                }
              }
              break;
            case SAFETY_STATE.WARN:
              if (v >= trigger && now - this._lastEndAt >= cooldown) {
                this._engage(now, v);
              } else if (v < warn * 0.9) {
                this.state = SAFETY_STATE.IDLE;
                this._warned = false;
                this._push("warnEnd");
              }
              break;
            case SAFETY_STATE.ENGAGED:
              this.engagedSec += step;
              this.longestEngage = Math.max(this.longestEngage, now - this._engagedStart);
              if (v <= release) {
                this.state = SAFETY_STATE.RECOVERING;
                this._holdStart = now;
              }
              break;
            case SAFETY_STATE.RECOVERING:
              if (v >= trigger) {
                this.state = SAFETY_STATE.ENGAGED;
                if (!this._engagedStart) this._engagedStart = now;
              } else if (v <= release && now - this._holdStart >= holdMs) {
                this.state = SAFETY_STATE.IDLE;
                this._lastEndAt = now;
                this._warned = v >= warn;
                this._engagedStart = 0;
                this._push("rope:out", { load: v });
              } else if (v > release) {
                this._holdStart = now;
              }
              break;
            default:
              this.state = SAFETY_STATE.IDLE;
          }
          if (this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.ENGAGED) {
            this.warnSec += step;
          }
          this.level = this.state === SAFETY_STATE.ENGAGED ? LEVEL.OVER : this.state === SAFETY_STATE.WARN || this.state === SAFETY_STATE.RECOVERING ? LEVEL.WARN : LEVEL.OK;
          const target = this.state === SAFETY_STATE.ENGAGED ? 1 : this.state === SAFETY_STATE.RECOVERING ? 0.45 : 0;
          const rate = target > this.tension ? 5.5 : 2.2;
          this.tension += (target - this.tension) * Math.min(1, step * rate);
          this.tension = clamp(this.tension, 0, 1);
          return this;
        }
        _engage(now, load) {
          if (!this._warned) this._push("warn", { load, dir: this.guideDir });
          this.state = SAFETY_STATE.ENGAGED;
          this.triggers += 1;
          this._engagedStart = now;
          this._warned = true;
          this._push("rope:in", { load, count: this.triggers, dir: this.guideDir });
        }
        snapshot() {
          const enabled = !!this.cfg.get("ropeEnabled");
          return {
            state: this.state,
            label: enabled ? this.getStateLabel() : "\u5DF2\u5173\u95ED",
            short: enabled ? this.getShortLabel() : "\u5173\u95ED",
            enabled,
            level: this.level,
            guideDir: this.guideDir,
            guideAxis: this.guideAxis,
            guideStrength: Math.round(this.guideStrength * 100) / 100,
            triggers: this.triggers,
            engagedSec: Math.round(this.engagedSec * 10) / 10,
            warnSec: Math.round(this.warnSec * 10) / 10,
            tension: Math.round(this.tension * 100) / 100
          };
        }
      };
      module.exports = { SafetyRope, SAFETY_STATE, LEVEL };
    }
  });

  // pkgWire/games/wire/score.js
  var require_score = __commonJS({
    "pkgWire/games/wire/score.js"(exports, module) {
      function round1(v) {
        return Math.round(v * 10) / 10;
      }
      var ScoreManager = class {
        constructor(cfg2) {
          this.cfg = cfg2;
          this.reset();
        }
        reset() {
          this.distance = 0;
          this.distanceScore = 0;
          this.stableScore = 0;
          this.comboBonus = 0;
          this.finishBonus = 0;
          this.penalty = 0;
          this.stableSec = 0;
          this.streak = 0;
          this.combo = 0;
          this.maxCombo = 0;
          this.settled = false;
          this._sinceCombo = 0;
        }
        get comboMul() {
          const step = Number(this.cfg.get("comboStep")) || 0;
          const cap = Math.max(1, Number(this.cfg.get("comboMaxMul")) || 1);
          return Math.min(cap, 1 + this.combo * step);
        }
        /** 前进距离（米） */
        addDistance(meters) {
          const m = Math.max(0, Number(meters) || 0);
          if (m <= 0) return;
          this.distance += m;
          this.distanceScore += m * (Number(this.cfg.get("scorePerMeter")) || 0);
        }
        /**
         * 每帧结算稳定分
         * @param {number} dt 秒
         * @param {boolean} stable 是否处于稳定区
         */
        update(dt, stable) {
          const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
          if (stable) {
            this.stableSec += step;
            this._sinceCombo += step;
            while (this._sinceCombo >= 1) {
              this._sinceCombo -= 1;
              this.combo += 1;
              if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            }
            const perSec = Number(this.cfg.get("stableScorePerSec")) || 0;
            const gain = perSec * this.comboMul * step;
            this.stableScore += gain;
            this.comboBonus += Math.max(0, gain - perSec * step);
          } else {
            this._sinceCombo = 0;
            this.combo = 0;
          }
        }
        /** 扣分（越界 / 绳索介入等） */
        penaltyBy(points, reason) {
          const p = Math.max(0, Number(points) || 0);
          if (p <= 0) return 0;
          this.penalty += p;
          this.lastPenalty = { points: p, reason: reason || "", at: Date.now() };
          return p;
        }
        addFinish() {
          if (this.finishBonus > 0) return 0;
          const v = Math.max(0, Number(this.cfg.get("finishBonus")) || 0);
          this.finishBonus = v;
          return v;
        }
        get total() {
          const raw = this.distanceScore + this.stableScore + this.finishBonus - this.penalty;
          return Math.max(0, Math.round(raw));
        }
        snapshot() {
          return {
            total: this.total,
            distance: round1(this.distance),
            distanceScore: Math.round(this.distanceScore),
            stableScore: Math.round(this.stableScore),
            comboBonus: Math.round(this.comboBonus),
            finishBonus: Math.round(this.finishBonus),
            penalty: Math.round(this.penalty),
            stableSec: round1(this.stableSec),
            maxCombo: this.maxCombo,
            comboMul: round1(this.comboMul)
          };
        }
      };
      module.exports = { ScoreManager };
    }
  });

  // pkgWire/games/wire/engine.js
  var require_engine = __commonJS({
    "pkgWire/games/wire/engine.js"(exports, module) {
      var { MotionTracker } = require_motion();
      var { SafetyRope } = require_safety();
      var { ScoreManager } = require_score();
      var STATE = {
        IDLE: "IDLE",
        READY: "READY",
        CALIBRATING: "CALIBRATING",
        COUNTDOWN: "COUNTDOWN",
        PLAYING: "PLAYING",
        PAUSED: "PAUSED",
        SENSOR_ERROR: "SENSOR_ERROR",
        RESULT: "RESULT",
        ABORTED: "ABORTED"
      };
      var COUNTDOWN_SEC = 3;
      var SENSOR_RESUME_MS = 600;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function round(v, d) {
        const p = Math.pow(10, d || 0);
        return Math.round(v * p) / p;
      }
      var WireEngine2 = class {
        constructor(opts) {
          const o = opts || {};
          this.cfg = o.cfg;
          this.motion = new MotionTracker(this.cfg);
          this.safety = new SafetyRope(this.cfg);
          this.score = new ScoreManager(this.cfg);
          this.state = STATE.IDLE;
          this.prevState = STATE.IDLE;
          this.events = [];
          this.time = 0;
          this.t = 0;
          this.elapsedSec = 0;
          this.balance = 1;
          this.lean = 0;
          this.walkPhase = 0;
          this.speed = 0;
          this.stable = true;
          this.offCount = 0;
          this.offSec = 0;
          this._offActive = false;
          this._overBoundarySec = 0;
          this.countdown = COUNTDOWN_SEC;
          this.lastFrameAt = Date.now();
          this.distance = 0;
          this.progress = 0;
          this.completed = false;
          this.finished = false;
          this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 };
          this._resumeAt = 0;
          this.summary = null;
          this.startedAt = 0;
          this.sessionSeed = "";
          this.simMode = false;
          this.calibrated = false;
          this.lastCalibration = null;
          this.warnCooldown = 0;
          this.penaltyCooldown = 0;
        }
        // ---------------------------------------------------------------- 状态
        setState(next) {
          if (this.state === next) return;
          this.prevState = this.state;
          this.state = next;
          this.time = 0;
          this._emit("state", { state: next, prev: this.prevState });
        }
        _emit(type, extra) {
          this.events.push(Object.assign({ type, at: Date.now() }, extra || {}));
        }
        /** 页面每帧把事件取走 */
        drainEvents() {
          const list = this.events;
          this.events = [];
          return list;
        }
        get isPlaying() {
          return this.state === STATE.PLAYING;
        }
        get canPlay() {
          return this.state === STATE.READY || this.state === STATE.IDLE || this.state === STATE.RESULT || this.state === STATE.ABORTED;
        }
        // ---------------------------------------------------------------- 流程
        /**
         * 进入「设备准备」页（READY）。
         *
         * **页面已经不再调用它了。** 连接和零点标定在首页就做完了，进游戏再走一遍
         * 等于同一件事做两次 —— 实测反馈就是「点一下开始，人还停在准备页」。
         * 现在页面的「开始训练」会先判断是否就绪（utils/device-ready.js），
         * 就绪直接倒计时。
         *
         * 保留这个方法是为了**兜底**：未就绪时如果想给患者一个「现场补做」的
         * 完整体验（连接 + 佩戴位置 + 零点重设），还可以把它接回去。
         */
        prepare() {
          this.setState(STATE.READY);
          this.motion.reset();
          this.calibrated = this.motion.hasZero();
          return this.state;
        }
        /** 开始零点标定（需要真实数据；模拟模式直接判定通过） */
        calibrate() {
          if (this.state !== STATE.READY && this.state !== STATE.CALIBRATING) return false;
          if (this.simMode) {
            this.lastCalibration = { ok: true, message: "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u8DF3\u8FC7\u771F\u5B9E\u6807\u5B9A", at: Date.now(), simulated: true };
            this.calibrated = true;
            this._emit("calibrate", this.lastCalibration);
            return true;
          }
          this.motion.beginCalibration();
          this.setState(STATE.CALIBRATING);
          return true;
        }
        cancelCalibration() {
          if (this.state !== STATE.CALIBRATING) return;
          this.motion.cancelCalibration();
          this.setState(STATE.READY);
        }
        /** 校验配置并进入倒计时；返回 { ok, errors } */
        startCountdown() {
          const v = this.cfg.validate();
          if (!v.ok) return { ok: false, errors: v.errors };
          if (!this.simMode && !this.motion.isLive()) {
            return { ok: false, errors: ["\u6CA1\u6709\u53EF\u7528\u7684\u4F20\u611F\u5668\u6570\u636E\uFF0C\u8BF7\u5148\u8FDE\u63A5\u8BBE\u5907\u6216\u5207\u6362\u5230\u6A21\u62DF\u6A21\u5F0F"] };
          }
          this.beginRound();
          this.setState(STATE.COUNTDOWN);
          this.countdown = COUNTDOWN_SEC;
          return { ok: true, warnings: v.warnings };
        }
        beginRound() {
          this.score.reset();
          this.safety.reset();
          this.motion.resetTrajectory();
          this.elapsedSec = 0;
          this.balance = 1;
          this.lean = 0;
          this.walkPhase = 0;
          this.speed = 0;
          this.stable = true;
          this.offCount = 0;
          this.offSec = 0;
          this._offActive = false;
          this._overBoundarySec = 0;
          this.distance = 0;
          this.progress = 0;
          this.completed = false;
          this.finished = false;
          this.summary = null;
          this.startedAt = Date.now();
          this.sessionSeed = "wire_" + this.startedAt + "_" + Math.random().toString(36).slice(2, 7);
          this.interruption = { count: 0, totalSec: 0, active: false, startedAt: 0 };
          this._resumeAt = 0;
        }
        pause() {
          if (this.state !== STATE.PLAYING && this.state !== STATE.SENSOR_ERROR) return false;
          this._closeInterruption();
          this.setState(STATE.PAUSED);
          return true;
        }
        resume() {
          if (this.state !== STATE.PAUSED) return false;
          this.setState(STATE.PLAYING);
          this.lastFrameAt = Date.now();
          return true;
        }
        togglePause() {
          if (this.state === STATE.PLAYING) return this.pause();
          if (this.state === STATE.PAUSED) return this.resume();
          return false;
        }
        /** 中止本局：保留已产生的成绩，但标记未完成 */
        abort() {
          if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return;
          this.finish("aborted");
        }
        restart() {
          this.beginRound();
          return this.startCountdown();
        }
        /** 回到介绍页（准备页点「返回」时用） */
        toIntro() {
          if (this.state === STATE.PLAYING || this.state === STATE.PAUSED || this.state === STATE.COUNTDOWN || this.state === STATE.SENSOR_ERROR) {
            this.finish("aborted");
          }
          this.summary = null;
          this.motion.cancelCalibration();
          this.setState(STATE.IDLE);
          return this.state;
        }
        /** 蓝牙被动断开时由页面调用：进入安全中断态 */
        enterSensorError() {
          if (this.state === STATE.PLAYING) this._enterSensorError();
        }
        /** 结算：只执行一次，防止重复加分/重复写记录 */
        finish(reason) {
          if (this.state === STATE.RESULT || this.state === STATE.ABORTED) return this.summary;
          if (this.score.settled) return this.summary;
          this.score.settled = true;
          this._closeInterruption();
          const total = this.score.total;
          const snap = this.score.snapshot();
          const traj = this.motion.getTrajectory();
          const trackLength = Number(this.cfg.get("trackLength")) || 100;
          const durationSec = Number(this.cfg.get("durationSec")) || 90;
          const reference = trackLength * (Number(this.cfg.get("scorePerMeter")) || 0) + Math.min(durationSec, trackLength / Math.max(0.1, Number(this.cfg.get("forwardSpeed")) || 0.5)) * (Number(this.cfg.get("stableScorePerSec")) || 0);
          const ratio = reference > 0 ? total / reference : 0;
          const grade = ratio >= 0.85 ? "S" : ratio >= 0.7 ? "A" : ratio >= 0.5 ? "B" : "C";
          this.summary = {
            recordId: this.sessionSeed || "wire_" + Date.now(),
            gameId: "wire",
            scene: "wire-fixed-01",
            difficulty: Number(this.cfg.get("difficulty")) || 2,
            rangeConfig: {
              left: this.cfg.get("leftLimit"),
              right: this.cfg.get("rightLimit"),
              forward: this.cfg.get("forwardLimit"),
              back: this.cfg.get("backLimit"),
              sensitivity: this.cfg.get("sensitivity"),
              deadzoneDeg: this.cfg.get("deadzoneDeg")
            },
            // 规则版本：2026-11-01 起 v2。
            // v1 = 保险绳会自动把患者拉回中线 + 速度有 35% 下限 + 40 米/90 秒。
            // v2 = 拔掉自动回正（平衡值直接当速度、掉到 0 就停住）+ 里程按真实步速。
            // **v1 与 v2 的里程、速度、分数都不可直接对比。**
            rulesVersion: "v2",
            score: total,
            breakdown: snap,
            durationSec: round(this.elapsedSec, 1),
            plannedSec: durationSec,
            distance: round(this.distance, 1),
            trackLength,
            completed: !!this.completed,
            reason: reason || (this.completed ? "goal" : "timeout"),
            aborted: reason === "aborted",
            stableSec: round(this.score.stableSec, 1),
            offCount: this.offCount,
            offSec: round(this.offSec, 1),
            ropeTriggers: this.safety.triggers,
            ropeEngagedSec: round(this.safety.engagedSec, 1),
            warnSec: round(this.safety.warnSec, 1),
            // 平均前进速度：治疗师判断「这一局到底走起来没有」的唯一直接指标
            avgSpeed: this.elapsedSec > 0.5 ? round(this.distance / this.elapsedSec, 2) : 0,
            pathLength: traj.pathLength,
            avgRate: traj.avgRate,
            sway: traj.sway,
            swayNote: traj.note,
            dataSource: this.motion.source,
            interrupted: this.interruption.count > 0,
            interruptedSec: round(this.interruption.totalSec, 1),
            interruptedCount: this.interruption.count,
            sensorInterrupted: this.interruption.count > 0,
            grade,
            startedAt: this.startedAt || Date.now(),
            endedAt: Date.now(),
            calibration: this.lastCalibration || null
          };
          this.setState(reason === "aborted" ? STATE.ABORTED : STATE.RESULT);
          this._emit("finish", { summary: this.summary, reason: reason || "end" });
          return this.summary;
        }
        // ---------------------------------------------------------------- 传感器
        feedSensor(frame) {
          this.motion.feed(frame);
          if (this.state === STATE.SENSOR_ERROR) {
            if (!this._resumeAt) this._resumeAt = Date.now();
            if (Date.now() - this._resumeAt > SENSOR_RESUME_MS) this._autoResume();
          }
        }
        _autoResume() {
          this._resumeAt = 0;
          if (this.state !== STATE.SENSOR_ERROR) return;
          this._closeInterruption();
          this.setState(STATE.PLAYING);
          this.lastFrameAt = Date.now();
          this._emit("sensor:resume");
        }
        _closeInterruption() {
          const it = this.interruption;
          if (it.active && it.startedAt) {
            it.totalSec += (Date.now() - it.startedAt) / 1e3;
            it.active = false;
            it.startedAt = 0;
          }
        }
        _enterSensorError() {
          const it = this.interruption;
          if (it.active) return;
          it.active = true;
          it.startedAt = Date.now();
          it.count += 1;
          this.setState(STATE.SENSOR_ERROR);
          this._resumeAt = 0;
          this._emit("sensor:lost");
        }
        setSimMode(on) {
          this.simMode = !!on;
          this.motion.setSimMode(this.simMode);
          if (this.simMode) {
            this.calibrated = true;
            if (!this.lastCalibration) {
              this.lastCalibration = { ok: true, message: "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u8DF3\u8FC7\u771F\u5B9E\u6807\u5B9A", at: Date.now(), simulated: true };
            }
          } else {
            this.motion.cancelCalibration();
            if (this.state === STATE.CALIBRATING) this.setState(STATE.READY);
            if (this.state === STATE.SENSOR_ERROR) this.setState(STATE.PAUSED);
          }
          this._emit("source", { source: this.motion.source });
        }
        setSimTarget(x, y) {
          this.motion.setSimTarget(x, y);
        }
        nudgeSim(dx, dy) {
          this.motion.nudgeSim(dx, dy);
        }
        centerSim() {
          this.motion.centerSim();
        }
        /** 模拟一次保险绳触发（测试用） */
        triggerRopeSim() {
          if (!this.simMode) return false;
          this.motion.setSimTarget(1, 0);
          return true;
        }
        // ---------------------------------------------------------------- 每帧
        update(dt) {
          const step = clamp(Number(dt) || 0, 0, 0.1);
          this.t += step;
          this.time += step;
          this.motion.update(step);
          if (this.state === STATE.CALIBRATING) {
            if (!this.motion.cal.active && this.motion.cal.result) {
              this.lastCalibration = {
                ok: this.motion.cal.result === "ok",
                result: this.motion.cal.result,
                message: this.motion.cal.message,
                at: Date.now()
              };
              this.calibrated = !!this.lastCalibration.ok || this.motion.hasZero();
              this._emit("calibrate", this.lastCalibration);
              this.setState(STATE.READY);
            }
            return;
          }
          if (this.state === STATE.COUNTDOWN) {
            this.countdown -= step;
            if (this.countdown <= 0) {
              this.countdown = 0;
              this.setState(STATE.PLAYING);
              this.lastFrameAt = Date.now();
              this._emit("go");
            }
            return;
          }
          if (this.state === STATE.PLAYING && !this.simMode && this.motion.stale) {
            this._enterSensorError();
            return;
          }
          if (this.state !== STATE.PLAYING) {
            const back = 1 - Math.pow(1 - 0.05, step * 60);
            this.lean += (0 - this.lean) * back;
            return;
          }
          this._tickPlaying(step);
        }
        _tickPlaying(step) {
          const cfg2 = this.cfg;
          const nx = this.motion.nx;
          const ny = this.motion.ny;
          const load = this.motion.load;
          this.safety.update({ dt: step, load, nx, ny });
          const ropeEvents = this.safety.events;
          for (let i = 0; i < ropeEvents.length; i++) {
            const ev = ropeEvents[i];
            if (ev.type === "warn") {
              this.offCount += 1;
              this._offActive = true;
              this._emit("warn", { dir: this.motion.dir, load, guide: ev.dir || 0 });
            } else if (ev.type === "warnEnd") {
              this._offActive = false;
              this._emit("warnEnd");
            } else if (ev.type === "rope:in") {
              const penalty = Number(cfg2.get("penaltyScore")) || 0;
              if (penalty > 0) this.score.penaltyBy(penalty, "\u8D8A\u754C");
              this._emit("rope:in", { count: this.safety.triggers, dir: this.motion.dir, guide: ev.dir || 0 });
            } else if (ev.type === "rope:out") {
              this._emit("rope:out");
            }
          }
          if (this._offActive) this.offSec += step;
          const effNx = nx;
          const effNy = ny;
          const effLoad = Math.max(Math.abs(effNx), Math.abs(effNy) * 0.75);
          const warn = Number(cfg2.get("warnThreshold")) || 0.66;
          const recovery = Number(cfg2.get("recoveryRate")) || 0.5;
          const instability = Number(cfg2.get("instability")) || 0.95;
          const excess = Math.max(0, effLoad - 0.18);
          if (excess <= 1e-3) {
            this.balance += (recovery * (1 - this.balance) + 0.05) * step;
          } else {
            const push = Math.pow(excess, 1.35) * instability;
            const hold = 1 + Math.min(1, this.offSec / 6) * 0.35;
            this.balance -= push * hold * step;
          }
          this.balance = clamp(this.balance, 0, 1);
          this.stable = effLoad < warn * 0.82 && this.balance > 0.55;
          const baseSpeed = Number(cfg2.get("forwardSpeed")) || 1.2;
          let speedFactor = this.balance;
          if (this.safety.engaged) speedFactor *= 0.12;
          const forward = clamp(1 + effNy * 0.22, 0.62, 1.32);
          this.speed = baseSpeed * speedFactor * forward;
          const ropeEnabled = !!cfg2.get("ropeEnabled");
          if (!ropeEnabled && effLoad >= Math.min(1, Number(cfg2.get("ropeTrigger")) || 0.88)) {
            this._overBoundarySec += step;
            const grace = Number(cfg2.get("failGraceSec")) || 0.8;
            if (this._overBoundarySec >= grace) {
              const rule = cfg2.get("failRule");
              if (rule === "terminate") {
                this._emit("fail", { reason: "boundary" });
                this.finish("boundary");
                return;
              }
              this.penaltyCooldown -= step;
              if (this.penaltyCooldown <= 0) {
                this.score.penaltyBy(Number(cfg2.get("penaltyScore")) || 0, "\u8D8A\u754C");
                this.penaltyCooldown = 2;
                this._emit("penalty", { reason: "\u8D8A\u754C" });
              }
              this.speed = 0;
            }
          } else {
            this._overBoundarySec = 0;
          }
          const dm = this.speed * step;
          this.distance += dm;
          this.score.addDistance(dm);
          this.score.update(step, this.stable);
          this.motion.tickTrajectory(step);
          this.elapsedSec += step;
          this.walkPhase += step * (2.1 + this.speed * 3.4);
          const targetLean = clamp(effNx, -1, 1) * 0.34 + Math.sin(this.t * 2.2) * (1 - this.balance) * (1 - this.balance) * 0.06;
          const alpha = 1 - Math.pow(1 - 0.34, step * 60);
          this.lean += (targetLean - this.lean) * alpha;
          const trackLength = Number(cfg2.get("trackLength")) || 100;
          const durationSec = Number(cfg2.get("durationSec")) || 90;
          this.progress = clamp(this.distance / trackLength, 0, 1);
          if (this.distance >= trackLength) {
            this.completed = true;
            this.score.addFinish();
            this._emit("goal");
            this.finish("goal");
            return;
          }
          if (this.elapsedSec >= durationSec) {
            this.finish("timeout");
            return;
          }
          this.warnCooldown -= step;
          if (this.balance < 0.2 && this.warnCooldown <= 0) {
            this.warnCooldown = 6;
            this._emit("critical");
          }
        }
        // ---------------------------------------------------------------- 视图数据
        getViewModel() {
          const cfg2 = this.cfg;
          const durationSec = Number(cfg2.get("durationSec")) || 90;
          const trackLength = Number(cfg2.get("trackLength")) || 100;
          const timeLeft = Math.max(0, durationSec - this.elapsedSec);
          return {
            state: this.state,
            timeLeft,
            timeLeftText: this._fmtTime(timeLeft),
            elapsed: this.elapsedSec,
            speed: this.speed,
            distance: this.distance,
            trackLength,
            progress: this.progress,
            score: this.score.total,
            balance: this.balance,
            lean: this.lean,
            nx: this.motion.nx,
            ny: this.motion.ny,
            load: this.motion.load,
            dir: this.motion.dir,
            stable: this.stable,
            combo: this.score.combo,
            maxCombo: this.score.maxCombo,
            stableSec: this.score.stableSec,
            offCount: this.offCount,
            rope: this.safety.snapshot(),
            ropeTension: this.safety.tension,
            rateHz: this.motion.rateHz,
            stale: this.motion.stale,
            quality: this.motion.quality,
            source: this.motion.source,
            sim: this.simMode,
            countdown: this.countdown,
            difficulty: Number(cfg2.get("difficulty")) || 2,
            warnThreshold: Number(cfg2.get("warnThreshold")) || 0.66,
            ropeTrigger: Number(cfg2.get("ropeTrigger")) || 0.88,
            calibrated: this.calibrated,
            calibration: this.lastCalibration,
            zero: this.motion.zeroInfo(),
            calibrationProgress: this.state === STATE.CALIBRATING ? clamp(this.motion.cal.elapsed / this.motion.cal.total, 0, 1) : 0,
            interrupted: this.interruption,
            canResume: this.state === STATE.SENSOR_ERROR && !this.motion.stale
          };
        }
        _fmtTime(sec) {
          const s = Math.max(0, Math.ceil(sec));
          const m = Math.floor(s / 60);
          const r = s % 60;
          return (m < 10 ? "0" + m : m) + ":" + (r < 10 ? "0" + r : r);
        }
      };
      module.exports = { WireEngine: WireEngine2, STATE };
    }
  });

  // pkgWire/games/wire/character-sprite.js
  var require_character_sprite = __commonJS({
    "pkgWire/games/wire/character-sprite.js"(exports, module) {
      var CHARACTERS = {
        fox: {
          id: "fox",
          name: "\u5C0F\u72D0\u72F8",
          sub: "\u56F4\u7740\u683C\u7EB9\u56F4\u5DFE",
          file: "/assets/wire/fox-walk-190.png",
          rel: "assets/wire/fox-walk-190.png",
          frames: 5,
          frameW: 132,
          h: 190,
          // 内容质心相对帧中心的偏移（逻辑像素）。
          // 狐狸那版是「先切图再量」，质心偏右 11px，靠这个值补回来；
          // 兔子和小熊猫是用 tools/process-wire-sprite.js 直接**按质心对齐**拼的，
          // 所以是 0。改动图集时必须重新量，判定中心=绘制中心是红线。
          cxFix: 11,
          fallback: "#C48B6E"
        },
        rabbit: {
          id: "rabbit",
          name: "\u5C0F\u5154\u5B50",
          sub: "\u957F\u957F\u7684\u8033\u6735",
          file: "/assets/wire/char-rabbit.png",
          rel: "assets/wire/char-rabbit.png",
          frames: 5,
          frameW: 88,
          h: 190,
          cxFix: 0,
          fallback: "#D9D3C6"
        },
        panda: {
          id: "panda",
          name: "\u5C0F\u718A\u732B",
          sub: "\u7C97\u7C97\u7684\u73AF\u7EB9\u5C3E\u5DF4",
          file: "/assets/wire/char-panda.png",
          rel: "assets/wire/char-panda.png",
          frames: 5,
          frameW: 110,
          h: 190,
          cxFix: 0,
          fallback: "#B5654A"
        }
      };
      var CHARACTER_IDS = ["fox", "rabbit", "panda"];
      var DISPLAY_H = 140;
      var IS_WEB = typeof window !== "undefined" && typeof document !== "undefined";
      var IS_NODE = typeof process !== "undefined" && !!(process.versions && process.versions.node);
      var IS_WX = typeof wx !== "undefined" && !!wx;
      var SHOW_DIAG = !IS_WEB && !IS_NODE && IS_WX;
      var ST = {
        id: "fox",
        img: null,
        ready: false,
        canvas: null,
        tried: false,
        triedAt: 0,
        stage: 0,
        note: "idle",
        // 正在加载的那个 Image 必须被**模块级变量持有**。
        // 只是 `const img = makeImage()` 放在函数里的话，加载没完成、函数已经返回，
        // 这个 Image 就是可回收的 —— onload/onerror 永远不会触发（浏览器里实测过）。
        // 表现就是「角色时有时无」：某几次加载被回收了，就只剩兜底圆点。
        pending: null
      };
      function conf() {
        return CHARACTERS[ST.id] || CHARACTERS.fox;
      }
      function reset() {
        ST.img = null;
        ST.pending = null;
        ST.ready = false;
        ST.tried = false;
        ST.triedAt = 0;
        ST.stage = 0;
        ST.note = "idle";
      }
      function setCharacter(id) {
        const next = CHARACTERS[id] ? id : "fox";
        if (next === ST.id) return ST.id;
        ST.id = next;
        reset();
        return ST.id;
      }
      function currentId() {
        return ST.id;
      }
      function pickCanvas(o, ctx) {
        if (ST.canvas) return ST.canvas;
        const a = o && o.canvas || ctx && ctx.canvas || null;
        if (a) ST.canvas = a;
        return ST.canvas;
      }
      function makeImage(cv) {
        if (cv && typeof cv.createImage === "function") {
          try {
            return cv.createImage();
          } catch (e) {
          }
        }
        if (IS_WEB && IS_WX && typeof wx.createImage === "function") {
          try {
            return wx.createImage();
          } catch (e) {
          }
        }
        if (IS_WEB && typeof Image !== "undefined") {
          try {
            return new Image();
          } catch (e) {
          }
        }
        return null;
      }
      function ensure(o, ctx) {
        if (ST.ready) return;
        const c = conf();
        const cv = pickCanvas(o, ctx);
        const img = makeImage(cv);
        if (!img) {
          ST.note = cv ? "noCIM" : "nocv";
          return;
        }
        const now = Date.now();
        if (ST.tried) {
          if (now - ST.triedAt < 2600) return;
          if (ST.stage < 1) ST.stage = 1;
        }
        ST.tried = true;
        ST.triedAt = now;
        ST.pending = img;
        img.onload = function() {
          ST.img = img;
          ST.ready = true;
          ST.note = "ok" + ST.stage;
          ST.pending = null;
        };
        img.onerror = function() {
          ST.note = "err" + ST.stage;
          ST.tried = true;
          ST.triedAt = Date.now();
          if (ST.stage < 1) ST.stage = 1;
          ST.pending = null;
        };
        if (ST.stage === 0 && IS_WX && typeof wx.getImageInfo === "function") {
          ST.note = "info";
          wx.getImageInfo({
            src: c.rel,
            success: function(r) {
              if (ST.ready) return;
              if (r && r.path) {
                ST.note = "tmp";
                img.src = r.path;
              } else {
                ST.stage = 1;
                ST.tried = false;
                ST.note = "noPath";
              }
            },
            fail: function() {
              ST.stage = 1;
              ST.tried = false;
              ST.note = "infoFail";
            }
          });
          return;
        }
        ST.note = "file";
        img.src = c.file;
      }
      function gait(phase, speed, balance) {
        const flail = Math.pow(Math.max(0, 1 - (typeof balance === "number" ? balance : 1)), 2);
        const swayX = -Math.sin(phase) * (1.2 + (speed || 0) * 2.2);
        const bob = -Math.abs(Math.cos(phase)) * (1.2 + (speed || 0) * 2);
        const roll = Math.sin(phase) * 0.011 * (0.35 + (speed || 0));
        return { flail, swayX, bob, roll };
      }
      function beltWorld(o) {
        const s = o.scale || 1;
        const ly = -DISPLAY_H * 0.65;
        const lean = o.lean || 0;
        return {
          x: o.x - ly * Math.sin(lean) * s,
          y: o.y + ly * Math.cos(lean) * s
        };
      }
      function headWorld(o) {
        const s = o.scale || 1;
        const ly = -DISPLAY_H + 8;
        const lean = o.lean || 0;
        return {
          x: o.x - ly * Math.sin(lean) * s,
          y: o.y + ly * Math.cos(lean) * s
        };
      }
      function drawWalker(ctx, o) {
        const s = o.scale || 1;
        const c = conf();
        if (!ST.ready) {
          try {
            ensure(o, ctx);
          } catch (e) {
            ST.note = "throw";
          }
          ctx.save();
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = c.fallback;
          ctx.beginPath();
          ctx.arc(o.x, o.y - DISPLAY_H * s / 2, 14 * s, 0, Math.PI * 2);
          ctx.fill();
          if (SHOW_DIAG) {
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = "#6B4A38";
            ctx.font = "9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(ST.id + ":" + ST.note, o.x, o.y + 13 * s);
          }
          ctx.restore();
          return;
        }
        const lean = o.lean || 0;
        const phase = o.walkPhase || 0;
        const g = gait(phase, o.speedRatio, o.balance);
        const TAU = Math.PI * 2;
        const cyc = (phase % TAU + TAU) % TAU;
        const fi = Math.floor(cyc / TAU * c.frames) % c.frames;
        ctx.save();
        ctx.translate(o.x, o.y + g.bob * s);
        ctx.rotate(lean + g.roll);
        const scaleH = DISPLAY_H / c.h;
        const fw = c.frameW * scaleH * s;
        const fh = DISPLAY_H * s;
        ctx.drawImage(
          ST.img,
          fi * c.frameW,
          0,
          c.frameW,
          c.h,
          -fw / 2 - c.cxFix * scaleH * s,
          -fh,
          fw,
          fh
        );
        ctx.restore();
      }
      module.exports = {
        drawWalker,
        beltWorld,
        headWorld,
        gait,
        setCharacter,
        currentId,
        CHARACTERS,
        CHARACTER_IDS,
        DISPLAY_H,
        // 测试与调试用：只读探针
        _debug: function() {
          return {
            id: ST.id,
            ready: ST.ready,
            stage: ST.stage,
            note: ST.note,
            hasCanvas: !!ST.canvas
          };
        }
      };
    }
  });

  // utils/scene/depth.js
  var require_depth = __commonJS({
    "utils/scene/depth.js"(exports, module) {
      var TAU = Math.PI * 2;
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      function finite() {
        for (let i = 0; i < arguments.length; i++) {
          const v = arguments[i];
          if (typeof v !== "number" || !isFinite(v)) return false;
        }
        return true;
      }
      function depthT(y, hz, h) {
        if (!finite(y, hz, h) || h - hz <= 0) return 0;
        return clamp((y - hz) / (h - hz), 0, 1);
      }
      function fillEllipse(ctx, x, y, rx, ry, style) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        ctx.fillStyle = style;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      function ringEllipse(ctx, x, y, rx, ry, style, lw) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.strokeStyle = style;
        ctx.lineWidth = lw || 1;
        ctx.stroke();
        ctx.restore();
      }
      function softShadow(ctx, x, y, rx, ry, alpha, color) {
        if (!finite(x, y, rx, ry) || rx <= 0 || ry <= 0) return;
        const a = clamp(alpha, 0, 1);
        if (a <= 4e-3) return;
        const c = color || "0,0,0";
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.5, "rgba(" + c + "," + (a * 0.55).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      function haze(ctx, o) {
        if (!o || !finite(o.cx, o.y, o.rx)) return;
        const ry = o.ry || 0.07;
        const a = o.alpha === void 0 ? 0.22 : o.alpha;
        if (o.rx <= 0 || a <= 4e-3) return;
        const c = o.color || "255,246,220";
        ctx.save();
        ctx.translate(o.cx, o.y);
        ctx.scale(1, ry);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, o.rx);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.55, "rgba(" + c + "," + (a * 0.4).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, o.rx, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (o.lineAlpha && o.lineAlpha > 4e-3) {
          const w = o.w || o.rx * 2;
          const x0 = o.cx - w / 2;
          const lg = ctx.createLinearGradient(x0, 0, x0 + w, 0);
          lg.addColorStop(0, "rgba(" + c + ",0)");
          lg.addColorStop(0.34, "rgba(" + c + "," + (o.lineAlpha * 0.55).toFixed(3) + ")");
          lg.addColorStop(0.5, "rgba(" + c + "," + o.lineAlpha.toFixed(3) + ")");
          lg.addColorStop(0.66, "rgba(" + c + "," + (o.lineAlpha * 0.55).toFixed(3) + ")");
          lg.addColorStop(1, "rgba(" + c + ",0)");
          ctx.fillStyle = lg;
          ctx.fillRect(x0, o.y - 0.5, w, 1);
        }
      }
      function ridge(ctx, o) {
        if (!o || !finite(o.w, o.hz)) return;
        const w = o.w;
        const hz = o.hz;
        const bands = o.bands || [];
        for (let L = 0; L < bands.length; L++) {
          const p = bands[L];
          const amp = p.amp === void 0 ? 0.1 : p.amp;
          const rise = p.rise === void 0 ? 0.05 : p.rise;
          const freq = p.freq || 6.1;
          const seed = p.seed || 1.3;
          const a = p.alpha === void 0 ? 0.6 : p.alpha;
          ctx.beginPath();
          ctx.moveTo(-4, hz + 2);
          const step = o.step || 6;
          for (let x = -4; x <= w + 4; x += step) {
            const u = x / w;
            const wave = Math.sin(u * freq + seed) * 0.5 + Math.sin(u * freq * 2.24 + seed * 2) * 0.3 + Math.sin(u * freq * 4.8 + seed * 3) * 0.14;
            const y = hz - (wave + 0.9) * w * amp * 0.5 + w * rise * 0.5;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w + 4, hz + 2);
          ctx.closePath();
          ctx.fillStyle = "rgba(" + (p.color || "40,70,90") + "," + a + ")";
          ctx.fill();
        }
      }
      function perspectiveFloor(ctx, o) {
        if (!o || !finite(o.w, o.h, o.hz, o.cx)) return;
        const w = o.w;
        const h = o.h;
        const hz = o.hz;
        const cx = o.cx;
        const floorH = h - hz;
        if (floorH <= 0) return;
        const rows = o.rows || 10;
        const phase = o.phase || 0;
        const col = o.color || "255,255,255";
        const nearA = o.nearAlpha === void 0 ? 0.14 : o.nearAlpha;
        const farA = o.farAlpha === void 0 ? 0.05 : o.farAlpha;
        const lw = o.lineWidth || 1;
        const ys = [];
        for (let i = 1; i <= rows + 1; i++) {
          const u = i - phase % 1;
          if (u < 0.06) {
            ys.push(null);
            continue;
          }
          const y = hz + floorH / u;
          ys.push(y > h + 4 ? null : y);
        }
        if (o.stripe) {
          const sc = o.stripe.color || "255,255,255";
          const sa = o.stripe.alpha === void 0 ? 0.05 : o.stripe.alpha;
          for (let i = 0; i < ys.length - 1; i++) {
            const y0 = ys[i + 1];
            const y1 = ys[i];
            if (y0 === null || y1 === null || y1 - y0 < 1) continue;
            const t = depthT((y0 + y1) * 0.5, hz, h);
            ctx.fillStyle = "rgba(" + sc + "," + (sa * (0.35 + t * 0.9)).toFixed(3) + ")";
            ctx.fillRect(0, Math.max(hz, y0), w, Math.min(h, y1) - Math.max(hz, y0));
          }
        }
        if (o.cols) {
          const spread = o.spread === void 0 ? 0.17 : o.spread;
          const topSpread = o.topSpread === void 0 ? 0.012 : o.topSpread;
          ctx.beginPath();
          for (let i = -o.cols; i <= o.cols; i++) {
            const bx = cx + i * (w * spread);
            const tx = cx + i * (w * topSpread);
            if (bx < -w || bx > w * 2) continue;
            ctx.moveTo(tx, hz);
            ctx.lineTo(bx, h);
          }
          ctx.strokeStyle = "rgba(" + col + "," + (farA * 1.1).toFixed(3) + ")";
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        const bands = [
          { lo: 5.5, hi: 999, k: 0 },
          { lo: 2.6, hi: 5.5, k: 0.55 },
          { lo: 0, hi: 2.6, k: 1 }
        ];
        for (let b = 0; b < bands.length; b++) {
          const band = bands[b];
          ctx.beginPath();
          let drew = false;
          for (let i = 0; i < ys.length; i++) {
            const y = ys[i];
            if (y === null) continue;
            const u = i + 1 - phase % 1;
            if (u < band.lo || u >= band.hi) continue;
            if (y < hz + 1) continue;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            drew = true;
          }
          if (!drew) continue;
          const a = lerp(farA, nearA, band.k);
          ctx.strokeStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
          ctx.lineWidth = lw * (1 + band.k * 0.9);
          ctx.stroke();
        }
        if (o.fadeSide) {
          const sc = o.fadeColor || "0,0,0";
          const k = o.fadeSide;
          const side = ctx.createLinearGradient(0, 0, w, 0);
          side.addColorStop(0, "rgba(" + sc + "," + (0.9 * k).toFixed(3) + ")");
          side.addColorStop(0.2, "rgba(" + sc + "," + (0.55 * k).toFixed(3) + ")");
          side.addColorStop(0.42, "rgba(" + sc + "," + (0.08 * k).toFixed(3) + ")");
          side.addColorStop(0.5, "rgba(" + sc + ",0)");
          side.addColorStop(0.58, "rgba(" + sc + "," + (0.08 * k).toFixed(3) + ")");
          side.addColorStop(0.8, "rgba(" + sc + "," + (0.55 * k).toFixed(3) + ")");
          side.addColorStop(1, "rgba(" + sc + "," + (0.9 * k).toFixed(3) + ")");
          ctx.fillStyle = side;
          ctx.fillRect(0, hz, w, floorH);
        }
        if (o.fadeBottom) {
          const sc = o.fadeColor || "0,0,0";
          const bh = floorH * 0.34;
          const bottom = ctx.createLinearGradient(0, h - bh, 0, h);
          bottom.addColorStop(0, "rgba(" + sc + ",0)");
          bottom.addColorStop(1, "rgba(" + sc + "," + o.fadeBottom.toFixed(3) + ")");
          ctx.fillStyle = bottom;
          ctx.fillRect(0, h - bh, w, bh);
        }
      }
      function cloudSea(ctx, o) {
        if (!o || !finite(o.w, o.y)) return;
        const w = o.w;
        const y = o.y;
        const c = o.color || "255,255,255";
        const a = o.alpha === void 0 ? 0.6 : o.alpha;
        const n = o.count || 7;
        const h = o.h || 22;
        const seed = o.seed || 3.1;
        const jitter = o.jitter || 0;
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n;
          const jx = Math.sin(i * 2.7 + seed) * w * 0.035;
          const jy = jitter ? Math.sin(i * 5.3 + seed * 1.7) * jitter : 0;
          const x = w * u + jx + (o.drift || 0);
          const r = w * (0.09 + i * 37 % 11 / 11 * 0.09) * (o.scale || 1);
          const ry = h * (0.5 + i * 53 % 7 / 7 * 0.5);
          const yy = y + jy;
          fillEllipse(ctx, x, yy, r, ry, "rgba(" + c + "," + (a * 0.85).toFixed(3) + ")");
          fillEllipse(
            ctx,
            x - r * 0.3,
            yy - ry * 0.55,
            r * 0.55,
            ry * 0.78,
            "rgba(" + c + "," + (a * 0.72).toFixed(3) + ")"
          );
          fillEllipse(
            ctx,
            x + r * 0.28,
            yy - ry * 0.4,
            r * 0.46,
            ry * 0.62,
            "rgba(" + c + "," + (a * 0.58).toFixed(3) + ")"
          );
        }
      }
      function cloudBank(ctx, o) {
        if (!o || !finite(o.w, o.y, o.h)) return;
        const w = o.w;
        const y = o.y;
        const h = o.h;
        if (h <= 0) return;
        const c = o.color || "255,255,255";
        const a = o.alpha === void 0 ? 0.5 : o.alpha;
        if (a <= 4e-3) return;
        const wave = o.wave === void 0 ? 10 : o.wave;
        const freq = o.freq || 5.4;
        const seed = o.seed || 1.9;
        const step = o.step || 7;
        ctx.beginPath();
        ctx.moveTo(-4, y + h);
        for (let x = -4; x <= w + 4; x += step) {
          const u = x / w;
          const yy = y + Math.sin(u * freq + seed) * wave + Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 + Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18;
          if (x <= -4) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.lineTo(w + 4, y + h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, y - wave, 0, y + h);
        g.addColorStop(0, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(0.55, "rgba(" + c + "," + (a * 0.66).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.fillStyle = g;
        ctx.fill();
        if (o.rimAlpha && o.rimAlpha > 4e-3) {
          ctx.beginPath();
          for (let x = -4; x <= w + 4; x += step) {
            const u = x / w;
            const yy = y + Math.sin(u * freq + seed) * wave + Math.sin(u * freq * 2.3 + seed * 2.1) * wave * 0.45 + Math.sin(u * freq * 4.7 + seed * 3.3) * wave * 0.18;
            if (x <= -4) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
          }
          ctx.strokeStyle = "rgba(" + c + "," + o.rimAlpha.toFixed(3) + ")";
          ctx.lineWidth = o.rimWidth || 1.4;
          ctx.stroke();
        }
      }
      function rimLight(ctx, o) {
        if (!o || !finite(o.x, o.y, o.rx, o.ry)) return;
        const a = o.alpha === void 0 ? 0.34 : o.alpha;
        if (a <= 4e-3 || o.rx <= 0 || o.ry <= 0) return;
        const c = o.color || "255,255,255";
        const from = o.from === void 0 ? -2.3 : o.from;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(1, o.ry / o.rx);
        ctx.beginPath();
        ctx.arc(0, 0, o.rx, from - 1.15, from + 1.15);
        const g = ctx.createLinearGradient(
          Math.cos(from - 1.15) * o.rx,
          Math.sin(from - 1.15) * o.rx,
          Math.cos(from + 1.15) * o.rx,
          Math.sin(from + 1.15) * o.rx
        );
        g.addColorStop(0, "rgba(" + c + ",0)");
        g.addColorStop(0.5, "rgba(" + c + "," + a.toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + ",0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = o.lw || 1.6;
        ctx.stroke();
        ctx.restore();
      }
      function buildDust(w, h, top, bottom, n, seedBase) {
        const list = [];
        const s = seedBase || 0;
        for (let i = 0; i < n; i++) {
          const r1 = (Math.sin((i + 1) * 12.9898 + s) * 43758.5453 % 1 + 1) % 1;
          const r2 = (Math.sin((i + 1) * 78.233 + s) * 12345.6789 % 1 + 1) % 1;
          const r3 = (Math.sin((i + 1) * 39.425 + s) * 9876.5432 % 1 + 1) % 1;
          list.push({
            x: w * r1,
            y: top + (bottom - top) * r2,
            r: 0.7 + r3 * 1.9,
            a: 0.08 + r2 * 0.2,
            sp: 3 + r1 * 8,
            p: r3 * TAU
          });
        }
        return list;
      }
      function drawDust(ctx, list, t, o) {
        if (!list || !list.length) return;
        const opt = o || {};
        const top = opt.top === void 0 ? 0 : opt.top;
        const bottom = opt.bottom === void 0 ? 0 : opt.bottom;
        const span = bottom - top;
        const c = opt.color || "255,255,255";
        const amp = opt.alpha === void 0 ? 1 : opt.alpha;
        ctx.save();
        for (let i = 0; i < list.length; i++) {
          const d = list[i];
          let y = d.y - t * d.sp % (span > 0 ? span : 1);
          if (span > 0 && y < top) y = bottom - (top - y);
          const a = d.a * amp * (0.5 + 0.5 * Math.sin(t * 1.6 + d.p));
          if (a <= 0.01) continue;
          ctx.fillStyle = "rgba(" + c + "," + a.toFixed(3) + ")";
          ctx.beginPath();
          ctx.arc(d.x + Math.sin(t * 0.5 + d.p) * 4, y, d.r, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
      function vignette(ctx, o) {
        if (!o || !finite(o.w, o.h)) return;
        const w = o.w;
        const h = o.h;
        const a = o.alpha === void 0 ? 0.5 : o.alpha;
        if (a <= 4e-3) return;
        const c = o.color || "0,0,0";
        const cy = o.cy === void 0 ? 0.5 : o.cy;
        const inner = o.inner === void 0 ? 0.34 : o.inner;
        const outer = o.outer === void 0 ? 0.78 : o.outer;
        const g = ctx.createRadialGradient(
          w * 0.5,
          h * cy,
          Math.min(w, h) * inner,
          w * 0.5,
          h * (cy + 0.04),
          Math.max(w, h) * outer
        );
        g.addColorStop(0, "rgba(" + c + ",0)");
        g.addColorStop(0.7, "rgba(" + c + "," + (a * 0.31).toFixed(3) + ")");
        g.addColorStop(1, "rgba(" + c + "," + a.toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      module.exports = {
        TAU,
        clamp,
        lerp,
        finite,
        depthT,
        fillEllipse,
        ringEllipse,
        softShadow,
        haze,
        ridge,
        perspectiveFloor,
        cloudSea,
        cloudBank,
        rimLight,
        buildDust,
        drawDust,
        vignette
      };
    }
  });

  // pkgWire/games/wire/fx.js
  var require_fx = __commonJS({
    "pkgWire/games/wire/fx.js"(exports, module) {
      var TAU = Math.PI * 2;
      function h(i, s) {
        const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
        return x - Math.floor(x);
      }
      function clamp01(v) {
        return v < 0 ? 0 : v > 1 ? 1 : v;
      }
      function wrap(v, m) {
        const r = v % m;
        return r < 0 ? r + m : r;
      }
      function drawMotes(ctx, W, H, t, topY, botY) {
        if (!ctx || !W || !H) return;
        const band = Math.max(40, botY - topY);
        const N = 13;
        for (let i = 0; i < N; i++) {
          const d = h(i, 1);
          const rise = 2 + d * 5;
          const y0 = topY + h(i, 2) * band;
          let fy = wrap(y0 - t * rise, band);
          const edge = Math.min(fy, band - fy);
          const edgeFade = clamp01(edge / 34);
          fy = topY + fy;
          const x = h(i, 3) * (W + 60) - 30 + Math.sin(t * 0.35 + i * 2.1) * (3 + d * 7);
          const br = 0.55 + 0.45 * Math.sin(t * (0.5 + h(i, 4) * 0.7) * TAU * 0.35 + i * 2.4);
          const warm = h(i, 5) <= 0.78;
          const r = (1.6 + 3.4 * d) * (0.9 + 0.1 * br);
          const a = (0.16 + 0.38 * d) * br * edgeFade;
          const col = warm ? "255,199,116" : "196,221,240";
          const g = ctx.createRadialGradient(x, fy, 0.5, x, fy, r * 2.6);
          g.addColorStop(0, "rgba(" + col + "," + (a * 0.9).toFixed(3) + ")");
          g.addColorStop(0.45, "rgba(" + col + "," + (a * 0.35).toFixed(3) + ")");
          g.addColorStop(1, "rgba(" + col + ",0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, fy, r * 2.6, 0, TAU);
          ctx.fill();
          if (d > 0.55) {
            ctx.beginPath();
            ctx.arc(x, fy, r * 0.38, 0, TAU);
            ctx.fillStyle = "rgba(" + col + "," + (a * 1.1).toFixed(3) + ")";
            ctx.fill();
          }
        }
      }
      function drawWind(ctx, W, H, t, k, dir) {
        if (!ctx || !W || !H) return;
        const intensity = clamp01(k == null ? 0 : k);
        if (intensity < 0.03) return;
        const d = (dir || 1) >= 0 ? 1 : -1;
        ctx.save();
        if (d < 0) {
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
        }
        for (let s = 0; s < 3; s++) {
          const sp = 0.75 + h(s, 7) * 0.55;
          const q = t * sp + h(s, 8) * 1.3;
          const cyc = wrap(q, 1.3) - 0.15;
          if (cyc < -0.05 || cyc > 1.05) continue;
          const travel = clamp01(cyc) * Math.sin(Math.PI * clamp01(cyc));
          const a0 = intensity * 0.62 * travel;
          if (a0 < 0.01) continue;
          const y0 = H * (0.3 + h(s, 9) * 0.34) + Math.sin(t * 1.6 + s * 2.3) * 9;
          const x0 = cyc * (W * 1.5) - W * 0.25;
          const TL = W * (0.3 + h(s, 10) * 0.24);
          const wv1 = Math.sin(t * 2.2 + s * 1.7) * 10 - 6;
          const wv2 = Math.sin(t * 2.2 + s * 1.7 + 1.1) * 12 + 7;
          const seg = (x12, y1, cxp, cyp, x22, y2, lw, al) => {
            ctx.beginPath();
            ctx.moveTo(x12, y1);
            ctx.quadraticCurveTo(cxp, cyp, x22, y2);
            ctx.lineWidth = lw;
            ctx.lineCap = "round";
            ctx.strokeStyle = "rgba(168,201,226," + al.toFixed(3) + ")";
            ctx.stroke();
          };
          const x1 = x0 - TL * 0.38;
          const x2 = x0 - TL * 0.72;
          const x3 = x0 - TL;
          seg(x0, y0, x0 - TL * 0.2, y0 + wv1 * 0.5, x1, y0 + wv1, 3.2, a0);
          seg(x1, y0 + wv1, (x1 + x2) / 2, y0 + wv1 * 0.4 + wv2 * 0.6, x2, y0 + wv2, 2.1, a0 * 0.62);
          seg(x2, y0 + wv2, (x2 + x3) / 2, y0 + wv2 * 0.6, x3, y0 + wv2 * 0.4, 1.2, a0 * 0.32);
          ctx.beginPath();
          ctx.arc(x0, y0, 2, 0, TAU);
          ctx.fillStyle = "rgba(246,251,255," + (a0 * 0.95).toFixed(3) + ")";
          ctx.fill();
          for (let f = 0; f < 5; f++) {
            const fq = cyc - 0.045 - f * 0.055;
            if (fq < 0) continue;
            const fx2 = fq * (W * 1.5) - W * 0.25;
            const fy2 = y0 + Math.sin(t * 2.2 + s * 1.7) * 10 * (0.3 + f * 0.16) + Math.sin(t * 3.1 + f * 2.2) * 3;
            ctx.beginPath();
            ctx.arc(fx2, fy2, 1.8 - f * 0.2, 0, TAU);
            ctx.fillStyle = "rgba(224,240,250," + (a0 * (0.75 - f * 0.12)).toFixed(3) + ")";
            ctx.fill();
          }
        }
        ctx.restore();
      }
      var GOLD_LIFE = 1.4;
      function drawGoldDust(ctx, x, y, age, s) {
        if (!ctx || !x && x !== 0 || !y && y !== 0) return;
        const sc = s || 1;
        if (!(age > 0) || age > GOLD_LIFE) return;
        const p0 = clamp01(age / 0.12);
        const gr = (12 + 30 * clamp01(age / GOLD_LIFE)) * sc;
        const ga = p0 * Math.pow(1 - age / GOLD_LIFE, 1.6) * 0.34;
        if (ga > 0.01) {
          const g = ctx.createRadialGradient(x, y, 1, x, y, gr);
          g.addColorStop(0, "rgba(255,208,128," + ga.toFixed(3) + ")");
          g.addColorStop(1, "rgba(255,208,128,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, gr, 0, TAU);
          ctx.fill();
        }
        for (let i = 0; i < 18; i++) {
          const dl = h(i, 11) * 0.12;
          const p = clamp01((age - dl) / (GOLD_LIFE - 0.2));
          if (p <= 0 || p >= 1) continue;
          const ang = h(i, 12) * TAU;
          const rad = (3.5 + h(i, 13) * 10) * sc;
          const easeC = 1 - Math.pow(1 - p, 3);
          const easeQ = 1 - Math.pow(1 - p, 4);
          const px = x + Math.cos(ang) * rad * easeC * 1.5 * sc;
          const py = y - (7 + h(i, 14) * 30) * sc * easeQ;
          const size = (2.2 + h(i, 15) * 2.8) * sc * (1 - p * 0.55);
          const a = (p < 0.12 ? p / 0.12 : 1) * Math.pow(1 - p, 1.3) * 0.92 * p0;
          const hot = p < 0.4;
          const col = hot ? "255,232,170" : "244,168,72";
          ctx.beginPath();
          ctx.arc(px, py, size, 0, TAU);
          ctx.fillStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
          ctx.fill();
        }
      }
      function drawGuideArrow(ctx, o) {
        if (!ctx || !o) return;
        const k = clamp01(o.k == null ? 0 : o.k);
        if (k < 0.05) return;
        const dir = (o.dir || 1) >= 0 ? 1 : -1;
        const len = Math.max(120, Number(o.len) || 220);
        const cx = Number(o.cx) || 0;
        const cy = Number(o.cy) || 0;
        const t = Number(o.t) || 0;
        const half = len / 2;
        const headLen = len * 0.26;
        const headH = len * 0.19;
        const shaft = len * 0.042;
        const breath = 0.72 + 0.28 * (Math.sin(t * (1 + k * 1.5) * TAU) * 0.5 + 0.5);
        const a = (0.6 + 0.4 * k) * breath;
        ctx.save();
        const g = ctx.createRadialGradient(cx, cy, len * 0.06, cx, cy, len * 0.62);
        g.addColorStop(0, "rgba(206,232,246," + (0.1 * k).toFixed(3) + ")");
        g.addColorStop(1, "rgba(206,232,246,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(cx, cy, len * 0.62, headH * 1.35, 0, 0, TAU);
        ctx.fill();
        if (dir < 0) {
          ctx.translate(cx * 2, 0);
          ctx.scale(-1, 1);
        }
        const tipX = cx + half;
        const baseX = tipX - headLen;
        const tailX = cx - half * 0.66;
        const r = shaft / 2;
        const rTail = Math.min(r, len * 0.03);
        const body = () => {
          ctx.beginPath();
          ctx.moveTo(tailX + rTail, cy - r);
          ctx.lineTo(baseX, cy - r);
          ctx.lineTo(baseX, cy - headH / 2);
          ctx.lineTo(tipX, cy);
          ctx.lineTo(baseX, cy + headH / 2);
          ctx.lineTo(baseX, cy + r);
          ctx.lineTo(tailX + rTail, cy + r);
          ctx.arcTo(tailX, cy + r, tailX, cy - r, rTail);
          ctx.arcTo(tailX, cy - r, tailX + rTail, cy - r, rTail);
          ctx.closePath();
        };
        body();
        const fg = ctx.createLinearGradient(0, cy - headH / 2, 0, cy + headH / 2);
        fg.addColorStop(0, "rgba(24,42,60," + (0.42 * k + 0.08).toFixed(3) + ")");
        fg.addColorStop(1, "rgba(10,18,28," + (0.5 * k + 0.08).toFixed(3) + ")");
        ctx.fillStyle = fg;
        ctx.fill();
        body();
        ctx.lineWidth = Math.max(1.6, len * 9e-3);
        ctx.strokeStyle = "rgba(236,248,255," + a.toFixed(3) + ")";
        ctx.stroke();
        ctx.restore();
      }
      module.exports = {
        drawMotes,
        drawWind,
        drawGoldDust,
        drawGuideArrow,
        GOLD_LIFE
      };
    }
  });

  // pkgWire/games/wire/renderer.js
  var require_renderer = __commonJS({
    "pkgWire/games/wire/renderer.js"(exports, module) {
      var { drawWalker, beltWorld, setCharacter, CHARACTERS, CHARACTER_IDS } = require_character_sprite();
      var depth = require_depth();
      var fx = require_fx();
      var D = 5.2;
      var SIGN_SIDE = -1;
      var C = {
        // 2026-11-01：文字色整套翻过来。对局外的三个界面（开始 / 准备 / 结算）
        // 从「不透明白卡」改成「暗玻璃」，浅底上的深字不再存在。
        // 原来这三页和游戏内是两套语言：游戏内一个容器都没有，这三页全是白卡。
        ink: "#F3EBDD",
        inkSoft: "rgba(243,235,221,0.76)",
        inkMute: "rgba(243,235,221,0.54)",
        // 浅底上的深字：只有琥珀主按钮和「选中」的角色胶囊会用到
        onLight: "#1A2530",
        teal: "#0F9C8C",
        tealDeep: "#0A7E72",
        tealLight: "#3FC3B0",
        amber: "#E39A32",
        danger: "#DF5540",
        white: "#FFFFFF",
        card: "rgba(12,21,32,0.78)",
        cardSoft: "rgba(12,21,32,0.55)",
        line: "rgba(226,238,248,0.13)"
      };
      var SKY = {
        // 日出逆光。三个约束缺一不可：
        //   ① 天顶必须深（明度 < 25%），否则整屏没有暗部锚点，看什么都是奶白的；
        //   ② 中段必须有一次**色彩转折**（蓝 → 灰紫）。单调变亮就是「滤镜」，
        //      这是 AI 插画天空最典型的特征；
        //   ③ 金色只允许出现在地平线以上最后 12%。铺得越广越像廉价渐变。
        top: "#132540",
        upper: "#22405C",
        mid: "#4A6178",
        warm: "#96796C",
        glowLow: "#DFA875",
        horizon: "#FFE0B0",
        sunCore: "rgba(255,240,206,0.88)",
        // 远山：逆光下是**深色剪影**，不是「比天空淡一层」。
        // 三层靠明度递进拉空气透视（远浅 · 中中 · 近深），不是靠透明度叠三张纸。
        farTop: "#33506B",
        farBot: "#7089A0",
        midTop: "#1E3651",
        midBot: "#456179",
        nearTop: "#112335",
        nearBot: "#293F58",
        // 云海：顶面被朝阳照亮 = 暖白；沟槽背光 = 冷紫。
        // 这个明暗交界是「云有厚度」的唯一依据，也是纵深感的来源。
        // 云体必须是**冷白**（几乎中性），暖色只允许出现在被夕阳扫到的顶面。
        // 上一版整朵云都用 255,238,212（暖米黄），在深蓝背景上立刻读成「沙漠/沙丘」——
        // 米黄 + 上亮下暗 + 扁椭圆 = 沙丘的全部特征。云和沙的差别就在色温。
        cloudHi: "249,250,250",
        cloudWarm: "255,226,186",
        cloudLo: "86,110,136",
        mist: "235,217,194"
      };
      function buildRgba(r, g, b, a) {
        return "rgba(" + r + "," + g + "," + b + "," + a.toFixed(3) + ")";
      }
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function rr(ctx, x, y, w, h, r) {
        const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.lineTo(x + w - rad, y);
        ctx.arcTo(x + w, y, x + w, y + rad, rad);
        ctx.lineTo(x + w, y + h - rad);
        ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        ctx.lineTo(x + rad, y + h);
        ctx.arcTo(x, y + h, x, y + h - rad, rad);
        ctx.lineTo(x, y + rad);
        ctx.arcTo(x, y, x + rad, y, rad);
        ctx.closePath();
      }
      var WireRenderer2 = class {
        constructor(opts) {
          const o = opts || {};
          this.canvas = o.canvas;
          this.ctx = o.ctx;
          this.engine = o.engine;
          this.cfg = o.cfg;
          this.W = 375;
          this.H = 667;
          this.dpr = 2;
          this.clock = 0;
          this.buttons = [];
          this.pressId = "";
          this.pressAt = 0;
          this.bg = null;
          this.bgKey = "";
          this.bgDirect = false;
          this.hint = null;
          this.popups = [];
          this.fx = { stableGlow: 0, warnGlow: 0, ropeFlash: 0, goalFlash: 0 };
        }
        resize(w, h, dpr2) {
          this.W = Math.max(280, w);
          this.H = Math.max(480, h);
          this.dpr = dpr2 || 2;
          this.bg = null;
          this.bgKey = "";
          this._layout();
        }
        // ---------------------------------------------------------------- 布局
        _layout() {
          const W = this.W;
          const H = this.H;
          const charH = Math.min(H * 0.325, W * 0.62);
          this.L = {
            cx: W * 0.5,
            // 消失点必须与 horizonY 完全相等。之前 farY 比地平线低 1.7%H（约 14px），
            // 钢丝走到离地平线还有 14px 的地方就停了，末端收成一个圆头 ——
            // 读起来是「空中插着一截灰柱子」，不是「一根伸向远方的钢缆」。
            // 钢丝、安全走廊、里程灯统一用这一个消失点。
            farY: H * 0.335,
            // 脚底线：短屏时上移，保证底部平衡条不会压住脚
            charY: Math.min(H * 0.775, H - 170),
            charH,
            charScale: charH / 190,
            wireNearHalf: Math.max(3.2, W * 84e-4),
            corridor: Math.max(34, W * 0.125),
            horizonY: H * 0.335,
            safeTop: 0
          };
          this.dust = depth.buildDust(W, H, this.L.farY, this.L.charY, 26, 11);
        }
        /** 深度 r（米，正 = 远处）→ 屏幕 y 与线宽系数 */
        _depth(r) {
          const k = 1 + r / D;
          const p = 1 - 1 / Math.max(0.06, k);
          return {
            p,
            k: 1 / Math.max(0.06, k),
            y: this.L.charY - (this.L.charY - this.L.farY) * p
          };
        }
        // ---------------------------------------------------------------- 主渲染
        render(dt, now) {
          const ctx = this.ctx;
          if (!ctx) return;
          this.clock += Math.min(0.06, dt || 0.016);
          this.nowMs = now || Date.now();
          this.buttons.length = 0;
          ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
          ctx.clearRect(0, 0, this.W, this.H);
          const engine2 = this.engine;
          const vm = engine2.getViewModel();
          const screen = this._screen(vm.state);
          setCharacter(this.cfg.get("characterId") || "fox");
          this._drawBackground();
          this._drawWorld(vm, screen);
          this._updateFx(vm, dt);
          if (screen === "play") this._drawHud(vm);
          else if (screen === "intro") this._drawIntro(vm);
          else if (screen === "prepare") this._drawPrepare(vm);
          else this._drawResult(vm);
          this._drawTransient();
          if (screen === "play") this._drawMilestone();
        }
        _screen(state) {
          if (state === "IDLE") return "intro";
          if (state === "READY" || state === "CALIBRATING") return "prepare";
          if (state === "RESULT" || state === "ABORTED") return "result";
          return "play";
        }
        // ================================================================ 背景
        _drawBackground() {
          const ctx = this.ctx;
          const key = this.W + "x" + this.H + "@" + this.dpr;
          if (this.bgKey !== key) this._buildBg(key);
          if (this.bg) {
            ctx.drawImage(this.bg, 0, 0, this.W, this.H);
          } else {
            ctx.save();
            this._paintSky(ctx);
            this._paintHills(ctx);
            this._paintValley(ctx);
            ctx.restore();
          }
        }
        _buildBg(key) {
          this.bgKey = key;
          this.bg = null;
          try {
            if (typeof wx === "undefined" || !wx.createOffscreenCanvas) {
              this.bgDirect = true;
              return;
            }
            const c = wx.createOffscreenCanvas({
              type: "2d",
              width: Math.round(this.W * this.dpr),
              height: Math.round(this.H * this.dpr)
            });
            if (!c) {
              this.bgDirect = true;
              return;
            }
            const g = c.getContext("2d");
            g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            g.clearRect(0, 0, this.W, this.H);
            this._paintSky(g);
            this._paintHills(g);
            this._paintValley(g);
            this.bg = c;
            this.bgDirect = false;
          } catch (e) {
            this.bgDirect = true;
            this.bg = null;
          }
        }
        _paintSky(g) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          this._bgCtx = g;
          const sky = g.createLinearGradient(0, 0, 0, hz + 6);
          sky.addColorStop(0, SKY.top);
          sky.addColorStop(0.3, SKY.upper);
          sky.addColorStop(0.62, SKY.mid);
          sky.addColorStop(0.845, "#5E6478");
          sky.addColorStop(0.928, "#9A7A72");
          sky.addColorStop(0.972, "#D9A277");
          sky.addColorStop(1, SKY.horizon);
          g.fillStyle = sky;
          g.fillRect(0, 0, W, hz + 6);
          const sx2 = W * 0.5;
          const sy2 = hz - 6;
          const hR = W * 0.52;
          const halo = g.createRadialGradient(sx2, sy2, 0, sx2, sy2, hR);
          halo.addColorStop(0, "rgba(255,206,148,0.44)");
          halo.addColorStop(0.22, "rgba(255,190,130,0.21)");
          halo.addColorStop(0.58, "rgba(246,176,120,0.07)");
          halo.addColorStop(1, "rgba(246,176,120,0)");
          g.fillStyle = halo;
          g.beginPath();
          g.arc(sx2, sy2, hR, 0, Math.PI * 2);
          g.fill();
          const core = g.createRadialGradient(sx2, sy2, 0, sx2, sy2, W * 0.175);
          core.addColorStop(0, "rgba(255,244,214,0.96)");
          core.addColorStop(0.22, "rgba(255,230,182,0.74)");
          core.addColorStop(0.52, "rgba(255,214,164,0.26)");
          core.addColorStop(1, "rgba(255,210,158,0)");
          g.fillStyle = core;
          g.beginPath();
          g.arc(sx2, sy2, W * 0.175, 0, Math.PI * 2);
          g.fill();
        }
        // 高空层云：两版都失败了，函数已删除。
        // 第一版「柔边白椭圆」读成棉花糖；第二版「扁平暖灰云带」读成屏幕上的折痕。
        // 根因是位置：天空只有 0.33H，任何横跨全屏的软边形状在这里都会两端同时露边。
        // 现在天空是纯渐变 + 一团光核 —— 留白让钢丝和人物被看见。
        /**
         * 远山：三层逆光剪影。
         *
         * 之前三层是 #A8C7DC / #8FB6CB / #7FA9A8 —— 彼此只差一点点，
         * 而且**全都比天空淡**，叠起来读成「三张半透明纸」，完全没有山的重量。
         * 逆光下山本来就该是深色剪影，只有山脊被太阳勾出一道暖边。
         */
        _paintHills(g) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          const ridge = (baseY, amp, topColor, botColor, freq, phase, rimAlpha) => {
            const pts = [];
            for (let x = -10; x <= W + 10; x += 6) {
              const t = x / W;
              const y = baseY - (Math.sin(t * Math.PI * freq + phase) * 0.52 + Math.sin(t * Math.PI * freq * 2.3 + phase * 1.7) * 0.27 + Math.sin(t * Math.PI * freq * 4.9 + phase * 2.9) * 0.14 + Math.sin(t * Math.PI * freq * 9.7 + phase * 0.6) * 0.07) * amp;
              pts.push([x, y]);
            }
            g.beginPath();
            g.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
            g.lineTo(W + 10, hz + 6);
            g.lineTo(-10, hz + 6);
            g.closePath();
            const grd = g.createLinearGradient(0, baseY - amp, 0, hz + 6);
            grd.addColorStop(0, topColor);
            grd.addColorStop(0.46, botColor);
            grd.addColorStop(0.8, "rgba(196,172,160,0.90)");
            grd.addColorStop(1, "rgba(" + SKY.mist + ",0.99)");
            g.fillStyle = grd;
            g.fill();
            if (rimAlpha > 5e-3) {
              g.beginPath();
              g.moveTo(pts[0][0], pts[0][1]);
              for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
              g.lineWidth = 1.15;
              g.strokeStyle = "rgba(255,198,144," + rimAlpha + ")";
              g.lineJoin = "round";
              g.stroke();
            }
          };
          ridge(hz - H * 6e-3, H * 0.098, SKY.farTop, SKY.farBot, 2.3, 0.6, 0.32);
          ridge(hz + 3, H * 0.066, SKY.midTop, SKY.midBot, 3.1, 2.4, 0.22);
          ridge(hz + 8, H * 0.034, SKY.nearTop, SKY.nearBot, 4.6, 4.9, 0.12);
          depth.haze(g, {
            cx: W * 0.5,
            y: hz - 10,
            rx: W * 0.8,
            ry: 0.045,
            color: SKY.mist,
            alpha: 0.55
          });
        }
        _paintValley(g) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          const valH = H - hz;
          const v = g.createLinearGradient(0, hz, 0, H);
          v.addColorStop(0, "rgb(" + SKY.mist + ")");
          v.addColorStop(0.06, "#B7AEA4");
          v.addColorStop(0.2, "#8A93A1");
          v.addColorStop(0.44, "#6D7A91");
          v.addColorStop(0.72, "#4E5B75");
          v.addColorStop(1, "#333F58");
          g.fillStyle = v;
          g.fillRect(0, hz, W, valH);
          this._paintCloudSea(g, hz, valH);
          const ah = g.createLinearGradient(0, hz, 0, hz + valH * 0.62);
          ah.addColorStop(0, "rgba(" + SKY.mist + ",0.46)");
          ah.addColorStop(0.45, "rgba(206,198,192,0.17)");
          ah.addColorStop(1, "rgba(180,186,198,0)");
          g.fillStyle = ah;
          g.fillRect(0, hz, W, valH * 0.62);
          const seam = g.createLinearGradient(0, hz - 26, 0, hz + 44);
          seam.addColorStop(0, "rgba(" + SKY.mist + ",0)");
          seam.addColorStop(0.4, "rgba(" + SKY.mist + ",0.50)");
          seam.addColorStop(0.66, "rgba(" + SKY.mist + ",0.26)");
          seam.addColorStop(1, "rgba(" + SKY.mist + ",0)");
          g.fillStyle = seam;
          g.fillRect(0, hz - 26, W, 70);
          const bottom = g.createLinearGradient(0, H * 0.48, 0, H);
          bottom.addColorStop(0, "rgba(20,34,52,0)");
          bottom.addColorStop(0.45, "rgba(20,34,52,0.16)");
          bottom.addColorStop(1, "rgba(16,28,44,0.46)");
          g.fillStyle = bottom;
          g.fillRect(0, H * 0.48, W, H * 0.52);
        }
        /**
         * 云海：**层叠的云脊**，不是散落的云朵。
         *
         * 这一块改过四版，前四版全部失败，失败方式各不相同，值得记下来：
         *   ① 连续波浪带（depth.cloudBank 三层）  → 等高线 / 水波纹
         *   ② 按行铺云朵（等距 7 行）             → 梯田
         *   ③ 按行铺云朵 + hash 抖动（5 行）      → 鹅卵石
         *   ④ 云朵 + 顶部凸起 + 实心边缘          → 水面上的油斑
         *
         * 四版的共同错误：**把云海当成"很多朵云"**。但从高空看云海，你看到的
         * 不是一朵朵云，而是**一条一条的云脊**——像海浪一样从地平线排到脚下，
         * 每一条脊都是一整片云毯的**前缘**，脊后面是它自己的云面。
         *
         * 所以正确的结构是：5 条「从左到右起伏的脊线」，每条向下填充到画面底部，
         * 远景先画、近景后画，自然遮挡。脊线用四八度分形（和 _paintHills 同一套），
         * 保证它不是一条平滑的正弦——平滑正弦一定读成"水"。
         *
         * 三个约束：
         *   ① 越远越亮越暖（被朝阳照到），越近越暗越冷（背光 + 空气透视反向）；
         *   ② 每条脊线画一道 1px 受光边 —— 这是"云毯有厚度"唯一的依据；
         *   ③ 脊线下方压一道冷影 —— 没有它，五层云会糊成一整片白。
         */
        _paintCloudSea(g, hz, valH) {
          const W = this.W;
          const H = this.H;
          const ridge = (x, seed, freq) => {
            const u = x / W;
            return Math.sin(u * freq + seed) * 0.58 + Math.sin(u * freq * 2.23 + seed * 1.7) * 0.26 + Math.sin(u * freq * 4.21 + seed * 2.3) * 0.11 + Math.sin(u * freq * 8.3 + seed * 3.1) * 0.05;
          };
          const layers = [
            { t: 0.03, amp: 0.01, seed: 1.7, a: 0.6, hi: "240,243,242", lo: "212,219,226" },
            { t: 0.105, amp: 0.019, seed: 4.3, a: 0.7, hi: "233,237,237", lo: "198,207,218" },
            { t: 0.22, amp: 0.03, seed: 7.1, a: 0.78, hi: "221,227,231", lo: "182,193,208" },
            { t: 0.38, amp: 0.043, seed: 11.9, a: 0.84, hi: "204,212,220", lo: "164,177,196" },
            { t: 0.58, amp: 0.06, seed: 16.3, a: 0.88, hi: "180,190,204", lo: "146,159,182" }
          ];
          const STEP = 3;
          layers.forEach((L, li) => {
            const baseY = hz + valH * L.t;
            const ampPx = valH * L.amp;
            const freq = 4.2 + li * 1.35;
            const yAt = (x) => baseY + ridge(x, L.seed, freq) * ampPx;
            g.beginPath();
            g.moveTo(0, yAt(0));
            for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x));
            g.lineTo(W, H);
            g.lineTo(0, H);
            g.closePath();
            const grd = g.createLinearGradient(0, baseY - ampPx * 1.4, 0, H);
            grd.addColorStop(0, "rgba(" + L.hi + "," + L.a.toFixed(2) + ")");
            grd.addColorStop(0.3, "rgba(" + L.hi + "," + (L.a * 0.94).toFixed(3) + ")");
            grd.addColorStop(1, "rgba(" + L.lo + "," + (L.a * 0.88).toFixed(3) + ")");
            g.fillStyle = grd;
            g.fill();
            const edge = "252,250,246";
            [[9, 0.1 + L.a * 0.06], [2.4, 0.16 + L.a * 0.12]].forEach((sp) => {
              g.beginPath();
              g.moveTo(0, yAt(0));
              for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x));
              g.lineWidth = sp[0];
              g.strokeStyle = "rgba(" + edge + "," + sp[1].toFixed(3) + ")";
              g.lineJoin = "round";
              g.lineCap = "round";
              g.stroke();
            });
            g.save();
            g.beginPath();
            g.moveTo(0, yAt(0) + 1);
            for (let x = STEP; x <= W; x += STEP) g.lineTo(x, yAt(x) + 1);
            for (let x = W; x >= 0; x -= STEP) g.lineTo(x, yAt(x) + 3 + ampPx * 0.9);
            g.closePath();
            g.fillStyle = "rgba(70,92,120," + (0.1 + 0.035 * li).toFixed(3) + ")";
            g.fill();
            g.restore();
          });
        }
        // ================================================================ 世界
        _drawWorld(vm, screen) {
          const ctx = this.ctx;
          const cx = this.L.cx;
          const L = this.L;
          const dist = this.engine.distance || 0;
          const idle = screen !== "play";
          let feetY = L.charY;
          let charScale = L.charScale;
          if (idle) {
            const k = screen === "intro" ? { y: 0.3, s: 0.76 } : { y: 0.2, s: 0.84 };
            feetY = L.charY + L.charH * k.y;
            charScale = L.charScale * k.s;
          }
          if (this.dust) {
            depth.drawDust(ctx, this.dust, this.clock, {
              top: L.farY,
              bottom: L.charY,
              color: "255,255,255",
              alpha: 0.7
            });
          }
          fx.drawMotes(ctx, L.W, L.H, this.clock, L.farY, L.H * 0.92);
          this._feetY = feetY;
          this._drawWire();
          this._drawMarkers(dist);
          if (screen === "play") this._drawSignposts(dist);
          if (dist < 1) this._lastMile = 0;
          const step = this._mileStep();
          const mile = Math.floor(dist / step);
          if (mile > (this._lastMile || 0)) {
            this._lastMile = mile;
            this.showMilestone(mile * step);
          }
          if (screen === "play" || screen === "prepare") {
            this._drawRope(vm, screen, feetY, charScale);
          }
          const balance = idle ? 0.92 : vm.balance;
          const lean = idle ? Math.sin(this.clock * 0.9) * 0.012 : vm.lean;
          const walkPhase = idle ? 0 : this.engine.walkPhase;
          if (!idle && vm.balance > 0.7) {
            const a = (vm.balance - 0.7) * 0.9;
            const rad = L.charH * (0.34 + 0.02 * Math.sin(this.clock * 1.4));
            const g = ctx.createRadialGradient(L.cx, feetY, 4, L.cx, feetY, rad);
            g.addColorStop(0, "rgba(63,195,176," + 0.22 * a + ")");
            g.addColorStop(1, "rgba(63,195,176,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(L.cx, feetY, rad, 0, Math.PI * 2);
            ctx.fill();
          }
          if (screen !== "result") {
            depth.softShadow(
              ctx,
              L.cx,
              feetY + 1.5,
              L.charH * 0.19,
              Math.max(2.4, L.charH * 0.032),
              0.3,
              "26,58,82"
            );
            drawWalker(ctx, {
              // 必须把 canvas 传下去：微信的 CanvasRenderingContext2D 没有 ctx.canvas
              // 属性，角色模块只能靠它拿 Canvas 实例去 createImage（真机四轮定位结论）。
              canvas: this.canvas,
              x: L.cx + (idle ? Math.sin(this.clock * 0.7) * 1.2 : 0),
              y: feetY,
              scale: charScale,
              lean,
              walkPhase,
              balance,
              ropeTension: idle ? 0 : vm.ropeTension,
              // 归一化要跟配置走：速度提到 1.8 m/s 之后固定除 1.2 会一直顶在 1，
              // 步频就锁死了 —— 走得快和走得慢看起来一样。
              speedRatio: idle ? 0 : clamp(vm.speed / Math.max(0.2, Number(this.cfg.get("forwardSpeed")) || 1.2), 0, 1),
              t: this.clock
            });
          }
          if (screen === "play") this._drawSceneFx(vm);
          depth.vignette(ctx, {
            w: L.W,
            h: L.H,
            color: "20,54,74",
            alpha: 0.16,
            cy: 0.56,
            inner: 0.42,
            outer: 0.96
          });
        }
        _drawWire() {
          const ctx = this.ctx;
          const cx = this.L.cx;
          const L = this.L;
          const P0 = -0.62;
          const P1 = 1;
          const sample = (p) => ({
            y: L.charY - (L.charY - L.farY) * p,
            half: Math.max(0.34, L.wireNearHalf * Math.pow(1 - p, 0.92)),
            k: 1 - p
          });
          ctx.beginPath();
          for (let i = 0; i <= 40; i++) {
            const p = P0 + i / 40 * (0.9 - P0);
            const s = sample(p);
            if (i === 0) ctx.moveTo(cx, s.y);
            else ctx.lineTo(cx, s.y + 7 * s.k);
          }
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = "rgba(60,90,110,0.07)";
          ctx.stroke();
          const w0 = sample(P0).half;
          const grad = ctx.createLinearGradient(cx - w0 * 1.2, 0, cx + w0 * 1.2, 0);
          grad.addColorStop(0, "#1F2C37");
          grad.addColorStop(0.26, "#4E6170");
          grad.addColorStop(0.44, "#B9CAD6");
          grad.addColorStop(0.5, "#DCECF5");
          grad.addColorStop(0.6, "#6A7E8C");
          grad.addColorStop(1, "#182430");
          const fadeAt = (p) => {
            if (p <= 0.4) return 1;
            const q = clamp((p - 0.4) / 0.26, 0, 1);
            return 1 - 0.86 * (q * q * (3 - 2 * q));
          };
          ctx.beginPath();
          for (let i = 0; i <= 64; i++) {
            const p = P0 + (P1 - P0) * (i / 64);
            const s = sample(p);
            const pad = 0.9 + 0.6 * clamp((p - 0.3) / 0.7, 0, 1);
            if (i === 0) ctx.moveTo(cx + s.half + pad, s.y);
            else ctx.lineTo(cx + s.half + pad, s.y);
          }
          for (let i = 64; i >= 0; i--) {
            const p = P0 + (P1 - P0) * (i / 64);
            const s = sample(p);
            const pad = 0.9 + 0.6 * clamp((p - 0.3) / 0.7, 0, 1);
            ctx.lineTo(cx - s.half - pad, s.y);
          }
          ctx.closePath();
          const rimG = ctx.createLinearGradient(0, L.farY, 0, L.charY);
          for (let i = 0; i <= 12; i++) {
            const t = i / 12;
            rimG.addColorStop(t, "rgba(38,56,72," + (0.6 * fadeAt(1 - t)).toFixed(3) + ")");
          }
          ctx.fillStyle = rimG;
          ctx.fill();
          const SLICES = 56;
          for (let i = 0; i < SLICES; i++) {
            const pa = P0 + (P1 - P0) * (i / SLICES);
            const pb = P0 + (P1 - P0) * ((i + 1) / SLICES);
            const a = sample(pa);
            const b = sample(pb);
            const alpha = fadeAt((pa + pb) / 2);
            if (alpha < 0.02) continue;
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.moveTo(cx + a.half, a.y);
            ctx.lineTo(cx + b.half, b.y);
            ctx.lineTo(cx - b.half, b.y);
            ctx.lineTo(cx - a.half, a.y);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            if (a.half > 0.75 && pb < 0.93) {
              const ha = a.half * 0.3;
              const hb = b.half * 0.3;
              const xa = cx - a.half * 0.24;
              const xb = cx - b.half * 0.24;
              ctx.beginPath();
              ctx.moveTo(xa + ha, a.y - a.half * 0.24);
              ctx.lineTo(xb + hb, b.y - b.half * 0.24);
              ctx.lineTo(xb - hb, b.y - b.half * 0.24);
              ctx.lineTo(xa - ha, a.y - a.half * 0.24);
              ctx.closePath();
              ctx.fillStyle = "rgba(255,255,255,0.55)";
              ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
          const scroll = (this.engine.distance || 0) * 6;
          ctx.save();
          ctx.lineCap = "round";
          for (let r = -2.05; r < 26; r += 0.55) {
            const rr2 = r - scroll % 0.55;
            if (rr2 < -2.05) continue;
            const d = this._depth(rr2);
            if (d.k < 0.34) continue;
            const y = d.y;
            const half = Math.max(0.7, L.wireNearHalf * Math.pow(d.k, 0.92));
            const a = clamp((d.k - 0.15) * 0.62, 0, 0.26);
            ctx.beginPath();
            ctx.moveTo(cx - half * 0.7, y);
            ctx.lineTo(cx + half * 0.55, y - half * 1.05);
            ctx.lineWidth = Math.max(0.5, half * 0.13);
            ctx.strokeStyle = "rgba(28,44,58," + a + ")";
            ctx.stroke();
          }
          ctx.restore();
          const tipY = L.charY - (L.charY - L.farY) * P1;
          const meltR = Math.max(11, this.W * 0.036);
          const melt = ctx.createRadialGradient(cx, tipY + 3, 0, cx, tipY + 3, meltR);
          melt.addColorStop(0, "rgba(255,251,240,0.58)");
          melt.addColorStop(0.45, "rgba(255,251,240,0.30)");
          melt.addColorStop(1, "rgba(255,251,240,0)");
          ctx.fillStyle = melt;
          ctx.beginPath();
          ctx.arc(cx, tipY + 3, meltR, 0, Math.PI * 2);
          ctx.fill();
          const nearD = this._depth(-1.2);
          ctx.save();
          ctx.translate(cx - 1, nearD.y - 1.5);
          ctx.scale(2, 1);
          ctx.beginPath();
          ctx.arc(0, 0, 1, 0, Math.PI * 2);
          ctx.restore();
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          ctx.fill();
        }
        /**
         * 脚下的光：只画角色身后（屏幕下方）这一小段钢丝被照亮。
         * 断口用径向光斑柔化，避免光带在终点被硬切一刀。
         *
         * 为什么不再画到远处：透视是「上方 = 远处」，从脚下画到灭点会在角色
         * 头顶正上方拉出一条竖直橙带，读成「天上挂了根杆子」；而且远处是
         * 「还没走的路」，把那里点亮语义正好反了。进度交给路标点亮 + 飘字。
         */
        // 走过的光带：已删除。
        // 原来在钢丝上叠一条暖金色渐隐带表示「已走的距离」，
        // 但它和钢丝共用同一条线 —— 上半截灰钢缆、下半截金光带，整根读成金箍棒。
        // 进度现在由顶部那条横贯全屏的线 + 「已走过 N 米」承担。
        /**
         * 里程界桩：每 10 米一根，立在钢丝**两侧的云海里**，牌上写着这个里程数。
         *
         * 为什么不在钢丝上挂：试过两版挂在钢缆上的牌子，都失败了，原因很具体 ——
         *   · 这个视角下「前方 10 米以外」总共只有 130px 高（从头顶到地平线）。
         *     六块牌挤在 130px 里，读出来是一串灰方块，不是路标。
         *   · 「前方 10 米以内」虽然宽敞，但那一段的钢丝点落在角色身体上：
         *     挑杆从脑袋里长出来、牌贴在耳朵上，路标和角色直接打对台。
         * 所以路标不能挂在中心线上。**挂不上钢丝的东西，就立在它两侧。**
         *
         * 界桩放在云海里，横向位置随 k 收敛（近处靠屏幕边、远处靠中心），
         * 人眼把这两列读成「道路的边界」—— 这正是跑步游戏路边标杆的做法，
         * 也是这个视角下唯一能把「距离」和「前进」同时说出来的东西。
         *
         * 三条约束：
         *  ① 桩底必须**化进云里**（线性渐变到透明）。一根硬底线的柱子是
         *    "插在云上的杆"，渐变收尾才读成"从云里长出来"。
         *  ② 左右**交替**：10 在左、20 在右、30 在左。全放同侧时，
         *    几根桩在透视里连成一条斜线，读成一排栏杆。
         *  ③ 尺寸用 pow(k, 0.6) 压缩透视。严格按 k 缩放时，30 米外的牌子
         *    只有 14px 宽、字号 6px —— 等于没画。
         */
        /**
         * 界桩与里程碑的间距。
         * 40 米以下每 10 米；更长的赛道放宽到 20 米 —— 否则 300 米赛道会立 30 根桩，
         * 透视里挤成一条灰带，反而看不出走了多远。
         */
        _mileStep() {
          const trackLength = Number(this.cfg.get("trackLength")) || 100;
          return trackLength > 60 ? 20 : 10;
        }
        _drawSignposts(distance) {
          const ctx = this.ctx;
          const L = this.L;
          const cx = L.cx;
          const W = this.W;
          const trackLength = Number(this.cfg.get("trackLength")) || 100;
          const step = this._mileStep();
          const marks = [];
          for (let m = step; m < trackLength; m += step) marks.push({ m, finish: false });
          marks.push({ m: trackLength, finish: true });
          marks.forEach((mk) => {
            const r = mk.m - distance;
            if (r < 1.8 || r > 34) return;
            const d = this._depth(r);
            const k = d.k;
            if (k < 0.12) return;
            const y = d.y;
            const s = Math.pow(k, 0.6);
            const fin = mk.finish;
            const off = Math.min(0.32 * W, 0.78 * W * k);
            const jitter = 1 + (mk.m * 37 % 11 - 5) * 8e-3;
            const px = cx + SIGN_SIDE * off * jitter;
            const pw = (fin ? 1.16 : 1) * (26 + 22 * s);
            const ph = (fin ? 1.15 : 1) * (15 + 11 * s);
            const py = y - 26 * s;
            const postH = 36 + 46 * s;
            const postW = Math.max(3, 3 + 3.4 * s);
            ctx.save();
            const postTop = py + ph * 0.55;
            const pg = ctx.createLinearGradient(0, postTop, 0, postTop + postH);
            pg.addColorStop(0, "rgba(22,42,60,0.62)");
            pg.addColorStop(0.62, "rgba(26,46,64,0.34)");
            pg.addColorStop(0.88, "rgba(26,46,64,0.10)");
            pg.addColorStop(1, "rgba(26,46,64,0)");
            const litG = ctx.createLinearGradient(0, postTop, 0, postTop + postH);
            litG.addColorStop(0, "rgba(206,226,236,0.26)");
            litG.addColorStop(0.58, "rgba(198,220,232,0.12)");
            litG.addColorStop(1, "rgba(198,220,232,0)");
            const postCols = fin ? [[px - pw * 0.3, 1], [px + pw * 0.3 - postW * 0.8, 1]] : [[px - postW * 0.5, 1]];
            if (fin) {
              postCols.forEach((c) => {
                const x0 = c[0];
                const cw = postW * 0.8;
                ctx.fillStyle = pg;
                ctx.fillRect(x0, postTop, cw, postH);
                ctx.fillStyle = litG;
                ctx.fillRect(x0 + cw * 0.62, postTop, cw * 0.38, postH);
              });
            } else {
              ctx.fillStyle = pg;
              ctx.fillRect(px - postW * 0.5, postTop, postW, postH);
              ctx.fillStyle = litG;
              ctx.fillRect(px - postW * 0.5 + postW * 0.62, postTop, postW * 0.38, postH);
            }
            const footY = postTop + postH * 0.7;
            const fogR = postW * 5.4;
            const fog = ctx.createRadialGradient(px, footY, 0, px, footY, fogR);
            fog.addColorStop(0, "rgba(234,241,245,0.46)");
            fog.addColorStop(0.55, "rgba(234,241,245,0.18)");
            fog.addColorStop(1, "rgba(234,241,245,0)");
            ctx.fillStyle = fog;
            ctx.beginPath();
            ctx.arc(px, footY, fogR, 0, Math.PI * 2);
            ctx.fill();
            rr(ctx, px - pw * 0.5, py - ph * 0.5, pw, ph, ph * 0.34);
            ctx.fillStyle = fin ? "rgba(255,203,124,0.94)" : "rgba(16,31,47,0.74)";
            ctx.fill();
            ctx.lineWidth = Math.max(0.7, 1.1 * s);
            ctx.strokeStyle = fin ? "rgba(255,240,208,0.95)" : "rgba(228,241,249,0.50)";
            ctx.stroke();
            const fs = (fin ? 1.1 : 1) * (11 + 9 * s);
            ctx.font = "700 " + fs.toFixed(1) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = fin ? "rgba(88,50,10,0.96)" : "rgba(242,249,252,0.95)";
            ctx.fillText(String(mk.m), px, py + fs * 0.04);
            if (fin && r < 8) {
              const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.1);
              const gr = pw * (0.72 + 0.16 * pulse);
              const gg = ctx.createRadialGradient(px, py, pw * 0.3, px, py, gr);
              gg.addColorStop(0, "rgba(255,206,132," + (0.3 + 0.16 * pulse).toFixed(3) + ")");
              gg.addColorStop(1, "rgba(255,206,132,0)");
              ctx.fillStyle = gg;
              ctx.beginPath();
              ctx.arc(px, py, gr, 0, Math.PI * 2);
              ctx.fill();
            }
            const since = distance - mk.m;
            if (since >= 0 && since < 1.4) {
              const q = since / 1.4;
              ctx.beginPath();
              ctx.arc(px, py, pw * (0.5 + q * 0.5), 0, Math.PI * 2);
              ctx.lineWidth = 2.2 * (1 - q);
              ctx.strokeStyle = "rgba(255,206,132," + (0.85 * (1 - q)).toFixed(3) + ")";
              ctx.stroke();
            }
            ctx.restore();
          });
        }
        _drawMarkers(distance) {
          const ctx = this.ctx;
          const L = this.L;
          const cx = L.cx;
          const trackLength = Number(this.cfg.get("trackLength")) || 100;
          const spacing = 5;
          const bigStep = this._mileStep();
          for (let m = spacing; m <= trackLength; m += spacing) {
            const r = m - distance;
            if (r < 1.4 || r > 26) continue;
            const d = this._depth(r);
            const k = d.k;
            if (k < 0.13) continue;
            const y = d.y;
            const passed = m <= distance + 0.2;
            const since = distance - m;
            const rad = (m % bigStep === 0 ? 2.7 : 1.9) * Math.max(0.45, k);
            const alpha = clamp(k * 1.6, 0.16, 1);
            ctx.save();
            ctx.globalAlpha = alpha;
            if (passed) {
              const glow = ctx.createRadialGradient(cx, y, 0, cx, y, rad * 5.5);
              glow.addColorStop(0, "rgba(255,203,124,0.55)");
              glow.addColorStop(0.4, "rgba(255,203,124,0.20)");
              glow.addColorStop(1, "rgba(255,203,124,0)");
              ctx.fillStyle = glow;
              ctx.beginPath();
              ctx.arc(cx, y, rad * 5.5, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(cx, y, rad, 0, Math.PI * 2);
            ctx.fillStyle = passed ? "rgba(255,214,148,1)" : "rgba(236,246,250,0.92)";
            ctx.fill();
            ctx.lineWidth = Math.max(0.6, rad * 0.45);
            ctx.strokeStyle = passed ? "rgba(196,132,40,0.55)" : "rgba(116,156,176,0.5)";
            ctx.stroke();
            if (passed && since >= 0 && since < 1.2) {
              const q = since / 1.2;
              const ring = rad * (2.2 + q * 5.5);
              ctx.beginPath();
              ctx.arc(cx, y, ring, 0, Math.PI * 2);
              ctx.lineWidth = Math.max(0.6, 2.4 * (1 - q));
              ctx.strokeStyle = "rgba(255,214,150," + (0.75 * (1 - q)).toFixed(3) + ")";
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        _drawRope(vm, screen, feetY, charScale) {
          const ctx = this.ctx;
          const L = this.L;
          const tension = screen === "play" ? vm.ropeTension : 0;
          const enabled = this.cfg.get("ropeEnabled");
          if (!enabled) return;
          const anchorX = L.cx + this.W * 0.2;
          const anchorY = -26;
          const belt = beltWorld({
            x: L.cx,
            y: feetY === void 0 ? L.charY : feetY,
            scale: charScale === void 0 ? L.charScale : charScale,
            lean: screen === "play" ? vm.lean : 0
          });
          const slack = 1 - tension;
          const midX = (anchorX + belt.x) / 2 + 44 * slack;
          const midY = (anchorY + belt.y) / 2 + 54 * slack;
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(anchorX, anchorY);
            ctx.quadraticCurveTo(midX, midY, belt.x, belt.y);
          };
          const active = tension > 0.05;
          const ropeGrad = (rgb, alpha) => {
            const g = ctx.createLinearGradient(0, anchorY, 0, belt.y);
            g.addColorStop(0, buildRgba(rgb[0], rgb[1], rgb[2], 0));
            g.addColorStop(0.2, buildRgba(rgb[0], rgb[1], rgb[2], alpha));
            g.addColorStop(1, buildRgba(rgb[0], rgb[1], rgb[2], alpha));
            return g;
          };
          if (active) {
            path();
            ctx.lineWidth = 6;
            ctx.strokeStyle = buildRgba(255, 196, 110, 0.1 + tension * 0.22);
            ctx.stroke();
          }
          path();
          ctx.lineWidth = active ? 2 : 1.5;
          ctx.strokeStyle = active ? ropeGrad([255, 196, 110], 0.35 + tension * 0.62) : ropeGrad([38, 44, 58], 0.14);
          ctx.stroke();
          if (active) {
            ctx.save();
            ctx.translate(-0.8, 0);
            path();
            ctx.lineWidth = 0.9;
            ctx.strokeStyle = buildRgba(255, 232, 190, 0.3 + tension * 0.5);
            ctx.stroke();
            ctx.restore();
          }
          ctx.beginPath();
          ctx.arc(belt.x, belt.y - 1, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = tension > 0.3 ? "rgba(255,214,140,1)" : "rgba(150,158,172,0.55)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(28,34,46,0.40)";
          ctx.stroke();
        }
        _updateFx(vm, dt) {
          const step = Math.min(0.06, dt || 0.016);
          const warnTarget = vm.state === "PLAYING" ? clamp((vm.load - vm.warnThreshold) / 0.3, 0, 1) : 0;
          this.fx.warnGlow += (warnTarget - this.fx.warnGlow) * Math.min(1, step * 6);
          const ropeTarget = vm.ropeTension || 0;
          this.fx.ropeFlash += (ropeTarget - this.fx.ropeFlash) * Math.min(1, step * 8);
          const stableTarget = vm.state === "PLAYING" && vm.stable ? 1 : 0;
          this.fx.stableGlow += (stableTarget - this.fx.stableGlow) * Math.min(1, step * 4);
        }
        _drawSceneFx(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const warn = this.fx.warnGlow;
          const rope = this.fx.ropeFlash;
          fx.drawWind(ctx, W, H, this.clock, warn, (vm && vm.lean) >= 0 ? 1 : -1);
          if (this.goldBurst) {
            const age = ((this.nowMs || Date.now()) - this.goldBurst.at) / 1e3;
            fx.drawGoldDust(ctx, this.goldBurst.x, this.goldBurst.y, age, 1);
            if (age > fx.GOLD_LIFE) this.goldBurst = null;
          }
          const guide = vm.rope || {};
          if (warn > 0.02 && guide.guideAxis === "x" && guide.guideDir) {
            const side = guide.guideDir < 0 ? 0 : 1;
            const a = 0.16 * warn * (0.6 + 0.4 * (guide.guideStrength || 0));
            const gw = W * 0.26;
            const x0 = side === 0 ? gw : W;
            const x1 = side === 0 ? 0 : W - gw;
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, "rgba(198,226,240," + a.toFixed(3) + ")");
            g.addColorStop(1, "rgba(198,226,240,0)");
            ctx.fillStyle = g;
            ctx.fillRect(side === 0 ? 0 : W - gw, H * 0.16, gw, H * 0.66);
          }
          if (rope > 0.02) {
            const L = this.L;
            const rx = L.charH * 0.42;
            const ry = L.charH * 0.55;
            const cxr = L.cx;
            const cyr = L.charY - L.charH * 0.46;
            ctx.save();
            ctx.translate(cxr, cyr);
            ctx.scale(rx, ry);
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.lineWidth = 1.3;
            ctx.strokeStyle = "rgba(255,206,126," + 0.3 * rope + ")";
            ctx.stroke();
            ctx.save();
            ctx.translate(cxr, cyr);
            ctx.scale(rx * 1.06, ry * 1.06);
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.lineWidth = 9;
            ctx.strokeStyle = "rgba(255,206,126," + 0.09 * rope + ")";
            ctx.stroke();
          }
        }
        // ================================================================ HUD
        _drawHud(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const L = this.L;
          const top = this._safeTop();
          L.safeTop = top;
          const shade = ctx.createLinearGradient(0, 0, 0, top + 118);
          shade.addColorStop(0, "rgba(8,18,34,0.34)");
          shade.addColorStop(0.55, "rgba(8,18,34,0.14)");
          shade.addColorStop(1, "rgba(8,18,34,0)");
          ctx.fillStyle = shade;
          ctx.fillRect(0, 0, W, top + 118);
          const prog = clamp(vm.progress, 0, 1);
          ctx.fillStyle = "rgba(255,255,255,0.14)";
          ctx.fillRect(0, top, W, 2);
          if (prog > 2e-3) {
            const pg = ctx.createLinearGradient(0, 0, Math.max(24, W * prog), 0);
            pg.addColorStop(0, "rgba(255,178,96,0.60)");
            pg.addColorStop(1, "rgba(255,232,184,1)");
            ctx.fillStyle = pg;
            ctx.fillRect(0, top, W * prog, 2);
          }
          if (prog > 4e-3 && prog < 0.996) {
            ctx.beginPath();
            ctx.arc(W * prog, top + 1, 2.8, 0, Math.PI * 2);
            ctx.fillStyle = "#FFF6E2";
            ctx.fill();
          }
          const rowTop = top + 20;
          const colL = 18;
          const colR = W - 18;
          const muted = "rgba(255,255,255,0.62)";
          this._text("\u5269\u4F59", colL, rowTop, { size: 11, weight: "600", color: muted });
          this._text(vm.timeLeftText, colL, rowTop + 24, {
            size: 25,
            weight: "700",
            color: vm.timeLeft <= 10 ? "#FF9A76" : "#FFFFFF"
          });
          this._text("\u5F97\u5206", colR, rowTop, { size: 11, weight: "600", color: muted, align: "right" });
          this._text(String(vm.score), colR, rowTop + 24, {
            size: 25,
            weight: "700",
            color: "#FFCE86",
            align: "right"
          });
          this._text("\u91CC\u7A0B", W / 2, rowTop, { size: 11, weight: "600", color: muted, align: "center" });
          const distStr = vm.distance.toFixed(1);
          const distTail = "  /  " + vm.trackLength + " \u7C73";
          const distFont = '"PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          ctx.save();
          ctx.font = "700 19px " + distFont;
          const distW = ctx.measureText(distStr).width;
          ctx.font = "600 9.5px " + distFont;
          const tailW = ctx.measureText(distTail).width;
          ctx.restore();
          const distX = W / 2 - (distW + tailW) / 2;
          this._text(distStr, distX, rowTop + 24, {
            size: 19,
            weight: "700",
            color: "#FFFFFF"
          });
          this._text(distTail, distX + distW, rowTop + 23, {
            size: 11,
            weight: "600",
            color: "rgba(255,255,255,0.64)"
          });
          const warnY = rowTop + 42;
          if (vm.sim) {
            this._text("\u6A21\u62DF\u6570\u636E", W / 2, warnY, {
              size: 9,
              weight: "700",
              color: "rgba(255,190,110,0.80)",
              align: "center"
            });
          } else if (vm.stale) {
            this._text("\u4FE1\u53F7\u4E2D\u65AD \xB7 \u8BF7\u68C0\u67E5\u4F20\u611F\u5668", W / 2, warnY, {
              size: 10,
              weight: "700",
              color: "rgba(255,150,120,0.95)",
              align: "center"
            });
          }
          const rp = vm.rope || {};
          if (rp.guideAxis === "x" && rp.guideDir && rp.level >= 1 && vm.state !== "PAUSED") {
            const guideLen = Math.min(W * 0.7, 320);
            const horizonY = L.farY || H * 0.42;
            const guideCy = Math.max(
              warnY + 26,
              Math.min(warnY + 40, horizonY - 10 - guideLen * 0.1)
            );
            fx.drawGuideArrow(ctx, {
              cx: W / 2,
              cy: guideCy,
              dir: rp.guideDir,
              // 只要出现就必须清楚可读，所以给 0.55 的地板；越失衡越亮
              k: clamp(0.55 + 0.45 * (rp.guideStrength || 0), 0, 1),
              t: this.clock,
              len: guideLen
            });
          }
          this._drawBalance(vm);
          const btnD = 46;
          const btnY = H - 64;
          this._roundButton("pause", 18, btnY, btnD, vm.state === "PAUSED" ? "play" : "pause");
          this._roundButton("exit", W - 18 - btnD, btnY, btnD, "exit");
          if (vm.sim) this._drawSimPad(vm);
          if (vm.state === "PAUSED") this._drawPauseOverlay(vm);
          if (vm.state === "SENSOR_ERROR") this._drawSensorOverlay(vm);
          if (vm.state === "COUNTDOWN") this._drawCountdown(vm);
        }
        _drawBalance(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const barW = Math.min(W - 96, 360);
          const barX = (W - barW) / 2;
          const barY = H - 130;
          const barH = 14;
          const nx = clamp(vm.nx, -1, 1);
          const warn = clamp(vm.warnThreshold, 0.1, 0.95);
          let label = "\u5E73\u8861\u7A33\u5B9A";
          let color = "rgba(255,255,255,0.86)";
          const rp = vm.rope || {};
          const dirText = rp.guideDir < 0 ? "\u5F80\u5DE6\u538B" : rp.guideDir > 0 ? "\u5F80\u53F3\u538B" : "\u6536\u56DE\u91CD\u5FC3";
          if (rp.state === "ENGAGED") {
            label = "\u5DF2\u8D8A\u754C \xB7 " + dirText + " \u624D\u80FD\u7EE7\u7EED";
            color = "#FFD9A0";
          } else if (Math.abs(nx) >= warn) {
            label = "\u5931\u8861 \xB7 " + dirText;
            color = "#CFE3F0";
          } else if (Math.abs(nx) >= warn * 0.6) {
            label = nx < 0 ? "\u8F7B\u5FAE\u5DE6\u504F" : "\u8F7B\u5FAE\u53F3\u504F";
            color = "#FFCE86";
          } else if (vm.balance < 0.45) {
            label = "\u91CD\u5FC3\u4E0D\u7A33 \xB7 \u653E\u6162\u52A8\u4F5C";
            color = "#FFCE86";
          }
          this._text(label, W / 2, barY - 12, {
            size: 13,
            weight: "700",
            color,
            align: "center",
            shadow: true
          });
          const trackY = barY + 9;
          ctx.save();
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(barX, trackY);
          ctx.lineTo(barX + barW, trackY);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "rgba(255,255,255,0.24)";
          ctx.stroke();
          const safeHalf = barW / 2 * warn * 0.82;
          ctx.beginPath();
          ctx.moveTo(W / 2 - safeHalf, trackY);
          ctx.lineTo(W / 2 + safeHalf, trackY);
          ctx.lineWidth = 4;
          ctx.strokeStyle = "rgba(255,236,202,0.55)";
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(W / 2, trackY - 9);
          ctx.lineTo(W / 2, trackY - 3);
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.stroke();
          ctx.restore();
          const mx = W / 2 + nx * (barW / 2 - 8);
          const over = Math.abs(nx) >= warn;
          ctx.beginPath();
          ctx.arc(mx, trackY, 6.2, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.lineWidth = 2.2;
          ctx.strokeStyle = over ? "#FF9A76" : Math.abs(nx) >= warn * 0.6 ? C.amber : "rgba(236,246,255,0.95)";
          ctx.stroke();
        }
        /**
         * 模拟控制（调试用）。
         * 这是一组开发期控件，不该和正式 HUD 抢注意力：原来是 44×34 的白底卡片
         * 加中文标签，占掉左侧 1/3 屏宽，患者第一眼看到的就是它。
         * 现在压成半透明小圆，只留箭头符号，整体 alpha 0.42。
         */
        _drawSimPad(vm) {
          const ctx = this.ctx;
          const H = this.H;
          const x = 9;
          const y0 = Math.max(this._safeTop() + 104, H * 0.34);
          const d = 26;
          const gap = 6;
          const items = [
            { id: "sim:left", t: "\u2190" },
            { id: "sim:right", t: "\u2192" },
            { id: "sim:up", t: "\u2191" },
            { id: "sim:down", t: "\u2193" },
            { id: "sim:center", t: "\u25CE" },
            { id: "sim:rope", t: "\u2691" }
          ];
          ctx.save();
          ctx.globalAlpha = 0.32;
          items.forEach((it, i) => {
            const y = y0 + i * (d + gap);
            const cxp = x + d / 2;
            const cyp = y + d / 2;
            const pressed = this.pressId === it.id && this.nowMs - this.pressAt < 150;
            ctx.beginPath();
            ctx.arc(cxp, cyp, d / 2, 0, Math.PI * 2);
            ctx.fillStyle = pressed ? "rgba(15,156,140,0.92)" : "rgba(255,255,255,0.78)";
            ctx.fill();
            this._text(it.t, cxp, cyp + 5, {
              size: 13,
              weight: "600",
              color: pressed ? "#FFFFFF" : "rgba(19,41,58,0.66)",
              align: "center"
            });
            this.buttons.push({ id: it.id, x, y, w: d, h: d });
          });
          ctx.restore();
        }
        _drawCountdown(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const n = Math.max(0, Math.ceil(vm.countdown));
          const frac = 1 - (vm.countdown - Math.floor(vm.countdown));
          const text = n > 0 ? String(n) : "\u5F00\u59CB";
          const scale = 1 + (1 - frac) * 0.18;
          ctx.save();
          ctx.globalAlpha = clamp(frac * 1.4, 0, 1);
          this._text(text, W / 2, H * 0.44, {
            size: 86 * scale,
            weight: "800",
            color: "rgba(255,255,255,0.96)",
            align: "center",
            shadow: true
          });
          this._text("\u4FDD\u6301\u8EAB\u4F53\u5C45\u4E2D\uFF0C\u6276\u7A33\u91CD\u5FC3", W / 2, H * 0.44 + 52, {
            size: 14,
            weight: "600",
            color: "rgba(255,255,255,0.92)",
            align: "center"
          });
          ctx.restore();
        }
        _drawPauseOverlay(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          ctx.fillStyle = "rgba(10,28,40,0.42)";
          ctx.fillRect(0, 0, W, H);
          const pw = Math.min(W - 64, 320);
          const ph = 208;
          const px = (W - pw) / 2;
          const py = (H - ph) / 2 - 20;
          this._panel(px, py, pw, ph);
          this._text("\u5DF2\u6682\u505C", W / 2, py + 46, { size: 24, weight: "700", color: C.ink, align: "center" });
          this._text("\u8BAD\u7EC3\u8BA1\u65F6\u5DF2\u505C\u6B62\uFF0C\u6210\u7EE9\u4E0D\u4F1A\u53D8\u5316", W / 2, py + 72, {
            size: 12,
            weight: "500",
            color: C.inkMute,
            align: "center"
          });
          this._button("resume", px + 24, py + 92, pw - 48, 46, "\u7EE7\u7EED\u8BAD\u7EC3", { variant: "primary", icon: "play" });
          this._button("restart", px + 24, py + 148, (pw - 60) / 2, 40, "\u91CD\u65B0\u5F00\u59CB", { variant: "ghost", size: 13 });
          this._button("quit", px + 24 + (pw - 60) / 2 + 12, py + 148, (pw - 60) / 2, 40, "\u7ED3\u675F\u672C\u5C40", { variant: "ghost", size: 13 });
        }
        _drawSensorOverlay(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          ctx.fillStyle = "rgba(10,28,40,0.5)";
          ctx.fillRect(0, 0, W, H);
          const pw = Math.min(W - 56, 330);
          const ph = 236;
          const px = (W - pw) / 2;
          const py = (H - ph) / 2 - 16;
          this._panel(px, py, pw, ph, { accent: C.amber });
          this._text("\u4F20\u611F\u5668\u4FE1\u53F7\u4E2D\u65AD", W / 2, py + 44, { size: 20, weight: "700", color: C.ink, align: "center" });
          this._text("\u8BAD\u7EC3\u5DF2\u81EA\u52A8\u6682\u505C\uFF0C\u672C\u6B21\u4E2D\u65AD\u4F1A\u8BA1\u5165\u8BB0\u5F55", W / 2, py + 70, {
            size: 12,
            weight: "500",
            color: C.inkMute,
            align: "center"
          });
          this._text("\u5DF2\u4E2D\u65AD " + (vm.interrupted.totalSec || 0).toFixed(1) + " \u79D2", W / 2, py + 92, {
            size: 12,
            weight: "600",
            color: C.amber,
            align: "center"
          });
          this._button("reconnect", px + 24, py + 110, pw - 48, 44, "\u53BB\u91CD\u65B0\u8FDE\u63A5", { variant: "primary", icon: "bluetooth" });
          this._button("resume", px + 24, py + 164, (pw - 60) / 2, 40, vm.canResume ? "\u7EE7\u7EED\u8BAD\u7EC3" : "\u7B49\u5F85\u6570\u636E\u2026", {
            variant: "ghost",
            size: 13,
            disabled: !vm.canResume
          });
          this._button("quit", px + 24 + (pw - 60) / 2 + 12, py + 164, (pw - 60) / 2, 40, "\u7ED3\u675F\u672C\u5C40", {
            variant: "ghost",
            size: 13
          });
        }
        // ================================================================ 介绍页
        _drawIntro(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const topScrim = ctx.createLinearGradient(0, 0, 0, H * 0.32);
          topScrim.addColorStop(0, "rgba(12,38,54,0.16)");
          topScrim.addColorStop(1, "rgba(12,38,54,0)");
          ctx.fillStyle = topScrim;
          ctx.fillRect(0, 0, W, H * 0.32);
          const scrim = ctx.createLinearGradient(0, H * 0.3, 0, H);
          scrim.addColorStop(0, "rgba(12,38,54,0)");
          scrim.addColorStop(0.55, "rgba(12,38,54,0.10)");
          scrim.addColorStop(1, "rgba(8,26,40,0.38)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, H * 0.3, W, H * 0.7);
          this._text("\u8D70\u94A2\u4E1D", W / 2, H * 0.215, {
            size: Math.min(52, W * 0.145),
            weight: "800",
            color: "#FFFFFF",
            align: "center",
            shadow: true
          });
          this._text("\u4F53\u611F\u5E73\u8861\u8BAD\u7EC3 \xB7 \u7B2C " + vm.difficulty + " \u6863", W / 2, H * 0.215 + 30, {
            size: 13,
            weight: "600",
            color: "rgba(255,255,255,0.9)",
            align: "center"
          });
          const simLabel = vm.sim ? "\u6A21\u62DF\u6570\u636E" : vm.stale ? "\u4F20\u611F\u5668\u672A\u8FDE\u63A5" : "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5";
          const durLabel = (Number(this.cfg.get("durationSec")) || 90) + " \u79D2";
          const lenLabel = (Number(this.cfg.get("trackLength")) || 100) + " \u7C73";
          const metaY = H * 0.215 + 52;
          this._text(simLabel + " \xB7 \u65F6\u957F " + durLabel + " \xB7 \u91CC\u7A0B " + lenLabel, W / 2, metaY, {
            size: 11,
            weight: "600",
            color: vm.sim ? "rgba(255,196,120,0.92)" : "rgba(255,255,255,0.62)",
            align: "center"
          });
          const chipYs = metaY + 12;
          const curChar = this.cfg.get("characterId") || "fox";
          const pickW = 84;
          const pickH = 32;
          const pickGap = 8;
          const pickTotal = pickW * 3 + pickGap * 2;
          const pickX0 = W / 2 - pickTotal / 2;
          const pickY = chipYs + 2;
          CHARACTER_IDS.forEach((cid, i) => {
            const on = cid === curChar;
            const bx = pickX0 + i * (pickW + pickGap);
            const r = pickH / 2;
            ctx.beginPath();
            ctx.moveTo(bx + r, pickY);
            ctx.lineTo(bx + pickW - r, pickY);
            ctx.arcTo(bx + pickW, pickY, bx + pickW, pickY + r, r);
            ctx.lineTo(bx + pickW, pickY + pickH - r);
            ctx.arcTo(bx + pickW, pickY + pickH, bx + pickW - r, pickY + pickH, r);
            ctx.lineTo(bx + r, pickY + pickH);
            ctx.arcTo(bx, pickY + pickH, bx, pickY + pickH - r, r);
            ctx.lineTo(bx, pickY + r);
            ctx.arcTo(bx, pickY, bx + r, pickY, r);
            ctx.closePath();
            ctx.fillStyle = on ? "rgba(255,252,246,0.96)" : "rgba(12,21,32,0.58)";
            ctx.fill();
            ctx.lineWidth = on ? 1.6 : 1;
            ctx.strokeStyle = on ? "rgba(255,255,255,0.98)" : "rgba(226,238,248,0.30)";
            ctx.stroke();
            const label = CHARACTERS[cid] && CHARACTERS[cid].name || cid;
            this._text(label, bx + pickW / 2, pickY + 21, {
              size: 13,
              weight: on ? "800" : "600",
              // 选中是浅底 → 必须用深字；C.ink 现在是暖白，写在这儿会白底白字
              color: on ? C.onLight : "rgba(255,255,255,0.92)",
              align: "center"
            });
            this.buttons.push({ id: "char:" + cid, x: bx, y: pickY, w: pickW, h: pickH });
          });
          const cardY = pickY + pickH + 16;
          const cardW = Math.min(W - 40, 380);
          const cardX = (W - cardW) / 2;
          const cardH = 126;
          this._glass(cardX, cardY, cardW, cardH, 20);
          const rules = [
            { t: "\u8EAB\u4F53\u5C45\u4E2D\uFF0C\u89D2\u8272\u624D\u8D70\u5F97\u7A33", d: "\u8EAB\u4F53\u5DE6\u53F3\u504F\u79FB\u4F1A\u5E26\u52A8\u89D2\u8272\u503E\u659C" },
            { t: "\u5931\u8861\u65F6\u4E0D\u8981\u6025\uFF0C\u6162\u6162\u56DE\u6B63", d: "\u504F\u79FB\u8D8A\u5927\u8D8A\u4E45\uFF0C\u5E73\u8861\u6062\u590D\u8D8A\u6162" },
            { t: "\u5931\u8861\u65F6\u6E38\u620F\u4E0D\u4F1A\u66FF\u4F60\u56DE\u6B63", d: "\u6309\u5149\u5E26\u7684\u65B9\u5411\u628A\u91CD\u5FC3\u538B\u56DE\u53BB\uFF0C\u7AD9\u7A33\u4E86\u624D\u7EE7\u7EED\u8D70" }
          ];
          rules.forEach((r, i) => {
            const ry = cardY + 26 + i * 34;
            ctx.beginPath();
            ctx.arc(cardX + 24, ry - 4, 7, 0, Math.PI * 2);
            ctx.fillStyle = i === 2 ? "rgba(227,154,50,0.18)" : "rgba(15,156,140,0.14)";
            ctx.fill();
            this._text(String(i + 1), cardX + 24, ry - 0.5, {
              size: 10,
              weight: "700",
              color: i === 2 ? C.amber : C.tealDeep,
              align: "center"
            });
            this._text(r.t, cardX + 40, ry, { size: 13, weight: "700", color: C.ink });
            this._text(r.d, cardX + 40, ry + 15, { size: 11, weight: "500", color: C.inkMute });
          });
          const btnW = Math.min(W - 80, 300);
          const btnX = (W - btnW) / 2;
          const btnY = cardY + cardH + 22;
          this._button("start", btnX, btnY, btnW, 52, "\u5F00\u59CB\u8BAD\u7EC3", { variant: "primary", icon: "play", size: 17 });
          const subY = btnY + 64;
          const subW = (btnW - 12) / 2;
          this._button("settings", btnX, subY, subW, 40, "\u8BAD\u7EC3\u8BBE\u7F6E", { variant: "glass", icon: "gear", size: 13 });
          this._button("records", btnX + subW + 12, subY, subW, 40, "\u8BAD\u7EC3\u8BB0\u5F55", { variant: "glass", icon: "list", size: 13 });
          if (!vm.sim) {
            this._linkButton("sim:on", W / 2 - 70, H - 78, 140, 26, "\u6CA1\u6709\u8BBE\u5907\uFF1F\u7528\u6A21\u62DF\u6570\u636E");
          } else {
            this._linkButton("sim:off", W / 2 - 64, H - 78, 128, 26, "\u5173\u95ED\u6A21\u62DF\u6570\u636E");
          }
          this._text("\u5EFA\u8BAE\u5728\u6CBB\u7597\u5E08\u6216\u5BB6\u5C5E\u966A\u540C\u4E0B\u8BAD\u7EC3", W / 2, H - 32, {
            size: 10,
            weight: "500",
            color: "rgba(255,255,255,0.62)",
            align: "center"
          });
        }
        // ================================================================ 准备页
        _drawPrepare(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const top = this._safeTop();
          const scrim = ctx.createLinearGradient(0, 0, 0, H);
          scrim.addColorStop(0, "rgba(10,32,46,0.55)");
          scrim.addColorStop(0.5, "rgba(10,32,46,0.34)");
          scrim.addColorStop(1, "rgba(8,26,40,0.62)");
          ctx.fillStyle = scrim;
          ctx.fillRect(0, 0, W, H);
          this._text("\u8BBE\u5907\u51C6\u5907", 24, top + 34, { size: 26, weight: "800", color: "#FFFFFF", shadow: true });
          this._text("\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A\uFF0C\u80F8\u5E26\u7ED5\u5230\u814B\u4E0B\u6700\u9AD8\u70B9\uFF0C\u56FA\u5B9A\u597D\u5C31\u80FD\u5F00\u59CB", 24, top + 58, {
            size: 12,
            weight: "500",
            color: "rgba(255,255,255,0.82)"
          });
          const cardW = W - 32;
          const cardX = 16;
          const wearH = Math.min(150, H * 0.2);
          const stackTop = top + 76;
          const stackBottom = H - 132;
          const stackH = 76 + 12 + wearH + 16 + 44;
          let cy = stackTop + Math.max(0, (stackBottom - stackTop - stackH) / 2);
          this._glass(cardX, cy, cardW, 76, 18);
          const connected = !vm.stale;
          ctx.beginPath();
          ctx.arc(cardX + 26, cy + 30, 5, 0, Math.PI * 2);
          ctx.fillStyle = vm.sim ? C.amber : connected ? C.teal : C.danger;
          ctx.fill();
          this._text("WT9011 \u4F20\u611F\u5668", cardX + 40, cy + 34, { size: 14, weight: "700", color: C.ink });
          let status = "\u672A\u8FDE\u63A5";
          if (vm.sim) status = "\u6A21\u62DF\u6A21\u5F0F\uFF08\u4E0D\u4F7F\u7528\u771F\u5B9E\u6570\u636E\uFF09";
          else if (connected) status = "\u5DF2\u8FDE\u63A5" + (vm.rateHz ? " \xB7 " + vm.rateHz + "Hz" : "");
          this._text(status, cardX + 40, cy + 54, {
            size: 12,
            weight: "500",
            color: connected && !vm.sim ? C.tealLight : C.inkMute
          });
          this._button(
            connected ? "refresh" : "connect",
            cardX + cardW - 92,
            cy + 22,
            76,
            32,
            connected ? "\u91CD\u65B0\u8FDE\u63A5" : "\u8FDE\u63A5\u8BBE\u5907",
            { variant: "ghost", size: 11.5 }
          );
          cy += 88;
          this._glass(cardX, cy, cardW, wearH, 18);
          this._text("\u4F69\u6234\u4F4D\u7F6E", cardX + 18, cy + 24, { size: 13, weight: "700", color: C.ink });
          this._drawWearFigure(cardX + 60, cy + wearH * 0.63, Math.min(94, wearH * 0.64));
          this._text("\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A\uFF0C", cardX + 118, cy + 46, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u5E26\u5B50\u4ECE\u814B\u4E0B\u6700\u9AD8\u70B9\u7ED5\u4E00\u5708\u56FA\u5B9A\u3002", cardX + 118, cy + 64, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u8EAB\u4F53\u4FDD\u6301\u81EA\u7136\u76F4\u7ACB\uFF0C", cardX + 118, cy + 88, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u4E0D\u8981\u523B\u610F\u633A\u80F8\u6216\u5C4F\u6C14\u3002", cardX + 118, cy + 106, { size: 11.5, weight: "500", color: C.inkSoft });
          cy += wearH + 16;
          const z = vm.zero || { roll: 0, pitch: 0, set: false };
          const fmtDeg = (v) => (v >= 0 ? "+" : "") + (Math.round(v * 10) / 10).toFixed(1) + "\xB0";
          this._glass(cardX, cy, cardW, 44, 14);
          if (z.set) {
            this._text("\u5F53\u524D\u96F6\u70B9 " + fmtDeg(z.roll) + " / " + fmtDeg(z.pitch), cardX + 18, cy + 27, {
              size: 12,
              weight: "500",
              color: C.inkSoft
            });
          } else {
            this._text("\u8FD8\u6CA1\u8BBE\u7F6E\u96F6\u70B9\uFF0C\u8BFB\u6570\u6309\u539F\u59CB\u89D2\u5EA6\u7B97", cardX + 18, cy + 27, {
              size: 12,
              weight: "500",
              color: C.amber
            });
          }
          this._linkButton("zero:set", cardX + cardW - 82, cy + 10, 68, 24, z.set ? "\u91CD\u8BBE" : "\u53BB\u6807\u5B9A");
          const btnH = 50;
          const by = H - 108;
          const bw = (W - 32 - 12) / 2;
          this._button("back", 16, by, bw, btnH, "\u8FD4\u56DE", { variant: "glass", icon: "back", size: 14 });
          const ready = connected || vm.sim;
          this._button("enter", 16 + bw + 12, by, bw, btnH, "\u8FDB\u5165\u6E38\u620F", {
            variant: "primary",
            icon: "play",
            size: 15,
            disabled: !ready
          });
          if (!ready) {
            this._text("\u8BF7\u5148\u8FDE\u63A5\u4F20\u611F\u5668\uFF0C\u6216\u6253\u5F00\u6A21\u62DF\u6570\u636E", W / 2, by + btnH + 18, {
              size: 11,
              weight: "500",
              color: "rgba(255,255,255,0.8)",
              align: "center"
            });
          }
          if (!vm.sim) {
            this._linkButton("sim:on", W - 112, top + 6, 96, 22, "\u7528\u6A21\u62DF\u6570\u636E");
          } else {
            this._linkButton("sim:off", W - 112, top + 6, 96, 22, "\u5173\u95ED\u6A21\u62DF");
          }
        }
        _drawWearFigure(x, y, h) {
          const ctx = this.ctx;
          const s = h / 100;
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(s, s);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          const body = "rgba(236,246,255,0.16)";
          const edge = "rgba(236,246,255,0.36)";
          ctx.strokeStyle = body;
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(-2, 2);
          ctx.lineTo(-9, 26);
          ctx.lineTo(-10, 40);
          ctx.moveTo(2, 2);
          ctx.lineTo(9, 26);
          ctx.lineTo(10, 40);
          ctx.stroke();
          ctx.lineWidth = 6.5;
          ctx.beginPath();
          ctx.moveTo(-13, -42);
          ctx.lineTo(-20, -24);
          ctx.lineTo(-24, -6);
          ctx.moveTo(13, -42);
          ctx.lineTo(20, -24);
          ctx.lineTo(24, -6);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-14, -46);
          ctx.quadraticCurveTo(-17, -26, -11, -8);
          ctx.quadraticCurveTo(-6, 0, 0, 1);
          ctx.quadraticCurveTo(6, 0, 11, -8);
          ctx.quadraticCurveTo(17, -26, 14, -46);
          ctx.quadraticCurveTo(0, -51, -14, -46);
          ctx.closePath();
          ctx.fillStyle = body;
          ctx.fill();
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = edge;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, -60, 10.5, 0, Math.PI * 2);
          ctx.fillStyle = body;
          ctx.fill();
          ctx.strokeStyle = edge;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(-13.5, -36);
          ctx.quadraticCurveTo(0, -34.6, 13.5, -36);
          ctx.lineTo(13.5, -30);
          ctx.quadraticCurveTo(0, -28.6, -13.5, -30);
          ctx.closePath();
          ctx.fillStyle = "rgba(236,246,255,0.26)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(236,246,255,0.34)";
          ctx.stroke();
          ctx.restore();
          ctx.beginPath();
          ctx.rect(-4.2, -35, 8.4, 5.2);
          ctx.fillStyle = C.amber;
          ctx.fill();
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = "rgba(255,255,255,0.95)";
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(2.4, -32.4, 0.8, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fill();
          ctx.restore();
        }
        // ================================================================ 结算页
        _drawResult(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const sum = this.engine.summary;
          if (!sum) return;
          ctx.fillStyle = "rgba(9,28,40,0.55)";
          ctx.fillRect(0, 0, W, H);
          const pw = Math.min(W - 28, 400);
          const px = (W - pw) / 2;
          const py = Math.max(this._safeTop() + 8, H * 0.045);
          const ph = Math.min(H - py - 30, 592);
          this._panel(px, py, pw, ph);
          const aborted = this.engine.state === "ABORTED";
          const gridX = px + 24;
          const gridW = pw - 48;
          const compact = ph < 500;
          const tight = !compact && ph < 566;
          let Y;
          if (compact) {
            Y = { score: 96, reason: 120, breakdown: 138, metrics: 158, mgap: 33, sway: 272, sgap: 13, note: 300, cond: 316, tiles: 0, inline: true };
          } else if (tight) {
            Y = { score: 100, reason: 124, breakdown: 142, metrics: 162, mgap: 34, sway: 278, sgap: 13, note: 362, cond: 378, tiles: 0, inline: false };
          } else {
            Y = { score: 112, reason: 136, breakdown: 154, metrics: 174, mgap: 38, sway: 302, sgap: 15, note: 398, cond: 414, tiles: 430, inline: false };
          }
          this._text(aborted ? "\u8BAD\u7EC3\u5DF2\u4E2D\u6B62" : "\u8BAD\u7EC3\u7ED3\u675F", gridX, py + 38, {
            size: 19,
            weight: "700",
            color: C.ink
          });
          this._text(
            sum.dataSource === "simulation" ? "\u6A21\u62DF\u6570\u636E \xB7 \u4EC5\u7528\u4E8E\u529F\u80FD\u9A8C\u8BC1" : "\u771F\u5B9E\u4F20\u611F\u5668\u6570\u636E",
            gridX,
            py + 58,
            {
              size: 10.5,
              weight: "600",
              color: sum.dataSource === "simulation" ? C.amber : C.tealDeep
            }
          );
          const gradeX = px + pw - 26;
          const gradeY = py + 44;
          this._text(sum.grade, gradeX, gradeY, { size: 34, weight: "800", color: C.amber, align: "right" });
          this._text("\u8BC4\u7EA7", gradeX, gradeY + 18, { size: 11, weight: "600", color: C.inkMute, align: "right" });
          let y = py + Y.score;
          const scoreStr = String(sum.score);
          this._text(scoreStr, gridX, y, { size: tight ? 34 : 40, weight: "800", color: C.ink });
          const sw = this._measure(scoreStr, tight ? 34 : 40, "800");
          this._text("\u5206", gridX + sw + 6, y, { size: 12, weight: "600", color: C.inkMute });
          const reasonText = sum.completed ? "\u8D70\u5B8C\u5168\u7A0B" : aborted ? "\u624B\u52A8\u7ED3\u675F" : "\u65F6\u95F4\u5230";
          this._text("\u8D70\u5B8C " + sum.distance.toFixed(1) + " / " + sum.trackLength + " \u7C73 \xB7 " + reasonText + " \xB7 " + this._fmtSec(sum.durationSec), gridX, py + Y.reason, {
            size: 10.5,
            weight: "500",
            color: C.inkSoft
          });
          const bd = sum.breakdown || {};
          this._text(
            "\u8DDD\u79BB " + (bd.distanceScore || 0) + " \xB7 \u7A33\u5B9A " + (bd.stableScore || 0) + " \xB7 \u5B8C\u6210 " + (bd.finishBonus || 0) + " \xB7 \u6263\u5206 " + (bd.penalty || 0),
            gridX,
            py + Y.breakdown,
            { size: 10, weight: "500", color: C.inkMute }
          );
          y = py + Y.metrics;
          const cellW = gridW / 2;
          const metrics = [
            { k: "\u5E73\u8861\u7A33\u5B9A\u65F6\u95F4", v: sum.stableSec.toFixed(1) + " \u79D2" },
            { k: "\u504F\u79BB\u6B21\u6570", v: sum.offCount + " \u6B21" },
            { k: "\u4FDD\u9669\u7EF3\u89E6\u53D1", v: sum.ropeTriggers + " \u6B21" },
            { k: "\u6700\u9AD8\u8FDE\u51FB", v: "x" + (bd.maxCombo || 0) },
            { k: "\u8F68\u8FF9\u957F\u5EA6\uFF08\u4EE3\u7406\uFF09", v: sum.pathLength.toFixed(1) },
            { k: "\u6570\u636E\u4E2D\u65AD", v: sum.interrupted ? sum.interruptedSec.toFixed(1) + " \u79D2" : "\u65E0" }
          ];
          metrics.forEach((m, i) => {
            const mx = gridX + i % 2 * cellW;
            const my = y + Math.floor(i / 2) * Y.mgap;
            this._text(m.k, mx, my + 11, { size: 10, weight: "500", color: C.inkMute });
            this._text(m.v, mx, my + 29, { size: 14, weight: "700", color: C.ink });
          });
          y = py + Y.sway;
          const rows = (sum.sway || []).slice(0, 5);
          if (Y.inline) {
            const brief = rows.filter((b) => (b.ratio || 0) > 5e-3).map((b) => b.label + " " + Math.round(clamp(b.ratio || 0, 0, 1) * 100) + "%").join(" \xB7 ") || "\u96C6\u4E2D\u5728\u6781\u5C0F\u5E45\u5EA6";
            this._text("\u6446\u52A8\u5206\u5E03", gridX, y, { size: 10, weight: "600", color: C.inkMute });
            this._text(brief, gridX, y + 16, { size: 9.5, weight: "500", color: C.inkSoft });
          } else {
            this._text("\u6446\u52A8\u5E45\u5EA6\u5206\u5E03\uFF08\u5F52\u4E00\u5316\uFF09", gridX, y, { size: 10, weight: "600", color: C.inkMute });
            rows.forEach((b, i) => {
              const ry = y + 14 + i * Y.sgap;
              const ratio = clamp(b.ratio || 0, 0, 1);
              this._text(b.label, gridX, ry + 6, { size: 9.5, weight: "500", color: C.inkMute });
              const tx = gridX + 44;
              const tw = gridW - 44 - 34;
              rr(ctx, tx, ry, tw, 6, 3);
              ctx.fillStyle = "rgba(255,255,255,0.12)";
              ctx.fill();
              if (ratio > 0.01) {
                rr(ctx, tx, ry, Math.max(3, tw * ratio), 6, 3);
                ctx.fillStyle = i >= 4 ? "rgba(206,86,62,0.80)" : i >= 2 ? "rgba(214,150,52,0.85)" : "rgba(94,150,102,0.90)";
                ctx.fill();
              }
              this._text(Math.round(ratio * 100) + "%", gridX + gridW, ry + 6, {
                size: 9.5,
                weight: "600",
                color: C.inkMute,
                align: "right"
              });
            });
          }
          this._text(gridW < 300 ? "\u8F68\u8FF9\u4E0E\u6446\u52A8\u4E3A\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u975E\u771F\u5B9E\u4F4D\u79FB\u3002" : "\u8F68\u8FF9\u4E0E\u6446\u52A8\u4E3A\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u4E0D\u662F\u771F\u5B9E\u4F4D\u79FB\uFF1B\u6210\u7EE9\u4EC5\u7528\u4E8E\u8BAD\u7EC3\u5BF9\u6BD4\u3002", gridX, py + Y.note, {
            size: 10.5,
            weight: "500",
            color: "rgba(243,235,221,0.46)"
          });
          const rc = sum.rangeConfig || {};
          this._text("\u5DE6\u53F3 \xB1" + rc.left + "\xB0 \xB7 \u524D\u540E \xB1" + rc.forward + "\xB0 \xB7 \u7075\u654F\u5EA6 " + rc.sensitivity + " \xB7 \u4FDD\u9669\u7EF3 " + (this.cfg.get("ropeEnabled") ? "\u5F00" : "\u5173"), gridX, py + Y.cond, {
            size: 10.5,
            weight: "500",
            color: "rgba(243,235,221,0.46)"
          });
          const bh2 = tight ? 40 : 44;
          const by = py + ph - bh2 - 16;
          this._button("again", gridX, by, gridW, bh2, "\u518D\u6765\u4E00\u5C40", { variant: "primary", icon: "refresh", size: 15 });
          const halfW = (gridW - 10) / 2;
          this._button("records", gridX, by - 44, halfW, 34, "\u8BAD\u7EC3\u8BB0\u5F55", { variant: "ghost", icon: "list", size: 12 });
          this._button("home", gridX + halfW + 10, by - 44, halfW, 34, "\u8FD4\u56DE\u9996\u9875", { variant: "ghost", icon: "home", size: 12 });
        }
        // ================================================================ 通用控件
        _text(str, x, y, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (opt.weight || "400") + " " + (opt.size || 12) + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          ctx.textAlign = opt.align || "left";
          ctx.textBaseline = opt.baseline || "alphabetic";
          if (opt.alpha !== void 0) ctx.globalAlpha = opt.alpha;
          if (opt.shadow) {
            ctx.shadowColor = "rgba(8,26,40,0.35)";
            ctx.shadowBlur = 8;
            ctx.shadowOffsetY = 1;
          }
          ctx.fillStyle = opt.color || C.ink;
          ctx.fillText(String(str), x, y);
          ctx.restore();
        }
        _measure(str, size, weight) {
          const ctx = this.ctx;
          ctx.save();
          ctx.font = (weight || "400") + " " + size + 'px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          const w = ctx.measureText(String(str)).width;
          ctx.restore();
          return w;
        }
        _vline(x, y, h) {
          const ctx = this.ctx;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + h);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.stroke();
        }
        _glass(x, y, w, h, r) {
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(2,8,14,0.42)";
          ctx.shadowBlur = 22;
          ctx.shadowOffsetY = 8;
          rr(ctx, x, y, w, h, r);
          ctx.fillStyle = C.card;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, r);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(226,238,248,0.14)";
          ctx.stroke();
        }
        _panel(x, y, w, h, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(2,8,14,0.55)";
          ctx.shadowBlur = 30;
          ctx.shadowOffsetY = 12;
          rr(ctx, x, y, w, h, 24);
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, "rgba(15,25,37,0.91)");
          g.addColorStop(1, "rgba(9,17,27,0.93)");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, 24);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(226,238,248,0.18)";
          ctx.stroke();
          if (opt.accent) {
            ctx.beginPath();
            ctx.moveTo(x + 24, y + 1);
            ctx.lineTo(x + w - 24, y + 1);
            ctx.lineWidth = 3;
            ctx.strokeStyle = opt.accent;
            ctx.globalAlpha = 0.65;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        _button(id, x, y, w, h, label, o) {
          const opt = o || {};
          const ctx = this.ctx;
          const disabled = !!opt.disabled;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          const scale = pressed ? 0.97 : 1;
          const cxp = x + w / 2;
          const cyp = y + h / 2;
          ctx.save();
          ctx.translate(cxp, cyp);
          ctx.scale(scale, scale);
          ctx.translate(-cxp, -cyp);
          const r = h / 2;
          if (opt.variant === "primary") {
            ctx.save();
            ctx.shadowColor = disabled ? "rgba(12,38,54,0.05)" : "rgba(164,98,26,0.30)";
            ctx.shadowBlur = disabled ? 2 : 14;
            ctx.shadowOffsetY = disabled ? 1 : 5;
            rr(ctx, x, y, w, h, r);
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            if (disabled) {
              g.addColorStop(0, "#CBD8DD");
              g.addColorStop(1, "#B9C8CE");
            } else {
              g.addColorStop(0, "#E8A24E");
              g.addColorStop(1, "#C4761F");
            }
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
          } else if (opt.variant === "glass") {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(20,34,52,0.34)" : "rgba(18,32,50,0.55)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.18)";
            ctx.stroke();
          } else {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(20,34,52,0.30)" : "rgba(18,32,50,0.58)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(226,238,248,0.20)";
            ctx.stroke();
          }
          const fg = opt.variant === "primary" ? "#2E1C06" : "#FFFFFF";
          const iconColor = fg;
          const size = opt.size || 14;
          const hasIcon = !!opt.icon;
          const textW = this._measure(label, size, "700");
          const iconW = hasIcon ? size + 8 : 0;
          const totalW = textW + iconW;
          const startX = cxp - totalW / 2;
          if (hasIcon) {
            this._icon(opt.icon, startX, cyp, size * 0.95, iconColor);
          }
          this._text(label, startX + iconW, cyp + size * 0.36, {
            size,
            weight: "700",
            color: fg
          });
          ctx.restore();
          if (!disabled) this.buttons.push({ id, x, y, w, h });
        }
        /** 圆形玻璃按钮：底部只放图标，不再用带文字的长胶囊 */
        _roundButton(id, x, y, d, icon) {
          const ctx = this.ctx;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          const s = pressed ? 0.94 : 1;
          const cxp = x + d / 2;
          const cyp = y + d / 2;
          ctx.save();
          ctx.translate(cxp, cyp);
          ctx.scale(s, s);
          ctx.translate(-cxp, -cyp);
          ctx.beginPath();
          ctx.arc(cxp, cyp, d / 2, 0, Math.PI * 2);
          ctx.fillStyle = pressed ? "rgba(40,62,86,0.80)" : "rgba(18,32,50,0.55)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(226,238,248,0.22)";
          ctx.stroke();
          ctx.restore();
          const isz = d * 0.42;
          this._icon(icon, cxp - isz / 2, cyp, isz, "#FFFFFF");
          this.buttons.push({ id, x, y, w: d, h: d });
        }
        _miniButton(id, x, y, w, h, label) {
          const ctx = this.ctx;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          rr(ctx, x, y, w, h, 10);
          ctx.fillStyle = pressed ? "rgba(196,118,31,0.92)" : "rgba(18,32,50,0.58)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = pressed ? "rgba(232,162,78,1)" : "rgba(226,238,248,0.20)";
          ctx.stroke();
          this._text(label, x + w / 2, y + h * 0.68, {
            size: 14,
            weight: "700",
            color: pressed ? "#FFFFFF" : C.inkSoft,
            align: "center"
          });
          this.buttons.push({ id, x, y, w, h });
        }
        _linkButton(id, x, y, w, h, label) {
          const ctx = this.ctx;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          rr(ctx, x, y, w, h, h / 2);
          ctx.fillStyle = pressed ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.16)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.stroke();
          this._text(label, x + w / 2, y + h * 0.68, {
            size: 11,
            weight: "600",
            color: "rgba(255,255,255,0.95)",
            align: "center"
          });
          this.buttons.push({ id, x, y, w, h });
        }
        /** 线性图标（与项目 Lucide 风格一致，纯路径绘制） */
        _icon(name, x, y, size, color) {
          const ctx = this.ctx;
          const s = size / 24;
          ctx.save();
          ctx.translate(x, y - size / 2);
          ctx.scale(s, s);
          ctx.strokeStyle = color;
          ctx.fillStyle = color;
          ctx.lineWidth = 2.1;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          if (name === "play") {
            ctx.moveTo(8, 5);
            ctx.lineTo(19, 12);
            ctx.lineTo(8, 19);
            ctx.closePath();
            ctx.fill();
          } else if (name === "pause") {
            ctx.moveTo(9, 5);
            ctx.lineTo(9, 19);
            ctx.moveTo(15, 5);
            ctx.lineTo(15, 19);
            ctx.stroke();
          } else if (name === "exit") {
            ctx.moveTo(14, 4);
            ctx.lineTo(6, 4);
            ctx.lineTo(6, 20);
            ctx.lineTo(14, 20);
            ctx.moveTo(13, 12);
            ctx.lineTo(21, 12);
            ctx.moveTo(18, 9);
            ctx.lineTo(21, 12);
            ctx.lineTo(18, 15);
            ctx.stroke();
          } else if (name === "back") {
            ctx.moveTo(15, 5);
            ctx.lineTo(8, 12);
            ctx.lineTo(15, 19);
            ctx.stroke();
          } else if (name === "gear") {
            ctx.arc(12, 12, 3.2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(12, 12, 7.2, 0, Math.PI * 2);
            ctx.stroke();
            for (let i = 0; i < 8; i++) {
              const a = i / 8 * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(12 + Math.cos(a) * 7.2, 12 + Math.sin(a) * 7.2);
              ctx.lineTo(12 + Math.cos(a) * 9.4, 12 + Math.sin(a) * 9.4);
              ctx.stroke();
            }
          } else if (name === "list") {
            ctx.moveTo(8, 6);
            ctx.lineTo(20, 6);
            ctx.moveTo(8, 12);
            ctx.lineTo(20, 12);
            ctx.moveTo(8, 18);
            ctx.lineTo(20, 18);
            ctx.moveTo(4.5, 6);
            ctx.lineTo(4.6, 6);
            ctx.moveTo(4.5, 12);
            ctx.lineTo(4.6, 12);
            ctx.moveTo(4.5, 18);
            ctx.lineTo(4.6, 18);
            ctx.stroke();
          } else if (name === "refresh") {
            ctx.arc(12, 12, 7, 0.6, 5.4);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(17.4, 4.6);
            ctx.lineTo(18.4, 9.2);
            ctx.lineTo(13.8, 8.2);
            ctx.stroke();
          } else if (name === "home") {
            ctx.moveTo(4, 11);
            ctx.lineTo(12, 4.5);
            ctx.lineTo(20, 11);
            ctx.moveTo(6.5, 10);
            ctx.lineTo(6.5, 19.5);
            ctx.lineTo(17.5, 19.5);
            ctx.lineTo(17.5, 10);
            ctx.stroke();
          } else if (name === "bluetooth") {
            ctx.moveTo(12, 3);
            ctx.lineTo(12, 21);
            ctx.lineTo(17, 16.5);
            ctx.lineTo(7, 7.5);
            ctx.moveTo(12, 3);
            ctx.lineTo(17, 7.5);
            ctx.lineTo(7, 16.5);
            ctx.stroke();
          } else if (name === "check") {
            ctx.moveTo(5, 12.5);
            ctx.lineTo(10, 17.5);
            ctx.lineTo(19, 7);
            ctx.stroke();
          }
          ctx.restore();
        }
        // ---------------------------------------------------------------- 临时提示
        showHint(text, color) {
          this.hint = { text, color: color || C.ink, at: this.nowMs || Date.now() };
        }
        /** 里程碑达成：居中飘字 + 暖光晕 + 脚下金尘（fx.drawGoldDust）。 */
        showMilestone(meters) {
          this.milestone = { m: meters, at: this.nowMs || Date.now() };
          this.goldBurst = {
            at: this.nowMs || Date.now(),
            x: this.L ? this.L.cx : 0,
            y: this._feetY || (this.L ? this.L.charY : 0)
          };
        }
        _drawMilestone() {
          const ms = this.milestone;
          if (!ms) return;
          const age = (this.nowMs || Date.now()) - ms.at;
          const life = 1700;
          if (age > life) {
            this.milestone = null;
            return;
          }
          const q = age / life;
          const alpha = q < 0.12 ? q / 0.12 : q > 0.7 ? (1 - q) / 0.3 : 1;
          const ctx = this.ctx;
          const W = this.W;
          const text = "\u5DF2\u8D70\u8FC7 " + ms.m + " \u7C73";
          const w = this._measure(text, 13, "700") + 46;
          const L = this.L;
          const base = Math.max(this._safeTop() + 150, L.charY - L.charH - 80);
          const y = base - q * 18;
          ctx.save();
          ctx.globalAlpha = clamp(alpha, 0, 1);
          const glow = ctx.createRadialGradient(W / 2, y + 10, 2, W / 2, y + 10, w * 0.62);
          glow.addColorStop(0, "rgba(255,186,96,0.26)");
          glow.addColorStop(1, "rgba(255,186,96,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(W / 2, y + 10, w * 0.62, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.font = '700 15px "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif';
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.lineWidth = 3.4;
          ctx.strokeStyle = "rgba(14,24,38,0.62)";
          ctx.lineJoin = "round";
          ctx.strokeText(text, W / 2, y + 12);
          ctx.fillStyle = "#FFE0A8";
          ctx.fillText(text, W / 2, y + 12);
          ctx.restore();
          ctx.restore();
        }
        _drawTransient() {
          const h = this.hint;
          if (!h) return;
          const age = (this.nowMs || Date.now()) - h.at;
          if (age > 1800) {
            this.hint = null;
            return;
          }
          const alpha = age < 1400 ? 1 : 1 - (age - 1400) / 400;
          const ctx = this.ctx;
          const W = this.W;
          const w = this._measure(h.text, 12, "600") + 32;
          const y = this._safeTop() + 132;
          ctx.save();
          ctx.globalAlpha = clamp(alpha, 0, 1);
          rr(ctx, (W - w) / 2, y, w, 28, 14);
          ctx.fillStyle = "rgba(19,41,58,0.82)";
          ctx.fill();
          this._text(h.text, W / 2, y + 18, { size: 12, weight: "600", color: "#FFFFFF", align: "center" });
          ctx.restore();
        }
        _safeTop() {
          try {
            const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
            const sb = info.statusBarHeight || 24;
            const cap = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
            const bottom = cap && cap.bottom ? cap.bottom + 8 : sb + 8;
            return Math.max(sb + 6, bottom);
          } catch (e) {
            return 40;
          }
        }
        _fmtSec(sec) {
          const s = Math.max(0, Math.round(sec || 0));
          const m = Math.floor(s / 60);
          return (m < 10 ? "0" + m : m) + ":" + (s % 60 < 10 ? "0" + s % 60 : s % 60);
        }
        // ---------------------------------------------------------------- 交互
        hitTest(x, y) {
          for (let i = this.buttons.length - 1; i >= 0; i--) {
            const b = this.buttons[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
          }
          return null;
        }
        markPress(id) {
          this.pressId = id;
          this.pressAt = this.nowMs || Date.now();
        }
      };
      module.exports = { WireRenderer: WireRenderer2, C };
    }
  });

  // tools/wire-preview/wx-stub.js
  function installWx() {
    if (typeof window === "undefined") return;
    const read = (k) => {
      try {
        const raw = window.localStorage.getItem("wireprev:" + k);
        return raw === null ? "" : JSON.parse(raw);
      } catch (e) {
        return "";
      }
    };
    const write = (k, v) => {
      try {
        window.localStorage.setItem("wireprev:" + k, JSON.stringify(v));
      } catch (e) {
      }
    };
    window.wx = {
      getStorageSync: read,
      setStorageSync: write,
      getWindowInfo: () => ({
        pixelRatio: Math.min(window.devicePixelRatio || 2, 2),
        statusBarHeight: 24,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight
      }),
      getMenuButtonBoundingClientRect: () => ({ top: 30, bottom: 62, left: window.innerWidth - 110, width: 90 }),
      createOffscreenCanvas: ({ width, height }) => {
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        return c;
      },
      // 角色已是纯矢量（character.js），wx.createImage 目前没有调用方。
      // 保留这个 stub：其他游戏（接水果）哪天换真贴图时，预览页还要靠它
      // 把包内绝对路径 /pkgWire/... 重写成浏览器可加载的相对路径。
      createImage: () => {
        const im = new Image();
        const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
        Object.defineProperty(im, "src", {
          set(v) {
            desc.set.call(im, String(v).replace(/^\//, "../../"));
          },
          get() {
            return desc.get.call(im);
          }
        });
        return im;
      },
      vibrateShort: () => {
      },
      setInnerAudioOption: () => {
      },
      createInnerAudioContext: () => ({
        play() {
        },
        pause() {
        },
        stop() {
        },
        destroy() {
        },
        seek() {
        },
        set src(v) {
        },
        set volume(v) {
        },
        set loop(v) {
        }
      })
    };
    window.getApp = () => ({ globalData: {} });
  }

  // tools/wire-preview/main.js
  installWx();
  var { getStore } = require_wire_config();
  var { WireEngine } = require_engine();
  var { WireRenderer } = require_renderer();
  var params = new URLSearchParams(window.location.search);
  var CSS_W = Math.max(280, Number(params.get("w")) || 390);
  var CSS_H = Math.max(480, Number(params.get("h")) || 844);
  var canvas = document.getElementById("stage");
  var dpr = Math.min(window.devicePixelRatio || 2, 2);
  var screenEl = document.querySelector(".screen");
  if (screenEl && /[?&]bare=1/.test(window.location.search)) {
    screenEl.style.width = CSS_W + "px";
    screenEl.style.height = CSS_H + "px";
  }
  var zoom = Number(params.get("zoom")) || 0;
  if (zoom > 0 && screenEl) {
    screenEl.style.transform = "scale(" + zoom + ")";
    screenEl.style.transformOrigin = "50% " + (params.get("zo") || "72") + "%";
  }
  canvas.width = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  canvas.style.width = CSS_W + "px";
  canvas.style.height = CSS_H + "px";
  var cfg = getStore();
  cfg.reset();
  if (params.get("char")) cfg.set("characterId", params.get("char"), "preview");
  var engine = new WireEngine({ cfg });
  engine.setSimMode(true);
  var renderer = new WireRenderer({
    canvas,
    ctx: canvas.getContext("2d"),
    engine,
    cfg
  });
  renderer.resize(CSS_W, CSS_H, dpr);
  function simulate(seconds, inputFn) {
    const dt = 1 / 60;
    const steps = Math.round(seconds / dt);
    for (let i = 0; i < steps; i++) {
      if (inputFn) inputFn((i + 1) * dt, i);
      engine.update(dt);
      engine.drainEvents();
    }
  }
  var scenario = (params.get("screen") || "").toLowerCase();
  if (scenario === "prepare") {
    engine.prepare();
    engine.calibrate();
  } else if (scenario === "play") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(9, (t) => engine.setSimTarget(Math.sin(t * 0.9) * 0.42, Math.sin(t * 0.4) * 0.2));
    }
  } else if (scenario === "rope") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(4, () => engine.setSimTarget(0.1, 0));
      simulate(2.4, () => engine.setSimTarget(0.97, 0.1));
    }
  } else if (scenario === "result") {
    engine.prepare();
    const r = engine.startCountdown();
    if (r.ok) {
      simulate(26, (t) => engine.setSimTarget(Math.sin(t * 0.7) * 0.35, Math.sin(t * 0.3) * 0.15));
      engine.finish("timeout");
    }
  }
  var wantDist = Number(params.get("dist")) || 0;
  if (wantDist > 0 && engine.state === "PLAYING") {
    let guard = 0;
    while (engine.distance < wantDist && guard < 3e4) {
      engine.setSimTarget(0, 0.25);
      engine.update(1 / 60);
      engine.drainEvents();
      guard++;
    }
  }
  var mileDemo = Number(params.get("mile")) || 0;
  var warnDemo = Number(params.get("warn")) || 0;
  var freeze = /[?&]freeze=1/.test(window.location.search);
  var last = 0;
  function loop(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1e3) : 1 / 60;
    last = ts;
    if (!freeze) engine.update(dt);
    const events = freeze ? [] : engine.drainEvents();
    events.forEach((ev) => {
      const gt = (d) => d < 0 ? "\u5F80\u5DE6\u538B\u4E00\u70B9" : d > 0 ? "\u5F80\u53F3\u538B\u4E00\u70B9" : "\u628A\u91CD\u5FC3\u6536\u56DE\u4E2D\u95F4";
      if (ev.type === "warn") renderer.showHint(gt(ev.guide), "#8FB8CE");
      if (ev.type === "rope:in") renderer.showHint("\u5DF2\u8D8A\u754C \xB7 " + gt(ev.guide) + "\uFF08\u81EA\u5DF1\u56DE\u6B63\u624D\u80FD\u7EE7\u7EED\u8D70\uFF09", "#B8792E");
      if (ev.type === "rope:out") renderer.showHint("\u56DE\u6B63\u4E86\uFF0C\u7EE7\u7EED\u8D70", "#0A7E72");
    });
    if (mileDemo > 0) {
      const at = Date.now() - 450;
      renderer.milestone = { m: mileDemo, at };
      renderer.goldBurst = {
        at,
        x: renderer.L.cx,
        y: renderer._feetY || renderer.L.charY
      };
    }
    if (warnDemo > 0) renderer.fx.warnGlow = Math.min(1, warnDemo);
    try {
      renderer.render(freeze ? 0 : dt, Date.now());
    } catch (err) {
      const el = document.getElementById("state");
      if (el) el.textContent = "RENDER ERROR: " + (err && err.message);
      document.title = "RENDER ERROR: " + (err && err.message);
      console.error(err);
      return;
    }
    updateStateText();
    const SPRITES = ["fox-walk-190", "char-rabbit", "char-panda"];
    Promise.all(SPRITES.map((n) => new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        (im.decode ? im.decode().catch(() => {
        }) : Promise.resolve()).then(() => res(true));
      };
      im.onerror = () => res(false);
      im.src = "../../assets/wire/" + n + ".png";
    }))).then(() => {
      last = 0;
      window.requestAnimationFrame(loop);
    });
  }
  window.requestAnimationFrame(loop);
  var STATE_TEXT = {
    IDLE: "\u4ECB\u7ECD\u9875",
    READY: "\u8BBE\u5907\u51C6\u5907\u9875",
    CALIBRATING: "\u6807\u5B9A\u4E2D",
    COUNTDOWN: "\u5012\u8BA1\u65F6",
    PLAYING: "\u6E38\u620F\u8FDB\u884C\u4E2D",
    PAUSED: "\u5DF2\u6682\u505C",
    SENSOR_ERROR: "\u4FE1\u53F7\u4E2D\u65AD",
    RESULT: "\u7ED3\u7B97\u9875",
    ABORTED: "\u5DF2\u4E2D\u6B62"
  };
  var DBG = /[?&]dbg=1/.test(window.location.search);
  function updateStateText() {
    if (DBG) {
      try {
        const cs = require_character_sprite();
        document.title = "DBG " + JSON.stringify(cs._debug());
      } catch (e) {
        document.title = "DBGERR " + e.message;
      }
    }
    const el = document.getElementById("state");
    if (!el) return;
    el.textContent = STATE_TEXT[engine.state] || engine.state;
    const score = document.getElementById("live");
    if (score) {
      score.textContent = "\u5F97\u5206 " + engine.score.total + " \xB7 \u5E73\u8861 " + engine.balance.toFixed(2) + " \xB7 \u4FDD\u9669\u7EF3 " + engine.safety.snapshot().short + " \xB7 " + engine.distance.toFixed(1) + "/" + cfg.get("trackLength") + "m";
    }
  }
  function bind(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("click", fn);
  }
  bind("btn-intro", () => engine.toIntro());
  bind("btn-prepare", () => {
    engine.prepare();
    engine.calibrate();
  });
  bind("btn-play", () => {
    engine.prepare();
    if (engine.state === "CALIBRATING") engine.cancelCalibration();
    const r = engine.startCountdown();
    if (r.ok) engine.countdown = 0.05;
  });
  bind("btn-rope", () => {
    if (engine.state !== "PLAYING") return;
    engine.setSimTarget(1, 0);
    syncSliders(1, 0);
  });
  bind("btn-pause", () => {
    if (engine.state === "PLAYING") engine.pause();
    else if (engine.state === "PAUSED") engine.resume();
  });
  bind("btn-result", () => {
    if (engine.state === "PLAYING" || engine.state === "PAUSED") engine.finish("timeout");
  });
  var sx = document.getElementById("sim-x");
  var sy = document.getElementById("sim-y");
  function syncSliders(x, y) {
    if (sx) sx.value = String(x);
    if (sy) sy.value = String(y);
    paintSlider();
  }
  function paintSlider() {
    const lx = document.getElementById("sim-x-val");
    const ly = document.getElementById("sim-y-val");
    if (lx) lx.textContent = Number(sx.value).toFixed(2);
    if (ly) ly.textContent = Number(sy.value).toFixed(2);
  }
  if (sx && sy) {
    const apply = () => {
      engine.setSimTarget(Number(sx.value), Number(sy.value));
      paintSlider();
    };
    sx.addEventListener("input", apply);
    sy.addEventListener("input", apply);
    paintSlider();
  }
  bind("btn-center", () => {
    syncSliders(0, 0);
    engine.setSimTarget(0, 0);
  });
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (CSS_W / rect.width);
    const y = (e.clientY - rect.top) * (CSS_H / rect.height);
    const id = renderer.hitTest(x, y);
    if (!id) return;
    renderer.markPress(id);
    handleAction(id);
  });
  function handleAction(id) {
    if (id === "start") {
      engine.prepare();
      return;
    }
    if (id === "back") {
      engine.toIntro();
      return;
    }
    if (id === "calibrate") {
      engine.calibrate();
      return;
    }
    if (id === "enter") {
      const r = engine.startCountdown();
      if (r.ok) engine.countdown = 0.05;
      return;
    }
    if (id === "pause") {
      engine.togglePause();
      return;
    }
    if (id === "resume") {
      engine.resume();
      return;
    }
    if (id === "again") {
      const r = engine.startCountdown();
      if (r.ok) engine.countdown = 0.05;
      return;
    }
    if (id === "sim:left") {
      engine.nudgeSim(-0.3, 0);
      return;
    }
    if (id === "sim:right") {
      engine.nudgeSim(0.3, 0);
      return;
    }
    if (id === "sim:up") {
      engine.nudgeSim(0, 0.3);
      return;
    }
    if (id === "sim:down") {
      engine.nudgeSim(0, -0.3);
      return;
    }
    if (id === "sim:center") {
      engine.centerSim();
      return;
    }
    if (id === "sim:rope") {
      engine.setSimTarget(1, engine.motion.ny);
      return;
    }
    if (id === "quit" || id === "exit") {
      engine.finish("aborted");
      return;
    }
    renderer.showHint("\u9884\u89C8\u9875\u4E0D\u8DF3\u8F6C\uFF1A" + id, "#3F586B");
  }
})();
