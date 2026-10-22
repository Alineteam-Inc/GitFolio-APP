// Shared by the tray window (index.html) and the GitFolio window (manage.html).

if (navigator.userAgent.includes("Mac")) document.documentElement.classList.add("glass"); // see lib.rs
const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

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

// Draws into `into` the elements `f` gives, or the error it throws.
async function fill(into, f) {
  try {
    into.replaceChildren(...(await f()));
  } catch (e) {
    into.replaceChildren(el("p", "error", e.message ?? String(e)));
  }
}

// Runs `f`, then `after`; an error shows in `msg`.
async function act(msg, f, after) {
  msg.className = "";
  msg.textContent = "";
  try {
    await f();
  } catch (e) {
    msg.className = "error";
    msg.textContent = e.message ?? String(e);
    return;
  }
  await after?.();
}

const fmt = (x) => (x == null || x === "" ? "-" : typeof x === "object" ? JSON.stringify(x) : String(x));

// Any JSON as a table: for answers this app does not lay out on its own.
function drawValue(v) {
  if (Array.isArray(v)) {
    if (!v.length) return el("p", "dim", "None.");
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
const title = (k) => k[0].toUpperCase() + k.slice(1);

// gitfolio stats --json: the developer type, its five scores and the same with AI.
function drawStats({ type: t, saved, fetchedAt }) {
  if (!t) return [el("p", "dim", "No developer type yet: aline.team makes it from the commits sent.")];
  return [
    el("h1", "", t.devTypeTitle),
    el("p", "dim", `${t.dominantPosition ?? "-"} · with AI ${t.devTypeTitleAi ?? "-"}`),
    el("p", "", t.devTypeDescription ?? ""),
    el("p", "dim", t.devTypeHashTags ?? ""),
    el("h2", "", "Scores"),
    ...SCORES.map((k) => {
      const v = t[k + "Stat"], ai = t[k + "StatAi"];
      const fill = el("div", "");
      fill.style.width = `${v ?? 0}%`;
      return el("div", "score", el("span", "", title(k)), el("div", "bar", fill),
        el("span", "", String(v ?? "-")), el("span", "dim", ai == null ? "" : `AI ${ai}`));
    }),
    el("p", "dim", saved ? `Saved ${fetchedAt.slice(0, 10)}` : ""),
  ];
}

const months = (m) => (m == null ? "" : m < 12 ? `${m}m` : `${Math.floor(m / 12)}y ${m % 12}m`);

// gitfolio stack --json: the longest used of each kind, `top` of each.
function drawStack(u, top = 6) {
  const kinds = ["languages", "frameworks", "libraries"].map((k) => [k,
    [...(u[k] ?? [])].sort((a, b) => (b.careerMonths ?? 0) - (a.careerMonths ?? 0)).slice(0, top)]);
  if (kinds.every(([, items]) => !items.length)) return [el("p", "dim", "No tech stack yet.")];
  return kinds.filter(([, items]) => items.length).flatMap(([k, items]) => [
    el("h2", "", title(k)),
    el("div", "chips", ...items.map((t) => {
      const c = el("span", t.isHidden ? "chip hidden" : "chip", `${t.name} ${months(t.careerMonths)}`);
      if (t.isHidden) c.title = "Hidden on your aline.team profile";
      return c;
    })),
  ]);
}

// gitfolio scan --json: per repository, the commits collected now, or why not.
function drawScan(r) {
  return r.repositories.map((x) => x.error
    ? el("p", "error", `${x.name}: ${x.error}`)
    : el("p", "", `${x.name}: ${x.commits} new commits`,
      x.pendingManifests ? el("span", "dim", ` · ${x.pendingManifests} package manager files to choose in Dependencies`) : ""));
}

// gitfolio sync --json, in a sentence or a few.
function drawSync(r) {
  const sent = [["commits", r.commits], ["deleted", r.deleted], ["moved", r.moved], ["dependency updates", r.deps]]
    .filter(([, n]) => n > 0).map(([what, n]) => `${n} ${what}`);
  return [
    el("p", "", sent.length ? `Sent ${sent.join(", ")}.` : "Nothing new to send."),
    ...(r.waiting ?? []).map((w) => el("p", "dim", `${w.namespace} waits until ${w.email} is verified (Account).`)),
    ...(r.failed ?? []).map((f) => el("p", "error", `${f.name}: ${f.error}`)),
  ];
}
