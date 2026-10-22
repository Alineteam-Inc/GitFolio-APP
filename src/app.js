// Shared by the tray window (index.html) and the GitFolio window (manage.html).

const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

const langOf = (v) => (/^ko/i.test(v ?? "") ? "ko" : /^ja/i.test(v ?? "") ? "ja" : "en");

// The screen's language: Korean, Japanese or English, as the device is set. The one gitfolio works out
// (ready) wins, so the app's words and gitfolio's match; until then, or with a gitfolio that does not
// say, the web view's.
let LANG = langOf(navigator.language);
let VERSION = ""; // gitfolio's release, as ready finds it

async function ready() {
  try {
    const v = await gitfolio("version");
    if (v.lang) LANG = langOf(v.lang);
    VERSION = v.release || v.version;
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

// Small icons for buttons, drawn in the text's colour; the button's words show on hover.
const ICONS = {
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5v.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
};

function iconButton(icon, words, f) {
  const b = button("", f);
  b.className = "icon";
  b.innerHTML = `<svg viewBox="0 0 24 24">${icon}</svg>`; // the app's own drawings above, no words from outside
  b.title = b.ariaLabel = words;
  return b;
}

// A path with the user's home folder as ~: /Users/me/code/app → ~/code/app (Windows' C:\Users\me\… too).
const home = (p) => p.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, "~");

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

// The developer types' pictures as aline.team draws them (as gitfolio's stats.go has them): 11 squares wide,
// a letter a square's color, "." empty. Like aline.team's name and logo, they are aline.team's.
const DEV_TYPE_COLORS = { g: "#39D353", b: "#6699CC", y: "#D9E0A3", s: "#7CB687", w: "#E8F0EA" };
const DEV_TYPE_ART = {
  BUILDER: [".gg........", "gggg.gg....", "gggggggg...", "....gggg...", "...........", "...gg..gg..", "..gggggggg.", "..gggggggg."],
  EXPLORER: [".....b.....", "....bbb....", "...bbbbb...", "...bbybb...", "...byyyb...", "...bbybb...", "...bbbbb...", "..bbbbbbb..",
    ".bb.bbb.bb.", ".b..y.y..b.", "....y.y...."],
  FIXER: ["..s.....s..", "...s...s...", "...sssss...", "..sssssss..", "s.sysssys.s", ".sssysysss.", "s.sssysss.s", ".sssysysss.",
    "s.sysssys.s", "...sssss..."],
  KEEPER: ["..sssssss..", ".sssssssss.", ".sssssssss.", ".sssssswss.", ".ssssswwss.", ".swsswwsss.", ".swwwwssss.", "..swwssss..",
    "..sswssss..", "...sssss...", "....sss...."],
  LEADER: ["y....y....y", "yy..yyy..yy", "yyy.yyy.yyy", "yyyyyyyyyyy", "yyyyyyyyyyy", "yybyybyybyy", "yyyyyyyyyyy", "yyyyyyyyyyy"],
  SPRINTER: ["....yyyyy..", "...yyyyy...", "...yyyy....", "..yyyy.....", "..yyyyyyyy.", ".yyyyyyyy..", ".....yyy...", "....yyy....",
    "...yyy.....", "..yy.......", ".y........."],
};

// A developer type's picture, `size` pixels a square; none for a type without one.
function drawArt(title, size) {
  const rows = DEV_TYPE_ART[title];
  if (!rows) return "";
  const art = el("div", "art");
  Object.assign(art.style, { gridTemplateColumns: `repeat(11, ${size}px)`, gridAutoRows: `${size}px` });
  for (const c of rows.join("")) {
    const square = el("span", "");
    if (c !== ".") square.style.background = DEV_TYPE_COLORS[c];
    art.append(square);
  }
  return art;
}

// A developer type's picture as pixels, for the tray icon: square, `scale` pixels a square, its rows centred.
function artPixels(title, scale) {
  const rows = DEV_TYPE_ART[title];
  if (!rows) return null;
  const n = 11 * scale, rgba = new Array(n * n * 4).fill(0), top = Math.floor((11 - rows.length) / 2);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === ".") return;
    const rgb = [1, 3, 5].map((i) => parseInt(DEV_TYPE_COLORS[c].slice(i, i + 2), 16));
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) rgba.splice((((top + y) * scale + dy) * n + x * scale + dx) * 4, 4, ...rgb, 255);
    }
  }));
  return { rgba, width: n, height: n };
}

