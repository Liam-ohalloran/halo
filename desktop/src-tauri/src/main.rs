// Halo desktop app (card 25). No console window in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    halo_desktop_lib::run()
}
