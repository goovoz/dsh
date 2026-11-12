/* 青龙 CLI 插件 client half —— 侧边栏入口 + 设置面板
 *
 * Registers:
 *   1. sidebar.panellist — 「青龙」侧边栏入口（id 与 main 的 key 相同，宿主导航靠这个配对）
 *   2. main                — 设置页：qlUrl / clientId / clientSecret，保存即生效
 *
 * 数据全部走服务端插件注册的 HTTP 路由：
 *   GET  /qinglong/config  读取当前配置（真实值，不脱敏）
 *   POST /qinglong/config  保存并即时生效（会顺带做一次连通性探测）
 *   POST /qinglong/test    仅测试连接
 */
window.__ModuleLoader__.load({
  id: "dsh-qinglong-cli",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var react = require("react");

    var inject = ["slots", "locale"];

    var PANEL_ID = "qinglong";
    var PANEL_LABEL = "青龙";
    var VERSION = "0.1.0";

    var S = {
      page: {
        padding: "18px 22px",
        maxWidth: "760px",
        fontFamily: "inherit",
        fontSize: "13px",
        lineHeight: 1.6,
      },
      header: { display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px" },
      title: { fontSize: "18px", fontWeight: 600, margin: 0 },
      ver: { fontSize: "11px", opacity: 0.55 },
      desc: { margin: "2px 0 16px", opacity: 0.65, fontSize: "12px" },
      card: {
        border: "1px solid rgba(128,128,128,.28)",
        borderRadius: "10px",
        padding: "14px 16px",
        marginBottom: "14px",
      },
      field: { marginBottom: "12px" },
      label: { display: "block", fontSize: "12px", opacity: 0.75, marginBottom: "4px" },
      hint: { fontSize: "11px", opacity: 0.55, marginTop: "3px" },
      input: {
        width: "100%",
        boxSizing: "border-box",
        padding: "7px 9px",
        borderRadius: "7px",
        border: "1px solid rgba(128,128,128,.35)",
        background: "transparent",
        color: "inherit",
        fontFamily: "ui-monospace, Consolas, monospace",
        fontSize: "12px",
        outline: "none",
      },
      row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
      btn: {
        padding: "6px 14px",
        borderRadius: "7px",
        border: "1px solid rgba(128,128,128,.35)",
        background: "rgba(128,128,128,.10)",
        color: "inherit",
        fontSize: "12px",
        cursor: "pointer",
      },
      btnPrimary: {
        padding: "6px 14px",
        borderRadius: "7px",
        border: "1px solid rgba(78,161,255,.55)",
        background: "rgba(78,161,255,.16)",
        color: "inherit",
        fontSize: "12px",
        cursor: "pointer",
      },
      ok: { color: "#2f9e44", fontSize: "12px" },
      warn: { color: "#e3a008", fontSize: "12px" },
      err: { color: "#e03131", fontSize: "12px" },
      dim: { opacity: 0.55, fontSize: "11px" },
      badge: {
        display: "inline-block",
        padding: "1px 7px",
        borderRadius: "10px",
        border: "1px solid rgba(128,128,128,.35)",
        fontSize: "11px",
        marginLeft: "6px",
      },
    };

    function Icon() {
      return react.createElement(
        "span",
        { style: { display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px" } },
        "🐉"
      );
    }

    async function api(path, init) {
      var res = await fetch(path, init);
      var text = await res.text();
      var data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { ok: false, error: "响应不是 JSON：" + text.slice(0, 120) };
      }
      if (!res.ok && data.ok === undefined) data.ok = false;
      return data;
    }

    function Field(props) {
      return react.createElement(
        "div",
        { style: S.field },
        react.createElement("label", { style: S.label }, props.label),
        react.createElement("input", {
          style: S.input,
          value: props.value,
          placeholder: props.placeholder || "",
          spellCheck: false,
          autoComplete: "off",
          onKeyDown: props.onKeyDown,
          onChange: function (e) {
            props.onChange(e.target.value);
          },
        }),
        props.hint ? react.createElement("div", { style: S.hint }, props.hint) : null
      );
    }

    function SettingsPage() {
      var state = react.useState(null); // 服务端返回的完整状态
      var info = state[0];
      var setInfo = state[1];

      var form = react.useState({ qlUrl: "", clientId: "", clientSecret: "" });
      var f = form[0];
      var setF = form[1];

      var busy = react.useState("");
      var busyKind = busy[0];
      var setBusy = busy[1];

      var note = react.useState(null); // {kind:'ok'|'err', text}
      var msg = note[0];
      var setMsg = note[1];

      var load = react.useCallback(function () {
        return api("/qinglong/config")
          .then(function (d) {
            setInfo(d);
            if (d && d.settings) {
              setF({
                qlUrl: d.settings.qlUrl || "",
                clientId: d.settings.clientId || "",
                clientSecret: d.settings.clientSecret || "",
              });
            }
            if (!d || d.ok === false) {
              setMsg({ kind: "err", text: "读取配置失败：" + ((d && (d.error || d.message)) || "未知错误") });
            }
            return d;
          })
          .catch(function (e) {
            setMsg({ kind: "err", text: "读取配置失败：" + String(e.message || e) });
          });
      }, []);

      react.useEffect(function () {
        load();
      }, [load]);

      function save() {
        setBusy("save");
        setMsg(null);
        api("/qinglong/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(f),
        })
          .then(function (d) {
            if (d && d.settings) {
              setInfo(d);
              setF({
                qlUrl: d.settings.qlUrl || "",
                clientId: d.settings.clientId || "",
                clientSecret: d.settings.clientSecret || "",
              });
            }
            if (d && d.saved) {
              var p = d.probe || {};
              setMsg(
                p.ok
                  ? { kind: "ok", text: "已保存并生效 · " + (p.message || "连接成功") + (p.ms ? "（" + p.ms + "ms）" : "") }
                  : { kind: "err", text: "已保存，但连通性检查失败：" + (p.message || "未知原因") }
              );
            } else {
              setMsg({ kind: "err", text: "保存失败：" + ((d && (d.error || d.message)) || "未知错误") });
            }
          })
          .catch(function (e) {
            setMsg({ kind: "err", text: "保存失败：" + String(e.message || e) });
          })
          .finally(function () {
            setBusy("");
          });
      }

      function test() {
        setBusy("test");
        setMsg(null);
        api("/qinglong/test", { method: "POST" })
          .then(function (d) {
            if (d && d.ok) {
              setMsg({
                kind: "ok",
                text: "连接成功 · via " + d.via + " · " + (d.ms || "-") + "ms" + (d.total !== undefined ? " · 任务数 " + d.total : ""),
              });
            } else {
              setMsg({ kind: "err", text: "连接失败：" + ((d && d.message) || "未知原因") });
            }
          })
          .catch(function (e) {
            setMsg({ kind: "err", text: "连接失败：" + String(e.message || e) });
          })
          .finally(function () {
            setBusy("");
          });
      }

      var locked = (info && info.locked) || {};
      var filled = Boolean(f.qlUrl && f.clientId && f.clientSecret);
      // 三态：没填 / 填了没保存 / 已保存可用。原来只用服务端 ready，会让人误以为输入框里的值无效
      var statusText = !filled ? "未填写" : info && info.ready ? "已配置" : "未保存";
      var statusStyle = !filled ? S.dim : info && info.ready ? S.ok : S.warn;
      var loadFailed = info && info.ok === false;
      var lockHint = function (key) {
        return locked[key] ? "已被环境变量固定，面板改动不会覆盖它" : "";
      };

      var onEnter = function (e) {
        if (e.key === "Enter" && !busy) {
          e.preventDefault();
          save();
        }
      };

      return react.createElement(
        "div",
        { style: S.page },
        react.createElement(
          "div",
          { style: S.header },
          react.createElement("h2", { style: S.title }, "青龙"),
          react.createElement("span", { style: S.ver }, "v" + VERSION)
        ),
        react.createElement(
          "p",
          { style: S.desc },
          "填面板地址与应用凭据，保存后立即生效。凭据只写入本机配置文件，供 DSH 工具 qlcli 使用。"
        ),

        loadFailed
          ? react.createElement(
              "div",
              { style: { ...S.card, borderColor: "rgba(224,49,49,.5)" } },
              react.createElement("div", { style: S.err }, "读取配置失败：" + ((info && (info.error || info.message)) || "接口无响应")),
              react.createElement(
                "div",
                { style: S.hint },
                "常见原因：服务端插件未加载（/qinglong/config 404）。重启 DSH 后重试。"
              )
            )
          : null,

        react.createElement(
          "div",
          { style: S.card },
          react.createElement(Field, {
            label: "面板地址（QL_URL）",
            value: f.qlUrl,
            placeholder: "http://172.20.0.9:5700",
            hint:
              "不要带 /open。挂反向代理子路径时写完整根地址，例如 https://example.com/ql" +
              (lockHint("qlUrl") ? " · " + lockHint("qlUrl") : ""),
            onKeyDown: onEnter,
            onChange: function (v) {
              setF({ qlUrl: v, clientId: f.clientId, clientSecret: f.clientSecret });
            },
          }),
          react.createElement(Field, {
            label: "Client ID",
            value: f.clientId,
            placeholder: "面板 → 系统设置 → 应用设置 里创建",
            hint: lockHint("clientId"),
            onKeyDown: onEnter,
            onChange: function (v) {
              setF({ qlUrl: f.qlUrl, clientId: v, clientSecret: f.clientSecret });
            },
          }),
          react.createElement(Field, {
            label: "Client Secret",
            value: f.clientSecret,
            placeholder: "与 Client ID 成对的应用密钥",
            hint: lockHint("clientSecret"),
            onKeyDown: onEnter,
            onChange: function (v) {
              setF({ qlUrl: f.qlUrl, clientId: f.clientId, clientSecret: v });
            },
          }),
          react.createElement(
            "div",
            { style: S.row },
            react.createElement(
              "button",
              { style: S.btnPrimary, disabled: busyKind !== "" || !filled, onClick: save, type: "button" },
              busyKind === "save" ? "保存中…" : "保存并生效"
            ),
            react.createElement(
              "button",
              { style: S.btn, disabled: busyKind !== "" || !filled, onClick: test, type: "button" },
              busyKind === "test" ? "测试中…" : "测试连接"
            ),
            react.createElement("button", { style: S.btn, disabled: busyKind !== "", onClick: load, type: "button" }, "重新读取"),
            react.createElement("span", { style: statusStyle }, statusText)
          ),
          react.createElement(
            "div",
            { style: S.hint },
            "输入框里按 Enter 也能保存。若按钮点不动，多半是页面上还有 DSH 的弹层（Preview Notice 等）盖着，先点它的 Continue 或刷新页面。"
          ),
          msg ? react.createElement("div", { style: msg.kind === "ok" ? S.ok : S.err }, msg.text) : null
        ),

        info && info.settingsFile
          ? react.createElement(
              "div",
              { style: S.card },
              react.createElement("div", { style: S.label }, "配置文件"),
              react.createElement("div", { style: S.input, readOnly: true }, info.settingsFile),
              react.createElement(
                "div",
                { style: S.hint },
                "面板保存会写入这个文件（0600）。若同名项已由环境变量提供，环境变量优先。"
              )
            )
          : null,

        react.createElement(
          "div",
          { style: S.dim },
          "工具：qlcli / qlcli_help / qlcli_routes / qlcli_status —— 覆盖青龙 148 条 OpenAPI 路由。"
        )
      );
    }

    function apply(ctx) {
      function diag(label, e) {
        try {
          window.__dshQinglongDiag = window.__dshQinglongDiag || [];
          window.__dshQinglongDiag.push({ label: label, message: String((e && e.message) || e) });
        } catch (err) {
          /* 非浏览器 */
        }
      }

      try {
        ctx.effect(function () {
          return ctx.locale.register("qinglong", { zh: { panel: PANEL_LABEL }, en: { panel: "QingLong" } });
        }, "qinglong-cli: locale");
      } catch (e) {
        diag("locale", e);
      }

      try {
        ctx.slots.inject("main", function () {
          return ctx.slots.register({ name: "main", key: PANEL_ID, label: PANEL_LABEL }, SettingsPage);
        });
      } catch (e) {
        diag("main", e);
      }

      try {
        ctx.slots.inject("sidebar.panellist", function () {
          return ctx.slots.register({ name: "sidebar.panellist", id: PANEL_ID, order: 6, label: PANEL_LABEL }, Icon);
        });
      } catch (e) {
        diag("sidebar", e);
      }
    }

    exports.name = "dsh-qinglong-cli";
    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
