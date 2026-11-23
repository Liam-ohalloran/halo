//! Card 28: updates. Halo checks GitHub Releases for a newer signed build a little after it starts, and Settings (or the tray) can
//! check again. Installing is one click: it downloads, installs and restarts. Every update is signed with Halo's update key, and the
//! app only installs one that matches the public key in `tauri.conf.json`, so a stranger can't push a build to the laptop.

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

/// Every failure becomes one plain sentence the page can show.
fn plain<E: std::fmt::Display>(e: E) -> String {
    eprintln!("Halo update problem: {e}");
    "Halo couldn't check for updates. Try again in a minute.".to_string()
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

async fn newer(app: &AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    app.updater().map_err(plain)?.check().await.map_err(plain)
}

/// Is there a newer build? None means Halo is up to date.
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    Ok(newer(&app).await?.map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() }))
}

/// Download the newer build, install it and restart Halo.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let Some(update) = newer(&app).await? else { return Err("Halo is already up to date.".to_string()) };
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| {
        eprintln!("Halo update install failed: {e}");
        "The update didn't install. Your current Halo is untouched. Try again in a minute.".to_string()
    })?;
    app.restart()
}

/// A little after launch (installed builds only, never `desktop:dev`) look for an update and tell the page if there is one.
pub fn check_on_launch(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio_sleep(20).await;
        if let Ok(Some(u)) = newer(&app).await {
            let _ = app.emit("halo-update", UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
        }
    });
}

async fn tokio_sleep(secs: u64) {
    tauri::async_runtime::spawn_blocking(move || std::thread::sleep(std::time::Duration::from_secs(secs))).await.ok();
}

/// The tray's "Check for updates": says what it found through the page.
pub fn check_from_tray(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        match newer(&app).await {
            Ok(Some(u)) => {
                let _ = app.emit("halo-update", UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
            }
            Ok(None) => {
                let _ = app.emit("halo-update-none", ());
            }
            Err(msg) => {
                let _ = app.emit("halo-update-error", msg);
            }
        }
        let _ = app.emit("halo-settings", ());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_failure_is_a_plain_sentence() {
        let s = plain("error sending request for url (https://github.com/...): dns error");
        assert!(!s.contains("dns") && !s.contains("https") && s.ends_with('.'));
    }

    #[test]
    fn update_info_is_what_the_page_reads() {
        let j = serde_json::to_value(UpdateInfo { version: "0.2.0".into(), notes: None }).unwrap();
        assert_eq!(j["version"], "0.2.0");
        assert!(j["notes"].is_null());
    }
}
