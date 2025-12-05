# 🚀 תכונות מתקדמות ודוגמאות

## 1. הוספה רק אם יש X מקומות פנויים

רוצה שהבוט יוסיף שמות רק אם יש לפחות 3 מקומות פנויים?

```javascript
function fillEmptySlots(text) {
    const { lines, emptySlots } = parseList(text);
    
    // ✨ החידוש: בדיקה של מינימום מקומות
    const MIN_EMPTY_SLOTS = 3;
    
    if (emptySlots.length === 0) {
        console.log('❌ אין מקומות פנויים ברשימה');
        return null;
    }
    
    if (emptySlots.length < MIN_EMPTY_SLOTS) {
        console.log(`⚠️ יש רק ${emptySlots.length} מקומות פנויים, צריך לפחות ${MIN_EMPTY_SLOTS}`);
        return null;
    }
    
    console.log(`✅ נמצאו ${emptySlots.length} מקומות פנויים`);
    
    // המשך כרגיל...
    let addedCount = 0;
    for (let i = 0; i < emptySlots.length && i < CONFIG.NAMES_TO_ADD.length; i++) {
        const slot = emptySlots[i];
        const name = CONFIG.NAMES_TO_ADD[i];
        lines[slot.lineIndex] = `${slot.number}. ${name}`;
        addedCount++;
    }
    
    if (addedCount > 0) {
        return lines.join('\n');
    }
    
    return null;
}
```

---

## 2. תיוג (tag) אנשים ספציפיים כשיש מקום

רוצה שהבוט יתייג (@) אנשים ספציפיים כשיש מקום?

```javascript
const CONFIG = {
    // ... הגדרות קיימות ...
    
    // מספרי טלפון של אנשים לתיוג (בפורמט בינלאומי)
    PEOPLE_TO_TAG: [
        { name: 'דני', phone: '972501234567' },
        { name: 'רועי', phone: '972507654321' }
    ],
    
    TAG_MESSAGE: '📢 יש מקום במשחק!'
};

client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        if (!chat.isGroup || !chat.name.includes(CONFIG.GROUP_NAME)) {
            return;
        }
        
        if (!isFootballList(message.body)) {
            return;
        }
        
        const { emptySlots } = parseList(message.body);
        
        if (emptySlots.length > 0) {
            console.log(`✅ יש ${emptySlots.length} מקומות פנויים - מתייג אנשים`);
            
            // בנה הודעת תיוג
            let tagMessage = `${CONFIG.TAG_MESSAGE}\n\n`;
            
            for (const person of CONFIG.PEOPLE_TO_TAG) {
                const contact = await client.getContactById(`${person.phone}@c.us`);
                tagMessage += `@${person.phone} `;
            }
            
            // שלח עם mentions
            await chat.sendMessage(tagMessage, {
                mentions: CONFIG.PEOPLE_TO_TAG.map(p => `${p.phone}@c.us`)
            });
            
            console.log('✅ תיוג נשלח');
        }
        
    } catch (error) {
        console.error('❌ שגיאה:', error);
    }
});
```

---

## 3. שמירת היסטוריה של רשימות

רוצה לעקוב אחרי כמה משחקים כל אחד השתתף?

```javascript
const fs = require('fs');

// טוען היסטוריה קיימת או יוצר חדשה
let history = {};
try {
    history = JSON.parse(fs.readFileSync('game-history.json', 'utf8'));
} catch (e) {
    history = {};
}

function saveHistory() {
    fs.writeFileSync('game-history.json', JSON.stringify(history, null, 2));
}

function updateHistory(listText) {
    const lines = listText.split('\n');
    const date = new Date().toISOString().split('T')[0];
    
    if (!history[date]) {
        history[date] = { players: [], count: 0 };
    }
    
    for (const line of lines) {
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match) {
            const name = match[1].trim();
            
            if (!history[date].players.includes(name)) {
                history[date].players.push(name);
                history[date].count++;
                
                // עדכן סטטיסטיקות כוללות
                if (!history.totals) history.totals = {};
                history.totals[name] = (history.totals[name] || 0) + 1;
            }
        }
    }
    
    saveHistory();
    console.log('📊 היסטוריה עודכנה');
}

// שימוש:
client.on('message', async (message) => {
    // ... קוד זיהוי רשימה ...
    
    if (updatedList) {
        updateHistory(updatedList);
        // ... שליחת התגובה ...
    }
});

// פקודה להצגת סטטיסטיקות
client.on('message', async (message) => {
    if (message.body === '!stats') {
        let statsMessage = '📊 *סטטיסטיקות משחקים:*\n\n';
        
        const sorted = Object.entries(history.totals || {})
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        sorted.forEach(([name, count], index) => {
            statsMessage += `${index + 1}. ${name}: ${count} משחקים\n`;
        });
        
        await message.reply(statsMessage);
    }
});
```

---

## 4. התראה אם מישהו מוחק את עצמו

