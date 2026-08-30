const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// =================================================================
// 1. Storage & State Tracking
// =================================================================
const activityFile = path.join(__dirname, 'activity.json');
let activityMap = {};

if (fs.existsSync(activityFile)) {
  try {
    activityMap = JSON.parse(fs.readFileSync(activityFile, 'utf-8'));
  } catch (e) {
    activityMap = {};
  }
}

function saveActivity() {
  try {
    fs.writeFileSync(activityFile, JSON.stringify(activityMap, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ Error saving activity file:', err.message);
  }
}

// Bot State & Live Metrics
let botState = {
  status: 'INITIALIZING', // INITIALIZING | QR_READY | AUTHENTICATING | ONLINE | DISCONNECTED | AUTH_FAILURE
  qrDataUrl: null,
  qrRaw: null,
  startTime: Date.now(),
  messagesReceived: 0,
  repliesSent: 0,
  lastEvent: 'Bot is initializing...',
  lastEventTime: new Date().toISOString()
};

function updateState(status, lastEvent) {
  botState.status = status;
  if (lastEvent) {
    botState.lastEvent = lastEvent;
    botState.lastEventTime = new Date().toISOString();
  }
}

// =================================================================
// 2. Cross-Platform Chromium / Chrome Detection
// =================================================================
function getBrowserExecutablePath() {
  // If explicitly provided via environment (e.g. in Docker)
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  // Linux / Cloud container common paths
  const linuxPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ];

  // Windows common paths
  const winPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe')
  ];

  const candidatePaths = process.platform === 'win32' ? winPaths : linuxPaths;
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
}

const browserPath = getBrowserExecutablePath();

console.log('\n=============================================');
console.log("  🤖 Vitcha - Tahsin's WhatsApp AI Bot       ");
console.log('=============================================\n');
if (browserPath) {
  console.log(`🌐 Using browser: ${browserPath}`);
} else {
  console.log('🌐 Using default bundled Chromium');
}
console.log(`⏱️  Inactivity threshold: ${config.inactivityThresholdMinutes} minute(s)`);
console.log(`🌐 Web Dashboard Port: ${config.port}\n`);

// =================================================================
// 3. Express Web Server (Dashboard, Cloud Health Check & QR Viewer)
// =================================================================
const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    botStatus: botState.status,
    uptimeSeconds: Math.floor((Date.now() - botState.startTime) / 1000)
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: botState.status,
    uptimeSeconds: Math.floor((Date.now() - botState.startTime) / 1000),
    messagesReceived: botState.messagesReceived,
    repliesSent: botState.repliesSent,
    activeContacts: Object.keys(activityMap).length,
    lastEvent: botState.lastEvent,
    lastEventTime: botState.lastEventTime,
    hasQr: !!botState.qrDataUrl,
    qrDataUrl: botState.qrDataUrl
  });
});

