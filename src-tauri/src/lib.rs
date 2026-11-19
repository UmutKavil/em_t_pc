use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{command, AppHandle, Emitter, Manager, State};

const ADMIN_USERNAME: &str = "admin";
const ADMIN_PASSWORD: &str = "admin123";

pub struct TerminalState {
    cwd: Mutex<PathBuf>,
    container_cwd: Mutex<String>,
}

pub struct DatabaseState {
    connection: Mutex<Connection>,
}

pub struct MissionState {
    completed_flags: Mutex<HashSet<String>>,
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

#[derive(Clone, Serialize)]
struct TargetInfo {
    name: String,
    image: String,
    container_ip: String,
    host_url: String,
}

#[derive(Clone, Serialize)]
struct TaskCompletedPayload {
    mission_id: u8,
    flag: String,
    points: u32,
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

fn docker_executable() -> Result<String, String> {
    let candidates = [
        "/opt/homebrew/bin/docker",
        "/usr/local/bin/docker",
        "/Applications/Docker.app/Contents/Resources/bin/docker",
    ];

    for candidate in candidates {
        if Path::new(candidate).exists() {
            return Ok(candidate.to_string());
        }
    }

    if Command::new("docker").arg("--version").output().is_ok() {
        return Ok("docker".to_string());
    }

    Err("Docker CLI bulunamadı. Docker Desktop uygulamasını kurup başlatın.".to_string())
}

fn run_docker_command(
    docker: &str,
    args: &[&str],
    timeout: Duration,
) -> Result<std::process::Output, String> {
    let mut child = Command::new(docker)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Docker komutu başlatılamadı: {error}"))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => {
                return child
                    .wait_with_output()
                    .map_err(|error| format!("Docker çıktısı okunamadı: {error}"));
            }
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                child.wait_with_output().map_err(|error| {
                    format!("Docker zaman aşımından sonra durdurulamadı: {error}")
                })?;
                return Err(format!(
                    "Docker komutu {} saniye içinde tamamlanmadı.",
                    timeout.as_secs()
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(25)),
            Err(error) => return Err(format!("Docker komutu durumu okunamadı: {error}")),
        }
    }
}

fn docker_output_text(output: &std::process::Output) -> String {
    let mut text = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(&stderr);
    }
    text
}

#[command]
fn authenticate_admin(
    username: String,
    password: String,
    database: State<'_, DatabaseState>,
) -> Result<String, String> {
    if username.trim().is_empty() || password.is_empty() {
        return Err("Kullanıcı adı ve şifre gereklidir.".to_string());
    }

    let password_hash = sha256_hex(password.as_bytes());
    let connection = database
        .connection
        .lock()
        .map_err(|_| "Veritabanı kilitlenemedi.".to_string())?;

    let stored_hash: String = connection
        .query_row(
            "SELECT password_hash FROM users WHERE username = ?1",
            params![username.trim()],
            |row| row.get(0),
        )
        .map_err(|_| "Kullanıcı adı veya şifre hatalı.".to_string())?;

    if stored_hash == password_hash {
        Ok(username.trim().to_string())
    } else {
        Err("Kullanıcı adı veya şifre hatalı.".to_string())
    }
}

fn sha256_hex(input: &[u8]) -> String {
    let digest = Sha256::digest(input);
    let mut result = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write;
        let _ = write!(result, "{byte:02x}");
    }
    result
}

#[command]
fn open_student_panel() -> Result<String, String> {
    Ok("student".to_string())
}

#[command]
fn start_vulnerable_target() -> Result<TargetInfo, String> {
    let docker = docker_executable()?;

    let version = run_docker_command(&docker, &["version"], Duration::from_secs(15))?;
    if !version.status.success() {
        return Err(format!(
            "Docker çalışıyor görünmüyor. Docker Desktop'ı açın.\n{}",
            docker_output_text(&version)
        ));
    }

    let inspect = run_docker_command(
        &docker,
        &["inspect", "-f", "{{.State.Running}}", "em_t_pc_dvwa"],
        Duration::from_secs(15),
    )?;

    if inspect.status.success() && String::from_utf8_lossy(&inspect.stdout).trim() == "true" {
        return inspect_target_info(&docker);
    }

    if inspect.status.success() {
        let start =
            run_docker_command(&docker, &["start", "em_t_pc_dvwa"], Duration::from_secs(30))?;
        if !start.status.success() {
            return Err(docker_output_text(&start));
        }
        return inspect_target_info(&docker);
    }

    let run = run_docker_command(
        &docker,
        &[
            "run",
            "-d",
            "--name",
            "em_t_pc_dvwa",
            "-p",
            "127.0.0.1::80",
            "vulnerables/web-dvwa",
        ],
        Duration::from_secs(300),
    )?;

    if !run.status.success() {
        return Err(format!(
            "Hedef laboratuvar başlatılamadı.\n{}",
            docker_output_text(&run)
        ));
    }

    inspect_target_info(&docker)
}

