(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // utils/wire-config.js
  var require_wire_config = __commonJS({
    "utils/wire-config.js"(exports, module) {
      var STORAGE_KEY = "wire_cfg_v1";
      var SAVE_DELAY = 260;
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
          max: 200,
          step: 5,
          def: 40,
          tip: "\u6E38\u620F\u4E16\u754C\u5185\u7684\u524D\u8FDB\u91CC\u7A0B\uFF0C\u4E0D\u662F\u771F\u5B9E\u7A7A\u95F4\u4F4D\u79FB"
        },
        forwardSpeed: {
          group: "\u8BAD\u7EC3\u76EE\u6807",
          label: "\u524D\u8FDB\u901F\u5EA6",
          type: "num",
          unit: "\u7C73/\u79D2",
          min: 0.1,
          max: 2.5,
          step: 0.05,
          def: 0.5,
          tip: "\u5E73\u8861\u826F\u597D\u65F6\u6309\u6B64\u901F\u5EA6\u524D\u8FDB\uFF0C\u5931\u8861\u65F6\u81EA\u52A8\u51CF\u901F"
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
          tip: "\u56DE\u5230\u4E2D\u5FC3\u540E\u5E73\u8861\u503C\u56DE\u5347\u7684\u5FEB\u6162"
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
          tip: "\u504F\u79FB\u8D8A\u5927\u3001\u8D8A\u4E45\uFF0C\u5E73\u8861\u503C\u4E0B\u964D\u8D8A\u5FEB"
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
          label: "\u56DE\u62C9\u5F3A\u5EA6",
          type: "num",
          unit: "",
          min: 0,
          max: 1,
          step: 0.05,
          def: 0.6,
          tip: "\u4ECB\u5165\u65F6\u5BF9\u63A7\u5236\u91CF\u7684\u6291\u5236\u6BD4\u4F8B\uFF0C\u8D8A\u5927\u8D8A\u7A33"
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
        scorePerMeter: { group: "\u8BA1\u5206", label: "\u6BCF\u7C73\u524D\u8FDB\u5F97\u5206", type: "num", unit: "\u5206", min: 0, max: 20, step: 0.5, def: 4 },
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
      var GROUPS = ["\u96BE\u5EA6", "\u8BAD\u7EC3\u76EE\u6807", "\u4F53\u611F\u8F93\u5165", "\u6D3B\u52A8\u8FB9\u754C", "\u5E73\u8861\u6A21\u578B", "\u4FDD\u9669\u7EF3", "\u8BA1\u5206", "\u53CD\u9988"];
      var PRESETS = {
        1: {
          label: "\u7B2C 1 \u6863 \xB7 \u5165\u95E8",
          durationSec: 120,
          trackLength: 30,
          forwardSpeed: 0.4,
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
          trackLength: 40,
          forwardSpeed: 0.5,
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
          trackLength: 45,
          forwardSpeed: 0.62,
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
          trackLength: 50,
          forwardSpeed: 0.72,
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
          trackLength: 55,
          forwardSpeed: 0.82,
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
      function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
      }
      function num(v, def) {
        const n = Number(v);
        return isFinite(n) ? n : def;
      }
      function defaults() {
        const d = {};
        Object.keys(SCHEMA).forEach((k) => {
          d[k] = SCHEMA[k].def;
        });
        return d;
      }
      var DEFAULT_CONFIG = defaults();
      function coerce(key, value) {
        const meta = SCHEMA[key];
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
        v = clamp(v, meta.min, meta.max);
        if (meta.step) v = Math.round(v / meta.step) * meta.step;
        return Math.round(v * 1e3) / 1e3;
      }
      function validate(state) {
        const s = state || {};
        const errors = [];
        const warnings = [];
        if (!(s.durationSec >= 20 && s.durationSec <= HARD_LIMIT.duration)) {
          errors.push("\u8BAD\u7EC3\u65F6\u957F\u9700\u5728 20~300 \u79D2\u4E4B\u95F4");
        }
        if (!(s.trackLength >= 10)) errors.push("\u94A2\u4E1D\u957F\u5EA6\u9700\u4E0D\u5C0F\u4E8E 10 \u7C73");
        if (!(s.forwardSpeed > 0)) errors.push("\u524D\u8FDB\u901F\u5EA6\u9700\u5927\u4E8E 0");
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
      var WireConfigStore = class {
        constructor(opts) {
          const o = opts || {};
          this.key = o.storageKey || STORAGE_KEY;
          this.persistEnabled = o.persist !== false;
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
        /** 批量写入并广播；返回真正变化的键 */
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
        /** 套用 1~5 档预设（applyPreset=false 时只改档位数字） */
        applyDifficulty(level, applyPreset) {
          const lv = clamp(Math.round(num(level, 2)), 1, 5);
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
          const p = PRESETS[clamp(Math.round(num(level, 2)), 1, 5)];
          return p ? p.label : "";
        }
        validate() {
          return validate(this.state);
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
              console.error("[wire-config] listener", e);
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
          }, SAVE_DELAY);
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
      };
      var shared = null;
      function getStore2() {
        if (!shared) shared = new WireConfigStore();
        return shared;
      }
      module.exports = {
        WireConfigStore,
        getStore: getStore2,
        SCHEMA,
        GROUPS,
        PRESETS,
        DEFAULT_CONFIG,
        STORAGE_KEY,
        validate,
        coerce
      };
    }
  });

  // utils/zero.js
  var require_zero = __commonJS({
    "utils/zero.js"(exports, module) {
      var KEY = "wt_zero_v1";
      var DEF = { roll: 0, pitch: 0, set: false };
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
          state = { roll: wrap180(s.roll), pitch: wrap180(s.pitch), set: !!s.set };
        } else {
          state = { roll: DEF.roll, pitch: DEF.pitch, set: DEF.set };
        }
        syncApp(state);
        return state;
      }
      function get() {
        const s = load();
        return { roll: s.roll, pitch: s.pitch, set: s.set };
      }
      function set(roll, pitch) {
        state = {
          roll: round2(wrap180(Number(roll) || 0)),
          pitch: round2(wrap180(Number(pitch) || 0)),
          set: true
        };
        persist(state);
        syncApp(state);
        return get();
      }
      function reset() {
        state = { roll: 0, pitch: 0, set: false };
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
      module.exports = {
        get,
        set,
        reset,
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
          if (this.nx < -0.1) this.dir = "left";
          else if (this.nx > 0.1) this.dir = "right";
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

  // games/wire/safety.js
  var require_safety = __commonJS({
    "games/wire/safety.js"(exports, module) {
      var SAFETY_STATE = {
        IDLE: "IDLE",
        WARN: "WARN",
        ENGAGED: "ENGAGED",
        RECOVERING: "RECOVERING"
      };
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
        getStateLabel() {
          if (!this.enabled) return "\u5DF2\u5173\u95ED";
          if (this.state === SAFETY_STATE.ENGAGED) return "\u5DF2\u4ECB\u5165";
          if (this.state === SAFETY_STATE.RECOVERING) return "\u6B63\u5728\u89E3\u9664";
          if (this.state === SAFETY_STATE.WARN) return "\u5F85\u547D\uFF08\u9700\u56DE\u6B63\uFF09";
          return "\u5F85\u547D";
        }
        /** HUD 用的短文案 */
        getShortLabel() {
          if (!this.enabled) return "\u5173\u95ED";
          if (this.state === SAFETY_STATE.ENGAGED) return "\u5DF2\u4ECB\u5165";
          if (this.state === SAFETY_STATE.RECOVERING) return "\u89E3\u9664\u4E2D";
          return "\u5F85\u547D";
        }
        _push(type, extra) {
          this.events.push(Object.assign({ type, at: Date.now() }, extra || {}));
        }
        /**
         * @param {number} dt 秒
         * @param {number} load 原始归一化偏移（0~1），用未经过回拉抑制的值
         */
        update(dt, load) {
          const cfg2 = this.cfg;
          const now = Date.now();
          const step = Math.max(0, Math.min(0.1, Number(dt) || 0));
          this.events = [];
          this.enabled = !!cfg2.get("ropeEnabled");
          const warn = Number(cfg2.get("warnThreshold")) || 0.66;
          const trigger = Math.max(warn + 0.02, Number(cfg2.get("ropeTrigger")) || 0.88);
          const release = Math.min(trigger - 0.02, Number(cfg2.get("ropeRelease")) || 0.52);
          const holdMs = Number(cfg2.get("ropeHoldMs")) || 600;
          const cooldown = Number(cfg2.get("ropeCooldownMs")) || 1500;
          const v = Math.max(0, Math.min(1, Number(load) || 0));
          if (!this.enabled) {
            if (this.state !== SAFETY_STATE.IDLE) {
              this.state = SAFETY_STATE.IDLE;
              this._push("rope:off");
            }
            this.tension += (0 - this.tension) * Math.min(1, step * 4);
            if (v >= warn && !this._warned) {
              this._warned = true;
              this._push("warn", { load: v });
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
                  this._push("warn", { load: v });
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
          const target = this.state === SAFETY_STATE.ENGAGED ? 1 : this.state === SAFETY_STATE.RECOVERING ? 0.45 : 0;
          const rate = target > this.tension ? 5.5 : 2.2;
          this.tension += (target - this.tension) * Math.min(1, step * rate);
          this.tension = Math.max(0, Math.min(1, this.tension));
          return this;
        }
        _engage(now, load) {
          if (!this._warned) this._push("warn", { load });
          this.state = SAFETY_STATE.ENGAGED;
          this.triggers += 1;
          this._engagedStart = now;
          this._warned = true;
          this._push("rope:in", { load, count: this.triggers });
        }
        /** 介入时对控制量的抑制比例（0~1）：由回拉强度与当前张力决定 */
        getSuppression() {
          if (this.state !== SAFETY_STATE.ENGAGED) return 0;
          const pull = Math.max(0, Math.min(1, Number(this.cfg.get("ropePull")) || 0.6));
          return pull * (0.55 + 0.45 * this.tension);
        }
        snapshot() {
          const enabled = !!this.cfg.get("ropeEnabled");
          return {
            state: this.state,
            label: enabled ? this.getStateLabel() : "\u5DF2\u5173\u95ED",
            short: enabled ? this.getShortLabel() : "\u5173\u95ED",
            enabled,
            triggers: this.triggers,
            engagedSec: Math.round(this.engagedSec * 10) / 10,
            tension: Math.round(this.tension * 100) / 100
          };
        }
      };
      module.exports = { SafetyRope, SAFETY_STATE };
    }
  });

  // games/wire/score.js
  var require_score = __commonJS({
    "games/wire/score.js"(exports, module) {
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

  // games/wire/engine.js
  var require_engine = __commonJS({
    "games/wire/engine.js"(exports, module) {
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
        /** 进入设备准备页 */
        prepare() {
          this.setState(STATE.READY);
          this.motion.reset();
          this.calibrated = !!this.lastCalibration && this.lastCalibration.ok;
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
          const trackLength = Number(this.cfg.get("trackLength")) || 40;
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
              this.calibrated = !!this.lastCalibration.ok;
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
          this.safety.update(step, load);
          const ropeEvents = this.safety.events;
          for (let i = 0; i < ropeEvents.length; i++) {
            const ev = ropeEvents[i];
            if (ev.type === "warn") {
              this.offCount += 1;
              this._offActive = true;
              this._emit("warn", { dir: this.motion.dir, load });
            } else if (ev.type === "warnEnd") {
              this._offActive = false;
              this._emit("warnEnd");
            } else if (ev.type === "rope:in") {
              const penalty = Number(cfg2.get("penaltyScore")) || 0;
              if (penalty > 0) this.score.penaltyBy(penalty, "\u4FDD\u9669\u7EF3\u4ECB\u5165");
              this._emit("rope:in", { count: this.safety.triggers, dir: this.motion.dir });
            } else if (ev.type === "rope:out") {
              this._emit("rope:out");
            }
          }
          if (this._offActive) this.offSec += step;
          const suppression = this.safety.getSuppression();
          const effNx = nx * (1 - suppression);
          const effNy = ny * (1 - suppression * 0.5);
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
          if (this.safety.engaged) this.balance = Math.max(this.balance, 0.22);
          this.balance = clamp(this.balance, 0, 1);
          this.stable = effLoad < warn * 0.82 && this.balance > 0.55;
          const baseSpeed = Number(cfg2.get("forwardSpeed")) || 0.5;
          let speedFactor = 0.35 + 0.65 * this.balance;
          if (this.safety.engaged) speedFactor *= 0.5;
          if (this.balance < 0.18) speedFactor *= 0.35;
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
          const trackLength = Number(cfg2.get("trackLength")) || 40;
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
          const trackLength = Number(cfg2.get("trackLength")) || 40;
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

  // games/wire/character.js
  var require_character = __commonJS({
    "games/wire/character.js"(exports, module) {
      var PALETTE = {
        skin: "#F4C9A4",
        skinShade: "#E2B189",
        blush: "rgba(226, 116, 96, 0.22)",
        hair: "#3A2A26",
        hairLight: "#553D35",
        jacket: "#E4674A",
        jacketLight: "#F2896D",
        jacketDark: "#BF5038",
        collar: "#F2D9C9",
        pants: "#2E4157",
        pantsLight: "#3F5674",
        shoe: "#2B2C35",
        shoeSole: "#EFE3D5",
        harness: "#15897C",
        harnessLight: "#3BB6A5",
        metal: "#D3DDE6",
        outline: "rgba(52, 38, 34, 0.34)"
      };
      var BODY = {
        hipY: -66,
        chestY: -108,
        shoulderY: -136,
        neckY: -146,
        headCY: -167,
        headR: 20.5,
        hipHalf: 12.5,
        shoulderHalf: 23,
        legSpread: 5.4,
        armLen: 46,
        poleHalf: 68
      };
      function lerp(a, b, t) {
        return a + (b - a) * t;
      }
      function ellipse(ctx, x, y, rx, ry) {
        ctx.beginPath();
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(rx, ry);
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.restore();
      }
      function roundLine(ctx, x1, y1, x2, y2, width, color) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      function beltWorld(o) {
        const s = o.scale || 1;
        const lx = 0;
        const ly = BODY.chestY - 4;
        const lean = o.lean || 0;
        const cos = Math.cos(lean);
        const sin = Math.sin(lean);
        return {
          x: o.x + (lx * cos - ly * sin) * s,
          y: o.y + (lx * sin + ly * cos) * s
        };
      }
      function headWorld(o) {
        const s = o.scale || 1;
        const ly = BODY.headCY - BODY.headR;
        const lean = o.lean || 0;
        return {
          x: o.x - ly * Math.sin(lean) * s,
          y: o.y + ly * Math.cos(lean) * s
        };
      }
      function drawWalker(ctx, o) {
        const s = o.scale || 1;
        const lean = o.lean || 0;
        const phase = o.walkPhase || 0;
        const balance = typeof o.balance === "number" ? o.balance : 1;
        const tension = Math.max(0, Math.min(1, o.ropeTension || 0));
        const t = o.t || 0;
        const instability = Math.max(0, 1 - balance);
        const flail = instability * instability;
        const sway = Math.sin(t * 2.6) * flail * 2.6;
        const stepAmp = 1;
        const legA = Math.sin(phase) * stepAmp;
        const legB = Math.sin(phase + Math.PI) * stepAmp;
        const bob = -Math.abs(Math.sin(phase)) * 2.2;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.scale(s, s);
        ctx.save();
        ctx.globalAlpha = 0.26;
        ellipse(ctx, 0, 2.4, 17, 4.4);
        ctx.fillStyle = "#1B2A38";
        ctx.fill();
        ctx.restore();
        ctx.rotate(lean);
        ctx.translate(sway * 0.5, bob);
        const footL = {
          x: -BODY.legSpread + legA * 1.1,
          y: -Math.max(0, legA) * 6
        };
        const footR = {
          x: BODY.legSpread + legB * 1.1,
          y: -Math.max(0, legB) * 6 - 1.2
        };
        const kneeL = {
          x: lerp(-BODY.hipHalf, footL.x, 0.55) - 1.4 - Math.max(0, legA) * 1.8,
          y: BODY.hipY * 0.48 + footL.y * 0.45
        };
        const kneeR = {
          x: lerp(BODY.hipHalf, footR.x, 0.55) + 1.4 + Math.max(0, legB) * 1.8,
          y: BODY.hipY * 0.48 + footR.y * 0.45
        };
        drawLeg(ctx, BODY.hipHalf, BODY.hipY, kneeR, footR, true);
        drawArm(ctx, BODY.shoulderHalf, BODY.shoulderY, 1, phase + Math.PI, flail, tension, true);
        drawTorso(ctx, phase, balance);
        drawLeg(ctx, -BODY.hipHalf, BODY.hipY, kneeL, footL, false);
        drawHead(ctx, o, balance, t);
        drawPole(ctx, lean, phase, balance, tension);
        drawArm(ctx, -BODY.shoulderHalf, BODY.shoulderY, -1, phase, flail, tension, false);
        drawHarness(ctx, tension);
        ctx.restore();
      }
      function drawLeg(ctx, hipX, hipY, knee, foot, back) {
        const color = back ? PALETTE.pants : PALETTE.pantsLight;
        const w = back ? 10.5 : 11.5;
        roundLine(ctx, hipX, hipY, knee.x, knee.y, w, color);
        roundLine(ctx, knee.x, knee.y, foot.x, foot.y - 1, w - 1.5, color);
        ctx.save();
        ctx.translate(foot.x, foot.y);
        ctx.beginPath();
        ctx.moveTo(-7.5, 0);
        ctx.quadraticCurveTo(-8.5, -6, -3, -7);
        ctx.lineTo(4, -7);
        ctx.quadraticCurveTo(8.5, -6, 8.5, 0);
        ctx.quadraticCurveTo(0, 2.4, -7.5, 0);
        ctx.closePath();
        ctx.fillStyle = back ? "#25262E" : PALETTE.shoe;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-7, -0.6);
        ctx.quadraticCurveTo(0, 1.8, 7.8, -0.6);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = PALETTE.shoeSole;
        ctx.stroke();
        ctx.restore();
      }
      function drawTorso(ctx, phase, balance) {
        const hh = BODY.hipHalf;
        const sh = BODY.shoulderHalf;
        const top = BODY.shoulderY;
        const bottom = BODY.hipY + 6;
        ctx.beginPath();
        ctx.moveTo(-sh, top + 4);
        ctx.quadraticCurveTo(-sh - 1, top - 4, -sh * 0.62, top - 7);
        ctx.quadraticCurveTo(0, top - 9, sh * 0.62, top - 7);
        ctx.quadraticCurveTo(sh + 1, top - 4, sh, top + 4);
        ctx.quadraticCurveTo(sh * 0.95, BODY.chestY + 6, hh + 2, bottom - 6);
        ctx.quadraticCurveTo(0, bottom + 5, -hh - 2, bottom - 6);
        ctx.quadraticCurveTo(-sh * 0.95, BODY.chestY + 6, -sh, top + 4);
        ctx.closePath();
        const g = ctx.createLinearGradient(-sh, top, sh, bottom);
        g.addColorStop(0, PALETTE.jacketLight);
        g.addColorStop(0.45, PALETTE.jacket);
        g.addColorStop(1, PALETTE.jacketDark);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = PALETTE.outline;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, top - 4);
        ctx.lineTo(0, bottom + 1);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-7.5, top - 6);
        ctx.quadraticCurveTo(0, top + 3, 7.5, top - 6);
        ctx.lineWidth = 3;
        ctx.strokeStyle = PALETTE.collar;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-hh - 1, bottom - 3);
        ctx.quadraticCurveTo(0, bottom + 3, hh + 1, bottom - 3);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(120, 48, 32, 0.22)";
        ctx.stroke();
        void phase;
        void balance;
      }
      function drawArm(ctx, shoulderX, shoulderY, side, phase, flail, tension, back) {
        const swing = Math.sin(phase + (side > 0 ? Math.PI : 0)) * (2.2 + flail * 7);
        const lift = flail * 9 + tension * 6;
        const handX = shoulderX + side * (BODY.poleHalf * 0.34) + side * flail * 5;
        const handY = BODY.shoulderY + 26 - lift + swing * 0.4;
        const elbowX = shoulderX + side * (11 + flail * 4);
        const elbowY = shoulderY + 18 - lift * 0.4 + swing * 0.2;
        const w = back ? 8 : 9;
        roundLine(ctx, shoulderX, shoulderY + 2, elbowX, elbowY, w, back ? PALETTE.jacketDark : PALETTE.jacket);
        roundLine(ctx, elbowX, elbowY, handX, handY, w - 1.2, back ? PALETTE.jacketDark : PALETTE.jacket);
        ctx.beginPath();
        ctx.arc(handX, handY, 4.4, 0, Math.PI * 2);
        ctx.fillStyle = back ? PALETTE.skinShade : PALETTE.skin;
        ctx.fill();
      }
      function drawPole(ctx, lean, phase, balance, tension) {
        const y = BODY.shoulderY + 26 + tension * 5;
        const tilt = -lean * 0.55 + Math.sin(phase * 0.8) * 0.012;
        ctx.save();
        ctx.translate(0, y);
        ctx.rotate(tilt);
        const half = BODY.poleHalf;
        ctx.beginPath();
        ctx.moveTo(-half, 0);
        ctx.lineTo(half, 0);
        ctx.lineWidth = 4.2;
        ctx.lineCap = "round";
        const g = ctx.createLinearGradient(-half, -3, -half, 3);
        g.addColorStop(0, "#F5F9FC");
        g.addColorStop(0.5, "#C3D2DE");
        g.addColorStop(1, "#7E8E9C");
        ctx.strokeStyle = g;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-half + 6, -1.1);
        ctx.lineTo(half - 6, -1.1);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.stroke();
        [-half, half].forEach((x) => {
          ctx.beginPath();
          ctx.arc(x, 0, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = PALETTE.metal;
          ctx.fill();
          ctx.lineWidth = 0.9;
          ctx.strokeStyle = "rgba(60,72,84,0.5)";
          ctx.stroke();
        });
        ctx.restore();
        void balance;
      }
      function drawHead(ctx, o, balance, t) {
        const cy = BODY.headCY;
        const r = BODY.headR;
        roundLine(ctx, 0, BODY.neckY + 4, 0, BODY.shoulderY + 2, 9, PALETTE.skinShade);
        ctx.beginPath();
        ctx.arc(0, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.skin;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(180, 120, 92, 0.35)";
        ctx.stroke();
        ellipse(ctx, -r + 1, cy + 3, 3.2, 4.6);
        ctx.fillStyle = PALETTE.skinShade;
        ctx.fill();
        ellipse(ctx, r - 1, cy + 3, 3.2, 4.6);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, cy, r + 1.2, Math.PI * 0.98, Math.PI * 2.02);
        ctx.closePath();
        ctx.fillStyle = PALETTE.hair;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r * 1.02, cy - 1);
        ctx.quadraticCurveTo(-r * 0.5, cy - r * 1.05, r * 0.25, cy - r * 0.92);
        ctx.quadraticCurveTo(-r * 0.15, cy - r * 0.42, -r * 0.2, cy - 1.5);
        ctx.quadraticCurveTo(-r * 0.6, cy + 1, -r * 1.02, cy - 1);
        ctx.closePath();
        ctx.fillStyle = PALETTE.hairLight;
        ctx.fill();
        const worry = Math.max(0, 1 - balance);
        const happy = balance > 0.78;
        const eyeY = cy + 3;
        const eyeDx = 7.4;
        ctx.strokeStyle = "#2E2320";
        ctx.fillStyle = "#2E2320";
        ctx.lineCap = "round";
        if (happy) {
          ;
          [-1, 1].forEach((sgn) => {
            ctx.beginPath();
            ctx.moveTo(sgn * eyeDx - 3.1, eyeY + 1);
            ctx.quadraticCurveTo(sgn * eyeDx, eyeY - 2.6, sgn * eyeDx + 3.1, eyeY + 1);
            ctx.lineWidth = 1.7;
            ctx.stroke();
          });
        } else {
          const wide = 2.2 + worry * 1.5;
          [-1, 1].forEach((sgn) => {
            ellipse(ctx, sgn * eyeDx, eyeY, wide * 0.82, wide);
            ctx.fill();
            if (worry > 0.45) {
              ctx.beginPath();
              ctx.arc(sgn * eyeDx - 0.7, eyeY - 0.9, 0.9, 0, Math.PI * 2);
              ctx.fillStyle = "rgba(255,255,255,0.85)";
              ctx.fill();
              ctx.fillStyle = "#2E2320";
            }
          });
        }
        ctx.strokeStyle = PALETTE.hair;
        ctx.lineWidth = 1.5;
        [-1, 1].forEach((sgn) => {
          ctx.beginPath();
          const bx = sgn * eyeDx;
          const by = eyeY - 6.6 - worry * 1.2;
          ctx.moveTo(bx - 3.3, by + 0.9 - worry * 0.4);
          ctx.quadraticCurveTo(bx, by - 1.1, bx + 3.3, by + 0.3 + worry * 1.2);
          ctx.stroke();
        });
        ctx.beginPath();
        if (happy) {
          ctx.moveTo(-4, cy + 12);
          ctx.quadraticCurveTo(0, cy + 16, 4, cy + 12);
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = "#8C4B3F";
          ctx.stroke();
        } else if (worry > 0.55) {
          ellipse(ctx, 0, cy + 13.4, 2.5, 3);
          ctx.fillStyle = "#8C4B3F";
          ctx.fill();
        } else {
          ctx.moveTo(-3.4, cy + 13);
          ctx.quadraticCurveTo(0, cy + 14.6, 3.4, cy + 13);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = "#8C4B3F";
          ctx.stroke();
        }
        ellipse(ctx, -10.5, cy + 9, 4.4, 2.4);
        ctx.fillStyle = PALETTE.blush;
        ctx.fill();
        ellipse(ctx, 10.5, cy + 9, 4.4, 2.4);
        ctx.fill();
        if (worry > 0.7) {
          ctx.beginPath();
          ctx.moveTo(r * 0.86, cy - 6);
          ctx.quadraticCurveTo(r * 1.05, cy - 1, r * 0.86, cy + 2);
          ctx.quadraticCurveTo(r * 0.66, cy - 1, r * 0.86, cy - 6);
          ctx.fillStyle = "rgba(126, 197, 232, 0.9)";
          ctx.fill();
        }
        void o;
        void t;
      }
      function drawHarness(ctx, tension) {
        const top = BODY.shoulderY - 2;
        const midY = BODY.chestY + 6;
        ctx.save();
        ctx.lineWidth = 4;
        ctx.strokeStyle = tension > 0.2 ? PALETTE.harnessLight : PALETTE.harness;
        ctx.lineCap = "round";
        [-1, 1].forEach((sgn) => {
          ctx.beginPath();
          ctx.moveTo(sgn * BODY.shoulderHalf * 0.72, top);
          ctx.quadraticCurveTo(sgn * 9, midY - 8, sgn * 2.5, midY);
          ctx.stroke();
        });
        ctx.beginPath();
        ctx.moveTo(-BODY.hipHalf - 1, BODY.hipY + 1);
        ctx.quadraticCurveTo(0, BODY.hipY + 7, BODY.hipHalf + 1, BODY.hipY + 1);
        ctx.lineWidth = 3.4;
        ctx.strokeStyle = PALETTE.harness;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, midY, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = tension > 0.2 ? "#FFD48A" : PALETTE.metal;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(60, 60, 60, 0.35)";
        ctx.stroke();
        if (tension > 0.05) {
          ctx.beginPath();
          ctx.arc(0, midY, 5.2 + tension * 1.6, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(255, 212, 138, " + (0.18 + tension * 0.35) + ")";
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
        ctx.restore();
      }
      module.exports = {
        drawWalker,
        beltWorld,
        headWorld,
        PALETTE,
        BODY
      };
    }
  });

  // games/wire/renderer.js
  var require_renderer = __commonJS({
    "games/wire/renderer.js"(exports, module) {
      var { drawWalker, beltWorld } = require_character();
      var D = 5.2;
      var C = {
        ink: "#13293A",
        inkSoft: "#3F586B",
        inkMute: "#7A8FA1",
        teal: "#0F9C8C",
        tealDeep: "#0A7E72",
        tealLight: "#3FC3B0",
        amber: "#E39A32",
        danger: "#DF5540",
        white: "#FFFFFF",
        card: "rgba(255,255,255,0.97)",
        cardSoft: "rgba(255,255,255,0.66)",
        line: "rgba(19,41,58,0.09)"
      };
      var SKY = {
        top: "#7BC6EA",
        mid: "#B6E2F4",
        low: "#E8F5F4",
        glow: "rgba(255,246,222,0.95)",
        far: "#A8C7DC",
        midHill: "#8FB6CB",
        nearHill: "#7FA9A8",
        tree: "rgba(74,110,105,0.55)",
        valleyTop: "#E6F2EE",
        valleyBottom: "#C9DFE0"
      };
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
            farY: H * 0.352,
            // 脚底线：短屏时上移，保证底部平衡条不会压住脚
            charY: Math.min(H * 0.775, H - 170),
            charH,
            charScale: charH / 190,
            wireNearHalf: Math.max(3.2, W * 84e-4),
            corridor: Math.max(30, W * 0.1),
            horizonY: H * 0.335,
            safeTop: 0
          };
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
          this._drawBackground();
          this._drawWorld(vm, screen);
          this._updateFx(vm, dt);
          if (screen === "play") this._drawHud(vm);
          else if (screen === "intro") this._drawIntro(vm);
          else if (screen === "prepare") this._drawPrepare(vm);
          else this._drawResult(vm);
          this._drawTransient();
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
          const sky = g.createLinearGradient(0, 0, 0, hz + 30);
          sky.addColorStop(0, SKY.top);
          sky.addColorStop(0.55, SKY.mid);
          sky.addColorStop(1, SKY.low);
          g.fillStyle = sky;
          g.fillRect(0, 0, W, hz + 30);
          const sun = g.createRadialGradient(W * 0.2, H * 0.1, 4, W * 0.2, H * 0.1, W * 0.62);
          sun.addColorStop(0, "rgba(255,252,235,0.95)");
          sun.addColorStop(0.35, "rgba(255,248,225,0.35)");
          sun.addColorStop(1, "rgba(255,248,225,0)");
          g.fillStyle = sun;
          g.fillRect(0, 0, W, hz + 20);
          const band = g.createLinearGradient(0, hz - 46, 0, hz + 10);
          band.addColorStop(0, "rgba(255,244,220,0)");
          band.addColorStop(0.7, "rgba(255,240,210,0.55)");
          band.addColorStop(1, "rgba(255,248,230,0.9)");
          g.fillStyle = band;
          g.fillRect(0, hz - 46, W, 56);
          this._drawClouds(true);
        }
        /** 云：烘焙版画在传入的上下文；动态版画在主画布 */
        _drawClouds(baked) {
          const g = baked ? this._bgCtx : this.ctx;
          if (!g) return;
          const W = this.W;
          const H = this.H;
          const clouds = [
            { x: 0.13, y: 0.205, s: 0.78, a: 0.86 },
            { x: 0.79, y: 0.188, s: 0.62, a: 0.76 },
            { x: 0.33, y: 0.288, s: 0.4, a: 0.42 },
            { x: 0.63, y: 0.302, s: 0.32, a: 0.34 },
            { x: 0.96, y: 0.262, s: 0.36, a: 0.4 }
          ];
          clouds.forEach((c, i) => {
            this._cloudShape(g, W * c.x, H * c.y, Math.min(W, H) * 0.1 * c.s, c.a, i);
          });
        }
        _cloudShape(g, x, y, r, alpha, seed) {
          g.save();
          g.globalAlpha = alpha;
          g.fillStyle = "#FFFFFF";
          const puffs = [
            { dx: 0, dy: 0, rx: 1, ry: 0.66 },
            { dx: -0.78, dy: 0.14, rx: 0.66, ry: 0.46 },
            { dx: 0.76, dy: 0.16, rx: 0.6, ry: 0.42 },
            { dx: 0.2, dy: -0.26, rx: 0.62, ry: 0.5 }
          ];
          puffs.forEach((p, i) => {
            g.beginPath();
            g.ellipse ? g.ellipse(x + p.dx * r, y + p.dy * r, p.rx * r, p.ry * r, 0, 0, Math.PI * 2) : g.arc(x + p.dx * r, y + p.dy * r, p.rx * r, 0, Math.PI * 2);
            g.fill();
            void i;
          });
          g.globalAlpha = alpha * 0.45;
          g.fillStyle = "rgba(176,206,225,0.9)";
          g.beginPath();
          g.ellipse ? g.ellipse(x, y + r * 0.42, r * 1.16, r * 0.24, 0, 0, Math.PI * 2) : g.arc(x, y + r * 0.42, r * 1.16, 0, Math.PI * 2);
          g.fill();
          g.restore();
          void seed;
        }
        /** 远山：三层，越远越淡；山脊用正弦叠加，固定不漂移 */
        _paintHills(g) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          const ridge = (baseY, amp, color, freq, phase) => {
            g.beginPath();
            g.moveTo(-10, baseY);
            for (let x = -10; x <= W + 10; x += 8) {
              const t = x / W;
              const y = baseY - Math.sin(t * Math.PI * freq + phase) * amp - Math.sin(t * Math.PI * freq * 2.7 + phase * 1.7) * amp * 0.32 - Math.sin(t * Math.PI * freq * 0.6 + phase * 0.5) * amp * 0.4;
              g.lineTo(x, y);
            }
            g.lineTo(W + 10, hz + 8);
            g.lineTo(-10, hz + 8);
            g.closePath();
            g.fillStyle = color;
            g.fill();
          };
          ridge(hz - H * 0.012, H * 0.105, SKY.far, 1.5, 0.6);
          ridge(hz + 2, H * 0.062, SKY.midHill, 2.4, 2.1);
          ridge(hz + 10, H * 0.032, SKY.nearHill, 3.6, 4.4);
          const light = g.createLinearGradient(0, hz - H * 0.14, 0, hz);
          light.addColorStop(0, "rgba(255,255,255,0.22)");
          light.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = light;
          g.fillRect(0, hz - H * 0.16, W, H * 0.16);
        }
        _paintValley(g) {
          const W = this.W;
          const H = this.H;
          const hz = this.L.horizonY;
          const v = g.createLinearGradient(0, hz, 0, H);
          v.addColorStop(0, SKY.valleyTop);
          v.addColorStop(0.5, "#DCEBE9");
          v.addColorStop(1, SKY.valleyBottom);
          g.fillStyle = v;
          g.fillRect(0, hz, W, H - hz);
          for (let i = 0; i < 3; i++) {
            const y = hz + (H - hz) * (0.18 + i * 0.2);
            const grad = g.createLinearGradient(0, y - 40, 0, y + 40);
            grad.addColorStop(0, "rgba(255,255,255,0)");
            grad.addColorStop(0.5, "rgba(255,255,255," + (0.28 - i * 0.06) + ")");
            grad.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = grad;
            g.fillRect(0, y - 40, W, 80);
          }
          g.fillStyle = SKY.tree;
          for (let i = 0; i < 9; i++) {
            const x = (i + 0.5) * (W / 9) + Math.sin(i * 2.1) * 12;
            const y = hz + 10 + Math.cos(i * 1.7) * 4;
            const h = 12 + i % 3 * 5;
            g.beginPath();
            g.moveTo(x - 5, y);
            g.lineTo(x, y - h);
            g.lineTo(x + 5, y);
            g.closePath();
            g.fill();
          }
          const bottom = g.createLinearGradient(0, H * 0.72, 0, H);
          bottom.addColorStop(0, "rgba(28,58,74,0)");
          bottom.addColorStop(1, "rgba(28,58,74,0.16)");
          g.fillStyle = bottom;
          g.fillRect(0, H * 0.72, W, H * 0.28);
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
          ctx.save();
          ctx.setLineDash([7, 9]);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "rgba(255,255,255,0.34)";
          [-1, 1].forEach((side) => {
            ctx.beginPath();
            for (let i = 0; i <= 60; i++) {
              const p = -0.62 + i / 60 * 1.61;
              const x = cx + side * L.corridor * (1 - p);
              const y = L.charY - (L.charY - L.farY) * p;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.stroke();
          });
          ctx.restore();
          this._drawMarkers(dist);
          this._drawWire();
          this._drawRope(vm, screen, feetY, charScale);
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
          drawWalker(ctx, {
            x: L.cx + (idle ? Math.sin(this.clock * 0.7) * 1.2 : 0),
            y: feetY,
            scale: charScale,
            lean,
            walkPhase,
            balance,
            ropeTension: idle ? 0 : vm.ropeTension,
            speedRatio: idle ? 0 : clamp(vm.speed / 1.2, 0, 1),
            t: this.clock
          });
          if (screen === "play") this._drawSceneFx(vm);
        }
        _drawWire() {
          const ctx = this.ctx;
          const cx = this.L.cx;
          const L = this.L;
          const P0 = -0.62;
          const P1 = 0.995;
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
          grad.addColorStop(0, "#2C3944");
          grad.addColorStop(0.28, "#5A6B78");
          grad.addColorStop(0.45, "#F1F8FC");
          grad.addColorStop(0.58, "#7B8C99");
          grad.addColorStop(1, "#232E38");
          const bands = [
            [P0, 0.84, 1],
            [0.84, 0.92, 0.72],
            [0.92, 0.97, 0.46],
            [0.97, P1, 0.24]
          ];
          bands.forEach((band) => {
            const a = band[0];
            const b = band[1];
            const alpha = band[2];
            const n = Math.max(6, Math.round((b - a) * 60));
            const list = [];
            for (let i = 0; i <= n; i++) {
              const p = a + (b - a) * i / n;
              list.push(sample(p));
            }
            const midP = (a + b) / 2;
            ctx.save();
            ctx.globalAlpha = alpha;
            const rim = clamp((midP - 0.32) / 0.62, 0, 1) * 0.6;
            if (rim > 0.01) {
              const pad = 0.9 + 0.5 * (1 - midP);
              ctx.beginPath();
              for (let i = 0; i < list.length; i++) {
                const s = list[i];
                if (i === 0) ctx.moveTo(cx + s.half + pad, s.y);
                else ctx.lineTo(cx + s.half + pad, s.y);
              }
              for (let i = list.length - 1; i >= 0; i--) {
                const s = list[i];
                ctx.lineTo(cx - s.half - pad, s.y);
              }
              ctx.closePath();
              ctx.fillStyle = "rgba(38,56,72," + rim + ")";
              ctx.fill();
            }
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
              const s = list[i];
              if (i === 0) ctx.moveTo(cx + s.half, s.y);
              else ctx.lineTo(cx + s.half, s.y);
            }
            for (let i = list.length - 1; i >= 0; i--) {
              ctx.lineTo(cx - list[i].half, list[i].y);
            }
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.beginPath();
            for (let i = 0; i < list.length; i++) {
              const s = list[i];
              const h = s.half * 0.32;
              const x = cx - s.half * 0.26;
              if (i === 0) ctx.moveTo(x + h, s.y - s.half * 0.26);
              else ctx.lineTo(x + h, s.y - s.half * 0.26);
            }
            for (let i = list.length - 1; i >= 0; i--) {
              const s = list[i];
              const h = s.half * 0.32;
              const x = cx - s.half * 0.26;
              ctx.lineTo(x - h, s.y - s.half * 0.26);
            }
            ctx.closePath();
            ctx.fillStyle = "rgba(255,255,255,0.58)";
            ctx.fill();
            ctx.restore();
          });
          const scroll = (this.engine.distance || 0) * 6;
          ctx.save();
          ctx.lineCap = "round";
          for (let r = -2.05; r < 26; r += 0.55) {
            const rr2 = r - scroll % 0.55;
            if (rr2 < -2.05) continue;
            const d = this._depth(rr2);
            if (d.k < 0.16) continue;
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
        /** 是否处于“训练进行中”（用于决定场景里哪些辅助元素出现） */
        _isPlaying() {
          const s = this.engine && this.engine.state;
          return s === "PLAYING" || s === "PAUSED" || s === "COUNTDOWN";
        }
        _drawMarkers(distance) {
          const ctx = this.ctx;
          const L = this.L;
          const cx = L.cx;
          const trackLength = Number(this.cfg.get("trackLength")) || 40;
          const spacing = 5;
          for (let m = 0; m <= trackLength + spacing; m += spacing) {
            const r = m - distance;
            if (r < -1.2 || r > 30) continue;
            const d = this._depth(r);
            const k = d.k;
            if (k < 0.1) continue;
            const nearFade = r < 1.6 ? Math.max(0, r / 1.6) : 1;
            if (nearFade < 0.04) continue;
            const y = d.y;
            const isMilestone = m % 10 === 0;
            const side = isMilestone ? 1 : -1;
            const x = cx + side * (L.corridor * k * 1.06);
            const h = (isMilestone ? 34 : 20) * k;
            ctx.save();
            ctx.globalAlpha = clamp(k * 1.25, 0.15, 1) * nearFade;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - h);
            ctx.lineWidth = Math.max(0.8, 2.4 * k);
            ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.lineCap = "round";
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x, y - h);
            ctx.lineTo(x + side * 11 * k, y - h + 5 * k);
            ctx.lineTo(x, y - h + 10 * k);
            ctx.closePath();
            ctx.fillStyle = isMilestone ? "rgba(255,183,94,0.95)" : "rgba(120,214,199,0.95)";
            ctx.fill();
            if (isMilestone && k > 0.2 && r > 2.2 && this._isPlaying()) {
              const bw = 26 * k;
              const bh = 15 * k;
              const bx = x - bw / 2;
              const by = y - h - bh - 2 * k;
              rr(ctx, bx, by, bw, bh, 4 * k);
              ctx.fillStyle = "rgba(255,255,255,0.9)";
              ctx.fill();
              this._text(String(m), x, by + bh * 0.72, {
                size: Math.max(6, 10 * k),
                weight: "700",
                color: C.inkSoft,
                align: "center"
              });
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
          const anchorX = L.cx + this.W * 0.115;
          const anchorY = -18;
          const belt = beltWorld({
            x: L.cx,
            y: feetY === void 0 ? L.charY : feetY,
            scale: charScale === void 0 ? L.charScale : charScale,
            lean: screen === "play" ? vm.lean : 0
          });
          const slack = 1 - tension;
          const midX = (anchorX + belt.x) / 2 + 22 * slack;
          const midY = (anchorY + belt.y) / 2 + 30 * slack;
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(anchorX, anchorY);
            ctx.quadraticCurveTo(midX, midY, belt.x, belt.y);
          };
          if (tension > 0.05) {
            path();
            ctx.lineWidth = 5.5;
            ctx.strokeStyle = "rgba(255,205,120," + (0.14 + tension * 0.24) + ")";
            ctx.stroke();
          }
          path();
          ctx.lineWidth = 2.8;
          ctx.strokeStyle = "rgba(74,62,44," + (0.14 + tension * 0.16) + ")";
          ctx.stroke();
          path();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = tension > 0.3 ? "rgba(255,206,128,0.98)" : "rgba(247,238,216," + (0.72 - slack * 0.16) + ")";
          ctx.stroke();
          if (tension > 0.15) {
            ctx.save();
            path();
            ctx.setLineDash([2.5, 5]);
            ctx.lineWidth = 0.9;
            ctx.strokeStyle = "rgba(120,96,60," + (0.12 + tension * 0.24) + ")";
            ctx.stroke();
            ctx.restore();
          }
          ctx.beginPath();
          ctx.arc(belt.x, belt.y - 1, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = tension > 0.3 ? "rgba(255,214,140,1)" : "rgba(240,229,206,0.95)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(74,62,44,0.35)";
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
          if (warn > 0.02) {
            const left = ctx.createLinearGradient(0, 0, W * 0.22, 0);
            left.addColorStop(0, "rgba(226,85,60," + 0.2 * warn + ")");
            left.addColorStop(1, "rgba(226,85,60,0)");
            ctx.fillStyle = left;
            ctx.fillRect(0, H * 0.18, W * 0.22, H * 0.62);
            const right = ctx.createLinearGradient(W, 0, W * 0.78, 0);
            right.addColorStop(0, "rgba(226,85,60," + 0.2 * warn + ")");
            right.addColorStop(1, "rgba(226,85,60,0)");
            ctx.fillStyle = right;
            ctx.fillRect(W * 0.78, H * 0.18, W * 0.22, H * 0.62);
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
            ctx.lineWidth = 2.2;
            ctx.strokeStyle = "rgba(255,206,126," + 0.55 * rope + ")";
            ctx.stroke();
            ctx.save();
            ctx.translate(cxr, cyr);
            ctx.scale(rx * 1.06, ry * 1.06);
            ctx.beginPath();
            ctx.arc(0, 0, 1, 0, Math.PI * 2);
            ctx.restore();
            ctx.lineWidth = 7;
            ctx.strokeStyle = "rgba(255,206,126," + 0.14 * rope + ")";
            ctx.stroke();
            const label = "\u4FDD\u9669\u7EF3\u5DF2\u4ECB\u5165 \xB7 \u6B63\u5728\u6276\u7A33";
            const bw = this._measure(label, 13, "600") + 34;
            const bx = L.cx - bw / 2;
            const by = L.charY - L.charH * 1.16;
            rr(ctx, bx, by, bw, 26, 13);
            ctx.fillStyle = "rgba(255,238,206,0.94)";
            ctx.fill();
            ctx.strokeStyle = "rgba(227,154,50,0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();
            this._text(label, L.cx, by + 18, { size: 13, weight: "700", color: "#8A5A16", align: "center" });
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
          const barX = 14;
          const barW = W - 28;
          const barH = 54;
          this._glass(barX, top, barW, barH, 18);
          const secW = barW / 3;
          this._text("\u8D70\u94A2\u4E1D", barX + 16, top + 22, { size: 16, weight: "700", color: C.ink });
          const dl = "\u7B2C " + vm.difficulty + " \u6863";
          const dlw = this._measure(dl, 11, "600") + 14;
          rr(ctx, barX + 16, top + 31, dlw, 16, 8);
          ctx.fillStyle = "rgba(15,156,140,0.14)";
          ctx.fill();
          this._text(dl, barX + 16 + dlw / 2, top + 43, { size: 11, weight: "600", color: C.tealDeep, align: "center" });
          this._vline(barX + secW, top + 12, barH - 24);
          this._vline(barX + secW * 2, top + 12, barH - 24);
          this._text("\u5269\u4F59", barX + secW + 14, top + 20, { size: 11, weight: "500", color: C.inkMute });
          this._text(vm.timeLeftText, barX + secW + 14, top + 41, {
            size: 21,
            weight: "700",
            color: vm.timeLeft <= 10 ? C.danger : C.ink
          });
          this._text("\u5F97\u5206", barX + secW * 2 + 14, top + 20, { size: 11, weight: "500", color: C.inkMute });
          this._text(String(vm.score), barX + secW * 2 + 14, top + 41, { size: 21, weight: "700", color: C.tealDeep });
          const py = top + barH + 10;
          const pw = barW;
          const prog = clamp(vm.progress, 0, 1);
          rr(ctx, barX, py, pw, 6, 3);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fill();
          if (prog > 2e-3) {
            rr(ctx, barX, py, Math.max(6, pw * prog), 6, 3);
            const g = ctx.createLinearGradient(barX, 0, barX + pw, 0);
            g.addColorStop(0, "#43C3AF");
            g.addColorStop(1, "#0F9C8C");
            ctx.fillStyle = g;
            ctx.fill();
          }
          this._text(vm.distance.toFixed(1) + " / " + vm.trackLength + " \u7C73", barX, py + 22, {
            size: 11,
            weight: "600",
            color: C.inkSoft
          });
          const chips = [];
          if (vm.sim) chips.push({ t: "\u6A21\u62DF\u6570\u636E", bg: "rgba(227,154,50,0.92)", fg: "#FFF8EC" });
          else chips.push({ t: vm.stale ? "\u4FE1\u53F7\u4E2D\u65AD" : vm.rateHz ? vm.rateHz + "Hz" : "\u5DF2\u8FDE\u63A5", bg: "rgba(255,255,255,0.8)", fg: C.inkSoft });
          chips.push({
            t: "\u4FDD\u9669\u7EF3 " + (vm.rope.enabled ? vm.rope.label : "\u5173\u95ED"),
            bg: vm.rope.state === "ENGAGED" ? "rgba(227,154,50,0.94)" : "rgba(255,255,255,0.8)",
            fg: vm.rope.state === "ENGAGED" ? "#FFF8EC" : C.inkSoft
          });
          let chipX = W - 14;
          for (let i = chips.length - 1; i >= 0; i--) {
            const c = chips[i];
            const cw = this._measure(c.t, 11, "600") + 18;
            chipX -= cw;
            rr(ctx, chipX, py + 12, cw, 18, 9);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, chipX + cw / 2, py + 25, { size: 11, weight: "600", color: c.fg, align: "center" });
            chipX -= 6;
          }
          this._drawBalance(vm);
          const btnY = H - 62;
          const btnH = 46;
          this._button("pause", 16, btnY, 104, btnH, vm.state === "PAUSED" ? "\u7EE7\u7EED" : "\u6682\u505C", {
            variant: "glass",
            icon: vm.state === "PAUSED" ? "play" : "pause",
            size: 14
          });
          this._button("exit", W - 16 - 104, btnY, 104, btnH, "\u9000\u51FA", {
            variant: "glass",
            icon: "exit",
            size: 14
          });
          const fwd = vm.ny;
          const fwdText = fwd > 0.18 ? "\u524D\u503E +" + fwd.toFixed(1) : fwd < -0.18 ? "\u540E\u503E " + fwd.toFixed(1) : "\u91CD\u5FC3\u5C45\u4E2D";
          this._text(fwdText, W / 2, btnY + btnH * 0.62, {
            size: 13,
            weight: "600",
            color: C.inkSoft,
            align: "center"
          });
          if (vm.sim) this._drawSimPad(vm);
          if (vm.state === "PAUSED") this._drawPauseOverlay(vm);
          if (vm.state === "SENSOR_ERROR") this._drawSensorOverlay(vm);
          if (vm.state === "COUNTDOWN") this._drawCountdown(vm);
        }
        _drawBalance(vm) {
          const ctx = this.ctx;
          const W = this.W;
          const H = this.H;
          const barW = Math.min(W - 72, 420);
          const barX = (W - barW) / 2;
          const barY = H - 136;
          const barH = 20;
          const nx = clamp(vm.nx, -1, 1);
          const warn = clamp(vm.warnThreshold, 0.1, 0.95);
          let label = "\u5E73\u8861\u7A33\u5B9A";
          let color = C.tealDeep;
          if (vm.rope.state === "ENGAGED") {
            label = "\u4FDD\u9669\u7EF3\u4ECB\u5165 \xB7 \u5DF2\u6276\u7A33";
            color = "#9A6414";
          } else if (Math.abs(nx) >= warn) {
            label = nx < 0 ? "\u5411\u5DE6\u4FA7\u5931\u8861 \xB7 \u8BF7\u56DE\u6B63" : "\u5411\u53F3\u4FA7\u5931\u8861 \xB7 \u8BF7\u56DE\u6B63";
            color = C.danger;
          } else if (Math.abs(nx) >= warn * 0.6) {
            label = nx < 0 ? "\u8F7B\u5FAE\u5DE6\u504F" : "\u8F7B\u5FAE\u53F3\u504F";
            color = C.amber;
          } else if (vm.balance < 0.45) {
            label = "\u91CD\u5FC3\u4E0D\u7A33 \xB7 \u653E\u6162\u52A8\u4F5C";
            color = C.amber;
          }
          const lw = this._measure(label, 14, "700") + 26;
          const lh = 24;
          const ly = barY - 12 - lh / 2;
          rr(ctx, W / 2 - lw / 2, ly, lw, lh, lh / 2);
          ctx.fillStyle = "rgba(255,255,255,0.82)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(19,41,58,0.06)";
          ctx.stroke();
          this._text(label, W / 2, barY - 12, { size: 14, weight: "700", color, align: "center" });
          rr(ctx, barX, barY, barW, barH, barH / 2);
          ctx.fillStyle = "rgba(255,255,255,0.78)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(19,41,58,0.08)";
          ctx.stroke();
          const safeHalf = barW / 2 * warn * 0.82;
          rr(ctx, W / 2 - safeHalf, barY + 3, safeHalf * 2, barH - 6, (barH - 6) / 2);
          ctx.fillStyle = "rgba(63,195,176,0.24)";
          ctx.fill();
          const edge = barW / 2;
          [-1, 1].forEach((s) => {
            const x1 = W / 2 + s * safeHalf;
            const x2 = W / 2 + s * (edge - 2);
            const g = ctx.createLinearGradient(x1, 0, x2, 0);
            g.addColorStop(0, "rgba(227,154,50,0.05)");
            g.addColorStop(1, "rgba(223,85,64,0.22)");
            ctx.beginPath();
            ctx.moveTo(x1, barY + 3);
            ctx.lineTo(x2, barY + 3);
            ctx.lineTo(x2, barY + barH - 3);
            ctx.lineTo(x1, barY + barH - 3);
            ctx.closePath();
            ctx.fillStyle = g;
            ctx.fill();
          });
          ctx.beginPath();
          ctx.moveTo(W / 2, barY - 3);
          ctx.lineTo(W / 2, barY + barH + 3);
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = "rgba(19,41,58,0.25)";
          ctx.stroke();
          for (let i = -2; i <= 2; i++) {
            const x = W / 2 + i / 2 * (edge - 6);
            ctx.beginPath();
            ctx.moveTo(x, barY + barH - 1);
            ctx.lineTo(x, barY + barH + (i === 0 ? 5 : 3));
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(19,41,58,0.18)";
            ctx.stroke();
          }
          const mx = W / 2 + nx * (edge - 8);
          const my = barY + barH / 2;
          ctx.beginPath();
          ctx.arc(mx, my, 10, 0, Math.PI * 2);
          ctx.fillStyle = "#FFFFFF";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = Math.abs(nx) >= warn ? C.danger : Math.abs(nx) >= warn * 0.6 ? C.amber : C.teal;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(mx, my, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = Math.abs(nx) >= warn ? C.danger : C.teal;
          ctx.fill();
          this._text("\u5DE6", barX - 2, barY + barH - 5, { size: 11, weight: "600", color: C.inkMute, align: "right" });
          this._text("\u53F3", barX + barW + 2, barY + barH - 5, { size: 11, weight: "600", color: C.inkMute });
        }
        _drawSimPad(vm) {
          const W = this.W;
          const H = this.H;
          const x = 12;
          const y0 = Math.max(this._safeTop() + 108, H * 0.33);
          const bw = 44;
          const short = H < 680;
          const bh = short ? 30 : 34;
          const gap = short ? 5 : 6;
          const items = [
            { id: "sim:left", t: "\u2190", label: "\u5DE6" },
            { id: "sim:right", t: "\u2192", label: "\u53F3" },
            { id: "sim:up", t: "\u2191", label: "\u524D" },
            { id: "sim:down", t: "\u2193", label: "\u540E" },
            { id: "sim:center", t: "\u25CE", label: "\u56DE\u4E2D" },
            { id: "sim:rope", t: "\u2691", label: "\u89E6\u53D1\u7EF3\u7D22" }
          ];
          items.forEach((it, i) => {
            const y = y0 + i * (bh + gap);
            this._miniButton(it.id, x, y, bw, bh, it.t);
            this._text(it.label, x + bw + 6, y + bh * 0.66, { size: 10, weight: "600", color: "rgba(19,41,58,0.55)" });
          });
          this._text("\u6A21\u62DF", x + 2, y0 - 8, { size: 10, weight: "700", color: "rgba(19,41,58,0.45)" });
          void vm;
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
          void vm;
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
          const chips = [];
          chips.push({
            t: vm.sim ? "\u6A21\u62DF\u6570\u636E" : vm.stale ? "\u4F20\u611F\u5668\u672A\u8FDE\u63A5" : "\u4F20\u611F\u5668\u5DF2\u8FDE\u63A5",
            fg: vm.sim ? "#FFF6E6" : "#FFFFFF",
            bg: vm.sim ? "rgba(227,154,50,0.92)" : vm.stale ? "rgba(19,41,58,0.5)" : "rgba(15,156,140,0.9)"
          });
          chips.push({ t: "\u65F6\u957F " + (Number(this.cfg.get("durationSec")) || 90) + " \u79D2", fg: C.inkSoft, bg: "rgba(255,255,255,0.86)" });
          chips.push({ t: "\u91CC\u7A0B " + (Number(this.cfg.get("trackLength")) || 40) + " \u7C73", fg: C.inkSoft, bg: "rgba(255,255,255,0.86)" });
          let cx0 = W / 2 - 4;
          const chipYs = H * 0.215 + 48;
          const widths = chips.map((c) => this._measure(c.t, 11, "600") + 20);
          const totalW = widths.reduce((a, b) => a + b, 0) + (chips.length - 1) * 8;
          cx0 = (W - totalW) / 2;
          chips.forEach((c, i) => {
            rr(ctx, cx0, chipYs, widths[i], 22, 11);
            ctx.fillStyle = c.bg;
            ctx.fill();
            this._text(c.t, cx0 + widths[i] / 2, chipYs + 15, { size: 11, weight: "600", color: c.fg, align: "center" });
            cx0 += widths[i] + 8;
          });
          const cardY = chipYs + 36;
          const cardW = Math.min(W - 40, 380);
          const cardX = (W - cardW) / 2;
          const cardH = 126;
          this._glass(cardX, cardY, cardW, cardH, 20);
          const rules = [
            { t: "\u8EAB\u4F53\u5C45\u4E2D\uFF0C\u89D2\u8272\u624D\u8D70\u5F97\u7A33", d: "\u8EAB\u4F53\u5DE6\u53F3\u504F\u79FB\u4F1A\u5E26\u52A8\u89D2\u8272\u503E\u659C" },
            { t: "\u5931\u8861\u65F6\u4E0D\u8981\u6025\uFF0C\u6162\u6162\u56DE\u6B63", d: "\u504F\u79FB\u8D8A\u5927\u8D8A\u4E45\uFF0C\u5E73\u8861\u6062\u590D\u8D8A\u6162" },
            { t: "\u4FDD\u9669\u7EF3\u4F1A\u4FDD\u62A4\u4F60", d: "\u8D8A\u754C\u65F6\u7EF3\u7D22\u8F7B\u62C9\u56DE\u4E2D\u7EBF\uFF0C\u4E0D\u4F1A\u76F4\u63A5\u5931\u8D25" }
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
          this._text("\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A\uFF0C\u80F8\u5E26\u7ED5\u5230\u814B\u4E0B\u6700\u9AD8\u70B9\uFF0C\u6807\u5B9A\u540E\u5373\u53EF\u5F00\u59CB", 24, top + 58, {
            size: 12,
            weight: "500",
            color: "rgba(255,255,255,0.82)"
          });
          const cardW = W - 32;
          const cardX = 16;
          let cy = top + 76;
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
            size: 11.5,
            weight: "500",
            color: connected && !vm.sim ? C.tealDeep : C.inkMute
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
          const wearH = Math.min(150, H * 0.2);
          this._glass(cardX, cy, cardW, wearH, 18);
          this._text("\u4F69\u6234\u4F4D\u7F6E", cardX + 18, cy + 24, { size: 13, weight: "700", color: C.ink });
          this._drawWearFigure(cardX + 60, cy + wearH * 0.63, Math.min(94, wearH * 0.64));
          this._text("\u4F20\u611F\u5668\u5361\u5728\u80F8\u5E26\u4E0A\uFF0C", cardX + 118, cy + 46, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u5E26\u5B50\u4ECE\u814B\u4E0B\u6700\u9AD8\u70B9\u7ED5\u4E00\u5708\u56FA\u5B9A\u3002", cardX + 118, cy + 64, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u8EAB\u4F53\u4FDD\u6301\u81EA\u7136\u76F4\u7ACB\uFF0C", cardX + 118, cy + 88, { size: 11.5, weight: "500", color: C.inkSoft });
          this._text("\u4E0D\u8981\u523B\u610F\u633A\u80F8\u6216\u5C4F\u6C14\u3002", cardX + 118, cy + 106, { size: 11.5, weight: "500", color: C.inkSoft });
          cy += wearH + 12;
          const calH = 96;
          this._glass(cardX, cy, cardW, calH, 18);
          this._text("\u96F6\u70B9\u6807\u5B9A", cardX + 18, cy + 24, { size: 13, weight: "700", color: C.ink });
          const cal = vm.calibration;
          let calText = "\u4FDD\u6301\u9759\u6B62 3 \u79D2\uFF0C\u628A\u5F53\u524D\u59FF\u52BF\u8BB0\u4E3A\u4E2D\u7ACB\u4F4D";
          let calColor = C.inkMute;
          if (vm.state === "CALIBRATING") {
            calText = "\u6B63\u5728\u91C7\u6837\u2026 \u8BF7\u4FDD\u6301\u4E0D\u52A8";
            calColor = C.amber;
          } else if (cal && cal.ok) {
            calText = cal.simulated ? "\u6A21\u62DF\u6A21\u5F0F\uFF1A\u5DF2\u8DF3\u8FC7\u771F\u5B9E\u6807\u5B9A" : "\u6807\u5B9A\u6210\u529F\uFF0C\u53EF\u4EE5\u5F00\u59CB\u8BAD\u7EC3";
            calColor = C.tealDeep;
          } else if (cal && cal.ok === false) {
            calText = cal.message || "\u6807\u5B9A\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5";
            calColor = C.danger;
          }
          this._text(calText, cardX + 18, cy + 48, { size: 11.5, weight: "500", color: calColor });
          if (vm.state === "CALIBRATING") {
            const pw = cardW - 36 - 96;
            rr(ctx, cardX + 18, cy + 60, pw, 8, 4);
            ctx.fillStyle = "rgba(19,41,58,0.08)";
            ctx.fill();
            rr(ctx, cardX + 18, cy + 60, Math.max(4, pw * vm.calibrationProgress), 8, 4);
            ctx.fillStyle = C.amber;
            ctx.fill();
            this._text(Math.round(vm.calibrationProgress * 100) + "%", cardX + 18 + pw + 12, cy + 68, {
              size: 11,
              weight: "600",
              color: C.amber
            });
            this._button("cal:cancel", cardX + cardW - 84, cy + 44, 68, 30, "\u53D6\u6D88", { variant: "ghost", size: 11.5 });
          } else {
            this._button(
              "calibrate",
              cardX + cardW - 96,
              cy + 40,
              80,
              32,
              cal && cal.ok ? "\u91CD\u65B0\u6807\u5B9A" : "\u5F00\u59CB\u6807\u5B9A",
              { variant: "ghost", size: 11.5 }
            );
            this._text("\u6807\u5B9A\u7ED3\u679C\u4EC5\u7528\u4E8E\u672C\u673A\u6E38\u620F\u63A7\u5236\uFF0C\u4E0D\u4EE3\u8868\u4E34\u5E8A\u8BC4\u4F30", cardX + 18, cy + calH - 14, {
              size: 10,
              weight: "500",
              color: "rgba(19,41,58,0.4)"
            });
          }
          const btnH = 50;
          const by = H - 108;
          const bw = (W - 32 - 12) / 2;
          this._button("back", 16, by, bw, btnH, "\u8FD4\u56DE", { variant: "glass", icon: "back", size: 14 });
          const ready = (connected || vm.sim) && (vm.calibrated || vm.sim);
          this._button("enter", 16 + bw + 12, by, bw, btnH, "\u8FDB\u5165\u6E38\u620F", {
            variant: "primary",
            icon: "play",
            size: 15,
            disabled: !ready
          });
          if (!ready) {
            this._text(connected || vm.sim ? "\u8BF7\u5148\u5B8C\u6210\u96F6\u70B9\u6807\u5B9A" : "\u8BF7\u5148\u8FDE\u63A5\u4F20\u611F\u5668\uFF0C\u6216\u6253\u5F00\u6A21\u62DF\u6570\u636E", W / 2, by + btnH + 18, {
              size: 11,
              weight: "500",
              color: "rgba(255,255,255,0.8)",
              align: "center"
            });
          }
          if (!vm.sim) {
            this._linkButton("sim:on", W - 116, top + 26, 100, 24, "\u7528\u6A21\u62DF\u6570\u636E");
          } else {
            this._linkButton("sim:off", W - 116, top + 26, 100, 24, "\u5173\u95ED\u6A21\u62DF");
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
          const body = "rgba(19,41,58,0.16)";
          const edge = "rgba(19,41,58,0.32)";
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
          ctx.fillStyle = "rgba(19,41,58,0.24)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(19,41,58,0.3)";
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
          const ringX = px + pw - 56;
          const ringY = py + 50;
          this._gradeRing(ringX, ringY, 24, sum.grade);
          this._text(sum.grade, ringX, ringY + 1, {
            size: 19,
            weight: "800",
            color: C.tealDeep,
            align: "center"
          });
          this._text("\u6E38\u620F\u8BC4\u7EA7", ringX, ringY + 40, { size: 9, weight: "600", color: C.inkMute, align: "center" });
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
              this._text(b.label, gridX, ry + 6, { size: 8.5, weight: "500", color: C.inkMute });
              const tx = gridX + 44;
              const tw = gridW - 44 - 34;
              rr(ctx, tx, ry, tw, 6, 3);
              ctx.fillStyle = "rgba(19,41,58,0.06)";
              ctx.fill();
              if (ratio > 0.01) {
                rr(ctx, tx, ry, Math.max(3, tw * ratio), 6, 3);
                ctx.fillStyle = i >= 4 ? "rgba(223,85,64,0.75)" : i >= 2 ? "rgba(227,154,50,0.75)" : "rgba(63,195,176,0.85)";
                ctx.fill();
              }
              this._text(Math.round(ratio * 100) + "%", gridX + gridW, ry + 6, {
                size: 8.5,
                weight: "600",
                color: C.inkMute,
                align: "right"
              });
            });
          }
          this._text(gridW < 300 ? "\u8F68\u8FF9\u4E0E\u6446\u52A8\u4E3A\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u975E\u771F\u5B9E\u4F4D\u79FB\u3002" : "\u8F68\u8FF9\u4E0E\u6446\u52A8\u4E3A\u59FF\u6001\u4EE3\u7406\u6307\u6807\uFF0C\u4E0D\u662F\u771F\u5B9E\u4F4D\u79FB\uFF1B\u6210\u7EE9\u4EC5\u7528\u4E8E\u8BAD\u7EC3\u5BF9\u6BD4\u3002", gridX, py + Y.note, {
            size: 9,
            weight: "500",
            color: "rgba(19,41,58,0.42)"
          });
          const rc = sum.rangeConfig || {};
          this._text("\u5DE6\u53F3 \xB1" + rc.left + "\xB0 \xB7 \u524D\u540E \xB1" + rc.forward + "\xB0 \xB7 \u7075\u654F\u5EA6 " + rc.sensitivity + " \xB7 \u4FDD\u9669\u7EF3 " + (this.cfg.get("ropeEnabled") ? "\u5F00" : "\u5173"), gridX, py + Y.cond, {
            size: 9,
            weight: "500",
            color: "rgba(19,41,58,0.42)"
          });
          if (Y.tiles) {
            const tiles = [
              { k: "\u8DDD\u79BB\u5206", v: bd.distanceScore || 0 },
              { k: "\u7A33\u5B9A\u5206", v: bd.stableScore || 0 },
              { k: "\u5B8C\u6210\u5956\u52B1", v: bd.finishBonus || 0 },
              { k: "\u6263\u5206", v: bd.penalty || 0 }
            ];
            const tileW = (gridW - 9 * 3) / 4;
            const tileY = py + Y.tiles;
            tiles.forEach((t, i) => {
              const tx = gridX + i * (tileW + 9);
              rr(ctx, tx, tileY, tileW, 42, 10);
              ctx.fillStyle = "rgba(19,41,58,0.035)";
              ctx.fill();
              this._text(String(t.v), tx + tileW / 2, tileY + 20, {
                size: 14,
                weight: "700",
                color: i === 3 ? C.inkMute : C.ink,
                align: "center"
              });
              this._text(t.k, tx + tileW / 2, tileY + 34, {
                size: 8.5,
                weight: "500",
                color: C.inkMute,
                align: "center"
              });
            });
          }
          const bh2 = tight ? 40 : 44;
          const by = py + ph - bh2 - 16;
          this._button("again", gridX, by, gridW, bh2, "\u518D\u6765\u4E00\u5C40", { variant: "primary", icon: "refresh", size: 15 });
          const halfW = (gridW - 10) / 2;
          this._button("records", gridX, by - 44, halfW, 34, "\u8BAD\u7EC3\u8BB0\u5F55", { variant: "ghost", icon: "list", size: 12 });
          this._button("home", gridX + halfW + 10, by - 44, halfW, 34, "\u8FD4\u56DE\u9996\u9875", { variant: "ghost", icon: "home", size: 12 });
        }
        _gradeRing(x, y, r, grade) {
          const ctx = this.ctx;
          const ratio = grade === "S" ? 0.95 : grade === "A" ? 0.75 : grade === "B" ? 0.55 : 0.32;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.lineWidth = 5;
          ctx.strokeStyle = "rgba(15,156,140,0.12)";
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
          ctx.lineWidth = 5;
          ctx.lineCap = "round";
          ctx.strokeStyle = C.teal;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, y, r - 9, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(15,156,140,0.07)";
          ctx.fill();
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
          ctx.strokeStyle = "rgba(19,41,58,0.07)";
          ctx.stroke();
        }
        _glass(x, y, w, h, r) {
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(12,38,54,0.10)";
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 4;
          rr(ctx, x, y, w, h, r);
          ctx.fillStyle = C.card;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, r);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.75)";
          ctx.stroke();
        }
        _panel(x, y, w, h, o) {
          const opt = o || {};
          const ctx = this.ctx;
          ctx.save();
          ctx.shadowColor = "rgba(6,22,34,0.3)";
          ctx.shadowBlur = 26;
          ctx.shadowOffsetY = 10;
          rr(ctx, x, y, w, h, 24);
          const g = ctx.createLinearGradient(0, y, 0, y + h);
          g.addColorStop(0, "rgba(255,255,255,0.98)");
          g.addColorStop(1, "rgba(246,250,250,0.98)");
          ctx.fillStyle = g;
          ctx.fill();
          ctx.restore();
          rr(ctx, x, y, w, h, 24);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
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
            ctx.shadowColor = disabled ? "rgba(12,38,54,0.05)" : "rgba(15,156,140,0.35)";
            ctx.shadowBlur = disabled ? 2 : 16;
            ctx.shadowOffsetY = disabled ? 1 : 6;
            rr(ctx, x, y, w, h, r);
            const g = ctx.createLinearGradient(0, y, 0, y + h);
            if (disabled) {
              g.addColorStop(0, "#CBD8DD");
              g.addColorStop(1, "#B9C8CE");
            } else {
              g.addColorStop(0, "#25B7A3");
              g.addColorStop(1, "#0A8B7E");
            }
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
          } else if (opt.variant === "glass") {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.82)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.stroke();
          } else {
            rr(ctx, x, y, w, h, r);
            ctx.fillStyle = disabled ? "rgba(240,244,246,1)" : "rgba(255,255,255,0.96)";
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(19,41,58,0.10)";
            ctx.stroke();
          }
          const fg = opt.variant === "primary" ? "#FFFFFF" : C.ink;
          const iconColor = opt.variant === "primary" ? "#FFFFFF" : opt.variant === "glass" ? C.ink : C.ink;
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
        _miniButton(id, x, y, w, h, label) {
          const ctx = this.ctx;
          const pressed = this.pressId === id && this.nowMs - this.pressAt < 150;
          rr(ctx, x, y, w, h, 10);
          ctx.fillStyle = pressed ? "rgba(15,156,140,0.9)" : "rgba(255,255,255,0.82)";
          ctx.fill();
          ctx.lineWidth = 1;
          ctx.strokeStyle = pressed ? "rgba(15,156,140,1)" : "rgba(19,41,58,0.10)";
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
  canvas.width = Math.round(CSS_W * dpr);
  canvas.height = Math.round(CSS_H * dpr);
  canvas.style.width = CSS_W + "px";
  canvas.style.height = CSS_H + "px";
  var cfg = getStore();
  cfg.reset();
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
  var last = 0;
  function loop(ts) {
    const dt = last ? Math.min(0.05, (ts - last) / 1e3) : 1 / 60;
    last = ts;
    engine.update(dt);
    const events = engine.drainEvents();
    events.forEach((ev) => {
      if (ev.type === "warn") renderer.showHint("\u5DF2\u63A5\u8FD1\u5931\u8861 \xB7 \u6162\u6162\u56DE\u6B63", "#DF5540");
      if (ev.type === "rope:in") renderer.showHint("\u4FDD\u9669\u7EF3\u5DF2\u4ECB\u5165\uFF0C\u5DF2\u5E2E\u4F60\u6276\u7A33", "#9A6414");
      if (ev.type === "rope:out") renderer.showHint("\u5DF2\u6062\u590D\u5E73\u8861", "#0A7E72");
    });
    renderer.render(dt, Date.now());
    updateStateText();
    window.requestAnimationFrame(loop);
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
  function updateStateText() {
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
