mod util;
mod v2ray;

use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use util::emit_log;
use v2ray::*;

#[cfg(mobile)]
const PLUGIN_IDENTIFIER: &str = "com.plugin.cloudv2ray";

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::<R>::new("cloudv2ray")
    .invoke_handler(tauri::generate_handler![
      tauri_start_v2ray_server,
      tauri_stop_v2ray_server
    ])
    .setup(|_app, _api| {
      _app.manage(V2RayProc::new());
      #[cfg(mobile)]
      _api.register_android_plugin(PLUGIN_IDENTIFIER, "CloudV2RayPlugin")?;
      Ok(())
    })
    .build()
}
