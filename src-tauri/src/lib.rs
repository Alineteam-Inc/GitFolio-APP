use std::{
    fs,
    sync::Mutex,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Command, Stdio},
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::WindowConfig,
    AppHandle, Emitter, Manager, Runtime, Webview, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_positioner::{Position, WindowExt};

// Under the tray icon: the menu bar is at the top on macOS, the taskbar at the bottom elsewhere.
#[cfg(target_os = "macos")]
const NEAR_TRAY: Position = Position::TrayCenter;
#[cfg(not(target_os = "macos"))]
const NEAR_TRAY: Position = Position::TrayBottomCenter;

const CLI_NAME: &str = if cfg!(windows) { "gitfolio.exe" } else { "gitfolio" };

/// The app's language as the user set it in General: "" to follow the device, else ko, en or ja.
static LANG: Mutex<String> = Mutex::new(String::new());

/// A gitfolio run, in the app's language when the user set one (GITFOLIO_LANG, which gitfolio takes
/// before the device's): gitfolio works the language out, so the app's words and its own match.
fn gitfolio_cmd(cli: &Path) -> Command {
    let mut cmd = Command::new(cli);
    let lang = LANG.lock().unwrap().clone();
    if !lang.is_empty() {
        cmd.env("GITFOLIO_LANG", lang);
    }
    cmd
}

/// The oldest gitfolio this app works with: the one with --json, version --json and uninstall.
const MIN_CLI: [u32; 3] = [0, 6, 0];

/// The gitfolio bundled with the app (bundle.externalBin), next to this executable.
fn bundled() -> Result<PathBuf, String> {
    Ok(std::env::current_exe().map_err(|e| e.to_string())?.with_file_name(CLI_NAME))
}

/// The folders git hooks look in for gitfolio, in their order: PATH, then the CLI's hookFind list.
fn hook_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
    if let (true, Some(home)) = (cfg!(unix), std::env::var_os("HOME").map(PathBuf::from)) {
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin"].map(PathBuf::from));
        dirs.extend([".local/bin", "go/bin"].map(|d| home.join(d)));
    }
    dirs
}

/// What `gitfolio version --json` says: its version and whether an app bundles it. None from a
/// gitfolio older than 0.6.0, which has no --json.
fn version_of(cli: &Path) -> Option<(String, bool)> {
    let out = gitfolio_cmd(cli).args(["version", "--json"]).output().ok()?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    Some((v["version"].as_str()?.to_string(), v["bundled"].as_bool()?))
}

/// The screen language gitfolio works out from the device (version --json "lang": en, ko or ja).
fn lang_of(cli: &Path) -> String {
    let out = gitfolio_cmd(cli).args(["version", "--json"]).output().ok();
    let v: Option<serde_json::Value> = out.and_then(|o| serde_json::from_slice(&o.stdout).ok());
    v.and_then(|v| v["lang"].as_str().map(str::to_string)).unwrap_or_else(|| "en".into())
}

/// The tray menu's words: open, uninstall, quit.
fn menu_words(lang: &str) -> [&'static str; 3] {
    match lang {
        "ko" => ["GitFolio 열기", "GitFolio 제거…", "종료"],
        "ja" => ["GitFolioを開く", "GitFolioをアンインストール…", "終了"],
        _ => ["Open GitFolio", "Uninstall GitFolio…", "Quit"],
    }
}

