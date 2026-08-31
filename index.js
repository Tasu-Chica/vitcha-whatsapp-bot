const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
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
  status: 'INITIALIZING', // INITIALIZING | QR_READY | CONNECTING | ONLINE | DISCONNECTED
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

console.log('\n=============================================');
console.log("  🤖 Vitcha - Tahsin's WhatsApp AI Bot       ");
console.log("  ⚡ Engine: High-Performance Baileys Socket ");
console.log('=============================================\n');
console.log(`⏱️  Inactivity threshold: ${config.inactivityThresholdMinutes} minute(s)`);
console.log(`🌐 Web Dashboard Port: ${config.port}\n`);

// =================================================================
// 2. Express Web Server (Dashboard, Health Check & QR Viewer)
// =================================================================
const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    botStatus: botState.status,
    uptimeSeconds: Math.floor((Date.now() - botState.startTime) / 1000),
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024))
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
    memoryUsageMB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
    hasQr: !!botState.qrDataUrl,
    qrDataUrl: botState.qrDataUrl
  });
});

app.get('/', (req, res) => {
  const uptimeHours = ((Date.now() - botState.startTime) / (1000 * 60 * 60)).toFixed(2);
  const activeContactsCount = Object.keys(activityMap).length;
  const memoryMB = Math.round(process.memoryUsage().rss / (1024 * 1024));

  let badgeColor = '#64748b';
  let badgeText = botState.status;

  if (botState.status === 'ONLINE') {
    badgeColor = '#10b981';
    badgeText = 'ONLINE & ACTIVE';
  } else if (botState.status === 'QR_READY') {
    badgeColor = '#f59e0b';
    badgeText = 'WAITING FOR QR SCAN';
  } else if (botState.status === 'CONNECTING') {
    badgeColor = '#3b82f6';
    badgeText = 'CONNECTING...';
  } else if (botState.status === 'DISCONNECTED') {
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
          <div class="stat-label">RAM Usage</div>
          <div class="stat-val">${memoryMB} MB</div>
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
      Uptime: ${uptimeHours}h • Last update: ${new Date(botState.lastEventTime).toLocaleTimeString()} (${botState.lastEvent})
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
// 3. Baileys WhatsApp Socket Client
// =================================================================
let sock = null;

function extractText(msg) {
  if (!msg.message) return '';
  return msg.message.conversation ||
         msg.message.extendedTextMessage?.text ||
         msg.message.imageMessage?.caption ||
         msg.message.videoMessage?.caption ||
         '';
}

async function connectToWhatsApp() {
  const authFolder = path.join(__dirname, '.wwebjs_auth');
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`📡 Connecting to WhatsApp multi-device (Baileys v${version.join('.')})...`);

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      botState.qrRaw = qr;
      try {
        botState.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
      } catch (err) {
        console.error('Error generating QR Data URL:', err);
      }
      updateState('QR_READY', 'QR code generated. Awaiting scan.');
      console.log('\n📲 Scan QR code from Web Dashboard or terminal:');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      const reason = lastDisconnect?.error?.message || `Status: ${statusCode}`;
      console.log(`⚠️ Connection closed (${reason}). Reconnecting: ${shouldReconnect}`);
      updateState('DISCONNECTED', `Disconnected: ${reason}`);

      if (shouldReconnect) {
        setTimeout(connectToWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      botState.qrDataUrl = null;
      updateState('ONLINE', 'Bot is online and actively monitoring messages.');
      console.log('\x1b[32m%s\x1b[0m', '\n🚀 Vitcha is ONLINE and actively watching over your chats!\n');
    }
  });

  // Handle incoming & outgoing messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (!msg.key || !msg.message) continue;

        const remoteJid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const text = extractText(msg).trim();

        botState.messagesReceived++;

        // Ignore status broadcasts
        if (remoteJid === 'status@broadcast' || remoteJid.includes('broadcast')) {
          continue;
        }

        // Ignore group chats if configured
        if (config.ignoreGroups && remoteJid.endsWith('@g.us')) {
          continue;
        }

        // Handle Tahsin's own outgoing messages
        if (fromMe) {
          activityMap[remoteJid] = Date.now();
          saveActivity();

          // Manual test trigger '!testvitcha'
          if (text.toLowerCase() === '!testvitcha') {
            console.log('\n🧪 [Manual Test Triggered by you]');
            await sock.sendMessage(remoteJid, { text: config.autoReplyMessage });
            botState.repliesSent++;
            console.log('✅ Sent test reply!\n');
          }
          continue;
        }

        // Handle incoming messages from other people
        const contactId = remoteJid;
        const now = Date.now();
        const lastSeen = activityMap[contactId];

        let shouldReply = false;
        let timeDiffMinutes = 0;

        if (!lastSeen) {
          shouldReply = true;
        } else {
          timeDiffMinutes = (now - lastSeen) / (1000 * 60);
          if (timeDiffMinutes >= config.inactivityThresholdMinutes) {
            shouldReply = true;
          }
        }

        // Update contact last seen
        activityMap[contactId] = now;
        saveActivity();

        console.log(`\n📩 [Message Received] From: ${contactId}`);
        console.log(`💬 Text: "${text}"`);

        if (shouldReply) {
          const reason = !lastSeen
            ? 'First message from this contact'
            : `Inactive for ${timeDiffMinutes.toFixed(1)} mins (>= ${config.inactivityThresholdMinutes}m threshold)`;
          console.log(`🤖 [Triggered] Replying because: ${reason}`);

          // Simulate typing
          try {
            await sock.sendPresenceUpdate('composing', remoteJid);
          } catch (e) {}

          if (config.replyDelaySeconds > 0) {
            await new Promise((r) => setTimeout(r, config.replyDelaySeconds * 1000));
          }

          try {
            await sock.sendPresenceUpdate('paused', remoteJid);
          } catch (e) {}

          // Send reply
          await sock.sendMessage(remoteJid, { text: config.autoReplyMessage });

          botState.repliesSent++;
          updateState('ONLINE', `Replied to contact ${contactId}`);
          console.log(`✅ [Vitcha Replied] Successfully sent message to ${contactId}\n`);
        } else {
          console.log(`⏳ [Skipping Reply] Ongoing conversation. Last activity was ${timeDiffMinutes.toFixed(1)} mins ago (< ${config.inactivityThresholdMinutes}m).\n`);
        }
      } catch (err) {
        console.error('❌ Error handling message:', err);
      }
    }
  });
}

// Global safety error handlers
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception:', err);
});

// Start WhatsApp connection
connectToWhatsApp().catch((err) => {
  console.error('❌ Failed to start WhatsApp bot:', err);
  updateState('DISCONNECTED', `Failed to start: ${err.message}`);
});