const SCORES = ["agility", "stability", "contribution", "adaptability", "consistency"];
const title = (k) => k[0].toUpperCase() + k.slice(1); // "agility" → "Agility", the English of t

// gitfolio stats --json: the developer type, its five scores and the same with AI.
function drawStats({ type: d, saved, fetchedAt }) {
  if (!d) return [el("p", "dim", t("No developer type yet: aline.team makes it from the commits sent."))];
  return [
    el("div", "type", drawArt(d.devTypeTitle, 5), el("div", "",
      el("h1", "", d.devTypeTitle),
      el("p", "dim type-ai", t("{position} · with AI {type}", { position: d.dominantPosition ?? "-", type: d.devTypeTitleAi ?? "-" }), drawArt(d.devTypeTitleAi, 2)))),
    el("p", "", d.devTypeDescription ?? ""),
    el("p", "dim", d.devTypeHashTags ?? ""),
    el("h2", "", t("Scores")),
    ...SCORES.map((k) => {
      const v = d[k + "Stat"], ai = d[k + "StatAi"];
      const fill = el("div", "");
      fill.style.width = `${v ?? 0}%`;
      return el("div", "score", el("span", "", t(title(k))), el("div", "bar", fill),
        el("span", "num", String(v ?? "-")), el("span", "dim", ai == null ? "" : "AI"), el("span", "num dim", ai == null ? "" : String(ai)));
    }),
    el("p", "dim", saved ? t("Saved {date}", { date: fetchedAt.slice(0, 10) }) : ""),
  ];
}

const months = (m) => (m == null ? "" : m < 12 ? t("{m}m", { m }) : t("{y}y {m}m", { y: Math.floor(m / 12), m: m % 12 }));

const TECH_ICONS = {
  ".net": "dot-net", "android": "android", "angular": "angular", "ansible": "ansible", "asp.net": "dotnetcore",
  "aws": "amazonwebservices", "bootstrap": "bootstrap", "c": "c", "c#": "csharp", "c++": "cplusplus",
  "clojure": "clojure", "css": "css3", "dart": "dart", "django": "django", "docker": "docker",
  "elasticsearch": "elasticsearch", "electron": "electron", "elixir": "elixir", "erlang": "erlang",
  "express": "express", "f#": "fsharp", "fastapi": "fastapi", "firebase": "firebase", "flask": "flask",
  "flutter": "flutter", "gdscript": "godot", "git": "git", "github actions": "githubactions", "go": "go",
  "gradle": "gradle", "graphql": "graphql", "groovy": "groovy", "haskell": "haskell", "hibernate": "hibernate",
  "html": "html5", "java": "java", "javascript": "javascript", "jenkins": "jenkins", "jest": "jest",
  "jquery": "jquery", "julia": "julia", "junit": "junit", "kafka": "apachekafka", "kotlin": "kotlin",
  "kubernetes": "kubernetes", "laravel": "laravel", "linux": "linux", "lua": "lua", "mariadb": "mariadb",
  "maven": "maven", "mongodb": "mongodb", "mysql": "mysql", "nestjs": "nestjs", "next.js": "nextjs",
  "nginx": "nginx", "node.js": "nodejs", "numpy": "numpy", "nuxt": "nuxtjs", "objective-c": "objectivec",
  "oracle": "oracle", "pandas": "pandas", "perl": "perl", "php": "php", "postgresql": "postgresql",
  "powershell": "powershell", "pytest": "pytest", "python": "python", "pytorch": "pytorch", "quarkus": "quarkus",
  "r": "r", "rabbitmq": "rabbitmq", "react": "react", "react native": "react", "redis": "redis", "redux": "redux",
  "ruby": "ruby", "ruby on rails": "rails", "rust": "rust", "scala": "scala", "shell": "bash",
  "solidity": "solidity", "spring boot": "spring", "spring cloud": "spring", "spring security": "spring",
  "sqlite": "sqlite", "svelte": "svelte", "swift": "swift", "tailwind css": "tailwindcss", "tauri": "tauri",
  "tensorflow": "tensorflow", "terraform": "terraform", "typescript": "typescript", "unity": "unity",
  "unreal engine": "unrealengine", "vite": "vitejs", "vue": "vuejs", "webpack": "webpack", "zig": "zig",
};

