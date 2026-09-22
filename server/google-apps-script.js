/**
 * גיבוי ל-Google Sheets עבור "כלי מיפוי יישובי-מועצתי" (המכלול)
 *
 * הקמה חד-פעמית:
 * 1. פותחים Google Sheet חדש וריק.
 * 2. תפריט: Extensions > Apps Script.
 * 3. מוחקים את הקוד שכבר שם ומדביקים את כל הקובץ הזה במקומו.
 * 4. Deploy > New deployment > Select type: Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Deploy, ולאשר את בקשות ההרשאה של Google.
 * 6. מעתיקים את כתובת ה-Web app שמתקבלת (מסתיימת ב-/exec).
 * 7. שולחים לי את הכתובת הזו, ואני אחבר אותה לשרת
 *    (server/data/config.json או משתנה סביבה GOOGLE_SHEETS_WEBHOOK_URL ב-Render).
 *
 * מרגע החיבור - כל שמירה בכלי (גם שמירה אוטומטית תוך כדי מילוי) תישלח גם לגיליון הזה,
 * בנוסף לשמירה המקומית שכבר קיימת. שורה אחת לכל מילוי, מתעדכנת (upsert) לפי מזהה.
 */

const HEADERS = [
  "id", "createdAt", "updatedAt", "gender", "settlementType", "settlement",
  "subSettlement", "role", "respondent", "selectedCategories", "overallAverage",
  "categoryScores", "levelScores", "selectedGoalsCount", "selectedGoals",
];

function doPost(e) {
  const sheet =
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Submissions") ||
    SpreadsheetApp.getActiveSpreadsheet().insertSheet("Submissions");

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }

  const data = JSON.parse(e.postData.contents);
  const row = [
    data.id || "",
    data.createdAt || "",
    data.updatedAt || "",
    data.meta?.gender || "",
    data.meta?.settlementType || "",
    data.meta?.settlement || "",
    data.meta?.subSettlement || "",
    data.meta?.role || "",
    data.meta?.respondent || "",
    (data.selectedCategories || []).join(" | "),
    data.results?.overallAverage ?? "",
    JSON.stringify(data.results?.categoryScores || []),
    JSON.stringify(data.results?.levelScores || []),
    (data.selectedGoals || []).length,
    JSON.stringify(data.selectedGoals || []),
  ];

  // Upsert: אם כבר יש שורה עם אותו id מעדכנים אותה, אחרת מוסיפים שורה חדשה.
  const lastRow = sheet.getLastRow();
  const ids = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat() : [];
  const existingRowIndex = ids.indexOf(data.id);

  if (existingRowIndex !== -1) {
    sheet.getRange(existingRowIndex + 2, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON
  );
}