רוצה לדעת כשמישהו מוחק את עצמו מהרשימה?

```javascript
// שמור את הרשימה האחרונה
let lastList = null;

client.on('message', async (message) => {
    try {
        const chat = await message.getChat();
        if (!chat.isGroup || !chat.name.includes(CONFIG.GROUP_NAME)) {
            return;
        }
        
        if (!isFootballList(message.body)) {
            return;
        }
        
        // בדוק אם מישהו התמחק
        if (lastList) {
            const currentPlayers = extractPlayers(message.body);
            const previousPlayers = extractPlayers(lastList);
            
            const removed = previousPlayers.filter(p => !currentPlayers.includes(p));
            
            if (removed.length > 0) {
                const alertMessage = `⚠️ *התראה:* ${removed.join(', ')} הסירו את עצמם מהרשימה`;
                await chat.sendMessage(alertMessage);
                console.log('📢 התראת הסרה נשלחה');
            }
        }
        
        // שמור את הרשימה הנוכחית
        lastList = message.body;
        
    } catch (error) {
        console.error('❌ שגיאה:', error);
    }
});

function extractPlayers(text) {
    const players = [];
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (line.includes('ממתינים')) break;
        
        const match = line.match(/^\d+\.\s+(.+)$/);
        if (match) {
            players.push(match[1].trim());
        }
    }
    
    return players;
}
```

---

## 5. תזמון - הפעלה אוטומטית בימים ושעות ספציפיים

רוצה שהבוט יפעל רק בימי ד' וה' בין השעות 18:00-22:00?

```javascript
function isActiveTime() {
    const now = new Date();
    const day = now.getDay(); // 0 = ראשון, 3 = רביעי, 4 = חמישי
    const hour = now.getHours();
    
    // פעיל רק בימי רביעי (3) וחמישי (4)
    const isActiveDay = day === 3 || day === 4;
    
    // פעיל רק בין 18:00 ל-22:00
    const isActiveHour = hour >= 18 && hour < 22;
    
    return isActiveDay && isActiveHour;
}

client.on('message', async (message) => {
    try {
        // בדיקת זמן פעילות
        if (!isActiveTime()) {
            console.log('⏰ מחוץ לזמני פעילות');
            return;
        }
        
        // המשך כרגיל...
        const chat = await message.getChat();
        // ... וכו'
        
    } catch (error) {
        console.error('❌ שגיאה:', error);
    }
});
```

---

## 6. בוט "חכם" - למידת העדפות

הבוט לומד מי בדרך כלל מגיע ומציע אותם קודם:

```javascript
const fs = require('fs');

let preferences = {
    frequency: {}  // כמה פעמים כל אחד משחק
};

try {
    preferences = JSON.parse(fs.readFileSync('preferences.json', 'utf8'));
} catch (e) {
    console.log('📝 יוצר קובץ העדפות חדש');
}

function savePreferences() {
    fs.writeFileSync('preferences.json', JSON.stringify(preferences, null, 2));
}

function updateFrequency(players) {
    for (const player of players) {
        preferences.frequency[player] = (preferences.frequency[player] || 0) + 1;
    }
    savePreferences();
}

function getSuggestedPlayers(count) {
    // מיין לפי תדירות
    const sorted = Object.entries(preferences.frequency)
        .sort((a, b) => b[1] - a[1])
        .map(([name]) => name);
    
    return sorted.slice(0, count);
}

// שימוש:
client.on('message', async (message) => {
    // ... זיהוי רשימה ...
    
    const currentPlayers = extractPlayers(message.body);
    updateFrequency(currentPlayers);
    
    const { emptySlots } = parseList(message.body);
    
    if (emptySlots.length > 0) {
        // השתמש בשחקנים המומלצים במקום ברשימה הקבועה
        const suggested = getSuggestedPlayers(emptySlots.length);
        
        // אפשר גם לשלוח המלצה בלי להוסיף אוטומטית:
        const suggestionMessage = `💡 *הצעה:* מועמדים מומלצים:\n${suggested.join('\n')}`;
        await message.reply(suggestionMessage);
    }
});
```

---

## 7. אינטגרציה עם Google Calendar

הוספת משחקים אוטומטית ללוח השנה:

