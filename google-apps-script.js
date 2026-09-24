/**
 * גיבוי ל-Google Sheets עבור "כלי מיפוי יישובי-מועצתי" (המכלול)
 *
 * מבנה הגיליון "Submissions" שנוצר אוטומטית:
 * - שורה 1 (נעולה): כותרות קריאות לבני אדם - "תאריך מילוי", "ציון תחום: ...", שם ההיגד המלא וכו'.
 * - שורה 2 (נעולה, מוסתרת): מפתחות טכניים יציבים לכל עמודה - משמשים את הסקריפט כדי לדעת
 *   תמיד לאיזו עמודה לכתוב, גם אם עורכים את נוסח ההיגד או שם התחום דרך מערכת הניהול באתר.
 * - שורה 3 ואילך: הנתונים עצמם - שורה אחת לכל מילוי (עם עדכון "בזמן אמת" של אותה שורה תוך כדי
 *   שהמשתמש עונה, לפי מזהה המילוי בעמודה הראשונה).
 * - כל היגד בשאלון מקבל עמודה נפרדת משלו עם הציון שניתן לו (1-4) - כך שאפשר לסנן, למיין
 *   ולעשות טבלאות ציר (Pivot table) לפי כל שאלה בנפרד.
 *
 * הקמה חד-פעמית:
 * 1. פותחים Google Sheet חדש וריק.
 * 2. תפריט: Extensions > Apps Script.
 * 3. מוחקים את הקוד שכבר שם ומדביקים את כל הקובץ הזה במקומו.
 * 4. Deploy > New deployment > Select type: Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Deploy, ולאשר את בקשות ההרשאה של Google.
 * 6. מעתיקים את כתובת ה-Web app שמתקבלת (מסתיימת ב-/exec) ומעדכנים אותה
 *    ב-public/js/config.js באתר.
 *
 * אם עורכים את הקוד הזה בעתיד - חייבים לעשות Deploy > Manage deployments > עריכה > New version
 * כדי שהשינוי ייכנס לתוקף בכתובת הקיימת (סתם לשמור את הקובץ לא מספיק).
 */

const SHARED_SECRET = "17d309acf96ba57dbef9c1f05a32151d";
const SHEET_NAME = "Submissions";
const TIMEZONE = "Asia/Jerusalem";

const FIXED_COLUMNS = [
  { key: "id", header: "מזהה" },
  { key: "createdAt", header: "תאריך מילוי" },
  { key: "updatedAt", header: "עודכן לאחרונה" },
  { key: "settlementType", header: "סוג" },
  { key: "settlement", header: "שם היישוב/המועצה" },
  { key: "subSettlement", header: "יישוב ספציפי" },
  { key: "respondent", header: "שם הממלא/ת" },
  { key: "role", header: "תפקיד" },
  { key: "gender", header: "מגדר (לשון)" },
  { key: "overallAverage", header: "ציון כולל" },
  { key: "level:קהילה", header: "קהילה" },
  { key: "level:הנהגה", header: "הנהגה" },
  { key: "level:מערכת", header: "מערכת" },
  { key: "level:צוות", header: "צוות" },
  { key: "level:ילדים ונוער", header: "ילדים ונוער" },
];

function formatDate(iso) {
  if (!iso) return "";
  try {
    return Utilities.formatDate(new Date(iso), TIMEZONE, "dd/MM/yyyy HH:mm");
  } catch (e) {
    return iso;
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  if (sheet.getRange(1, 1).getValue() === "") {
    // Brand new sheet - lay down the fixed headers/keys.
    FIXED_COLUMNS.forEach((col, i) => {
      sheet.getRange(1, i + 1).setValue(col.header);
      sheet.getRange(2, i + 1).setValue(col.key);
    });
    sheet.setFrozenRows(2);
    try {
      sheet.hideRows(2);
    } catch (e) {
      // ignore - not critical if hiding fails
    }
  }
  return sheet;
}

// Returns the 1-based column number for `key`, creating a new column with `header` if needed.
function getOrCreateColumn(sheet, key, header) {
  const lastCol = sheet.getLastColumn();
  const keys = lastCol > 0 ? sheet.getRange(2, 1, 1, lastCol).getValues()[0] : [];
  const idx = keys.indexOf(key);
  if (idx !== -1) return idx + 1;

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(header);
  sheet.getRange(2, newCol).setValue(key);
  return newCol;
}

// Returns the 1-based row number for this submission id, creating a new row if needed.
function getOrCreateRow(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow >= 3) {
    const ids = sheet.getRange(3, 1, lastRow - 2, 1).getValues().flat();
    const idx = ids.indexOf(id);
    if (idx !== -1) return idx + 3;
  }
  return Math.max(lastRow + 1, 3);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid json" });
  }

  if (data.secret !== SHARED_SECRET) {
    return jsonResponse({ ok: false, error: "forbidden" });
  }

  try {
    const sheet = getOrCreateSheet();
    const row = getOrCreateRow(sheet, data.id);

    const fixed = data.fixed || {};
    const fixedValues = {
      id: data.id || "",
      createdAt: formatDate(data.createdAt),
      updatedAt: formatDate(data.updatedAt),
      settlementType: fixed.settlementType || "",
      settlement: fixed.settlement || "",
      subSettlement: fixed.subSettlement || "",
      respondent: fixed.respondent || "",
      role: fixed.role || "",
      gender: fixed.gender || "",
      overallAverage: fixed.overallAverage ?? "",
      "level:קהילה": fixed.levelAverages?.["קהילה"] ?? "",
      "level:הנהגה": fixed.levelAverages?.["הנהגה"] ?? "",
      "level:מערכת": fixed.levelAverages?.["מערכת"] ?? "",
      "level:צוות": fixed.levelAverages?.["צוות"] ?? "",
      "level:ילדים ונוער": fixed.levelAverages?.["ילדים ונוער"] ?? "",
    };

    FIXED_COLUMNS.forEach((col, i) => {
      sheet.getRange(row, i + 1).setValue(fixedValues[col.key]);
    });

    (data.dynamicColumns || []).forEach((col) => {
      const colNum = getOrCreateColumn(sheet, col.key, col.header);
      sheet.getRange(row, colNum).setValue(col.value);
    });

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err.message || err) });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
