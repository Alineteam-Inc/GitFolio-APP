// The tray window (index.html).

if (navigator.userAgent.includes("Mac")) document.documentElement.classList.add("glass"); // see lib.rs
const goTo = (section) => call("open", { section }); // the GitFolio window, also where an error is solved (app.js)

// gitfolio status --json: the last sync at the top right, by GitFolio's name; the account and the sync
// mode; what is not sent yet in the foot, by the sync icon. Not set up yet, it says so: the gear opens the setup.
function drawState(s) {
  const local = s.syncMode === "local";
  $("sync").hidden = !s.setUp;
  $("last").textContent = !s.setUp ? "" : s.lastSync ? t("Last sync {time}", { time: when(s.lastSync) }) : t("Not synced yet");
  // Local mode sends nothing by itself, so what is not sent only grows there.
  $("unsent").textContent = s.setUp && !local && s.unsent ? t("{n} commits not sent yet", { n: s.unsent }) : "";
  if (!s.setUp) return [el("p", "", t(s.account ? "Choose the repositories to collect." : "Set up GitFolio to collect your commits."))];
  return [
    el("div", "state-line", el("span", "", s.account), el("span", "dim", t(local ? "local mode" : "automatic"))),
    s.lastSyncError ? el("p", "error right", s.lastSyncError) : "",
  ];
}

// The state first; once set up, the developer type from aline.team, with an account, and the tech stack,
// worked out on this computer. A daily refresh by itself leaves the type be in local mode, where asking
// for it sends what was collected.
async function load(refresh, byItself = false) {
  await readied;
  let s;
  await fill($("state"), async () => drawState((s = await gitfolio("status"))));
  if (!s?.setUp) return $("stats").replaceChildren(), $("stack").replaceChildren();
  // Both at once: the type asks aline.team, the stack is worked out here.
  const stats = async () => {
    if (!s.account) return $("stats").replaceChildren();
    if (byItself && s.syncMode === "local") return;
    let st;
    await fill($("stats"), async () => drawStats((st = await gitfolio("stats", ...(refresh ? ["--refresh"] : [])))));
    // The tray icon: the user's developer type's picture.
    const icon = artPixels(st?.type?.devTypeTitle, 4);
    if (icon) call("set_tray_icon", icon).catch(() => {});
  };
  await Promise.all([stats(), fill($("stack"), async () => drawStack(await gitfolio("stack")))]);
}

// The foot: refresh and sync now at its left, what is not sent yet between; settings (the GitFolio window,
// its setup until done) and quit at its right.
const icon = (id, words, f) => Object.assign($(id), { title: words, ariaLabel: words, onclick: f });
const readied = ready().then(async () => {
  $("name").textContent = `GitFolio ${await window.__TAURI__.app.getVersion()}`; // the app's own version (the GitFolio CLI's is in About)
  icon("refresh", t("Refresh"), async () => {
    const b = /** @type {HTMLButtonElement} */ ($("refresh"));
    b.disabled = true;
    await load(true);
    b.disabled = false;
  });
  // Sent, it says so in green in the foot for a while, then what is left again; only failures stay above.
  icon("sync", t("Sync now"), async () => {
    const b = /** @type {HTMLButtonElement} */ ($("sync"));
    b.disabled = true;
    let r;
    await fill($("result"), async () => [drawFailures((r = await gitfolio("sync")).failed ?? [])]);
    await fill($("state"), async () => drawState(await gitfolio("status"))); // the last sync, and what is left
    if (r) {
      const left = $("unsent").textContent, done = `✓ ${t(r.commits || r.deleted || r.moved || r.deps ? "Sent!" : "Nothing new to send.")}`;
      Object.assign($("unsent"), { textContent: done, className: "spacer ok" });
      setTimeout(() => $("unsent").textContent === done && Object.assign($("unsent"), { textContent: left, className: "spacer" }), 5000);
    }
    b.disabled = false;
  });
  icon("settings", t("Settings"), () => goTo("overview"));
  icon("quit", t("Quit"), () => call("quit"));
});
window.__TAURI__.event.listen("language", () => location.reload()); // set in General
// Once on the first open, then once a day: stats and stack may ask aline.team.
window.addEventListener("focus", () => load(false), { once: true });
setInterval(() => load(true, true), 24 * 60 * 60 * 1000);
