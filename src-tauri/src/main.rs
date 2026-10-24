// Nasconde la finestra della console su Windows nelle build release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    smart_bookmark_organizer_lib::run()
}
