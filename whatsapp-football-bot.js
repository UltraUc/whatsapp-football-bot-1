const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

// ============ הגדרות ============
const CONFIG_FILE = path.join(__dirname, 'config.json');

// טעינת הגדרות מקובץ
function loadConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.log('⚠️ לא נמצא קובץ הגדרות, יוצר ברירת מחדל...');
        const defaultConfig = {
            selectedGroups: [],
            membersToAdd: ['שמך הפרטי', 'חבר 2', 'חבר 3'],
            keywords: ['כדורגל', 'מגרש', 'יום'],
            replyMode: true,
            delayMs: 2000,
            requireConfirmation: false,
            addToWaitlist: true,
            selfTestMode: false
        };
        saveConfig(defaultConfig);
        return defaultConfig;
    }
}

// שמירת הגדרות לקובץ
function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
        console.log('✅ ההגדרות נשמרו בהצלחה');
        return true;
    } catch (error) {
        console.error('❌ שגיאה בשמירת ההגדרות:', error);
        return false;
    }
}

let config = loadConfig();

// ============ Express Server ============
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ משתנים גלובליים ============
let botStatus = {
    isReady: false,
    isAuthenticated: false,
    qrCode: null,
    connectedClients: 0
};

let groupsCache = null; // מטמון לקבוצות
let isLoadingGroups = false;
let pendingConfirmations = new Map(); // אחסון בקשות אישור ממתינות
let processedMessages = new Set(); // מניעת עיבוד כפול של הודעות
let messageStats = { total: 0, groups: 0, processed: 0, errors: 0 }; // סטטיסטיקות

// ============ יצירת הבוט ============
let client = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 10000; // 10 שניות

// מציאת נתיב Chromium אוטומטית (תומך Windows + Linux)
function findChromiumPath() {
    const possiblePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        // Windows paths
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe'),
        // Linux paths
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/snap/bin/chromium',
        '/usr/lib/chromium/chromium',
        '/usr/lib/chromium-browser/chromium-browser'
    ];
    
    for (const p of possiblePaths) {
        if (p && fs.existsSync(p)) {
            console.log(`✅ נמצא Chrome/Chromium: ${p}`);
            return p;
        }
    }
    
    console.log('⚠️ לא נמצא Chrome/Chromium חיצוני - משתמש ב-bundled Chromium של puppeteer');
    return undefined; // יאפשר ל-puppeteer להשתמש ב-bundled chromium
}

function createClient() {
    const chromiumPath = findChromiumPath();
    
    return new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth',
            clientId: 'whatsapp-bot'
        }),
        puppeteer: {
            headless: true,
            executablePath: chromiumPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--disable-default-apps',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-domain-reliability',
                '--disable-features=AudioServiceOutOfProcess',
                '--disable-print-preview',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--force-color-profile=srgb',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--safebrowsing-disable-auto-update',
                '--password-store=basic',
                '--use-mock-keychain',
                '--export-tagged-pdf',
                '--window-size=1920,1080'
            ],
            timeout: 120000, // 2 דקות timeout
            protocolTimeout: 120000
        },
        webVersionCache: {
            type: 'local'
        }
    });
}

