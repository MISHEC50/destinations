@echo off
chcp 65001 >nul
echo.
echo  🦁  שאגת הארי – מערכת ניהול למידה אוריינית
echo  ================================================
echo.
echo  מפעיל שרת... אנא המתיני מספר שניות.
echo  לאחר ההפעלה פתחי את הדפדפן בכתובת:
echo.
echo        http://localhost:3000
echo.
echo  לסגירה: לחצי Ctrl+C
echo.
echo  האם לפתוח קישור ציבורי (לגישה מחוץ לבית-ספר)? [y/N]
set /p SHARE=
if /i "%SHARE%"=="y" (
  start "ngrok" cmd /k "npx ngrok http 3000"
  echo.
  echo  חלון ngrok נפתח. העתיקי את הכתובת שמתחילה ב- https://
  echo.
)
node server.js
pause
