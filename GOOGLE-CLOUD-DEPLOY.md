# 🚀 מדריך Deploy ל-Google Cloud Platform (GCP)

## ⭐ יתרונות Google Cloud Free Tier

- **e2-micro VM חינמי לנצח** (ארה"ב בלבד)
- **$300 קרדיט חינם ל-90 ימים** (לכל מיקום)
- ממשק פשוט וידידותי
- תמיכה מצוינת

---

## שלב 1: יצירת חשבון Google Cloud

1. היכנס ל: https://cloud.google.com/free
2. לחץ על **"Get started for free"**
3. התחבר עם חשבון Google שלך
4. מלא פרטי חיוב (כרטיס אשראי - **לא יחייבו בלי אישורך!**)
5. קבל $300 קרדיט חינם

---

## שלב 2: יצירת VM Instance

### דרך 1: דרך הממשק (מומלץ למתחילים)

1. היכנס ל-Console: https://console.cloud.google.com
2. פתח תפריט ☰ → **Compute Engine** → **VM instances**
3. לחץ **CREATE INSTANCE**

**הגדרות:**
- **Name**: `whatsapp-bot`
- **Region**: `us-west1` (אורגון - חינמי)
- **Zone**: `us-west1-b`
- **Machine type**: 
  - Series: **E2**
  - Machine type: **e2-micro** (חינמי!)
- **Boot disk**: 
  - לחץ **CHANGE**
  - Operating system: **Ubuntu**
  - Version: **Ubuntu 22.04 LTS**
  - Size: **30 GB** (חינמי)
- **Firewall**:
  - ✅ סמן **Allow HTTP traffic**
  - ✅ סמן **Allow HTTPS traffic**

4. לחץ **CREATE**

### דרך 2: דרך Cloud Shell (מהיר)

לחץ על כפתור Cloud Shell בפינה הימנית העליונה, והרץ:

```bash
gcloud compute instances create whatsapp-bot \
    --zone=us-west1-b \
    --machine-type=e2-micro \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --tags=http-server,https-server
```

---

## שלב 3: פתיחת פורט 3000 (Firewall)

### דרך הממשק:

1. תפריט ☰ → **VPC network** → **Firewall**
2. לחץ **CREATE FIREWALL RULE**
3. הגדרות:
   - **Name**: `allow-dashboard`
   - **Direction**: `Ingress`
   - **Targets**: `All instances in the network`
   - **Source IP ranges**: `0.0.0.0/0`
   - **Protocols and ports**: 
     - ✅ Specified protocols and ports
     - tcp: `3000`
4. לחץ **CREATE**

### דרך Cloud Shell:

```bash
gcloud compute firewall-rules create allow-dashboard \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:3000 \
    --source-ranges=0.0.0.0/0
```

---

## שלב 4: התחברות לשרת

### מהממשק (הכי קל):

1. לך ל-**Compute Engine** → **VM instances**
2. ליד ה-VM שלך, לחץ על **SSH** (יפתח חלון דפדפן)

### מהמחשב שלך:

#### מ-Windows (PowerShell):
```powershell
gcloud compute ssh whatsapp-bot --zone=us-west1-b
```

#### מ-Mac/Linux:
```bash
gcloud compute ssh whatsapp-bot --zone=us-west1-b
```

> **לא עובד?** התקן את gcloud CLI: https://cloud.google.com/sdk/docs/install

---

## שלב 5: התקנת Docker בשרת

הרץ בשרת (אחרי ההתחברות):

```bash
# עדכון המערכת
sudo apt update && sudo apt upgrade -y

# התקנת Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# הוספת המשתמש לקבוצת Docker
sudo usermod -aG docker $USER

# התקנת Docker Compose
sudo apt install docker-compose -y

# יציאה וכניסה מחדש
exit
```

**חשוב:** התחבר מחדש אחרי היציאה!

---

## שלב 6: העלאת הפרויקט לשרת

### אפשרות א': עם Git (מומלץ)

```bash
# בשרת
git clone https://github.com/YOUR_USERNAME/whatsapp-football-bot.git
cd whatsapp-football-bot
```

### אפשרות ב': העלאה מהמחשב

#### דרך gcloud (הכי קל):
```bash
# מהמחשב שלך
cd C:\Users\offic\Downloads\whatsapp-football-bot
gcloud compute scp --recurse . whatsapp-bot:~/whatsapp-football-bot --zone=us-west1-b
```

#### דרך Cloud Shell:
1. לחץ על כפתור Cloud Shell
2. העלה קבצים: ⋮ (תפריט) → Upload
3. בחר את כל הקבצים

---

## שלב 7: הפעלת הבוט

```bash
cd whatsapp-football-bot

# בנייה והפעלה
docker-compose up -d --build

# צפייה בלוגים (כדי לראות QR code)
docker-compose logs -f
```

---

## שלב 8: סריקת QR Code

1. בלוגים יופיע **QR code ASCII**
2. פתח WhatsApp בטלפון → ⋮ → **Linked Devices**
3. סרוק את ה-QR code
4. ✅ הבוט מחובר!

---

## שלב 9: גישה לדשבורד

קבל את ה-IP החיצוני של השרת:

```bash
gcloud compute instances list
```

או בממשק: **Compute Engine** → **VM instances** → העתק את ה-**External IP**

פתח בדפדפן:
```
http://YOUR_EXTERNAL_IP:3000
```

---

## 💰 עלויות

### Free Tier (אורגון, ארה"ב):
- ✅ e2-micro VM - **חינם לנצח**
- ✅ 30GB Standard Storage - **חינם לנצח**
- ✅ 1GB Network Egress - **חינם לנצח**

### מחוץ לארה"ב:
- 💵 ~$5-7/חודש (e2-micro)
- 🎁 $300 קרדיט ל-90 ימים (מספיק ל-3-5 חודשים!)

### איך לבדוק עלויות?
תפריט ☰ → **Billing** → **Reports**

---

## 📋 פקודות שימושיות

```bash
# צפייה בלוגים
docker-compose logs -f

# הפעלה מחדש
docker-compose restart

# עצירה
docker-compose down

# עדכון הבוט
git pull
docker-compose up -d --build

# בדיקת סטטוס
docker ps
```

---

## 🔧 פתרון בעיות

### הבוט לא מתחבר?
```bash
# מחק אימות והתחל מחדש
sudo rm -rf wwebjs_auth
docker-compose restart
docker-compose logs -f
```

### פורט 3000 לא נגיש?
```bash
# בדוק שהפורט פתוח
sudo ufw status
sudo ufw allow 3000

# או השבת לחלוטין (לא מומלץ בפרודקשן)
sudo ufw disable
```

### אין מספיק זיכרון?
```bash
# בדוק שימוש
free -h
docker stats

# נקה מטמון Docker
docker system prune -a
```

### הבוט נעצר?
```bash
# הפעל אוטומטית בהפעלה מחדש
docker-compose up -d
```

---

## 🎯 טיפים חשובים

### 1. שמור על ה-IP קבוע
ברירת מחדל ה-IP משתנה בכל הפעלה מחדש.

**לשמור IP קבוע:**
```bash
gcloud compute addresses create whatsapp-bot-ip --region=us-west1

# הצמד ל-VM
gcloud compute instances delete-access-config whatsapp-bot --zone=us-west1-b
gcloud compute instances add-access-config whatsapp-bot \
    --address=$(gcloud compute addresses describe whatsapp-bot-ip --region=us-west1 --format='value(address)') \
    --zone=us-west1-b
```

> **שים לב:** IP קבוע עולה $3-5/חודש מחוץ לארה"ב.

### 2. הגדרת תחום (Domain)

אם יש לך דומיין:
1. הוסף A Record ב-DNS: `bot.yourdomain.com` → `YOUR_IP`
2. גש ל: `http://bot.yourdomain.com:3000`

### 3. גיבוי אוטומטי

```bash
# גיבוי config + auth
mkdir -p ~/backups
docker cp whatsapp-football-bot:/app/.wwebjs_auth ~/backups/
docker cp whatsapp-football-bot:/app/config.json ~/backups/
```

---

## 🛑 כיבוי השרת (לחיסכון)

אם אתה לא משתמש:

```bash
# מהמחשב שלך
gcloud compute instances stop whatsapp-bot --zone=us-west1-b

# להפעלה מחדש
gcloud compute instances start whatsapp-bot --zone=us-west1-b
```

---

## 🎉 זהו! הבוט רץ בענן!

✅ נגיש מכל מקום  
✅ רץ 24/7  
✅ חינמי (או זול מאוד)  
✅ גיבוי אוטומטי של Google

---

## 📚 קישורים שימושיים

- Google Cloud Console: https://console.cloud.google.com
- תיעוד Compute Engine: https://cloud.google.com/compute/docs
- מחשבון עלויות: https://cloud.google.com/products/calculator
- תמיכה: https://cloud.google.com/support

---

**נתקעת? יש בעיה?** פתח issue או שלח לי הודעה!

