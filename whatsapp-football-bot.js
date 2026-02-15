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

// ============ יצירת הבוט ============
let client = null;
let isClientReady = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 10000; // 10 שניות

function createClient() {
    return new Client({
        authStrategy: new LocalAuth({
            dataPath: './.wwebjs_auth',
            clientId: 'whatsapp-bot'
        }),
        puppeteer: {
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-sync',
                '--disable-translate',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-default-browser-check',
                '--safebrowsing-disable-auto-update'
            ],
            timeout: 60000 // 60 שניות timeout
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/AuYuRa/test1/main/AuYuRa.json'
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

    // Loading screen
    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ טוען: ${percent}% - ${message}`);
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
        console.log('✅ הבוט מוכן לפעולה!');
        isClientReady = true;
        botStatus.isReady = true;
        botStatus.isAuthenticated = true;
        botStatus.qrCode = null;
        reconnectAttempts = 0; // איפוס מונה ניסיונות חיבור מחדש
        io.emit('status-update', botStatus);

        // טען קבוצות ברקע (לא חוסם)
        loadGroupsBackground();
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

    // הודעות
    client.on('message', handleMessage);
}

// טעינת קבוצות ברקע ללא חסימה
async function loadGroupsBackground() {
    console.log('📋 מתחיל לטעון קבוצות ברקע...');
    try {
        await loadGroups(true);
        console.log('✅ קבוצות נטענו!');
    } catch (e) {
        console.log('⚠️ בעיה בטעינת קבוצות - תתמלא מהודעות:', e.message);
    }
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
        const line = lines[i].trim();

        // מזהה מתי מתחילה רשימת ממתינים
        if (line.includes('ממתינים')) {
            inWaitlist = true;
            waitlistStartIndex = i;
            continue;
        }

        // Regex גמיש יותר - מאפשר רווחים לפני/אחרי המספר והנקודה
        // מטפל גם בתווים מיוחדים כמו zero-width space
        const match = line.match(/^\s*(\d+)\s*\.\s*$/);
        if (match) {
            const slotNumber = parseInt(match[1]);

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
                const name = nameMatch[2].trim();

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
 * מגביל ל-30 קבוצות אחרונות + כל הנבחרות
 * משתמש ב-timeout למניעת תקיעה
 */
let lastGroupsLoad = 0;
const GROUPS_CACHE_TTL = 60000; // 1 דקה cache

async function loadGroups(forceRefresh = false) {
    const now = Date.now();

    // החזר cache אם עדיין בתוקף ולא מאולץ
    if (groupsCache && !forceRefresh && (now - lastGroupsLoad) < GROUPS_CACHE_TTL) {
        console.log('📦 מחזיר קבוצות מהמטמון (cache בתוקף)');
        return groupsCache;
    }

    if (isLoadingGroups) {
        console.log('⏳ טעינת קבוצות כבר בתהליך, ממתין...');
        // המתן לטעינה הנוכחית במקום להחזיר null
        return new Promise((resolve) => {
            const checkCache = setInterval(() => {
                if (!isLoadingGroups && groupsCache) {
                    clearInterval(checkCache);
                    resolve(groupsCache);
                }
            }, 100);
            // timeout של 10 שניות
            setTimeout(() => {
                clearInterval(checkCache);
                resolve(groupsCache || []);
            }, 10000);
        });
    }

    try {
        isLoadingGroups = true;
        const startTime = Date.now();
        console.log('🔄 טוען קבוצות מ-WhatsApp...');

        // timeout - נקבע בהגדרות (ברירת מחדל 60 שניות)
        const timeoutMs = (config.groupsLoadTimeout || 60) * 1000;
        console.log(`⏱️ Timeout מוגדר ל-${config.groupsLoadTimeout || 60} שניות`);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout בטעינת קבוצות')), timeoutMs)
        );

        const chatsPromise = client.getChats();
        const chats = await Promise.race([chatsPromise, timeoutPromise]);

        // סינון - רק קבוצות
        const groups = [];
        for (const chat of chats) {
            if (chat.isGroup && !chat.archived && chat.name) {
                groups.push({
                    id: chat.id._serialized,
                    name: chat.name,
                    timestamp: chat.timestamp || 0,
                    isSelected: config.selectedGroups.includes(chat.id._serialized)
                });
            }
        }

        console.log(`📊 נמצאו ${groups.length} קבוצות ב-${Date.now() - startTime}ms`);

        // הפרד לנבחרות ולא נבחרות
        const selected = [];
        const unselected = [];
        for (const g of groups) {
            if (g.isSelected) selected.push(g);
            else unselected.push(g);
        }

        //  מיין ובחר 10 לא-נבחרות אחרונות
        unselected.sort((a, b) => b.timestamp - a.timestamp);
        const maxUnselected = Math.max(0, 10 - selected.length);
        const limited = unselected.slice(0, maxUnselected);

        // שלב - נבחרות קודם
        groupsCache = [...selected, ...limited];
        lastGroupsLoad = now;

        // שמור לקובץ כ-backup
        saveGroupsToFile(groupsCache);

        console.log(`✅ טעינה הושלמה: ${selected.length} נבחרות + ${limited.length} אחרות`);
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

// טעינת קבוצות מקובץ backup
function loadGroupsFromFile() {
    try {
        const filePath = path.join(__dirname, '.groups_cache.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        // שקט
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

// קבלת כל הקבוצות
app.get('/api/groups', async (req, res) => {
    try {
        if (!botStatus.isReady) {
            return res.status(503).json({ error: 'הבוט עדיין לא מוכן' });
        }

        const groups = await loadGroups();
        if (!groups) {
            return res.status(500).json({ error: 'שגיאה בטעינת קבוצות' });
        }

        res.json(groups);
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// עדכון קבוצות נבחרות
app.post('/api/groups/selected', (req, res) => {
    try {
        const { selectedGroups } = req.body;

        if (!Array.isArray(selectedGroups)) {
            return res.status(400).json({ error: 'selectedGroups חייב להיות מערך' });
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
        if (!botStatus.isReady) {
            return res.status(503).json({ error: 'הבוט עדיין לא מוכן' });
        }

        const groups = await loadGroups(true);
        res.json({ success: true, groups });
    } catch (error) {
        console.error('❌ שגיאה ב-/api/groups/refresh:', error);
        res.status(500).json({ error: error.message });
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
    try {
        // לוג ראשוני לכל הודעה שנכנסת
        console.log('\n📨 === הודעה חדשה נכנסה ===');
        console.log(`📄 תוכן: ${message.body.substring(0, 50)}...`);

        const chat = await message.getChat();
        console.log(`💬 צ'אט: ${chat.name} | isGroup: ${chat.isGroup}`);

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

        // בודק אם זו הודעה מהמשתמש עצמו (טסט עצמי)
        const isSelfMessage = message.fromMe;
        console.log(`❓ האם הודעה עצמית? ${isSelfMessage ? 'כן' : 'לא'} | מצב טסט עצמי: ${config.selfTestMode}`);

        if (isSelfMessage && !config.selfTestMode) {
            console.log('❌ הודעה עצמית וטסט עצמי כבוי, מתעלם.');
            return;
        }

        const isFootball = isFootballList(message.body);
        console.log(`❓ האם זוהתה רשימת כדורגל? ${isFootball ? 'כן' : 'לא'}`);

        if (!isFootball) {
            console.log('❌ לא זוהתה רשימת כדורגל (מילות מפתח חסרות).');
            return;
        }

        console.log(`✅ הודעה תקינה! מתחיל עיבוד...`);
        console.log(`\n📨 התקבלה הודעה בקבוצה: ${groupName}`);
        console.log(`👤 מאת: ${fromName}${isSelfMessage ? ' (אתה - טסט עצמי)' : ''}`);

        io.emit('message-received', {
            groupId,
            group: groupName,
            from: fromName,
            message: message.body.substring(0, 100) + '...',
            fullMessage: message.body
        });

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

async function initializeClient() {
    try {
        console.log('🔄 מאתחל את WhatsApp Client...');

        // צור client חדש
        client = createClient();
        setupClientEvents();

        // אתחל
        await client.initialize();

    } catch (error) {
        console.error('❌ שגיאה באתחול:', error.message);

        if (error.message && error.message.includes('already exists')) {
            console.log('⚠️ בעיית binding - מנסה שוב...');

            // נסה להרוס ולאתחל מחדש
            try {
                if (client) await client.destroy();
            } catch (e) { }

            // המתן ונסה שוב
            setTimeout(async () => {
                try {
                    client = createClient();
                    setupClientEvents();
                    await client.initialize();
                } catch (e) {
                    console.error('❌ נכשל שוב:', e.message);
                }
            }, 5000);
        } else {
            // שגיאה אחרת - נסה שוב אחרי 10 שניות
            console.log('🔄 מנסה שוב בעוד 10 שניות...');
            setTimeout(() => initializeClient(), 10000);
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

