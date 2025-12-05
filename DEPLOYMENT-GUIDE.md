# 🖥️ הפעלת הבוט על שרת (24/7)

מדריך להרצת הבוט באופן קבוע על Raspberry Pi, VPS, או מחשב ייעודי.

---

## 🍓 Raspberry Pi

### למה Raspberry Pi?
- 💰 זול (200-400 ₪)
- ⚡ צריכת חשמל נמוכה
- 🔇 שקט (אין מאוורר)
- 🏠 אפשר להשאיר בבית 24/7

### דרישות
- Raspberry Pi 3/4/5 (מומלץ 4GB RAM)
- כרטיס SD (16GB+)
- ספק כוח
- חיבור לאינטרנט (WiFi/Ethernet)

---

## 📦 התקנה על Raspberry Pi

### שלב 1: התקן את המערכת

1. **הורד Raspberry Pi OS:**
   - לך ל-https://www.raspberrypi.com/software/
   - הורד Raspberry Pi Imager
   - צרוב את "Raspberry Pi OS (64-bit)" על כרטיס SD

2. **הגדר SSH (אופציונלי אבל מומלץ):**
   - בRaspberry Pi Imager, לחץ על ⚙️
   - הפעל SSH
   - הגדר שם משתמש וסיסמה
   - הגדר WiFi

3. **אתחל את הRaspberry Pi**

### שלב 2: התחבר לRaspberry Pi

**מהמחשב שלך:**
```bash
# מצא את הIP של הRaspberry Pi
# אופציה 1: בנתב שלך
# אופציה 2: סרוק רשת
nmap -sn 192.168.1.0/24

# התחבר
ssh pi@192.168.1.xxx  # החלף בIP האמיתי
```

### שלב 3: התקן Node.js

```bash
# עדכן את המערכת
sudo apt update
sudo apt upgrade -y

# התקן Node.js (גרסה 18)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# בדוק התקנה
node --version  # צריך להראות v18.x.x
npm --version
```

### שלב 4: העבר את הקבצים

**מהמחשב שלך:**
```bash
# צור תיקייה חדשה
ssh pi@192.168.1.xxx "mkdir -p ~/whatsapp-bot"

# העבר קבצים
scp whatsapp-football-bot.js package.json pi@192.168.1.xxx:~/whatsapp-bot/
```

**או העתק ידנית עם USB:**
```bash
# ב-Raspberry Pi
cd ~/whatsapp-bot
# העתק את הקבצים מה-USB
```

### שלב 5: התקן תלויות

```bash
# ב-Raspberry Pi
cd ~/whatsapp-bot
npm install
```

### שלב 6: הרץ את הבוט

```bash
# הרצה ראשונית לסריקת QR
npm start
```

**סרוק את הQR code עם הטלפון שלך**

לאחר ההתחברות, עצור (`Ctrl+C`) והמשך לשלב הבא.

### שלב 7: הפעל עם PM2

```bash
# התקן PM2
sudo npm install -g pm2

# הפעל את הבוט
pm2 start whatsapp-football-bot.js --name football-bot

# שמור
pm2 save

# הגדר הפעלה אוטומטית
pm2 startup
# הרץ את הפקודה שPM2 נותן לך

pm2 save
```

---

## ☁️ VPS (Virtual Private Server)

### ספקים מומלצים (5-10$ לחודש)
- **DigitalOcean** - פשוט ונוח
- **Linode** - אמין
- **Vultr** - זול
- **Hetzner** - מהיר באירופה

### התקנה על VPS

רוב הVPS מגיעים עם Ubuntu/Debian מותקן.

```bash
# התחבר לVPS
ssh root@your-vps-ip

# עדכן מערכת
apt update && apt upgrade -y

# התקן Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# צור משתמש חדש (אל תשתמש ב-root!)
adduser botuser
usermod -aG sudo botuser

# עבור למשתמש החדש
su - botuser

# צור תיקייה לבוט
mkdir ~/whatsapp-bot
cd ~/whatsapp-bot

# העלה קבצים (מהמחשב המקומי)
# scp whatsapp-football-bot.js package.json botuser@your-vps-ip:~/whatsapp-bot/

# התקן תלויות
npm install

# התקן PM2
sudo npm install -g pm2

# הרץ את הבוט לסריקת QR (בפעם הראשונה)
npm start
# סרוק את הQR code

# עצור (Ctrl+C) ואז הפעל עם PM2
pm2 start whatsapp-football-bot.js --name football-bot
pm2 startup
pm2 save
```

---

## 🐳 Docker (אופציה מתקדמת)

צור `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# התקן Chromium (נדרש ל-Puppeteer)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# הגדר משתנה לChromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# העתק קבצים
COPY package*.json ./
RUN npm install

COPY . .

# הרץ את הבוט
CMD ["npm", "start"]
```

צור `docker-compose.yml`:

```yaml
version: '3.8'

services:
  whatsapp-bot:
    build: .
    container_name: football-bot
    restart: unless-stopped
    volumes:
      - ./data:/app/.wwebjs_auth
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
```

הפעל:
```bash
docker-compose up -d
```

---

## 🔐 אבטחה

### עבור VPS - חשוב מאוד!

