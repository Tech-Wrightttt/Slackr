# SLACKR — Offline-First PHILNITS Exam Reviewer

SLACKR is a high-performance, offline-first exam preparation platform designed for the **Philippine National IT Standards (PHILNITS)** examinations (Fundamental Engineer / FE-A and FE-B). It features pre-indexed vaults, Spaced Repetition Systems (SM-2, FSRS, and Custom), real-time confidence calibration, weakness heatmaps, and a zero-latency client database via Dexie.js (IndexedDB).

---

## Key Highlights

- **100% Offline Runtime:** 3,600+ questions across 2007 through 2026 pre-compiled into a static JSON bundle for instant execution in the browser sandbox without a server.
- **Local-First Client Storage (Dexie.js):** Zero-latency IndexedDB attempt recording, real-time analytics calculation, and spaced repetition interval updates.
- **Multi-Algorithm Spaced Repetition:** Choose between **SuperMemo SM-2**, **FSRS (Free Spaced Repetition Scheduler)**, or **SLACKR Custom** (factoring topic weakness, response latency, and confidence). Seamlessly switch algorithms with automatic historical attempt replay.
- **Pre-Reveal Confidence Calibration:** User rates certainty (1–5) *before* submitting answers, eliminating hindsight bias and revealing overconfidence/underconfidence curves.
- **2D Topic Weakness Heatmap:** Multi-dimensional matrix tracking error rates and cognitive load across all 29 official exam categories grouped by day, week, or month.
- **PWA Ready:** Installable as a standalone desktop or mobile application via Web App Manifest and Service Worker (`sw.js`).
- **Offline Diagram Sync:** One-click batch pre-caching of all 2,400+ exam diagrams and screenshots into persistent CacheStorage (`slackr-images-v1`).
- **LaTeX Math Equations:** Flawless equation rendering via KaTeX (`$math$` and `$$display$$`).

---

## 4 Navigation Modes

1. **Tab 1: By Exam Year (`/quiz/year`):** Practice questions by specific examination season (2007 to 2026).
2. **Tab 2: By Topic Category (`/quiz/topic`):** Drill down into 29 official PhilNITS categories (Networking, Security, Algorithms, Systems Architecture, Hardware, etc.).
3. **Tab 3: Combined Filters (`/quiz/combined`):** Target questions matching both Year AND Topic simultaneously.
4. **Tab 4: Custom Quiz Builder (`/quiz/custom`):** Handpick questions, filter by answered/unanswered status, and save reusable problem sets.
5. **SRS Review Mode (`/quiz/srs`):** Due flashcard review queue with interval adjustments and retention tracking.

---

## Architecture Overview

```
Slackr/
├── backend/
│   ├── algorithms/
│   │   ├── sm2.py              # SuperMemo SM-2 algorithm
│   │   ├── fsrs_algo.py        # FSRS algorithm wrapper & state manager
│   │   └── custom.py           # Custom weighted SRS algorithm
│   ├── data/
│   │   ├── pelnets/            # Cloned PhilNITS markdown vault (2007-2026)
│   │   │   └── Files/          # 2,400+ diagram screenshots
│   │   ├── questions_index.json# Indexed question bank (3,609 questions)
│   │   ├── image_list.json     # Diagram asset manifest
│   │   └── metadata_summary.json# Years, topics, and question counts
│   ├── models/
│   │   └── schemas.py          # Pydantic request/response models
│   ├── parsers/
│   │   └── markdown_parser.py  # Markdown & Wikilink parser
│   ├── scripts/
│   │   └── generate_index.py   # Vault compiler script
│   ├── services/
│   │   ├── stats_service.py    # Local statistics manager & replay engine
│   │   └── analytics_service.py# Analytics and heatmap calculations
│   ├── tests/
│   │   └── test_backend.py     # Automated unit & integration tests
│   └── main.py                 # FastAPI companion backend
│
└── frontend/
    ├── public/
    │   ├── data/               # Static offline bundles
    │   ├── icon.svg            # PWA application icon
    │   ├── manifest.json       # Web App Manifest
    │   └── sw.js               # Multi-tier Service Worker
    ├── src/
    │   ├── components/         # QuestionCard, AnswerFeedback, Navbar, MarkdownRenderer
    │   ├── db/                 # Dexie.js IndexedDB schema & instance
    │   ├── pages/              # Home, QuizByYear, QuizByTopic, QuizCombined,
    │   │                       # QuizCustom, QuizSpacedRepetition, Analytics,
    │   │                       # QuestionHistory, Settings
    │   ├── services/           # srsEngine, analyticsEngine, questionsService, syncService
    │   └── store/              # Zustand UI state store
    └── package.json
```

---

## Quick Start Guide

### 1. Ingest & Compile Question Index
The parser processes all 3,600+ questions into pre-indexed static bundles:
```bash
# From workspace root
backend\venv\Scripts\python.exe backend/scripts/generate_index.py
```

### 2. Run Backend Companion Service (Optional)
```bash
# Starts FastAPI server at http://127.0.0.1:8000
backend\venv\Scripts\python.exe -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
```

### 3. Run Frontend App (Development)
```bash
cd frontend
bun run dev
# Or preview production build:
bun run preview
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Running Automated Tests

Run the comprehensive test suite verifying the parser, SM-2, FSRS, Custom SRS, analytics calculations, replay migration, and FastAPI endpoints:
```bash
backend\venv\Scripts\python.exe backend/tests/test_backend.py
```

---

## PWA & Offline Usage

1. Open the app in Chrome, Edge, or mobile Safari.
2. Click **Install App** in the header to install as a standalone desktop/mobile app.
3. In **Settings**, click **Download All Diagrams for Offline Use** to cache all diagrams.
4. Disconnect Wi-Fi or enable Airplane Mode: SLACKR operates with 100% functionality offline!
