(() => {
  "use strict";

  const ICONS = {
    compass: '<circle cx="12" cy="12" r="8"/><path d="M14.7 9.3l-1.9 4.7-4.7 1.9 1.9-4.7z" fill="currentColor" stroke="none"/>',
    shield: '<path d="M12 3.5l6.5 2.6v4.4c0 4.6-3.1 7.6-6.5 8.6-3.4-1-6.5-4-6.5-8.6V6.1z"/>',
    circles:
      '<circle cx="8.3" cy="9.8" r="3"/><circle cx="15.7" cy="9.8" r="3"/><path d="M4.6 17.5c.6-2.4 2.1-3.7 3.7-3.7s3.1 1.3 3.7 3.7M12.4 17.5c.6-2.4 2.1-3.7 3.7-3.7s3.1 1.3 3.7 3.7"/>',
    megaphone: '<path d="M3 10.3v3.4h2.7l7.3 3.4V6.9L5.7 10.3z"/><path d="M16.3 9a3.3 3.3 0 010 6"/>',
    handshake:
      '<path d="M12 19s-6.5-4.1-6.5-9a3.7 3.7 0 016.5-2.4A3.7 3.7 0 0118.5 10c0 4.9-6.5 9-6.5 9z"/>',
    target: '<circle cx="12" cy="12" r="7.3"/><circle cx="12" cy="12" r="3.8"/><circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none"/>',
  };

  const LEVEL_COLOR_VAR = {
    "קהילה": "var(--level-community)",
    "הנהגה": "var(--level-leadership)",
    "מערכת": "var(--level-system)",
    "צוות": "var(--level-staff)",
    "ילדים ונוער": "var(--level-youth)",
  };

  // Gendered UI strings - purely cosmetic phrasing, applied once the person picks מ/נ.
  // Falls back to the neutral text already in the HTML when no gender is chosen.
  const GENDER_TEXT = {
    "btn-start-label": { m: "בוא נתחיל", f: "בואי נתחיל" },
    "cat-h1-text": { m: "באילו תחומים תרצה למפות?", f: "באילו תחומים תרצי למפות?" },
    "cat-lede-sub": {
      m: "אנחנו ממליצים לענות על כל התחומים כדי לקבל תמונה מלאה, אבל אם יש תחום שמרגיש לך פחות מתאים או פחות רלוונטי כרגע - לגמרי בסדר לדלג עליו.",
      f: "אנחנו ממליצים לענות על כל התחומים כדי לקבל תמונה מלאה, אבל אם יש תחום שמרגיש לך פחות מתאים או פחות רלוונטי כרגע - לגמרי בסדר לדלג עליו.",
    },
    "goals-lede-sub": {
      m: "בהתבסס על המיפוי, אלו הצעות למטרות אפשריות בתחומים שבהם יש מקום לחיזוק. סמן את המטרות שברצונך לקדם בתוכנית העבודה - אפשר גם לעיין בכל בנק המטרות המלא למטה.",
      f: "בהתבסס על המיפוי, אלו הצעות למטרות אפשריות בתחומים שבהם יש מקום לחיזוק. סמני את המטרות שברצונך לקדם בתוכנית העבודה - אפשר גם לעיין בכל בנק המטרות המלא למטה.",
    },
    "thanks-lede": {
      m: "המיפוי והמטרות שבחרת נשמרו בהצלחה. צוות המכלול ישמח לעבור אתך על התוצאות ולבנות יחד תוכנית עבודה.",
      f: "המיפוי והמטרות שבחרת נשמרו בהצלחה. צוות המכלול ישמח לעבור אתך על התוצאות ולבנות יחד תוכנית עבודה.",
    },
  };

  const state = {
    questionsData: null,
    goalsData: null,
    selectedCategoryIds: [],
    currentIndex: 0,
    answers: {}, // statementId -> 1..4
    meta: { gender: "", settlementType: "יישוב", settlement: "", subSettlement: "", respondent: "", role: "" },
    results: null,
    submissionId: null,
    createdAt: null,
    selectedGoals: new Set(), // "categoryId::goalIndex"
    autosaveTimer: null,
    autosaveFadeTimer: null,
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function showScreen(id) {
    $$(".screen").forEach((s) => s.classList.add("hidden"));
    $(`#${id}`).classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  function scrollToTop() {
    window.scrollTo(0, 0);
  }

  async function loadData() {
    const [qRes, gRes] = await Promise.all([
      fetch("data/questions.json"),
      fetch("data/goals-bank.json"),
    ]);
    state.questionsData = await qRes.json();
    state.goalsData = await gRes.json();
    // Start with nothing selected - the person chooses which domains matter to them.
    state.selectedCategoryIds = [];
  }

  function categoryById(id) {
    return state.questionsData.categories.find((c) => c.id === id);
  }

  const NEUTRAL_TEXT = {};

  function captureNeutralTexts() {
    Object.keys(GENDER_TEXT).forEach((id) => {
      const el = document.getElementById(id);
      if (el) NEUTRAL_TEXT[id] = el.textContent;
    });
  }

  function applyGenderTexts() {
    const gender = state.meta.gender;
    Object.entries(GENDER_TEXT).forEach(([id, variants]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = gender === "m" || gender === "f" ? variants[gender] : NEUTRAL_TEXT[id];
    });
  }

  /* ---------------- Autosave ---------------- */

  function setAutosaveIndicator(text, mode) {
    const el = $("#autosave-indicator");
    el.textContent = text;
    el.classList.toggle("is-saving", mode === "saving");
    el.classList.add("is-visible");
    clearTimeout(state.autosaveFadeTimer);
    if (mode !== "saving") {
      state.autosaveFadeTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
    }
  }

  function ensureSubmission() {
    if (!state.submissionId) {
      state.submissionId = crypto.randomUUID();
      state.createdAt = new Date().toISOString();
    }
    return state.submissionId;
  }

  function collectSelectedGoalsPayload() {
    return $$('.goal-item input[type="checkbox"]:checked').map((cb) => ({
      category: cb.dataset.cat,
      text: cb.dataset.text,
    }));
  }

  function scheduleAutosave() {
    const configured = window.APP_CONFIG && window.APP_CONFIG.SHEETS_WEBHOOK_URL;
    if (!configured) return; // nothing to save to - the site owner hasn't wired up the Sheets backup yet
    setAutosaveIndicator("שומר...", "saving");
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(runAutosave, 600);
  }

  async function runAutosave() {
    ensureSubmission();
    if (state.selectedCategoryIds.length) computeResults();

    const record = {
      id: state.submissionId,
      createdAt: state.createdAt,
      updatedAt: new Date().toISOString(),
      secret: window.APP_CONFIG.SHARED_SECRET,
      meta: state.meta,
      selectedCategories: state.selectedCategoryIds.map((id) => categoryById(id).title),
      results: state.results,
      selectedGoals: $(".goal-item") ? collectSelectedGoalsPayload() : [],
    };

    try {
      // Sent straight from the browser to the Google Apps Script Web App - no server of our own.
      // "no-cors" means we can't read the response, so this is a best-effort, fire-and-forget save.
      await fetch(window.APP_CONFIG.SHEETS_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(record),
      });
      setAutosaveIndicator("✓ נשמר", "saved");
    } catch (err) {
      setAutosaveIndicator("שמירה נכשלה - בודק חיבור...", "error");
    }
  }

  /* ---------------- Intro / meta ---------------- */

  function wireMetaForm() {
    const btnGenderM = $("#gender-btn-m");
    const btnGenderF = $("#gender-btn-f");

    function setGender(gender) {
      state.meta.gender = gender;
      btnGenderM.classList.toggle("is-active", gender === "m");
      btnGenderM.setAttribute("aria-pressed", String(gender === "m"));
      btnGenderF.classList.toggle("is-active", gender === "f");
      btnGenderF.setAttribute("aria-pressed", String(gender === "f"));
      applyGenderTexts();
      scheduleAutosave();
    }

    btnGenderM.addEventListener("click", () => setGender(state.meta.gender === "m" ? "" : "m"));
    btnGenderF.addEventListener("click", () => setGender(state.meta.gender === "f" ? "" : "f"));

    const btnSettlement = $("#type-btn-settlement");
    const btnCouncil = $("#type-btn-council");
    const labelEl = $("#f-settlement-label");
    const subField = $("#field-sub-settlement");
    const settlementInput = $("#f-settlement");

    function setType(type) {
      state.meta.settlementType = type;
      const isCouncil = type === "מועצה אזורית";
      btnSettlement.classList.toggle("is-active", !isCouncil);
      btnSettlement.setAttribute("aria-pressed", String(!isCouncil));
      btnCouncil.classList.toggle("is-active", isCouncil);
      btnCouncil.setAttribute("aria-pressed", String(isCouncil));
      labelEl.textContent = isCouncil ? "שם המועצה האזורית" : "שם היישוב";
      settlementInput.placeholder = isCouncil ? "לדוגמה: מועצה אזורית באר טוביה" : "";
      subField.classList.toggle("hidden", !isCouncil);
      scheduleAutosave();
    }

    btnSettlement.addEventListener("click", () => setType("יישוב"));
    btnCouncil.addEventListener("click", () => setType("מועצה אזורית"));

    ["f-settlement", "f-sub-settlement", "f-respondent", "f-role"].forEach((id) => {
      $(`#${id}`).addEventListener("input", () => {
        state.meta.settlement = $("#f-settlement").value.trim();
        state.meta.subSettlement = $("#f-sub-settlement").value.trim();
        state.meta.respondent = $("#f-respondent").value.trim();
        state.meta.role = $("#f-role").value.trim();
        scheduleAutosave();
      });
    });
  }

  /* ---------------- Category picker ---------------- */

  function renderCategoryList() {
    const container = $("#category-list");
    container.innerHTML = "";
    state.questionsData.categories.forEach((cat) => {
      const tile = document.createElement("label");
      tile.className = "category-tile";
      tile.style.setProperty("--tile-color", cat.color || "var(--teal-3)");
      tile.innerHTML = `
        <input type="checkbox" value="${cat.id}" ${state.selectedCategoryIds.includes(cat.id) ? "checked" : ""}>
        <span class="tile-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[cat.icon] || ""}</svg></span>
        <span class="tile-title">${cat.title}</span>
        <span class="tile-check"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg></span>
      `;
      const input = $("input", tile);
      input.addEventListener("change", () => {
        if (input.checked) {
          if (!state.selectedCategoryIds.includes(cat.id)) state.selectedCategoryIds.push(cat.id);
        } else {
          state.selectedCategoryIds = state.selectedCategoryIds.filter((id) => id !== cat.id);
        }
        scheduleAutosave();
      });
      container.appendChild(tile);
    });
  }

  /* ---------------- Questionnaire ---------------- */

  function renderCategory() {
    const catId = state.selectedCategoryIds[state.currentIndex];
    const cat = categoryById(catId);

    $("#q-cat-banner").style.setProperty("--cat-color", cat.color || "var(--navy)");
    document.body.style.setProperty("--current-cat-color", cat.color || "var(--teal-3)");
    $("#q-cat-eyebrow").textContent = `תחום ${state.currentIndex + 1} מתוך ${state.selectedCategoryIds.length}`;
    $("#q-cat-title").textContent = cat.title;
    $("#q-cat-question").textContent = cat.question;

    const list = $("#statement-list");
    list.innerHTML = "";
    cat.statements.forEach((stmt, idx) => {
      const li = document.createElement("li");
      li.className = "statement-item";
      li.style.setProperty("--level-color", LEVEL_COLOR_VAR[stmt.level] || "var(--teal-3)");
      const labelId = `label-${stmt.id}`;
      li.innerHTML = `
        <div class="statement-head">
          <p class="statement-text" id="${labelId}">${idx + 1}. ${stmt.text}</p>
          <span class="level-badge" data-level="${stmt.level}">${stmt.level}</span>
        </div>
        <div class="scale-options" role="radiogroup" aria-labelledby="${labelId}">
          ${state.questionsData.scale
            .map(
              (s) => `
            <span class="scale-option">
              <input type="radio" name="ans_${stmt.id}" id="opt_${stmt.id}_${s.value}" value="${s.value}"
                ${state.answers[stmt.id] === s.value ? "checked" : ""}>
              <label for="opt_${stmt.id}_${s.value}"><span class="num">${s.value}</span>${s.label}</label>
            </span>
          `
            )
            .join("")}
        </div>
      `;
      $$('input[type="radio"]', li).forEach((input) => {
        // Allow clicking an already-selected option again to clear the answer -
        // native radios can't be unchecked by clicking, so we track pre-click state ourselves.
        const snapshot = () => { input._wasChecked = input.checked; };
        input.addEventListener("mousedown", snapshot);
        input.addEventListener("touchstart", snapshot);
        input.addEventListener("keydown", (e) => {
          if (e.key === " " || e.code === "Space" || e.key === "Enter") snapshot();
        });
        input.addEventListener("click", () => {
          if (input._wasChecked) {
            input.checked = false;
            delete state.answers[stmt.id];
            scheduleAutosave();
          }
        });
        input.addEventListener("change", () => {
          if (input.checked) {
            state.answers[stmt.id] = Number(input.value);
            scheduleAutosave();
          }
        });
      });
      list.appendChild(li);
    });

    updateProgress();
    updateQuestionnaireNav();
    scrollToTop();
  }

  function updateProgress() {
    const total = state.selectedCategoryIds.length;
    const pct = Math.round(((state.currentIndex + 1) / total) * 100);
    $("#progress-fill").style.width = `${pct}%`;
    $("#progress-marker").style.right = `${pct}%`;

    const remaining = total - (state.currentIndex + 1);
    let message;
    if (remaining === 0) {
      message = "🎉 זה התחום האחרון - בסיום תקבלו דוח מפורט!";
    } else if (remaining === 1) {
      message = "עוד קצת! נשאר עוד תחום אחד אחרי זה.";
    } else {
      message = `עוד קצת! נשארו עוד ${remaining} תחומים - ובסיום תקבלו דוח מפורט.`;
    }
    $("#progress-label").textContent = message;
  }

  function updateQuestionnaireNav() {
    $("#btn-prev-cat").disabled = state.currentIndex === 0;
    const isLast = state.currentIndex === state.selectedCategoryIds.length - 1;
    $("#btn-next-cat").textContent = isLast ? "סיום - לצפייה במיפוי" : "התחום הבא";
  }

  function currentCategoryUnanswered() {
    const cat = categoryById(state.selectedCategoryIds[state.currentIndex]);
    return cat.statements.filter((s) => !state.answers[s.id]).length;
  }

  function goPrev() {
    if (state.currentIndex === 0) return;
    state.currentIndex -= 1;
    renderCategory();
  }

  function goNext() {
    const unanswered = currentCategoryUnanswered();
    if (unanswered > 0) {
      const ok = confirm(
        `נשארו ${unanswered} היגדים ללא מענה בתחום הזה. אפשר להמשיך גם ככה ולדלג עליהם - להמשיך?`
      );
      if (!ok) return;
    }
    const isLast = state.currentIndex === state.selectedCategoryIds.length - 1;
    if (isLast) {
      computeResults();
      renderResults();
      showScreen("screen-results");
    } else {
      state.currentIndex += 1;
      renderCategory();
    }
  }

  /* ---------------- Results ---------------- */

  function scoreColor(avg) {
    if (avg < 1.5) return "var(--score-1)";
    if (avg < 2.5) return "var(--score-2)";
    if (avg < 3.5) return "var(--score-3)";
    return "var(--score-4)";
  }

  function scoreLabel(avg) {
    const rounded = Math.min(4, Math.max(1, Math.round(avg)));
    return state.questionsData.scale.find((s) => s.value === rounded)?.label ?? "";
  }

  function computeResults() {
    const categoryScores = [];
    const levelTotals = {};
    state.questionsData.levels.forEach((lvl) => (levelTotals[lvl] = { sum: 0, count: 0 }));

    let overallSum = 0;
    let overallCount = 0;

    state.selectedCategoryIds.forEach((catId) => {
      const cat = categoryById(catId);
      let sum = 0;
      let count = 0;
      cat.statements.forEach((stmt) => {
        const val = state.answers[stmt.id];
        if (val) {
          sum += val;
          count += 1;
          levelTotals[stmt.level].sum += val;
          levelTotals[stmt.level].count += 1;
          overallSum += val;
          overallCount += 1;
        }
      });
      categoryScores.push({
        id: cat.id,
        title: cat.title,
        average: count ? sum / count : null,
        answered: count,
        total: cat.statements.length,
      });
    });

    const levelScores = state.questionsData.levels
      .map((lvl) => ({
        level: lvl,
        average: levelTotals[lvl].count ? levelTotals[lvl].sum / levelTotals[lvl].count : null,
        answered: levelTotals[lvl].count,
      }))
      .filter((l) => l.answered > 0);

    state.results = {
      categoryScores,
      levelScores,
      overallAverage: overallCount ? overallSum / overallCount : null,
    };
  }

  function renderBars(containerId, rows, nameKey) {
    const container = $(`#${containerId}`);
    container.innerHTML = "";
    rows.forEach((row) => {
      const avg = row.average;
      const pct = avg ? ((avg - 1) / 3) * 100 : 0;
      const div = document.createElement("div");
      div.className = "bar-row";
      div.innerHTML = `
        <div class="bar-name">${row[nameKey]}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${avg ? scoreColor(avg) : "#ccc"}"></div></div>
        <div class="bar-value">${avg ? `<strong>${avg.toFixed(1)}</strong> · ${scoreLabel(avg)}` : "אין נתונים"}</div>
      `;
      container.appendChild(div);
    });
  }

  function renderResults() {
    const overall = state.results.overallAverage;
    $("#res-subtitle").innerHTML = overall
      ? `ציון ממוצע כולל: <span class="res-subtitle-strong">${overall.toFixed(1)} מתוך 4</span> (${scoreLabel(overall)})`
      : "";

    renderBars("chart-categories", state.results.categoryScores, "title");
    renderBars("chart-levels", state.results.levelScores, "level");
    scrollToTop();
  }

  /* ---------------- Goals bank ---------------- */

  function goalCheckboxId(catId, idx) {
    return `goal_${catId}_${idx}`;
  }

  function buildGoalGroupHtml(cat, hint) {
    const goalsHtml = cat.goals
      .map((goalText, idx) => {
        const cbId = goalCheckboxId(cat.id, idx);
        const key = `${cat.id}::${idx}`;
        return `
          <div class="goal-item">
            <input type="checkbox" id="${cbId}" data-key="${key}" data-cat="${cat.title}" data-text="${goalText.replace(/"/g, "&quot;")}">
            <label for="${cbId}">${goalText}</label>
          </div>
        `;
      })
      .join("");
    return `
      <div class="goal-group">
        <h3>${cat.title}</h3>
        ${hint ? `<p class="goal-hint">${hint}</p>` : ""}
        ${goalsHtml}
      </div>
    `;
  }

  function suggestedGoalCategoryIds() {
    const suggested = new Set();
    const THRESHOLD = 3; // below "מבוסס" -> worth suggesting goals

    (state.results.categoryScores || []).forEach((cs) => {
      if (cs.average !== null && cs.average < THRESHOLD) {
        const cat = categoryById(cs.id);
        (cat.goalCategoryIds || []).forEach((gid) => suggested.add(gid));
      }
    });

    (state.results.levelScores || []).forEach((ls) => {
      if (ls.average !== null && ls.average < THRESHOLD) {
        const crossCat = state.goalsData.categories.find((g) => g.linkedLevel === ls.level);
        if (crossCat) suggested.add(crossCat.id);
      }
    });

    if (suggested.size === 0 && state.results.categoryScores.length) {
      const weakest = [...state.results.categoryScores]
        .filter((c) => c.average !== null)
        .sort((a, b) => a.average - b.average)[0];
      if (weakest) {
        const cat = categoryById(weakest.id);
        (cat.goalCategoryIds || []).forEach((gid) => suggested.add(gid));
      }
    }
    return suggested;
  }

  function renderGoalsScreen() {
    const suggestedIds = suggestedGoalCategoryIds();

    const suggestedContainer = $("#goals-suggested");
    const allContainer = $("#goals-all");
    suggestedContainer.innerHTML = "";
    allContainer.innerHTML = "";

    if (suggestedIds.size === 0) {
      suggestedContainer.innerHTML = `<p class="section-note">כל הכבוד - לא נמצאו תחומים חלשים במיוחד. אפשר לבחור מטרות מכל בנק המטרות למטה.</p>`;
    }

    state.goalsData.categories.forEach((cat) => {
      const isSuggested = suggestedIds.has(cat.id);
      const hint = isSuggested ? "תחום שעלה כמקום לחיזוק במיפוי." : "";
      const html = buildGoalGroupHtml(cat, hint);
      if (isSuggested) {
        suggestedContainer.insertAdjacentHTML("beforeend", html);
      } else {
        allContainer.insertAdjacentHTML("beforeend", html);
      }
    });

    $$('.goal-item input[type="checkbox"]').forEach((cb) => {
      cb.checked = state.selectedGoals.has(cb.dataset.key);
      cb.addEventListener("change", () => {
        if (cb.checked) state.selectedGoals.add(cb.dataset.key);
        else state.selectedGoals.delete(cb.dataset.key);
        scheduleAutosave();
      });
    });

    scrollToTop();
  }

  /* ---------------- PDF dashboard report ---------------- */

  function settlementLabelForReport() {
    const name = state.meta.settlement || "";
    const typeLabel = state.meta.settlementType === "מועצה אזורית" ? "מועצה אזורית" : "יישוב";
    const sub = state.meta.subSettlement ? ` · ${state.meta.subSettlement}` : "";
    return `${typeLabel}: ${name}${sub}`;
  }

  function buildPrBarsHtml(rows, nameKey, colorFor) {
    if (!rows || !rows.length) return `<p class="pr-empty">אין נתונים.</p>`;
    return `<div class="pr-bars">${rows
      .map((row) => {
        const avg = row.average;
        const pct = avg ? ((avg - 1) / 3) * 100 : 0;
        const color = avg ? colorFor(row) : "#ccc";
        return `
          <div class="pr-bar-row">
            <div>${row[nameKey]}</div>
            <div class="pr-bar-track"><div class="pr-bar-fill" style="width:${pct}%; background:${color}"></div></div>
            <div class="pr-bar-value">${avg ? `${avg.toFixed(1)} · ${scoreLabel(avg)}` : "—"}</div>
          </div>
        `;
      })
      .join("")}</div>`;
  }

  function buildPrintReport(includeGoals) {
    if (state.selectedCategoryIds.length) computeResults();
    const overall = state.results?.overallAverage;

    const categoriesHtml = buildPrBarsHtml(state.results?.categoryScores || [], "title", (row) =>
      scoreColor(row.average)
    );
    const levelsHtml = buildPrBarsHtml(state.results?.levelScores || [], "level", (row) =>
      LEVEL_COLOR_VAR[row.level] || "var(--teal-3)"
    );

    let goalsHtml = "";
    if (includeGoals) {
      const selected = collectSelectedGoalsPayload();
      if (!selected.length) {
        goalsHtml = `<h3 class="pr-section-title">מטרות נבחרות לתוכנית העבודה</h3><p class="pr-empty">לא נבחרו מטרות.</p>`;
      } else {
        const grouped = {};
        selected.forEach((g) => {
          grouped[g.category] = grouped[g.category] || [];
          grouped[g.category].push(g.text);
        });
        goalsHtml =
          `<h3 class="pr-section-title">מטרות נבחרות לתוכנית העבודה</h3>` +
          Object.entries(grouped)
            .map(
              ([cat, texts]) => `
              <div class="pr-goal-group">
                <h4>${cat}</h4>
                ${texts.map((t) => `<div class="pr-goal-item">${t}</div>`).join("")}
              </div>
            `
            )
            .join("");
      }
    }

    const dateStr = new Date().toLocaleDateString("he-IL", { year: "numeric", month: "long", day: "numeric" });

    $("#print-report").innerHTML = `
      <div class="pr-header">
        <div class="pr-header-text">
          <p class="pr-title">דוח מיפוי יישובי-מועצתי</p>
          <p class="pr-subtitle">${settlementLabelForReport()} · ${dateStr}</p>
        </div>
        <img class="pr-logo" src="assets/logo/hamichlol-logo-long.png" alt="המכלול">
      </div>

      <div class="pr-hero">
        <div class="pr-hero-score">${overall ? overall.toFixed(1) : "—"}</div>
        <div class="pr-hero-text">
          <strong>ציון ממוצע כולל מתוך 4${overall ? ` (${scoreLabel(overall)})` : ""}</strong>
          מבוסס על ${state.selectedCategoryIds.length} תחומים שמולאו
        </div>
      </div>

      <h3 class="pr-section-title">לפי תחום</h3>
      ${categoriesHtml}

      <h3 class="pr-section-title">לפי דרג התייחסות</h3>
      ${levelsHtml}

      ${goalsHtml}

      <div class="pr-footer">
        המכלול | בית לתהליכים · hamichlolhome.com · הופק ב-${dateStr}
      </div>
    `;
  }

  /* ---------------- Reset ---------------- */

  function restart() {
    state.selectedCategoryIds = [];
    state.currentIndex = 0;
    state.answers = {};
    state.results = null;
    state.submissionId = null;
    state.createdAt = null;
    state.selectedGoals = new Set();
    state.meta = { gender: "", settlementType: "יישוב", settlement: "", subSettlement: "", respondent: "", role: "" };
    $("#meta-form").reset();
    $("#gender-btn-m").classList.remove("is-active");
    $("#gender-btn-f").classList.remove("is-active");
    applyGenderTexts();
    $("#type-btn-settlement").click();
    document.body.style.removeProperty("--current-cat-color");
    renderCategoryList();
    showScreen("screen-intro");
  }

  /* ---------------- Wire up ---------------- */

  function wireEvents() {
    wireMetaForm();

    $("#btn-start").addEventListener("click", () => {
      state.meta.settlement = $("#f-settlement").value.trim();
      if (!state.meta.settlement) {
        $("#f-settlement").focus();
        $("#f-settlement").reportValidity?.();
        return;
      }
      scheduleAutosave();
      showScreen("screen-categories");
    });

    $("#btn-select-all").addEventListener("click", () => {
      state.selectedCategoryIds = state.questionsData.categories.map((c) => c.id);
      renderCategoryList();
      scheduleAutosave();
    });
    $("#btn-select-none").addEventListener("click", () => {
      state.selectedCategoryIds = [];
      renderCategoryList();
      scheduleAutosave();
    });

    $("#btn-back-to-intro").addEventListener("click", () => showScreen("screen-intro"));

    $("#btn-to-questionnaire").addEventListener("click", () => {
      if (state.selectedCategoryIds.length === 0) {
        alert("יש לבחור לפחות תחום אחד למיפוי.");
        return;
      }
      const order = state.questionsData.categories.map((c) => c.id);
      state.selectedCategoryIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      state.currentIndex = 0;
      renderCategory();
      showScreen("screen-questionnaire");
    });

    $("#btn-prev-cat").addEventListener("click", goPrev);
    $("#btn-next-cat").addEventListener("click", goNext);

    $("#btn-print").addEventListener("click", () => {
      buildPrintReport(false);
      window.print();
    });
    $("#btn-to-goals").addEventListener("click", () => {
      renderGoalsScreen();
      showScreen("screen-goals");
    });

    $("#btn-finish").addEventListener("click", () => {
      scheduleAutosave();
      applyGenderTexts();
      showScreen("screen-thanks");
    });
    $("#btn-download-report").addEventListener("click", () => {
      buildPrintReport(true);
      window.print();
    });
    $("#btn-restart").addEventListener("click", restart);
  }

  async function init() {
    await loadData();
    captureNeutralTexts();
    renderCategoryList();
    wireEvents();
    showScreen("screen-intro");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
