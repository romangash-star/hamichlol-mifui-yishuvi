const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3300;

const DATA_DIR = path.join(__dirname, "data");
const SUBMISSIONS_DIR = path.join(DATA_DIR, "submissions");
const CSV_PATH = path.join(DATA_DIR, "submissions.csv");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");

for (const dir of [DATA_DIR, SUBMISSIONS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

const config = loadConfig();
const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL || config.googleSheetsWebhookUrl || "";

// Backs up each submission to a Google Sheet (via an Apps Script Web App) in addition to the
// local JSON/CSV files, which stay the source of truth. Best-effort and throttled per submission
// so rapid autosaves while someone is filling the form don't spam the Sheets quota.
const lastForwarded = new Map();
const FORWARD_MIN_INTERVAL_MS = 4000;

function forwardToGoogleSheets(record) {
  if (!SHEETS_WEBHOOK_URL) return;
  const last = lastForwarded.get(record.id) || 0;
  if (Date.now() - last < FORWARD_MIN_INTERVAL_MS) return;
  lastForwarded.set(record.id, Date.now());

  fetch(SHEETS_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  }).catch((err) => {
    console.warn("Google Sheets backup failed:", err.message);
  });
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function readAllRecords() {
  const files = fs.readdirSync(SUBMISSIONS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => JSON.parse(fs.readFileSync(path.join(SUBMISSIONS_DIR, f), "utf8")))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// Rebuilds the whole CSV summary from the JSON records - simple and safe at this scale,
// since a submission's fields can change repeatedly while someone fills the form (autosave).
function regenerateCsv() {
  const header = "id,createdAt,updatedAt,settlementType,settlement,subSettlement,role,respondent,categories,overallAverage,goalsCount\n";
  const rows = readAllRecords().map((r) =>
    [
      r.id,
      r.createdAt,
      r.updatedAt || "",
      r.meta?.settlementType || "",
      r.meta?.settlement || "",
      r.meta?.subSettlement || "",
      r.meta?.role || "",
      r.meta?.respondent || "",
      (r.selectedCategories || []).join(" | "),
      r.results?.overallAverage ?? "",
      (r.selectedGoals || []).length,
    ]
      .map(csvEscape)
      .join(",")
  );
  fs.writeFileSync(CSV_PATH, "﻿" + header + rows.join("\n") + (rows.length ? "\n" : ""), "utf8");
}

function submissionPath(id) {
  return path.join(SUBMISSIONS_DIR, `${id}.json`);
}

function sanitizeMeta(meta = {}) {
  return {
    gender: meta.gender || "",
    settlementType: meta.settlementType || "יישוב",
    settlement: meta.settlement || "",
    subSettlement: meta.subSettlement || "",
    role: meta.role || "",
    respondent: meta.respondent || "",
  };
}

// Create a new submission - called as soon as someone starts (even before answering anything),
// so their progress is captured from the first moment and can be updated via PATCH from then on.
app.post("/api/submissions", (req, res) => {
  const body = req.body || {};
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    createdAt: now,
    updatedAt: now,
    meta: sanitizeMeta(body.meta),
    selectedCategories: Array.isArray(body.selectedCategories) ? body.selectedCategories : [],
    answers: body.answers && typeof body.answers === "object" ? body.answers : {},
    results: body.results || null,
    selectedGoals: Array.isArray(body.selectedGoals) ? body.selectedGoals : [],
  };

  fs.writeFileSync(submissionPath(id), JSON.stringify(record, null, 2), "utf8");
  regenerateCsv();
  forwardToGoogleSheets(record);

  res.json({ id, createdAt: now });
});

// Continuous autosave - merges whichever fields are provided into the existing record.
app.patch("/api/submissions/:id", (req, res) => {
  const { id } = req.params;
  const filePath = submissionPath(id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "submission not found" });
  }

  const record = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const body = req.body || {};

  if (body.meta) record.meta = sanitizeMeta({ ...record.meta, ...body.meta });
  if (Array.isArray(body.selectedCategories)) record.selectedCategories = body.selectedCategories;
  if (body.answers && typeof body.answers === "object") record.answers = body.answers;
  if (body.results !== undefined) record.results = body.results;
  if (Array.isArray(body.selectedGoals)) record.selectedGoals = body.selectedGoals;

  record.updatedAt = new Date().toISOString();

  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), "utf8");
  regenerateCsv();
  forwardToGoogleSheets(record);

  res.json({ ok: true, updatedAt: record.updatedAt });
});

// Fetch a single submission
app.get("/api/submissions/:id", (req, res) => {
  const filePath = submissionPath(req.params.id);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "submission not found" });
  }
  res.json(JSON.parse(fs.readFileSync(filePath, "utf8")));
});

// Simple read-only listing for the internal team (not linked from the main nav)
app.get("/api/submissions", (req, res) => {
  res.json(readAllRecords().reverse());
});

app.listen(PORT, () => {
  console.log(`המכלול · מיפוי יישובי — שרת פועל: http://localhost:${PORT}`);
  console.log(
    SHEETS_WEBHOOK_URL
      ? "גיבוי ל-Google Sheets: מחובר"
      : "גיבוי ל-Google Sheets: לא מוגדר (server/data/config.json)"
  );
});
