//! The Halo helper as a sidecar (card 26). The helper is a small program that talks to Windows for the web code: music
//! from any app, volume and brightness, battery, Wi-Fi, Windows notifications, clipboard history. It ships inside the app
//! as `halo-helper.exe` next to Halo's own exe, and the app starts it, restarts it if it stops, and stops it on quit.
//!
//! - The pairing token is made once and kept in the Windows Credential Manager (the app's secure storage). It is given to
//!   the helper in an environment variable, and to the page through `helper_info`. Nobody pastes anything.
//! - The helper listens on 127.0.0.1 only. It uses the first free port from 47800, so an old stand alone helper that is
//!   still running (it owns 47800) does not get in the way.
//! - A Windows job object ties the helper's life to the app's: if Halo is killed, the helper goes with it.

use serde::Serialize;
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const FIRST_PORT: u16 = 47800;
const LAST_PORT: u16 = 47810;

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct HelperInfo {
    pub port: u16,
    pub token: String,
    pub running: bool,
}

#[derive(Default)]
pub struct HelperState {
    info: Mutex<Option<HelperInfo>>,
    child: Mutex<Option<Child>>,
    /// Kept alive for the whole run. Closing it (the app ending, for any reason) ends the helper.
    #[cfg(windows)]
    job: Mutex<Option<isize>>,
}

/// The first free port in the range, or None. A port the old helper holds is skipped.
pub fn free_port(is_free: impl Fn(u16) -> bool) -> Option<u16> {
    (FIRST_PORT..=LAST_PORT).find(|p| is_free(*p))
}

fn port_is_free(p: u16) -> bool {
    TcpListener::bind(("127.0.0.1", p)).is_ok()
}

fn new_token() -> String {
    let mut b = [0u8; 32];
    // A failed random source is vanishingly rare. Fall back to something that is at least different each run.
    if getrandom::fill(&mut b).is_err() {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(1);
        b = [0u8; 32];
        b[..16].copy_from_slice(&t.to_le_bytes());
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// The pairing token from the Windows Credential Manager, made on the first run.
fn token() -> String {
    let entry = keyring::Entry::new("Halo", "helper-pairing-token");
    if let Ok(e) = &entry {
        if let Ok(t) = e.get_password() {
            if t.len() >= 32 {
                return t;
            }
        }
    }
    let t = new_token();
    if let Ok(e) = &entry {
        let _ = e.set_password(&t);
    }
    t
}

/// Where the sidecar sits: next to Halo's own exe. The bundler puts it there for the installer, and `tauri dev` copies it
/// next to the debug exe.
fn sidecar_path() -> Option<std::path::PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    ["halo-helper.exe", "halo-helper-x86_64-pc-windows-msvc.exe"].iter().map(|n| dir.join(n)).find(|p| p.exists())
}

#[cfg(windows)]
fn job_for_children() -> Option<isize> {
    use windows::core::PCWSTR;
    use windows::Win32::System::JobObjects::{
        CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    unsafe {
        let job = CreateJobObjectW(None, PCWSTR::null()).ok()?;
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32).ok()?;
        Some(job.0 as isize)
    }
}

#[cfg(windows)]
fn assign_to_job(job: isize, child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::JobObjects::AssignProcessToJobObject;
    unsafe {
        let _ = AssignProcessToJobObject(HANDLE(job as *mut _), HANDLE(child.as_raw_handle() as *mut _));
    }
}

fn spawn(state: &HelperState, token: &str) -> Option<HelperInfo> {
    let path = sidecar_path()?;
    let port = free_port(port_is_free)?;
    let mut cmd = Command::new(path);
    // A windowed app has no console, so the helper would inherit invalid standard handles and fall over on its first
    // write. Give it real ones: nothing in, and its output in a log file for when something goes wrong.
    let log = std::env::temp_dir().join("halo-helper.log");
    // Start a fresh log once it gets big, otherwise keep adding to it.
    if std::fs::metadata(&log).map(|m| m.len() > 1_000_000).unwrap_or(false) {
        let _ = std::fs::remove_file(&log);
    }
    let out = std::fs::File::options().create(true).append(true).open(&log).map(Stdio::from).unwrap_or_else(|_| Stdio::null());
    let err = std::fs::File::options().append(true).open(&log).map(Stdio::from).unwrap_or_else(|_| Stdio::null());
    cmd.stdin(Stdio::null()).stdout(out).stderr(err);
    cmd.env("HALO_TOKEN", token).env("HALO_PORT", port.to_string()).env("HALO_NO_TRAY", "1");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let child = cmd.spawn().ok()?;
    #[cfg(windows)]
    if let Some(job) = *state.job.lock().unwrap() {
        assign_to_job(job, &child);
    }
    *state.child.lock().unwrap() = Some(child);
    Some(HelperInfo { port, token: token.to_string(), running: true })
}

/// A line in the helper's log file (the temp folder, halo-helper.log), for when it will not stay up.
fn note(line: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(std::env::temp_dir().join("halo-helper.log")) {
        let _ = writeln!(f, "[halo] {line}");
    }
}

/// Start the helper and keep it running. Emits `halo-helper` with the new details whenever they change.
pub fn start(app: &AppHandle) {
    let state = app.state::<HelperState>();
    #[cfg(windows)]
    {
        *state.job.lock().unwrap() = job_for_children();
    }
    let token = token();
    let info = spawn(&state, &token).unwrap_or(HelperInfo { port: FIRST_PORT, token: token.clone(), running: false });
    *state.info.lock().unwrap() = Some(info);

    let app = app.clone();
    std::thread::spawn(move || {
        let mut fails = 0u32;
        loop {
            std::thread::sleep(Duration::from_secs(3));
            let state = app.state::<HelperState>();
            let died = {
                let mut c = state.child.lock().unwrap();
                match c.as_mut() {
                    Some(ch) => match ch.try_wait() {
                        Ok(Some(status)) => {
                            note(&format!("the helper stopped ({status}), starting it again"));
                            true
                        }
                        _ => false,
                    },
                    None => true,
                }
            };
            if !died {
                fails = 0;
                continue;
            }
            // Back off a little if it keeps dying, so a broken helper does not eat the CPU.
            fails += 1;
            if fails > 5 {
                std::thread::sleep(Duration::from_secs(30));
            }
            if let Some(info) = spawn(&state, &token) {
                *state.info.lock().unwrap() = Some(info.clone());
                let _ = app.emit("halo-helper", info);
            }
        }
    });
}

/// Stop the helper (the app is quitting).
pub fn stop(app: &AppHandle) {
    if let Some(state) = app.try_state::<HelperState>() {
        if let Some(mut c) = state.child.lock().unwrap().take() {
            let _ = c.kill();
            let _ = c.wait();
        }
    }
}

#[tauri::command]
pub fn helper_info(app: AppHandle) -> Option<HelperInfo> {
    app.try_state::<HelperState>().and_then(|s| s.info.lock().unwrap().clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_the_first_free_port_and_skips_the_old_helpers() {
        assert_eq!(free_port(|_| true), Some(47800));
        assert_eq!(free_port(|p| p != 47800), Some(47801));
        assert_eq!(free_port(|p| p > 47802), Some(47803));
        assert_eq!(free_port(|_| false), None);
    }

    #[test]
    fn tokens_are_long_hex_and_different_each_time() {
        let (a, b) = (new_token(), new_token());
        assert_eq!(a.len(), 64);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }
}
