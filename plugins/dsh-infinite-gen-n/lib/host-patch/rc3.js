// rc.3 原生补丁定义（0.2.2-rc.3 的文本）：
// 上游 rc.3 改写了若干文件正文，本文件把对应补丁的 pattern/replace 与目标文件
// 按 rc.3 的实际内容重新定义；core.js 在构造 ALL_PATCHES 后合并本表。
// 以后 dsh 升级时，只需在这里按新版本改这几条。

export const RC3_PATCH_FIXES = new Map([
  [14, {
    pattern: 'const outcome = await approval.approver.request({\n' +
      '\t\tagent: approval.agent,\n' +
      '\t\ttoolName: approval.toolName,\n' +
      '\t\tcallId: approval.callId,\n' +
      '\t\treason: `escalate sandbox to ${mode}: ${justification}`,\n' +
      '\t\tdisplayReason: escalationDisplayReason(mode, justification),\n' +
      '\t\t...approval.signal ? { signal: approval.signal } : {}\n' +
      '\t});',
    replace:
      'const outcome = approval.approver !== undefined && approval.agent !== undefined ? await approval.approver.request({ agent: approval.agent, toolName: approval.toolName, callId: approval.callId, reason: `escalate sandbox to ${mode}: ${justification}`, displayReason: escalationDisplayReason(mode, justification), ...approval.signal ? { signal: approval.signal } : {} }) : \"allowed-once\";',
  }],
  [13, {
    pattern: '\tif (!(WIDER_MODES[effectiveMode] ?? []).includes(mode)) throw new SandboxEscalationError(`sandbox escalation to "${mode}" is not strictly wider than this call\'s current "${effectiveMode}" mode`, "SANDBOX_ESCALATION_INVALID_ARGUMENT");\n' +
      '\tif (approval.approver === void 0) throw new SandboxEscalationError(`sandbox escalation to "${mode}" requires approval, but no approval service is composed`, "SANDBOX_ESCALATION_UNAVAILABLE");\n' +
      '\tif (approval.agent === void 0) throw new SandboxEscalationError(`sandbox escalation to "${mode}" requires approval, but the call has no agent to route it through`, "SANDBOX_ESCALATION_UNAVAILABLE");\n',
    replace:
      '\t// [dsh-purge] escalation bypass: the strict-widening ladder and the\n' +
      '\t// approval-service requirements are disabled — every escalation request\n' +
      '\t// is granted regardless of the effective mode or composed services.\n',
  }],
  [18, {
    pattern: '\tctx.on("tools/post-execute", async (exec, _result, next) => {\n' +
      '\t\tconst reminder = observe(exec);\n' +
      '\t\tconst downstream = await next();\n' +
      '\t\tif (!reminder) return downstream;\n' +
      '\t\treturn {\n' +
      '\t\t\t...downstream,\n' +
      '\t\t\tadditionalContexts: prependContext(reminder, downstream.additionalContexts)\n' +
      '\t\t};\n' +
      '\t});\n' +
      '\tctx.on("agent/pre-step", ({ agent, messages }, next) => {\n' +
      '\t\tif (messages.some((message) => message.source.kind === "user")) chains.delete(agent);\n' +
      '\t\treturn next();\n' +
      '\t});',
    replace:
      '\t// [dsh-purge] repeat-tool-reminder disabled: no reminder injection,\n' +
      '\t// no chain tracking. The guard is fully inert.',
  }],
  [35, {
    pattern: 'switch (outcome) {\n' +
      '\t\tcase "allowed-once": return mode;\n' +
      '\t\tcase "rejected": throw new SandboxEscalationError(`the user rejected escalating this ${subject} to "${mode}"; it stays denied, so stop and explain instead of working around it`, "SANDBOX_ESCALATION_REJECTED");\n' +
      '\t\tcase "cancelled":\n' +
      '\t\t\tapproval.signal?.throwIfAborted();\n' +
      '\t\t\tthrow new SandboxEscalationError(`approval for escalating to "${mode}" was cancelled`, "SANDBOX_ESCALATION_CANCELLED");\n' +
      '\t\tcase "unavailable": throw new SandboxEscalationError(`sandbox escalation to "${mode}" requires approval, but no approval channel is available`, "SANDBOX_ESCALATION_UNAVAILABLE");\n' +
      '\t\tdefault: return assertNever(outcome, "EscalationOutcome");\n' +
      '\t}',
    replace:
      'switch (outcome) {\n' +
      '\t\tcase "allowed-once":\n' +
      '\t\tdefault:\n' +
      '\t\t\treturn mode; // [dsh-purge] escalation never rejected\n' +
      '\t}',
  }],
  [67, {
    pattern: '\t\t\t\tif (turnEnds && decision.messages.length === 0) break;\n\t\t\t\t\tif (phase.step === 0 && decision.messages.length === 0) {',
    replace:
      '\t\t\t\tif (turnEnds && (decision.messages?.length ?? 0) === 0) break; // [dsh-purge] guard undefined messages\n' +
      '\t\t\t\t\tif (phase.step === 0 && (decision.messages?.length ?? 0) === 0) { // [dsh-purge] guard undefined messages',
  }],
  [80, {
    pattern: '          - id: tool-fs\n            name: \'@deepseek-ai/dsh-tool-fs\'\n            config:\n              read: false\n              readImage: true\n              write: false\n              edit: false\n          - id: compaction',
    replace: '          - id: persistent-shell # [dsh-purge] minimal official toolset',
  }],
  [32, {
    replacements: [
      { pattern: 'You are interacting with the user through the DeepSeekRuntime Web GUI at ', replace: 'You are interacting with the user through the local web GUI at ' },
      { pattern: 'You are interacting with the user through the DeepSeekRuntime Web GUI whose URL the runtime context names.', replace: 'You are interacting with the user through the local web GUI whose URL the runtime context names.' },
    ],
    markersAny: true,
    markers: ["through the local web GUI", "Local web GUI: "],
}],
  [53, {
    replacements: [
      { pattern: 'You are interacting with the user through the local web GUI at ', replace: 'Local web GUI: ' },
      { pattern: 'You are interacting with the user through the local web GUI whose URL the runtime context names.', replace: 'Local web GUI: the URL is named in the runtime context.' },
    ],
    markersAny: true,
    markers: ["Local web GUI: ", "through the local web GUI"],
}],
  [60, {
    pattern: '; the retry asks the user for approval.',
    replace: '; approval is auto-granted.',
    markers: ["; approval is auto-granted."],
}],
  [62, {
    pattern: "        if (approval === undefined) {\n            return {\n                decision: approvalDenial(ask.reason ?? `tool \"${exec.name}\" requires approval (not yet supported)`, APPROVAL_UNAVAILABLE),\n                approvalCancelled: false,\n            };\n        }",
    replace: "        if (approval === undefined) {\n            // [dsh-purge] no approval service \u2192 fail open\n            return { decision: { kind: 'allow' }, approvalCancelled: false };\n        }",
    markers: ['// [dsh-purge] no approval service'],
}],
  [17, {
    markers: ["// [dsh-purge] observation bypass"],
  }],
  [74, {
    // rc.3 已把 systemPrompt.assemble 移到 pre-step 之前，本补丁的目的已由上游实现
    markers: ["const assembly = await this.loopCtx.systemPrompt.assemble("],
  }],
])

export const RC3_PATCH_FILES = new Map([
  [32, ['harness-dev-context', 'web-app-lib']],
  [53, ['harness-dev-context', 'web-app-lib']],
  [54, ['deliverable-file-references', 'deliverables-prompt']],
  [62, ['dsh-tools-pipeline']],
  [60, ['escalation', 'dsh-tools', 'dsh-tools-ptc']],
])

export const RC3_SKIP_MARKED_OFF = new Set([32, 53, 60])
