const { Client, LocalAuth } = require('whatsapp-web.js');

// דוגמת טקסט
const testList = `כדורגל יום רביעי
מגרש 6
21:00-23:00
1.
2.
3. 
 4 .
5. 
6.
7. 
8.
9.
10. 
11. 
12.
13. 
14.
15.

ממתינים:
1. 
2. ⁠
3.
4.
5.⁠
6.
7. 
8. 
9.`;

console.log('בודק parsing של רשימה...\n');

function parseList(text) {
    const lines = text.split('\n');
    const emptySlots = [];
    const waitlistSlots = [];
    let inWaitlist = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.includes('ממתינים')) {
            inWaitlist = true;
            continue;
        }

        // Regex גמיש - מאפשר רווחים לפני/אחרי
        const match = line.match(/^\s*(\d+)\s*\.\s*$/);
        if (match) {
            const slotNumber = parseInt(match[1]);

            if (!inWaitlist) {
                if (slotNumber >= 1 && slotNumber <= 15) {
                    emptySlots.push({ number: slotNumber, lineIndex: i, type: 'main' });
                }
            } else {
                waitlistSlots.push({ number: slotNumber, lineIndex: i, type: 'waitlist' });
            }
        }
    }

    return { lines, emptySlots, waitlistSlots };
}

const result = parseList(testList);

console.log('מקומות פנויים ברשימה הראשית:', result.emptySlots.length);
console.log(result.emptySlots.map(s => s.number).join(', '));

console.log('\nמקומות פנויים ברשימת ממתינים:', result.waitlistSlots.length);
console.log(result.waitlistSlots.map(s => s.number).join(', '));

console.log('\n✅ אמור למצוא 15 מקומות ברשימה ו-9 בממתינים');
