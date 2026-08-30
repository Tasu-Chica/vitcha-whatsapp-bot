/**
 * WhatsApp Auto-Reply Bot Configuration Settings
 * Supports environment variables for cloud deployment
 */
module.exports = {
  // Web Server Port for Cloud Dashboard & Healthchecks
  port: parseInt(process.env.PORT || '3000', 10),

  // Bot personality & default auto-reply message
  autoReplyMessage: process.env.AUTO_REPLY_MESSAGE || 
    "Hey this is Vitcha, Tahsin's ai bot. He's either doomscrolling or sleeping his ass off. But dw, I will notify him and he'll be with you shortly. Thank you for your patience.",

  // Inactivity threshold: Send reply if at least this many minutes have passed since the last message
  inactivityThresholdMinutes: parseInt(process.env.INACTIVITY_MINUTES || '60', 10),

  // Ignore messages from group chats
  ignoreGroups: process.env.IGNORE_GROUPS ? process.env.IGNORE_GROUPS === 'true' : true,

  // Ignore messages sent by yourself (from phone/desktop)
  ignoreSelf: true,

  // Ignore status broadcast updates
  ignoreStatus: true,

  // Minimum delay (in seconds) to simulate natural typing
  replyDelaySeconds: parseFloat(process.env.REPLY_DELAY_SECONDS || '1.5'),

  // Specific phone numbers to blacklist (never reply to)
  // Format: "1234567890@c.us"
  blacklist: process.env.BLACKLIST ? process.env.BLACKLIST.split(',').map(s => s.trim()) : [],

  // Whitelist (if non-empty, the bot will ONLY reply to these numbers)
  whitelist: process.env.WHITELIST ? process.env.WHITELIST.split(',').map(s => s.trim()) : []
};
