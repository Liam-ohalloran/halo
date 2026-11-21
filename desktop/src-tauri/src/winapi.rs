//! The few Windows calls Halo needs: is the left mouse button down, and is a full screen app in front.

#[cfg(windows)]
mod imp {
    use crate::geometry::covers;
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Threading::GetCurrentProcessId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId};

    /// Is the left mouse button down right now, wherever the pointer is?
    pub fn left_button_down() -> bool {
        unsafe { (GetAsyncKeyState(VK_LBUTTON.0 as i32) as u16 & 0x8000) != 0 }
    }

    fn class_of(hwnd: HWND) -> String {
        let mut buf = [0u16; 64];
        let n = unsafe { GetClassNameW(hwnd, &mut buf) } as usize;
        String::from_utf16_lossy(&buf[..n.min(buf.len())])
    }

    /// Is a full screen app (a game, a video) in front on the monitor at this physical rectangle (left, top, right, bottom)?
    /// The desktop itself and Halo's own window do not count.
    pub fn fullscreen_on(mon: (i32, i32, i32, i32)) -> bool {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.0.is_null() {
                return false;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == GetCurrentProcessId() {
                return false;
            }
            let class = class_of(hwnd);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return false;
            }
            let mut r = RECT::default();
            if GetWindowRect(hwnd, &mut r).is_err() {
                return false;
            }
            // It must be on the monitor Halo is on, and cover all of it.
            let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
                return false;
            }
            let theirs = (mi.rcMonitor.left, mi.rcMonitor.top, mi.rcMonitor.right, mi.rcMonitor.bottom);
            theirs == mon && covers((r.left, r.top, r.right, r.bottom), theirs)
        }
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
pub fn left_button_down() -> bool {
    false
}
#[cfg(not(windows))]
pub fn fullscreen_on(_mon: (i32, i32, i32, i32)) -> bool {
    false
}
