use std::{io::Cursor, sync::Arc};

use anyhow_tauri::{IntoTAResult, TAResult};
use tauri::{AppHandle, Manager, State};
use tokio::{
  io::{AsyncBufReadExt, AsyncRead},
  process::Child,
  sync::Mutex,
};

use crate::util::{emit_log, get_platform_zip_file};

// pub async fn ping(url: &str) -> anyhow::Result<String> {
//   let client = reqwest::Client::new();
//   let res = client
//     .post(url)
//     .timeout(Duration::from_secs(3))
//     .send()
//     .await?;
//   let text = res.text().await?;
//   Ok(text)
//   // Ok("".into())
// }

pub struct V2RayManager {
  // ping_url: Arc<Mutex<Option<String>>>,
  v2ray_proc: Arc<Mutex<Option<Child>>>,
}
impl V2RayManager {
  pub fn new() -> Self {
    Self {
      // ping_url: Arc::new(Mutex::new(None)),
      v2ray_proc: Arc::new(Mutex::new(None)),
    }
  }
}

async fn read<R: AsyncRead + Unpin>(stdo: R, h: &AppHandle) {
  let reader = tokio::io::BufReader::new(stdo);
  let mut lines_reader = reader.lines();
  loop {
    match lines_reader.next_line().await {
      Ok(line) => {
        if let Some(l) = line {
          emit_log(h, "log::v2ray", &l);
        } else {
          break;
        }
      }
      Err(e) => {
        eprintln!("{}", e);
        break;
      }
    }
  }
}

pub async fn stop_v2ray_server(state: State<'_, V2RayManager>) {
  let v2ray_proc = state.v2ray_proc.clone();
  if let Some(mut proc) = v2ray_proc.lock().await.take() {
    // 如果存在旧的 v2ray 进程，先关闭。
    let _ = proc.kill().await;
  };
}

async fn start_v2ray_server(
  config: &str,
  h: AppHandle,
  state: State<'_, V2RayManager>,
) -> anyhow::Result<String> {
  emit_log(&h, "log::v2ray", "starting v2ray core server...");
  let v2ray_proc = state.v2ray_proc.clone();
  if let Some(mut proc) = v2ray_proc.lock().await.take() {
    // 如果存在旧的 v2ray 进程，先关闭。
    let _ = proc.kill().await;
  }

  let resource_path = h.path().resource_dir()?;
  // println!("{:?}", resource_path);
  let v2ray_bin_dir = resource_path.join("v2ray");
  if !v2ray_bin_dir.exists() {
    anyhow::bail!("v2ray not found.");
    // std::fs::remove_dir_all(&v2ray_bin_dir)?;
  }
  let config_file = v2ray_bin_dir.join("config.json");
  tokio::fs::write(&config_file, config).await?;

  let v2ray_bin = v2ray_bin_dir.join(if cfg!(target_os = "windows") {
    "v2ray.exe"
  } else {
    "v2ray"
  });

  let mut command = tokio::process::Command::new(v2ray_bin);
  command.arg("run");
  command.arg("-c");
  command.arg("./config.json");
  command.stdout(std::process::Stdio::piped());
  command.stderr(std::process::Stdio::piped());
  command.stdin(std::process::Stdio::piped());
  command.current_dir(v2ray_bin_dir);

  #[cfg(target_os = "windows")]
  command.creation_flags(0x08000000);

  let mut proc = command.spawn()?;
  let pid = proc.id().unwrap();
  emit_log(&h, "log::v2ray", &format!("v2ray core pid: {}", pid));

  tokio::task::spawn(async move {
    drop(proc.stdin.take());
    let stdo = proc.stdout.take().unwrap();
    let stde = proc.stderr.take().unwrap();
    {
      v2ray_proc.clone().lock().await.replace(proc);
    }

    tokio::join!(read(stdo, &h), read(stde, &h));
    // let mut buffer = Vec::<u8>::with_capacity(10);

    {
      v2ray_proc.clone().lock().await.take();
    }
  });

  Ok(format!("{{\"pid\":{}}}", pid))
}

pub fn extract_v2ray_if_need(h: &AppHandle) -> anyhow::Result<()> {
  let resource_path = h.path().resource_dir()?;
  // println!("{:?}", resource_path);
  let v2ray_bin_dir = resource_path.join("v2ray");
  if v2ray_bin_dir.exists() {
    emit_log(
      h,
      "log::sys",
      "V2Ray 目录已存在，跳过首次启动解压缩 V2Ray 压缩包",
    );
    return Ok(());
    // std::fs::remove_dir_all(&v2ray_bin_dir)?;
  }
  emit_log(h, "log::sys", "首次启动，开始解压缩 V2Ray 压缩包...");
  let zip_file: &str = get_platform_zip_file();
  let zip_file_path = resource_path.join(zip_file);
  // println!("{:?}", zip_file_path);
  let buf = std::fs::read(&zip_file_path)?;
  // println!("buf: {:?}", buf.len());

  std::fs::create_dir(&v2ray_bin_dir)?;
  // println!("begin extract");
  zip_extract::extract(Cursor::new(buf), &v2ray_bin_dir, true)?;
  // println!("extract done");
  emit_log(h, "log::sys", "V2Ray 压缩包解压完成");
  Ok(())
}

// pub fn init_v2ray_manager(h: &AppHandle, state: State<V2RayManager>) {
//   // let handle = app.handle();
//   let ping_url = state.ping_url.clone();
//   let handle = h.clone();
//   tauri::async_runtime::spawn(async move {
//     loop {
//       {
//         let guard = ping_url.lock().await;
//         let url = guard.as_ref();
//         if let Some(url) = url {
//           let t = ping(url).await;
//           if !matches!(t, Ok(url) if url.eq("pong!")) {
//             // use tauri_plugin_dialog::DialogExt;
//             // handle.dialog().message("不支持当前平台！").blocking_show();
//             let _ = handle.emit("ping::fail", ());
//             // guard.take();
//           } else {
//             let _ = handle.emit("ping::ok", ());
//           }
//         }
//       } // auto drop guard
//       tokio::time::sleep(Duration::from_secs(2 * 60)).await;
//     }
//   });
// }

// #[tauri::command]
// pub async fn tauri_ping_v2ray_interval(
//   url: &str,
//   state: State<'_, V2RayManager>,
// ) -> TAResult<String> {
//   let url = url.to_owned();
//   state.ping_url.lock().await.replace(url);
//   Ok("".into())
// }

#[tauri::command]
pub async fn tauri_start_v2ray_server(
  config: &str,
  handle: AppHandle,
  state: State<'_, V2RayManager>,
) -> TAResult<String> {
  start_v2ray_server(config, handle, state)
    .await
    .into_ta_result()
}

#[tauri::command]
pub async fn tauri_stop_v2ray_server(
  handle: AppHandle,
  state: State<'_, V2RayManager>,
) -> TAResult<()> {
  stop_v2ray_server(state).await;
  emit_log(&handle, "log::v2ray", "v2ray core server stopped.");
  Ok(())
}
