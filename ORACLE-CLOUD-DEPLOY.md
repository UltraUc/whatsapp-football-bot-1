# 🚀 מדריך Deploy ל-Oracle Cloud Free Tier

## שלב 1: יצירת חשבון Oracle Cloud

1. היכנס ל: https://www.oracle.com/cloud/free/
2. לחץ על "Start for free"
3. מלא את הפרטים (צריך כרטיס אשראי לאימות, לא יחייבו!)
4. בחר Region קרוב (Frankfurt או Amsterdam)

## שלב 2: יצירת VM (מכונה וירטואלית)

1. היכנס ל-Oracle Cloud Console
2. לחץ על "Create a VM instance"
3. הגדרות:
   - **Name**: whatsapp-bot
   - **Image**: Ubuntu 22.04 (Always Free eligible)
   - **Shape**: VM.Standard.E2.1.Micro (Always Free)
   - **SSH Key**: צור מפתח חדש והורד אותו!
4. לחץ "Create"

## שלב 3: פתיחת פורט 3000

1. לך ל-"Virtual Cloud Networks"
2. לחץ על ה-VCN שנוצר
3. לחץ על "Security Lists" → "Default Security List"
4. לחץ "Add Ingress Rules"
5. הוסף:
   - **Source CIDR**: 0.0.0.0/0
   - **Destination Port**: 3000
   - **Protocol**: TCP
6. לחץ "Add"

## שלב 4: התחברות לשרת

### מ-Windows (PowerShell):
```powershell
ssh -i C:\path\to\your-key.key ubuntu@YOUR_PUBLIC_IP
```

### מ-Mac/Linux:
```bash
chmod 400 ~/your-key.key
ssh -i ~/your-key.key ubuntu@YOUR_PUBLIC_IP
```

## שלב 5: התקנת Docker בשרת

הריצו את הפקודות הבאות בשרת:

```bash
# עדכון המערכת
sudo apt update && sudo apt upgrade -y

# התקנת Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# הוספת המשתמש לקבוצת Docker
sudo usermod -aG docker ubuntu

# התקנת Docker Compose
sudo apt install docker-compose -y

# יציאה וכניסה מחדש (כדי שההרשאות יעבדו)
exit
```

התחבר מחדש לשרת אחרי היציאה.

## שלב 6: העלאת הפרויקט לשרת

### אפשרות א': עם Git (מומלץ)
```bash
# בשרת
git clone https://github.com/YOUR_USERNAME/whatsapp-football-bot.git
cd whatsapp-football-bot
```

### אפשרות ב': העלאה ידנית עם SCP
```powershell
# מהמחשב שלך (PowerShell)
scp -i C:\path\to\your-key.key -r C:\Users\offic\Downloads\whatsapp-football-bot ubuntu@YOUR_PUBLIC_IP:~/
```

## שלב 7: הפעלת הבוט

```bash
cd whatsapp-football-bot

# בנייה והפעלה
docker-compose up -d --build

# צפייה בלוגים (כדי לראות את ה-QR code)
docker-compose logs -f
```

## שלב 8: סריקת QR Code

1. בלוגים יופיע QR code
2. סרקו עם WhatsApp בטלפון
3. אחרי ההתחברות, הבוט יעבוד!

## שלב 9: גישה לדשבורד

פתח בדפדפן:
```
http://YOUR_PUBLIC_IP:3000
```

---

## 📋 פקודות שימושיות

```bash
# צפייה בלוגים
docker-compose logs -f

# הפעלה מחדש
docker-compose restart

# עצירה
docker-compose down

# עצירה + מחיקת הכל (כולל אימות)
docker-compose down -v

# עדכון הבוט
git pull
docker-compose up -d --build
```

## 🔧 פתרון בעיות

### הבוט לא מתחבר?
```bash
# מחק את האימות והתחל מחדש
sudo rm -rf wwebjs_auth
docker-compose restart
docker-compose logs -f
```

### אין מספיק זיכרון?
```bash
# בדוק שימוש בזיכרון
free -h
docker stats
```

### פורט 3000 לא נגיש?
1. ודא שפתחת את הפורט ב-Security List
2. בדוק Firewall בשרת:
```bash
sudo iptables -L
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
```

---

## 🎉 זהו! הבוט רץ 24/7 בחינם!

- הדשבורד נגיש מכל מקום
- הבוט ממשיך לעבוד גם אם תסגור את המחשב
- Oracle Cloud Free Tier = חינם לנצח!

