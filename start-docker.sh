#!/bin/bash
# סקריפט להפעלת הבוט עם Docker

echo "🤖 מפעיל WhatsApp Football Bot עם Docker..."

# בדיקה אם Docker מותקן
if ! command -v docker &> /dev/null; then
    echo "❌ Docker לא מותקן!"
    echo "התקן Docker: curl -fsSL https://get.docker.com | sudo sh"
    exit 1
fi

# בדיקה אם Docker Compose מותקן
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose לא מותקן!"
    echo "התקן: sudo apt install docker-compose -y"
    exit 1
fi

# בנייה והפעלה
echo "🔨 בונה ומפעיל את הבוט..."
docker-compose up -d --build

# המתנה קצרה
sleep 3

# הצגת סטטוס
echo ""
echo "✅ הבוט רץ!"
echo ""
echo "📊 דשבורד: http://localhost:3000"
echo ""
echo "📋 לצפייה בלוגים (כולל QR code):"
echo "   docker-compose logs -f"
echo ""
echo "⏹️ לעצירת הבוט:"
echo "   docker-compose down"
echo ""