function setupClientEvents() {
    // QR Code
    client.on('qr', (qr) => {
        console.log('📱 QR code נוצר - סרוק עם WhatsApp!');
        qrcode.generate(qr, { small: true });
        botStatus.qrCode = qr;
        botStatus.isReady = false;
        botStatus.isAuthenticated = false;
        io.emit('qr-code', qr);
        io.emit('status-update', botStatus);
    });

    // Loading screen - שלח עדכונים לדשבורד
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ טוען: ${percent}% - ${message}`);
        io.emit('loading-progress', { percent, message });
        io.emit('log', { message: `טוען WhatsApp: ${percent}%` });
    });

    // אימות הצליח
    client.on('authenticated', () => {
        console.log('🔐 אימות הצליח!');
        botStatus.isAuthenticated = true;
        botStatus.qrCode = null;
        io.emit('status-update', botStatus);
    });

    // מוכן
    client.on('ready', async () => {
        console.log('');
        console.log('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉');
        console.log('');
        console.log('     ✅✅✅ הבוט מוכן לפעולה! ✅✅✅');
        console.log('');
        console.log('🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉');
        console.log('');
        
        // הצג את ההגדרות הנוכחיות
        console.log('📋 הגדרות נוכחיות:');
        console.log(`   - קבוצות נבחרות: ${config.selectedGroups.length}`);
        if (config.selectedGroups.length > 0) {
            config.selectedGroups.forEach((gId, idx) => {
                const savedName = config.savedGroups?.[gId]?.name || '(שם לא ידוע)';
                console.log(`   - [${idx+1}] ${savedName} => ${gId}`);
            });
        } else {
            console.log('   ⚠️ אין קבוצות נבחרות! לך לדשבורד ובחר קבוצות');
        }
        console.log(`   - שחקנים: ${config.membersToAdd.join(', ')}`);
        console.log(`   - מילות מפתח: ${config.keywords.join(', ')}`);
        console.log(`   - מצב טסט עצמי: ${config.selfTestMode ? '✅ מופעל' : '❌ כבוי'}`);
        console.log(`   - דרוש אישור: ${config.requireConfirmation ? 'כן' : 'לא'}`);
        console.log('');
        
        isClientReady = true;
        botStatus.isReady = true;
        botStatus.isAuthenticated = true;
        botStatus.qrCode = null;
        reconnectAttempts = 0;
        io.emit('status-update', botStatus);
        io.emit('log', { message: '✅ הבוט מחובר ומוכן!' });

        // בדיקת חיבור לקבוצות נבחרות
        if (config.selectedGroups.length > 0) {
            console.log('');
            console.log('🔍 בודק חיבור לקבוצות נבחרות...');
            for (const groupId of config.selectedGroups) {
                try {
                    const chat = await client.getChatById(groupId);
                    if (chat) {
                        console.log(`   ✅ מחובר לקבוצה: ${chat.name} (${groupId})`);
                        // וודא שהקבוצה ב-cache
                        addGroupFromMessage(groupId, chat.name);
                    } else {
                        console.log(`   ❌ לא מצליח למצוא קבוצה: ${groupId}`);
                    }
                } catch (err) {
                    console.log(`   ❌ שגיאה בגישה לקבוצה ${groupId}: ${err.message}`);
                }
            }
        }

        // טען קבוצות ברקע
        loadGroupsBackground();
        
        console.log('');
        console.log('════════════════════════════════════════════');
        console.log('👂 הבוט מאזין להודעות (events: message + message_create)');
        console.log('📝 שלח הודעה לקבוצה שבחרת כדי לבדוק');
        console.log(`🔑 קבוצות נבחרות: ${config.selectedGroups.join(', ') || '(אין - לך לדשבורד!)'}`);
        console.log('════════════════════════════════════════════');
        console.log('');
        
        // הפעל heartbeat log כל 60 שניות כדי לראות שהבוט חי
        setInterval(() => {
            console.log(`💓 [${new Date().toLocaleTimeString('he-IL')}] הבוט חי | הודעות: ${messageStats.total} | קבוצות: ${messageStats.groups} | עובדו: ${messageStats.processed} | שגיאות: ${messageStats.errors}`);
        }, 60000);
    });

    // אימות נכשל
    client.on('auth_failure', (msg) => {
        console.error('❌ אימות נכשל!', msg);
        botStatus.isAuthenticated = false;
        botStatus.isReady = false;
        isClientReady = false;
        io.emit('status-update', botStatus);
    });

    // התנתקות - עם מנגנון חיבור מחדש אוטומטי
    client.on('disconnected', async (reason) => {
        console.log('⚠️ התנתק:', reason);
        botStatus.isReady = false;
        botStatus.isAuthenticated = false;
        isClientReady = false;
        io.emit('status-update', botStatus);
        
        // נסה להתחבר מחדש אוטומטית
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++;
            console.log(`🔄 מנסה להתחבר מחדש (ניסיון ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
            io.emit('log', { message: `מנסה להתחבר מחדש (ניסיון ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...` });
            
            setTimeout(async () => {
                try {
                    // הרס את ה-client הישן
                    try {
                        await client.destroy();
                    } catch (e) {
                        console.log('⚠️ שגיאה בהריסת client (לא קריטי):', e.message);
                    }
                    
                    // צור client חדש והתחבר
                    client = createClient();
                    setupClientEvents();
                    await client.initialize();
                } catch (error) {
                    console.error('❌ שגיאה בחיבור מחדש:', error.message);
                    io.emit('error', { message: 'שגיאה בחיבור מחדש: ' + error.message });
                }
            }, RECONNECT_DELAY);
        } else {
            console.error('❌ נכשלו כל ניסיונות החיבור מחדש');
            io.emit('error', { message: 'נכשלו כל ניסיונות החיבור מחדש. נא לרענן את הדף ולסרוק QR מחדש.' });
        }
    });
    
    // טיפול בשגיאות כלליות
    client.on('change_state', (state) => {
        console.log('📱 מצב WhatsApp השתנה:', state);
        io.emit('log', { message: `מצב WhatsApp: ${state}` });
    });

    // === הודעות - משתמשים בשני events עם deduplication לכיסוי מקסימלי ===
    
    // פונקציה פנימית לעיבוד הודעה עם deduplication
    function processIncomingMessage(message, eventName) {
        const msgId = message.id?._serialized || message.id?.id || `${message.from}_${Date.now()}`;
        
        messageStats.total++;
        
        console.log('\n');
        console.log('═══════════════════════════════════════');
        console.log(`📩 [EVENT: ${eventName}] הודעה התקבלה!`);
        console.log(`   🆔 ID: ${msgId}`);
        console.log(`   📱 from: ${message.from}`);
        console.log(`   📱 fromMe: ${message.fromMe}`);
        console.log(`   📝 type: ${message.type}`);
        console.log(`   🔤 body: "${message.body?.substring(0, 50) || '(ריק)'}"${message.body?.length > 50 ? '...' : ''}`);
        console.log(`   👥 isGroupMsg: ${message.from?.endsWith('@g.us') ? 'כן ✅' : 'לא ❌'}`);
        console.log(`   📊 סה"כ הודעות: ${messageStats.total} | קבוצות: ${messageStats.groups} | עובדו: ${messageStats.processed}`);
        console.log('═══════════════════════════════════════');
        
        // בדיקת deduplication
        if (processedMessages.has(msgId)) {
            console.log(`⏭️ הודעה ${msgId} כבר עובדה (${eventName}), מדלג`);
            return;
        }
        processedMessages.add(msgId);
        
        // ניקוי ה-Set כל 200 הודעות למניעת דליפת זיכרון
        if (processedMessages.size > 200) {
            const arr = Array.from(processedMessages);
            arr.slice(0, 100).forEach(id => processedMessages.delete(id));
            console.log('🧹 נוקו הודעות ישנות מה-dedup cache');
        }
        
        // בדיקה אם זו הודעה מקבוצה
        if (message.from?.endsWith('@g.us')) {
            messageStats.groups++;
            console.log(`👥 הודעת קבוצה! (from: ${message.from})`);
            
            // בדוק אם הקבוצה ברשימה הנבחרת
            if (config.selectedGroups.includes(message.from)) {
                console.log(`⭐ הקבוצה ${message.from} נמצאת ברשימה הנבחרת!`);
            } else {
                console.log(`ℹ️ הקבוצה ${message.from} לא ברשימה הנבחרת`);
                console.log(`   📋 קבוצות נבחרות: ${config.selectedGroups.join(', ') || '(אין)'}`);
            }
        }
        
        // דלג על הודעות עצמיות (אלא אם מצב טסט מופעל)
        if (message.fromMe && !config.selfTestMode) {
            console.log('⏭️ דילוג על הודעה עצמית (מצב טסט כבוי)');
            return;
        }
        
        // דלג על הודעות שאינן טקסט
        if (message.type !== 'chat') {
            console.log(`⏭️ דילוג על הודעה מסוג: ${message.type}`);
            return;
        }
        
        // עבד את ההודעה
        messageStats.processed++;
        handleMessage(message);
    }
    
    // Event ראשי - message - מקבל הודעות נכנסות
    client.on('message', async (message) => {
        try {
            processIncomingMessage(message, 'message');
        } catch (err) {
            messageStats.errors++;
            console.error('❌ שגיאה ב-message event:', err.message);
        }
    });

    // Event משני - message_create - תופס גם הודעות שלא נתפסו ב-message
    client.on('message_create', async (message) => {
        try {
            // אם זו הודעה עצמית במצב טסט - עבד אותה
            if (message.fromMe && config.selfTestMode) {
                processIncomingMessage(message, 'message_create:self');
                return;
            }
            
            // אם זו לא הודעה עצמית - נסה לעבד (deduplication ימנע כפילות עם message event)
            if (!message.fromMe) {
                processIncomingMessage(message, 'message_create:backup');
            }
        } catch (err) {
            messageStats.errors++;
            console.error('❌ שגיאה ב-message_create event:', err.message);
        }
    });
    
    // Event נוסף - group_join - כשמישהו נכנס לקבוצה
    client.on('group_join', (notification) => {
        console.log(`👋 מישהו הצטרף לקבוצה: ${notification.chatId}`);
    });

    // לוג שה-events הוגדרו
    console.log('✅ Event listeners הוגדרו בהצלחה (message + message_create + deduplication)');
    console.log('👂 מחכה להודעות...');
}

// טעינת קבוצות ברקע ללא חסימה
async function loadGroupsBackground() {
    console.log('📋 מתחיל לטעון קבוצות ברקע...');
    
    // קודם נסה לטעון מ-cache (מהיר)
    const savedGroups = loadGroupsFromFile();
    if (savedGroups && savedGroups.length > 0) {
        groupsCache = savedGroups;
        console.log(`📦 נטענו ${savedGroups.length} קבוצות מ-cache`);
        io.emit('log', { message: `נטענו ${savedGroups.length} קבוצות מ-cache` });
    }
    
    // אחרי 5 שניות - עדכן מ-WhatsApp ברקע
    setTimeout(async () => {
        try {
            console.log('🔄 מעדכן קבוצות מ-WhatsApp ברקע...');
            await loadGroupsFromWhatsApp();
            console.log('✅ קבוצות עודכנו!');
        } catch (e) {
            console.log('⚠️ בעיה בעדכון קבוצות:', e.message);
        }
    }, 5000);
}

// ============ פונקציות עזר ============

/**
 * בודק אם ההודעה היא רשימת כדורגל
 */
function isFootballList(message) {
    const text = message.toLowerCase();
    
    // בדיקה 1: מילות מפתח רגילות
    const hasKeywords = config.keywords.some(keyword => text.includes(keyword.toLowerCase()));
    
    // בדיקה 2: האם יש רשימה ממוספרת (לפחות 2 שורות עם מספרים)
    const numberedLines = message.split('\n').filter(line => {
        // מחפש שורות שמתחילות במספר ונקודה (עם או בלי שם)
        return /^\s*\d+\s*\.\s*/.test(line);
    });
    
    const hasNumberedList = numberedLines.length >= 2;
    
    return hasKeywords || hasNumberedList;
}

