@echo off
REM סקריפט להפעלת הבוט עם Docker ב-Windows

echo 🤖 מפעיל WhatsApp Football Bot עם Docker...
echo.

REM בדיקה אם Docker רץ
docker info >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker לא רץ או לא מותקן!
    echo.
    echo התקן Docker Desktop: https://www.docker.com/products/docker-desktop
    echo.
    pause
    exit /b 1
)

REM בנייה והפעלה
echo 🔨 בונה ומפעיל את הבוט...
docker-compose up -d --build

REM המתנה קצרה
timeout /t 3 /nobreak >nul

echo.
echo ✅ הבוט רץ!
echo.
echo 📊 דשבורד: http://localhost:3000
echo.
echo 📋 לצפייה בלוגים (כולל QR code):
echo    docker-compose logs -f
echo.
echo ⏹️ לעצירת הבוט:
echo    docker-compose down
echo.
pause

