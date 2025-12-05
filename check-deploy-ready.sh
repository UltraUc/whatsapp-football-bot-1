#!/bin/bash
# בדיקה אם הפרויקט מוכן ל-Deploy

echo "🔍 בודק אם הפרויקט מוכן ל-Deploy..."
echo ""

READY=true

# בדיקת קבצים חיוניים
echo "📁 בדיקת קבצים..."

if [ ! -f "package.json" ]; then
    echo "❌ חסר: package.json"
    READY=false
else
    echo "✅ package.json"
fi

if [ ! -f "whatsapp-football-bot.js" ]; then
    echo "❌ חסר: whatsapp-football-bot.js"
    READY=false
else
    echo "✅ whatsapp-football-bot.js"
fi

if [ ! -f "config.json" ]; then
    echo "❌ חסר: config.json"
    READY=false
else
    echo "✅ config.json"
fi

if [ ! -f "Dockerfile" ]; then
    echo "❌ חסר: Dockerfile"
    READY=false
else
    echo "✅ Dockerfile"
fi

if [ ! -f "docker-compose.yml" ]; then
    echo "❌ חסר: docker-compose.yml"
    READY=false
else
    echo "✅ docker-compose.yml"
fi

echo ""
echo "🔧 בדיקת הגדרות..."

# בדיקת config.json
if [ -f "config.json" ]; then
    # בדיקה אם יש קבוצות נבחרות
    GROUPS=$(grep -o '"selectedGroups"' config.json)
    if [ -z "$GROUPS" ]; then
        echo "⚠️  config.json: לא הוגדרו קבוצות"
    else
        echo "✅ קבוצות נבחרות הוגדרו"
    fi
    
    # בדיקה אם יש חברים
    MEMBERS=$(grep -o '"membersToAdd"' config.json)
    if [ -z "$MEMBERS" ]; then
        echo "⚠️  config.json: לא הוגדרו שמות חברים"
    else
        echo "✅ שמות חברים הוגדרו"
    fi
fi

echo ""
echo "🐳 בדיקת Docker..."

# בדיקה אם Docker מותקן (אופציונלי לבדיקה מקומית)
if command -v docker &> /dev/null; then
    echo "✅ Docker מותקן"
    
    # בדיקה אם Docker רץ
    if docker info &> /dev/null; then
        echo "✅ Docker רץ"
    else
        echo "⚠️  Docker מותקן אבל לא רץ"
    fi
else
    echo "ℹ️  Docker לא מותקן (יותקן בשרת)"
fi

echo ""
echo "═══════════════════════════════════════"

if [ "$READY" = true ]; then
    echo "✅ הפרויקט מוכן ל-Deploy!"
    echo ""
    echo "📚 צעדים הבאים:"
    echo "   1. קרא את DEPLOY-QUICK-START.md"
    echo "   2. בחר שרת: Google Cloud או Oracle Cloud"
    echo "   3. עקוב אחרי המדריך המתאים"
else
    echo "❌ הפרויקט לא מוכן ל-Deploy"
    echo "   תקן את השגיאות למעלה"
fi

echo "═══════════════════════════════════════"