fn inspect_target_info(docker: &str) -> Result<TargetInfo, String> {
    let ip_output = run_docker_command(
        docker,
        &[
            "inspect",
            "-f",
            "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
            "em_t_pc_dvwa",
        ],
        Duration::from_secs(15),
    )?;
    if !ip_output.status.success() {
        return Err(docker_output_text(&ip_output));
    }

    let port_output = run_docker_command(
        docker,
        &["port", "em_t_pc_dvwa", "80/tcp"],
        Duration::from_secs(15),
    )?;
    if !port_output.status.success() {
        return Err(docker_output_text(&port_output));
    }

    let container_ip = String::from_utf8_lossy(&ip_output.stdout)
        .trim()
        .to_string();
    let port_line = String::from_utf8_lossy(&port_output.stdout);
    let host_port = port_line
        .lines()
        .find_map(|line| line.rsplit(':').next())
        .unwrap_or("")
        .trim();

    if container_ip.is_empty() || host_port.is_empty() {
        return Err("Hedef IP adresi veya port bilgisi alınamadı.".to_string());
    }

    Ok(TargetInfo {
        name: "DVWA Web Hedefi".to_string(),
        image: "vulnerables/web-dvwa".to_string(),
        container_ip,
        host_url: format!("http://127.0.0.1:{host_port}"),
    })
}

#[command]
fn start_kali_container() -> Result<String, String> {
    let docker = docker_executable()?;

    let version = run_docker_command(&docker, &["version"], Duration::from_secs(15))?;
    if !version.status.success() {
        return Err(format!(
            "Docker çalışıyor görünmüyor. Docker Desktop'ı açın.\n{}",
            docker_output_text(&version)
        ));
    }

    let inspect = run_docker_command(
        &docker,
        &["inspect", "-f", "{{.State.Running}}", "em_t_pc_kali"],
        Duration::from_secs(15),
    )?;

    if inspect.status.success() {
        let running = String::from_utf8_lossy(&inspect.stdout).trim() == "true";
        if !running {
            let start =
                run_docker_command(&docker, &["start", "em_t_pc_kali"], Duration::from_secs(30))?;
            if !start.status.success() {
                return Err(docker_output_text(&start));
            }
        }
        return Ok("Kali konteyneri hazır ve çalışıyor.".to_string());
    }

    let run = run_docker_command(
        &docker,
        &[
            "run",
            "-d",
            "--name",
            "em_t_pc_kali",
            "kalilinux/kali-rolling",
        ],
        Duration::from_secs(300),
    )?;

    if run.status.success() {
        Ok("Kali konteyneri başarıyla oluşturulup başlatıldı.".to_string())
    } else {
        Err(format!(
            "Kali konteyneri başlatılamadı.\n{}",
            docker_output_text(&run)
        ))
    }
}

#[command]
fn place_admin_flag() -> Result<String, String> {
    let docker = docker_executable()?;
    let output = run_docker_command(
        &docker,
        &[
            "exec",
            "em_t_pc_kali",
            "bash",
            "-lc",
            "printf '%s' 'FLAG{admin_bayragi}' > /root/bayrak.txt",
        ],
        Duration::from_secs(30),
    )?;

    if output.status.success() {
        Ok("Bayrak konteynere /root/bayrak.txt konumuna yerleştirildi.".to_string())
    } else {
        Err(format!(
            "Bayrak yerleştirilemedi.\n{}",
            docker_output_text(&output)
        ))
    }
}

#[command]
fn verify_student_flag(
    app: AppHandle,
    flag: String,
    missions: State<'_, MissionState>,
) -> Result<TaskCompletedPayload, String> {
    let flag = flag.trim();
    let (mission_id, points) = match flag {
        "FLAG{nmap_tarama}" => (1, 100),
        "FLAG{acik_port}" => (2, 100),
        "FLAG{dvwa_saldiri}" => (3, 200),
        _ => return Err("Bayrak doğrulanamadı.".to_string()),
    };

    let mut completed = missions
        .completed_flags
        .lock()
        .map_err(|_| "Görev durumu kilitlenemedi.".to_string())?;

    if completed.contains(flag) {
        return Err("Bu görev bayrağı daha önce tamamlandı.".to_string());
    }
    completed.insert(flag.to_string());

    let payload = TaskCompletedPayload {
        mission_id,
        flag: flag.to_string(),
        points,
    };
    app.emit("task-completed", payload.clone())
        .map_err(|error| format!("Görev tamamlandı olayı gönderilemedi: {error}"))?;
    app.emit(
        "flag-found",
        FlagFoundPayload {
            flag: flag.to_string(),
        },
    )
    .map_err(|error| format!("Bayrak olayı gönderilemedi: {error}"))?;

    Ok(payload)
}

