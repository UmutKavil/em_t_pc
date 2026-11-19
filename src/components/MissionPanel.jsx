import { useState } from "react";

const missions = [
  {
    id: 1,
    title: "Hedef sunucuyu keşfet",
    description: "DVWA laboratuvarındaki canlı hedefi Nmap ile keşfet.",
    hint: "nmap -sV <hedef-ip>",
  },
  {
    id: 2,
    title: "Açık bir port bul",
    description: "Nmap çıktısını incele ve FTP veya HTTP gibi açık bir servis belirle.",
    hint: "nmap -p 21,80,445 -sV <hedef-ip>",
  },
  {
    id: 3,
    title: "Zafiyeti sömür ve bayrağı yakala",
    description: "DVWA'ya bağlantı kur, zafiyeti araştır ve bayrağı terminale doğrula.",
    hint: "Görev bayrağını Rust doğrulama komutuyla gönder: FLAG{dvwa_saldiri}",
  },
];

export default function MissionPanel({ completedMissions = [], targetInfo }) {
  const [openHint, setOpenHint] = useState(null);

  return (
    <div className="mission-panel">
      <div className="mission-heading">
        <div>
          <p className="eyebrow">Saldırı Senaryoları</p>
          <h2>Görev Müfredatı</h2>
        </div>
        {targetInfo && (
          <div className="target-address">
            <span>Hedef</span>
            <strong>{targetInfo.host_url}</strong>
          </div>
        )}
      </div>

      <div className="mission-list">
        {missions.map((mission) => {
          const completed = completedMissions.includes(mission.id);
          return (
            <article className={`mission-card ${completed ? "completed" : ""}`} key={mission.id}>
              <div className="mission-number">{completed ? "✓" : mission.id}</div>
              <div className="mission-content">
                <h3>{mission.title}</h3>
                <p>{mission.description}</p>
                {openHint === mission.id && (
                  <code className="mission-hint">{mission.hint}</code>
                )}
              </div>
              <button
                type="button"
                className="hint-button"
                onClick={() => setOpenHint(openHint === mission.id ? null : mission.id)}
              >
                {openHint === mission.id ? "İpucunu Gizle" : "İpucu"}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}
