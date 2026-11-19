import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import LevelTest from "./components/LevelTest";
import Leaderboard from "./components/Leaderboard";

const panels = {
  admin: {
    eyebrow: "Yönetici alanı",
    title: "Admin Dashboard",
    description: "Eğitim içeriklerini, kullanıcıları ve sistem durumunu buradan yönetin.",
    icon: "◈",
    actions: ["Kullanıcı yönetimi", "Görev oluştur", "Sistem raporları"],
  },
  student: {
    eyebrow: "Öğrenci alanı",
    title: "Öğrenci Görev Paneli",
    description: "Atanan görevleri takip edin, laboratuvarlara başlayın ve ilerlemenizi görün.",
    icon: "⌁",
    actions: ["Görevlerim", "Siber laboratuvar", "İlerlemem"],
  },
};

function RealTerminal({ onClose, title = "Mac Terminal" }) {
  const terminalRef = useRef(null);
  const terminalInstance = useRef(null);
  const inputBuffer = useRef("");
  const running = useRef(false);

  useEffect(() => {
    if (!terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"DM Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      theme: {
        background: "#090d18",
        foreground: "#dce5f8",
        cursor: "#61dac7",
        selectionBackground: "#34466a",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(terminalRef.current);
    terminalInstance.current = terminal;

    terminal.writeln(`\x1b[1;36mEM T PC ${title}\x1b[0m`);
    terminal.writeln("Gerçek macOS komutlarını çalıştırır. Çıkmak için terminal penceresini kapatın.");
    terminal.writeln("");
    terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");

    const disposable = terminal.onData(async (data) => {
      if (running.current) return;

      if (data === "\r") {
        const command = inputBuffer.current;
        inputBuffer.current = "";
        terminal.write("\r\n");

        if (!command.trim()) {
          terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
          return;
        }

        running.current = true;
        terminal.write("\x1b[90mÇalıştırılıyor...\x1b[0m\r\n");
        try {
          const result = await invoke("execute_terminal_command", { command });
          if (result.output) terminal.write(result.output.replace(/\n/g, "\r\n"));
          if (result.output && !result.output.endsWith("\n")) terminal.write("\r\n");
          const cwdName = result.cwd.split("/").filter(Boolean).pop() || "/";
          terminal.write(`\x1b[1;32m➜\x1b[0m \x1b[1;34m~/${cwdName}\x1b[0m $ `);
        } catch (commandError) {
          terminal.write(`\x1b[1;31mHata:\x1b[0m ${String(commandError)}\r\n`);
          terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
        } finally {
          running.current = false;
        }
      } else if (data === "\u007f") {
        if (inputBuffer.current.length > 0) {
          inputBuffer.current = inputBuffer.current.slice(0, -1);
          terminal.write("\b \b");
        }
      } else if (data === "\u0003") {
        inputBuffer.current = "";
        terminal.write("^C\r\n\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
      } else if (!data.startsWith("\u001b")) {
        inputBuffer.current += data;
        terminal.write(data);
      }
    });

    terminal.focus();
    return () => {
      disposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, []);

  return (
    <div className="terminal-overlay" role="dialog" aria-modal="true" aria-label="Mac terminali">
      <div className="terminal-window">
        <header className="terminal-header">
          <div className="terminal-title">
            <span className="terminal-dot red" />
            <span className="terminal-dot yellow" />
            <span className="terminal-dot green" />
            <span>macOS — EM T PC {title}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Terminali kapat">×</button>
        </header>
        <div className="terminal-body" ref={terminalRef} />
      </div>
    </div>
  );
}

function App() {
  const [panel, setPanel] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [flagResult, setFlagResult] = useState("");
  const [showLevelTest, setShowLevelTest] = useState(false);
  const [studentScore, setStudentScore] = useState(() => {
    const savedScore = Number(localStorage.getItem("studentScore"));
    return Number.isFinite(savedScore) ? savedScore : 0;
  });

  useEffect(() => {
    let unlisten;

    listen("flag-found", (event) => {
      const flag = event.payload.flag;
      setFlagResult(flag);

      let foundFlags = [];
      try {
        foundFlags = JSON.parse(localStorage.getItem("foundFlags") || "[]");
      } catch {
        foundFlags = [];
      }

      if (!foundFlags.includes(flag)) {
        localStorage.setItem("foundFlags", JSON.stringify([...foundFlags, flag]));
        setStudentScore((currentScore) => {
          const nextScore = currentScore + 100;
          localStorage.setItem("studentScore", String(nextScore));
          return nextScore;
        });
      }
    }).then((stopListening) => {
      unlisten = stopListening;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const openStudentPanel = async () => {
    setError("");
    try {
      await invoke("open_student_panel");
      setShowLevelTest(true);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    }
  };

  if (showLevelTest) {
    return (
      <LevelTest
        onFinish={() => {
          setShowLevelTest(false);
          setPanel("student");
        }}
      />
    );
  }

  const loginAsAdmin = async (event) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await invoke("authenticate_admin", { username, password });
      setPanel("admin");
      setUsername("");
      setPassword("");
      setShowPassword(false);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    } finally {
      setIsLoading(false);
    }
  };

  if (panel) {
    const activePanel = panels[panel];
    return (
      <main className="app-shell">
        <div className="ambient ambient-left" />
        <div className="ambient ambient-right" />
        <section className="panel-page">
          <div className="brand-mark small">ET</div>
          <p className="eyebrow">{activePanel.eyebrow}</p>
          <div className="panel-icon">{activePanel.icon}</div>
          <h1>{activePanel.title}</h1>
          <p className="panel-description">{activePanel.description}</p>
          <div className="action-grid">
            {activePanel.actions.map((action) => (
              <button className="action-card" key={action} type="button">
                <span>{action}</span>
                <span className="arrow">→</span>
              </button>
            ))}
          </div>
          {panel === "student" && (
            <div className="student-workspace">
              <div className="student-task-list">
                <div className="student-task-heading">
                  <div>
                    <p className="eyebrow">Görev Listesi</p>
                    <h2>Aktif görevler</h2>
                  </div>
                  <span className="task-count">1 aktif</span>
                </div>
                <article className={`student-task ${flagResult ? "completed" : ""}`}>
                  <div className="task-status">{flagResult ? "✓" : "01"}</div>
                  <div>
                    <h3>Görev 1: Sisteme sız ve bayrağı bul</h3>
                    <p>
                      Terminalde kendini keşfet ve <code>FLAG&#123;...&#125;</code> formatında gizli bayrağı ara.
                    </p>
                  </div>
                </article>
              </div>
              <Leaderboard score={studentScore} />
            </div>
          )}
          {panel === "admin" && (
            <button className="terminal-launch-button" type="button" onClick={() => setShowTerminal(true)}>
              <span className="terminal-launch-icon">›_</span>
              <span>
                <strong>Gerçek Terminali Aç</strong>
                <small>macOS komutlarını çalıştır</small>
              </span>
            </button>
          )}
          {panel === "student" && (
            <button className="terminal-launch-button student-terminal-launch" type="button" onClick={() => setShowTerminal(true)}>
              <span className="terminal-launch-icon">›_</span>
              <span>
                <strong>Görev Terminalini Aç</strong>
                <small>İstediğin komutu macOS üzerinde çalıştır</small>
              </span>
            </button>
          )}
          <button className="back-button" type="button" onClick={() => setPanel(null)}>
            ← Giriş ekranına dön
          </button>
        </section>
        {showTerminal && (
          <RealTerminal
            title={panel === "student" ? "Öğrenci Terminali" : "Mac Terminal"}
            onClose={() => setShowTerminal(false)}
          />
        )}
        {flagResult && (
          <div className="flag-success" role="alert" aria-live="assertive">
            <button type="button" onClick={() => setFlagResult("")} aria-label="Bildirimleri kapat">×</button>
            <div className="success-icon">✓</div>
            <div>
              <strong>TEBRİKLER!</strong>
              <p>Görevi tamamladın ve bayrağı buldun.</p>
              <code>{flagResult}</code>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />
      <section className="login-card">
        <div className="brand-row">
          <div className="brand-mark">ET</div>
          <div>
            <strong>EM T PC</strong>
            <span>SİBER GÜVENLİK EĞİTİM MERKEZİ</span>
          </div>
        </div>

        <div className="login-copy">
          <p className="eyebrow">Güvenli öğrenme alanı</p>
          <h1>Bilgi, en güçlü<br /><em>savunmadır.</em></h1>
          <p>Devam etmek için erişim türünüzü seçin.</p>
        </div>

        <div className="login-options">
          <div className="login-option">
            <div className="option-icon admin-icon">⌘</div>
            <div className="option-content">
              <div>
                <h2>Admin Girişi</h2>
                <p>Yönetim paneline erişin</p>
              </div>
              <button className="outline-button" type="button" onClick={() => setShowPassword(true)}>
                Giriş yap <span>→</span>
              </button>
            </div>
          </div>
          <div className="login-option">
            <div className="option-icon student-icon">◎</div>
            <div className="option-content">
              <div>
                <h2>Öğrenci Girişi</h2>
                <p>Görevlerinize devam edin</p>
              </div>
              <button className="primary-button" type="button" onClick={openStudentPanel}>
                Devam et <span>→</span>
              </button>
            </div>
          </div>
        </div>

        {showPassword && (
          <form className="password-form" onSubmit={loginAsAdmin}>
            <label htmlFor="admin-username">Kullanıcı adı</label>
            <div className="password-row admin-credentials">
              <input
                autoFocus
                id="admin-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Admin kullanıcı adı"
              />
            </div>
            <label className="password-label" htmlFor="admin-password">Admin şifresi</label>
            <div className="password-row">
              <input
                autoFocus
                id="admin-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Şifrenizi girin"
              />
              <button className="primary-button" disabled={isLoading} type="submit">
                {isLoading ? "Kontrol ediliyor..." : "Onayla"}
              </button>
            </div>
          </form>
        )}
        {error && <p className="error-message" role="alert">{error}</p>}
        <p className="security-note"><span>●</span> Bağlantınız uçtan uca korunmaktadır</p>
      </section>
    </main>
  );
}

export default App;
