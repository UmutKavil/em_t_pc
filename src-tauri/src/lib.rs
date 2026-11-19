use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use serde::Serialize;
use tauri::{command, AppHandle, Emitter, State};

const ADMIN_PASSWORD: &str = "admin123";

pub struct TerminalState {
    cwd: Mutex<PathBuf>,
}

#[derive(Clone, Serialize)]
pub struct TerminalResult {
    output: String,
    cwd: String,
}

#[derive(Clone, Serialize)]
struct FlagFoundPayload {
    flag: String,
}

fn find_flags(text: &str) -> Vec<String> {
    let mut flags = Vec::new();
    let mut remaining = text;

    while let Some(start) = remaining.find("FLAG{") {
        remaining = &remaining[start..];
        if let Some(end) = remaining.find('}') {
            let flag = remaining[..=end].to_string();
            flags.push(flag);
            remaining = &remaining[end + 1..];
        } else {
            break;
        }
    }

    flags
}

#[command]
fn authenticate_admin(password: String) -> Result<String, String> {
    if password == ADMIN_PASSWORD {
        Ok("admin".to_string())
    } else {
        Err("Şifre hatalı. Lütfen tekrar deneyin.".to_string())
    }
}

#[command]
fn open_student_panel() -> Result<String, String> {
    Ok("student".to_string())
}

fn resolve_directory(cwd: &Path, target: &str) -> Result<PathBuf, String> {
    let expanded = if target == "~" || target.starts_with("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            if target == "~" {
                PathBuf::from(home)
            } else {
                PathBuf::from(home).join(&target[2..])
            }
        } else {
            return Err("HOME dizini bulunamadı.".to_string());
        }
    } else {
        let path = PathBuf::from(target);
        if path.is_absolute() { path } else { cwd.join(path) }
    };

    let canonical = expanded.canonicalize()
        .map_err(|_| "Dizin bulunamadı.".to_string())?;
    if !canonical.is_dir() {
        return Err("Bu yol bir dizin değil.".to_string());
    }
    Ok(canonical)
}

#[command]
fn execute_terminal_command(
    app: AppHandle,
    command: String,
    terminal: State<'_, TerminalState>,
) -> Result<TerminalResult, String> {
    let command = command.trim();
    if command.is_empty() {
        return Err("Boş komut gönderilemez.".to_string());
    }
    if command.len() > 8192 {
        return Err("Komut 8192 karakterden uzun olamaz.".to_string());
    }

    let mut cwd = terminal.cwd.lock().map_err(|_| "Terminal oturumu kilitlenemedi.".to_string())?;

    if command == "cd" || command.starts_with("cd ") {
        let target = command.strip_prefix("cd").unwrap_or("").trim();
        let target = if target.is_empty() { "~" } else { target };
        let next = resolve_directory(&cwd, target)?;
        *cwd = next;
        let cwd_text = cwd.to_string_lossy().to_string();
        return Ok(TerminalResult { output: String::new(), cwd: cwd_text });
    }

    if command == "exit" {
        return Err("Terminali kapatmak için pencereyi kullanın.".to_string());
    }

    let mut child = Command::new("/bin/zsh")
        .arg("-lc")
        .arg(command)
        .current_dir(cwd.as_path())
        .env("TERM", "xterm-256color")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Komut çalıştırılamadı: {error}"))?;

    let started = Instant::now();
    let output = loop {
        match child.try_wait() {
            Ok(Some(_status)) => break child.wait_with_output()
                .map_err(|error| format!("Komut çıktısı okunamadı: {error}"))?,
            Ok(None) if started.elapsed() >= Duration::from_secs(30) => {
                let _ = child.kill();
                let output = child.wait_with_output()
                    .map_err(|error| format!("Zaman aşımından sonra komut durdurulamadı: {error}"))?;
                let mut timed_output = output;
                let mut stderr = timed_output.stderr;
                if !stderr.is_empty() {
                    stderr.extend_from_slice(b"\n");
                }
                stderr.extend_from_slice(b"Komut 30 saniye sonra zaman aşımına uğradı.");
                timed_output.stderr = stderr;
                break timed_output;
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(format!("Komut durumu okunamadı: {error}")),
        }
    };

    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&stderr);
    }
    if !output.status.success() && text.is_empty() {
        text = format!("Komut başarısız oldu (çıkış kodu: {}).", output.status.code().unwrap_or(-1));
    }

    for flag in find_flags(&text) {
        app.emit("flag-found", FlagFoundPayload { flag })
            .map_err(|error| format!("Bayrak olayı gönderilemedi: {error}"))?;
    }

    Ok(TerminalResult {
        output: text,
        cwd: cwd.to_string_lossy().to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_cwd = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);

    tauri::Builder::default()
        .manage(TerminalState {
            cwd: Mutex::new(initial_cwd),
        })
        .invoke_handler(tauri::generate_handler![
            authenticate_admin,
            open_student_panel,
            execute_terminal_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
