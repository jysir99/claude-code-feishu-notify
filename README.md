<div align="center">

# claude-code-feishu-notify

**让 Claude Code 在需要权限确认 / 任务完成时，自动推送通知到飞书**

[English](./README.en.md) · 简体中文

零依赖 · 单文件 · 跨平台 · 不阻塞 Claude Code

</div>

---

## ✨ 这是什么

你用 Claude Code（或兼容 Claude Code hook 的客户端）干活时，经常会遇到：

- 🔔 Claude 弹出**权限确认**，但你正在看别的东西，没注意到
- ✅ 一个长任务**跑完了**，你却一直在盯着终端等

本项目通过 Claude Code 的 **Hooks 机制**，在这两个关键时刻自动往**飞书群**推送一条通知，让你可以放心离开屏幕，等手机响了再回来。

通知长这样 👇

```
【Claude Code】🔔 需要你确认权限 · my-project
📁 C:/Users/me/projects/my-project
🔄 claude --resume ca330f41-5c35-495c-97ac-0e2d42a70b82
⏰ 2026/7/14 09:19:07
```

其中 `🔄 claude --resume <id>` 这一行可以直接**复制到终端执行**，一键跳回对应会话。

## 🎯 适用场景

- 同时跑多个 Claude Code 会话，想用手机统一接收通知
- 长时间任务（重构、批量修改、测试）跑着，想去干别的
- 国内团队，希望推送到**飞书**而不是 Slack/Telegram
- Windows + Git Bash 用户（本项目就是在该环境下开发测试的）

## 🚀 快速开始

### 前置要求

- 已安装 [Claude Code](https://docs.claude.com/en/docs/claude-code/overview)（或任何兼容 Claude Code hooks 的客户端）
- 已安装 **Node.js**（v16+ 即可，无需更高版本）

### 三步完成配置

#### 第 1 步：创建飞书机器人

1. 打开飞书，新建一个群（或用现有群）
2. 群设置 → **群机器人** → **添加机器人** → 选择 **「自定义机器人」**
3. 填个名字（如「Claude 小助手」），点**添加**
4. 复制生成的 webhook 地址，形如：
   ```
   https://open.feishu.cn/open-apis/bot/v2/hook/01234567-89ab-cdef-0123-456789abcdef
   ```

#### 第 2 步：放置脚本

把本项目的 `hooks/feishu-notify.js` 复制到任意固定位置，例如：

```
~/.claude/hooks/feishu-notify.js
```

#### 第 3 步：配置 Claude Code

编辑 `~/.claude/settings.json`（没有就新建），加入 `FEISHU_WEBHOOK` 环境变量和 hooks 配置：

```jsonc
{
  "env": {
    "FEISHU_WEBHOOK": "https://open.feishu.cn/open-apis/bot/v2/hook/你的key"
  },
  "hooks": {
    "Notification": [
      { "hooks": [ { "type": "command", "command": "node \"C:/Users/你的用户名/.claude/hooks/feishu-notify.js\"" } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node \"C:/Users/你的用户名/.claude/hooks/feishu-notify.js\"" } ] }
    ],
    "SubagentStop": [
      { "hooks": [ { "type": "command", "command": "node \"C:/Users/你的用户名/.claude/hooks/feishu-notify.js\"" } ] }
    ]
  }
}
```

> 📌 **macOS / Linux 用户**：`command` 里写成路径即可，如 `node "/home/你/.claude/hooks/feishu-notify.js"`。
>
> 📌 完整可复制的示例见 [`examples/settings.example.json`](./examples/settings.example.json)。

**重启 Claude Code**，配置生效。🎉

## 🧪 测试是否生效

在终端手动模拟一次 hook 触发，几秒内飞书群应收到消息：

```bash
echo '{"hook_event_name":"Stop","cwd":"/home/me/my-project","session_id":"test-123"}' \
  | FEISHU_WEBHOOK="https://open.feishu.cn/open-apis/bot/v2/hook/你的key" \
  node ~/.claude/hooks/feishu-notify.js
```

收到消息 = 配置成功 ✅

## 🔐 启用签名校验（可选，更安全）

如果担心 webhook 地址泄露被人乱发消息，可在飞书机器人设置里开启**签名校验**，再把密钥填入第二个环境变量：

```jsonc
{
  "env": {
    "FEISHU_WEBHOOK": "https://open.feishu.cn/open-apis/bot/v2/hook/你的key",
    "FEISHU_WEBHOOK_SECRET": "你在飞书设置的密钥SEC..."
  }
}
```

脚本会自动按飞书加签算法（HMAC-SHA256）签名。

## 📋 事件说明

| Hook 事件 | 触发时机 | 通知标题 |
|---|---|---|
| `Notification` | Claude **需要你确认权限** | 🔔 需要你确认权限 |
| `Stop` | 主任务**跑完**、等你输入 | ✅ 任务已完成 |
| `SubagentStop` | **子任务**（Task / Agent）完成 | ✅ 子任务已完成 |

> 💡 不想要其中某个？从 `hooks` 配置里删掉对应块即可。

## ⚙️ 自定义

想改通知文案 / emoji / 格式？编辑 `hooks/feishu-notify.js` 中的 `labels` 对象和 `lines` 数组即可，注释标得很清楚。

## ❓ 常见问题

**Q：收不到通知？**
- 确认**重启过** Claude Code（settings.json 改完不重启不生效）
- 用上面的「测试命令」单独跑脚本，看飞书是否收到
- 直接用 `curl` 测 webhook 地址，看飞书 API 是否返回 `StatusCode: 0`

**Q：webhook 地址会泄露吗？**
- 不会上传到任何地方，只在你本地的 `settings.json` 里。**不要把 settings.json 提交到 git**（见 `.gitignore`）。建议同时开启上面的「签名校验」。

**Q：会拖慢 Claude Code 吗？**
- 不会。脚本设计为**非阻塞**——webhook 没配、网络失败都静默跳过，exit 0。

**Q：支持 Lark（国际版）吗？**
- 支持。把 webhook 地址换成 Lark 的（`open.larksuite.com`）即可。

**Q：和 ZCode 等兼容客户端能用吗？**
- 能。只要客户端支持 Claude Code 的 hooks 规范即可。ZCode 的 `PermissionRequest` 等价于 `Notification`。

## 🤝 让 AI 帮你配置

本项目内置了一份 [`docs/AI_INSTRUCTIONS.md`](./docs/AI_INSTRUCTIONS.md)——把它的内容丢给任何 AI 编程助手（Claude Code / Cursor / Copilot Chat…），它就能自动帮你完成飞书机器人创建指引、脚本放置、settings.json 配置和测试。

## 📄 许可证

[MIT License](./LICENSE)
