// Shared by the tray window (index.html) and the GitFolio window (manage.html).

const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

const langOf = (v) => (/^ko/i.test(v ?? "") ? "ko" : /^ja/i.test(v ?? "") ? "ja" : "en");

// The screen's language: Korean, Japanese or English, as the device is set. The one gitfolio works out
// (ready) wins, so the app's words and gitfolio's match; until then, or with a gitfolio that does not
// say, the web view's.
let LANG = langOf(navigator.language);

async function ready() {
  try {
    const { lang } = await gitfolio("version");
    if (lang) LANG = langOf(lang);
  } catch {} // an old gitfolio installed on its own: the web view's language stands
  document.documentElement.lang = LANG;
}

// The app's words in the screen's language (i18n.js), {name} filled in from `vars`.
function t(words, vars = {}) {
  return (MESSAGES[LANG]?.[words] ?? words).replace(/\{(\w+)\}/g, (_, k) => vars[k]);
}

// An element with a class and children, text or elements: text never goes in as HTML.
function el(tag, cls, ...kids) {
  const e = document.createElement(tag);
  e.className = cls;
  e.append(...kids);
  return e;
}

function input(type, placeholder = "", value = "") {
  const e = el("input", "");
  Object.assign(e, { type, placeholder, value });
  return e;
}

function checkbox(checked = false) {
  return Object.assign(input("checkbox"), { checked });
}

function label(box, ...text) {
  return el("label", "", box, el("span", "", ...text));
}

// A button running `f`, disabled until it is done.
function button(text, f) {
  const b = el("button", "", text);
  b.onclick = async () => {
    b.disabled = true;
    try {
      await f();
    } finally {
      b.disabled = false;
    }
  };
  return b;
}

// Runs a command of lib.rs; its error is thrown as {code, message}: gitfolio's own ({"error": ...}), or
// "failed" with the text of one that could not run, or of the app.
async function call(cmd, args) {
  try {
    return await invoke(cmd, args);
  } catch (e) {
    let err = { code: "failed", message: String(e) };
    try {
      err = JSON.parse(e).error ?? err;
    } catch {}
    throw err;
  }
}

// Runs gitfolio with --json (lib.rs): its JSON. Its progress shows in #progress meanwhile.
async function gitfolio(...args) {
  try {
    return JSON.parse(await call("gitfolio", { args }));
  } finally {
    if ($("progress")) $("progress").hidden = true;
  }
}

// gitfolio's progress on a long run (sync, scan --all): {"progress": {step, text, done, total}}.
window.__TAURI__.event.listen("progress", ({ payload }) => {
  const p = $("progress");
  if (!p) return;
  const { text, done, total } = JSON.parse(payload).progress;
  p.hidden = false;
  p.replaceChildren(el("span", "", text), total ? Object.assign(el("progress", ""), { value: done, max: total }) : "");
});

const when = (t) => t.slice(0, 16).replace("T", " "); // RFC3339 in local time → "2026-10-22 09:00"

// gitfolio's errors that the app solves, by code: the app's own words and a button to the section of the
// GitFolio window that solves it (goTo, of each page). gitfolio's words name its commands, for a terminal.
const REMEDIES = {
  loginFirst: ["Log in to aline.team to see this.", "Log in", "account"],
  alreadyLoggedIn: ["You are logged in already. To use another account, log out first.", "Account", "account"],
  emailTooMany: ["aline.team takes at most 20 verified work emails: remove one to add another.", "Work emails", "account"],
  signupConsent: ["This email has no aline.team account yet: agree to the terms to sign up."],
  statsSlow: ["aline.team is still working out your developer type. Refresh in a minute."],
  scheduleLocal: ["Local mode has no daily sync: choose automatic sync first.", "Sync settings", "sync"],
  stackUnavailable: ["aline.team does not give GitFolio the tech stack yet. It is on your aline.team profile."],
  noGit: ["git is needed and was not found on this computer.", "Set up", "setup"],
  // From lib.rs: an old gitfolio installed on its own is in use.
  cliTooOld: ["The gitfolio installed on this computer is too old for GitFolio. Update it from where it was installed (Homebrew, or the install script), or uninstall it so GitFolio uses its own."],
  // GitFolio called gitfolio wrong: its words are a command's usage, for no user.
  usage: ["Something went wrong in GitFolio. Please try again, or restart it."],
};

// An error in words and, when the app solves it, a button to where: inline, for a line of its own.
function drawError(e) {
  const [words, action, section] = REMEDIES[e.code]?.map((w, i) => (i < 2 ? t(w) : w)) ?? [e.message ?? String(e)];
  return [el("span", "error", words), action ? button(action, () => goTo(section)) : ""];
}

// Draws into `into` the elements `f` gives, or the error it throws.
async function fill(into, f) {
  try {
    into.replaceChildren(...(await f()));
  } catch (e) {
    into.replaceChildren(el("p", "", ...drawError(e)));
  }
}

