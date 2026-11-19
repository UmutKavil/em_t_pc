import { useState } from "react";

const questions = [
  {
    question: "Linux'ta dizinleri listelemek için hangi komut kullanılır?",
    options: ["ls", "dir", "list", "show"],
    answer: 0,
  },
  {
    question: "IP adresi nedir?",
    options: [
      "Bir bilgisayarın ağdaki kimlik adresi",
      "Bir dosya türü",
      "Bir Linux dağıtımı",
      "Bir şifreleme algoritması",
    ],
    answer: 0,
  },
  {
    question: "Terminal nedir?",
    options: [
      "Metin tabanlı komut çalıştırma arayüzü",
      "Bir grafik düzenleyici",
      "Bir tarayıcı",
      "Bir veri tabanı",
    ],
    answer: 0,
  },
  {
    question: "Linux'ta mevcut dizini göstermek için hangi komut kullanılır?",
    options: ["pwd", "cd", "whoami", "mkdir"],
    answer: 0,
  },
  {
    question: "Bir dizine gitmek için hangi komut kullanılır?",
    options: ["cd", "ls", "cp", "rm"],
    answer: 0,
  },
  {
    question: "Yeni bir dizin oluşturmak için hangi komut kullanılır?",
    options: ["mkdir", "touch", "mv", "cat"],
    answer: 0,
  },
  {
    question: "Boş veya metin dosyası oluşturmak için hangi komut kullanılabilir?",
    options: ["touch", "mkdir", "ping", "whoami"],
    answer: 0,
  },
  {
    question: "Dosya veya dizinleri kopyalamak için hangi komut kullanılır?",
    options: ["cp", "mv", "rm", "pwd"],
    answer: 0,
  },
  {
    question: "Dosya veya dizinleri taşımak veya yeniden adlandırmak için hangi komut kullanılır?",
    options: ["mv", "cp", "cat", "ls"],
    answer: 0,
  },
  {
    question: "Dosyayı veya dizini silmek için hangi komut kullanılır?",
    options: ["rm", "del", "kill", "remove"],
    answer: 0,
  },
  {
    question: "Bir dosyanın içeriğini okumak için hangi komut kullanılır?",
    options: ["cat", "read", "open", "view"],
    answer: 0,
  },
  {
    question: "Ağ bağlantısını test etmek için sıklıkla kullanılan komut hangisidir?",
    options: ["ping", "ls", "chmod", "sudo"],
    answer: 0,
  },
  {
    question: "Root kullanıcısına geçici olarak yetki vermek için kullanılan komut hangisidir?",
    options: ["sudo", "admin", "rooted", "grant"],
    answer: 0,
  },
  {
    question: "Veriyi okunamaz hale getirerek gizlemek için kullanılan işlemin adı nedir?",
    options: ["Şifreleme", "Biçimlendirme", "Dizinleme", "Yedekleme"],
    answer: 0,
  },
  {
    question: "Bir sistemi parolaları tahmin ederek ele geçirmeye çalışma tekniğine ne denir?",
    options: ["Brute force", "Firewall", "VPN", "Subnet"],
    answer: 0,
  },
  {
    question: "Kötü amaçlı yazılımların genel adıdır?",
    options: ["Malware", "Hardware", "Middleware", "Firmware"],
    answer: 0,
  },
  {
    question: "Gelen ve çıkan ağ trafiğini kontrol eden güvenlik sistemi nedir?",
    options: ["Firewall", "DNS", "Router", "Switch"],
    answer: 0,
  },
  {
    question: "Alan adlarını IP adreslerine çeviren sistem nedir?",
    options: ["DNS", "VPN", "HTTP", "SSH"],
    answer: 0,
  },
  {
    question: "VPN temel olarak ne sağlar?",
    options: [
      "Şifreli ve özel ağ bağlantısı",
      "Daha hızlı dosya silme",
      "Linux dağıtımı",
      "Ekran paylaşımı",
    ],
    answer: 0,
  },
  {
    question: "HTTPS'yi HTTP'den ayıran temel özellik nedir?",
    options: [
      "Verilerin şifreli aktarılması",
      "Daha fazla dosya taşıması",
      "Linux komutları çalıştırması",
      "IP adresi değiştirmesi",
    ],
    answer: 0,
  },
];

function getLevel(correctCount) {
  if (correctCount <= 7) return "Başlangıç";
  if (correctCount <= 14) return "Orta";
  return "İleri";
}

export default function LevelTest({ onFinish }) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState(Array(questions.length).fill(null));
  const [selectedOption, setSelectedOption] = useState(null);
  const [finished, setFinished] = useState(false);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState("");

  const selectOption = (optionIndex) => {
    setSelectedOption(optionIndex);
    setAnswers((previousAnswers) => {
      const updatedAnswers = [...previousAnswers];
      updatedAnswers[currentQuestion] = optionIndex;
      return updatedAnswers;
    });
  };

  const nextQuestion = () => {
    if (selectedOption === null) return;

    if (currentQuestion === questions.length - 1) {
      const finalAnswers = [...answers];
      finalAnswers[currentQuestion] = selectedOption;

      const correctAnswers = finalAnswers.reduce(
        (total, answer, index) =>
          total + (answer === questions[index].answer ? 1 : 0),
        0,
      );
      const finalLevel = getLevel(correctAnswers);

      setAnswers(finalAnswers);
      setScore(correctAnswers);
      setLevel(finalLevel);
      setFinished(true);

      localStorage.setItem(
        "studentLevel",
        JSON.stringify({
          level: finalLevel,
          score: correctAnswers,
          total: questions.length,
          completedAt: new Date().toISOString(),
        }),
      );
      return;
    }

    const nextIndex = currentQuestion + 1;
    setCurrentQuestion(nextIndex);
    setSelectedOption(answers[nextIndex]);
  };

  if (finished) {
    return (
      <main className="level-test-shell">
        <section className="level-test-card level-test-result">
          <p className="eyebrow">Seviye tespit sınavı tamamlandı</p>
          <div className="level-result-icon">✓</div>
          <h1>Sonucun hazır</h1>
          <h2>{score}/{questions.length} doğru</h2>
          <p className="level-result-description">
            Seviyen: <strong>{level}</strong>
          </p>
          <button type="button" className="level-test-next" onClick={onFinish}>
            Öğrenci Görev Paneline Geç →
          </button>
        </section>
      </main>
    );
  }

  const question = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  return (
    <main className="level-test-shell">
      <section className="level-test-card">
        <div className="level-test-header">
          <div>
            <p className="eyebrow">Seviye Tespit Sınavı</p>
            <h1>Soru {currentQuestion + 1}/{questions.length}</h1>
          </div>
          <span>{Math.round(progress)}%</span>
        </div>

        <div className="level-test-progress">
          <div style={{ width: `${progress}%` }} />
        </div>

        <h2 className="level-test-question">{question.question}</h2>

        <div className="level-test-options">
          {question.options.map((option, index) => (
            <button
              type="button"
              key={option}
              className={
                selectedOption === index
                  ? "level-test-option selected"
                  : "level-test-option"
              }
              onClick={() => selectOption(index)}
            >
              <span>{String.fromCharCode(65 + index)}</span>
              <strong>{option}</strong>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="level-test-next"
          disabled={selectedOption === null}
          onClick={nextQuestion}
        >
          {currentQuestion === questions.length - 1
            ? "Testi Bitir"
            : "Sonraki Soru"}
          <span>→</span>
        </button>
      </section>
    </main>
  );
}