app.get('/', (req, res) => {
  const uptimeHours = ((Date.now() - botState.startTime) / (1000 * 60 * 60)).toFixed(2);
  const activeContactsCount = Object.keys(activityMap).length;

  let badgeColor = '#64748b';
  let badgeText = botState.status;

  if (botState.status === 'ONLINE') {
    badgeColor = '#10b981';
    badgeText = 'ONLINE & ACTIVE';
  } else if (botState.status === 'QR_READY') {
    badgeColor = '#f59e0b';
    badgeText = 'WAITING FOR QR SCAN';
  } else if (botState.status === 'AUTHENTICATING') {
    badgeColor = '#3b82f6';
    badgeText = 'AUTHENTICATING...';
  } else if (botState.status === 'DISCONNECTED' || botState.status === 'AUTH_FAILURE') {
    badgeColor = '#ef4444';
    badgeText = 'DISCONNECTED';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vitcha - WhatsApp Auto-Reply Bot</title>
  <meta http-equiv="refresh" content="5">
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #25d366;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
    }
    .container {
      width: 100%;
      max-width: 680px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 20px 24px;
      border-radius: 16px;
    }
    .header-title {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1.3rem;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-radius: 9999px;
      background-color: ${badgeColor};
      color: #fff;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
    }
    .qr-box {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    .qr-img {
      background: white;
      padding: 16px;
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      max-width: 260px;
      width: 100%;
      height: auto;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 14px;
    }
    .stat-item {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .stat-val {
      font-size: 1.8rem;
      font-weight: 700;
      color: var(--primary);
      margin-top: 4px;
    }
    .stat-label {
      font-size: 0.85rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .config-quote {
      background: rgba(15, 23, 42, 0.6);
      border-left: 4px solid var(--primary);
      padding: 14px 18px;
      border-radius: 8px;
      font-size: 0.95rem;
      line-height: 1.5;
      color: #e2e8f0;
      font-style: italic;
      margin-top: 12px;
    }
    .footer {
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="header-title">
        <span>🤖</span>
        <div>
          <div>Vitcha Bot</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); font-weight: normal;">Tahsin's AI WhatsApp Assistant</div>
        </div>
      </div>
      <div class="badge">${badgeText}</div>
    </div>

    ${botState.status === 'QR_READY' && botState.qrDataUrl ? `
    <div class="card qr-box">
      <h2 style="font-size: 1.15rem; color: #f59e0b;">📲 Scan to Link WhatsApp</h2>
      <p style="font-size: 0.9rem; color: var(--text-muted);">
        Open WhatsApp on your phone &rarr; <b>Settings &rarr; Linked Devices &rarr; Link a Device</b>
      </p>
      <img class="qr-img" src="${botState.qrDataUrl}" alt="WhatsApp QR Code" />
      <p style="font-size: 0.8rem; color: var(--text-muted);">This page auto-refreshes every 5 seconds.</p>
    </div>
    ` : ''}

    <div class="card">
      <h3 style="font-size: 1rem; margin-bottom: 16px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Live Metrics</h3>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">Auto-Replies Sent</div>
          <div class="stat-val">${botState.repliesSent}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Messages Processed</div>
          <div class="stat-val">${botState.messagesReceived}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Tracked Contacts</div>
          <div class="stat-val">${activeContactsCount}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">Uptime</div>
          <div class="stat-val">${uptimeHours}h</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="font-size: 1rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Current Configuration</h3>
      <div style="margin-top: 10px; font-size: 0.9rem; color: var(--text-muted);">
        • <b>Inactivity Window:</b> ${config.inactivityThresholdMinutes} minutes<br>
        • <b>Group Chats:</b> ${config.ignoreGroups ? 'Ignored' : 'Monitored'}<br>
        • <b>Reply Delay:</b> ${config.replyDelaySeconds}s typing simulation
      </div>
      <div class="config-quote">
        "${config.autoReplyMessage}"
      </div>
    </div>

    <div class="footer">
      Last status update: ${new Date(botState.lastEventTime).toLocaleTimeString()} (${botState.lastEvent})
    </div>
  </div>
</body>
</html>`;

  res.send(html);
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`🚀 Web Dashboard & Health Server running at http://0.0.0.0:${config.port}`);
});

// =================================================================
// 4. WhatsApp Web Client Setup (Optimized for 512MB RAM Containers)
// =================================================================
const puppeteerArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-client-side-phishing-detection',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-features=AudioServiceOutOfProcess,IsolateOrigins,site-per-process,TranslateUI',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-notifications',
  '--disable-popup-blocking',
  '--disable-print-preview',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-speech-api',
  '--disable-sync',
  '--hide-scrollbars',
  '--ignore-gpu-blacklist',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-default-browser-check',
  '--no-pings',
  '--password-store=basic',
  '--use-mock-keychain',
  '--js-flags=--max-old-space-size=256'
];

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: path.join(__dirname, '.wwebjs_auth')
  }),
  puppeteer: {
    headless: true,
    executablePath: browserPath,
    args: puppeteerArgs
  }
});

// Event: QR Code received
client.on('qr', async (qr) => {
  botState.qrRaw = qr;
  try {
    botState.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
  } catch (err) {
    console.error('Error generating QR Data URL:', err);
  }
  updateState('QR_READY', 'QR code generated. Awaiting scan.');

  console.log('\x1b[33m%s\x1b[0m', '📲 Scan this QR code with WhatsApp on your phone:');
  console.log('   (WhatsApp > Settings > Linked Devices > Link a Device)');
  console.log(`   Or open Web Dashboard: http://localhost:${config.port}\n`);
  qrcodeTerminal.generate(qr, { small: true });
});

// Event: Successfully authenticated
client.on('authenticated', () => {
  botState.qrDataUrl = null;
  updateState('AUTHENTICATING', 'Authenticated successfully. Initializing session.');
  console.log('\x1b[32m%s\x1b[0m', '✅ WhatsApp Authentication Successful!');
});

// Event: Ready to process messages
client.on('ready', () => {
  botState.qrDataUrl = null;
  updateState('ONLINE', 'Bot is online and actively monitoring messages.');
  console.log('\x1b[32m%s\x1b[0m', "🚀 Vitcha is ONLINE and actively watching over your chats!\n");
});

