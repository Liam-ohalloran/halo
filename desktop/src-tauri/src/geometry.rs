//! Pure geometry for the Halo window. No Tauri in here, so it can be unit tested.
//! Logical px are CSS px. Physical px are screen pixels (logical times the monitor's scale).

use serde::{Deserialize, Serialize};

/// A part of the window that takes the mouse. Logical px from the window's top left.
/// `rt` and `rb` are the top and bottom corner radii.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Region {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    #[serde(default)]
    pub rt: f64,
    #[serde(default)]
    pub rb: f64,
}

/// Is this point inside a rounded rectangle?
pub fn inside_region(px: f64, py: f64, r: &Region) -> bool {
    if px < r.x || px >= r.x + r.w || py < r.y || py >= r.y + r.h {
        return false;
    }
    let half = r.w.min(r.h) / 2.0;
    let rt = r.rt.clamp(0.0, half);
    let rb = r.rb.clamp(0.0, half);
    // Distance into each corner square, then test against the corner circle.
    let corner = |cx: f64, cy: f64, rad: f64| -> bool {
        let dx = px - cx;
        let dy = py - cy;
        dx * dx + dy * dy <= rad * rad
    };
    if rt > 0.0 && py < r.y + rt {
        if px < r.x + rt {
            return corner(r.x + rt, r.y + rt, rt);
        }
        if px > r.x + r.w - rt {
            return corner(r.x + r.w - rt, r.y + rt, rt);
        }
    }
    if rb > 0.0 && py > r.y + r.h - rb {
        if px < r.x + rb {
            return corner(r.x + rb, r.y + r.h - rb, rb);
        }
        if px > r.x + r.w - rb {
            return corner(r.x + r.w - rb, r.y + r.h - rb, rb);
        }
    }
    true
}

/// Does the cursor touch any part of the island or its stack?
pub fn inside_any(px: f64, py: f64, regions: &[Region]) -> bool {
    regions.iter().any(|r| inside_region(px, py, r))
}

/// Where the window goes on a monitor: top centre, in physical px. It always starts at the very top. Island style
/// floats because the page draws the island 8 px down inside the window, and that gap is click through.
/// Returns (x, y, width, height). The size uses the monitor's own scale so a stale window scale cannot skew it.
pub fn place(
    mon_x: i32,
    mon_y: i32,
    mon_w: u32,
    scale: f64,
    win_w: f64,
    win_h: f64,
) -> (i32, i32, u32, u32) {
    let pw = (win_w * scale).round().max(1.0);
    let ph = (win_h * scale).round().max(1.0);
    let x = mon_x + ((mon_w as f64 - pw) / 2.0).floor() as i32;
    let y = mon_y;
    (x, y, pw as u32, ph as u32)
}

/// A window is "full screen" when it covers the whole monitor, taskbar included.
pub fn covers(win: (i32, i32, i32, i32), mon: (i32, i32, i32, i32)) -> bool {
    win.0 <= mon.0 && win.1 <= mon.1 && win.2 >= mon.2 && win.3 >= mon.3
}

#[cfg(test)]
mod tests {
    use super::*;

    fn island() -> Region {
        Region { x: 12.0, y: 0.0, w: 200.0, h: 34.0, rt: 0.0, rb: 17.0 }
    }

    #[test]
    fn inside_the_body_and_outside_the_box() {
        let r = island();
        assert!(inside_region(100.0, 10.0, &r));
        assert!(!inside_region(5.0, 10.0, &r), "the ear margin is click through");
        assert!(!inside_region(100.0, 34.0, &r));
        assert!(!inside_region(212.0, 10.0, &r));
    }

    #[test]
    fn rounded_bottom_corners_are_click_through() {
        let r = island();
        // The very corner of the box is outside the curve, the middle of the bottom edge is inside.
        assert!(!inside_region(12.5, 33.5, &r));
        assert!(!inside_region(211.5, 33.5, &r));
        assert!(inside_region(112.0, 33.5, &r));
        // A flat top (notch style) keeps its top corners.
        assert!(inside_region(12.5, 0.5, &r));
    }

    #[test]
    fn island_style_rounds_the_top_too() {
        let r = Region { rt: 17.0, ..island() };
        assert!(!inside_region(12.5, 0.5, &r));
        assert!(inside_region(112.0, 0.5, &r));
    }

    #[test]
    fn any_region_counts() {
        let stack = Region { x: 62.0, y: 44.0, w: 100.0, h: 40.0, rt: 20.0, rb: 20.0 };
        let all = [island(), stack];
        assert!(inside_any(110.0, 60.0, &all));
        assert!(!inside_any(110.0, 38.0, &all), "the gap between island and stack is click through");
        assert!(!inside_any(110.0, 200.0, &all));
    }

    #[test]
    fn places_top_centre_at_any_scale() {
        // 1920 x 1080 at 100%: a 224 wide window centres at x = 848.
        assert_eq!(place(0, 0, 1920, 1.0, 224.0, 34.0), (848, 0, 224, 34));
        // 150%: the size grows in physical px and stays centred.
        assert_eq!(place(0, 0, 2880, 1.5, 224.0, 34.0), (1272, 0, 336, 51));
        // A second monitor to the right of the first.
        assert_eq!(place(1920, 0, 2560, 1.0, 200.0, 34.0), (1920 + 1180, 0, 200, 34));
        // Always the very top, whatever the style: the island's floating gap is drawn inside the window.
        assert_eq!(place(0, 40, 1920, 2.0, 200.0, 34.0).1, 40);
    }

    #[test]
    fn full_screen_means_covering_the_taskbar_too() {
        let mon = (0, 0, 1920, 1080);
        assert!(covers((0, 0, 1920, 1080), mon));
        assert!(covers((-8, -8, 1928, 1088), mon));
        assert!(!covers((0, 0, 1920, 1040), mon), "a maximised window stops at the taskbar");
    }
}