/**
 * מנקה תווים מיוחדים מהטקסט
 * כולל: zero-width space, invisible characters, וכו'
 */
function cleanSpecialChars(text) {
    return text
        .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '') // zero-width characters
        .replace(/[\u00A0]/g, ' ') // non-breaking space to regular space
        .replace(/\s+$/, '') // trailing whitespace
        .replace(/^\s+/, '') // leading whitespace
        .trim();
}

/**
 * מנתח את הרשימה ומוצא מקומות פנויים ברשימה הראשית וברשימת ממתינים
 * גם מזהה שמות שכבר נמצאים ברשימה
 * תומך ברשימות חלקיות - משלים את המספרים החסרים
 */
function parseList(text) {
    const lines = text.split('\n');
    const emptySlots = [];
    const waitlistSlots = [];
    const existingNamesInMain = []; // שמות שכבר נמצאים ברשימה הראשית
    const existingNamesInWaitlist = []; // שמות שכבר נמצאים ברשימת ממתינים
    const waitlistEntries = []; // מידע מלא על רשומות בממתינים (כולל lineIndex)
    const occupiedSlots = new Set(); // מספרים תפוסים ברשימה הראשית
    let inWaitlist = false;
    let waitlistStartIndex = -1;
    let maxNumberFound = 0; // המספר הגבוה ביותר שנמצא ברשימה

    for (let i = 0; i < lines.length; i++) {
        // נקה תווים מיוחדים מהשורה
        const originalLine = lines[i];
        const line = cleanSpecialChars(originalLine);

        // מזהה מתי מתחילה רשימת ממתינים
        if (line.includes('ממתינים')) {
            inWaitlist = true;
            waitlistStartIndex = i;
            continue;
        }

        // Regex גמיש - מזהה מספר עם נקודה (עם או בלי רווחים)
        // תומך בפורמטים: "11." "11. " "11 ." " 11." וכו'
        const emptySlotMatch = line.match(/^\s*(\d+)\s*\.\s*$/);
        
        if (emptySlotMatch) {
            const slotNumber = parseInt(emptySlotMatch[1]);
            console.log(`🔍 נמצא מקום פנוי: ${slotNumber} (שורה ${i + 1})`);

            if (!inWaitlist) {
                // רשימה ראשית (1-15)
                if (slotNumber >= 1 && slotNumber <= 15) {
                    maxNumberFound = Math.max(maxNumberFound, slotNumber);
                    emptySlots.push({ number: slotNumber, lineIndex: i, type: 'main' });
                }
            } else {
                // רשימת ממתינים
                waitlistSlots.push({ number: slotNumber, lineIndex: i, type: 'waitlist' });
            }
        } else {
            // בודק אם יש שם בשורה (פורמט: מספר. שם)
            const nameMatch = line.match(/^\s*(\d+)\s*\.\s*(.+)$/);
            if (nameMatch) {
                const slotNumber = parseInt(nameMatch[1]);
                const name = cleanSpecialChars(nameMatch[2]);

                if (!inWaitlist) {
                    // רשימה ראשית (1-15)
                    if (slotNumber >= 1 && slotNumber <= 15 && name) {
                        maxNumberFound = Math.max(maxNumberFound, slotNumber);
                        occupiedSlots.add(slotNumber);
                        existingNamesInMain.push(name);
                    }
                } else {
                    // רשימת ממתינים
                    if (name) {
                        existingNamesInWaitlist.push(name);
                        // שומר מידע מלא כולל lineIndex לצורך העברה לרשימה הראשית
                        waitlistEntries.push({
                            name: name,
                            number: slotNumber,
                            lineIndex: i
                        });
                    }
                }
            }
        }
    }

    console.log(`📊 סיכום ניתוח: ${emptySlots.length} מקומות פנויים ברשימה, ${waitlistSlots.length} בממתינים`);

    return {
        lines,
        emptySlots,
        waitlistSlots,
        waitlistStartIndex,
        existingNamesInMain,
        existingNamesInWaitlist,
        waitlistEntries,
        maxNumberFound,
        occupiedSlots
    };
}

/**
 * ממלא את המקומות הפנויים עם השמות שהוגדרו
 * תומך בהוספה גם לרשימת ממתינים אם אין מקום ברשימה הראשית
 * בודק גם אם השמות כבר נמצאים ברשימה הראשית או ברשימת ממתינים
 * תומך ברשימות שחקנים ספציפיות לכל קבוצה
 * מעביר שחקנים מהממתינים לרשימה הראשית אם יש מקום פנוי
 * משלים רשימות חלקיות - אם יש רק 1-4 משלים עד 15
 */
