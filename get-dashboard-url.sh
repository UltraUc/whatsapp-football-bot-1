#!/bin/bash

# סקריפט לקבלת IP החיצוני של השרת ופתיחת הדשבורד

echo "🔍 בודק את IP החיצוני של השרת..."
EXTERNAL_IP=$(curl -s ifconfig.me)

if [ -z "$EXTERNAL_IP" ]; then
    echo "❌ לא הצלחתי למצוא את ה-IP החיצוני"
    echo "נסה ידנית: curl ifconfig.me"
    exit 1
fi

echo "✅ IP החיצוני של השרת: $EXTERNAL_IP"
echo ""
echo "📊 פתח את הדשבורד בדפדפן:"
echo "   http://$EXTERNAL_IP:3000"
echo ""
echo "🔥 ודא שהפורט 3000 פתוח:"
echo "   gcloud compute firewall-rules list | grep 3000"
echo ""
echo "אם הפורט לא פתוח, הרץ:"
echo "   gcloud compute firewall-rules create allow-dashboard \\"
echo "       --direction=INGRESS \\"
echo "       --action=ALLOW \\"
echo "       --rules=tcp:3000 \\"
echo "       --source-ranges=0.0.0.0/0"
echo ""
