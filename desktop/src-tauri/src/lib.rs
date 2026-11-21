//! Halo desktop app (card 25).
//!
//! One frameless, transparent, always on top window at the top centre of the chosen monitor. The web code owns the
//! island's size and tells this side through `set_island`, so the window never covers more than the island (plus its
//! alert stack). Everywhere else in the window is click through: a thread watches the cursor and flips the window's
//! "ignore cursor events" flag, and tells the page when the pointer enters or leaves (a click through window never
//! sees the mouse leave on its own). It also hides the window over a full screen app.

mod geometry;
mod winapi;

use geometry::{inside_any, place, Region};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt as _};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const POLL: Duration = Duration::from_millis(30);
/// Housekeeping (monitor changes, full screen, pause) runs on every Nth poll.
const SLOW_EVERY: u32 = 20;
const PAUSE: Duration = Duration::from_secs(60 * 60);

#[derive(Serialize, Deserialize, Clone)]
struct Config {
    /// "notch" (attached to the top edge, with ears) or "island" (floating capsule).
    style: String,
    /// Monitor name, or none for the main screen.
    monitor: Option<String>,
    /// The first run turns launch at startup on. After that the switch is Liam's.
    autostart_set: bool,
}
impl Default for Config {
    fn default() -> Self {
        Config { style: "notch".into(), monitor: None, autostart_set: false }
    }
}

struct Runtime {
    win_w: f64,
    win_h: f64,
    regions: Vec<Region>,
    ignoring: bool,
    inside: bool,
    button_was_down: bool,
    paused_until: Option<Instant>,
    fullscreen: bool,
    hidden: bool,
    /// What was last placed, so housekeeping only moves the window when something changed.
    placed: Option<(i32, i32, u32, u32)>,
}

struct AppState {
    cfg: Mutex<Config>,
    rt: Mutex<Runtime>,
    /// A halo:// sign-in link that arrived before the page was ready to listen (Halo was started by the link).
    auth_url: Mutex<Option<String>>,
}

fn config_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("desktop.json"))
}
fn load_config(app: &AppHandle) -> Config {
    config_path(app).and_then(|p| std::fs::read_to_string(p).ok()).and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}
fn save_config(app: &AppHandle, cfg: &Config) {
    if let Some(p) = config_path(app) {
        if let Some(d) = p.parent() {
            let _ = std::fs::create_dir_all(d);
        }
        let _ = std::fs::write(p, serde_json::to_string_pretty(cfg).unwrap_or_default());
    }
}

fn window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn monitor_names(app: &AppHandle) -> Vec<String> {
    app.available_monitors().unwrap_or_default().iter().filter_map(|m| m.name().cloned()).collect()
}

/// The monitor Halo sits on: the chosen one if it is still plugged in, otherwise the main screen.
fn pick_monitor(app: &AppHandle, cfg: &Config) -> Option<tauri::Monitor> {
    if let Some(name) = &cfg.monitor {
        if let Some(m) = app.available_monitors().ok()?.into_iter().find(|m| m.name() == Some(name)) {
            return Some(m);
        }
    }
    app.primary_monitor().ok().flatten().or_else(|| app.available_monitors().ok()?.into_iter().next())
}