/// The tray menu, in gitfolio's language: Linux sends no tray click events, so it is the way to the
/// windows there.
fn tray_menu<R: Runtime, M: Manager<R>>(app: &M) -> tauri::Result<Menu<R>> {
    let [open, uninstall, quit] = menu_words(&cli().map(|(cli, _)| lang_of(&cli)).unwrap_or_default());
    let open = MenuItem::with_id(app, "open", open, true, None::<&str>)?;
    let uninstall = MenuItem::with_id(app, "uninstall", uninstall, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", quit, true, None::<&str>)?;
    Menu::with_items(app, &[&open, &uninstall, &quit])
}

/// "dev" (a build from source) or at least MIN_CLI.
fn new_enough(version: &str) -> bool {
    version == "dev" || version.split('.').map(|n| n.parse::<u32>().unwrap_or(0)).cmp(MIN_CLI).is_ge()
}

fn same(a: &Path, b: &Path) -> bool {
    matches!((a.canonicalize(), b.canonicalize()), (Ok(a), Ok(b)) if a == b)
}

/// The gitfolio to run, and whether it is the bundled one `own`: the one git hooks find first in
/// `dirs`, as they run that one too and a computer should have one version. None found, the app's
/// own link, or another copy of the app's (moved, or a second one) means the bundled one. One
/// installed on its own (Homebrew, install.sh) is used when new enough, else it has to be updated.
fn find_cli(own: &Path, dirs: &[PathBuf]) -> Result<(PathBuf, bool), String> {
    let Some(found) = dirs.iter().map(|d| d.join(CLI_NAME)).find(|p| p.is_file()) else {
        return Ok((own.to_path_buf(), true));
    };
    if same(&found, own) {
        return Ok((own.to_path_buf(), true));
    }
    match version_of(&found) {
        Some((_, true)) => Ok((own.to_path_buf(), true)),
        Some((v, false)) if new_enough(&v) => Ok((found, false)),
        // As gitfolio's errors are, with a code (cliTooOld) the windows say in their own words.
        v => Err(serde_json::json!({"error": {"code": "cliTooOld", "message": format!(
            "The gitfolio installed on this computer ({}) is {}, and GitFolio needs {} or newer. Update it from where it was installed (Homebrew, or the install script), or uninstall it so GitFolio uses its own.",
            found.display(),
            v.map_or("older than 0.6.0".to_string(), |(v, _)| v),
            MIN_CLI.map(|n| n.to_string()).join(".")
        )}})
        .to_string()),
    }
}

/// The gitfolio to run (see find_cli). A development build always runs the bundled one, built from
/// source by scripts/build-cli.sh, whatever is installed.
fn cli() -> Result<(PathBuf, bool), String> {
    let own = bundled()?;
    if cfg!(debug_assertions) {
        return Ok((own, true));
    }
    find_cli(&own, &hook_dirs())
}

/// Where the bundled gitfolio is linked for git hooks to find it: ~/.local/bin, in their list and
/// needing no admin.
// ponytail: macOS; Linux .deb has it in /usr/bin already, an AppImage needs a copy (its files go with
// it on quit), and Windows needs its folder on PATH: with their packaging.
#[cfg(unix)]
fn link_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/bin").join(CLI_NAME))
}

/// Links `own` at `at`, never over a gitfolio of its own: only a link to nothing (the app was moved or
/// deleted) or to another copy of the app's is replaced.
#[cfg(unix)]
fn link(own: &Path, at: &Path) -> std::io::Result<()> {
    if let Ok(m) = fs::symlink_metadata(at) {
        let another_app = || version_of(at).is_some_and(|(_, bundled)| bundled);
        if !m.file_type().is_symlink() || same(at, own) || (at.exists() && !another_app()) {
            return Ok(());
        }
        fs::remove_file(at)?;
    }
    if let Some(dir) = at.parent() {
        fs::create_dir_all(dir)?;
    }
    std::os::unix::fs::symlink(own, at)
}

/// Removes the link at `at` when it is to `own`.
#[cfg(unix)]
fn unlink(own: &Path, at: &Path) -> std::io::Result<()> {
    if fs::symlink_metadata(at).is_ok_and(|m| m.file_type().is_symlink()) && same(at, own) {
        fs::remove_file(at)?;
    }
    Ok(())
}

/// Where gitfolio's progress goes: the window that asked, as "progress" events.
type Progress = Option<(AppHandle, String)>;

