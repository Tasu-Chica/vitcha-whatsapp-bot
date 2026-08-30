# Vitcha - Tahsin's WhatsApp AI Bot 🤖

An automated WhatsApp assistant that manages incoming messages and responds when you've been away for at least **1 hour**.

---

## 💬 Auto-Reply Message

> *"Hey this is Vitcha, Tahsin's ai bot. He's either doomscrolling or sleeping his ass off. But dw, I will notify him and he'll be with you shortly. Thank you for your patience."*

---

## ⚡ How the 1-Hour Logic Works

1. **New / Inactive Conversation ( $\ge$ 1 hour)**:
   - When someone texts you after at least 1 hour of silence (or for the first time), Vitcha immediately steps in, shows a typing indicator, and sends the message above.
2. **Active Ongoing Conversation ( < 1 hour)**:
   - If they reply or continue texting within that 1-hour window, Vitcha **stays silent** and doesn't interrupt or spam the chat.
3. **Smart Reset When You Chat**:
   - Whenever you (Tahsin) reply or text someone from your phone or WhatsApp Web, the 1-hour timer resets for that contact.
4. **Persistent History**:
   - Activity timestamps are saved to `activity.json` so the bot remembers conversation timings even if restarted.

---

## 🚀 How to Run

1. Double click **[`start-bot.bat`](file:///C:/Users/USER/.gemini/antigravity/scratch/whatsapp-autoreply-bot/start-bot.bat)**
2. (Or run `npm start` in PowerShell).
3. The bot will automatically resume your linked session without needing to re-scan!
