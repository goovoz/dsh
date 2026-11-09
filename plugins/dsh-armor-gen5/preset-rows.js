// preset-rows.js — gen-5 破甲预设注册行（与 gen-4 同源约定）。
// Source convention: dsh-web-app presets/standard.patch.yml (standard roster).
// gen-5 相对 gen-4 的唯一行变化：最后一行从 armor-gen4 换成 armor-gen5。
export const ROWS = [
  {
    "id": "persona",
    "name": "@deepseek-ai/dsh-persona",
    "config": {
      "prefix": "You are a coding agent powered by the {{model}} model."
    }
  },
  {
    "id": "agent-instructions",
    "name": "@deepseek-ai/dsh-agent-instructions",
    "config": {
      "maxBytes": 65536
    }
  },
  {
    "id": "time-context",
    "name": "@deepseek-ai/dsh-time-context"
  },
  {
    "id": "tool-bash",
    "name": "@deepseek-ai/dsh-tool-bash",
    "disabled": true
  },
  {
    "id": "tool-pwsh",
    "name": "@deepseek-ai/dsh-tool-pwsh",
    "disabled": false
  },
  {
    "id": "tool-fs",
    "name": "@deepseek-ai/dsh-tool-fs"
  },
  {
    "id": "tool-fs-search",
    "name": "@deepseek-ai/dsh-tool-fs-search",
    "config": {
      "sampleOverCapGlobResults": false
    }
  },
  {
    "id": "tool-jobs",
    "name": "@deepseek-ai/dsh-tool-jobs"
  },
  {
    "id": "tool-schedule",
    "name": "@deepseek-ai/dsh-tool-schedule"
  },
  {
    "id": "skill-filesystem",
    "name": "@deepseek-ai/dsh-skill-filesystem"
  },
  {
    "id": "tool-skill",
    "name": "@deepseek-ai/dsh-tool-skill"
  },
  {
    "id": "command-goal",
    "name": "@deepseek-ai/dsh-command-goal"
  },
  {
    "id": "tool-goal",
    "name": "@deepseek-ai/dsh-tool-goal"
  },
  {
    "id": "planning",
    "name": "cordis:group",
    "group": true,
    "isolate": {
      "planMode": true
    },
    "config": [
      {
        "id": "plan-mode",
        "name": "@deepseek-ai/dsh-plan-mode",
        "config": {
          "section": "You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.\nExplore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery. The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs to exit_plan_mode.\nResolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.\nMake the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise but enough to review that another engineer can implement it without making design decisions.\nWhen ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval and, on approval, releases plan mode."
        }
      }
    ]
  },
  {
    "id": "compaction",
    "name": "cordis:group",
    "group": true,
    "isolate": {
      "compaction": true,
      "toolResultPruner": true
    },
    "config": [
      {
        "id": "compaction-basic",
        "name": "@deepseek-ai/dsh-compaction-basic"
      },
      {
        "id": "command-compact",
        "name": "@deepseek-ai/dsh-command-compact"
      },
      {
        "id": "tool-result-pruner",
        "name": "@deepseek-ai/dsh-compaction-tool-result-pruner",
        "config": {
          "thresholdChars": 8192,
          "headChars": 4096,
          "tailChars": 1024
        }
      }
    ]
  },
  {
    "id": "delegation",
    "name": "cordis:group",
    "group": true,
    "isolate": {
      "workflowEngine": true
    },
    "config": [
      {
        "id": "tool-subagent-control",
        "name": "@deepseek-ai/dsh-tool-subagent-control"
      },
      {
        "id": "tool-subagent-list-agents",
        "name": "@deepseek-ai/dsh-tool-subagent-control/list-agents"
      },
      {
        "id": "tool-subagent",
        "name": "@deepseek-ai/dsh-tool-subagent",
        "config": {
          "provider": "spawn",
          "toolName": "subagent",
          "modelSelectionSettings": true
        }
      },
      {
        "id": "tool-subagent-fork",
        "name": "@deepseek-ai/dsh-tool-subagent",
        "config": {
          "provider": "fork",
          "toolName": "subagent_fork"
        }
      },
      {
        "id": "workflow-ptc",
        "name": "@deepseek-ai/dsh-workflow-ptc",
        "config": {
          "provider": "spawn"
        }
      },
      {
        "id": "tool-workflow",
        "name": "@deepseek-ai/dsh-tool-workflow"
      },
      {
        // 0.4.7 补：原生续跑。拒绝/中断后由宿主自己接着推，
        // 比插件自造的重锚链更稳（W5 是提示层，ralph 是执行层兜底）。
        "id": "tool-ralph",
        "name": "@deepseek-ai/dsh-tool-ralph",
        "config": {
          "subagentProvider": "spawn",
          "maxRounds": 256
        }
      }
    ]
  },
  {
    "id": "tool-ask-user",
    "name": "@deepseek-ai/dsh-tool-ask-user"
  },
  {
    "id": "tool-todo",
    "name": "@deepseek-ai/dsh-tool-todo",
    "config": {
      "allowParallelInProgress": true
    }
  },
  {
    "id": "tool-web",
    "name": "@deepseek-ai/dsh-tool-web",
    "config": {
      "fetch": true,
      "searchTimeoutMs": 60000
    }
  },
  {
    "id": "present",
    "name": "@deepseek-ai/dsh-tool-present"
  },
  {
    "id": "tool-plugin-manager",
    "name": "@deepseek-ai/dsh-plugin-manager/tools",
    "disabled": true
  },
  {
    "id": "tool-plugin-market",
    "name": "@deepseek-ai/dsh-plugin-market/tools",
    "disabled": true
  },
  {
    "id": "armor-gen5",
    // 相对路径（相对 profile 目录）：preset realm 的 baseUrl 解析不到 profile 装的包名，
    // 官方 preset 里也只引用 asar 内的 @deepseek-ai/* 包。用相对路径指向插件正本，
    // 分发包同样成立（插件总在 <DSH_HOME>/plugins/dsh-armor-gen5）。
    "name": "../../plugins/dsh-armor-gen5/index.js",
    "config": {
      "mode": "armor",
      "via": "preset"
    }
  }
];
