# AI 助手配置指令 / Instructions for AI Assistants

> 把本文件的内容复制给任意 AI 编程助手（Claude Code / Cursor / Copilot Chat 等），
> 它就能引导用户完成飞书通知的全部配置。
>
> Paste this file into any AI coding assistant and it will guide the user
> through the full Feishu notification setup.

---

## 你的任务 / Your task

帮助用户配置 **claude-code-feishu-notify**：让 Claude Code 在需要权限确认 / 任务完成时，
自动推送飞书通知。

Help the user set up **claude-code-feishu-notify**: push Feishu notifications when
Claude Code requests permission or finishes a task.

## 背景知识（你需要先理解） / Background you must understand

1. **触发机制是 Claude Code 的 Hooks**，不是 MCP。
   Claude Code 支持在以下事件上挂 shell 命令：
   - `Notification` —— 需要用户确认权限 / 等待输入时触发
   - `Stop` —— 主任务跑完时触发
   - `SubagentStop` —— 子任务（Task/Agent）完成时触发

2. **本项目的核心是 `hooks/feishu-notify.js`**：一个零依赖 Node.js 脚本，
   从 stdin 读取 Claude Code 传入的事件 JSON，组装成飞书消息发出去。
   webhook 地址通过环境变量 `FEISHU_WEBHOOK` 传入。

3. **配置文件位置**：
   - Claude Code：`~/.claude/settings.json`
   - 兼容客户端（如 ZCode）：`~/.zcode/cli/config.json`，事件名用 `PermissionRequest`（等价于 `Notification`）

## 执行步骤（按顺序，每步都要确认） / Steps (in order, confirm each)

### Step 1 — 检测环境 / Detect environment
- 用 `node --version` 确认 Node.js 已安装（需 v16+）。
- 检测 `~/.claude/settings.json` 是否存在；不存在则准备新建。
- 检测操作系统（Windows / macOS / Linux），决定路径分隔符和 command 写法。

### Step 2 — 引导用户创建飞书机器人 / Guide Feishu bot creation
告诉用户：
1. 飞书建群（或用现有群）
2. 群设置 → 群机器人 → 添加机器人 → **自定义机器人**
3. 复制 webhook 地址（形如 `https://open.feishu.cn/open-apis/bot/v2/hook/xxx`）
4. （可选）开启签名校验，拿到 `SEC...` 密钥

拿到 webhook 地址后，**不要**直接写进任何会被提交的文件；写入用户的 settings.json 即可。

### Step 3 — 放置脚本 / Place the script
- 把仓库里的 `hooks/feishu-notify.js` 复制到 `~/.claude/hooks/feishu-notify.js`。
- 记下它的**绝对路径**，下一步要用。

### Step 4 — 写入配置 / Write config
编辑 `~/.claude/settings.json`，参考 `examples/settings.example.json`，加入：
- `env.FEISHU_WEBHOOK`（必填）
- `env.FEISHU_WEBHOOK_SECRET`（仅启用签名校验时填）
- `hooks` 下的 `Notification` / `Stop` / `SubagentStop` 三段，`command` 指向上一步的绝对路径。

**Windows 注意**：路径用正斜杠 `/` 或双反斜杠 `\\`，并在 JSON 字符串里用 `\"` 包裹，如
`node "C:/Users/xxx/.claude/hooks/feishu-notify.js"`。

### Step 5 — 测试 / Test
用以下命令模拟一次 hook 触发，确认飞书收到消息：
```bash
echo '{"hook_event_name":"Stop","cwd":"/path/to/project","session_id":"test-123"}' \
  | FEISHU_WEBHOOK="<用户的webhook>" \
  node ~/.claude/hooks/feishu-notify.js
```
若几秒内飞书群收到消息，则配置成功。
如果没收到，用 curl 直测 webhook 看 API 返回（正常应 `StatusCode: 0`）。

### Step 6 — 提醒重启 / Remind to restart
强调：修改 `settings.json` 后**必须重启 Claude Code** 才会加载新 hook 配置。

## 重要约束 / Hard constraints

- ❌ **绝不**把用户的 webhook 地址或密钥写进任何版本控制文件。它们只属于用户本地的 settings.json。
- ❌ **绝不**让脚本阻塞 Claude Code：脚本设计为 webhook 未配置 / 发送失败时静默跳过并 exit 0。
- ✅ **始终**用绝对路径调用脚本。
- ✅ **始终**在修改配置前先 Read 原文件，避免覆盖用户已有配置。
- ✅ 优先复用仓库里现成的 `hooks/feishu-notify.js`，不要凭记忆重写。

## 排错速查 / Troubleshooting cheat sheet

| 症状 | 可能原因 | 处理 |
|---|---|---|
| 完全没通知 | 没重启 Claude Code | 提醒用户重启 |
| 完全没通知 | settings.json 的 hooks 结构写错（少了外层数组/对象） | 对照 example 校验 JSON |
| 完全没通知 | Node.js 未安装或不在 PATH | `node --version` 验证 |
| curl 能发、脚本不能发 | FEISHU_WEBHOOK 环境变量没传进 hook | 确认写在 `env` 里 |
| 飞书返回签名错误 | SECRET 填了但算法不对 | 用仓库脚本的签名实现，勿自行改 |
