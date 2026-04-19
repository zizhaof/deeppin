"use client";
// components/MergeDemo.tsx
// 演示二：合并输出流程（独立动画）

import { useEffect, useState } from "react";
import { useLangStore } from "@/stores/useLangStore";
import type { Lang } from "@/lib/i18n";

type Phase =
  | "idle"      // 展示三根针已选中状态
  | "clicking"  // 合并按钮点击动效
  | "selecting" // 弹窗：选择要合并的线程
  | "streaming" // 流式生成合并报告
  | "done";     // 报告完成，暂停后重置

const DELAYS: Record<Phase, number> = {
  idle:       1600,
  clicking:    500,
  selecting:   900,
  streaming:  3200,
  done:       3600,
};
const NEXT: Record<Phase, Phase> = {
  idle:       "clicking",
  clicking:   "selecting",
  selecting:  "streaming",
  streaming:  "done",
  done:       "idle",
};

type Content = {
  windowTitle: string;
  pinsReady: string;
  mergeOutput: string;
  chatLines: readonly [string, string];
  pins: readonly [string, string, string];
  threads: readonly { id: string; label: string; depth: number; checked: boolean }[];
  formats: readonly [string, string, string];
  selectThreads: string;
  selectAll: string;
  generate: string;
  download: string;
  copy: string;
  mergeText: string;
  captions: Record<Phase, string>;
};