// Helper to handle auto-reply logic for incoming messages
async function handleIncomingMessage(msg) {
  try {
    const from = msg.from;
    const body = msg.body || '';

    botState.messagesReceived++;

    // Ignore status broadcast updates
    if (config.ignoreStatus && (from === 'status@broadcast' || msg.isStatus || from.includes('broadcast'))) {
      return;
    }

    // Ignore group chats
    if (config.ignoreGroups && from.includes('@g.us')) {
      return;
    }

    // Check blacklist / whitelist
    if (config.blacklist && config.blacklist.includes(from)) return;
    if (config.whitelist && config.whitelist.length > 0 && !config.whitelist.includes(from)) return;

    const contactId = from;
    const now = Date.now();
    const lastSeen = activityMap[contactId];

    let shouldReply = false;
    let timeDiffMinutes = 0;

    if (!lastSeen) {
      // First interaction recorded
      shouldReply = true;
    } else {
      timeDiffMinutes = (now - lastSeen) / (1000 * 60);
      if (timeDiffMinutes >= config.inactivityThresholdMinutes) {
        shouldReply = true;
      }
    }

    // Update last interaction timestamp
    activityMap[contactId] = now;
    saveActivity();

    console.log(`\n📩 [Message Received] From: ${contactId}`);
    console.log(`💬 Text: "${body}"`);

    if (shouldReply) {
      const reason = !lastSeen
        ? 'First message from this contact'
        : `Inactive for ${timeDiffMinutes.toFixed(1)} mins (>= ${config.inactivityThresholdMinutes}m threshold)`;
      console.log(`🤖 [Triggered] Replying because: ${reason}`);

      // Simulate natural typing delay
      try {
        const chat = await msg.getChat();
        if (chat && typeof chat.sendStateTyping === 'function') {
          await chat.sendStateTyping();
        }
      } catch (err) {
        // Continue even if typing state fails
      }

      if (config.replyDelaySeconds > 0) {
        await new Promise((r) => setTimeout(r, config.replyDelaySeconds * 1000));
      }

      // Send Vitcha auto-reply
      try {
        await msg.reply(config.autoReplyMessage);
      } catch (replyErr) {
        // Fallback: send direct to chat ID
        await client.sendMessage(contactId, config.autoReplyMessage);
      }

      botState.repliesSent++;
      updateState('ONLINE', `Replied to contact ${contactId}`);
      console.log(`✅ [Vitcha Replied] Successfully sent message to ${contactId}\n`);
    } else {
      console.log(`⏳ [Skipping Reply] Ongoing conversation. Last activity was ${timeDiffMinutes.toFixed(1)} mins ago (< ${config.inactivityThresholdMinutes}m).\n`);
    }
  } catch (err) {
    console.error('❌ Error processing message:', err);
  }
}

// Listen to all created messages (both incoming & outgoing)
client.on('message_create', async (msg) => {
  try {
    // If message is sent BY Tahsin himself:
    if (msg.fromMe) {
      // Update contact timestamp so Tahsin's own replies reset the 1-hour window
      if (msg.to && !msg.to.includes('@g.us') && msg.to !== 'status@broadcast') {
        activityMap[msg.to] = Date.now();
        saveActivity();
      }

      // Special test trigger: If Tahsin texts "!testvitcha" in any chat or to himself:
      if (msg.body && msg.body.trim().toLowerCase() === '!testvitcha') {
        console.log('\n🧪 [Manual Test Triggered by you]');
        await msg.reply(config.autoReplyMessage);
        botState.repliesSent++;
        console.log('✅ Sent test reply!\n');
      }
      return;
    }

    // Message is from someone else:
    await handleIncomingMessage(msg);
  } catch (e) {
    console.error('❌ Error in message_create event:', e);
  }
});

// Event: Authentication failure
client.on('auth_failure', (msg) => {
  updateState('AUTH_FAILURE', `Authentication failed: ${msg}`);
  console.error('\x1b[31m%s\x1b[0m', '❌ Authentication failure:', msg);
});

// Event: Disconnected
client.on('disconnected', (reason) => {
  updateState('DISCONNECTED', `Disconnected: ${reason}`);
  console.warn('\x1b[33m%s\x1b[0m', '⚠️ Bot was disconnected:', reason);
});

// Global unhandled rejection handlers to prevent container crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

client.initialize().catch((err) => {
  console.error('❌ Failed to initialize WhatsApp client:', err.message);
  updateState('AUTH_FAILURE', `Initialization error: ${err.message}`);
});
