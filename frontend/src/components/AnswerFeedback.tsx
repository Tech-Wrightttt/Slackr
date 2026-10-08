import React, { useEffect } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { SRScheduleRecord } from '../db/schema';

const TOPIC_YOUTUBE_MAP: Record<string, { label: string; searchQuery: string }[]> = {
  'networking': [
    { label: 'OSI 7-Layer Model', searchQuery: 'OSI model 7 layers explained' },
    { label: 'TCP/IP Protocol Suite & Subnetting', searchQuery: 'TCP IP subnetting CIDR tutorial' },
    { label: 'DNS, DHCP, HTTP/HTTPS Protocols', searchQuery: 'DNS DHCP HTTP protocols networking' },
  ],
  'data-structures': [
    { label: 'Data Structures Overview', searchQuery: 'data structures explained algorithms' },
    { label: 'Binary Search Trees & Heaps', searchQuery: 'binary search tree heap data structure' },
    { label: 'Hash Tables & Collisions', searchQuery: 'hash table collision resolution' },
  ],
  'algorithms': [
    { label: 'Sorting Algorithms Visualized', searchQuery: 'sorting algorithms quicksort mergesort' },
    { label: 'Big-O Notation & Complexity', searchQuery: 'Big O notation time space complexity' },
    { label: 'Graph Algorithms (Dijkstra, BFS/DFS)', searchQuery: 'Dijkstra BFS DFS graph algorithms' },
  ],
  'database': [
    { label: 'SQL Fundamentals & Joins', searchQuery: 'SQL database tutorial beginner joins' },
    { label: 'Database Normalization (1NF to BCNF)', searchQuery: 'database normalization 1NF 2NF 3NF BCNF' },
    { label: 'ACID Properties & Transactions', searchQuery: 'database transactions ACID properties' },
  ],
  'information-management': [
    { label: 'Relational Database Design', searchQuery: 'relational database ER diagram design' },
    { label: 'SQL Indexing & Query Optimization', searchQuery: 'SQL indexing query execution plan' },
  ],
  'software-engineering': [
    { label: 'SDLC Models (Agile, Waterfall, Scrum)', searchQuery: 'software development life cycle agile waterfall' },
    { label: 'Design Patterns (GoF Overview)', searchQuery: 'software design patterns GoF explained' },
    { label: 'Software Testing (White-box, Black-box)', searchQuery: 'software testing white box black box' },
  ],
  'digital-logic': [
    { label: 'Boolean Algebra & Karnaugh Maps', searchQuery: 'boolean algebra K-map simplification' },
    { label: 'Logic Gates & Truth Tables', searchQuery: 'logic gates truth tables tutorial' },
    { label: 'Flip-Flops, Registers & Counters', searchQuery: 'flip flops registers digital circuits' },
  ],
  'operating-systems': [
    { label: 'Process Scheduling & Deadlocks', searchQuery: 'operating system CPU scheduling deadlock' },
    { label: 'Virtual Memory & Paging Algorithms', searchQuery: 'virtual memory page replacement LRU' },
    { label: 'File Systems & Storage Management', searchQuery: 'operating system file systems inode' },
  ],
  'computer-architecture': [
    { label: 'CPU Pipelining & Hazards', searchQuery: 'CPU pipelining structural data hazards' },
    { label: 'Cache Memory & Cache Coherence', searchQuery: 'cache memory mapping direct associative' },
    { label: 'Von Neumann vs Harvard Architecture', searchQuery: 'Von Neumann Harvard architecture differences' },
  ],
  'computer-systems': [
    { label: 'Computer System Components', searchQuery: 'computer architecture system components bus' },
    { label: 'Interrupts & DMA (Direct Memory Access)', searchQuery: 'interrupts DMA I/O hardware architecture' },
  ],
  'security': [
    { label: 'Symmetric vs Asymmetric Cryptography', searchQuery: 'symmetric asymmetric encryption RSA AES' },
    { label: 'Public Key Infrastructure (PKI) & TLS', searchQuery: 'PKI digital certificates TLS handshake' },
    { label: 'Cyber Attacks & Defense Mechanisms', searchQuery: 'cybersecurity attacks XSS SQLi CSRF defense' },
  ],
  'mathematics': [
    { label: 'Discrete Mathematics Fundamentals', searchQuery: 'discrete mathematics logic set theory' },
    { label: 'Probability & Permutations/Combinations', searchQuery: 'probability permutations combinations engineering' },
    { label: 'Number Systems & Floating Point (IEEE 754)', searchQuery: 'binary hex IEEE 754 floating point' },
  ],
  'discrete-math': [
    { label: 'Set Theory & Propositional Logic', searchQuery: 'propositional logic truth tables discrete math' },
    { label: 'Combinatorics & Graph Theory', searchQuery: 'graph theory discrete mathematics' },
  ],
  'project-management': [
    { label: 'WBS, Gantt Charts & Critical Path (CPM)', searchQuery: 'critical path method PERT CPM Gantt chart' },
    { label: 'PMBOK & Agile Project Management', searchQuery: 'project management fundamentals EVM' },
  ],
  'service-management': [
    { label: 'ITIL Framework & ITSM Basics', searchQuery: 'ITIL 4 service management overview' },
    { label: 'SLA (Service Level Agreements) & Helpdesk', searchQuery: 'IT service level agreements SLA KPI' },
  ],
  'system-audit': [
    { label: 'IT System Audit & Internal Controls', searchQuery: 'IT audit internal control COSO COBIT' },
  ],
  'business-strategy': [
    { label: 'SWOT, Porter 5 Forces, PPM Matrix', searchQuery: 'SWOT analysis Porter five forces BCG matrix' },
  ],
  'system-strategy': [
    { label: 'Enterprise Architecture & ERP Systems', searchQuery: 'enterprise architecture ERP systems strategy' },
  ],
  'accounting': [
    { label: 'Financial Statements (B/S, P/L, Cash Flow)', searchQuery: 'financial statements balance sheet income statement' },
    { label: 'Cost Accounting & Break-Even Analysis', searchQuery: 'cost accounting break even point calculation' },
  ],
  'legal-affairs': [
    { label: 'Intellectual Property & Copyright Laws', searchQuery: 'intellectual property software copyright patents' },
    { label: 'Data Privacy & GDPR Fundamentals', searchQuery: 'data privacy compliance GDPR fundamentals' },
  ],
  'human-computer-interaction': [
    { label: 'UI/UX Principles & Accessibility (WCAG)', searchQuery: 'UI UX design principles usability heuristics' },
  ],
  'multimedia': [
    { label: 'Image/Audio/Video Compression (JPEG, MPEG)', searchQuery: 'image audio compression algorithms JPEG MPEG' },
  ],
  'standardization': [
    { label: 'ISO/IEC Standards for IT & Software', searchQuery: 'ISO IEC standards software quality 25010' },
  ],
};