/// Put the window at the top centre of the chosen monitor at the size the page asked for.
fn apply_placement(app: &AppHandle, force: bool) {
    let (Some(win), Some(state)) = (window(app), app.try_state::<AppState>()) else { return };
    let cfg = state.cfg.lock().unwrap().clone();
    let Some(mon) = pick_monitor(app, &cfg) else { return };
    let (w, h) = {
        let rt = state.rt.lock().unwrap();
        (rt.win_w, rt.win_h)
    };
    let (x, y, pw, ph) = place(mon.position().x, mon.position().y, mon.size().width, mon.scale_factor(), w, h);
    let mut rt = state.rt.lock().unwrap();
    if !force && rt.placed == Some((x, y, pw, ph)) {
        return;
    }
    rt.placed = Some((x, y, pw, ph));
    drop(rt);
    // Size first with the monitor's own scale, then position. Twice, because moving between monitors with different
    // scales can nudge the size.
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    let _ = win.set_position(PhysicalPosition::new(x, y));
    let _ = win.set_size(PhysicalSize::new(pw, ph));
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// The monitor rectangle in physical px, for the full screen test.
fn monitor_rect(app: &AppHandle, cfg: &Config) -> Option<(i32, i32, i32, i32)> {
    let m = pick_monitor(app, cfg)?;
    Some((m.position().x, m.position().y, m.position().x + m.size().width as i32, m.position().y + m.size().height as i32))
}

fn set_visible(app: &AppHandle, show: bool) {
    let (Some(win), Some(state)) = (window(app), app.try_state::<AppState>()) else { return };
    let mut rt = state.rt.lock().unwrap();
    if rt.hidden == !show {
        return;
    }
    rt.hidden = !show;
    drop(rt);
    if show {
        let _ = win.show();
        let _ = win.set_always_on_top(true);
    } else {
        let _ = win.hide();
    }
}

fn is_paused(rt: &Runtime) -> bool {
    rt.paused_until.map_or(false, |t| Instant::now() < t)
}

// ---- Commands (the page calls these through window.halo.desktop) -------------------------------------------

#[tauri::command]
fn set_island(app: AppHandle, win_w: f64, win_h: f64, regions: Vec<Region>) {
    if let Some(state) = app.try_state::<AppState>() {
        let mut rt = state.rt.lock().unwrap();
        rt.win_w = win_w.max(1.0);
        rt.win_h = win_h.max(1.0);
        rt.regions = regions;
    }
    apply_placement(&app, false);
}

#[tauri::command]
fn set_regions(app: AppHandle, regions: Vec<Region>) {
    if let Some(state) = app.try_state::<AppState>() {
        state.rt.lock().unwrap().regions = regions;
    }
}

#[tauri::command]
fn set_focusable(app: AppHandle, on: bool) {
    if let Some(win) = window(&app) {
        let _ = win.set_focusable(on);
        if on {
            let _ = win.set_focus();
        }
    }
}

#[derive(Serialize)]
struct DesktopState {
    style: String,
    monitor: Option<String>,
    monitors: Vec<String>,
    paused: bool,
    autostart: bool,
}

fn snapshot(app: &AppHandle) -> DesktopState {
    let state = app.state::<AppState>();
    let cfg = state.cfg.lock().unwrap().clone();
    let paused = is_paused(&state.rt.lock().unwrap());
    DesktopState { style: cfg.style, monitor: cfg.monitor, monitors: monitor_names(app), paused, autostart: app.autolaunch().is_enabled().unwrap_or(false) }
}

#[tauri::command]
fn get_state(app: AppHandle) -> DesktopState {
    snapshot(&app)
}

fn update_config(app: &AppHandle, f: impl FnOnce(&mut Config)) {
    let state = app.state::<AppState>();
    let cfg = {
        let mut c = state.cfg.lock().unwrap();
        f(&mut c);
        c.clone()
    };
    save_config(app, &cfg);
    let _ = app.emit("halo-style", cfg.style.clone());
    apply_placement(app, true);
    rebuild_tray(app);
}

#[tauri::command]
fn set_style(app: AppHandle, style: String) {
    if style == "notch" || style == "island" {
        update_config(&app, |c| c.style = style);
    }
}

#[tauri::command]
fn set_monitor(app: AppHandle, name: Option<String>) {
    update_config(&app, |c| c.monitor = name);
}

#[tauri::command]
fn set_autostart(app: AppHandle, on: bool) {
    let al = app.autolaunch();
    let _ = if on { al.enable() } else { al.disable() };
    rebuild_tray(&app);
}

#[tauri::command]
fn pause_for_hour(app: AppHandle) {
    toggle_pause(&app);
}

/// The page asks for a halo:// link that arrived while it was loading. Returns it once.
#[tauri::command]
fn take_auth_url(app: AppHandle) -> Option<String> {
    app.try_state::<AppState>().and_then(|s| s.auth_url.lock().unwrap().take())
}

/// A halo:// link opened Halo (the magic link email, through the browser). Keep it for a page that is not ready
/// yet, tell a page that is, and bring the island up so Liam sees it sign in.
fn on_deep_link(app: &AppHandle, url: String) {
    if !url.starts_with("halo://") {
        return;
    }
    if let Some(state) = app.try_state::<AppState>() {
        *state.auth_url.lock().unwrap() = Some(url.clone());
    }
    let _ = app.emit("halo-auth", url);
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn toggle_pause(app: &AppHandle) {
    let state = app.state::<AppState>();
    {
        let mut rt = state.rt.lock().unwrap();
        rt.paused_until = if is_paused(&rt) { None } else { Some(Instant::now() + PAUSE) };
    }
    rebuild_tray(app);
    housekeeping(app);
}

// ---- Tray ---------------------------------------------------------------------------------------------------

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let st = snapshot(app);
    let mut monitors = SubmenuBuilder::new(app, "Screen")
        .item(&CheckMenuItemBuilder::with_id("mon:", "Main screen").checked(st.monitor.is_none()).build(app)?);
    for name in &st.monitors {
        monitors = monitors.item(&CheckMenuItemBuilder::with_id(format!("mon:{name}"), name).checked(st.monitor.as_deref() == Some(name)).build(app)?);
    }
    let style = SubmenuBuilder::new(app, "Style")
        .item(&CheckMenuItemBuilder::with_id("style:island", "Island").checked(st.style == "island").build(app)?)
        .item(&CheckMenuItemBuilder::with_id("style:notch", "Notch").checked(st.style == "notch").build(app)?)
        .build()?;
    MenuBuilder::new(app)
        .item(&MenuItemBuilder::with_id("open", "Open").build(app)?)
        .item(&MenuItemBuilder::with_id("settings", "Settings").build(app)?)
        .separator()
        .item(&monitors.build()?)
        .item(&style)
        .item(&CheckMenuItemBuilder::with_id("autostart", "Launch at startup").checked(st.autostart).build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("pause", if st.paused { "Resume" } else { "Pause for 1 hour" }).build(app)?)
        .item(&MenuItemBuilder::with_id("quit", "Quit Halo").build(app)?)
        .build()
}

fn rebuild_tray(app: &AppHandle) {
    if let (Some(tray), Ok(menu)) = (app.tray_by_id("halo"), build_menu(app)) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => {
            // Opening from the tray also ends a pause.
            if let Some(state) = app.try_state::<AppState>() {
                state.rt.lock().unwrap().paused_until = None;
            }
            housekeeping(app);
            let _ = app.emit("halo-open", ());
        }
        "settings" => {
            if let Some(state) = app.try_state::<AppState>() {
                state.rt.lock().unwrap().paused_until = None;
            }
            housekeeping(app);
            let _ = app.emit("halo-settings", ());
        }
        "pause" => toggle_pause(app),
        "quit" => app.exit(0),
        "autostart" => {
            let al = app.autolaunch();
            let on = al.is_enabled().unwrap_or(false);
            let _ = if on { al.disable() } else { al.enable() };
            rebuild_tray(app);
        }
        s if s.starts_with("style:") => update_config(app, |c| c.style = s["style:".len()..].to_string()),
        s if s.starts_with("mon:") => {
            let name = &s["mon:".len()..];
            update_config(app, |c| c.monitor = if name.is_empty() { None } else { Some(name.to_string()) });
        }
        _ => {}
    }
}