/// Runs gitfolio with --json: its JSON on success, its JSON error (or a message from one that could not
/// run) on failure. Its stdin is closed, so it asks nothing and, without a login, answers loginFirst.
/// Of what goes to stderr, the progress lines ({"progress": ...}) go to `progress`; the lines for
/// people only make the error when stdout has none.
fn run_cli(cli: &Path, args: &[&str], progress: Progress) -> Result<String, String> {
    let mut child = gitfolio_cmd(cli)
        .args(args)
        .arg("--json")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    // stderr is read on its own thread while stdout is read here, so neither pipe fills up and stops gitfolio.
    let stderr = child.stderr.take().expect("piped");
    let reader = std::thread::spawn(move || {
        let mut rest = String::new();
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            match &progress {
                Some((app, window)) if line.starts_with(r#"{"progress""#) => {
                    let _ = app.emit_to(window.as_str(), "progress", line);
                }
                _ => rest += &(line + "\n"),
            }
        }
        rest
    });
    let mut stdout = String::new();
    child.stdout.take().expect("piped").read_to_string(&mut stdout).map_err(|e| e.to_string())?;
    let ok = child.wait().map_err(|e| e.to_string())?.success();
    let stderr = reader.join().unwrap_or_default();
    match (ok, stdout.trim().is_empty()) {
        (true, _) => Ok(stdout),
        (false, true) => Err(stderr),
        (false, false) => Err(stdout),
    }
}

/// Whether a window may run this gitfolio command: not hook, mcp, update (the app updates its copy)
/// or uninstall (see uninstall), and init and login only as their steps without questions.
fn allowed(args: &[String]) -> bool {
    let has = |flag: &str| args.iter().any(|a| a == flag);
    match args.first().map(String::as_str) {
        Some("init") => has("--policy") || has("--scan"),
        Some("login") => has("--email"),
        Some(c) => [
            "logout", "whoami", "add", "remove", "scan", "sync", "status", "stats", "stack", "export", "deps", "config",
            "history", "email", "schedule", "version", "git",
        ]
        .contains(&c),
        None => false,
    }
}

/// Whether a path is in the HOME a development build is started with (a test one), both as they really
/// are: on macOS a temporary folder's /var is /private/var.
fn in_test_home(p: &Path) -> bool {
    let real = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    real(p).starts_with(real(&std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default()))
}

/// Runs a gitfolio command for a window (see run_cli), its progress shown there.
#[tauri::command]
async fn gitfolio(webview: Webview, args: Vec<String>) -> Result<String, String> {
    if !allowed(&args) {
        return Err(format!("GitFolio does not run gitfolio {}", args.join(" ")));
    }
    // A development build is started with a test HOME and a test server (GITFOLIO_API_URL, which its
    // gitfolio, built from source, takes): it logs in to that server only, never to aline.team itself.
    // It may add any repository, to be tried as it is, but removes hooks only from ones in that HOME: the
    // hooks are in the repository, and the gitfolio in real use relies on them in the others.
    if cfg!(debug_assertions) {
        if args[0] == "login" && std::env::var_os("GITFOLIO_API_URL").is_none() {
            return Err("This development build has no test server to log in to.".into());
        }
        if args[0] == "remove" && !args.get(1).is_some_and(|p| in_test_home(Path::new(p))) {
            return Err("This development build removes only repositories in its test folder: the gitfolio in real use relies on the others' hooks.".into());
        }
    }
    let cli = cli()?.0;
    let progress = Some((webview.app_handle().clone(), webview.label().to_string()));
    run_cli(&cli, &args.iter().map(String::as_str).collect::<Vec<_>>(), progress)
}

/// Whether the bundled gitfolio may be linked: by a release, or by a development build started with a
/// temporary HOME (a test one), never over the gitfolio in real use.
#[cfg(unix)]
fn may_link() -> bool {
    let real = |p: PathBuf| p.canonicalize().unwrap_or(p);
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
    !cfg!(debug_assertions) || real(home).starts_with(real(std::env::temp_dir()))
}

/// The gitfolio in use (see find_cli), for the windows: its path, whether it is the bundled one, and
/// whether git hooks find it, which the bundled one does once installed (see install_cli).
#[tauri::command]
fn cli_status() -> Result<serde_json::Value, String> {
    let (path, bundled) = cli()?;
    #[cfg(unix)]
    let installed = !bundled || link_path().is_some_and(|at| same(&at, &path));
    // ponytail: Windows puts the CLI's folder on PATH with its installer, to come with its packaging.
    #[cfg(not(unix))]
    let installed = true;
    Ok(serde_json::json!({"path": path, "bundled": bundled, "installed": installed}))
}

