/**
 * קובץ בדיקה לבוט WhatsApp
 * הרץ את הקובץ הזה כדי לבדוק שהלוגיקה עובדת נכון
 */

// העתק את הפונקציות מהקובץ הראשי
function parseList(text) {
    const lines = text.split('\n');
    const emptySlots = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.includes('ממתינים')) {
            break;
        }
        
        const match = line.match(/^(\d+)\.\s*$/);
        if (match) {
            const slotNumber = parseInt(match[1]);
            if (slotNumber >= 1 && slotNumber <= 15) {
                emptySlots.push({ number: slotNumber, lineIndex: i });
            }
        }
    }
    
    return { lines, emptySlots };
}

function fillEmptySlots(text, namesToAdd) {
    const { lines, emptySlots } = parseList(text);
    
    if (emptySlots.length === 0) {
        console.log('❌ אין מקומות פנויים ברשימה');
        return null;
    }
    
    console.log(`✅ נמצאו ${emptySlots.length} מקומות פנויים:`, emptySlots.map(s => s.number).join(', '));
    
    let addedCount = 0;
    for (let i = 0; i < emptySlots.length && i < namesToAdd.length; i++) {
        const slot = emptySlots[i];
        const name = namesToAdd[i];
        lines[slot.lineIndex] = `${slot.number}. ${name}`;
        addedCount++;
    }
    
    if (addedCount > 0) {
        console.log(`✅ נוספו ${addedCount} שמות לרשימה`);
        return lines.join('\n');
    }
    
    return null;
}

// ============ בדיקות ============

console.log('🧪 מתחיל בדיקות...\n');

// דוגמה 1: רשימה עם מקומות פנויים
const example1 = `כדורגל יום רביעי
מגרש 6
21:00-23:00
1. נועם שושן
2. מתן
3. דורי
4. מאור אבינועם
5. יגל
6. זקירוב
7. אור
8. לידור
9. אברהם
10. יקיר
11. יוסי
12. אורי
13. 
14. 
15. 
ממתינים:
1. 
2. `;

console.log('📝 בדיקה 1: רשימה עם 3 מקומות פנויים');
console.log('─'.repeat(50));
const result1 = fillEmptySlots(example1, ['דני', 'רועי', 'עומר']);
if (result1) {
    console.log('\n📋 רשימה מעודכנת:');
    console.log(result1);
}

console.log('\n' + '='.repeat(50) + '\n');

// דוגמה 2: רשימה מלאה
const example2 = `כדורגל יום רביעי
מגרש 6
21:00-23:00
1. נועם
2. מתן
3. דורי
4. מאור
5. יגל
6. זקירוב
7. אור
8. לידור
9. אברהם
10. יקיר
11. יוסי
12. אורי
13. דני
14. רועי
15. עומר
ממתינים:
1. 
2. `;

console.log('📝 בדיקה 2: רשימה מלאה (אין מקומות פנויים)');
console.log('─'.repeat(50));
const result2 = fillEmptySlots(example2, ['דני', 'רועי', 'עומר']);

console.log('\n' + '='.repeat(50) + '\n');

// דוגמה 3: רשימה עם מקום אחד פנוי
const example3 = `כדורגל יום חמישי
מגרש 3
20:00-22:00
1. נועם
2. מתן
3. דורי
4. מאור
5. יגל
6. זקירוב
7. אור
8. לידור
9. אברהם
10. 
11. יוסי
12. אורי
13. דני
14. רועי
15. עומר
ממתינים:
1. משה
2. אבי`;

console.log('📝 בדיקה 3: רשימה עם מקום אחד פנוי');
console.log('─'.repeat(50));
const result3 = fillEmptySlots(example3, ['אייל']);
if (result3) {
    console.log('\n📋 רשימה מעודכנת:');
    console.log(result3);
}

console.log('\n' + '='.repeat(50) + '\n');
console.log('✅ הבדיקות הסתיימו!');
console.log('\n💡 טיפ: אם הבדיקות עבדו טוב, הבוט אמור לעבוד גם ב-WhatsApp');
