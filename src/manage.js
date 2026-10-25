// The GitFolio window (manage.html): its sections and the setup.

// A time of day: hour and minute stepped up and down, AM or PM chosen, rather than the system's field,
// whose AM/PM turns with its arrows unseen. hhmm() gives it as gitfolio takes it: "HH:MM", 24-hour.
function timeInput(hhmm, changed = () => {}) {
  let [h, m] = hhmm.split(":").map(Number);
  const hour = el("span", "num"), minute = el("span", "num"), am = el("button", "", t("AM")), pm = el("button", "", t("PM"));
  const draw = () => {
    hour.textContent = String(h % 12 || 12);
    minute.textContent = String(m).padStart(2, "0");
    am.className = h < 12 ? "on" : "";
    pm.className = h < 12 ? "" : "on";
  };
  const arrow = (text, change) => Object.assign(el("button", "", text), { onclick: () => (change(), draw(), changed()) });
  const stepper = (shown, up, down) => el("div", "stepper", arrow("▲", up), shown, arrow("▼", down));
  // The hour turns within its half of the day: AM or PM is chosen apart.
  am.onclick = () => (h %= 12, draw(), changed());
  pm.onclick = () => (h = (h % 12) + 12, draw(), changed());
  const box = el("div", "time",
    stepper(hour, () => (h = (h % 12 + 1) % 12 + (h >= 12 ? 12 : 0)), () => (h = (h % 12 + 11) % 12 + (h >= 12 ? 12 : 0))),
    el("span", "num", ":"),
    stepper(minute, () => (m = (m + 5) % 60), () => (m = (m + 55) % 60)),
    el("div", "ampm", am, pm));
  draw();
  return Object.assign(box, { hhmm: () => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` });
}

function codeInput(length) {
  return Object.assign(input("text", "0".repeat(length ?? 6)), { inputMode: "numeric", autocomplete: "one-time-code", maxLength: length ?? 6 });
}

// ---- Parts, used by the sections and the setup ----

// Log in or sign up with a code sent by email (login --email, then --code), then onDone.
function loginForm(onDone) {
  const box = el("div", "");
  const email = input("email", "you@example.com");
  const msg = el("p", "");
  box.replaceChildren(el("p", "", t("Log in or sign up to aline.team with a code sent by email.")),
    el("div", "row", email, button(t("Send code"), () => act(msg, send))), msg);
  async function send() {
    try {
      codeStep(await gitfolio("login", "--email", email.value.trim()));
    } catch (e) {
      if (e.code !== "alreadyLoggedIn") throw e;
      await onDone();
    }
  }
  // An email without an account is signed up only with the user's agreement to aline.team's terms.
  function codeStep(r) {
    const code = codeInput(r.codeLength), agree = checkbox(), notify = checkbox(), msg = el("p", "");
    async function finish() {
      const args = ["login", "--email", r.email, "--code", code.value.trim()];
      if (!r.accountExists) {
        if (!agree.checked) throw { message: t("Agree to the terms above to sign up.") };
        args.push("--signup", ...(notify.checked ? ["--notify"] : []));
      }
      await gitfolio(...args);
    }
    box.replaceChildren(
      el("p", "", t("Enter the {n}-digit code sent to {email}.", { n: r.codeLength, email: r.email })),
      ...(r.accountExists ? [] : [el("p", "pre dim", r.signupNotice ?? ""), label(agree, t("I agree, and sign up")),
        r.notifyQuestion ? label(notify, r.notifyQuestion) : ""]),
      el("div", "row", code, button(t(r.accountExists ? "Log in" : "Sign up"), () => act(msg, finish, onDone)),
        // codeExpired: too old, or wrong too many times; a new one is needed
        button(t("Send a new code"), () => act(msg, async () => codeStep(await gitfolio("login", "--email", r.email))))),
      msg);
  }
  return box;
}

// The Git author emails removed here, kept by the app: the finder never adds one back by itself. Added
// here again, it is no longer one of them.
const removedEmails = () => {
  try {
    return JSON.parse(localStorage.getItem("removedEmails")) ?? [];
  } catch {
    return []; // unreadable: as if none
  }
};
function keepRemoved(email, removed) {
  const list = removedEmails().filter((x) => x !== email.toLowerCase());
  localStorage.setItem("removedEmails", JSON.stringify(removed ? [...list, email.toLowerCase()] : list));
}

// The Git author emails (email --json): add, verify with a code, make primary, remove.
function emails() {
  const box = el("div", "");
  const draw = () => fill(box, async () => {
    const { emails } = await gitfolio("email");
    const add = input("email", t("another Git author email")), msg = el("p", "");
    const change = (...args) => act(msg, async () => {
      await gitfolio("email", ...args);
      if (args[0] === "rm" || args[0] === "add") keepRemoved(args[1], args[0] === "rm");
    }, draw);
    return [
      // One line each: the email and what it is, its buttons at the end.
      ...emails.map((e) => el("div", "item",
        el("span", "", e.email),
        ...[e.primary && t("primary"), e.verified && t("verified"), e.noreply && "no-reply"].filter(Boolean).map((b) => el("span", "badge", b)),
        el("div", "item-actions",
          e.primary ? "" : iconButton(ICONS.crown, t("Make primary"), () => change("primary", e.email), "primary"),
          e.verified ? "" : iconButton(ICONS.check, t("Verify…"), () => act(msg, () => verify(e.email)), "verify"),
          iconButton(ICONS.close, t("Remove"), () => change("rm", e.email), "remove")))),
      el("div", "row", add, iconButton(ICONS.plus, t("Add"), () => change("add", add.value.trim()))),
      msg,
    ];
  });
  // email verify sends a code, or, for an email verified already, answers with the emails.
  async function verify(email) {
    const r = await gitfolio("email", "verify", email);
    if (r.emails) return draw();
    const code = codeInput(r.codeLength), msg = el("p", "");
    box.replaceChildren(el("p", "", t("Enter the {n}-digit code sent to {email}.", { n: r.codeLength, email })),
      el("div", "row", code, button(t("Cancel"), draw),
        button(t("Verify"), () => act(msg, () => gitfolio("email", "verify", email, "--code", code.value.trim()), draw))),
      msg);
  }
  draw();
  return box;
}

// Finds the repositories under the code folders and the emails in them (init --scan), and adds the
// ones chosen; then onDone.
// Select all and Deselect all, over a list's [item, checkbox] pairs; then `after`.
function bulk(list, after = () => {}) {
  const all = (on) => () => (list.forEach(([, c]) => (c.checked = on)), after());
  return el("div", "row", button(t("Select all"), all(true)), button(t("Deselect all"), all(false)));
}

function finder(onDone) {
  // The folders to look in: the ones gitfolio saved or suggests, and the ones picked in the system's
  // own window (Finder, File Explorer), no path to type.
  let roots = [];
  const folders = el("div", ""), out = el("div", ""), msg = el("p", "");
  const drawFolders = () => folders.replaceChildren(
    ...roots.map((r) => el("div", "item", el("span", "", r),
      el("div", "item-actions", iconButton(ICONS.close, t("Remove"), () => { roots = roots.filter((x) => x !== r); drawFolders(); }, "remove")))),
    el("div", "row", button(t("Add a folder…"), async () => {
      const picked = await call("pick_folder");
      if (picked && !roots.includes(picked)) roots.push(picked), drawFolders();
    }), button(t("Search these folders"), () => find(true))));
  async function find(useRoots) {
    const args = ["init", "--scan", ...(useRoots ? roots.flatMap((r) => ["--root", r]) : [])];
    // This search's own box: one started after it takes its place, and this one then shows and adds nothing.
    const box = el("div", "", el("p", "dim", "…")), latest = () => box.parentNode === out;
    out.replaceChildren(box);
    msg.replaceChildren();
    await fill(box, async () => {
      let s = await gitfolio(...args);
      if (!latest()) return [];
      // Whose commits count: the Git author emails kept (Account), and every email git uses in these
      // repositories not kept yet nor removed in Account, added at once (the user's own settings, never
      // teammates'), as init takes them by default; the verified ones first, so a first primary is one.
      // Counted again, unless gitfolio counted by just these already (none kept, none removed).
      const removed = removedEmails();
      const more = s.emails.filter((e) => !e.work && !removed.includes(e.email.toLowerCase()))
        .sort((a, b) => (b.verified ? 1 : 0) - (a.verified ? 1 : 0)).map((e) => e.email);
      // Not added: the repositories still show, counted as before, the error under them.
      const added = more.length > 0 && (await gitfolio("email", "add", ...more)
        .then(() => true, (e) => (latest() && msg.replaceChildren(...drawError(e)), false)));
      if (added && more.length < s.emails.length) s = await gitfolio(...args);
      else if (added) s.emails.forEach((e) => (e.work = true));
      if (!latest()) return [];
      roots = s.roots;
      drawFolders();
      const counted = s.emails.filter((e) => e.work).map((e) => e.email);
      // Like init: the ones with the user's commits, not collected yet.
      const repos = s.repositories.filter((r) => r.ownCommits > 0 && !r.registered).map((r) => [r, checkbox(true)]);
      return [
        counted.length ? el("p", "dim", t("Commits by {emails} count as yours: change them in Account.", { emails: counted.join(", ") })) : "",
        el("h2", "", t("Repositories with your commits, not collected yet ({n})", { n: repos.length })),
        bulk(repos), el("div", "scroll", ...repos.map(([r, c]) => label(c, r.name, el("span", "dim", ` · ${t("{n} commits", { n: r.ownCommits })} · ${t("last {date}", { date: r.lastCommit })} · ${home(r.path)}`)))),
        el("div", "actions", button(t("Skip"), onDone),
          button(t("Add the chosen repositories"), () => add(repos.filter(([, c]) => c.checked).map(([r]) => r)))),
      ];
    });
  }
  async function add(list) {
    const failures = [];
    for (const [i, r] of list.entries()) {
      progress(t("Collecting {name} ({i} of {n})…", { name: r.name, i: i + 1, n: list.length }), i, list.length);
      try {
        await gitfolio("add", r.path);
      } catch (e) {
        failures.push({ name: r.name, error: e.message });
      }
    }
    progress();
    msg.replaceChildren(drawFailures(failures));
    if (!failures.length) await onDone();
  }
  find(false);
  drawFolders();
  return el("div", "", el("p", "", t("Folders to look in for repositories:")), folders, out, msg);
}

// Every repository's package manager files (deps --json) in one box that scrolls, under its repository's
// name; the allowed ones are read, the others never. All chosen or none at once, saved at once: save()
// reviews the repositories whose choices changed or have new files (a review collects one again), shows
// the failures together, and says whether all went well.
function depsFiles(repos) {
  const items = repos.flatMap((r) => r.files.map((f) => [r, f, checkbox(f.state === "allowed")]));
  const msg = el("p", "");
  async function save() {
    msg.replaceChildren();
    const failures = [];
    // One after the other (they write the same files), each collected again: say which, as it takes a while.
    const changed = repos.filter((r) => items.some(([x, f, c]) => x === r && (f.state === "new" || c.checked !== (f.state === "allowed"))));
    for (const [i, r] of changed.entries()) {
      const mine = items.filter(([x]) => x === r);
      progress(t("Reading the package manager files: {i} of {n} · {name}", { i: i + 1, n: changed.length, name: r.name }), i, changed.length);
      try {
        await gitfolio("deps", "review", r.path, ...mine.flatMap(([, f, c]) => (c.checked ? ["--allow", f.path] : [])));
      } catch (e) {
        failures.push({ name: r.name, error: e.message });
      }
    }
    progress();
    msg.replaceChildren(failures.length ? drawFailures(failures) : t("Saved."));
    return !failures.length;
  }
  if (!items.length) return { parts: [el("p", "dim", t("No package manager files.")), msg], save, msg };
  // A repository's own box, over its files: on when all are, half (−) when some are; it turns them all on or off.
  const shown = repos.filter((r) => r.files.length).map((r) => {
    const mine = items.filter(([x]) => x === r), box = checkbox();
    const show = () => Object.assign(box, { checked: mine.every(([, , c]) => c.checked), indeterminate: mine.some(([, , c]) => c.checked) && !mine.every(([, , c]) => c.checked) });
    box.onchange = () => (mine.forEach(([, , c]) => (c.checked = box.checked)), show());
    mine.forEach(([, , c]) => (c.onchange = show));
    show();
    return { show, part: el("section", "", label(box, el("strong", "", r.name)),
      el("div", "nested", ...mine.map(([, f, c]) => label(c, f.path, f.state === "new" ? el("span", "dim", ` · ${t("new")}`) : "")))) };
  });
  return {
    parts: [bulk(items.map(([, , c]) => [null, c]), () => shown.forEach((s) => s.show())),
      el("div", "scroll tall", ...shown.map((s) => s.part)),
      msg],
    save,
    msg,
  };
}

// gitfolio status <path> --json: one repository, as facts in two columns, numbers beside their words.
function drawRepo(d) {
  const n = (x) => (x ?? 0).toLocaleString();
  const most = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${n(v)}`).join(" · ");
  const service = { GITHUB: "GitHub", GITLAB: "GitLab", BITBUCKET: "Bitbucket" }[d.service] ?? d.service;
  const facts = [
    ["Where", d.namespace ? [service, d.namespace].filter(Boolean).join(" · ") : t("never (no remote)")],
    ["Path", home(d.path)],
    ["Commits", t("{n}, {sent} sent", { n: n(d.commits), sent: n(d.sent) }) + (d.waiting ? ` · ${t("waiting")}` : "")],
    ["Changes", t("{f} file changes, {c} files created", { f: n(d.fileChanges), c: n(d.filesCreated) })],
    ["Lines", `+${n(d.linesAdded)} −${n(d.linesDeleted)}`],
    ["AI", [t("{n} of {total} commits", { n: n(d.aiCommits), total: n(d.commits) }), most(d.agents)].filter(Boolean).join(" · ")],
    ["Lines by language", most(d.languages) || "-"],
    ["Dependencies", d.dependencies == null ? t("off") : Object.entries(d.dependencies).map(([eco, names]) => `${eco} ${names.length}`).join(" · ") || "-"],
    ["Hooks", t(d.hooks)],
    ["Last commit", d.lastCommit || "-"],
  ];
  return [el("div", "facts", ...facts.flatMap(([k, v]) => [el("span", "dim", t(k)), el("span", "", v)]))];
}

function confirmRemove(r, box) {
  const purge = checkbox(), msg = el("p", "");
  const remove = async () => {
    const done = await gitfolio("remove", r.path, ...(purge.checked ? ["--purge"] : []));
    if (done.hooksError) throw { message: t("{name} is no longer collected, but its earlier hooks could not be put back: {error}", { name: r.name, error: done.hooksError }) };
  };
  box.replaceChildren(
    el("p", "", t("Stop collecting {name} and put back the git hooks it had before?", { name: r.name })),
    label(purge, t("Also delete its collected commits, on this computer and on aline.team")),
    el("div", "actions", button(t("Cancel"), () => (box.replaceChildren(), delete box.dataset.open)), button(t("Remove"), () => act(msg, remove, () => go("overview")))),
    msg);
}

// ---- Sections ----

async function overview(main) {
  const s = await gitfolio("status");
  if (!s.setUp) return go("setup");
  const local = s.syncMode === "local";
  const result = el("div", ""), adding = el("div", "");
  // The repositories, one line each, in a table that scrolls in its box under its fixed head: the counts'
  // columns as wide as their words (never cut), the name and path taking the rest, cut short (… ) only when
  // the window is narrow, whole on hover; icon buttons; details and removing open under the line.
  const rows = el("tbody", "");
  const table = el("div", "scroll tall", el("table", "repos",
    el("thead", "", el("tr", "", ...["Repository", "Commits", "Sent", "Hooks", "Last commit", ""].map((h) => el("th", { Commits: "num", Hooks: "hooks", "Last commit": "last" }[h] ?? "", h && t(h))))),
    rows));
  for (const r of s.repositories) {
    const box = el("div", "repo-box");
    // A button opens its panel under the line, and the same button closes it again.
    const panel = (kind, f) => async () => {
      if (box.dataset.open === kind) return box.replaceChildren(), delete box.dataset.open;
      box.dataset.open = kind;
      await f();
    };
    const where = el("td", "where", el("strong", "", r.name), " ", el("span", "dim", home(r.path)));
    where.title = `${r.name} · ${home(r.path)}`;
    rows.append(
      el("tr", "", where,
        el("td", "num", String(r.commits)),
        el("td", "", r.namespace === "" ? t("no remote") : r.waiting ? t("waiting") : String(r.sent)),
        el("td", "hooks", t(r.hooks)),
        el("td", "last", r.lastCommit || "-"),
        el("td", "icons",
          iconButton(ICONS.info, t("Details"), panel("details", () => fill(box, async () => drawRepo(await gitfolio("status", r.path))))),
          iconButton(ICONS.refresh, t("Collect again"), panel("collect", () => fill(box, async () => drawScan(await gitfolio("scan", r.path))))),
          iconButton(ICONS.close, t("Remove…"), panel("remove", () => confirmRemove(r, box))))),
      el("tr", "more", Object.assign(el("td", "", box), { colSpan: 6 })));
  }
  main.replaceChildren(
    el("header", "", el("h1", "", t("Overview")), el("div", "row",
      iconButton(ICONS.sync, t("Sync now"), () => fill(result, async () => drawSync(await gitfolio("sync")))), iconButton(ICONS.refresh, t("Refresh"), () => go("overview")))),
    el("p", "", `${s.account} · ${t(local ? "local mode" : "automatic")}`),
    el("p", "dim", s.lastSync ? t("Last sync {time}", { time: when(s.lastSync) }) : t("Not synced yet")),
    s.lastSyncError ? el("p", "error", s.lastSyncError) : "",
    // Local mode sends nothing by itself, so what is not sent only grows there.
    !local && s.unsent ? el("p", "", t("{n} commits not sent yet", { n: s.unsent })) : "",
    result,
    el("header", "repos-head", el("h2", "", t("Repositories ({n})", { n: s.repositories.length })),
      iconButton(ICONS.plus, t("Add repositories…"), () => adding.replaceChildren(finder(() => go("overview"))))),
    table,
    adding);
}

async function general(main) {
  const on = checkbox(await call("autostart")), msg = el("p", "");
  on.onchange = () => act(msg, () => call("set_autostart", { on: on.checked }));
  // The language: the device's to start with; a language's name in itself.
  const lang = el("select", "");
  const chosen = await call("language");
  for (const [value, name] of [["", t("As the device is set")], ["ko", "한국어"], ["en", "English"], ["ja", "日本語"]]) {
    lang.append(Object.assign(el("option", "", name), { value, selected: value === chosen }));
  }
  lang.onchange = () => act(msg, () => call("set_language", { lang: lang.value }));
  main.replaceChildren(el("h1", "", t("General")),
    el("label", "", el("span", "", t("Language")), lang),
    label(on, t("Start GitFolio when the computer starts"), el("div", "dim", t("It waits as an icon in the menu bar or the taskbar."))), msg);
}

async function account(main) {
  // The login as this computer keeps it, at once: whoami asks aline.team, and the emails below do as well.
  const { account } = await gitfolio("status");
  const msg = el("p", "");
  main.replaceChildren(el("h1", "", t("Account")), ...(account
    ? [el("p", "", t("Logged in to aline.team as {email}", { email: account })),
      el("div", "row", button(t("Log out"), () => act(msg, () => gitfolio("logout"), () => go("account")))), msg,
      el("h2", "", t("Git author emails")),
      el("p", "dim", t("Commits by any of them count as yours, and aline.team gets them all under the primary one. Verified ones merge the repositories linked to them on aline.team.")),
      emails()]
    : [loginForm(() => go("account"))]));
}

async function sync(main) {
  const [s, sch] = await Promise.all([gitfolio("status"), gitfolio("schedule")]);
  const local = s.syncMode === "local";
  const msg = el("p", "");
  const mode = (value, text, note) => {
    const r = Object.assign(input("radio"), { name: "mode", checked: (value === "local") === local });
    r.onchange = () => act(msg, () => gitfolio("config", "autosync", value === "local" ? "off" : "on"), () => go("sync"));
    return label(r, t(text), el("div", "dim", t(note)));
  };
  const schedule = (...args) => act(msg, () => gitfolio("schedule", ...args), () => go("sync"));
  const on = Object.assign(checkbox(!!sch.schedule), { className: "switch", ariaLabel: t("Daily sync") });
  let later;
  const time = timeInput(sch.schedule || "09:00", () => on.checked && (clearTimeout(later), (later = setTimeout(() => schedule(time.hhmm()), 800))));
  on.onchange = () => schedule(on.checked ? time.hhmm() : "off");
  main.replaceChildren(
    el("h1", "", t("Sync")),
    el("h2", "", t("How commits are sent")),
    mode("automatic", "Automatic", "Sent to aline.team right after each git push."),
    mode("local", "Local", "Nothing is sent until you sync, or ask for your developer type or stack. The daily sync goes off."),
    el("h2", "", t("Daily sync")),
    local ? el("p", "dim", t("Local mode has no daily sync.")) : el("div", "",
      el("p", "dim", sch.schedule ? t("Every day at {time}, for pushes the hooks missed.", { time: sch.schedule }) : t("Off. Once a day at a set time, it sends pushes the hooks missed.")),
      el("div", "row", on, time)),
    el("h2", "", t("Last sync")),
    el("p", "", sch.lastSync ? when(sch.lastSync) : t("Not synced yet")),
    sch.lastSyncError ? el("p", "error", sch.lastSyncError) : "",
    msg);
}

async function dependencies(main) {
  const d = await gitfolio("deps"), files = depsFiles(d.repositories);
  const msg = el("p", "");
  const set = (...args) => act(msg, () => gitfolio("deps", ...args), () => go("dependencies"));
  const on = checkbox(d.on), auto = checkbox(d.auto);
  on.onchange = () => set(on.checked ? "on" : "off");
  auto.onchange = () => set("auto", auto.checked ? "on" : "off");
  main.replaceChildren(
    el("h1", "", t("Dependencies")),
    el("p", "dim", t("The packages your repositories use, read only from the package manager files you allow.")),
    label(on, t("Detect dependencies"), el("div", "dim", t("Turning it off deletes the dependencies collected."))),
    d.on ? label(auto, t("Also read them on scan, sync and the daily sync"), el("div", "dim", t("Pushes never read them."))) : "",
    msg,
    ...(d.on ? [el("div", "row", button(t("Find new files"), () => set("scan", "--all"))), ...files.parts,
      el("div", "actions", button(t("Save"), files.save))] : []));
}

// Privacy: what is collected and kept, as settings, like the system's Privacy & Security. The data
// policy, a document like terms, has a section of its own.
async function privacy(main) {
  const cfg = await gitfolio("config");
  const msg = el("p", ""), word = input("text", t("a customer or internal project name")), history = el("div", "");
  const config = (...args) => act(msg, () => gitfolio("config", ...args), () => go("privacy"));
  const record = checkbox(!cfg.gitHistoryOff);
  record.onchange = () => config("git-history", record.checked ? "on" : "off");
  const showHistory = (...all) => fill(history, async () => drawHistory(await gitfolio("history", ...all)));
  const today = () => { const d = new Date(); return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-"); };
  const exported = el("p", "");
  const save = async () => {
    const path = await call("export", { date: today() }); // none: the user cancelled the save window
    if (path) exported.textContent = t("Saved as {path}", { path });
  };
  main.replaceChildren(
    el("h1", "", t("Privacy")),
    el("h2", "", t("Blocked words")),
    el("p", "dim", t("Replaced in everything collected, what is stored already too.")),
    el("div", "row", word, iconButton(ICONS.plus, t("Add"), () => config("mask", "add", word.value.trim()))),
    el("div", "chips", ...(cfg.mask ?? []).map((w) => el("span", "chip", w, " ", button("×", () => config("mask", "rm", w))))),
    el("h2", "", t("Git commands GitFolio runs")),
    label(record, t("Keep git's own record of them"), el("div", "dim", t("Turning it off deletes the record."))),
    el("div", "row", button(t("Show recent runs"), () => showHistory()), button(t("Show all runs"), () => showHistory("--all"))),
    history,
    el("h2", "", t("Everything collected")),
    el("p", "dim", t("The commits, dependencies and statistics collected on this computer, as one JSON file.")),
    el("div", "row", button(t("Export…"), () => act(exported, save))),
    exported,
    msg);
}

// gitfolio history --json: each run of gitfolio, newest last, and the git commands it ran.
function drawHistory(h) {
  if (!h.on) return [el("p", "dim", t("The record is off."))];
  if (!h.runs.length) return [el("p", "dim", t("No git commands recorded yet."))];
  return [el("p", "dim", t("The last {n} of {total} runs.", { n: h.runs.length, total: h.total })), ...h.runs.map((r) => el("div", "",
    el("p", "", `${when(r.at)}  ${r.command}`), ...r.git.map((g) => el("p", "dim", `    ${g.at}  ${g.command}`))))];
}

async function policy(main) {
  const { policy } = await gitfolio("init", "--policy");
  main.replaceChildren(el("h1", "", t("Data policy")), el("p", "pre", policy.trim()));
}

// The developer type from aline.team, with an account; the tech stack, worked out on this computer, always.
async function profile(main) {
  const account = (await gitfolio("status")).account;
  const stats = el("section", ""), stack = el("section", "");
  const load = (refresh) => Promise.all([ // both at once: the type asks aline.team, the stack is worked out here
    account ? fill(stats, async () => drawStats(await gitfolio("stats", ...(refresh ? ["--refresh"] : []))))
      : stats.replaceChildren(el("p", "", ...drawError({ code: "loginFirst" }))),
    fill(stack, async () => {
      const u = await gitfolio("stack");
      return [drawTimeline(u), ...drawStack(u)];
    }),
  ]);
  main.replaceChildren(el("header", "", el("h2", "", t("Developer type, from aline.team")), iconButton(ICONS.refresh, t("Refresh"), () => load(true))),
    stats, el("h2", "", t("Tech stack")), el("p", "dim", t("From the repositories on this computer.")), stack);
  await load(false);
}

// A line of About's versions: what it is and where, then, checked for a newer one on request (the
// magnifier), whether one is out, with the arrow to update when the app can: `check` answers
// {text, update}, and `update` the words of how it went.
function versionRow(name, title, where, check) {
  const msg = el("div", ""), arrow = el("span", "");
  const look = () => act(msg, async () => {
    progress(t("Checking for a newer {name}…", { name }));
    try {
      const { text, update } = await check();
      msg.replaceChildren(el("p", "dim", ...text));
      arrow.replaceChildren(update ? iconButton(ICONS.download, t("Update"), () => act(msg, async () => {
        const done = await update();
        arrow.replaceChildren();
        msg.replaceChildren(...done);
      })) : "");
    } finally {
      progress();
    }
  });
  return el("div", "item", el("div", "grow", el("div", "", title), where ? el("div", "dim", where) : "", msg),
    el("div", "item-actions", iconButton(ICONS.search, t("Check for updates"), look), arrow));
}
// A link to a web page, opened in the browser: the window stays on GitFolio.
const link = (text, url) => Object.assign(el("a", "", text), { href: url, onclick: (e) => (e.preventDefault(), call("open_url", { url })) });
// Whether a version is the newest: upToDate as gitfolio says it (none: it could not ask, offline).
const newest = (upToDate, latest) => upToDate === undefined ? t("The newest version could not be checked.")
  : upToDate ? t("The latest version.") : t("Version {v} is out.", { v: latest });

async function about(main) {
  let path, bundled, version, git, problem;
  try {
    [{ path, bundled }, { version }, git] = await Promise.all([call("cli_status"),
      gitfolio("version").then((v) => ({ version: v.release || v.version })), gitfolio("git")]);
  } catch (e) {
    problem = e; // one installed on its own, too old (cliTooOld): the app can still be removed
  }
  const app = await window.__TAURI__.app.getVersion();
  // GitFolio updates itself, as when it offers to (lib.rs), its download's progress at the foot; then it starts again.
  const checkApp = async () => {
    const { latest } = await call("app_update");
    return { text: [newest(!latest, latest)], update: latest && (async () => {
      try {
        await call("update_app", { text: t("Downloading GitFolio {v}…", { v: latest }) });
      } finally {
        progress();
      }
      return [];
    }) };
  };
  // A bundled GitFolio CLI comes with the app; one installed on its own is updated as the setup does.
  const checkCli = async () => {
    if (bundled) return { text: [t("It comes with GitFolio, and is updated with it.")] };
    const v = await gitfolio("version", "--latest");
    return { text: [newest(v.upToDate, v.latest)], update: v.upToDate === false && (async () => {
      progress(t("Updating the GitFolio CLI installed on this computer… With Homebrew this can take a minute or two."));
      try {
        const r = JSON.parse(await call("update_cli"));
        return [el("p", "", el("span", "ok", "✓ "), t("The GitFolio CLI installed on this computer was updated from {from} to {to}.", r))];
      } finally {
        progress();
      }
    }) };
  };
  // git is updated where it came from, by gitfolio git update (0.7.0 on): before it, the arrow would only
  // say again the words for how, already shown.
  const gitUpdates = !/^0\.[0-6]\./.test(version ?? "");
  const checkGit = async () => {
    const g = await gitfolio("git", "--latest");
    return { text: [newest(g.upToDate, g.latest), g.updateHint ? ` ${g.updateHint}` : ""], update: g.upToDate === false && gitUpdates && (async () => {
      progress(t("Updating git…"));
      try {
        const r = await gitfolio("git", "update");
        // Apple's git: macOS's own updates opened, where the user goes on; none to run (manual), or nothing newer (winget): its words.
        const opened = { softwareUpdate: "Software Update opened: install what it offers, then check again.", appStore: "The App Store opened: update Xcode there, then check again." }[r.how];
        if (opened) return [el("p", "", t(opened))];
        if (!r.started) return [el("p", "", r.message ?? ""), r.url ? el("div", "row", button(t("Open the download page"), () => call("open_url", { url: r.url }))) : ""];
        return [el("p", "", el("span", "ok", "✓ "), t("git is now {v}.", { v: (await gitfolio("git")).version }))];
      } finally {
        progress();
      }
    }) };
  };
  // The app removes itself on macOS; elsewhere the system does (the installer, the package manager),
  // after GitFolio cleaned up here.
  const mac = navigator.userAgent.includes("Mac");
  const elsewhere = mac ? "" : el("p", "", t(navigator.userAgent.includes("Windows")
    ? "Then remove the app itself in Settings › Apps › Installed apps." : "Then remove the app itself with your package manager."));
  const purge = checkbox(), result = el("section", "");
  async function uninstall() {
    try {
      const r = JSON.parse(await call("uninstall", { purge: purge.checked }));
      result.replaceChildren(el("p", "", t(mac ? "GitFolio was removed." : "GitFolio's hooks, daily sync and sign-in were removed.")), elsewhere,
        drawFailures((r.repositories ?? []).filter((x) => x.error).map((x) => ({ name: x.path, error: x.error }))),
        el("div", "row", button(t("Quit"), () => call("quit"))));
    } catch (e) {
      result.replaceChildren(el("p", "", ...drawError(e)));
    }
  }
  main.replaceChildren(
    el("h1", "", t("About")),
    el("h2", "", t("Versions")),
    versionRow("GitFolio", `GitFolio ${app}`, "", checkApp),
    problem ? el("p", "", ...drawError(problem))
      : versionRow("GitFolio CLI", `GitFolio CLI ${version}`, `${path} · ${t(bundled ? "bundled with GitFolio" : "installed on its own")}`, checkCli),
    !git ? "" : git.found ? versionRow("git", `git ${git.version}`, git.path, checkGit) : el("p", "dim", t("git was not found on this computer.")),
    el("h2", "", t("License")),
    el("p", "", "© 2026 Alineteam Inc. · ", link("aline.team", "https://aline.team")),
    el("p", "dim", link("Apache License 2.0", "https://github.com/Alineteam-Inc/GitFolio-APP/blob/main/LICENSE"), " · ",
      t("The names GitFolio and aline.team, their logos and the developer type icons are not part of the license.")),
    el("p", "dim", t("Tech icons from Devicon (MIT).")),
    el("h2", "", t("Uninstall")),
    el("p", "", t(bundled
      ? mac ? "Removes the git hooks GitFolio added (putting back the ones that were there before), its daily sync and this device's sign-in, then the app."
        : "Removes the git hooks GitFolio added (putting back the ones that were there before), its daily sync and this device's sign-in."
      : mac ? "Removes the app. The GitFolio CLI installed on its own stays, with its hooks and settings." : "The GitFolio CLI installed on its own stays, with its hooks and settings.")),
    bundled ? "" : elsewhere,
    el("p", "dim", t("Your data on aline.team stays.")),
    bundled ? label(purge, t("Also delete the commits collected on this computer")) : "",
    result,
    bundled || mac ? el("div", "actions", button(t("Uninstall GitFolio"), uninstall)) : "");
}

// The first-time setup, as an installer goes: the welcome and the data policy, what GitFolio needs,
// the login, the repositories, then the end: the first sync, and what was set up. The rest is as init has it when Enter is pressed
// (automatic sync, no dependencies, no daily sync), changed later in its section, never asked here.
// A step answering null is skipped; one done by itself goes on with skip(), so Back passes it by too.
async function setup(main) {
  let updated = false, syncing; // the GitFolio CLI brought up to date once; the first sync while it runs
  const steps = [
    async (next) => {
      // The policy, or why it could not be read: the welcome goes on, the next step says what to do.
      const text = await gitfolio("init", "--policy").then(({ policy }) => el("p", "pre", policy.trim()), (e) => el("p", "", ...drawError(e)));
      return [el("h1", "", t("Welcome to GitFolio")), el("div", "scroll tall", text), el("div", "actions", button(t("Continue"), next))];
    },
    // GitFolio's two needs, in the order they are installed: git, then gitfolio for git hooks, linked
    // for them by itself. Both there, the step is skipped; only git, the system's own install, waits for
    // the user: its button at the page's foot, Check again on its left.
    async (next, skip) => {
      const box = el("div", ""), bar = el("div", "actions"), msg = el("div", "");
      // gitfolio starts git's own installer (macOS, Windows with winget), or says how (manual).
      const installGit = async () => {
        const r = await gitfolio("git", "install");
        if (r.how === "manual") {
          return msg.replaceChildren(el("p", "", r.message ?? ""),
            r.url ? el("div", "row", button(t("Open the download page"), () => call("open_url", { url: r.url }))) : "");
        }
        if (r.how === "xcodeSelect") return msg.replaceChildren(el("p", "", t("Follow the installer that opened, then check again.")));
        await again(); // winget is done, or git was there already
      };
      // A GitFolio CLI installed on its own, which git hooks run, is first brought to the newest release, once
      // in a setup: GitFolio needs one new enough, and a computer should have one version.
      async function update() {
        updated = true;
        box.replaceChildren(msg);
        progress(t("Updating the GitFolio CLI installed on this computer… With Homebrew this can take a minute or two."));
        try {
          const r = JSON.parse(await call("update_cli"));
          msg.replaceChildren(r?.updated ? el("p", "", el("span", "ok", "✓ "), t("The GitFolio CLI installed on this computer was updated from {from} to {to}.", r)) : "");
        } catch (e) {
          msg.replaceChildren(el("p", "", ...drawError(e)));
        } finally {
          progress();
        }
      }
      // Whether both are there and the update said nothing; if not, what is missing or what it said, drawn.
      async function check() {
        if (!updated) await update();
        else msg.replaceChildren();
        try {
          const git = await gitfolio("git");
          let cli = await call("cli_status");
          if (git.found && !cli.installed) {
            await call("install_cli");
            cli = await call("cli_status");
          }
          if (git.found && cli.installed && !msg.textContent) return true;
          const ver = await gitfolio("version");
          const need = (n, name, what, ok, todo) => el("section", "",
            el("h2", "", `${n}. ${name}`), el("p", "", el("span", ok ? "ok" : "error", ok ? "✓ " : "✗ "), what), ok ? "" : todo);
          box.replaceChildren(
            el("p", "", t("GitFolio needs two things on this computer, installed in this order.")),
            need(1, git.found ? `git ${git.version}` : "git", t("Reads your commits."), git.found, el("p", "dim", t("git was not found on this computer."))),
            need(2, `GitFolio CLI ${ver.release || ver.version}`, t(cli.bundled
              ? "Collects your commits in the background when you push, through git hooks. It comes with GitFolio."
              : "Collects your commits in the background when you push, through git hooks. The one installed on this computer is used."),
            cli.installed, git.found ? "" : el("p", "dim", t("Install git first."))),
            msg);
          bar.replaceChildren(button(t("Check again"), again), !git.found ? button(t("Install git"), () => act(msg, installGit))
            : cli.installed ? button(t("Continue"), skip) : ""); // skip: on the way back, this step says nothing again
        } catch (e) {
          box.replaceChildren(el("p", "", ...drawError(e)), msg);
          bar.replaceChildren(button(t("Check again"), again));
        }
        return false;
      }
      const again = async () => (await check()) && skip();
      return (await check()) ? null : [el("h1", "", t("Before you start")), box, bar];
    },
    async (next) => ((await gitfolio("whoami")).loggedIn ? null : [el("h1", "", t("Log in or sign up")), loginForm(next)]),
    async (next) => [el("h1", "", t("Choose the repositories to collect")), finder(next)],
    // The end, always: the first sync, by itself as init does (none in local mode or with nothing to send),
    // its progress at the foot and then what it sent; what was set up without asking, and that each is the
    // user's to turn on or off. Done once the sync is.
    async (next) => {
      const [s, cfg] = await Promise.all([gitfolio("status"), gitfolio("config")]);
      const result = el("div", ""), bar = el("div", "actions");
      const done = () => bar.append(button(t("Done"), next));
      if (s.syncMode === "local" || !s.unsent) done();
      else {
        const run = (syncing ??= gitfolio("sync").finally(() => (syncing = null))); // one at a time: back here, the same one
        result.append(el("p", "dim", "…"));
        fill(result, async () => drawSync(await run)).then(done);
      }
      const settings = [
        ["Sync", cfg.autoSyncOff ? t("Local") : `${t("Automatic")} · ${t("Sent to aline.team right after each git push.")}`],
        ["Dependencies", t(cfg.deps ? "on" : "off")],
        ["Daily sync", cfg.schedule ? t("Every day at {time}, for pushes the hooks missed.", { time: cfg.schedule }) : t("off")],
      ];
      return [el("h1", "", t("GitFolio is set up")), result,
        el("h2", "", t("Settings")),
        el("div", "facts", ...settings.flatMap(([k, v]) => [el("span", "dim", t(k)), el("span", "", v)])),
        el("p", "dim", t("What your portfolio collects is up to you: turn each of these on or off at any time in Sync and Dependencies.")),
        bar];
    },
  ];
  let i = 0, shows = 0;
  const shown = []; // the steps shown before this one, for Back: skipped ones are not gone back to
  const skip = () => (++i < steps.length ? show() : go("overview"));
  const next = () => (shown.push(i), skip());
  const back = () => ((i = shown.pop()), show());
  // A step goes on (next, skip) and is drawn only while it is the one being shown: not after Back, nor
  // a second time, as when Check again and Install git both finish, nor once another section is open.
  async function show() {
    const at = ++shows, live = () => at === shows && current === "setup", mine = (f) => () => live() && f();
    try {
      const parts = await steps[i](mine(next), mine(skip));
      if (!live()) return;
      if (parts === null) return skip();
      // The foot: Back always at its left, the step's own buttons (its last part when it has them) at its right.
      const own = parts.at(-1)?.className === "actions" ? parts.pop() : el("span", "");
      const foot = el("div", "actions foot", shown.length ? button(t("Back"), back) : el("span", ""), own);
      main.replaceChildren(el("p", "dim", t("Setup · step {i} of {n}", { i: i + 1, n: steps.length })), ...parts, foot);
    } catch (e) {
      if (live()) main.replaceChildren(el("p", "", ...drawError(e)), el("div", "row", button(t("Try again"), show)));
    }
  }
  await show();
}

const SECTIONS = { overview, general, account, sync, dependencies, privacy, profile, policy, about };
const LABELS = { policy: "Data policy" }; // the menu's words where they are not the section's name
const goTo = (section) => go(section); // where an error is solved (app.js)

let current;
function go(name) {
  current = name;
  const draw = SECTIONS[name] ?? setup;
  document.body.classList.toggle("setup", draw === setup); // the setup alone, as an installer, no menu
  for (const b of $("nav").querySelectorAll("button")) b.className = b.dataset.section === name ? "on" : "";
  const main = $("main");
  main.replaceChildren(el("p", "dim", "…"));
  draw(main).catch((e) => main.replaceChildren(el("p", "", ...drawError(e))));
}

function drawNav() {
  $("nav").replaceChildren(...Object.keys(SECTIONS).map((name) => {
    const b = button(t(LABELS[name] ?? title(name)), () => go(name));
    b.dataset.section = name;
    return b;
  }));
}
ready().then(() => {
  drawNav();
  window.__TAURI__.event.listen("section", ({ payload }) => go(payload)); // from the tray (lib.rs)
  // The language set in General: the words again, where the user is.
  window.__TAURI__.event.listen("language", () => ready().then(() => (drawNav(), go(current))));
  go(window.initialSection ?? "overview");
});
