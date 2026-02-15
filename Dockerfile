# WhatsApp Football Bot - Dockerfile
FROM node:20-slim

# התקנת Chrome/Chromium לפעולת Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    fonts-noto-color-emoji \
    libxss1 \
    dumb-init \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# הגדרת משתני סביבה ל-Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# יצירת תיקיית עבודה
WORKDIR /app

# העתקת קבצי התלויות
COPY package*.json ./

# התקנת תלויות
RUN npm ci --omit=dev

# העתקת קבצי הפרויקט
COPY . .

# יצירת תיקייה לאחסון האימות
RUN mkdir -p /app/.wwebjs_auth && chmod 777 /app/.wwebjs_auth

# חשיפת פורט הדשבורד
EXPOSE 3000

# שימוש ב-dumb-init לטיפול נכון בסיגנלים
ENTRYPOINT ["dumb-init", "--"]

# הפעלת הבוט
CMD ["node", "whatsapp-football-bot.js"]