/// Installs the bundled gitfolio for git hooks to find, as the user agreed in the setup: links it (see link).
#[tauri::command]
fn install_cli() -> Result<(), String> {
    #[cfg(unix)]
    {
        if !may_link() {
            return Err("This development build installs gitfolio only in its test folder.".into());
        }
        if let (Ok((own, true)), Some(at)) = (cli(), link_path()) {
            link(&own, &at).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Opens a web page in the browser: an https address only, as the git download page gitfolio names.
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err(format!("not a web page: {url}"));
    }
    #[cfg(target_os = "macos")]
    let mut open = Command::new("open");
    #[cfg(windows)]
    let mut open = Command::new("rundll32"); // the shell's own opener, with no command line to quote
    #[cfg(windows)]
    open.arg("url.dll,FileProtocolHandler");
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut open = Command::new("xdg-open");
    open.arg(&url).spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// A folder the user picks in the system's own window (Finder, File Explorer), or none.
#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<PathBuf> {
    app.dialog().file().blocking_pick_folder().and_then(|p| p.into_path().ok())
}

/// Saves what `gitfolio export` prints where the user picks in the system's own window, named
/// gitfolio-export-<date>.json to start with (the date is the window's, YYYY-MM-DD, as the app keeps no
/// calendar of its own); says where, or none when the user cancels.
#[tauri::command]
async fn export(app: AppHandle, date: String) -> Result<Option<PathBuf>, String> {
    if !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(format!("not a date: {date}"));
    }
    let picked = app.dialog().file().set_file_name(format!("gitfolio-export-{date}.json")).add_filter("JSON", &["json"]).blocking_save_file();
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    fs::write(&path, run_cli(&cli()?.0, &["export"], None)?).map_err(|e| e.to_string())?;
    Ok(Some(path))
}

/// Removes GitFolio. With the bundled gitfolio, `gitfolio uninstall` first (its hooks, the daily sync,
/// this device's sign-in, and with purge the data on this computer; never aline.team's) and its link.
/// A gitfolio installed on its own (Homebrew, install.sh) stays as it is, with its settings. Then the
/// app, when it runs from one: a development build runs from target/ and stays.
// ponytail: removes the app itself on macOS only; Windows and Linux packages have their own uninstallers.
#[tauri::command]
async fn uninstall(purge: bool) -> Result<String, String> {
    let mut done = "{}".to_string();
    if let Ok((cli, true)) = cli() {
        // A development build may have added repositories outside its test folder (see gitfolio): their
        // hooks stay, for the gitfolio in real use.
        if cfg!(debug_assertions) {
            let status: serde_json::Value = serde_json::from_str(&run_cli(&cli, &["status"], None)?).map_err(|e| e.to_string())?;
            let paths = status["repositories"].as_array().cloned().unwrap_or_default();
            if paths.iter().any(|r| !in_test_home(Path::new(r["path"].as_str().unwrap_or("")))) {
                return Err("This development build does not uninstall with repositories outside its test folder: the gitfolio in real use relies on their hooks. Remove those first.".into());
            }
        }
        done = run_cli(&cli, if purge { &["uninstall", "--purge-local"] } else { &["uninstall"] }, None)?;
        #[cfg(unix)]
        if let Some(at) = link_path() {
            unlink(&cli, &at).map_err(|e| e.to_string())?;
        }
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    // <name>.app/Contents/MacOS/<exe>
    let app = exe.parent().and_then(Path::parent).and_then(Path::parent).filter(|p| p.extension().is_some_and(|e| e == "app"));
    if let Some(app) = app {
        fs::remove_dir_all(app).map_err(|e| e.to_string())?;
    }
    Ok(done)
}

/// The app's language as set in General ("" follows the device).
#[tauri::command]
fn language() -> String {
    LANG.lock().unwrap().clone()
}

/// Sets the app's language (General; "" follows the device): kept in the app's config folder, given to
/// every gitfolio run from now on, the tray menu remade in it and the windows told to redraw.
#[tauri::command]
fn set_language(app: AppHandle, lang: String) -> Result<(), String> {
    if !["", "ko", "en", "ja"].contains(&lang.as_str()) {
        return Err(format!("not a language of GitFolio: {lang}"));
    }
    let file = app.path().app_config_dir().map_err(|e| e.to_string())?.join("language");
    if lang.is_empty() {
        let _ = fs::remove_file(&file);
    } else {
        fs::create_dir_all(file.parent().unwrap_or(&file)).and_then(|_| fs::write(&file, &lang)).map_err(|e| e.to_string())?;
    }
    *LANG.lock().unwrap() = lang;
    if let Some(tray) = app.tray_by_id("tray") {
        tray.set_menu(Some(tray_menu(&app).map_err(|e| e.to_string())?)).map_err(|e| e.to_string())?;
    }
    app.emit("language", ()).map_err(|e| e.to_string())
}

/// Whether the app starts with the computer (General).
#[tauri::command]
fn autostart(app: AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) -> Result<(), String> {
    let launch = app.autolaunch();
    if on { launch.enable() } else { launch.disable() }.map_err(|e| e.to_string())
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn show(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.move_window_constrained(NEAR_TRAY); // fails on Linux (no tray position): the window opens where it was
        let _ = win.show();
        let _ = win.set_focus();
    }
}

/// The window `label` of tauri.conf.json.
fn window_config(app: &AppHandle, label: &str) -> WindowConfig {
    app.config().app.windows.iter().find(|w| w.label == label).cloned().expect("a window of tauri.conf.json")
}

/// Glass on macOS like its menu bar menus: Liquid Glass on macOS 26+, the popover material before.
/// Elsewhere windows stay opaque, as there is no glass to show.
fn glass<'a, R: Runtime, M: Manager<R>>(win: WebviewWindowBuilder<'a, R, M>) -> WebviewWindowBuilder<'a, R, M> {
    #[cfg(target_os = "macos")]
    let win = {
        use tauri::window::{Effect, EffectsBuilder};
        win.transparent(true)
            .effects(EffectsBuilder::new().effects([Effect::LiquidGlassRegular, Effect::Popover]).radius(16.0).build())
    };
    win
}

