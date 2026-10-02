# SLACKR - PHILNITS Exam Reviewer

A comprehensive exam reviewer application for PHILNITS (Philippine National IT Standards) exams with advanced analytics and spaced repetition.

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Activate the virtual environment:
   - **Windows PowerShell**:
     ```powershell
     .\venv\Scripts\Activate.ps1
     ```
   - **Windows Command Prompt**:
     ```cmd
     .\venv\Scripts\activate.bat
     ```
   - **Linux/Mac**:
     ```bash
     source venv/bin/activate
     ```

3. Run the FastAPI server:
   ```bash
   uvicorn main:app --reload
   ```

   The backend will be available at `http://127.0.0.1:8000`

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Run the development server:
   ```bash
   bun dev
   ```

   The frontend will be available at the URL shown in the terminal (typically `http://localhost:5173`)

### First Run

Before starting the application for the first time, generate the question index:

```bash
cd backend
python scripts/generate_index.py
```

This will parse all markdown files from the pelnets repository and create the question index.

## Features

- Multiple choice questions from PHILNITS exam materials
- Weakness Bank Analysis
- Error rate tracking by topic
- Priority weak spot identification
- Consistency scoring
- Confidence calibration
- Learning gain metrics
- Spaced repetition (SM-2, FSRS, and custom algorithms)
- Topic weakness heatmap
- Time tracking per question
- Complete question history with statistics
- Offline-first design

## Tech Stack

- **Backend**: Python, FastAPI, Uvicorn
- **Frontend**: React, TypeScript, Vite, Bun, TailwindCSS
- **State Management**: Zustand
- **Data Storage**: JSON files
- **Study Materials**: GitHub markdown files (pelnets repository)
