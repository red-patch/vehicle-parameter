mod announcements;
mod assets;
mod excel;
mod mobile;
mod pdf_sniff;
mod regulations;

/// 「设置」菜单项的 id。前端 `useSettingsHotkey` 监听同名事件打开设置面板；
/// id 与事件名分开定义，避免"菜单 id"与"事件名"混成一个约定。
pub const SETTINGS_MENU_ID: &str = "settings";
pub const SETTINGS_EVENT: &str = "open-settings";

/// macOS 标准应用菜单：系统预定义项自带加速键（Cmd+Q 退出 / Cmd+W 关窗 /
/// Cmd+M 最小化 / Cmd+H 隐藏 / Cmd+C·V·X·Z·A 编辑）。不配菜单时 macOS 落到
/// 缺加速键的默认菜单，Cmd+W/Q 全部无效——这是「基本快捷键不可用」的根因。
/// 仅 macOS 生效；Windows 保持默认（Alt+F4 等系统行为已可用），
/// Windows 的 Ctrl+, 由前端 `useSettingsHotkey` 直接监听键盘事件兜底。
#[cfg(target_os = "macos")]
fn setup_macos_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
  use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};

  // 自定义项（非系统预定义）：需显式给加速键。放在 App 菜单里符合 macOS 偏好设置惯例。
  let settings_item = MenuItemBuilder::with_id(SETTINGS_MENU_ID, "设置…")
    .accelerator("CmdOrCtrl+,")
    .build(app)?;

  let app_menu = SubmenuBuilder::new(app, "整车产品工作台 VPW")
    .about(None)
    .separator()
    .item(&settings_item)
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;

  let file_menu = SubmenuBuilder::new(app, "文件")
    .close_window()
    .build()?;

  let edit_menu = SubmenuBuilder::new(app, "编辑")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;

  let window_menu = SubmenuBuilder::new(app, "窗口")
    .minimize()
    .separator()
    .fullscreen()
    .build()?;

  let menu = MenuBuilder::new(app)
    .items(&[&app_menu, &file_menu, &edit_menu, &window_menu])
    .build()?;

  app.set_menu(menu)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // 菜单项「设置…」被选中 → 通知前端打开设置面板。仅 macOS 有该菜单项；
    // Windows 的 Ctrl+, 走前端键盘监听（见 useSettingsHotkey）。
    .on_menu_event(|app, event| {
      if event.id() == SETTINGS_MENU_ID {
        use tauri::Emitter;
        let _ = app.emit(SETTINGS_EVENT, ());
      }
    })
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      excel::read_workbook,
      excel::export_xlsx,
      assets::scan_asset_library,
      assets::save_assets_batch,
      announcements::scan_announcements,
      announcements::move_to_trash,
      announcements::copy_files_to_clipboard,
      pdf_sniff::scan_pdf_candidates,
      pdf_sniff::cancel_pdf_scan,
      pdf_sniff::probe_downloads,
      mobile::start_mobile_server,
      mobile::set_mobile_public_url,
      mobile::set_mobile_server_enabled,
      mobile::mobile_server_status,
      mobile::create_mobile_pairing_code,
      mobile::revoke_all_mobile_devices,
      regulations::read_regulation_sidecar,
      regulations::write_regulation_sidecar,
      regulations::scan_regulations,
      regulations::extract_regulation_hints
    ])
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
      #[cfg(target_os = "macos")]
      setup_macos_menu(app.handle())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
