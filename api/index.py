"""Vercel serverless entry point for the SLACKR FastAPI backend.

Vercel routes /api/* here (see vercel.json). The app runs in hosted mode
automatically because Vercel sets the VERCEL environment variable.
"""
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import main  # noqa: E402

# Serverless invocations may skip ASGI lifespan events, so load the question bank at import
if not main.questions_db:
    main.startup_event()

app = main.app