function fillEmptySlots(text, groupId = null) {
    const { lines, emptySlots, waitlistSlots, existingNamesInMain, existingNamesInWaitlist, waitlistEntries, maxNumberFound, occupiedSlots } = parseList(text);
    
    // אם זו רשימה חלקית (פחות מ-15), השלם את המספרים החסרים
    let needsCompletion = false;
    if (maxNumberFound > 0 && maxNumberFound < 15) {
        console.log(`📋 זוהתה רשימה חלקית (עד מספר ${maxNumberFound}), משלים עד 15...`);
        needsCompletion = true;
        
        // מצא את השורה האחרונה עם מספר ברשימה הראשית
        let lastLineIndex = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            const match = line.match(/^\s*(\d+)\s*\./);
            if (match) {
                const num = parseInt(match[1]);
                if (num >= 1 && num <= 15) {
                    lastLineIndex = i;
                    break;
                }
            }
        }
        
        // הוסף את המספרים החסרים
        for (let num = maxNumberFound + 1; num <= 15; num++) {
            if (!occupiedSlots.has(num)) {
                lastLineIndex++;
                lines.splice(lastLineIndex, 0, `${num}.`);
                emptySlots.push({ number: num, lineIndex: lastLineIndex, type: 'main' });
            }
        }
        
        // אם אין רשימת ממתינים, הוסף אחת
        if (config.addToWaitlist && lines.findIndex(l => l.includes('ממתינים')) === -1) {
            lastLineIndex++;
            lines.splice(lastLineIndex, 0, '');
            lastLineIndex++;
            lines.splice(lastLineIndex, 0, 'ממתינים:');
            const waitlistStartIndex = lastLineIndex;
            
            // הוסף 5 מקומות ממתינים
            for (let num = 1; num <= 5; num++) {
                lastLineIndex++;
                lines.splice(lastLineIndex, 0, `${num}.`);
                waitlistSlots.push({ number: num, lineIndex: lastLineIndex, type: 'waitlist' });
            }
        }
    }

    // בחירת רשימת השחקנים - ספציפית לקבוצה או גלובלית
    let membersSource = config.membersToAdd;

    if (groupId && config.groupMembers && config.groupMembers[groupId]) {
        console.log(`📋 משתמש ברשימת שחקנים ספציפית לקבוצה`);
        membersSource = config.groupMembers[groupId];
    } else {
        console.log(`📋 משתמש ברשימת שחקנים גלובלית`);
    }

    let movedFromWaitlist = 0;
    let addedToMain = 0;
    let addedToWaitlist = 0;

    // === שלב 1: העברת שחקנים שלנו מהממתינים לרשימה הראשית אם יש מקום ===
    if (emptySlots.length > 0 && waitlistEntries.length > 0) {
        // מצא את השחקנים שלנו שנמצאים בממתינים
        const ourMembersInWaitlist = waitlistEntries.filter(entry =>
            membersSource.some(member =>
                member.trim().toLowerCase() === entry.name.trim().toLowerCase()
            )
        );

        if (ourMembersInWaitlist.length > 0) {
            console.log(`🔄 נמצאו ${ourMembersInWaitlist.length} שחקנים שלנו בממתינים`);

            // העבר אותם למקומות הפנויים ברשימה הראשית
            const slotsToFill = Math.min(ourMembersInWaitlist.length, emptySlots.length);

            for (let i = 0; i < slotsToFill; i++) {
                const member = ourMembersInWaitlist[i];
                const targetSlot = emptySlots[i];

                // הוסף לרשימה הראשית
                lines[targetSlot.lineIndex] = `${targetSlot.number}. ${member.name}`;

                // הסר מהממתינים (תשאיר רק מספר)
                lines[member.lineIndex] = `${member.number}.`;

                console.log(`✅ הועבר "${member.name}" מממתינים (#${member.number}) לרשימה הראשית (#${targetSlot.number})`);
                movedFromWaitlist++;
            }

            // הסר את המקומות שכבר מולאו
            emptySlots.splice(0, slotsToFill);
        }
    }

    // === שלב 2: מילוי מקומות פנויים נותרים עם שחקנים חדשים ===
    const allSlots = [...emptySlots];

    // אם מופעלת אופציית הוספה לממתינים, מוסיף גם את מקומות הממתינים
    if (config.addToWaitlist && waitlistSlots.length > 0) {
        allSlots.push(...waitlistSlots);
    }

    const mainSlotsCount = emptySlots.length;
    const waitlistSlotsCount = waitlistSlots.length;

    if (mainSlotsCount > 0) {
        console.log(`✅ נמצאו ${mainSlotsCount} מקומות פנויים ברשימה הראשית`);
    }
    if (config.addToWaitlist && waitlistSlotsCount > 0) {
        console.log(`✅ נמצאו ${waitlistSlotsCount} מקומות פנויים ברשימת ממתינים`);
    }

    // סינון שחקנים שכבר נמצאים ברשימה הראשית או ברשימת ממתינים
    const membersToAdd = membersSource.filter(member => {
        // בודק אם השם כבר נמצא ברשימה הראשית
        const inMain = existingNamesInMain.some(name =>
            name.trim().toLowerCase() === member.trim().toLowerCase()
        );

        // בודק אם השם כבר נמצא ברשימת ממתינים (רק אם addToWaitlist מופעל)
        const inWaitlist = config.addToWaitlist && existingNamesInWaitlist.some(name =>
            name.trim().toLowerCase() === member.trim().toLowerCase()
        );

        if (inMain) {
            console.log(`ℹ️ השם "${member}" כבר נמצא ברשימה הראשית, מדלג`);
            return false;
        }

        if (inWaitlist) {
            console.log(`ℹ️ השם "${member}" כבר נמצא ברשימת ממתינים, מדלג`);
            return false;
        }

        return true;
    });

    // אם אין מקומות פנויים ואין העברות - סיים
    if (allSlots.length === 0 && movedFromWaitlist === 0) {
        console.log('❌ אין מקומות פנויים ברשימה');
        return null;
    }

    if (membersToAdd.length > 0 && allSlots.length > 0) {
        console.log(`📝 שמות להוספה: ${membersToAdd.join(', ')}`);

        for (let i = 0; i < allSlots.length && i < membersToAdd.length; i++) {
            const slot = allSlots[i];
            const name = membersToAdd[i];
            lines[slot.lineIndex] = `${slot.number}. ${name}`;

            if (slot.type === 'main') {
                addedToMain++;
            } else {
                addedToWaitlist++;
            }
        }
    }

    const totalChanges = movedFromWaitlist + addedToMain + addedToWaitlist;

    // אם ביצענו השלמה של רשימה חלקית, או הוספנו שחקנים - החזר תוצאה
    if (totalChanges > 0 || needsCompletion) {
        if (needsCompletion && totalChanges === 0) {
            console.log(`✅ הושלמה רשימה חלקית (נוספו מספרים 5-15 ורשימת ממתינים)`);
        }
        if (movedFromWaitlist > 0) {
            console.log(`🔄 הועברו ${movedFromWaitlist} שחקנים מהממתינים לרשימה הראשית`);
        }
        if (addedToMain > 0) {
            console.log(`✅ נוספו ${addedToMain} שמות לרשימה הראשית`);
        }
        if (addedToWaitlist > 0) {
            console.log(`✅ נוספו ${addedToWaitlist} שמות לרשימת ממתינים`);
        }
        return {
            updatedText: lines.join('\n'),
            addedToMain,
            addedToWaitlist,
            movedFromWaitlist
        };
    }

    if (membersToAdd.length === 0 && movedFromWaitlist === 0 && !needsCompletion) {
        console.log('✅ כל השחקנים כבר נמצאים ברשימה (ראשית או ממתינים)');
    }

    return null;
}

/**
 * שולח תגובה עם הרשימה המעודכנת
 */
async function sendResponse(chat, message, result) {
    try {
        console.log(`⏱️ ממתין ${config.delayMs}ms לפני שליחה...`);
        await new Promise(resolve => setTimeout(resolve, config.delayMs));

        console.log(`📤 מנסה לשלוח הודעה... (replyMode: ${config.replyMode})`);

        if (config.replyMode) {
            await message.reply(result.updatedText);
            console.log('✅ נשלחה תגובה עם הרשימה המעודכנת');
        } else {
            await chat.sendMessage(result.updatedText);
            console.log('✅ נשלחה רשימה מעודכנת לקבוצה');
        }

        io.emit('message-sent', {
            group: chat.name,
            success: true,
            addedToMain: result.addedToMain,
            addedToWaitlist: result.addedToWaitlist
        });

        return true;
    } catch (error) {
        console.error('❌ שגיאה בשליחת תגובה:', error);
        console.error('❌ פרטי השגיאה:', error.stack);
        io.emit('error', { message: 'שגיאה בשליחת תגובה: ' + error.message });
        return false;
    }
}

/**
 * טעינת קבוצות (עם מטמון ואופטימיזציה)
 * מגביל ל-20 קבוצות אחרונות + כל הנבחרות (נשמרות לתמיד)
 * משתמש ב-timeout למניעת תקיעה
 * אופטימיזציה: משתמש ב-cache קודם ואז מעדכן ברקע
 */
let lastGroupsLoad = 0;
const GROUPS_CACHE_TTL = 300000; // 5 דקות cache (היה 1 דקה)
const MAX_GROUPS_TO_LOAD = 20; // מקסימום קבוצות לטעינה

async function loadGroups(forceRefresh = false) {
    const now = Date.now();

    // === אופטימיזציה: החזר cache מיד אם יש ===
    if (!forceRefresh) {
        if (groupsCache && groupsCache.length > 0 && (now - lastGroupsLoad) < GROUPS_CACHE_TTL) {
            console.log('📦 מחזיר קבוצות מהמטמון (cache בתוקף)');
            return limitGroups(groupsCache);
        }
        
        // נסה לטעון מקובץ אם אין cache בזיכרון
        if (!groupsCache || groupsCache.length === 0) {
            const savedGroups = loadGroupsFromFile();
            if (savedGroups && savedGroups.length > 0) {
                groupsCache = savedGroups;
                lastGroupsLoad = now;
                // עדכן ברקע (לא חוסם)
                setTimeout(() => loadGroupsFromWhatsApp(), 100);
                return limitGroups(groupsCache);
            }
            
            // אם יש קבוצות נבחרות שמורות - השתמש בהן
            const savedSelected = getSavedSelectedGroups();
            if (savedSelected.length > 0) {
                console.log('📦 משתמש בקבוצות נבחרות שמורות');
                groupsCache = savedSelected;
                return groupsCache;
            }
        }
    }

    // טען מ-WhatsApp
    return await loadGroupsFromWhatsApp();
}

