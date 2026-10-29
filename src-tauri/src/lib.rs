use tauri::{Manager, Emitter};
use std::path::PathBuf;
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose::STANDARD as B64};
use tauri_plugin_shell::ShellExt;

// ─── State: custom images directory ───────────────────────────────────────────
struct ImagesDir(Mutex<Option<PathBuf>>);

fn default_images_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("tag-images")
}

fn get_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let state = app.state::<ImagesDir>();
    let custom = state.0.lock().unwrap().clone();
    let dir = custom.unwrap_or_else(|| default_images_dir(app));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn get_images_dir(app: tauri::AppHandle) -> Result<String, String> {
    get_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
async fn set_images_dir(app: tauri::AppHandle, path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    *app.state::<ImagesDir>().0.lock().unwrap() = Some(p);
    Ok(path)
}

#[tauri::command]
async fn reset_images_dir(app: tauri::AppHandle) -> Result<String, String> {
    *app.state::<ImagesDir>().0.lock().unwrap() = None;
    get_dir(&app).map(|p| p.to_string_lossy().into_owned())
}

/// Open a native folder picker dialog — uses rfd (no tauri-plugin-dialog needed)
#[tauri::command]
async fn pick_images_folder() -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title("Choose Tag Images Folder")
        .pick_folder();
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

/// Open images folder in system file explorer
#[tauri::command]
async fn open_images_folder(app: tauri::AppHandle) -> Result<(), String> {
    let dir = get_dir(&app)?;
    app.shell().open(dir.to_string_lossy().to_string(), None)
        .map_err(|e: tauri_plugin_shell::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn save_tag_image(app: tauri::AppHandle, filename: String, data_url: String) -> Result<String, String> {
    let b64 = data_url.splitn(2, ',').nth(1).ok_or("Invalid data URL")?;
    let bytes = B64.decode(b64).map_err(|e| e.to_string())?;
    std::fs::write(get_dir(&app)?.join(&filename), &bytes).map_err(|e| e.to_string())?;
    Ok(filename)
}

#[tauri::command]
async fn delete_tag_image(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let path = get_dir(&app)?.join(&filename);
    if path.exists() { std::fs::remove_file(&path).map_err(|e| e.to_string())?; }
    Ok(())
}

#[tauri::command]
async fn load_tag_image(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let path = get_dir(&app)?.join(&filename);
    if !path.exists() { return Err("File not found".into()); }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("png").to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif"  => "image/gif",
        "avif" => "image/avif",
        _      => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, B64.encode(&bytes)))
}

#[tauri::command]
async fn count_tag_images(app: tauri::AppHandle) -> Result<usize, String> {
    let mut count = 0;
    for entry in std::fs::read_dir(get_dir(&app)?).map_err(|e| e.to_string())? {
        if let Ok(e) = entry {
            if let Ok(file_type) = e.file_type() {
                if file_type.is_file() {
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

#[tauri::command]
async fn list_tag_images(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    for entry in std::fs::read_dir(get_dir(&app)?).map_err(|e| e.to_string())? {
        if let Ok(e) = entry {
            if let Ok(file_type) = e.file_type() {
                if file_type.is_file() {
                    if let Some(name) = e.file_name().to_str() { names.push(name.to_string()); }
                }
            }
        }
    }
    Ok(names)
}

#[tauri::command]
async fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_excel_files(path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    let dir = PathBuf::from(&path);
    if !dir.is_dir() { return Err("Not a directory".into()); }
    
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        if let Ok(e) = entry {
            let p = e.path();
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|ext| ext.to_str()) {
                    let ext_lower = ext.to_lowercase();
                    if ext_lower == "xlsx" || ext_lower == "xls" || ext_lower == "xlsm" || ext_lower == "xlsb" || ext_lower == "csv" || ext_lower == "json" || ext_lower == "txt" {
                        if let Some(s) = p.to_str() { 
                            // Skip temporary excel files (start with ~$)
                            if !p.file_name().and_then(|n| n.to_str()).map(|n| n.starts_with("~$")).unwrap_or(false) {
                                files.push(s.to_string()); 
                            }
                        }
                    }
                }
            }
        }
    }
    println!("[booru] Found {} excel files in {}", files.len(), path);
    Ok(files)
}

#[tauri::command]
async fn pick_folder(title: String) -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title(&title)
        .pick_folder();
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn check_library_exists(path: String) -> Result<bool, String> {
    let p = std::path::PathBuf::from(path).join("pony-prompt-library.json");
    Ok(p.exists())
}

#[tauri::command]
async fn read_library_data(path: String) -> Result<String, String> {
    let p = std::path::PathBuf::from(path).join("pony-prompt-library.json");
    std::fs::read_to_string(p).map_err(|e| e.to_string())
}

#[tauri::command]
async fn write_library_data(path: String, data: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(path);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    let p = p.join("pony-prompt-library.json");
    std::fs::write(p, data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_file_dialog(title: String, default_name: String) -> Result<Option<String>, String> {
    let result = rfd::FileDialog::new()
        .set_title(&title)
        .set_file_name(&default_name)
        .add_filter("JSON", &["json"])
        .save_file();
    Ok(result.map(|p| p.to_string_lossy().into_owned()))
}

#[tauri::command]
async fn write_file_binary(path: String, contents: Vec<u8>) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|e| e.to_string())
}

// ─── Proxy: outbound HTTP from Rust (bypasses browser CORS) ──────────────────
//
// These commands exist so the React frontend can talk to OpenAI-compatible
// APIs that don't send CORS headers (e.g. Ollama Cloud). The browser's fetch()
// is blocked by CORS preflight in those cases; reqwest from Rust is not.

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use futures_util::StreamExt;
use serde::Serialize;

#[derive(Serialize)]
struct ProxyResponse {
    status: u16,
    headers: std::collections::HashMap<String, String>,
    body: String,
}

fn build_headers(headers: &serde_json::Value) -> Result<HeaderMap, String> {
    let mut out = HeaderMap::new();
    if let Some(obj) = headers.as_object() {
        for (k, v) in obj {
            let value_str = match v {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| format!("invalid header name '{}': {}", k, e))?;
            let value = HeaderValue::from_str(&value_str)
                .map_err(|e| format!("invalid header value for '{}': {}", k, e))?;
            out.insert(name, value);
        }
    }
    Ok(out)
}

fn body_to_bytes(body: Option<serde_json::Value>) -> Result<Vec<u8>, String> {
    match body {
        None | Some(serde_json::Value::Null) => Ok(Vec::new()),
        Some(serde_json::Value::String(s)) => Ok(s.into_bytes()),
        Some(v) => serde_json::to_vec(&v).map_err(|e| format!("failed to serialize body: {}", e)),
    }
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("pony-prompt-builder/2.0")
        .build()
        .map_err(|e| format!("failed to build HTTP client: {}", e))
}

/// Non-streaming HTTP proxy. Returns the full response so the frontend can
/// parse JSON. Used for /models listing and the simple connection test.
#[tauri::command]
async fn proxy_http(
    url: String,
    method: String,
    headers: serde_json::Value,
    body: Option<serde_json::Value>,
) -> Result<ProxyResponse, String> {
    let client = build_client()?;
    let header_map = build_headers(&headers)?;
    let bytes = body_to_bytes(body)?;

    let mut req = client.request(method.parse().map_err(|e| format!("bad method: {}", e))?, &url);
    req = req.headers(header_map);
    if !bytes.is_empty() {
        req = req.body(bytes);
    }

    let resp = req.send().await.map_err(|e| format!("request failed: {}", e))?;
    let status = resp.status().as_u16();
    let mut header_out = std::collections::HashMap::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(s) = v.to_str() {
            header_out.insert(k.as_str().to_string(), s.to_string());
        }
    }
    let body_text = resp.text().await.map_err(|e| format!("failed to read body: {}", e))?;
    Ok(ProxyResponse { status, headers: header_out, body: body_text })
}

#[derive(Serialize, Clone)]
struct StreamChunk {
    /// Either "content" (delta text), "done" (stream finished), or "error".
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

/// Streaming HTTP proxy. Emits chunks to the frontend as a Tauri event so the
/// JS side can render tokens progressively. `request_id` lets the frontend
/// match events to its open stream.
#[tauri::command]
async fn proxy_http_stream(
    app: tauri::AppHandle,
    request_id: String,
    url: String,
    method: String,
    headers: serde_json::Value,
    body: Option<serde_json::Value>,
) -> Result<u16, String> {
    let client = build_client()?;
    let header_map = build_headers(&headers)?;
    let bytes = body_to_bytes(body)?;
    let event_name = format!("proxy_chunk:{}", request_id);

    let mut req = client.request(method.parse().map_err(|e| format!("bad method: {}", e))?, &url);
    req = req.headers(header_map);
    if !bytes.is_empty() {
        req = req.body(bytes);
    }

    let resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            let _ = app.emit(&event_name, StreamChunk {
                kind: "error".into(),
                text: None,
                error: Some(format!("request failed: {}", e)),
            });
            return Err(format!("request failed: {}", e));
        }
    };

    let status = resp.status().as_u16();
    if !resp.status().is_success() {
        // Surface the body for the frontend to display
        let body_text = resp.text().await.unwrap_or_default();
        let _ = app.emit(&event_name, StreamChunk {
            kind: "error".into(),
            text: None,
            error: Some(format!("HTTP {}: {}", status, body_text.chars().take(400).collect::<String>())),
        });
        return Err(format!("HTTP {}: {}", status, body_text.chars().take(400).collect::<String>()));
    }

    let mut stream = resp.bytes_stream();
    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes).to_string();
                let _ = app.emit(&event_name, StreamChunk {
                    kind: "content".into(),
                    text: Some(text),
                    error: None,
                });
            }
            Err(e) => {
                let _ = app.emit(&event_name, StreamChunk {
                    kind: "error".into(),
                    text: None,
                    error: Some(format!("stream read error: {}", e)),
                });
                return Err(format!("stream read error: {}", e));
            }
        }
    }

    let _ = app.emit(&event_name, StreamChunk {
        kind: "done".into(),
        text: None,
        error: None,
    });
    Ok(status)
}

pub fn run() {
    tauri::Builder::default()
        .manage(ImagesDir(Mutex::new(None)))
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_images_dir,
            set_images_dir,
            reset_images_dir,
            pick_images_folder,
            open_images_folder,
            save_tag_image,
            delete_tag_image,
            load_tag_image,
            count_tag_images,
            list_tag_images,
            read_file_binary,
            list_excel_files,
            pick_folder,
            check_library_exists,
            read_library_data,
            write_library_data,
            save_file_dialog,
            write_file_binary,
            proxy_http,
            proxy_http_stream,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
