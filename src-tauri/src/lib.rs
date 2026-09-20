#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 注：曾启用 window-vibrancy 毛玻璃/Mica，实测 transparent 窗口会让
      // WKWebView 退化成非加速合成路径，大型 Table 页面严重掉帧——性能即原生感，移除。
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