// פונקציה להגבלת קבוצות: כל הנבחרות + 20 לא-נבחרות
function limitGroups(groups) {
    if (!groups || groups.length === 0) return [];
    
    // עדכן isSelected לפי config הנוכחי
    const updated = groups.map(g => ({
        ...g,
        isSelected: config.selectedGroups.includes(g.id)
    }));
    
    const selected = updated.filter(g => g.isSelected);
    const unselected = updated.filter(g => !g.isSelected);
    const limitedUnselected = unselected.slice(0, MAX_GROUPS_TO_LOAD);
    
    return [...selected, ...limitedUnselected];
}

// פונקציה נפרדת לטעינה מ-WhatsApp (איטית)
async function loadGroupsFromWhatsApp() {
    if (isLoadingGroups) {
        console.log('⏳ טעינת קבוצות כבר בתהליך...');
        // החזר cache קיים במקום להמתין
        if (groupsCache && groupsCache.length > 0) {
            return groupsCache;
        }
        return getSavedSelectedGroups();
    }

    try {
        isLoadingGroups = true;
        const startTime = Date.now();
        console.log('🔄 טוען קבוצות מ-WhatsApp...');
        io.emit('log', { message: 'טוען קבוצות מ-WhatsApp...' });

        // timeout קצר יותר - 30 שניות
        const timeoutMs = Math.min((config.groupsLoadTimeout || 30) * 1000, 30000);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout בטעינת קבוצות')), timeoutMs)
        );

        console.log('   ⏳ קורא client.getChats()...');
        const chatsPromise = client.getChats();
        const chats = await Promise.race([chatsPromise, timeoutPromise]);
        
        console.log(`   📊 getChats() החזיר ${chats?.length || 0} צ'אטים`);

        // סינון מהיר - רק קבוצות
        const allGroups = [];
        let count = 0;
        let totalGroups = 0;
        let archivedGroups = 0;
        let noNameGroups = 0;
        
        for (const chat of chats) {
            if (chat.isGroup) {
                totalGroups++;
                if (chat.archived) { archivedGroups++; continue; }
                if (!chat.name) { noNameGroups++; continue; }
                
                const isSelected = config.selectedGroups.includes(chat.id._serialized);
                if (!isSelected) count++;
                
                // אם כבר יש לנו 50 קבוצות לא-נבחרות, דלג על השאר
                if (!isSelected && count > 50) continue;
                
                allGroups.push({
                    id: chat.id._serialized,
                    name: chat.name,
                    timestamp: chat.timestamp || 0,
                    isSelected
                });
            }
        }
        
        console.log(`   📊 סיכום סינון: ${totalGroups} קבוצות סה"כ, ${archivedGroups} בארכיון, ${noNameGroups} ללא שם, ${allGroups.length} תקינות`);

        // מיין לפי זמן (החדשות קודם)
        allGroups.sort((a, b) => b.timestamp - a.timestamp);

        const loadTime = Date.now() - startTime;
        console.log(`📊 נמצאו ${allGroups.length} קבוצות ב-${loadTime}ms`);

        // === לוגיקה: קבוצות נבחרות נשמרות לתמיד ===
        
        // 1. קח את כל הקבוצות הנבחרות שנמצאו
        const selectedFromWhatsApp = allGroups.filter(g => g.isSelected);
        const selectedIds = new Set(selectedFromWhatsApp.map(g => g.id));
        
        // 2. הוסף קבוצות נבחרות שנשמרו אבל לא נמצאו
        const savedSelected = getSavedSelectedGroups();
        const missingSelected = savedSelected.filter(g => !selectedIds.has(g.id));
        
        // 3. שלב את כל הקבוצות הנבחרות
        const allSelectedGroups = [...selectedFromWhatsApp, ...missingSelected];
        
        // 4. קח עד 20 קבוצות לא-נבחרות (הכי חדשות)
        const unselectedGroups = allGroups.filter(g => !g.isSelected);
        const recentUnselected = unselectedGroups.slice(0, MAX_GROUPS_TO_LOAD);
        
        // 5. שלב: נבחרות קודם, אחר כך 20 האחרונות
        groupsCache = [...allSelectedGroups, ...recentUnselected];
        lastGroupsLoad = Date.now();

        // שמור לקובץ כ-backup
        saveGroupsToFile(groupsCache);

        console.log(`✅ טעינה הושלמה: ${allSelectedGroups.length} נבחרות + ${recentUnselected.length} אחרונות (${loadTime}ms)`);
        io.emit('log', { message: `נטענו ${groupsCache.length} קבוצות` });
        
        return groupsCache;
    } catch (error) {
        console.error('❌ שגיאה בטעינת קבוצות:', error.message);

        // נסה לטעון מקובץ backup
        const savedGroups = loadGroupsFromFile();
        if (savedGroups && savedGroups.length > 0) {
            console.log('📦 משתמש בקבוצות שמורות מקובץ');
            groupsCache = savedGroups;
            return groupsCache;
        }

        // החזר קבוצות נבחרות שמורות
        const savedSelected = getSavedSelectedGroups();
        if (savedSelected.length > 0) {
            groupsCache = savedSelected;
            return groupsCache;
        }

        // החזר cache ישן אם יש
        if (groupsCache && groupsCache.length > 0) {
            console.log('📦 משתמש ב-cache ישן');
            return groupsCache;
        }

        return [];
    } finally {
        isLoadingGroups = false;
    }
}

// שמירת קבוצות לקובץ backup
function saveGroupsToFile(groups) {
    try {
        const filePath = path.join(__dirname, '.groups_cache.json');
        fs.writeFileSync(filePath, JSON.stringify(groups, null, 2));
    } catch (e) {
        // שקט - לא קריטי
    }
}

// שמירת מידע על קבוצה נבחרת (שם + ID) - נשמר לתמיד
function saveSelectedGroupInfo(groupId, groupName) {
    if (!config.savedGroups) {
        config.savedGroups = {};
    }
    config.savedGroups[groupId] = {
        id: groupId,
        name: groupName,
        savedAt: Date.now()
    };
    saveConfig(config);
}

// הסרת מידע על קבוצה שבוטלה הבחירה שלה
function removeSelectedGroupInfo(groupId) {
    if (config.savedGroups && config.savedGroups[groupId]) {
        delete config.savedGroups[groupId];
        // מחק גם את רשימת השחקנים הספציפית
        if (config.groupMembers && config.groupMembers[groupId]) {
            delete config.groupMembers[groupId];
        }
        saveConfig(config);
    }
}

// קבלת קבוצות נבחרות שנשמרו (גם אם לא נטענו מ-WhatsApp)
function getSavedSelectedGroups() {
    const saved = [];
    if (config.savedGroups) {
        for (const groupId of config.selectedGroups) {
            if (config.savedGroups[groupId]) {
                saved.push({
                    id: groupId,
                    name: config.savedGroups[groupId].name,
                    timestamp: config.savedGroups[groupId].savedAt,
                    isSelected: true
                });
            }
        }
    }
    return saved;
}

// טעינת קבוצות מקובץ backup - עם הגבלה ל-20 לא-נבחרות
function loadGroupsFromFile() {
    try {
        const filePath = path.join(__dirname, '.groups_cache.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            const allGroups = JSON.parse(data);
            
            // הגבל: כל הנבחרות + 20 לא-נבחרות
            const selected = allGroups.filter(g => g.isSelected || config.selectedGroups.includes(g.id));
            const unselected = allGroups.filter(g => !g.isSelected && !config.selectedGroups.includes(g.id));
            const limitedUnselected = unselected.slice(0, MAX_GROUPS_TO_LOAD);
            
            // עדכן isSelected לפי config
            const result = [...selected, ...limitedUnselected].map(g => ({
                ...g,
                isSelected: config.selectedGroups.includes(g.id)
            }));
            
            console.log(`📦 נטענו מקובץ: ${selected.length} נבחרות + ${limitedUnselected.length} אחרונות`);
            return result;
        }
    } catch (e) {
        console.log('⚠️ שגיאה בטעינת cache:', e.message);
    }
    return null;
}

