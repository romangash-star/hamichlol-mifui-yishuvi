// הגדרות האתר הסטטי - האתר הזה רץ בלי שרת משלו (GitHub Pages), כל שמירה
// נשלחת ישירות מהדפדפן ל-Google Apps Script Web App שמעדכן גיליון Google Sheets.
//
// אחרי שמפרסמים את ה-Apps Script (ראו google-apps-script.js), מדביקים כאן
// את כתובת ה-Web app שמתקבלת (מסתיימת ב-/exec).
//
// ADMIN_WORKER_URL - כתובת ה-Cloudflare Worker של מערכת הניהול (ראו admin-worker.js).
// זו הכתובת היחידה שדרכה אפשר לפרסם שינויים לתוכן - הסיסמה עצמה לא נמצאת כאן,
// היא נבדקת בצד השרת (ב-Worker) בלבד.
window.APP_CONFIG = {
  SHEETS_WEBHOOK_URL: "", // לדוגמה: "https://script.google.com/macros/s/XXXXXXXX/exec"
  SHARED_SECRET: "17d309acf96ba57dbef9c1f05a32151d",
  ADMIN_WORKER_URL: "", // לדוגמה: "https://hamichlol-admin.your-subdomain.workers.dev"
};
