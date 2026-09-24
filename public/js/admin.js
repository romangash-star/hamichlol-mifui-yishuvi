(() => {
  "use strict";

  const state = {
    questions: null,
    goals: null,
    password: "",
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function workerUrl(path) {
    const base = (window.APP_CONFIG && window.APP_CONFIG.ADMIN_WORKER_URL) || "";
    return base.replace(/\/$/, "") + path;
  }

  async function loadData() {
    const [qRes, gRes] = await Promise.all([fetch("data/questions.json"), fetch("data/goals-bank.json")]);
    state.questions = await qRes.json();
    state.goals = await gRes.json();
  }

  /* ---------------- Login ---------------- */

  async function login() {
    const password = $("#admin-password").value;
    const statusEl = $("#login-status");

    if (!window.APP_CONFIG || !window.APP_CONFIG.ADMIN_WORKER_URL) {
      statusEl.textContent = "מערכת הניהול עוד לא חוברה (חסר ADMIN_WORKER_URL ב-config.js).";
      statusEl.className = "save-status is-error";
      return;
    }

    statusEl.textContent = "בודק...";
    statusEl.className = "save-status";

    try {
      const res = await fetch(workerUrl("/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        state.password = password;
        await loadData();
        renderCategories();
        renderGoalCategories();
        syncEditorToRaw();
        $("#admin-login").classList.add("hidden");
        $("#admin-editor").classList.remove("hidden");
      } else {
        statusEl.textContent = "סיסמה שגויה.";
        statusEl.className = "save-status is-error";
      }
    } catch (err) {
      statusEl.textContent = "שגיאת תקשורת - בדקו את כתובת ה-Worker.";
      statusEl.className = "save-status is-error";
    }
  }

  /* ---------------- Categories tab ---------------- */

  function newStatementId(categoryId) {
    return `${categoryId}-${Date.now().toString(36)}${Math.floor(Math.random() * 100)}`;
  }
  function newCategoryId() {
    return `cat-${Date.now().toString(36)}`;
  }
  function newGoalCategoryId() {
    return `goalcat-${Date.now().toString(36)}`;
  }

  function levelOptionsHtml(selected) {
    return state.questions.levels
      .map((lvl) => `<option value="${lvl}" ${lvl === selected ? "selected" : ""}>${lvl}</option>`)
      .join("");
  }

  function iconOptionsHtml(selected) {
    const icons = ["compass", "shield", "circles", "megaphone", "handshake", "target"];
    return icons.map((i) => `<option value="${i}" ${i === selected ? "selected" : ""}>${i}</option>`).join("");
  }

  function goalCategoryCheckboxesHtml(cat) {
    return state.goals.categories
      .map((gc) => {
        const checked = (cat.goalCategoryIds || []).includes(gc.id) ? "checked" : "";
        return `<label><input type="checkbox" data-role="goal-link" value="${gc.id}" ${checked}> ${gc.title}</label>`;
      })
      .join("");
  }

  function renderCategories() {
    const container = $("#categories-list");
    container.innerHTML = "";

    state.questions.categories.forEach((cat) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      card.innerHTML = `
        <div class="admin-card-head">
          <div class="field">
            <label>כותרת התחום <span class="admin-id-tag">${cat.id}</span></label>
            <input type="text" data-role="title" value="${escapeAttr(cat.title)}">
          </div>
          <button class="admin-remove-btn" data-role="remove-category" type="button">מחיקת תחום</button>
        </div>
        <div class="admin-row">
          <div class="field">
            <label>השאלה שמוצגת בראש השאלון</label>
            <input type="text" data-role="question" value="${escapeAttr(cat.question)}">
          </div>
          <div class="field">
            <label>צבע</label>
            <input type="color" data-role="color" value="${cat.color || "#189594"}">
          </div>
          <div class="field">
            <label>אייקון</label>
            <select data-role="icon">${iconOptionsHtml(cat.icon)}</select>
          </div>
        </div>
        <div class="field">
          <label>קטגוריות בבנק המטרות שקשורות לתחום זה</label>
          <div class="admin-checkbox-group" data-role="goal-links">${goalCategoryCheckboxesHtml(cat)}</div>
        </div>

        <div class="admin-statements" data-role="statements"></div>
        <button class="btn btn-ghost btn-sm" data-role="add-statement" type="button" style="margin-top:10px">+ הוספת היגד</button>
      `;

      // wire simple fields
      $('[data-role="title"]', card).addEventListener("input", (e) => (cat.title = e.target.value));
      $('[data-role="question"]', card).addEventListener("input", (e) => (cat.question = e.target.value));
      $('[data-role="color"]', card).addEventListener("input", (e) => (cat.color = e.target.value));
      $('[data-role="icon"]', card).addEventListener("change", (e) => (cat.icon = e.target.value));

      $$('[data-role="goal-link"]', card).forEach((cb) => {
        cb.addEventListener("change", () => {
          const ids = $$('[data-role="goal-link"]:checked', card).map((c) => c.value);
          cat.goalCategoryIds = ids;
        });
      });

      $('[data-role="remove-category"]', card).addEventListener("click", () => {
        if (!confirm(`למחוק את התחום "${cat.title}" לגמרי? כולל כל ההיגדים שבו.`)) return;
        state.questions.categories = state.questions.categories.filter((c) => c !== cat);
        renderCategories();
      });

      const statementsWrap = $('[data-role="statements"]', card);
      cat.statements.forEach((stmt) => statementsWrap.appendChild(buildStatementRow(cat, stmt)));

      $('[data-role="add-statement"]', card).addEventListener("click", () => {
        const stmt = { id: newStatementId(cat.id), level: state.questions.levels[0], text: "" };
        cat.statements.push(stmt);
        statementsWrap.appendChild(buildStatementRow(cat, stmt));
      });

      container.appendChild(card);
    });
  }

  function buildStatementRow(cat, stmt) {
    const row = document.createElement("div");
    row.className = "admin-statement-row";
    row.innerHTML = `
      <select data-role="level">${levelOptionsHtml(stmt.level)}</select>
      <textarea data-role="text">${escapeHtml(stmt.text)}</textarea>
      <button class="admin-remove-btn" type="button">מחיקה</button>
    `;
    $('[data-role="level"]', row).addEventListener("change", (e) => (stmt.level = e.target.value));
    $('[data-role="text"]', row).addEventListener("input", (e) => (stmt.text = e.target.value));
    $("button", row).addEventListener("click", () => {
      cat.statements = cat.statements.filter((s) => s !== stmt);
      row.remove();
    });
    return row;
  }

  /* ---------------- Goals tab ---------------- */

  function categoryOptionsHtml(selected) {
    return state.questions.categories
      .map((c) => `<option value="${c.id}" ${c.id === selected ? "selected" : ""}>${c.title}</option>`)
      .join("");
  }

  function renderGoalCategories() {
    const container = $("#goal-categories-list");
    container.innerHTML = "";

    state.goals.categories.forEach((gc) => {
      const card = document.createElement("div");
      card.className = "admin-card";
      const linkType = gc.linkedLevel ? "level" : gc.linkedCategoryId ? "category" : "none";
      card.innerHTML = `
        <div class="admin-card-head">
          <div class="field">
            <label>כותרת קטגוריית המטרות <span class="admin-id-tag">${gc.id}</span></label>
            <input type="text" data-role="title" value="${escapeAttr(gc.title)}">
          </div>
          <button class="admin-remove-btn" data-role="remove" type="button">מחיקת קטגוריה</button>
        </div>

        <div class="admin-link-choice">
          <label><input type="radio" name="link-${gc.id}" value="category" ${linkType === "category" ? "checked" : ""}> מקושר לתחום מיפוי</label>
          <label><input type="radio" name="link-${gc.id}" value="level" ${linkType === "level" ? "checked" : ""}> מקושר לדרג (חוצה-תחומים)</label>
          <label><input type="radio" name="link-${gc.id}" value="none" ${linkType === "none" ? "checked" : ""}> ללא קישור אוטומטי</label>
        </div>
        <div class="field" data-role="link-category-field" style="${linkType === "category" ? "" : "display:none"}">
          <select data-role="linkedCategoryId">${categoryOptionsHtml(gc.linkedCategoryId)}</select>
        </div>
        <div class="field" data-role="link-level-field" style="${linkType === "level" ? "" : "display:none"}">
          <select data-role="linkedLevel">${levelOptionsHtml(gc.linkedLevel)}</select>
        </div>

        <div class="admin-statements" data-role="goals"></div>
        <button class="btn btn-ghost btn-sm" data-role="add-goal" type="button" style="margin-top:10px">+ הוספת מטרה</button>
      `;

      $('[data-role="title"]', card).addEventListener("input", (e) => (gc.title = e.target.value));
      $('[data-role="remove"]', card).addEventListener("click", () => {
        if (!confirm(`למחוק את קטגוריית המטרות "${gc.title}" לגמרי?`)) return;
        state.goals.categories = state.goals.categories.filter((c) => c !== gc);
        renderGoalCategories();
      });

      const catField = $('[data-role="link-category-field"]', card);
      const levelField = $('[data-role="link-level-field"]', card);
      $$(`input[name="link-${gc.id}"]`, card).forEach((radio) => {
        radio.addEventListener("change", () => {
          if (radio.value === "category") {
            delete gc.linkedLevel;
            gc.linkedCategoryId = $('[data-role="linkedCategoryId"]', card).value;
            catField.style.display = "";
            levelField.style.display = "none";
          } else if (radio.value === "level") {
            delete gc.linkedCategoryId;
            gc.linkedLevel = $('[data-role="linkedLevel"]', card).value;
            catField.style.display = "none";
            levelField.style.display = "";
          } else {
            delete gc.linkedCategoryId;
            delete gc.linkedLevel;
            catField.style.display = "none";
            levelField.style.display = "none";
          }
        });
      });
      $('[data-role="linkedCategoryId"]', card).addEventListener("change", (e) => (gc.linkedCategoryId = e.target.value));
      $('[data-role="linkedLevel"]', card).addEventListener("change", (e) => (gc.linkedLevel = e.target.value));

      const goalsWrap = $('[data-role="goals"]', card);
      gc.goals.forEach((goalText, idx) => goalsWrap.appendChild(buildGoalRow(gc, idx)));

      $('[data-role="add-goal"]', card).addEventListener("click", () => {
        gc.goals.push("");
        goalsWrap.appendChild(buildGoalRow(gc, gc.goals.length - 1));
      });

      container.appendChild(card);
    });
  }

  function buildGoalRow(gc, idx) {
    const row = document.createElement("div");
    row.className = "admin-goal-item-row";
    row.innerHTML = `
      <textarea data-role="text">${escapeHtml(gc.goals[idx])}</textarea>
      <button class="admin-remove-btn" type="button">מחיקה</button>
    `;
    $('[data-role="text"]', row).addEventListener("input", (e) => {
      const currentIndex = Array.from(row.parentElement.children).indexOf(row);
      gc.goals[currentIndex] = e.target.value;
    });
    $("button", row).addEventListener("click", () => {
      const currentIndex = Array.from(row.parentElement.children).indexOf(row);
      gc.goals.splice(currentIndex, 1);
      row.remove();
    });
    return row;
  }

  /* ---------------- Raw JSON tab ---------------- */

  function syncEditorToRaw() {
    $("#raw-questions").value = JSON.stringify(state.questions, null, 2);
    $("#raw-goals").value = JSON.stringify(state.goals, null, 2);
  }

  function syncRawToEditor() {
    try {
      const q = JSON.parse($("#raw-questions").value);
      const g = JSON.parse($("#raw-goals").value);
      state.questions = q;
      state.goals = g;
      renderCategories();
      renderGoalCategories();
      alert("התוכן נטען למסכי העריכה.");
    } catch (err) {
      alert("שגיאה בפענוח ה-JSON: " + err.message);
    }
  }

  /* ---------------- Publish ---------------- */

  async function publish() {
    const statusEl = $("#publish-status");
    statusEl.textContent = "מפרסם...";
    statusEl.className = "save-status";

    try {
      const res = await fetch(workerUrl("/publish"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: state.password,
          questions: state.questions,
          goals: state.goals,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        statusEl.textContent = "✓ פורסם! האתר יתעדכן תוך דקה-שתיים.";
        statusEl.className = "save-status";
        syncEditorToRaw();
      } else {
        statusEl.textContent = "שגיאה: " + (data.error || "לא ידוע");
        statusEl.className = "save-status is-error";
      }
    } catch (err) {
      statusEl.textContent = "שגיאת תקשורת בפרסום.";
      statusEl.className = "save-status is-error";
    }
  }

  /* ---------------- Tabs ---------------- */

  function wireTabs() {
    $$(".admin-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $$(".admin-tab").forEach((t) => t.classList.remove("is-active"));
        $$(".admin-tab-panel").forEach((p) => p.classList.add("hidden"));
        tab.classList.add("is-active");
        $(`#tab-${tab.dataset.tab}`).classList.remove("hidden");
      });
    });
  }

  /* ---------------- Utils ---------------- */

  function escapeAttr(str) {
    return String(str ?? "").replace(/"/g, "&quot;");
  }
  function escapeHtml(str) {
    return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function init() {
    if (!window.APP_CONFIG || !window.APP_CONFIG.ADMIN_WORKER_URL) {
      $("#worker-missing-note").textContent =
        "טרם חובר Cloudflare Worker (ADMIN_WORKER_URL חסר ב-config.js) - הכניסה לא תעבוד עד שיחובר.";
    }
    $("#btn-login").addEventListener("click", login);
    $("#admin-password").addEventListener("keydown", (e) => {
      if (e.key === "Enter") login();
    });
    wireTabs();
    $("#btn-add-category").addEventListener("click", () => {
      state.questions.categories.push({
        id: newCategoryId(),
        title: "תחום חדש",
        question: "",
        color: "#189594",
        icon: "target",
        goalCategoryIds: [],
        statements: [],
      });
      renderCategories();
    });
    $("#btn-add-goal-category").addEventListener("click", () => {
      state.goals.categories.push({
        id: newGoalCategoryId(),
        title: "קטגוריית מטרות חדשה",
        goals: [],
      });
      renderGoalCategories();
    });
    $("#btn-publish").addEventListener("click", publish);
    $("#btn-raw-to-editor").addEventListener("click", syncRawToEditor);
    $("#btn-editor-to-raw").addEventListener("click", syncEditorToRaw);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
