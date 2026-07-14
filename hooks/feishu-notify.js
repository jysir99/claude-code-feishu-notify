#!/usr/bin/env node
/**
 * claude-code-feishu-notify
 * Claude Code → 飞书 (Feishu/Lark) 通知脚本（交互卡片版）
 * Claude Code → Feishu/Lark notification script (interactive card edition)
 *
 * GitHub: https://github.com/jysir99/claude-code-feishu-notify
 * License: MIT
 *
 * 由 Claude Code 的 hooks (Notification / Stop / SubagentStop) 触发。
 * Triggered by Claude Code hooks (Notification / Stop / SubagentStop).
 *
 * 推送【飞书交互卡片】：彩色标题栏 + 结构化双列字段 + 突出的 resume 命令。
 * Pushes a Feishu interactive card: colored header + structured two-column fields
 * + a highlighted resume command.
 *
 * ----------------------------------------------------------------------
 * 配置 / Setup
 * ----------------------------------------------------------------------
 * 环境变量 / Env vars:
 *   FEISHU_WEBHOOK         飞书自定义机器人 webhook 地址（必填）
 *                          Feishu custom-bot webhook URL (required)
 *   FEISHU_WEBHOOK_SECRET  启用了签名校验的机器人对应的 SEC 密钥（可选）
 *                          Secret for bots that enforce signature verification (optional)
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
 *  - 健壮降级：卡片发送失败时自动回退为纯文本，保证不丢消息
 *    Graceful fallback: drops back to plain text if the card fails, so no message is lost
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

// ---------------------------------------------------------------------------
// 事件元信息：emoji、显示名、卡片标题栏颜色
// Event metadata: emoji, display name, card header color template
// ---------------------------------------------------------------------------
const EVENT_META = {
  Notification: { emoji: '🔔', name: '需要确认权限', color: 'orange' },
  Stop:         { emoji: '✅', name: '任务已完成',   color: 'green'  },
  SubagentStop: { emoji: '📦', name: '子任务已完成', color: 'blue'   },
};
// 兜底（未知事件）/ fallback for unknown events
function metaOf(event) {
  return EVENT_META[event] || { emoji: '📨', name: event || '通知', color: 'turquoise' };
}

async function send(rawInput) {
  // 未配置 webhook 时静默跳过 / silently skip if webhook not configured
  if (!WEBHOOK) return;

  let data = {};
  try { data = JSON.parse(rawInput || '{}'); } catch (e) { data = {}; }

  const event = data.hook_event_name || '通知';
  const meta = metaOf(event);

  const cwd = data.cwd || '';
  const projectName = cwd ? (cwd.split(/[\\/]/).filter(Boolean).pop() || cwd) : '';
  const sessionId = data.session_id || '';
  const message = data.message || '';
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

  // 1) 先发交互卡片 / send the interactive card first
  const cardPayload = buildCardPayload(meta, projectName, cwd, sessionId, message, time);
  const ok = await post(WEBHOOK, SECRET, cardPayload);
  // 2) 失败则降级为纯文本，保证不丢消息 / fall back to plain text on failure
  if (!ok) {
    const textPayload = buildTextPayload(meta, projectName, cwd, sessionId, message, time);
    await post(WEBHOOK, SECRET, textPayload);
  }
}

// ---------------------------------------------------------------------------
// 交互卡片构造 / Build the interactive card payload
// ---------------------------------------------------------------------------
function buildCardPayload(meta, projectName, cwd, sessionId, message, time) {
  const title = meta.emoji + ' ' + (projectName ? projectName + ' · ' + meta.name : meta.name);

  // elements: 卡片正文区，自上而下排列
  const elements = [];

  // 双列字段：事件类型 / 时间
  elements.push({
    tag: 'div',
    fields: [
      { is_short: true, text: { tag: 'lark_md', content: '**事件类型**\n' + meta.name } },
      { is_short: true, text: { tag: 'lark_md', content: '**时间**\n' + time } },
    ],
  });

  // 消息正文（如有）
  if (message) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '**消息内容**\n' + message },
    });
  }

  // 工作目录（代码块样式，路径突出）
  if (cwd) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '**工作目录**\n`' + cwd + '`' },
    });
  }

  // 会话恢复命令（最关键信息：用分隔线 + 代码块独立成段，便于复制）
  if (sessionId) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: '🔄 **恢复会话（复制执行）**\n```text\nclaude --resume ' + sessionId + '\n```' },
    });
  }

  // 分隔线 + 页脚
  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'note',
    elements: [ { tag: 'plain_text', content: '🤖 claude-code-feishu-notify' } ],
  });

  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: title },
        template: meta.color,
      },
      elements,
    },
  };
}

// ---------------------------------------------------------------------------
// 纯文本降级 / Build the plain-text fallback payload
// ---------------------------------------------------------------------------
function buildTextPayload(meta, projectName, cwd, sessionId, message, time) {
  const title = '【Claude Code】' + meta.emoji + ' ' + meta.name + (projectName ? ' · ' + projectName : '');
  const lines = [title];
  if (cwd) lines.push('📁 ' + cwd);
  if (sessionId) lines.push('🔄 claude --resume ' + sessionId);
  if (message) lines.push('📝 ' + message);
  lines.push('⏰ ' + time);
  return { msg_type: 'text', content: { text: lines.join('\n') } };
}

// ---------------------------------------------------------------------------
// 签名 + 发送，返回是否成功（HTTP 200 且业务码为 0）
// Sign (if needed) and POST. Resolves true only on a successful delivery.
// ---------------------------------------------------------------------------
function post(url, secret, payloadObj) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve(false); }
    const lib = u.protocol === 'http:' ? http : https;

    const body = signIfNeeded(JSON.stringify(payloadObj), secret);

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
        let chunks = '';
        res.on('data', (c) => { chunks += c; });
        res.on('end', () => {
          // 飞书成功返回 { "StatusCode": 0, "code": 0, "msg": "success" }
          let ok = res.statusCode === 200;
          if (ok) {
            try {
              const j = JSON.parse(chunks);
              const code = j.StatusCode !== undefined ? j.StatusCode : j.code;
              ok = code === 0;
            } catch (e) { /* 非 JSON 视为失败 */ ok = false; }
          }
          resolve(ok);
        });
      }
    );
    req.on('error', () => resolve(false));
    req.write(body);
    req.end();
  });
}

// 飞书自定义机器人加签：timestamp + "\n" + secret 作为 HMAC key，对自身再 HmacSHA256
function signIfNeeded(body, secret) {
  if (!secret) return body;
  const obj = JSON.parse(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const stringToSign = timestamp + '\n' + secret;
  const sign = crypto.createHmac('sha256', stringToSign).update(stringToSign).digest('base64');
  obj.timestamp = timestamp;
  obj.sign = sign;
  return JSON.stringify(obj);
}
