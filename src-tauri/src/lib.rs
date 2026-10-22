use std::{
    fs,
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
use tauri_plugin_positioner::{Position, WindowExt};

// Under the tray icon: the menu bar is at the top on macOS, the taskbar at the bottom elsewhere.
#[cfg(target_os = "macos")]
const NEAR_TRAY: Position = Position::TrayCenter;
#[cfg(not(target_os = "macos"))]
const NEAR_TRAY: Position = Position::TrayBottomCenter;

const CLI_NAME: &str = if cfg!(windows) { "gitfolio.exe" } else { "gitfolio" };

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
    let out = Command::new(cli).args(["version", "--json"]).output().ok()?;
    let v: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
    Some((v["version"].as_str()?.to_string(), v["bundled"].as_bool()?))
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
        v => Err(format!(
            "The gitfolio installed on this computer ({}) is {}, and GitFolio needs {} or newer. Update it from where it was installed (Homebrew, or the install script), or uninstall it so GitFolio uses its own.",
            found.display(),
            v.map_or("older than 0.6.0".to_string(), |(v, _)| v),
            MIN_CLI.map(|n| n.to_string()).join(".")
        )),
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
    let mut child = Command::new(cli)
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
            "history", "email", "schedule", "version",
        ]
        .contains(&c),
        None => false,
    }
}

/// Runs a gitfolio command for a window (see run_cli), its progress shown there.
#[tauri::command]
async fn gitfolio(webview: Webview, args: Vec<String>) -> Result<String, String> {
    if !allowed(&args) {
        return Err(format!("GitFolio does not run gitfolio {}", args.join(" ")));
    }
    // A development build is started with a test HOME and a test server (GITFOLIO_API_URL, which its
    // gitfolio, built from source, takes): it logs in to that server only, never to aline.team itself,
    // and adds only repositories in that HOME, as the hooks it installs go into the repository, where the
    // gitfolio in real use may have its own.
    if cfg!(debug_assertions) {
        if args[0] == "login" && std::env::var_os("GITFOLIO_API_URL").is_none() {
            return Err("This development build has no test server to log in to.".into());
        }
        // Both as they really are: on macOS a temporary folder's /var is /private/var.
        let real = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
        let home = real(&std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default());
        if args[0] == "add" && !args.get(1).is_some_and(|p| real(Path::new(p)).starts_with(&home)) {
            return Err("This development build adds only repositories in its test folder.".into());
        }
    }
    let cli = cli()?.0;
    let progress = Some((webview.app_handle().clone(), webview.label().to_string()));
    run_cli(&cli, &args.iter().map(String::as_str).collect::<Vec<_>>(), progress)
}

/// The gitfolio in use and whether it is the bundled one (see find_cli), or why none can be.
#[tauri::command]
fn cli_info() -> Result<(PathBuf, bool), String> {
    cli()
}

/// Saves what `gitfolio export` prints as gitfolio-export-<date>.json in the Downloads folder, and
/// says where. The date is the window's (YYYY-MM-DD), as the app keeps no calendar of its own.
// ponytail: always Downloads; a save dialog (tauri-plugin-dialog, a new dependency) when the user should choose.
#[tauri::command]
async fn export(date: String) -> Result<PathBuf, String> {
    if !date.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return Err(format!("not a date: {date}"));
    }
    let json = run_cli(&cli()?.0, &["export"], None)?;
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).ok_or("no home folder")?;
    let path = PathBuf::from(home).join("Downloads").join(format!("gitfolio-export-{date}.json"));
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path)
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
        .setup(|app| {
            // A menu bar app: no Dock icon.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // A release whose bundled gitfolio is the one in use links it for git hooks to find. Errors
            // are let go: a scan or the daily sync still collects what the hooks miss meanwhile.
            #[cfg(unix)]
            if let (false, Ok((cli, true)), Some(at)) = (cfg!(debug_assertions), cli(), link_path()) {
                let _ = link(&cli, &at);
            }

            glass(WebviewWindowBuilder::from_config(app, &window_config(app.handle(), "main"))?).build()?;

            // Linux sends no tray click events, so the menu is the way to the windows there.
            let open = MenuItem::with_id(app, "open", "Open GitFolio", true, None::<&str>)?;
            let uninstall = MenuItem::with_id(app, "uninstall", "Uninstall GitFolio…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GitFolio")
                .menu(&Menu::with_items(app, &[&open, &uninstall, &quit])?)
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
        .invoke_handler(tauri::generate_handler![gitfolio, cli_info, export, open, uninstall, quit])
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