// ---- The watcher --------------------------------------------------------------------------------------------

/// Monitor changes, sleep or wake, full screen and pause. Cheap, runs about once a second.
fn housekeeping(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else { return };
    let cfg = state.cfg.lock().unwrap().clone();
    let (paused, was_fs) = {
        let mut rt = state.rt.lock().unwrap();
        if rt.paused_until.map_or(false, |t| Instant::now() >= t) {
            rt.paused_until = None;
        }
        (is_paused(&rt), rt.fullscreen)
    };
    let fs = monitor_rect(app, &cfg).map_or(false, winapi::fullscreen_on);
    if fs != was_fs {
        state.rt.lock().unwrap().fullscreen = fs;
    }
    let show = !paused && !fs;
    set_visible(app, show);
    if show {
        // A changed monitor list, resolution, scale or a wake from sleep moves where "top centre" is.
        apply_placement(app, false);
    }
    if paused != (state.rt.lock().unwrap().paused_until.is_some()) {
        rebuild_tray(app);
    }
}

fn watch(app: AppHandle) {
    std::thread::spawn(move || {
        let mut tick = 0u32;
        loop {
            std::thread::sleep(POLL);
            tick = tick.wrapping_add(1);
            if tick % SLOW_EVERY == 0 {
                housekeeping(&app);
            }
            let (Some(win), Some(state)) = (window(&app), app.try_state::<AppState>()) else { continue };
            if state.rt.lock().unwrap().hidden {
                continue;
            }
            let (Ok(cur), Ok(pos)) = (win.cursor_position(), win.outer_position()) else { continue };
            let scale = win.scale_factor().unwrap_or(1.0);
            // Cursor in logical px from the window's top left.
            let (lx, ly) = ((cur.x - pos.x as f64) / scale, (cur.y - pos.y as f64) / scale);
            let down = winapi::left_button_down();
            let mut rt = state.rt.lock().unwrap();
            let inside = inside_any(lx, ly, &rt.regions);
            let (ignore_change, enter_leave, outside_click) = (
                inside == rt.ignoring, // ignoring should be the opposite of inside
                inside != rt.inside,
                down && !rt.button_was_down && !inside,
            );
            rt.button_was_down = down;
            if ignore_change {
                rt.ignoring = !inside;
            }
            rt.inside = inside;
            drop(rt);
            if ignore_change {
                let _ = win.set_ignore_cursor_events(!inside);
            }
            if enter_leave {
                let _ = app.emit("halo-cursor", serde_json::json!({ "inside": inside }));
            }
            if outside_click {
                let _ = app.emit("halo-outside-click", ());
            }
        }
    });
}