const CONTENT: Record<Lang, Content> = {
  zh: {
    windowTitle: "如何设计一个分布式系统？",
    pinsReady: "3 根针已就绪",
    mergeOutput: "合并输出",
    chatLines: ["如何设计一个分布式系统？", "需要考虑 CAP 定理……Raft 协议……一致性哈希……"],
    pins: ["Raft 协议", "一致性哈希", "CAP 定理"],
    threads: [
      { id: "main",   label: "主线对话",    depth: 0, checked: false },
      { id: "raft",   label: "Raft 协议",   depth: 1, checked: true  },
      { id: "hash",   label: "一致性哈希",  depth: 1, checked: true  },
      { id: "cap",    label: "CAP 定理",    depth: 1, checked: true  },
      { id: "leader", label: "Leader 选举", depth: 2, checked: true  },
    ],
    formats: ["自由总结", "要点列表", "结构化分析"],
    selectThreads: "选择线程",
    selectAll: "全选",
    generate: "开始生成",
    download: "下载 Markdown",
    copy: "复制",
    mergeText:
`## 分布式系统设计要点

**核心权衡（CAP 定理）**
网络分区不可避免，系统须在 C 与 A 之间抉择。HBase 选强一致，Cassandra 优先高可用。

**共识机制（Raft 协议）**
通过 Leader 选举 + 日志复制确保线性一致，Leader 选举保证同一时刻只有一个合法 Leader。

**扩缩容策略（一致性哈希）**
将节点增减影响控制在 O(1/N)，适合无状态服务横向扩展，配合虚拟节点解决数据倾斜。

**结论**
三者相互补充：CAP 决定架构方向，Raft 保障写入一致，一致性哈希优化数据分布。`,
    captions: {
      idle:      "3 根针已就绪，点击合并输出",
      clicking:  "点击合并按钮…",
      selecting: "选择要合并的线程",
      streaming: "生成结构化报告中…",
      done:      "报告已生成，可下载或复制 ✓",
    },
  },
  en: {
    windowTitle: "How to design a distributed system?",
    pinsReady: "3 pins ready",
    mergeOutput: "Merge Output",
    chatLines: ["How to design a distributed system?", "Consider CAP theorem… Raft protocol… consistent hashing…"],
    pins: ["Raft protocol", "Consistent hashing", "CAP theorem"],
    threads: [
      { id: "main",   label: "Main thread",       depth: 0, checked: false },
      { id: "raft",   label: "Raft protocol",     depth: 1, checked: true  },
      { id: "hash",   label: "Consistent hashing",depth: 1, checked: true  },
      { id: "cap",    label: "CAP theorem",        depth: 1, checked: true  },
      { id: "leader", label: "Leader election",    depth: 2, checked: true  },
    ],
    formats: ["Free summary", "Bullet points", "Structured"],
    selectThreads: "Select threads",
    selectAll: "All",
    generate: "Generate",
    download: "Download Markdown",
    copy: "Copy",
    mergeText:
`## Distributed System Design

**Core trade-off (CAP theorem)**
Network partitions are inevitable — systems must choose between C and A. HBase favors consistency; Cassandra favors availability.

**Consensus (Raft protocol)**
Leader election + log replication ensures linearizability. At any moment, exactly one valid Leader exists.

**Scaling (Consistent hashing)**
Limits data movement to O(1/N) when nodes change. Pairs well with virtual nodes to avoid hotspots.

**Conclusion**
All three complement each other: CAP sets the architecture, Raft ensures write consistency, consistent hashing optimizes data placement.`,
    captions: {
      idle:      "3 pins ready — click Merge Output",
      clicking:  "Clicking merge button…",
      selecting: "Select threads to merge",
      streaming: "Generating structured report…",
      done:      "Report ready — download or copy ✓",
    },
  },
  ja: {
    windowTitle: "分散システムはどう設計する？",
    pinsReady: "3 本のピンが準備完了",
    mergeOutput: "統合出力",
    chatLines: ["分散システムはどう設計する？", "CAP 定理……Raft プロトコル……コンシステントハッシュ……を考慮する必要がある"],
    pins: ["Raft プロトコル", "コンシステントハッシュ", "CAP 定理"],
    threads: [
      { id: "main",   label: "メインスレッド",         depth: 0, checked: false },
      { id: "raft",   label: "Raft プロトコル",        depth: 1, checked: true  },
      { id: "hash",   label: "コンシステントハッシュ", depth: 1, checked: true  },
      { id: "cap",    label: "CAP 定理",               depth: 1, checked: true  },
      { id: "leader", label: "Leader 選挙",            depth: 2, checked: true  },
    ],
    formats: ["自由要約", "箇条書き", "構造化分析"],
    selectThreads: "スレッドを選択",
    selectAll: "全選択",
    generate: "生成開始",
    download: "Markdown ダウンロード",
    copy: "コピー",
    mergeText:
`## 分散システム設計のポイント

**中心的なトレードオフ（CAP 定理）**
ネットワーク分断は避けられず、C と A のどちらかを選ばなければならない。HBase は強一貫性、Cassandra は高可用性を優先する。

**合意機構（Raft プロトコル）**
Leader 選挙 + ログ複製で線形一貫性を保証。Leader 選挙により同時刻に正当な Leader は一つだけ。

**スケール戦略（コンシステントハッシュ）**
ノード増減の影響を O(1/N) に抑え、ステートレス拡張に適合。仮想ノードでデータ偏りを解消。

**結論**
三者は補完関係：CAP がアーキテクチャを決め、Raft が書き込み一貫性を担保し、コンシステントハッシュがデータ配置を最適化する。`,
    captions: {
      idle:      "3 本のピンが準備完了、統合出力をクリック",
      clicking:  "統合ボタンをクリック中…",
      selecting: "統合するスレッドを選択",
      streaming: "構造化レポートを生成中…",
      done:      "レポート完成、ダウンロード／コピー可能 ✓",
    },
  },
  ko: {
    windowTitle: "분산 시스템을 어떻게 설계할까?",
    pinsReady: "3개의 핀 준비 완료",
    mergeOutput: "병합 출력",
    chatLines: ["분산 시스템을 어떻게 설계할까?", "CAP 정리, Raft 프로토콜, 일관성 해싱을 고려해야……"],
    pins: ["Raft 프로토콜", "일관성 해싱", "CAP 정리"],
    threads: [
      { id: "main",   label: "메인 스레드",      depth: 0, checked: false },
      { id: "raft",   label: "Raft 프로토콜",    depth: 1, checked: true  },
      { id: "hash",   label: "일관성 해싱",      depth: 1, checked: true  },
      { id: "cap",    label: "CAP 정리",         depth: 1, checked: true  },
      { id: "leader", label: "리더 선출",        depth: 2, checked: true  },
    ],
    formats: ["자유 요약", "요점 목록", "구조화 분석"],
    selectThreads: "스레드 선택",
    selectAll: "전체",
    generate: "생성 시작",
    download: "Markdown 다운로드",
    copy: "복사",
    mergeText:
`## 분산 시스템 설계 요점

**핵심 트레이드오프(CAP 정리)**
네트워크 분할은 불가피하며, 시스템은 C와 A 중 하나를 선택해야 한다. HBase는 강한 일관성, Cassandra는 고가용성을 우선한다.

**합의 메커니즘(Raft 프로토콜)**
리더 선출 + 로그 복제로 선형 일관성을 보장. 리더 선출은 같은 시점에 하나의 유효 리더만 존재하도록 한다.

**스케일 전략(일관성 해싱)**
노드 변경의 영향을 O(1/N)로 제한하여 무상태 서비스의 수평 확장에 적합. 가상 노드로 데이터 편향 해소.

**결론**
셋은 서로 보완한다: CAP는 아키텍처 방향을 정하고, Raft는 쓰기 일관성을 보장하며, 일관성 해싱은 데이터 분포를 최적화한다.`,
    captions: {
      idle:      "3개의 핀 준비 완료 — 병합 출력 클릭",
      clicking:  "병합 버튼 클릭 중…",
      selecting: "병합할 스레드 선택",
      streaming: "구조화 리포트 생성 중…",
      done:      "리포트 준비 완료 — 다운로드 또는 복사 ✓",
    },
  },
  es: {
    windowTitle: "¿Cómo diseñar un sistema distribuido?",
    pinsReady: "3 anclajes listos",
    mergeOutput: "Fusionar salida",
    chatLines: ["¿Cómo diseñar un sistema distribuido?", "Hay que considerar el teorema CAP, Raft, hashing consistente…"],
    pins: ["Protocolo Raft", "Hashing consistente", "Teorema CAP"],
    threads: [
      { id: "main",   label: "Hilo principal",        depth: 0, checked: false },
      { id: "raft",   label: "Protocolo Raft",        depth: 1, checked: true  },
      { id: "hash",   label: "Hashing consistente",   depth: 1, checked: true  },
      { id: "cap",    label: "Teorema CAP",            depth: 1, checked: true  },
      { id: "leader", label: "Elección de líder",      depth: 2, checked: true  },
    ],
    formats: ["Resumen libre", "Puntos clave", "Estructurado"],
    selectThreads: "Seleccionar hilos",
    selectAll: "Todo",
    generate: "Generar",
    download: "Descargar Markdown",
    copy: "Copiar",
    mergeText:
`## Diseño de sistemas distribuidos

**Compromiso central (teorema CAP)**
Las particiones de red son inevitables — los sistemas deben elegir entre C y A. HBase favorece la consistencia; Cassandra, la disponibilidad.

**Consenso (protocolo Raft)**
Elección de líder + replicación de log garantizan linealizabilidad. En cualquier momento existe exactamente un líder válido.

**Escalado (hashing consistente)**
Limita el movimiento de datos a O(1/N) cuando cambian los nodos. Se combina bien con nodos virtuales para evitar puntos calientes.

**Conclusión**
Los tres se complementan: CAP define la arquitectura, Raft garantiza la consistencia de escritura y el hashing consistente optimiza la distribución de datos.`,
    captions: {
      idle:      "3 anclajes listos — haz clic en Fusionar",
      clicking:  "Haciendo clic en Fusionar…",
      selecting: "Selecciona los hilos a fusionar",
      streaming: "Generando informe estructurado…",
      done:      "Informe listo — descarga o copia ✓",
    },
  },
  fr: {
    windowTitle: "Comment concevoir un système distribué ?",
    pinsReady: "3 épingles prêtes",
    mergeOutput: "Fusionner la sortie",
    chatLines: ["Comment concevoir un système distribué ?", "Il faut considérer le théorème CAP, Raft, le hachage cohérent…"],
    pins: ["Protocole Raft", "Hachage cohérent", "Théorème CAP"],
    threads: [
      { id: "main",   label: "Fil principal",         depth: 0, checked: false },
      { id: "raft",   label: "Protocole Raft",        depth: 1, checked: true  },
      { id: "hash",   label: "Hachage cohérent",      depth: 1, checked: true  },
      { id: "cap",    label: "Théorème CAP",           depth: 1, checked: true  },
      { id: "leader", label: "Élection du leader",     depth: 2, checked: true  },
    ],
    formats: ["Résumé libre", "Points clés", "Structuré"],
    selectThreads: "Sélectionner les fils",
    selectAll: "Tout",
    generate: "Générer",
    download: "Télécharger Markdown",
    copy: "Copier",
    mergeText:
`## Conception de système distribué

**Compromis central (théorème CAP)**
Les partitions réseau sont inévitables — les systèmes doivent choisir entre C et A. HBase privilégie la cohérence ; Cassandra, la disponibilité.

**Consensus (protocole Raft)**
L'élection d'un leader + la réplication du journal assurent la linéarisabilité. À tout moment, il existe exactement un leader valide.

**Mise à l'échelle (hachage cohérent)**
Limite le déplacement des données à O(1/N) lors d'un changement de nœuds. S'associe bien aux nœuds virtuels pour éviter les points chauds.

**Conclusion**
Les trois se complètent : CAP définit l'architecture, Raft assure la cohérence des écritures, le hachage cohérent optimise la distribution.`,
    captions: {
      idle:      "3 épingles prêtes — cliquez sur Fusionner",
      clicking:  "Clic sur Fusionner…",
      selecting: "Sélectionner les fils à fusionner",
      streaming: "Génération du rapport structuré…",
      done:      "Rapport prêt — télécharger ou copier ✓",
    },
  },
  de: {
    windowTitle: "Wie entwirft man ein verteiltes System?",
    pinsReady: "3 Pins bereit",
    mergeOutput: "Ausgabe zusammenführen",
    chatLines: ["Wie entwirft man ein verteiltes System?", "Man muss CAP-Theorem, Raft, konsistentes Hashing berücksichtigen…"],
    pins: ["Raft-Protokoll", "Konsistentes Hashing", "CAP-Theorem"],
    threads: [
      { id: "main",   label: "Hauptthread",            depth: 0, checked: false },
      { id: "raft",   label: "Raft-Protokoll",         depth: 1, checked: true  },
      { id: "hash",   label: "Konsistentes Hashing",   depth: 1, checked: true  },
      { id: "cap",    label: "CAP-Theorem",             depth: 1, checked: true  },
      { id: "leader", label: "Leader-Wahl",             depth: 2, checked: true  },
    ],
    formats: ["Freies Resümee", "Stichpunkte", "Strukturiert"],
    selectThreads: "Threads wählen",
    selectAll: "Alle",
    generate: "Generieren",
    download: "Markdown herunterladen",
    copy: "Kopieren",
    mergeText:
`## Entwurf verteilter Systeme

**Zentraler Kompromiss (CAP-Theorem)**
Netzwerkpartitionen sind unvermeidlich — Systeme müssen zwischen C und A wählen. HBase bevorzugt Konsistenz; Cassandra bevorzugt Verfügbarkeit.

**Konsens (Raft-Protokoll)**
Leader-Wahl + Log-Replikation sorgen für Linearisierbarkeit. Zu jedem Zeitpunkt gibt es genau einen gültigen Leader.

**Skalierung (konsistentes Hashing)**
Begrenzt Datenbewegung auf O(1/N) bei Knotenänderungen. Kombiniert mit virtuellen Knoten verhindert Hotspots.

**Fazit**
Die drei ergänzen sich: CAP setzt die Architektur, Raft sichert Schreibkonsistenz, konsistentes Hashing optimiert die Datenverteilung.`,
    captions: {
      idle:      "3 Pins bereit — Ausgabe zusammenführen klicken",
      clicking:  "Klicke auf Zusammenführen…",
      selecting: "Threads zum Zusammenführen wählen",
      streaming: "Strukturierter Bericht wird generiert…",
      done:      "Bericht fertig — herunterladen oder kopieren ✓",
    },
  },
  pt: {
    windowTitle: "Como projetar um sistema distribuído?",
    pinsReady: "3 pins prontos",
    mergeOutput: "Mesclar saída",
    chatLines: ["Como projetar um sistema distribuído?", "É preciso considerar o teorema CAP, Raft, hashing consistente…"],
    pins: ["Protocolo Raft", "Hashing consistente", "Teorema CAP"],
    threads: [
      { id: "main",   label: "Thread principal",       depth: 0, checked: false },
      { id: "raft",   label: "Protocolo Raft",         depth: 1, checked: true  },
      { id: "hash",   label: "Hashing consistente",    depth: 1, checked: true  },
      { id: "cap",    label: "Teorema CAP",             depth: 1, checked: true  },
      { id: "leader", label: "Eleição de líder",        depth: 2, checked: true  },
    ],
    formats: ["Resumo livre", "Tópicos", "Estruturado"],
    selectThreads: "Selecionar threads",
    selectAll: "Tudo",
    generate: "Gerar",
    download: "Baixar Markdown",
    copy: "Copiar",
    mergeText:
`## Projeto de sistema distribuído

**Compromisso central (teorema CAP)**
Partições de rede são inevitáveis — sistemas devem escolher entre C e A. HBase prioriza consistência; Cassandra prioriza disponibilidade.

**Consenso (protocolo Raft)**
Eleição de líder + replicação de log garantem linearização. A qualquer momento, existe exatamente um líder válido.

**Escala (hashing consistente)**
Limita a movimentação de dados a O(1/N) quando nós mudam. Combina bem com nós virtuais para evitar hotspots.

**Conclusão**
Os três se complementam: CAP define a arquitetura, Raft garante consistência de escrita, hashing consistente otimiza a distribuição dos dados.`,
    captions: {
      idle:      "3 pins prontos — clique em Mesclar",
      clicking:  "Clicando em Mesclar…",
      selecting: "Selecione os threads para mesclar",
      streaming: "Gerando relatório estruturado…",
      done:      "Relatório pronto — baixar ou copiar ✓",
    },
  },
  ru: {
    windowTitle: "Как спроектировать распределённую систему?",
    pinsReady: "3 булавки готовы",
    mergeOutput: "Объединить вывод",
    chatLines: ["Как спроектировать распределённую систему?", "Нужно учесть теорему CAP, Raft, согласованное хеширование…"],
    pins: ["Протокол Raft", "Согласованное хеширование", "Теорема CAP"],
    threads: [
      { id: "main",   label: "Главная ветка",               depth: 0, checked: false },
      { id: "raft",   label: "Протокол Raft",               depth: 1, checked: true  },
      { id: "hash",   label: "Согласованное хеширование",   depth: 1, checked: true  },
      { id: "cap",    label: "Теорема CAP",                  depth: 1, checked: true  },
      { id: "leader", label: "Выбор лидера",                 depth: 2, checked: true  },
    ],
    formats: ["Свободное резюме", "Ключевые пункты", "Структурировано"],
    selectThreads: "Выбрать ветки",
    selectAll: "Все",
    generate: "Сгенерировать",
    download: "Скачать Markdown",
    copy: "Копировать",
    mergeText:
`## Проектирование распределённой системы

**Центральный компромисс (теорема CAP)**
Сетевые разделения неизбежны — системы должны выбирать между C и A. HBase выбирает согласованность, Cassandra — доступность.

**Консенсус (протокол Raft)**
Выбор лидера + репликация журнала обеспечивают линеаризуемость. В любой момент существует ровно один валидный лидер.

**Масштабирование (согласованное хеширование)**
Ограничивает перемещение данных O(1/N) при смене узлов. Хорошо сочетается с виртуальными узлами, чтобы избежать перекосов.

**Вывод**
Три подхода дополняют друг друга: CAP задаёт архитектуру, Raft обеспечивает согласованность записи, согласованное хеширование оптимизирует распределение данных.`,
    captions: {
      idle:      "3 булавки готовы — нажмите Объединить",
      clicking:  "Нажимаем Объединить…",
      selecting: "Выберите ветки для объединения",
      streaming: "Генерируется структурированный отчёт…",
      done:      "Отчёт готов — скачайте или скопируйте ✓",
    },
  },
};