#[command]
fn execute_container_command(
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

    let docker = docker_executable()?;
    let mut container_cwd = terminal
        .container_cwd
        .lock()
        .map_err(|_| "Konteyner oturumu kilitlenemedi.".to_string())?;

    if command == "cd" || command.starts_with("cd ") {
        let target = command.strip_prefix("cd").unwrap_or("").trim();
        let target = if target.is_empty() { "/" } else { target };
        let output = run_docker_command(
            &docker,
            &[
                "exec",
                "em_t_pc_kali",
                "bash",
                "-lc",
                "cd -- \"$1\" && pwd -P",
                "bash",
                target,
            ],
            Duration::from_secs(30),
        )?;

        if !output.status.success() {
            return Err(docker_output_text(&output));
        }

        *container_cwd = String::from_utf8_lossy(&output.stdout).trim().to_string();
        return Ok(TerminalResult {
            output: String::new(),
            cwd: container_cwd.clone(),
        });
    }

    let output = run_docker_command(
        &docker,
        &[
            "exec",
            "em_t_pc_kali",
            "bash",
            "-lc",
            "cd -- \"$1\" && eval \"$2\"",
            "bash",
            container_cwd.as_str(),
            command,
        ],
        Duration::from_secs(30),
    )?;

    let mut text = docker_output_text(&output);
    if !output.status.success() && text.is_empty() {
        text = format!(
            "Komut başarısız oldu (çıkış kodu: {}).",
            output.status.code().unwrap_or(-1)
        );
    }

    Ok(TerminalResult {
        output: text,
        cwd: container_cwd.clone(),
    })
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
        if path.is_absolute() {
            path
        } else {
            cwd.join(path)
        }
    };

    let canonical = expanded
        .canonicalize()
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

    let mut cwd = terminal
        .cwd
        .lock()
        .map_err(|_| "Terminal oturumu kilitlenemedi.".to_string())?;

    if command == "cd" || command.starts_with("cd ") {
        let target = command.strip_prefix("cd").unwrap_or("").trim();
        let target = if target.is_empty() { "~" } else { target };
        let next = resolve_directory(&cwd, target)?;
        *cwd = next;
        let cwd_text = cwd.to_string_lossy().to_string();
        return Ok(TerminalResult {
            output: String::new(),
            cwd: cwd_text,
        });
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
            Ok(Some(_status)) => {
                break child
                    .wait_with_output()
                    .map_err(|error| format!("Komut çıktısı okunamadı: {error}"))?
            }
            Ok(None) if started.elapsed() >= Duration::from_secs(30) => {
                let _ = child.kill();
                let output = child.wait_with_output().map_err(|error| {
                    format!("Zaman aşımından sonra komut durdurulamadı: {error}")
                })?;
                let mut timed_output = output;
                let mut stderr = timed_output.stderr;
                if !stderr.is_empty() {
                    stderr.extend_from_slice(b"\n");
                }
                stderr.extend_from_slice("Komut 30 saniye sonra zaman aşımına uğradı.".as_bytes());
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
        text = format!(
            "Komut başarısız oldu (çıkış kodu: {}).",
            output.status.code().unwrap_or(-1)
        );
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
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|error| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Uygulama veri dizini alınamadı: {error}"),
                )
            })?;
            fs::create_dir_all(&data_dir)?;

            let database_path = data_dir.join("em_t_pc.db");
            let connection = Connection::open(database_path).map_err(|error| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("SQLite veritabanı açılamadı: {error}"),
                )
            })?;

            connection.execute(
                "CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    role TEXT NOT NULL
                )",
                [],
            )?;

            connection.execute(
                "INSERT OR IGNORE INTO users (username, password_hash, role)
                 VALUES (?1, ?2, 'admin')",
                params![ADMIN_USERNAME, sha256_hex(ADMIN_PASSWORD.as_bytes())],
            )?;

            app.manage(DatabaseState {
                connection: Mutex::new(connection),
            });
            Ok(())
        })
        .manage(TerminalState {
            cwd: Mutex::new(initial_cwd),
            container_cwd: Mutex::new("/".to_string()),
        })
        .manage(MissionState {
            completed_flags: Mutex::new(HashSet::new()),
        })
        .invoke_handler(tauri::generate_handler![
            authenticate_admin,
            open_student_panel,
            execute_terminal_command,
            start_kali_container,
            place_admin_flag,
            execute_container_command,
            start_vulnerable_target,
            verify_student_flag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