pub fn run() {
    // Ctrl+Alt+Space is the hotkey. If another app already owns it (on Liam's laptop two others do), the next one that is
    // free is used instead, and the tray tooltip says which.
    let hotkeys: [(Shortcut, &str); 4] = [(Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::Space), "Ctrl+Alt+Space"), (Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyH), "Ctrl+Alt+H"), (Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT), Code::KeyH), "Ctrl+Alt+Shift+H"), (Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::F9), "Ctrl+Alt+F9")];
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.emit("halo-open", ());
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec![])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, _shortcut, event| {
                    // Only Halo's own shortcuts are ever registered, so any press is a toggle.
                    if event.state() == ShortcutState::Pressed {
                        let _ = app.emit("halo-toggle", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            set_island, set_regions, set_focusable, get_state, set_style, set_monitor, set_autostart, pause_for_hour, take_auth_url, quit
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            let cfg = load_config(&handle);
            app.manage(AppState {
                cfg: Mutex::new(cfg.clone()),
                rt: Mutex::new(Runtime {
                    win_w: 224.0,
                    win_h: 34.0,
                    regions: vec![Region { x: 12.0, y: 0.0, w: 200.0, h: 34.0, rt: 0.0, rb: 17.0 }],
                    ignoring: false,
                    inside: false,
                    button_was_down: false,
                    paused_until: None,
                    fullscreen: false,
                    hidden: true,
                    placed: None,
                }),
                auth_url: Mutex::new(None),
            });

            // halo:// links (the magic link email). The installer registers the scheme. A dev run registers it here.
            #[cfg(debug_assertions)]
            let _ = app.deep_link().register_all();
            let link_app = handle.clone();
            app.deep_link().on_open_url(move |event| {
                for u in event.urls() {
                    on_deep_link(&link_app, u.to_string());
                }
            });
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for u in urls {
                    on_deep_link(&handle, u.to_string());
                }
            }

            // Launch at startup is on by default. Only the first run turns it on, so Liam's switch sticks.
            if !cfg.autostart_set {
                if !cfg!(debug_assertions) {
                    let _ = handle.autolaunch().enable();
                }
                let mut c = cfg.clone();
                c.autostart_set = true;
                save_config(&handle, &c);
                *app.state::<AppState>().cfg.lock().unwrap() = c;
            }
            let hotkey_label = hotkeys.iter().find(|(k, _)| app.global_shortcut_register(*k)).map(|(_, n)| *n);

            let menu = build_menu(&handle)?;
            let mut tray = TrayIconBuilder::with_id("halo").tooltip(match hotkey_label { Some(n) => format!("Halo ({n})"), None => "Halo".to_string() }).menu(&menu).on_menu_event(|app, e| on_menu(app, e.id().as_ref()));
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            apply_placement(&handle, true);
            set_visible(&handle, true);
            watch(handle);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Halo");
}

/// Register a shortcut. False when another app already owns it.
trait RegisterShortcut {
    fn global_shortcut_register(&self, s: Shortcut) -> bool;
}
impl RegisterShortcut for tauri::App {
    fn global_shortcut_register(&self, s: Shortcut) -> bool {
        use tauri_plugin_global_shortcut::GlobalShortcutExt;
        match self.global_shortcut().register(s) {
            Ok(()) => true,
            Err(e) => {
                eprintln!("Halo hotkey {s:?} was not registered: {e}");
                false
            }
        }
    }
}