interface AnswerFeedbackProps {
  isCorrect: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  correctDisplay: string;
  explanation: string;
  schedule?: SRScheduleRecord | null;
  timeSeconds: number;
  confidence?: number;
  onNext: () => void;
  hasNext: boolean;
  questionTopics?: string[];
  questionYear?: string;
  hideExplanation?: boolean;
}

export const AnswerFeedback: React.FC<AnswerFeedbackProps> = ({
  isCorrect,
  selectedAnswer,
  correctAnswer,
  correctDisplay,
  explanation,
  schedule,
  timeSeconds,
  confidence,
  onNext,
  hasNext,
  questionTopics = [],
  questionYear,
  hideExplanation = false,
}) => {
  const [isRevealed, setIsRevealed] = React.useState(!hideExplanation);
  const [showAIPrompt, setShowAIPrompt] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const getYouTubeLinks = () => {
    if (!questionTopics || questionTopics.length === 0) return [];
    
    // Find the first topic that has predefined links
    for (const topic of questionTopics) {
      if (TOPIC_YOUTUBE_MAP[topic]) {
        return TOPIC_YOUTUBE_MAP[topic];
      }
    }
    
    // Fallback: use the first topic
    const topic = questionTopics[0];
    return [
      { 
        label: `Learn about ${topic.replace(/-/g, ' ')}`, 
        searchQuery: `PHILNITS FE ${topic.replace(/-/g, ' ')} exam tutorial` 
      }
    ];
  };

  const youtubeLinks = getYouTubeLinks();

  // Listen for Space or Enter keyboard shortcut to advance
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        if (e.target === document.body || (e.target as HTMLElement).tagName === 'BUTTON') {
          e.preventDefault();
        }
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNext]);

  return (
    <div className="mt-6 rounded-xl border border-outline-variant/30 bg-surface-container-low p-5 sm:p-6 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 flex flex-col gap-4">
      {/* Result Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-outline-variant/20">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono-code font-bold text-lg shrink-0 ${
              isCorrect
                ? 'bg-mastery-emerald/15 text-mastery-emerald border border-mastery-emerald/30'
                : 'bg-error/15 text-error border border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-2xl">
              {isCorrect ? 'check_circle' : 'cancel'}
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`font-title-sm text-lg font-bold ${isCorrect ? 'text-mastery-emerald' : 'text-error'}`}>
                {isCorrect ? 'Correct Answer Verified' : 'Incorrect Choice'}
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full font-label-caps text-[10px] uppercase font-bold tracking-wider ${
                  isCorrect
                    ? 'bg-mastery-emerald/20 text-mastery-emerald'
                    : 'bg-error/20 text-error'
                }`}
              >
                {isCorrect ? 'Passed (+1.25 pts)' : 'Review Required'}
              </span>
            </div>
            <p className="text-xs font-mono-code text-on-surface-variant mt-0.5">
              Candidate choice: <span className="font-bold text-on-surface uppercase">{selectedAnswer}</span>
              {!isCorrect && (
                <>
                  {' '}
                  • Official key:{' '}
                  <span className="font-bold text-primary">{correctDisplay || correctAnswer.toUpperCase()}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Action button */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-2 text-xs font-mono-code text-on-surface-variant">
            <span className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded border border-outline-variant/30">
              <span className="material-symbols-outlined text-[14px] text-primary">timer</span>
              <span>{timeSeconds.toFixed(1)}s</span>
            </span>
            {confidence !== undefined && (
              <span className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded border border-outline-variant/30 text-confidence-amber">
                <span className="material-symbols-outlined text-[14px]">grade</span>
                <span>L{confidence}</span>
              </span>
            )}
          </div>

          <button
            onClick={onNext}
            className="flex items-center gap-2 rounded-xl bg-primary hover:bg-primary-fixed-dim px-5 py-2.5 text-sm font-body-bold text-on-primary shadow-lg shadow-primary/20 active:scale-95 transition-all cursor-pointer"
            type="button"
          >
            <span>{hasNext ? 'Proceed to Next' : 'Complete Session'}</span>
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Spaced Repetition Telemetry Strip */}
      {schedule && (
        <div className="flex items-center gap-2 rounded-lg bg-surface-container px-3.5 py-2 border border-outline-variant/20 font-mono-code text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-primary text-[16px]">sync</span>
          <span>
            Leitner Deck Adjusted: Next revision scheduled on{' '}
            <strong className="text-on-surface">{new Date(schedule.nextReviewDate).toLocaleDateString()}</strong> (
            interval: {schedule.intervalDays} {schedule.intervalDays === 1 ? 'day' : 'days'})
          </span>
        </div>
      )}

      {/* Detailed Analytical Breakdown / Explanation */}
      <div className="mt-1 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-label-caps text-on-surface-variant uppercase tracking-wider">
          <span className="flex items-center gap-1.5 text-primary">
            <span className="material-symbols-outlined text-[15px]">school</span>
            Official Analytical Breakdown
          </span>
          <span className="text-[11px] text-on-surface-variant/60 font-mono-code">IPA Syllabus Criteria</span>
        </div>

        {!isRevealed ? (
          <div className="rounded-lg bg-surface-container-high/50 p-6 border border-outline-variant/30 flex flex-col items-center justify-center gap-3 backdrop-blur-sm">
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/50">visibility_off</span>
            <p className="text-sm font-mono-code text-on-surface-variant text-center">
              Explanation is hidden for self-assessment.
            </p>
            <button
              onClick={() => setIsRevealed(true)}
              className="mt-2 px-4 py-2 rounded-lg bg-surface-container border border-outline-variant/30 text-sm font-body-bold text-primary hover:bg-surface-container-high transition-colors flex items-center gap-2"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              Reveal Explanation
            </button>
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-surface-container/60 p-4 border border-outline-variant/20 text-sm leading-relaxed text-on-surface font-body-base">
              {explanation ? (
                <MarkdownRenderer content={explanation} className="prose-p:my-1 text-sm text-on-surface" />
              ) : (
                <p className="italic text-on-surface-variant text-xs font-mono-code">
                  Official key verified. Detailed step-by-step derivation available in curriculum handbook.
                </p>
              )}
            </div>

            {/* AI Explanation & YouTube Links */}
            <div className="flex flex-col gap-3 mt-2">
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowAIPrompt(!showAIPrompt)}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-surface-container border border-outline-variant/30 px-4 py-3 text-sm font-body-bold text-primary hover:bg-surface-container-high transition-colors"
                  type="button"
                >
                  <span className="material-symbols-outlined text-[20px]">smart_toy</span>
                  Get AI Explanation
                </button>
              </div>

              {showAIPrompt && (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-high p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-label-caps text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[15px] text-primary">prompt_suggestion</span>
                      AI Explanation Prompt &amp; Clarification Assistant
                    </span>
                    <button
                      onClick={() => {
                        const promptText = `Please provide a clear, intuitive, and step-by-step educational explanation for this PHILNITS exam question.\n\nExam Details:\n- Year / Session: ${questionYear || 'PHILNITS Exam'}\n- Syllabus Domain: ${questionTopics?.join(', ') || 'Computer Systems / Software'}\n- Official Verified Answer: ${correctDisplay || correctAnswer}\n\nOfficial Solution / Current Explanation:\n${explanation || 'No step derivation given.'}\n\nTask:\n1. Break down why the correct option is right in simple terms.\n2. Explain why the other choices are incorrect.\n3. Provide a quick mnemonic or memory tip for this concept.`;
                        navigator.clipboard.writeText(promptText);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-body-bold transition-all cursor-pointer ${
                        copied
                          ? 'bg-mastery-emerald text-white border-mastery-emerald'
                          : 'bg-surface-container border-outline-variant/30 text-on-surface hover:bg-surface-container-highest'
                      }`}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        {copied ? 'check' : 'content_copy'}
                      </span>
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy Clarification Prompt'}</span>
                    </button>
                  </div>
                  <textarea
                    readOnly
                    className="w-full h-28 rounded-lg bg-surface-container border border-outline-variant/20 p-3 text-xs font-mono-code text-on-surface resize-none focus:outline-none focus:border-primary/50"
                    value={`Please provide a clear, intuitive, and step-by-step educational explanation for this PHILNITS exam question.\n\nExam Details:\n- Year / Session: ${questionYear || 'PHILNITS Exam'}\n- Syllabus Domain: ${questionTopics?.join(', ') || 'Computer Systems / Software'}\n- Official Verified Answer: ${correctDisplay || correctAnswer}\n\nOfficial Solution / Current Explanation:\n${explanation || 'No step derivation given.'}\n\nTask:\n1. Break down why the correct option is right in simple terms.\n2. Explain why the other choices are incorrect.\n3. Provide a quick mnemonic or memory tip for this concept.`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-outline-variant/10 text-xs">
                    <span className="text-[11px] text-on-surface-variant italic">
                      Launch prompt directly in your preferred AI assistant:
                    </span>
                    <div className="flex items-center gap-1.5 font-mono-code">
                      <a
                        href="https://chatgpt.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-[11px] text-on-surface flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[13px] text-mastery-emerald">chat</span>
                        <span>ChatGPT</span>
                      </a>
                      <a
                        href="https://claude.ai/new"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-[11px] text-on-surface flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[13px] text-confidence-amber">psychology</span>
                        <span>Claude</span>
                      </a>
                      <a
                        href="https://gemini.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 text-[11px] text-on-surface flex items-center gap-1 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[13px] text-primary">auto_awesome</span>
                        <span>Gemini</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {youtubeLinks.length > 0 && (
                <div className="rounded-xl border border-outline-variant/30 bg-surface-container p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs font-label-caps text-on-surface-variant uppercase tracking-wider">
                    <span className="material-symbols-outlined text-[16px] text-error">smart_display</span>
                    Related Learning Resources
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {youtubeLinks.map((link, idx) => (
                      <a
                        key={idx}
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(link.searchQuery)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant/20 transition-colors group cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px] text-error/80 group-hover:text-error transition-colors">play_circle</span>
                        <span className="text-sm font-body-bold text-on-surface truncate">{link.label}</span>
                        <span className="material-symbols-outlined text-[14px] text-on-surface-variant/50 ml-auto group-hover:text-on-surface-variant transition-colors">open_in_new</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Keyboard Shortcut Accelerator Footer */}
      <div className="flex items-center justify-between text-[11px] font-mono-code text-on-surface-variant/60 pt-1">
        <span>Press <kbd className="px-1.5 py-0.5 rounded bg-surface-container font-bold text-on-surface">Enter</kbd> or <kbd className="px-1.5 py-0.5 rounded bg-surface-container font-bold text-on-surface">Space</kbd> to Advance</span>
        <span>Telemetry Logged</span>
      </div>
    </div>
  );
};
