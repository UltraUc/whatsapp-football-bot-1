#!/bin/bash

# WhatsApp Bot - Server Setup Script
# סקריפט התקנה לשרת Google Cloud / Linux

echo "🚀 מתחיל התקנת תלויות לבוט WhatsApp..."

# עדכון המערכת
echo "📦 מעדכן את המערכת..."
sudo apt-get update

# התקנת Node.js אם לא קיים
if ! command -v node &> /dev/null; then
    echo "📥 מתקין Node.js 18.x..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo "✅ Node.js כבר מותקן: $(node --version)"
fi

# התקנת כל התלויות של Chromium
echo "🌐 מתקין תלויות Chromium..."
sudo apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    fonts-noto-color-emoji \
    fonts-noto-cjk

# התקנת Chromium או Google Chrome
echo "🌐 מתקין Chromium/Chrome..."

# נסה להתקין chromium (שם החבילה בגרסאות חדשות)
if sudo apt-get install -y chromium 2>/dev/null; then
    echo "✅ Chromium הותקן בהצלחה"
    # הגדר את המשתנה לשימוש בchromium
    export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
else
    echo "⚠️ Chromium לא זמין, מתקין Google Chrome..."
    # התקנת Google Chrome
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
    echo "✅ Google Chrome הותקן בהצלחה"
fi

# התקנת PM2 אם לא קיים
if ! command -v pm2 &> /dev/null; then
    echo "⚙️ מתקין PM2..."
    sudo npm install -g pm2
else
    echo "✅ PM2 כבר מותקן"
fi

# התקנת תלויות הפרויקט
if [ -f "package.json" ]; then
    echo "📦 מתקין תלויות הפרויקט..."
    npm install
    
    # התקנת puppeteer עם כל התלויות
    echo "🤖 מתקין Puppeteer..."
    npm install puppeteer --unsafe-perm=true --allow-root
else
    echo "⚠️ לא נמצא package.json - ודא שאתה בתיקיית הפרויקט"
fi

# ניקוי cache ישן
echo "🧹 מנקה session ישנים..."
rm -rf .wwebjs_auth .wwebjs_cache 2>/dev/null

echo ""
echo "✅ ההתקנה הושלמה!"
echo ""
echo "📝 הוראות הפעלה:"
echo "1. הפעל את הבוט: pm2 start whatsapp-football-bot.js --name whatsapp-bot"
echo "2. צפה בלוגים: pm2 logs whatsapp-bot"
echo "3. סרוק את ה-QR code שיופיע"
echo "4. שמור את ההגדרות: pm2 save"
echo "5. הגדר הפעלה אוטומטית: pm2 startup"
echo ""
echo "⚡ טיפ: אם ה-QR code לא עובד, נסה:"
echo "   pm2 delete whatsapp-bot"
echo "   rm -rf .wwebjs_auth .wwebjs_cache"
echo "   pm2 start whatsapp-football-bot.js --name whatsapp-bot"
echo ""
