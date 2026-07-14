#!/usr/bin/env node
/**
 * claude-code-feishu-notify
 * Claude Code → 飞书 (Feishu/Lark) 通知脚本
 * Claude Code → Feishu/Lark notification script
 *
 * GitHub: https://github.com/<your-name>/claude-code-feishu-notify
 * License: MIT
 *
 * 由 Claude Code 的 hooks (Notification / Stop / SubagentStop) 触发。
 * Triggered by Claude Code hooks (Notification / Stop / SubagentStop).
 *
 * Claude Code 会把事件数据通过 stdin 传入（JSON），本脚本解析后推送到飞书机器人。
 * Claude Code passes event data via stdin as JSON; this script parses it and
 * pushes a message to a Feishu custom bot webhook.
 *
 * ----------------------------------------------------------------------
 * 配置 / Setup
 * ----------------------------------------------------------------------
 * 通过环境变量 FEISHU_WEBHOOK 传入飞书机器人 webhook 地址：
 *   https://open.feishu.cn/open-apis/bot/v2/hook/<your-key>
 * Set the Feishu bot webhook URL via the FEISHU_WEBHOOK environment variable.
 *
 * 可选环境变量 / Optional env vars:
 *   FEISHU_WEBHOOK_SECRET  启用了签名校验的机器人对应的密钥
 *                          Secret for bots that enforce signature verification
 *
 * ----------------------------------------------------------------------
 * stdin 字段 / stdin payload fields (Claude Code standard hook payload)
 * ----------------------------------------------------------------------
 *   hook_event_name  事件名 / event name
 *   cwd              当前工作目录 / current working directory
 *   session_id       会话 ID / session id (for `claude --resume`)
 *   message          消息正文 / message body (Notification event)
 *
 * ----------------------------------------------------------------------
 * 设计原则 / Design principles
 * ----------------------------------------------------------------------
 *  - 零依赖，仅使用 Node.js 内置模块 / zero deps, Node.js built-ins only
 *  - 绝不阻塞 Claude Code：webhook 未配置或发送失败时静默跳过，exit 0
 *    Never blocks Claude Code: silently skips (exit 0) on missing webhook or errors
 */

const https = require('https');
const http = require('http');
const crypto = require('crypto');

const WEBHOOK = process.env.FEISHU_WEBHOOK || '';
const SECRET = process.env.FEISHU_WEBHOOK_SECRET || '';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  send(raw).catch(() => {});
});

function send(rawInput) {
  // 未配置 webhook 时静默跳过 / silently skip if webhook not configured
  if (!WEBHOOK) {
    return Promise.resolve();
  }

  let data = {};
  try { data = JSON.parse(rawInput || '{}'); } catch (e) { data = {}; }

  const event = data.hook_event_name || '通知';
  const labels = {
    Notification: '🔔 需要你确认权限',
    Stop: '✅ 任务已完成',
    SubagentStop: '✅ 子任务已完成',
  };
  const label = labels[event] || event;

  // 项目信息：cwd 完整路径 + basename（项目名）
  // Project info: full cwd path + basename (project name)
  const cwd = data.cwd || '';
  const projectName = cwd
    ? cwd.split(/[\\/]/).filter(Boolean).pop() || cwd
    : '';

  // 标题行：事件 + 项目名（一眼区分是哪个项目）
  // Title line: event + project name (tell projects apart at a glance)
  let title = '【Claude Code】' + label;
  if (projectName) title += ' · ' + projectName;

  const lines = [title];
  if (cwd) lines.push('📁 ' + cwd);
  if (data.session_id) lines.push('🔄 claude --resume ' + data.session_id);
  if (data.message) lines.push('📝 ' + data.message);
  lines.push('⏰ ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  const text = lines.join('\n');

  return post(WEBHOOK, SECRET, text);
}

/**
 * 组装飞书 webhook payload，必要时加签名。
 * Build the Feishu webhook payload, adding a signature when a secret is set.
 *
 * 飞书签名算法（加签模式）：
 *   timestamp = 当前秒
 *   string_to_sign = timestamp + "\n" + secret
 *   sign = base64( hmac_sha256(string_to_sign, secret) )  // 注意：secret 同时是 key 和被签内容的一部分
 */
function buildPayload(text, secret) {
  const payload = {
    msg_type: 'text',
    content: { text },
  };

  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = timestamp + '\n' + secret;
    const sign = crypto
      .createHmac('sha256', stringToSign)
      .update(stringToSign)
      .digest('base64');
    payload.timestamp = timestamp;
    payload.sign = sign;
  }

  return JSON.stringify(payload);
}

function post(url, secret, text) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve(); }
    const lib = u.protocol === 'http:' ? http : https;

    const body = buildPayload(text, secret);

    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve());
      }
    );
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}
