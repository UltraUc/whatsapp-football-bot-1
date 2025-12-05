# WhatsApp Football Bot - Dockerfile
FROM node:18-slim

# התקנת Chrome/Chromium לפעולת Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# הגדרת משתני סביבה ל-Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# יצירת תיקיית עבודה
WORKDIR /app

# העתקת קבצי התלויות
COPY package*.json ./

# התקנת תלויות
RUN npm ci --only=production

# העתקת קבצי הפרויקט
COPY . .

# יצירת תיקייה לאחסון האימות
RUN mkdir -p /app/.wwebjs_auth && chmod 777 /app/.wwebjs_auth

# חשיפת פורט הדשבורד
EXPOSE 3000

# הפעלת הבוט
CMD ["node", "whatsapp-football-bot.js"]