/// Opens the GitFolio window at a section of manage.html, or brings it forward there. On macOS the app
/// is in the Dock while it is open, as a window to work in. It is an ordinary opaque window, no glass:
/// a window to read and fill in.
fn open_manage(app: &AppHandle, section: &str) -> tauri::Result<()> {
    let section = if section.chars().all(|c| c.is_ascii_alphanumeric()) { section } else { "overview" };
    if let Some(win) = app.get_webview_window("manage") {
        app.emit_to("manage", "section", section)?;
        win.unminimize()?;
        win.show()?;
        return win.set_focus();
    }
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Regular)?;
    let win = WebviewWindowBuilder::from_config(app, &window_config(app, "manage"))?
        .initialization_script(format!("window.initialSection = {section:?};"));
    win.build()?.set_focus()
}

#[tauri::command]
fn open(app: AppHandle, section: String) -> Result<(), String> {
    open_manage(&app, &section).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        // A Launch Agent on macOS: a file in ~/Library/LaunchAgents, nothing asked of the system's login items.
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            // A menu bar app: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // The link installed in the setup (install_cli) is mended when the app moved: link replaces
            // only a link to nothing or to another copy of the app's. Errors are let go: a scan or the
            // daily sync still collects what the hooks miss meanwhile.
            #[cfg(unix)]
            if let (true, Ok((cli, true)), Some(at)) = (may_link(), cli(), link_path()) {
                if fs::symlink_metadata(&at).is_ok() {
                    let _ = link(&cli, &at);
                }
            }

            glass(WebviewWindowBuilder::from_config(app, &window_config(app.handle(), "main"))?).build()?;

            // Starting with the computer is on unless the user turns it off: turned on once, the first time
            // the app runs (a mark in its own config folder says it was), then as the user sets it (General).
            let mark = app.path().app_config_dir()?.join("autostart-set");
            if !mark.exists() {
                let _ = app.autolaunch().enable();
                let _ = fs::create_dir_all(mark.parent().unwrap_or(&mark)).and_then(|_| fs::write(&mark, ""));
            }

            // Until GitFolio is set up (and the first time), its setup opens by itself, as an installer
            // would: installing GitFolio goes on there. Off the main thread, as it asks gitfolio first.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let status = cli().and_then(|(cli, _)| run_cli(&cli, &["status"], None));
                let set_up = status.ok().and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()).is_some_and(|v| v["setUp"] == true);
                if !set_up {
                    let _ = open_manage(&handle, "setup");
                }
            });

            // The language set in General, kept in the app's config folder.
            *LANG.lock().unwrap() = fs::read_to_string(app.path().app_config_dir()?.join("language")).unwrap_or_default();

            TrayIconBuilder::with_id("tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GitFolio")
                .menu(&tray_menu(app)?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        let _ = open_manage(app, "overview");
                    }
                    "uninstall" => {
                        let _ = open_manage(app, "about");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Like a menu bar menu: clicking elsewhere closes the tray window.
            WindowEvent::Focused(false) if window.label() == "main" => {
                let _ = window.hide();
            }
            // Out of the Dock again, a menu bar app, once the GitFolio window is closed.
            #[cfg(target_os = "macos")]
            WindowEvent::Destroyed if window.label() == "manage" => {
                let _ = window.app_handle().set_activation_policy(tauri::ActivationPolicy::Accessory);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![gitfolio, cli_status, install_cli, open_url, pick_folder, export, open, language, set_language, autostart, set_autostart, uninstall, quit])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};

    // A gitfolio that prints what is given, as `version --json` would.
    fn fake(dir: &Path, out: &str) -> PathBuf {
        fs::create_dir_all(dir).unwrap();
        let p = dir.join(CLI_NAME);
        fs::write(&p, format!("#!/bin/sh\necho '{out}'\n")).unwrap();
        fs::set_permissions(&p, fs::Permissions::from_mode(0o755)).unwrap();
        p
    }

    #[test]
    fn versions() {
        assert!(["0.6.0", "0.6.1", "0.10.0", "1.0.0", "dev"].iter().all(|v| new_enough(v)));
        assert!(!["0.5.0", "0.5.9", "0.0.1"].iter().any(|v| new_enough(v)));
    }

    #[test]
    fn finds_links_and_unlinks() {
        let tmp = std::env::temp_dir().join(format!("gitfolio-gui-test-{}", std::process::id()));
        let own = fake(&tmp.join("app"), r#"{"version":"dev","bundled":true}"#);
        let (brew, local) = (tmp.join("brew"), tmp.join("local"));
        let dirs = [brew.clone(), local.clone()];
        let at = local.join(CLI_NAME);

        // None installed: the bundled one, linked where hooks look and found there after.
        assert_eq!(find_cli(&own, &dirs).unwrap(), (own.clone(), true));
        link(&own, &at).unwrap();
        assert!(same(&at, &own));
        assert_eq!(find_cli(&own, &dirs).unwrap(), (own.clone(), true));
        unlink(&own, &at).unwrap();
        assert!(fs::symlink_metadata(&at).is_err());

        // A link to nothing (the app moved) or to another copy of the app's is replaced.
        symlink(tmp.join("gone/gitfolio"), &at).unwrap();
        link(&own, &at).unwrap();
        assert!(same(&at, &own));
        fs::remove_file(&at).unwrap();
        let other = fake(&tmp.join("other"), r#"{"version":"dev","bundled":true}"#);
        symlink(&other, &at).unwrap();
        assert_eq!(find_cli(&own, &dirs).unwrap(), (own.clone(), true));
        link(&own, &at).unwrap();
        assert!(same(&at, &own));
        fs::remove_file(&at).unwrap();

        // One installed on its own is never linked over or unlinked, and is used when new enough.
        let mine = fake(&local, r#"{"version":"0.6.2","bundled":false}"#);
        link(&own, &at).unwrap();
        unlink(&own, &at).unwrap();
        assert!(!fs::symlink_metadata(&at).unwrap().file_type().is_symlink());
        assert_eq!(find_cli(&own, &dirs).unwrap(), (mine.clone(), false));

        // First found wins, as in the hooks: an old one there must be updated, not passed over.
        fake(&brew, "GitFolio 0.5.0");
        let err = find_cli(&own, &dirs).unwrap_err();
        assert!(err.contains("older than 0.6.0") && err.contains("0.6.0 or newer"), "{err}");

        fs::remove_dir_all(&tmp).unwrap();
    }
}