// Runs `f`, then `after`; an error shows in `msg`.
async function act(msg, f, after) {
  msg.replaceChildren();
  try {
    await f();
  } catch (e) {
    msg.replaceChildren(...drawError(e));
    return;
  }
  await after?.();
}

const fmt = (x) => (x == null || x === "" ? "-" : typeof x === "object" ? JSON.stringify(x) : String(x));

// Any JSON as a table: for answers this app does not lay out on its own.
function drawValue(v) {
  if (Array.isArray(v)) {
    if (!v.length) return el("p", "dim", t("None."));
    if (!v.every((x) => x && typeof x === "object")) return el("p", "", v.map(fmt).join(", "));
    const keys = [...new Set(v.flatMap(Object.keys))];
    return el("table", "", el("tr", "", ...keys.map((k) => el("th", "", k))),
      ...v.map((x) => el("tr", "", ...keys.map((k) => el("td", "", fmt(x[k]))))));
  }
  if (v && typeof v === "object") {
    return el("table", "", ...Object.entries(v).map(([k, x]) =>
      el("tr", "", el("th", "", k), el("td", "", x && typeof x === "object" ? drawValue(x) : fmt(x)))));
  }
  return el("span", "", fmt(v));
}

const SCORES = ["agility", "stability", "contribution", "adaptability", "consistency"];
const title = (k) => k[0].toUpperCase() + k.slice(1); // "agility" → "Agility", the English of t

// gitfolio stats --json: the developer type, its five scores and the same with AI.
function drawStats({ type: d, saved, fetchedAt }) {
  if (!d) return [el("p", "dim", t("No developer type yet: aline.team makes it from the commits sent."))];
  return [
    el("h1", "", d.devTypeTitle),
    el("p", "dim", t("{position} · with AI {type}", { position: d.dominantPosition ?? "-", type: d.devTypeTitleAi ?? "-" })),
    el("p", "", d.devTypeDescription ?? ""),
    el("p", "dim", d.devTypeHashTags ?? ""),
    el("h2", "", t("Scores")),
    ...SCORES.map((k) => {
      const v = d[k + "Stat"], ai = d[k + "StatAi"];
      const fill = el("div", "");
      fill.style.width = `${v ?? 0}%`;
      return el("div", "score", el("span", "", t(title(k))), el("div", "bar", fill),
        el("span", "", String(v ?? "-")), el("span", "dim", ai == null ? "" : `AI ${ai}`));
    }),
    el("p", "dim", saved ? t("Saved {date}", { date: fetchedAt.slice(0, 10) }) : ""),
  ];
}

const months = (m) => (m == null ? "" : m < 12 ? t("{m}m", { m }) : t("{y}y {m}m", { y: Math.floor(m / 12), m: m % 12 }));

// gitfolio stack --json: the longest used of each kind, `top` of each.
function drawStack(u, top = 6) {
  const kinds = ["languages", "frameworks", "libraries"].map((k) => [k,
    [...(u[k] ?? [])].sort((a, b) => (b.careerMonths ?? 0) - (a.careerMonths ?? 0)).slice(0, top)]);
  if (kinds.every(([, items]) => !items.length)) return [el("p", "dim", t("No tech stack yet."))];
  return kinds.filter(([, items]) => items.length).flatMap(([k, items]) => [
    el("h2", "", t(title(k))),
    el("div", "chips", ...items.map((x) => {
      const c = el("span", x.isHidden ? "chip hidden" : "chip", `${x.name} ${months(x.careerMonths)}`);
      if (x.isHidden) c.title = t("Hidden on your aline.team profile");
      return c;
    })),
  ]);
}

// gitfolio scan --json: per repository, the commits collected now, or why not.
function drawScan(r) {
  return r.repositories.map((x) => x.error
    ? el("p", "error", `${x.name}: ${x.error}`)
    : el("p", "", t("{name}: {n} new commits", { name: x.name, n: x.commits }),
      x.pendingManifests ? el("span", "dim", t(" · {n} package manager files to choose in Dependencies", { n: x.pendingManifests })) : ""));
}

// gitfolio sync --json, in a sentence or a few.
function drawSync(r) {
  const sent = [["{n} commits", r.commits], ["{n} deleted", r.deleted], ["{n} moved", r.moved], ["{n} dependency updates", r.deps]]
    .filter(([, n]) => n > 0).map(([what, n]) => t(what, { n }));
  return [
    el("p", "", sent.length ? t("Sent {what}.", { what: sent.join(", ") }) : t("Nothing new to send.")),
    ...(r.waiting ?? []).map((w) => el("p", "dim", t("{namespace} waits until {email} is verified (Account).", w))),
    ...(r.failed ?? []).map((f) => el("p", "error", `${f.name}: ${f.error}`)),
  ];
}