```bash
# 1. שנה פורט SSH
sudo nano /etc/ssh/sshd_config
# שנה את Port 22 למשהו אחר (למשל 2222)
sudo systemctl restart sshd

# 2. הגדר Firewall
sudo ufw allow 2222/tcp  # הפורט החדש שלך
sudo ufw enable

# 3. השבת כניסה כ-root
sudo nano /etc/ssh/sshd_config
# שנה: PermitRootLogin no
sudo systemctl restart sshd

# 4. התקן fail2ban (הגנה מפני brute force)
sudo apt install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

---

## 📊 ניטור מרחוק

### עם PM2 Plus (חינמי למספר מוגבל של שרתים)

```bash
# התחבר לPM2 Plus
pm2 link <secret_key> <public_key>
```

לך ל-https://app.pm2.io/ כדי לראות דשבורד.

### עם Telegram Bot (התראות)

הוסף לקובץ הבוט:

```javascript
const TelegramBot = require('node-telegram-bot-api');
const telegramBot = new TelegramBot('YOUR_TELEGRAM_BOT_TOKEN', { polling: false });
const ADMIN_CHAT_ID = 'YOUR_TELEGRAM_CHAT_ID';

// שלח התראה
async function notifyAdmin(message) {
    try {
        await telegramBot.sendMessage(ADMIN_CHAT_ID, `🤖 *בוט כדורגל*\n\n${message}`, {
            parse_mode: 'Markdown'
        });
    } catch (error) {
        console.error('שגיאה בשליחת התראה:', error);
    }
}

// שימוש
client.on('ready', () => {
    console.log('✅ הבוט מוכן!');
    notifyAdmin('✅ הבוט התחבר בהצלחה!');
});

client.on('disconnected', (reason) => {
    console.log('⚠️ התנתק:', reason);
    notifyAdmin(`⚠️ הבוט התנתק: ${reason}`);
});
```

---

## 🔄 עדכון מרחוק

### אפשרות 1: SSH ידני

```bash
ssh user@your-server
cd ~/whatsapp-bot
pm2 stop football-bot
git pull  # אם אתה משתמש ב-Git
# או העתק קבצים חדשים
pm2 restart football-bot
```

### אפשרות 2: סקריפט אוטומטי

צור `update.sh`:

```bash
#!/bin/bash

echo "🔄 מעדכן את הבוט..."

# עצור את הבוט
pm2 stop football-bot

# גיבוי
cp whatsapp-football-bot.js whatsapp-football-bot.js.backup

# ערוך את הקוד כאן
nano whatsapp-football-bot.js

# הפעל מחדש
pm2 restart football-bot

echo "✅ עדכון הושלם!"
```

---

## 💾 גיבוי אוטומטי

צור סקריפט גיבוי `backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# גבה את קובץ האימות
tar -czf $BACKUP_DIR/bot-backup-$DATE.tar.gz \
    ~/whatsapp-bot/.wwebjs_auth \
    ~/whatsapp-bot/whatsapp-football-bot.js \
    ~/whatsapp-bot/package.json

# שמור רק 7 גיבויים אחרונים
cd $BACKUP_DIR
ls -t | tail -n +8 | xargs rm -f

echo "✅ גיבוי נוצר: bot-backup-$DATE.tar.gz"
```

הוסף ל-crontab (גיבוי יומי בחצות):
```bash
crontab -e

# הוסף שורה:
0 0 * * * ~/whatsapp-bot/backup.sh
```

---

## 🔍 פתרון בעיות נפוצות

### בעיה: QR code לא מופיע בSSH

**פתרון:**
```bash
# אפשרות 1: השתמש ב-screen
screen -S whatsapp-bot
npm start
# סרוק את הQR
# Ctrl+A, D (detach)

# אפשרות 2: הרץ במצב headless עם QR code מקומי
# קודם, הרץ פעם אחת מהמחשב המקומי
# אחרי סריקת הQR, העתק את .wwebjs_auth לשרת
```

### בעיה: הבוט מתנתק כל הזמן

```bash
# הוסף keep-alive script
pm2 start whatsapp-football-bot.js --name football-bot --max-restarts 10
```

### בעיה: Chromium לא עובד

```bash
# התקן תלויות חסרות
sudo apt install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgconf-2-4 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    libappindicator1 \
    xdg-utils
```

---

## 📈 ביצועים והמלצות

### Raspberry Pi 4 (4GB):
- ✅ מספיק ל-1-3 בוטים
- צריכת חשמל: ~5W
- עלות חודשית: ~2-3 ₪

### VPS (1GB RAM):
- ✅ מספיק לבוט אחד
- עלות: 5-10$ לחודש

### מומלץ:
- 🏠 Raspberry Pi אם יש לך בבית חיבור יציב
- ☁️ VPS אם אתה רוצה גישה מכל מקום

---

## ✅ צ'קליסט deployment

- [ ] שרת פועל (Raspberry Pi/VPS)
- [ ] Node.js מותקן (v16+)
- [ ] קבצי הבוט הועתקו
- [ ] `npm install` הורץ
- [ ] QR code נסרק
- [ ] PM2 מותקן ומוגדר
- [ ] הפעלה אוטומטית מוגדרת
- [ ] גיבוי אוטומטי פועל
- [ ] ניטור מרחוק פועל (אופציונלי)

---

**עכשיו הבוט שלך רץ 24/7! ⚽🤖**

יש בעיות? בדוק:
1. `pm2 logs football-bot` - לוגים
2. `pm2 status` - סטטוס
3. `pm2 monit` - ניטור

צריך עזרה? שלח לי הודעה!