// הוספת קבוצה מהודעה נכנסת (פתרון עוקף)
function addGroupFromMessage(groupId, groupName) {
    if (!groupsCache) groupsCache = [];

    // בדוק אם הקבוצה כבר קיימת
    const exists = groupsCache.find(g => g.id === groupId);
    if (!exists) {
        groupsCache.push({
            id: groupId,
            name: groupName,
            timestamp: Date.now(),
            isSelected: config.selectedGroups.includes(groupId)
        });
        console.log(`➕ נוספה קבוצה חדשה למטמון: ${groupName}`);
        saveGroupsToFile(groupsCache);
    }
}

// ============ REST API Endpoints ============

// סטטוס הבוט
app.get('/api/status', (req, res) => {
    res.json(botStatus);
});

// דיאגנוסטיקה - לבדיקת תקינות
app.get('/api/diagnostics', async (req, res) => {
    try {
        const diagnostics = {
            botStatus,
            messageStats,
            config: {
                selectedGroups: config.selectedGroups,
                keywords: config.keywords,
                selfTestMode: config.selfTestMode,
                membersToAdd: config.membersToAdd,
                requireConfirmation: config.requireConfirmation
            },
            cache: {
                groupsCacheSize: groupsCache?.length || 0,
                processedMessagesSize: processedMessages.size,
                pendingConfirmationsSize: pendingConfirmations.size
            },
            timestamp: new Date().toISOString()
        };
        
        // בדוק חיבור לקבוצות אם הבוט מוכן
        if (botStatus.isReady && client) {
            diagnostics.groupsCheck = [];
            for (const groupId of config.selectedGroups) {
                try {
                    const chat = await client.getChatById(groupId);
                    diagnostics.groupsCheck.push({
                        id: groupId,
                        name: chat?.name || 'לא ידוע',
                        found: !!chat,
                        isGroup: chat?.isGroup || false
                    });
                } catch (err) {
                    diagnostics.groupsCheck.push({
                        id: groupId,
                        error: err.message,
                        found: false
                    });
                }
            }
        }
        
        res.json(diagnostics);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// בדיקת הודעות - שולח הודעת טסט לקבוצה
app.post('/api/test-message', async (req, res) => {
    try {
        if (!botStatus.isReady) {
            return res.status(400).json({ error: 'הבוט לא מוכן' });
        }
        
        const { groupId } = req.body;
        const targetGroup = groupId || config.selectedGroups[0];
        
        if (!targetGroup) {
            return res.status(400).json({ error: 'לא נבחרה קבוצה' });
        }
        
        console.log(`🧪 שולח הודעת טסט לקבוצה: ${targetGroup}`);
        const chat = await client.getChatById(targetGroup);
        
        if (!chat) {
            return res.status(404).json({ error: 'הקבוצה לא נמצאה' });
        }
        
        await chat.sendMessage(`🧪 בדיקת בוט - ${new Date().toLocaleTimeString('he-IL')}`);
        console.log(`✅ הודעת טסט נשלחה לקבוצה: ${chat.name}`);
        
        res.json({ success: true, groupName: chat.name });
    } catch (error) {
        console.error('❌ שגיאה בשליחת הודעת טסט:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// קבלת כל הקבוצות
app.get('/api/groups', async (req, res) => {
    try {
        // אם הבוט לא מוכן, נסה להחזיר קבוצות שמורות
        if (!botStatus.isReady) {
            // נסה להחזיר קבוצות מ-cache או מקובץ
            if (groupsCache && groupsCache.length > 0) {
                console.log('📦 מחזיר קבוצות מ-cache (בוט בטעינה)');
                return res.json(limitGroups(groupsCache));
            }
            
            const savedGroups = loadGroupsFromFile();
            if (savedGroups && savedGroups.length > 0) {
                console.log('📦 מחזיר קבוצות מקובץ (בוט בטעינה)');
                groupsCache = savedGroups;
                return res.json(limitGroups(savedGroups));
            }
            
            const savedSelected = getSavedSelectedGroups();
            if (savedSelected.length > 0) {
                console.log('📦 מחזיר קבוצות נבחרות שמורות (בוט בטעינה)');
                return res.json(savedSelected);
            }
            
            // אין קבוצות שמורות - החזר רשימה ריקה
            return res.json([]);
        }

        const groups = await loadGroups();
        res.json(limitGroups(groups || []));
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups:', error);
        // גם במקרה של שגיאה - נסה להחזיר cache
        if (groupsCache && groupsCache.length > 0) {
            return res.json(groupsCache);
        }
        res.json([]);
    }
});

// עדכון קבוצות נבחרות
app.post('/api/groups/selected', (req, res) => {
    try {
        const { selectedGroups } = req.body;

        if (!Array.isArray(selectedGroups)) {
            return res.status(400).json({ error: 'selectedGroups חייב להיות מערך' });
        }

        // מצא קבוצות שנוספו ושהוסרו
        const previousSelected = config.selectedGroups || [];
        const added = selectedGroups.filter(id => !previousSelected.includes(id));
        const removed = previousSelected.filter(id => !selectedGroups.includes(id));

        // שמור מידע על קבוצות חדשות שנבחרו
        for (const groupId of added) {
            const group = groupsCache?.find(g => g.id === groupId);
            if (group) {
                saveSelectedGroupInfo(groupId, group.name);
                console.log(`⭐ קבוצה נשמרה: ${group.name}`);
            }
        }

        // הסר מידע על קבוצות שבוטלה הבחירה שלהן
        for (const groupId of removed) {
            removeSelectedGroupInfo(groupId);
            console.log(`🗑️ קבוצה הוסרה מהרשימה`);
        }

        config.selectedGroups = selectedGroups;
        saveConfig(config);

        // עדכון המטמון
        if (groupsCache) {
            groupsCache = groupsCache.map(group => ({
                ...group,
                isSelected: selectedGroups.includes(group.id)
            }));
        }

        io.emit('config-updated', config);
        res.json({ success: true, selectedGroups });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups/selected:', error);
        res.status(500).json({ error: error.message });
    }
});

// קבלת הגדרות
app.get('/api/config', (req, res) => {
    res.json(config);
});

// עדכון הגדרות
app.post('/api/config', (req, res) => {
    try {
        const newConfig = req.body;

        // ולידציה בסיסית
        if (newConfig.membersToAdd && !Array.isArray(newConfig.membersToAdd)) {
            return res.status(400).json({ error: 'membersToAdd חייב להיות מערך' });
        }

        config = { ...config, ...newConfig };
        saveConfig(config);

        io.emit('config-updated', config);
        res.json({ success: true, config });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/config:', error);
        res.status(500).json({ error: error.message });
    }
});

// קבלת רשימת חברים
app.get('/api/members', (req, res) => {
    res.json({ members: config.membersToAdd });
});

// עדכון רשימת חברים
app.post('/api/members', (req, res) => {
    try {
        const { members } = req.body;

        if (!Array.isArray(members)) {
            return res.status(400).json({ error: 'members חייב להיות מערך' });
        }

        config.membersToAdd = members;
        saveConfig(config);

        io.emit('members-updated', { members });
        res.json({ success: true, members });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/members:', error);
        res.status(500).json({ error: error.message });
    }
});

// קבלת רשימת חברים לקבוצה ספציפית
app.get('/api/groups/:groupId/members', (req, res) => {
    try {
        const { groupId } = req.params;

        if (!config.groupMembers) {
            config.groupMembers = {};
        }

        const members = config.groupMembers[groupId] || null;
        res.json({
            groupId,
            members,
            useGlobal: !members // האם משתמש ברשימה הגלובלית
        });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups/:groupId/members:', error);
        res.status(500).json({ error: error.message });
    }
});

// עדכון רשימת חברים לקבוצה ספציפית
app.post('/api/groups/:groupId/members', (req, res) => {
    try {
        const { groupId } = req.params;
        const { members } = req.body;

        if (members !== null && !Array.isArray(members)) {
            return res.status(400).json({ error: 'members חייב להיות מערך או null' });
        }

        if (!config.groupMembers) {
            config.groupMembers = {};
        }

        if (members === null) {
            // מחיקת רשימה ספציפית - חזרה לגלובלית
            delete config.groupMembers[groupId];
        } else {
            // הגדרת רשימה ספציפית
            config.groupMembers[groupId] = members;
        }

        saveConfig(config);

        io.emit('group-members-updated', { groupId, members });
        res.json({ success: true, groupId, members });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups/:groupId/members:', error);
        res.status(500).json({ error: error.message });
    }
});

// Logout מ-WhatsApp (מחיקת session) - משופר!
app.post('/api/logout', async (req, res) => {
    try {
        console.log('🔄 מבצע logout מ-WhatsApp...');

        // עדכן סטטוס קודם
        botStatus.isReady = false;
        botStatus.isAuthenticated = false;
        io.emit('status-update', botStatus);

        // נסה לסגור ולהרוס את ה-client
        try {
            await client.destroy();
        } catch (destroyError) {
            console.log('⚠️ שגיאה ב-destroy (לא קריטי):', destroyError.message);
        }

        // מחק את תיקיית ה-auth כדי שיוצג QR חדש
        const authPath = path.join(__dirname, '.wwebjs_auth');
        try {
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('🗑️ תיקיית auth נמחקה');
            }
        } catch (rmError) {
            console.log('⚠️ לא הצלחתי למחוק תיקיית auth:', rmError.message);
        }

        // צור client חדש ואתחל
        console.log('🔄 יוצר client חדש...');
        client = createClient();
        setupClientEvents();

        // אתחל אחרי 2 שניות
        setTimeout(async () => {
            try {
                console.log('📱 מאתחל client חדש...');
                await client.initialize();
            } catch (initError) {
                console.error('❌ שגיאה באתחול:', initError.message);
            }
        }, 2000);

        console.log('✅ Logout הצליח - QR חדש יופיע בקרוב');
        res.json({ success: true, message: 'Logged out - QR code יופיע בקרוב' });
    } catch (error) {
        console.error('❌ שגיאה ב-logout:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// בקשה ל-QR code חדש
app.post('/api/request-qr', async (req, res) => {
    try {
        if (botStatus.isReady || botStatus.isAuthenticated) {
            return res.json({
                success: false,
                message: 'הבוט כבר מחובר. השתמש ב-logout כדי להתחבר מחדש'
            });
        }

        console.log('📱 נתבקש QR code חדש');
        res.json({ success: true, message: 'QR code יופיע בקרוב' });
    } catch (error) {
        console.error('❌ שגיאה בבקשת QR:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// רענון קבוצות (מאלץ טעינה מחדש)
app.post('/api/groups/refresh', async (req, res) => {
    try {
        // אם הבוט מוכן - טען מ-WhatsApp
        if (botStatus.isReady) {
            const groups = await loadGroups(true);
            return res.json({ success: true, groups: groups || [] });
        }
        
        // אם הבוט לא מוכן - החזר קבוצות שמורות
        if (groupsCache && groupsCache.length > 0) {
            return res.json({ success: true, groups: groupsCache, fromCache: true });
        }
        
        const savedGroups = loadGroupsFromFile();
        if (savedGroups && savedGroups.length > 0) {
            groupsCache = savedGroups;
            return res.json({ success: true, groups: savedGroups, fromCache: true });
        }
        
        const savedSelected = getSavedSelectedGroups();
        return res.json({ success: true, groups: savedSelected, fromCache: true });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups/refresh:', error);
        // גם במקרה של שגיאה - נסה להחזיר cache
        if (groupsCache && groupsCache.length > 0) {
            return res.json({ success: true, groups: groupsCache, fromCache: true });
        }
        res.json({ success: true, groups: [] });
    }
});

// אישור/דחייה של הוספת שמות
app.post('/api/confirm/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { approved } = req.body;

        console.log(`📥 התקבלה בקשה לאישור: ID=${id}, approved=${approved}`);

        const confirmation = pendingConfirmations.get(id);
        if (!confirmation) {
            console.error(`❌ בקשה לא נמצאה: ID=${id}`);
            return res.status(404).json({ error: 'בקשת אישור לא נמצאה' });
        }

        if (approved) {
            console.log(`✅ מאשר שליחה לקבוצה: ${confirmation.groupName}`);
            const result = {
                updatedText: confirmation.message,
                addedToMain: confirmation.addedToMain,
                addedToWaitlist: confirmation.addedToWaitlist
            };

            const sent = await sendResponse(confirmation.chat, confirmation.originalMessage, result);
            if (sent) {
                console.log(`✅ בקשה אושרה ונשלחה בהצלחה לקבוצה: ${confirmation.groupName}`);
            } else {
                console.error(`❌ בקשה אושרה אבל השליחה נכשלה לקבוצה: ${confirmation.groupName}`);
            }
        } else {
            console.log(`❌ בקשה נדחתה עבור קבוצה: ${confirmation.groupName}`);
            io.emit('confirmation-rejected', { groupName: confirmation.groupName });
        }

        pendingConfirmations.delete(id);
        res.json({ success: true });
    } catch (error) {
        console.error('❌ שגיאה באישור:', error);
        console.error('❌ פרטי השגיאה:', error.stack);
        res.status(500).json({ error: error.message });
    }
});

// קבלת רשימת בקשות אישור ממתינות
app.get('/api/confirmations', (req, res) => {
    const confirmations = Array.from(pendingConfirmations.values()).map(c => ({
        id: c.id,
        groupName: c.groupName,
        addedToMain: c.addedToMain,
        addedToWaitlist: c.addedToWaitlist,
        previewText: c.message.substring(0, 200) + '...'
    }));
    res.json(confirmations);
});

// ============ WebSocket ============
io.on('connection', (socket) => {
    console.log('🔌 לקוח התחבר לדשבורד');
    botStatus.connectedClients++;

    // שלח סטטוס נוכחי ללקוח חדש
    socket.emit('status-update', botStatus);
    socket.emit('config-updated', config);

    socket.on('disconnect', () => {
        console.log('🔌 לקוח התנתק מהדשבורד');
        botStatus.connectedClients--;
    });
});

// ============ Message Handler Function ============
async function handleMessage(message) {
    console.log('🔄 handleMessage - מתחיל עיבוד...');
    console.log(`   📱 message.from: ${message.from}`);
    console.log(`   📱 message.to: ${message.to}`);
    console.log(`   📱 message.author: ${message.author || '(אין)'}`);
    
    try {
        console.log('   ⏳ קורא getChat()...');
        const chat = await message.getChat();
        console.log(`💬 צ'אט: ${chat.name} | isGroup: ${chat.isGroup} | id: ${chat.id?._serialized}`);

        if (!chat.isGroup) {
            console.log('❌ ההודעה אינה מקבוצה, מדלג.');
            return;
        }

        const groupId = chat.id._serialized;
        const groupName = chat.name;
        const fromName = message._data.notifyName || 'לא ידוע';
        const author = message.author || message.from;

        console.log(`📍 פרטי קבוצה: ${groupName} (ID: ${groupId})`);
        console.log(`👤 שולח: ${fromName} (ID: ${author})`);

        // הוסף קבוצה למטמון (פתרון עוקף לבעיית getChats)
        addGroupFromMessage(groupId, groupName);

        // שולח את כל ההודעות מהקבוצות הנבחרות לדשבורד (לצפייה)
        if (config.selectedGroups.includes(groupId)) {
            io.emit('group-message', {
                groupId,
                groupName,
                from: fromName,
                message: message.body,
                timestamp: new Date().toISOString()
            });
        }

        // בודק שזו אחת מהקבוצות שנבחרו
        const isSelectedGroup = config.selectedGroups.includes(groupId);
        console.log(`❓ האם הקבוצה ברשימה המותרת? ${isSelectedGroup ? 'כן' : 'לא'}`);

        if (!isSelectedGroup) {
            console.log('❌ הקבוצה לא ברשימה, מתעלם.');
            return;
        }

        console.log('✅ הקבוצה נבחרה! ממשיך לבדוק את ההודעה...');

        const isFootball = isFootballList(message.body);
        console.log(`❓ האם זוהתה רשימת כדורגל? ${isFootball ? 'כן' : 'לא'}`);
        console.log(`📝 מילות מפתח מוגדרות: ${config.keywords.join(', ')}`);

        if (!isFootball) {
            console.log('❌ לא זוהתה רשימת כדורגל (מילות מפתח חסרות).');
            return;
        }

        console.log(`✅ הודעה תקינה! מתחיל עיבוד...`);
        console.log(`📨 התקבלה הודעה בקבוצה: ${groupName}`);
        console.log(`👤 מאת: ${fromName}`);

        io.emit('message-received', {
            groupId,
            group: groupName,
            from: fromName,
            message: message.body.substring(0, 100) + '...',
            fullMessage: message.body
        });

        // הצג את רשימת השחקנים שמנסים להוסיף
        const membersSource = (config.groupMembers && config.groupMembers[groupId]) 
            ? config.groupMembers[groupId] 
            : config.membersToAdd;
        console.log(`👥 שחקנים להוספה: ${membersSource ? membersSource.join(', ') : 'לא הוגדרו'}`);

        const result = fillEmptySlots(message.body, groupId);
        console.log(`📊 תוצאת עיבוד רשימה: ${result ? 'נמצאו מקומות ומולאו' : 'לא בוצע שינוי'}`);

        if (result) {
            if (config.requireConfirmation) {
                console.log('⏳ ממתין לאישור מהדשבורד...');

                const confirmationData = {
                    id: Date.now().toString(),
                    groupId,
                    groupName,
                    message: result.updatedText,
                    addedToMain: result.addedToMain,
                    addedToWaitlist: result.addedToWaitlist,
                    originalMessage: message,
                    chat
                };

                pendingConfirmations.set(confirmationData.id, confirmationData);
                console.log(`💾 נשמרה בקשה לאישור עם ID: ${confirmationData.id}`);

                io.emit('confirmation-required', {
                    id: confirmationData.id,
                    groupName,
                    addedToMain: result.addedToMain,
                    addedToWaitlist: result.addedToWaitlist,
                    previewText: result.updatedText
                });
                console.log(`📤 נשלחה בקשה לאישור לדשבורד`);
            } else {
                console.log('🚀 שולח תגובה אוטומטית...');
                const sent = await sendResponse(chat, message, result);
                if (sent) {
                    console.log('✅ ההודעה נשלחה בהצלחה!');
                } else {
                    console.error('❌ ההודעה לא נשלחה - יש שגיאה');
                }
            }
        } else {
            console.log('ℹ️ אין מה לשלוח - לא נמצאו שמות להוספה או אין מקומות פנויים');
        }

    } catch (error) {
        console.error('❌ שגיאה בעיבוד הודעה:', error);
        io.emit('error', { message: error.message });
    }
}

// ============ הפעלת השרתים ============
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ שגיאה: הפורט ${PORT} כבר תפוס!`);
        console.error(`💡 ייתכן שיש instance אחר של הבוט רץ.`);
        console.error(`💡 עצור את ה-instance הקודם או שנה את הפורט.`);
        process.exit(1);
    } else {
        console.error('❌ שגיאה בהפעלת השרת:', err);
        process.exit(1);
    }
});

server.listen(PORT, HOST, () => {
    console.log('╔════════════════════════════════════════╗');
    console.log('║   🎯 WhatsApp Football Bot Dashboard   ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('');
    console.log(`📊 דשבורד מקומי: http://localhost:${PORT}`);
    console.log(`🌐 לגישה חיצונית, השתמש ב-IP החיצוני של השרת על פורט ${PORT}`);
    console.log('🤖 הבוט מתחיל...\n');

    // אתחול
    initializeClient();
});

let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

async function initializeClient() {
    initAttempts++;
    
    try {
        console.log(`🔄 מאתחל את WhatsApp Client... (ניסיון ${initAttempts}/${MAX_INIT_ATTEMPTS})`);
        io.emit('log', { message: `מאתחל WhatsApp (ניסיון ${initAttempts})...` });

        // נקה client קודם אם קיים
        if (client) {
            try {
                console.log('🧹 מנקה client קודם...');
                await client.destroy();
            } catch (e) {
                console.log('⚠️ לא הצלחתי לנקות client קודם:', e.message);
            }
            client = null;
        }

        // המתן קצת לפני יצירת client חדש
        await new Promise(resolve => setTimeout(resolve, 2000));

        // צור client חדש
        client = createClient();
        setupClientEvents();

        // אתחל
        console.log('🚀 מתחיל אתחול...');
        await client.initialize();
        
        // אם הגענו לכאן - אפס את מונה הניסיונות
        initAttempts = 0;

    } catch (error) {
        console.error('❌ שגיאה באתחול:', error.message);
        io.emit('error', { message: `שגיאה באתחול: ${error.message}` });

        // נסה להרוס את ה-client
        if (client) {
            try {
                await client.destroy();
            } catch (e) { }
            client = null;
        }

        // אם לא הגענו למקסימום ניסיונות - נסה שוב
        if (initAttempts < MAX_INIT_ATTEMPTS) {
            const delay = initAttempts * 10000; // 10, 20, 30 שניות
            console.log(`🔄 מנסה שוב בעוד ${delay/1000} שניות...`);
            io.emit('log', { message: `מנסה שוב בעוד ${delay/1000} שניות...` });
            setTimeout(() => initializeClient(), delay);
        } else {
            console.error('❌ נכשלו כל ניסיונות האתחול!');
            console.log('💡 נסה למחוק את תיקיית .wwebjs_auth ולהפעיל מחדש');
            io.emit('error', { message: 'נכשלו כל ניסיונות האתחול. נסה להתנתק ולהתחבר מחדש.' });
            
            // אפס את המונה והמתן דקה לפני ניסיון נוסף
            initAttempts = 0;
            setTimeout(() => initializeClient(), 60000);
        }
    }
}

// טיפול בסגירה נקייה של התהליך
process.on('SIGINT', async () => {
    console.log('\n🛑 מקבל signal לסגירה...');
    try {
        await client.destroy();
        console.log('✅ הבוט נסגר בהצלחה');
        process.exit(0);
    } catch (error) {
        console.error('❌ שגיאה בסגירת הבוט:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 מקבל signal לסגירה...');
    try {
        await client.destroy();
        console.log('✅ הבוט נסגר בהצלחה');
        process.exit(0);
    } catch (error) {
        console.error('❌ שגיאה בסגירת הבוט:', error);
        process.exit(1);
    }
});