```javascript
const { google } = require('googleapis');

// הגדרת Google Calendar API (צריך להגדיר credentials)
const calendar = google.calendar({ version: 'v3', auth: YOUR_AUTH });

async function addToCalendar(listText) {
    // חלץ תאריך ושעה מהרשימה
    const dateMatch = listText.match(/יום (\w+)/);
    const timeMatch = listText.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
    const fieldMatch = listText.match(/מגרש (\d+)/);
    
    if (!dateMatch || !timeMatch || !fieldMatch) {
        console.log('⚠️ לא ניתן לחלץ תאריך/שעה');
        return;
    }
    
    const event = {
        summary: `כדורגל - מגרש ${fieldMatch[1]}`,
        description: 'משחק כדורגל שבועי',
        start: {
            dateTime: calculateDateTime(dateMatch[1], timeMatch[1]),
            timeZone: 'Asia/Jerusalem',
        },
        end: {
            dateTime: calculateDateTime(dateMatch[1], timeMatch[2]),
            timeZone: 'Asia/Jerusalem',
        },
    };
    
    try {
        const res = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });
        
        console.log('📅 אירוע נוסף ללוח השנה:', res.data.htmlLink);
    } catch (error) {
        console.error('❌ שגיאה בהוספה ללוח שנה:', error);
    }
}

function calculateDateTime(day, time) {
    // לוגיקה להמרת "יום רביעי 21:00" לתאריך מלא
    // זה דוגמה מפושטת - צריך לוגיקה יותר מורכבת
    const daysMap = {
        'ראשון': 0, 'שני': 1, 'שלישי': 2, 
        'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6
    };
    
    // חשב את התאריך הבא של היום המבוקש
    const now = new Date();
    const targetDay = daysMap[day];
    const daysUntil = (targetDay - now.getDay() + 7) % 7;
    
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() + daysUntil);
    
    const [hours, minutes] = time.split(':');
    targetDate.setHours(parseInt(hours), parseInt(minutes), 0);
    
    return targetDate.toISOString();
}
```

---

## 8. מערכת דירוג שחקנים

```javascript
let ratings = {};

// טוען דירוגים קיימים
try {
    ratings = JSON.parse(fs.readFileSync('ratings.json', 'utf8'));
} catch (e) {
    ratings = {};
}

// פקודה לדירוג שחקן
client.on('message', async (message) => {
    const rateMatch = message.body.match(/^!rate\s+(.+?)\s+(\d+)$/);
    
    if (rateMatch) {
        const [, playerName, rating] = rateMatch;
        const score = parseInt(rating);
        
        if (score >= 1 && score <= 10) {
            if (!ratings[playerName]) {
                ratings[playerName] = { total: 0, count: 0 };
            }
            
            ratings[playerName].total += score;
            ratings[playerName].count++;
            ratings[playerName].average = (ratings[playerName].total / ratings[playerName].count).toFixed(1);
            
            fs.writeFileSync('ratings.json', JSON.stringify(ratings, null, 2));
            
            await message.reply(`✅ ${playerName} דורג ${score}/10 (ממוצע: ${ratings[playerName].average})`);
        }
    }
    
    // הצגת דירוגים
    if (message.body === '!ratings') {
        let ratingsMessage = '⭐ *דירוגי שחקנים:*\n\n';
        
        const sorted = Object.entries(ratings)
            .map(([name, data]) => ({ name, average: data.average, count: data.count }))
            .sort((a, b) => b.average - a.average)
            .slice(0, 10);
        
        sorted.forEach(({ name, average, count }, index) => {
            ratingsMessage += `${index + 1}. ${name}: ${average}⭐ (${count} דירוגים)\n`;
        });
        
        await message.reply(ratingsMessage);
    }
});
```

---

## 9. התראה על מזג אוויר

שילוב עם API של מזג אוויר:

```javascript
const axios = require('axios');

async function getWeather(date) {
    try {
        // דוגמה עם OpenWeatherMap API (צריך API key)
        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/forecast?q=Tel-Aviv&appid=YOUR_API_KEY&units=metric`
        );
        
        // מצא תחזית ליום המשחק
        const forecast = response.data.list.find(item => {
            const forecastDate = new Date(item.dt * 1000);
            return forecastDate.toDateString() === date.toDateString();
        });
        
        if (forecast) {
            return {
                temp: Math.round(forecast.main.temp),
                desc: forecast.weather[0].description,
                rain: forecast.rain ? forecast.rain['3h'] : 0
            };
        }
    } catch (error) {
        console.error('❌ שגיאה בקבלת מזג אוויר:', error);
    }
    
    return null;
}

client.on('message', async (message) => {
    // ... זיהוי רשימה ...
    
    if (isFootballList(message.body)) {
        const gameDate = extractGameDate(message.body);
        const weather = await getWeather(gameDate);
        
        if (weather && updatedList) {
            const weatherNote = `\n\n🌤️ תחזית: ${weather.temp}°C, ${weather.desc}`;
            if (weather.rain > 0) {
                weatherNote += ` ☔ (סיכוי לגשם!)`;
            }
            
            await message.reply(updatedList + weatherNote);
        }
    }
});
```

---

## 💡 רעיונות נוספים

1. **מערכת הצבעות** - הצבעה על זמן המשחק
2. **בוט תזכורות** - שליחת תזכורת יום לפני
3. **מעקב אחר תשלומים** - ניהול תשלומים עבור המגרש
4. **מערכת איזון קבוצות** - חלוקה אוטומטית לקבוצות מאוזנות
5. **חישוב כושר** - מעקב אחרי ביצועים בכל משחק

---

**בחר את התכונות שאתה צריך והוסף אותן לבוט שלך! 🚀**
