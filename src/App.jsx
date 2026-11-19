import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import LevelTest from "./components/LevelTest";
import Leaderboard from "./components/Leaderboard";
import MissionPanel from "./components/MissionPanel";
import logo from "./assets/logo.png";

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

function App() {
  const [panel, setPanel] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [flagResult, setFlagResult] = useState("");
  const [showLevelTest, setShowLevelTest] = useState(false);
  const [studentScore, setStudentScore] = useState(() => {
    const savedScore = Number(localStorage.getItem("studentScore"));
    return Number.isFinite(savedScore) ? savedScore : 0;
  });
  const [targetInfo, setTargetInfo] = useState(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [completedMissions, setCompletedMissions] = useState([]);

  useEffect(() => {
    let unlistenFlag;
    let unlistenTask;

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
      }
    }).then((stopListening) => {
      unlistenFlag = stopListening;
    });

    listen("task-completed", (event) => {
      const payload = event.payload;
      setCompletedMissions((missions) =>
        missions.includes(payload.mission_id)
          ? missions
          : [...missions, payload.mission_id],
      );
      setStudentScore((currentScore) => {
        const nextScore = currentScore + payload.points;
        localStorage.setItem("studentScore", String(nextScore));
        return nextScore;
      });
    }).then((stopListening) => {
      unlistenTask = stopListening;
    });

    return () => {
      if (unlistenFlag) unlistenFlag();
      if (unlistenTask) unlistenTask();
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

  const startTargetLaboratory = async () => {
    setTargetLoading(true);
    setError("");
    try {
      const result = await invoke("start_vulnerable_target");
      setTargetInfo(result);
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : String(commandError));
    } finally {
      setTargetLoading(false);
    }
  };

  const openTerminalWindow = async (title) => {
    const existingWindow = WebviewWindow.getByLabel("terminal");
    if (existingWindow) {
      await existingWindow.setTitle(`EM T PC — ${title}`);
      await existingWindow.show();
      await existingWindow.setFocus();
      return;
    }

    const terminalWindow = new WebviewWindow("terminal", {
      url: `/terminal.html?title=${encodeURIComponent(title)}`,
      title: `EM T PC — ${title}`,
      width: 900,
      height: 600,
      minWidth: 700,
      minHeight: 420,
      resizable: true,
      decorations: true,
    });

    terminalWindow.once("tauri://created", () => {
      terminalWindow.setFocus();
    });
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
              <MissionPanel
                completedMissions={completedMissions}
                targetInfo={targetInfo}
              />
              <Leaderboard score={studentScore} />
            </div>
          )}
          {panel === "admin" && (
            <>
              <button className="terminal-launch-button" type="button" onClick={() => openTerminalWindow("Admin Terminal")}>
                <span className="terminal-launch-icon">›_</span>
                <span>
                  <strong>Gerçek Terminali Aç</strong>
                  <small>macOS komutlarını çalıştır</small>
                </span>
              </button>
              <button className="terminal-launch-button" type="button" disabled={targetLoading} onClick={startTargetLaboratory}>
                <span className="terminal-launch-icon">⬡</span>
                <span>
                  <strong>{targetLoading ? "Laboratuvar Başlatılıyor..." : "Hedef Laboratuvarı Başlat"}</strong>
                  <small>DVWA zafiyetli hedefini Docker'da başlat</small>
                </span>
              </button>
            </>
          )}
          {panel === "admin" && targetInfo && (
            <div className="target-info-card">
              <p className="eyebrow">Laboratuvar Hazır</p>
              <h2>{targetInfo.name}</h2>
              <div>
                <span>Container IP</span>
                <strong>{targetInfo.container_ip}</strong>
              </div>
              <div>
                <span>Web adresi</span>
                <strong>{targetInfo.host_url}</strong>
              </div>
            </div>
          )}
          {panel === "student" && (
            <button className="terminal-launch-button student-terminal-launch" type="button" onClick={() => openTerminalWindow("Öğrenci Terminali")}>
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
          <img className="login-logo" src={logo} alt="Fesli Profil logosu" />
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
