# ⚡ מדריך מהיר - Deploy תוך 10 דקות!

## בחר את השרת שלך:

### 🔷 Google Cloud (מומלץ!)
- ✅ $300 קרדיט חינם
- ✅ ממשק פשוט
- ✅ e2-micro חינם בארה"ב

**👉 [מדריך מלא Google Cloud](GOOGLE-CLOUD-DEPLOY.md)**

### 🔶 Oracle Cloud
- ✅ חינם לנצח (כל מיקום)
- ✅ 1GB RAM
- ⚠️ תהליך הרשמה מורכב יותר

**👉 [מדריך מלא Oracle Cloud](ORACLE-CLOUD-DEPLOY.md)**

---

## 🚀 תהליך מהיר (Google Cloud)

### 1. צור VM
```bash
gcloud compute instances create whatsapp-bot \
    --zone=us-west1-b \
    --machine-type=e2-micro \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB
```

### 2. פתח פורט
```bash
gcloud compute firewall-rules create allow-dashboard \
    --direction=INGRESS \
    --action=ALLOW \
    --rules=tcp:3000 \
    --source-ranges=0.0.0.0/0
```

### 3. התחבר
```bash
gcloud compute ssh whatsapp-bot --zone=us-west1-b
```

### 4. התקן Docker
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install docker-compose -y
exit  # התחבר מחדש
```

### 5. העלה פרויקט והפעל
```bash
# מהמחשב שלך
cd whatsapp-football-bot
gcloud compute scp --recurse . whatsapp-bot:~/whatsapp-football-bot --zone=us-west1-b

# בשרת
cd whatsapp-football-bot
docker-compose up -d --build
docker-compose logs -f  # סרוק QR code
```

### 6. גש לדשבורד
```bash
# קבל את ה-IP
gcloud compute instances list

# פתח בדפדפן
# http://YOUR_IP:3000
```

---

## 🎯 זהו! הבוט עובד!

**מה עכשיו?**
- סרוק QR code מהלוגים
- גש לדשבורד מהדפדפן
- הגדר את הקבוצות והשמות

**בעיות?** קרא את המדריך המלא: [Google](GOOGLE-CLOUD-DEPLOY.md) | [Oracle](ORACLE-CLOUD-DEPLOY.md)

