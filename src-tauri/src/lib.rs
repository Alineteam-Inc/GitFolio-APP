use std::process::Command;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_positioner::{Position, WindowExt};

// Under the tray icon: the menu bar is at the top on macOS, the taskbar at the bottom elsewhere.
#[cfg(target_os = "macos")]
const NEAR_TRAY: Position = Position::TrayCenter;
#[cfg(not(target_os = "macos"))]
const NEAR_TRAY: Position = Position::TrayBottomCenter;

/// Runs the gitfolio bundled with the app (bundle.externalBin, next to this executable) with --json:
/// its JSON on success, its JSON error (or, from a CLI without --json, its message) on failure.
/// Progress and notices go to stderr and are left out. Its stdin is closed (`output`), so it asks
/// nothing and, without a login, answers loginFirst.
// ponytail: always the bundled one; prefer an install of its own (brew, install.sh) once `version --json` can tell it is new enough.
fn gitfolio(args: &[&str]) -> Result<String, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let cli = exe.with_file_name(format!("gitfolio{}", std::env::consts::EXE_SUFFIX));
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
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("GitFolio")
                .menu(&Menu::with_items(app, &[&open, &quit])?)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show(app),
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
        .invoke_handler(tauri::generate_handler![stats, stack])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
