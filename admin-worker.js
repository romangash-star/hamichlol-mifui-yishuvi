/**
 * Cloudflare Worker - שער כניסה מאובטח למערכת הניהול של "כלי מיפוי יישובי-מועצתי"
 *
 * זהו הקוד היחיד בפרויקט שבו סיסמת המנהל וטוקן ה-GitHub נבדקים בצד שרת אמיתי -
 * אי אפשר לעקוף אותו מה-DevTools בדפדפן, בניגוד לבדיקה שהייתה נעשית בצד הלקוח.
 *
 * מה הוא עושה:
 * - /login   - בודק שהסיסמה נכונה (משמש למסך הכניסה במערכת הניהול)
 * - /publish - בודק סיסמה, ואם נכונה מעדכן את קבצי התוכן ב-GitHub
 *              (public/data/questions.json ו/או public/data/goals-bank.json).
 *              העדכון מפעיל אוטומטית את ה-GitHub Action הקיים שמפרסם מחדש ל-GitHub Pages.
 *
 * הקמה חד-פעמית (כ-10 דקות):
 *
 * 1. יצירת GitHub Token מוגבל (לא נותנים לי אותו - הוא נשאר רק אצל Cloudflare):
 *    - נכנסים ל-github.com/settings/tokens?type=beta (Fine-grained tokens)
 *    - Generate new token
 *    - Repository access: Only select repositories -> hamichlol-mifui-yishuvi
 *    - Permissions: Contents -> Read and write (זה הכל, לא צריך שום הרשאה אחרת)
 *    - יוצרים ומעתיקים את הטוקן (מתחיל ב-github_pat_...)
 *
 * 2. יצירת Worker ב-Cloudflare (חינמי, בלי כרטיס אשראי):
 *    - נרשמים / נכנסים ל-dash.cloudflare.com
 *    - בתפריט: Workers & Pages -> Create -> Create Worker
 *    - נותנים שם (למשל hamichlol-admin) -> Deploy
 *    - Edit code -> מוחקים הכל, מדביקים את כל הקובץ הזה -> Deploy
 *
 * 3. הגדרת הסודות (לעולם לא בקוד עצמו, רק כאן):
 *    - במסך ה-Worker: Settings -> Variables and Secrets -> Add
 *    - ADMIN_PASSWORD = הסיסמה שתרצו למערכת הניהול (בוחרים סיסמה משלכם)
 *    - GITHUB_TOKEN = הטוקן שיצרתם בשלב 1
 *    - Save and deploy
 *
 * 4. מעתיקים את כתובת ה-Worker (למעלה, נראית כמו
 *    https://hamichlol-admin.<your-subdomain>.workers.dev) ומדביקים אותה
 *    ב-public/js/config.js תחת ADMIN_WORKER_URL.
 */

const REPO_OWNER = "romangash-star";
const REPO_NAME = "hamichlol-mifui-yishuvi";
const BRANCH = "main";
const QUESTIONS_PATH = "public/data/questions.json";
const GOALS_PATH = "public/data/goals-bank.json";
const ALLOWED_ORIGIN = "https://romangash-star.github.io";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function githubGetFile(env, path) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "hamichlol-admin-worker",
      },
    }
  );
  if (!res.ok) throw new Error(`שגיאה בקריאת ${path}: ${res.status}`);
  return res.json();
}

async function githubPutFile(env, path, contentObj, sha, message) {
  const contentStr = JSON.stringify(contentObj, null, 2);
  const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "hamichlol-admin-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(contentStr),
      sha,
      branch: BRANCH,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`שגיאה בעדכון ${path}: ${res.status} ${errText}`);
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "method not allowed" }, 405);
    }

    const url = new URL(request.url);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
      return json({ ok: false, error: "wrong password" }, 401);
    }

    if (url.pathname === "/login") {
      return json({ ok: true });
    }

    if (url.pathname === "/publish") {
      try {
        if (body.questions) {
          const current = await githubGetFile(env, QUESTIONS_PATH);
          await githubPutFile(env, QUESTIONS_PATH, body.questions, current.sha, "עדכון שאלות ותחומים דרך מערכת הניהול");
        }
        if (body.goals) {
          const current = await githubGetFile(env, GOALS_PATH);
          await githubPutFile(env, GOALS_PATH, body.goals, current.sha, "עדכון בנק מטרות דרך מערכת הניהול");
        }
        return json({ ok: true });
      } catch (err) {
        return json({ ok: false, error: String(err.message || err) }, 500);
      }
    }

    return json({ ok: false, error: "not found" }, 404);
  },
};
