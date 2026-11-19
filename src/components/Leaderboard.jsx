import { useMemo } from "react";

const defaultPlayers = [
  { name: "Shadow", score: 500, level: "İleri" },
  { name: "Cipher", score: 400, level: "İleri" },
  { name: "Nova", score: 300, level: "Orta" },
];

export default function Leaderboard({ score = 0 }) {
  const levelData = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("studentLevel") || "null");
    } catch {
      return null;
    }
  }, []);

  const players = useMemo(() => {
    const student = {
      name: "Öğrenci",
      score,
      level: levelData?.level || "Başlangıç",
    };

    return [...defaultPlayers, student]
      .sort((first, second) => second.score - first.score)
      .slice(0, 5);
  }, [score, levelData]);

  return (
    <aside className="leaderboard-card">
      <div className="leaderboard-heading">
        <div>
          <p className="eyebrow">Haftalık sıra</p>
          <h2>En İyi Hackerlar</h2>
        </div>
        <span>Puan</span>
      </div>
      <ol className="leaderboard-list">
        {players.map((player, index) => (
          <li className={player.name === "Öğrenci" ? "current-player" : ""} key={player.name}>
            <span className={`leaderboard-rank rank-${index + 1}`}>{index + 1}</span>
            <div className="leaderboard-player">
              <strong>{player.name}</strong>
              <small>{player.level}</small>
            </div>
            <b>{player.score}</b>
          </li>
        ))}
      </ol>
    </aside>
  );
}
