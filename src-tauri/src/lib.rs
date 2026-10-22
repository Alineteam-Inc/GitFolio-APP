use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindowBuilder, WindowEvent,
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
            "{} is gitfolio {}, and GitFolio needs {} or newer: update it the way it was installed (brew upgrade gitfolio, or install.sh).",
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

/// Runs gitfolio with --json: its JSON on success, its JSON error (or, from a CLI without --json, its
/// message) on failure. Progress and notices go to stderr and are left out. Its stdin is closed
/// (`output`), so it asks nothing and, without a login, answers loginFirst.
fn run_cli(cli: &Path, args: &[&str]) -> Result<String, String> {
    let out = Command::new(cli).args(args).arg("--json").output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    if out.status.success() {
        Ok(stdout)
    } else if stdout.trim().is_empty() {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    } else {
        Err(stdout)
    }
}

fn gitfolio(args: &[&str]) -> Result<String, String> {
    run_cli(&cli()?.0, args)
}

// In local mode, stats and stack first send the commits not sent yet (a sync).

/// The developer type and its five scores: the one saved here, or aline.team's when there is none
/// for this year or with refresh.
#[tauri::command]
async fn stats(refresh: bool) -> Result<String, String> {
    gitfolio(if refresh { &["stats", "--refresh"] } else { &["stats"] })
}

/// How long each language, framework and library was used, from aline.team each time.
#[tauri::command]
async fn stack() -> Result<String, String> {
    gitfolio(&["stack"])
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
        done = run_cli(&cli, if purge { &["uninstall", "--purge-local"] } else { &["uninstall"] })?;
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

            // The window from tauri.conf.json, glass on macOS like its menu bar menus: Liquid Glass on
            // macOS 26+, the popover material before. Elsewhere it stays opaque, as there is no glass to show.
            let win = WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?;
            #[cfg(target_os = "macos")]
            let win = {
                use tauri::window::{Effect, EffectsBuilder};
                win.transparent(true)
                    .effects(EffectsBuilder::new().effects([Effect::LiquidGlassRegular, Effect::Popover]).radius(16.0).build())
            };
            win.build()?;

            // Linux sends no tray click events, so the menu is the way to open the window there.
            let open = MenuItem::with_id(app, "open", "Open GitFolio", true, None::<&str>)?;
            let uninstall = MenuItem::with_id(app, "uninstall", "Uninstall GitFolio…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GitFolio")
                .menu(&Menu::with_items(app, &[&open, &uninstall, &quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
                    // The window asks first; it says whether a gitfolio installed on its own stays. Told
                    // before it opens, so its first open does not load the home view meanwhile.
                    "uninstall" => {
                        let _ = app.emit("uninstall", !matches!(cli(), Ok((_, true))));
                        show(app);
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
        // Like a menu bar menu: clicking elsewhere closes it.
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![stats, stack, uninstall, quit])
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
