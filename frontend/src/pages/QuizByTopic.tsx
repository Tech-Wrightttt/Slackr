import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { QuestionsService } from '../services/questionsService';
import { StatsDbService } from '../services/statsDb';
import { AnalyticsEngine } from '../services/analyticsEngine';
import { QuizSession } from '../components/QuizSession';
import { ExamLaunchButton } from '../components/ExamLaunchButton';
import type { QuestionData } from '../db/schema';
import { topicLabel, topicStyle } from '../services/topicColors';

export const QuizByTopic: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialTopic = searchParams.get('topic');

  const [topics, setTopics] = useState<string[]>([]);
  const [topicCounts, setTopicCounts] = useState<Record<string, number>>({});
  const [topicSubdecks, setTopicSubdecks] = useState<Record<string, Array<{ year: string; subdeck: string; count: number }>>>({});
  const [topicErrorRates, setTopicErrorRates] = useState<Record<string, number>>({});
  const [selectedTopic, setSelectedTopic] = useState<string | null>(initialTopic);
  const [selectedSubdeckYear, setSelectedSubdeckYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quiz active state
  const [isQuizActive, setIsQuizActive] = useState<boolean>(false);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadTopicsData = async () => {
      try {
        const meta = await QuestionsService.loadMetadataSummary();
        setTopics(meta.topics || []);
        setTopicCounts(meta.topic_counts || {});
        setTopicSubdecks(meta.topic_subdecks || {});

        const rates = await AnalyticsEngine.getErrorRates();
        const errMap: Record<string, number> = {};
        for (const r of rates) {
          errMap[r.topic] = r.errorRate;
        }
        setTopicErrorRates(errMap);

        if (initialTopic) {
          setSelectedTopic(initialTopic);
        }
      } catch (err) {
        console.error('Failed to load topics:', err);
      } finally {
        setLoading(false);
      }
    };
    loadTopicsData();
  }, [initialTopic]);

  const handleSelectTopic = (topic: string) => {
    setSelectedTopic(topic);
    setSelectedSubdeckYear('all');
    setIsQuizActive(false);
  };

  const handleStartTopicQuiz = async (yearFilter: string = 'all', topic: string | null = selectedTopic) => {
    if (!topic) return;
    setSelectedSubdeckYear(yearFilter);
    setLoading(true);

    try {
      const qList = await QuestionsService.getQuestionsByTopic(topic, yearFilter);
      setQuestions(qList);
      setIsQuizActive(true);
    } catch (err) {
      console.error('Failed to load questions for topic:', err);
    } finally {
      setLoading(false);
    }
  };

  // Surprise pick: a random topic's full deck, never the one just practiced
  const handleRandomTopic = () => {
    const pool = topics.filter((t) => t !== selectedTopic && (topicCounts[t] || 0) > 0);
    if (pool.length === 0) return;
    const topic = pool[Math.floor(Math.random() * pool.length)]!;
    setSelectedTopic(topic);
    handleStartTopicQuiz('all', topic);
  };

  const filteredTopics = topics.filter((t) =>
    t.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Active Quiz View
  if (isQuizActive) {
    const deck = selectedSubdeckYear === 'all' ? `#${selectedTopic}` : `#${selectedTopic} · ${selectedSubdeckYear}`;
    return (
      <QuizSession
        key={`${selectedTopic}:${selectedSubdeckYear}`}
        questions={questions}
        sessionType="topic"
        filterKey={`${selectedTopic}:${selectedSubdeckYear}`}
        title={`Topic drill ${deck}`}
        exitLabel={`Exit Domain Drill (${deck})`}
        onExit={() => setIsQuizActive(false)}
      />
    );
  }

  // View 1: Topics Directory Hub
  if (!selectedTopic) {
    return (
      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 animate-in fade-in duration-300">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
          <div className="flex flex-col gap-1 max-w-2xl">
            <div className="flex items-center gap-2 font-mono-timer text-xs text-interactive-sky">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-interactive-sky" />
              <span>PHILNITS KNOWLEDGE DOMAINS // 29 SYLLABUS UNITS</span>
            </div>
            <h1 className="font-display-lg text-3xl sm:text-4xl font-bold text-on-surface tracking-tight">
              By Topic Category
            </h1>
            <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
              Target discrete syllabus curricula. Practice complete master decks or isolate specific temporal
              cross-sections.
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleRandomTopic}
            disabled={loading || topics.length === 0}
            title="Start a random topic deck"
            className="press-scale shrink-0 min-h-[40px] flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-on-primary shadow-sm hover:bg-primary-container disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">shuffle</span>
            <span>Random Topic</span>
          </button>
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder="Search 29 domains..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low pl-9 pr-4 py-2 text-sm text-on-surface placeholder-on-surface-variant/60 focus:border-primary focus:outline-none font-mono-code"
            />
          </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center font-mono-code text-sm text-on-surface-variant">
            Loading topic decks...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTopics.map((topic) => {
              const count = topicCounts[topic] || 0;
              const errorRate = topicErrorRates[topic];

              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleSelectTopic(topic)}
                  style={topicStyle(topic)}
                  className="topic-card press-scale group flex items-center justify-between gap-3 rounded-xl border border-outline-variant/20 bg-surface-container-low p-5 text-left shadow-sm cursor-pointer"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="topic-tile w-10 h-10 rounded-xl flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">category</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-body-bold text-sm text-on-surface truncate">{topicLabel(topic)}</h3>
                      <p className="font-mono-code text-xs text-on-surface-variant mt-0.5">
                        {count} verified questions
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {errorRate !== undefined ? (
                      <span
                        className={`font-mono-timer text-xs px-2 py-0.5 rounded-full font-bold ${
                          errorRate >= 50
                            ? 'bg-error/20 text-error'
                            : errorRate >= 25
                            ? 'bg-confidence-amber/20 text-confidence-amber'
                            : 'bg-mastery-emerald/20 text-mastery-emerald'
                        }`}
                      >
                        {errorRate}% err
                      </span>
                    ) : (
                      <span className="font-mono-code text-[11px] text-on-surface-variant/50">Unattempted</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 2: Topic Hub with Subdecks
  const totalTopicQuestions = topicCounts[selectedTopic] || 0;
  const subdecks = topicSubdecks[selectedTopic] || [];

  return (
    <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6 animate-in fade-in duration-200">
      <button
        type="button"
        onClick={() => setSelectedTopic(null)}
        className="flex items-center gap-1.5 text-xs font-mono-code text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer w-fit"
      >
        <span className="material-symbols-outlined text-[16px]">arrow_back</span>
        <span>Back to All Categories</span>
      </button>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3" style={topicStyle(selectedTopic)}>
          <div className="topic-tile w-11 h-11 rounded-xl flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[22px]">category</span>
          </div>
          <h1 className="font-headline-md text-3xl font-extrabold text-on-surface tracking-tight">
            {topicLabel(selectedTopic)}
          </h1>
          <span className="font-mono-timer text-xs px-2.5 py-0.5 rounded-full bg-surface-container-high text-primary font-bold border border-outline-variant/30">
            {totalTopicQuestions} Questions Total
          </span>
        </div>
        <p className="font-body-base text-sm text-on-surface-variant leading-relaxed">
          Practice the complete master deck across all 19 exam years, or select a dedicated yearly cohort.
        </p>
      </div>

      {/* Master Deck Card */}
      <div
        onClick={() => handleStartTopicQuiz('all')}
        className="group rounded-xl border border-primary/40 bg-surface-container-low p-6 shadow-md transition-all hover:bg-surface-container hover:border-primary cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0 shadow-sm">
            <span className="material-symbols-outlined text-[24px]">dataset</span>
          </div>
          <div>
            <h3 className="font-title-sm text-base font-bold text-on-surface group-hover:text-primary transition-colors">
              Full #{selectedTopic} Master Deck
            </h3>
            <p className="font-mono-code text-xs text-on-surface-variant mt-0.5">
              Comprehensive continuous set spanning all archived years ({totalTopicQuestions} questions).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
        <ExamLaunchButton
          compact
          load={() => QuestionsService.getQuestionsByTopic(selectedTopic, 'all')}
          setKey={`topic:${selectedTopic}`}
          title={`Topic exam #${selectedTopic}`}
          sessionType="topic"
          filterKey={`${selectedTopic}:all`}
        />
        <button
          type="button"
          className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-fixed-dim text-on-primary font-body-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">play_arrow</span>
          <span>Start Master Deck</span>
        </button>
        </div>
      </div>

      {/* Yearly Subdecks Grid */}
      <div className="flex flex-col gap-3">
        <h3 className="font-label-caps text-xs text-on-surface-variant uppercase tracking-wider font-semibold">
          Yearly Cohort Sub-Decks
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {subdecks.map((sub) => (
            <button
              key={sub.year}
              type="button"
              onClick={() => handleStartTopicQuiz(sub.year)}
              className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low border border-outline-variant/20 hover:bg-surface-container hover:border-interactive-sky/40 transition-all text-left shadow-sm cursor-pointer group"
            >
              <div className="flex flex-col">
                <span className="font-mono-code text-sm font-bold text-on-surface group-hover:text-interactive-sky transition-colors">
                  {sub.subdeck}
                </span>
                <span className="font-mono-code text-xs text-on-surface-variant">Year {sub.year}</span>
              </div>
              <span className="font-label-caps text-xs px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                {sub.count} Qs
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
