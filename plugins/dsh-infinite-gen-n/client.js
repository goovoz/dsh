/* 无限N代 (dsh-infinite-gen-n) client half
 *
 * 两个界面元件（界面以无限四代为准，左栏形态借鉴无限五代）：
 *  1. 输入框徽标 conversation.input.dock — 实时"破甲已开启"状态（四代原样）
 *     user message -> 思考中 pulse / assistant -> ✓通过 ◐未完交付 ✗拒绝词
 *  2. 左侧栏工作台 sidebar.panellist + conversation.view + main（五代形态）
 *     tab 清洗层: 引擎开关 + 工具引导（nv_patch_status / apply / revert）
 *     tab 验证: 版本 / 修订号 / 提示词哈希（/genn/scope 路由读取）
 */
window.__ModuleLoader__.load({
  id: "dsh-infinite-gen-n",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");

    var inject = ["slots"];

    var ANIM_CSS = "@keyframes dshArmorPulse{0%,100%{box-shadow:0 0 2px rgba(34,197,94,.5);opacity:1}50%{box-shadow:0 0 12px rgba(34,197,94,1);opacity:.55}}@keyframes dshArmorFlash{0%{transform:scale(1)}30%{transform:scale(1.12)}100%{transform:scale(1)}}";

    var SCOPE_URL = "/genn/scope";
    var POLL_MS = 4000;
    // 无限N代：仓库与论坛地址（徽标 title 与工作台「关于」区共用）
    var REPO_URL = "https://github.com/Minglink/dsh-infinite-gen-n";
    var FORUM_URL = "https://openorigin.link/";
    var WRAP_STYLE = {
      display: "flex",
      justifyContent: "center",
      width: "100%"
    };
    var BADGE_STYLE = {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      width: "fit-content",
      padding: "3px 10px",
      borderRadius: "6px",
      border: "1px solid rgba(34, 197, 94, 0.4)",
      background: "rgba(34, 197, 94, 0.1)",
      color: "inherit",
      fontSize: "11px",
      lineHeight: "16px",
      fontFamily: "inherit",
      userSelect: "none",
      whiteSpace: "nowrap",
      cursor: "pointer"
    };
    var DOT_STYLE = {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: "#22c55e",
      flex: "none"
    };
    var FLASH_MS = 2500;

    function readScope(done) {
      try {
        fetch(SCOPE_URL, { headers: { accept: "application/json" } })
          .then(function (res) { return res.json(); })
          .then(function (data) { done(data || null); })
          .catch(function () { done(null); });
      } catch {
        done(null);
      }
    }

    function writeScope(next, done) {
      try {
        fetch(SCOPE_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope: next })
        })
          .then(function (res) { return res.json(); })
          .then(function (data) { done(data || null); })
          .catch(function () { done(null); });
      } catch {
        done(null);
      }
    }

    /* ---------------- 输入框徽标（四代原样） ---------------- */

    function ArmorDock(props) {
      var useProjection = typeof props.useProjection === "function" ? props.useProjection : undefined;
      var preset = useProjection ? useProjection("agentPreset") : undefined;
      var armor = useProjection ? useProjection("armor") : undefined;

      var scopePair = react.useState(null);
      var scope = scopePair[0];
      var setScope = scopePair[1];
      var busyPair = react.useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];
      var notePair = react.useState("");
      var note = notePair[0];
      var setNote = notePair[1];
      var lastVerdictRef = react.useRef(null);
      var flashUntilRef = react.useRef(0);
      var tickPair = react.useState(0);
      var setTick = tickPair[1];

      react.useEffect(function () {
        var styleEl = null;
        if (!document.getElementById("dsh-armor-css")) {
          styleEl = document.createElement("style");
          styleEl.id = "dsh-armor-css";
          styleEl.textContent = ANIM_CSS;
          document.head.appendChild(styleEl);
        }
        return function () { if (styleEl) styleEl.remove(); };
      }, []);

      react.useEffect(function () {
        var alive = true;
        var apply = function (data) {
          if (!alive || !data) return;
          if (typeof data.scope === "string") setScope(data.scope);
          if (data.envOverride) setNote("范围已被环境变量 GEN4_SCOPE 固定：" + data.envOverride);
        };
        readScope(apply);
        var timer = setInterval(function () { readScope(apply); }, POLL_MS);
        return function () { alive = false; clearInterval(timer); };
      }, []);

      react.useEffect(function () {
        var v = armor && armor.verdict ? armor.verdict : null;
        if (v !== lastVerdictRef.current) {
          lastVerdictRef.current = v;
          if (v) flashUntilRef.current = Date.now() + FLASH_MS;
          setTick(Date.now());
        }
      }, [armor]);

      var global = scope === "global";
      var visible = preset === "armor" || global;
      if (!visible) return null;

      var running = !!(armor && armor.running);
      var words = armor && Array.isArray(armor.words) ? armor.words : [];
      var showVerdict = !running && lastVerdictRef.current !== null &&
        Date.now() < flashUntilRef.current;

      var text = global ? "破甲已开启 · 全部模式" : "破甲已开启 · 无限N代";
      var dotStyle = Object.assign({}, DOT_STYLE);
      var badgeStyle = Object.assign({}, BADGE_STYLE);

      if (running) {
        dotStyle.animation = "dshArmorPulse 1.2s ease-in-out infinite";
        text = "AI 正在回复…";
      } else if (showVerdict) {
        if (lastVerdictRef.current === "pass") {
          text = "✓ 回复合格";
          badgeStyle.animation = "dshArmorFlash 1.2s ease";
        } else if (lastVerdictRef.current === "partial") {
          text = "◐ 没写完";
          badgeStyle.animation = "dshArmorFlash 1.4s ease";
          badgeStyle.borderColor = "rgba(245, 158, 11, 0.5)";
          badgeStyle.background = "rgba(245, 158, 11, 0.12)";
          dotStyle.background = "#f59e0b";
        } else {
          text = "✗ " + (words[0] || "婉拒了");
          badgeStyle.animation = "dshArmorFlash 1.6s ease";
          badgeStyle.borderColor = "rgba(239, 68, 68, 0.5)";
          badgeStyle.background = "rgba(239, 68, 68, 0.12)";
          dotStyle.background = "#ef4444";
        }
      }

      if (note) text = note;
      if (busy) badgeStyle.opacity = "0.6";

      function onClick() {
        if (busy) return;
        var next = global ? "local" : "global";
        setBusy(true);
        writeScope(next, function (data) {
          setBusy(false);
          if (data && data.ok) {
            setScope(data.scope || next);
            setNote("");
            return;
          }
          if (data && data.error === "env-override") {
            setNote("已被环境变量 GEN4_SCOPE 固定，无法在界面切换");
            return;
          }
          setNote("切换失败，请重试");
          setTimeout(function () { setNote(""); }, 4000);
        });
      }

      var title = (global
        ? "现在：所有聊天都启用破甲（点一下改成只对破甲模式生效）"
        : "现在：只有选了破甲模式的聊天启用（点一下改成所有聊天都启用）") +
        "\n\nAI技术交流论坛: " + FORUM_URL;

      return react.createElement(
        "div",
        { style: WRAP_STYLE },
        react.createElement(
          "div",
          {
            style: badgeStyle,
            "data-armor": "genn",
            "data-scope": scope || "unknown",
            role: "button",
            tabIndex: 0,
            title: title,
            onClick: onClick,
            onKeyDown: function (event) {
              if (event.key === "Enter" || event.key === " ") onClick();
            }
          },
          react.createElement("span", { style: dotStyle }),
          react.createElement("span", null, text)
        )
      );
    }

    /* ---------------- 左侧栏工作台（形态借鉴无限五代） ---------------- */

    var WORKBENCH_TAB_LABEL = "无限N代";
    var PANEL_ID = "genn-workbench-panel";
    var ARMOR_URL = "/genn/armor";

    function fetchJson(url, opts) {
      return fetch(url, opts)
        .then(function (res) {
          return res.text().then(function (t) {
            try { return JSON.parse(t); }
            catch (e) { return { ok: false, error: "HTTP " + res.status + ": " + t.slice(0, 120) }; }
          });
        })
        .catch(function (e) {
          return { ok: false, error: "网络错误: " + String((e && e.message) || e) };
        });
    }

    function readArmor(done) {
      fetchJson(ARMOR_URL).then(done);
    }
    function postArmor(action, done) {
      // text/plain 不触发 CORS preflight（application/json 会发 OPTIONS 预检，
      // webServer 若不响应 OPTIONS 会导致 fetch 抛错）
      fetchJson(ARMOR_URL, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({ action: action }),
      }).then(done);
    }

    function useInfo() {
      var pair = react.useState(null);
      react.useEffect(function () {
        var alive = true;
        var read = function () { readScope(function (d) { if (alive && d) pair[1](d); }); };
        read();
        var t = setInterval(read, POLL_MS);
        return function () { alive = false; clearInterval(t); };
      }, []);
      return pair[0];
    }

    var CARD = {
      padding: "10px 12px",
      border: "1px solid var(--border-muted, rgba(128,128,128,0.25))",
      borderRadius: "8px",
      marginBottom: "10px",
      fontSize: "12px",
      lineHeight: 1.6,
    };
    var TITLE = {
      fontSize: "12px",
      fontWeight: 600,
      margin: "0 0 6px",
    };
    var MUTED = { color: "var(--fg-muted, #888)" };

    function PatchTab(props) {
      var stPair = react.useState(null);
      var st = stPair[0];
      var setSt = stPair[1];
      var busyPair = react.useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];
      var resultPair = react.useState(null);
      var result = resultPair[0];
      var setResult = resultPair[1];

      var load = function () {
        setBusy(true);
        readArmor(function (d) { setSt(d); setBusy(false); });
      };
      react.useEffect(function () { load(); }, []);

      if (!st) {
        return react.createElement("p", { style: Object.assign({}, MUTED, { fontSize: "12px" }) }, "正在读取破甲层状态…");
      }

      var on = st.gen4Patch === "on";
      var run = function (action) {
        setBusy(true);
        setResult(null);
        postArmor(action, function (d) {
          if (d && d.ok) {
            setResult(action === "apply" ? "✓ 破甲完成！重启 DSH 后生效。"
              : "✓ 已还原！重启 DSH 后生效。");
            setSt(d);
          } else {
            setResult("出错了：" + ((d && d.error) || "未知错误"));
            if (d) setSt(d);
          }
          setBusy(false);
        });
      };

      var btn = function (label, action, primary) {
        return react.createElement("button", {
          style: {
            padding: "6px 14px",
            fontSize: "12px",
            borderRadius: "6px",
            cursor: busy ? "not-allowed" : "pointer",
            border: primary ? "none" : "1px solid var(--border-muted, rgba(128,128,128,0.4))",
            background: primary ? "#22c55e" : "transparent",
            color: primary ? "#fff" : "inherit",
            opacity: busy ? 0.6 : 1,
            marginRight: "8px",
          },
          disabled: busy,
          onClick: function () { run(action); },
        }, label);
      };

      return react.createElement("div", null,
        st.error
          ? react.createElement("div", { style: CARD, borderColor: "#ef4444" },
              react.createElement("p", { style: { margin: 0, color: "#ef4444" } }, "破甲层出错：", st.error))
          : null,
        react.createElement("div", { style: CARD },
          react.createElement("p", { style: Object.assign({}, TITLE, { marginBottom: 0 }) }, "破甲"),
          react.createElement("p", { style: { margin: "0 0 6px" } },
            on ? "● 可完善" : "○ 完善功能已关闭"),
          react.createElement("p", { style: Object.assign({}, MUTED, { margin: 0 }) },
            "完善前会自动备份原文件；重复点击没有副作用；完善不用重启电脑，重启 DSH 就生效。")),
        (st.hosts || []).map(function (h, i) {
          if (h.error) {
            return react.createElement("div", { key: i, style: CARD },
              react.createElement("p", { style: TITLE, fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }, h.base),
              react.createElement("p", { style: { margin: 0, color: "#ef4444" } }, "读取失败：" + h.error));
          }
          return react.createElement("div", { key: i, style: CARD },
            react.createElement("p", { style: TITLE, fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }, h.base),
            react.createElement("p", { style: { margin: 0 } },
              "已生效 ", react.createElement("b", null, h.applied),
              " 个 · 还没打 ", react.createElement("b", null, h.pending),
              " 个 · 自动跳过 ", react.createElement("b", null, h.skipped),
              " 个 · 不适用 ", react.createElement("b", null, h.na), " 个"));
        }),
        st.coexistence
          ? react.createElement("div", { style: CARD, borderColor: "#f59e0b" },
              react.createElement("p", { style: { margin: 0 } },
                "检测到你还装了 dsh-purge 插件。两家的补丁内容一样，重复打没有问题；但撤销时只用一边管理，避免互相打架。"))
          : null,
        react.createElement("div", { style: CARD },
          react.createElement("p", { style: Object.assign({}, TITLE, { marginBottom: 0 }) }, "操作"),
          btn("一键破甲", "apply", true),
          btn("一键还原", "revert", false),
          result
            ? react.createElement("p", { style: { margin: "10px 0 0", color: String(result).charAt(0) === "✓" ? "#22c55e" : "#ef4444" } }, result)
            : react.createElement("p", { style: Object.assign({}, MUTED, { margin: "10px 0 0", fontSize: "11px" }) },
                busy ? "正在完善，几秒钟…" : "完善后重启 DSH 就能生效")),
        react.createElement("div", { style: CARD },
          react.createElement("p", { style: TITLE }, "关于"),
          react.createElement("p", { style: Object.assign({}, MUTED, { margin: "0 0 6px" }) },
            "无限N代 · 无限一代至四代原作者维护创建"),
          react.createElement("p", { style: { margin: "0 0 6px", fontSize: "12px" } },
            "仓库: ",
            react.createElement("a", { href: REPO_URL, target: "_blank", rel: "noopener noreferrer", style: { color: "var(--accent, #22c55e)" } }, REPO_URL)),
          react.createElement("p", { style: { margin: 0, fontSize: "12px" } },
            "AI技术交流论坛: ",
            react.createElement("a", { href: FORUM_URL, target: "_blank", rel: "noopener noreferrer", style: { color: "var(--accent, #22c55e)" } }, FORUM_URL)),
          react.createElement("p", { style: Object.assign({}, MUTED, { margin: "6px 0 0", fontSize: "12px" }) },
            "QQ 交流群: 1135498706")));
    }

    function VerifyTab(props) {
      var info = props.info;
      if (!info) return react.createElement("p", { style: Object.assign({}, MUTED, { fontSize: "12px" }) }, "读取中…");
      return react.createElement("div", null,
        react.createElement("div", { style: CARD },
          react.createElement("p", { style: TITLE }, "安装信息"),
          react.createElement(KV, { k: "插件版本", v: info.version || "?" }),
          react.createElement(KV, { k: "程序编号", v: info.implementationRevision || "?" }),
          react.createElement(KV, { k: "提示词方案", v: info.variant === "v10" ? "v10 完整版" : (info.variant || "?") }),
          react.createElement(KV, { k: "提示词指纹", v: (info.promptSetHash || "?").slice(0, 8) + "…" }),
          react.createElement(KV, { k: "生效范围", v: info.scope === "global" ? "所有聊天" : "仅破甲模式" }),
          react.createElement(KV, { k: "补丁功能", v: info.patchLayer === "on" ? "开启" : "关闭" })));
    }

    function KV(props) {
      return react.createElement("div", { style: { display: "flex", gap: "8px", padding: "4px 0", fontSize: "12px" } },
        react.createElement("span", { style: Object.assign({}, MUTED, { minWidth: "120px", flex: "none" }) }, props.k),
        react.createElement("span", { style: { fontFamily: "monospace", wordBreak: "break-all" } }, props.v));
    }

    function NVWorkbench(props) {
      var info = useInfo();
      var tabPair = react.useState("patch");
      var activeTab = tabPair[0];
      var setActiveTab = tabPair[1];

      var TABS = [
        ["patch", "破甲层"],
        ["verify", "验证"],
      ];

      var navStyle = {
        display: "flex",
        gap: "6px",
        marginBottom: "12px",
        borderBottom: "1px solid var(--border-muted, rgba(128,128,128,0.3))",
      };
      var tabStyle = function (name) {
        return {
          padding: "6px 12px",
          fontSize: "12px",
          cursor: "pointer",
          borderBottom: activeTab === name ? "2px solid #22c55e" : "2px solid transparent",
          color: activeTab === name ? "inherit" : "var(--fg-muted, #888)",
        };
      };

      return react.createElement("div", { style: { padding: "12px" } },
        react.createElement("div", { style: navStyle },
          TABS.map(function (t) {
            return react.createElement("span", {
              key: t[0],
              style: tabStyle(t[0]),
              onClick: function () { setActiveTab(t[0]); },
            }, t[1]);
          })
        ),
        activeTab === "patch" ? react.createElement(PatchTab, { info: info }) : null,
        activeTab === "verify" ? react.createElement(VerifyTab, { info: info }) : null
      );
    }

    function apply(ctx) {
      ctx.slots.inject("conversation.input.dock", () =>
        ctx.slots.register({
          name: "conversation.input.dock",
          id: "armor",
          order: 30
        }, ArmorDock)
      );

      // 左栏形态借鉴无限五代：侧栏图标 + 会话视图 tab + 主区域
      try {
        ctx.slots.inject("conversation.view", function () {
          return ctx.slots.register(
            {
              name: "conversation.view",
              id: "genn",
              order: 25,
              label: function () { return WORKBENCH_TAB_LABEL; },
            },
            function (props) { return react.createElement(NVWorkbench, props); }
          );
        });
      } catch (e) {}

      try {
        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register(
            { name: "sidebar.panellist", id: PANEL_ID, order: 55, label: function () { return WORKBENCH_TAB_LABEL; } },
            function () {
              return react.createElement("svg", { width: 16, height: 16, viewBox: "0 0 16 16", fill: "currentColor" },
                react.createElement("path", { d: "M8 1.5 2 5v6l6 3.5L14 11V5L8 1.5zm0 1.2 4.8 2.8L8 8.3 3.2 5.5 8 2.7zM3 6.6l4.5 2.6v4.7L3 11.4V6.6zm5.5 7.3V9.2L13 6.6v4.8l-4.5 2.5z" })
            );
            }
          );
        });
      } catch (e) {}

      try {
        ctx.slots.inject("main", function () {
          return ctx.slots.register({ name: "main", key: PANEL_ID }, function (props) {
            return react.createElement(NVWorkbench, props);
          });
        });
      } catch (e) {}
    }

    exports.name = "dsh-infinite-gen-n";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  }
});