function SimpleMd({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split("\n").map((line, i) => {
        if (!line) return <div key={i} className="h-0.5" />;
        if (line.startsWith("## "))
          return <p key={i} className="text-[12px] font-semibold text-hi">{line.slice(3)}</p>;
        if (line.startsWith("**")) {
          const parts = line.split("**");
          return (
            <p key={i} className="text-[11px] text-lo leading-relaxed">
              {parts.map((p, j) => j % 2 === 1
                ? <strong key={j} className="text-md font-medium">{p}</strong>
                : p
              )}
            </p>
          );
        }
        return <p key={i} className="text-[11px] text-lo leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function MergeDemo() {
  const lang = useLangStore((s) => s.lang);
  const c = CONTENT[lang];

  const [phase, setPhase] = useState<Phase>("idle");
  const [streamLen, setStreamLen] = useState(0);

  // 切换语言时重置动画 / Reset when the UI language changes
  useEffect(() => {
    setPhase("idle");
    setStreamLen(0);
  }, [lang]);

  useEffect(() => {
    const t = setTimeout(() => setPhase((p) => NEXT[p]), DELAYS[phase]);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "idle") setStreamLen(0);
  }, [phase]);

  useEffect(() => {
    if (phase !== "streaming") return;
    if (streamLen >= c.mergeText.length) return;
    const t = setTimeout(() => setStreamLen((n) => n + 5), 22);
    return () => clearTimeout(t);
  }, [phase, streamLen, c.mergeText]);

  const showModal   = ["selecting","streaming","done"].includes(phase);
  const showContent = ["streaming","done"].includes(phase);
  const btnPulsing  = phase === "clicking";

  return (
    <div className="w-full max-w-[700px] select-none">
      <div
        className="relative rounded-2xl border border-base overflow-hidden shadow-[0_0_0_1px_rgba(99,102,241,0.1),0_20px_60px_rgba(0,0,0,0.3)]"
        style={{ background: "var(--color-bg-base, #0f1117)" }}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

        {/* 标题栏 */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-subtle">
          <div className="flex gap-1.5">
            {["bg-red-500/40","bg-yellow-500/40","bg-green-500/40"].map((cl) => (
              <div key={cl} className={`w-2.5 h-2.5 rounded-full ${cl}`} />
            ))}
          </div>
          <span className="text-[11px] text-faint ml-2 font-medium">{c.windowTitle}</span>
          {/* 概览栏里的 Merge 按钮（右侧） */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-faint">{c.pinsReady}</span>
            <div
              className="flex items-center gap-1.5 border rounded-lg px-2.5 py-1 transition-all"
              style={{
                background: btnPulsing ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.12)",
                borderColor: btnPulsing ? "rgba(99,102,241,0.7)" : "rgba(99,102,241,0.25)",
                boxShadow: btnPulsing ? "0 0 12px rgba(99,102,241,0.4)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              <svg className="w-3 h-3 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span className="text-[10px] text-indigo-300 font-medium">{c.mergeOutput}</span>
            </div>
          </div>
        </div>

        {/* 主体：简化的对话背景 */}
        <div className="relative px-8 py-6" style={{ minHeight: 260 }}>
          {/* 背景对话（模糊状态） */}
          <div className={`space-y-3 transition-all duration-400 ${showModal ? "opacity-20 blur-[1px]" : "opacity-60"}`}>
            {c.chatLines.map((line, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"} gap-2`}>
                {i % 2 === 1 && (
                  <div className="w-5 h-5 rounded-full border border-base flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(99,102,241,0.1)" }}>
                    <svg className="w-2.5 h-2.5 text-indigo-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
                    </svg>
                  </div>
                )}
                <div
                  className="text-[11px] leading-relaxed px-3 py-1.5 rounded-xl max-w-[70%]"
                  style={{ background: i % 2 === 0 ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.05)", border: "1px solid rgba(99,102,241,0.15)" }}
                >
                  {line}
                </div>
              </div>
            ))}
            {/* 高亮的三个锚点提示 */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {c.pins.map((pin) => (
                <span key={pin} className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-500/30 text-indigo-300/70" style={{ background: "rgba(99,102,241,0.1)" }}>
                  📍 {pin}
                </span>
              ))}
            </div>
          </div>

          {/* ── Merge 弹窗 ── */}
          <div
            className="absolute inset-x-4 rounded-2xl border border-base shadow-2xl"
            style={{
              top: showModal ? 16 : 340,
              bottom: showModal ? 0 : "auto",
              transition: "top 0.45s cubic-bezier(0.16,1,0.3,1)",
              zIndex: 20,
              background: "#131520",
              borderColor: "rgba(99,102,241,0.2)",
            }}
          >
            {/* 弹窗标题 */}
            <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span className="text-[12px] font-semibold text-hi">{c.mergeOutput}</span>
              <div className="ml-auto flex items-center gap-2">
                {c.formats.map((f, i) => (
                  <span key={f} className="text-[9px] px-2 py-0.5 rounded-full border transition-all"
                    style={{
                      background: i === 0 ? "rgba(99,102,241,0.2)" : "transparent",
                      borderColor: i === 0 ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.08)",
                      color: i === 0 ? "rgb(165,180,252)" : "rgb(100,116,139)",
                    }}
                  >{f}</span>
                ))}
              </div>
            </div>

            <div className="flex" style={{ height: 180 }}>
              {/* 左：线程选择列表 */}
              <div className="border-r flex-shrink-0 px-3 py-3 space-y-1.5 overflow-y-auto" style={{ width: 160, borderColor: "rgba(99,102,241,0.12)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] text-faint uppercase tracking-wide">{c.selectThreads}</span>
                  <span className="text-[9px] text-indigo-400">{c.selectAll}</span>
                </div>
                {c.threads.map((th) => (
                  <div key={th.id} className="flex items-center gap-1.5" style={{ paddingLeft: th.depth * 10 }}>
                    <div
                      className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0"
                      style={{
                        background: th.checked ? "rgba(99,102,241,0.7)" : "rgba(255,255,255,0.06)",
                        border: `1px solid ${th.checked ? "rgba(99,102,241,0.8)" : "rgba(255,255,255,0.12)"}`,
                      }}
                    >
                      {th.checked && (
                        <svg className="w-2 h-2 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M2 6l3 3 5-5"/>
                        </svg>
                      )}
                    </div>
                    <span className="text-[10px] truncate" style={{ color: th.checked ? "rgb(165,180,252)" : "rgb(100,116,139)" }}>
                      {th.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* 右：输出内容 */}
              <div className="flex-1 px-4 py-3 overflow-hidden relative">
                {!showContent ? (
                  <div className="h-full flex items-center justify-center">
                    <button
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-medium text-white"
                      style={{ background: "rgba(99,102,241,0.7)", border: "1px solid rgba(99,102,241,0.5)" }}
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                      </svg>
                      {c.generate}
                    </button>
                  </div>
                ) : (
                  <div className="overflow-y-auto h-full pr-1">
                    <SimpleMd text={c.mergeText.slice(0, streamLen)} />
                    {phase === "streaming" && streamLen < c.mergeText.length && (
                      <span className="inline-block w-0.5 h-3 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                    )}
                    {phase === "done" && (
                      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t" style={{ borderColor: "rgba(99,102,241,0.15)" }}>
                        <button className="flex items-center gap-1.5 text-[10px] text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/25" style={{ background: "rgba(99,102,241,0.1)" }}>
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                          </svg>
                          {c.download}
                        </button>
                        <button className="flex items-center gap-1.5 text-[10px] text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/25" style={{ background: "rgba(99,102,241,0.1)" }}>
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                          </svg>
                          {c.copy}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 状态栏 */}
        <div className="border-t border-subtle px-5 py-2 flex items-center justify-between">
          <div className="flex gap-1.5">
            {(["idle","clicking","selecting","streaming","done"] as Phase[]).map((p) => (
              <div key={p} className="h-1 rounded-full transition-all duration-300"
                style={{ width: phase === p ? "18px" : "5px", background: phase === p ? "rgb(99,102,241)" : "rgba(99,102,241,0.2)" }} />
            ))}
          </div>
          <span className="text-[10px] text-faint">{c.captions[phase]}</span>
        </div>
      </div>
    </div>
  );
}