// A tile's name (data-name) on hover, drawn by the page: the web view shows no system tooltip (title). Above
// the tile, or below it near the top, and kept inside the window: centred on a tile at an edge, it would be cut.
const tip = el("div", "tip");
tip.hidden = true;
document.body.append(tip);
function named(tile) {
  tile.onmouseenter = () => {
    tip.textContent = tile.dataset.name;
    tip.hidden = false;
    const r = tile.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${r.top - h - 4 >= 4 ? r.top - h - 4 : r.bottom + 4}px`;
  };
  tile.onmouseleave = () => (tip.hidden = true);
  return tile;
}

// gitfolio stack --json: every one of each kind, the longest used first, as icons (Devicon, in icons/tech)
// named on hover, wrapping onto more lines as the window's width allows; a name without an icon shows its
// first letters.
function drawStack(u) {
  const kinds = ["languages", "frameworks", "libraries"].map((k) => [k,
    [...(u[k] ?? [])].sort((a, b) => (b.careerMonths ?? 0) - (a.careerMonths ?? 0))]);
  if (kinds.every(([, items]) => !items.length)) return [el("p", "dim", t("No tech stack yet."))];
  return kinds.filter(([, items]) => items.length).flatMap(([k, items]) => [
    el("h2", "", t(title(k))),
    el("div", "techs", ...items.map((x) => {
      const icon = TECH_ICONS[x.name.toLowerCase()];
      const words = x.name.split(/\s+/);
      const tile = el("span", x.isHidden ? "tech hidden" : "tech",
        icon ? Object.assign(el("img", ""), { src: `icons/tech/${icon}.svg`, alt: "" })
          : el("span", "letters", (words.length > 1 ? words.map((w) => w[0]).join("") : x.name).slice(0, 3)));
      tile.dataset.name = [x.name, months(x.careerMonths), x.isHidden && t("Hidden on your aline.team profile")].filter(Boolean).join(" · ");
      tile.ariaLabel = tile.dataset.name;
      return named(tile);
    })),
  ]);
}

// Failures of many repositories, as gitfolio tells them one by one ({name, error}): each kind of failure
// once, the repositories it hit listed after it, in a box that scrolls when long.
function drawFailures(failures) {
  if (!failures.length) return "";
  const by = new Map();
  for (const f of failures) by.set(f.error, [...(by.get(f.error) ?? []), f.name]);
  return el("div", "scroll", ...[...by].map(([error, names]) => el("p", "", el("span", "error", error), el("br", ""), el("span", "dim", names.join(", ")))));
}

// gitfolio stack --json as a timeline: each technology a row, a bar for each run of months it was used in
// (activityMonths; without them, one from its first to its last use), over the months from the earliest start
// to the latest end (each year's start a line, named after it). Its kind by colour (with a legend, and each row
// named, so not by colour alone); its dates, months and projects on hover. Grouped by kind, the earliest first
// within one. Ones without dates are left out.
const KINDS = ["languages", "frameworks", "libraries"];
function drawTimeline(u) {
  const at = (d) => (d ? Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1 : null); // "2023-04-14…" → months
  const rows = KINDS.flatMap((k) => (u[k] ?? []).filter((x) => at(x.startDate) != null)
    .map((x) => ({ ...x, kind: k, from: at(x.startDate), to: at(x.endDate) ?? at(x.startDate) }))
    .sort((a, b) => a.from - b.from));
  if (!rows.length) return "";
  const first = Math.min(...rows.map((r) => r.from)), last = Math.max(...rows.map((r) => r.to)) + 1;
  const x = (m) => `${((m - first) / (last - first)) * 100}%`;
  const years = [];
  for (let y = Math.floor(first / 12); y * 12 < last; y++) years.push(y);
  // At most 12 named, each where it starts (the first where the axis does), none on under 3 months of it.
  const step = Math.ceil(years.length / 12), shown = (y) => Math.min(last, y * 12 + 12) - Math.max(first, y * 12);
  const month = (m) => `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`;
  return el("div", "timeline",
    el("div", "legend", ...KINDS.filter((k) => rows.some((r) => r.kind === k)).map((k) =>
      el("span", "", el("i", `swatch ${k}`), t(title(k))))),
    el("div", "tl-body",
      el("div", "tl-axis", el("span", ""), el("div", "tl-years", ...years.filter((y, i) => i % step === 0 && (shown(y) >= 3 || years.length === 1))
        .map((y) => Object.assign(el("span", "", String(y)), { style: `left: ${x(Math.max(first, y * 12))}` })))),
      ...rows.map((r) => {
        const icon = TECH_ICONS[r.name.toLowerCase()];
        const runs = (r.activityMonths ?? []).map(at).reduce((rs, m) => // ["2023-04", "2023-05", "2023-08"] → [[04, 05], [08, 08]]
          (rs.length && m === rs.at(-1)[1] + 1 ? (rs.at(-1)[1] = m) : rs.push([m, m]), rs), []);
        const bars = (runs.length ? runs : [[r.from, r.to]]).map(([a, b]) => {
          const bar = named(Object.assign(el("i", `tl-bar ${r.kind}${r.isHidden ? " hidden" : ""}`), {
            style: `left: ${x(a)}; width: max(6px, calc(${x(b + 1)} - ${x(a)}))`,
          }));
          bar.dataset.name = [r.name, a === b ? month(a) : `${month(a)} – ${month(b)}`, months(r.careerMonths),
            r.projectCount != null && t("{n} projects", { n: r.projectCount }), r.isHidden && t("Hidden on your aline.team profile")].filter(Boolean).join(" · ");
          return bar;
        });
        return el("div", "tl-row",
          el("span", "tl-name", icon ? Object.assign(el("img", ""), { src: `icons/tech/${icon}.svg`, alt: "" }) : "", r.name),
          el("div", "tl-track", ...years.filter((y) => y * 12 > first).map((y) => Object.assign(el("b", ""), { style: `left: ${x(y * 12)}` })), ...bars));
      })));
}

// gitfolio scan --json: per repository, the commits collected now; the failures together.
function drawScan(r) {
  return [
    ...r.repositories.filter((x) => !x.error).map((x) => el("p", "", t("{name}: {n} new commits", { name: x.name, n: x.commits }),
      x.pendingManifests ? el("span", "dim", t(" · {n} package manager files to choose in Dependencies", { n: x.pendingManifests })) : "")),
    drawFailures(r.repositories.filter((x) => x.error)),
  ];
}

// Repositories aline.team takes only once an email is verified ({namespace, email}): per email, in a box
// that scrolls when long, with the way to verify it.
function drawWaiting(waiting) {
  const by = new Map();
  for (const w of waiting) by.set(w.email, [...(by.get(w.email) ?? []), w.namespace]);
  return [...by].map(([email, names]) => el("div", "",
    el("p", "", t("These are sent once {email} is verified:", { email }), button(t("Account"), () => goTo("account"))),
    el("div", "scroll", el("p", "dim", names.join(", ")))));
}

// gitfolio sync --json, in a sentence or a few.
function drawSync(r) {
  const sent = [["{n} commits", r.commits], ["{n} deleted", r.deleted], ["{n} moved", r.moved], ["{n} dependency updates", r.deps]]
    .filter(([, n]) => n > 0).map(([what, n]) => t(what, { n }));
  return [
    el("p", "", sent.length ? t("Sent {what}.", { what: sent.join(", ") }) : t("Nothing new to send.")),
    ...drawWaiting(r.waiting ?? []),
    drawFailures(r.failed ?? []),
  ];
}
