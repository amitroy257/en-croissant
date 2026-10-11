//! Files the OS asks the app to open (e.g. double-clicking a `.pgn` in Finder).
//!
//! On macOS these arrive as `RunEvent::Opened`, not as command line arguments, and
//! often before the frontend has finished loading. Paths are queued until the
//! frontend asks for them, and emitted as an event after that.

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

// Only macOS and iOS deliver opened files as events.
#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
pub const OPEN_FILES_EVENT: &str = "open_files";

#[derive(Default)]
pub struct OpenFilesState(Mutex<OpenFilesInner>);

#[derive(Default)]
struct OpenFilesInner {
    frontend_ready: bool,
    pending: Vec<String>,
}

#[cfg_attr(not(any(target_os = "macos", target_os = "ios")), allow(dead_code))]
pub fn handle_opened_files(app: &AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    log::info!("Files opened by the OS: {:?}", paths);

    let state = app.state::<OpenFilesState>();
    let mut inner = state.0.lock().unwrap();
    if !inner.frontend_ready {
        inner.pending.extend(paths);
        return;
    }
    drop(inner);

    if let Err(e) = app.emit(OPEN_FILES_EVENT, paths) {
        log::error!("Failed to emit {OPEN_FILES_EVENT}: {e}");
    }
}

/// Returns the files queued before the frontend was ready. After this call, new
/// files are delivered through the `open_files` event instead.
#[tauri::command]
#[specta::specta]
pub fn take_pending_open_files(state: State<'_, OpenFilesState>) -> Vec<String> {
    let mut inner = state.0.lock().unwrap();
    inner.frontend_ready = true;
    std::mem::take(&mut inner.pending)
}
