# Astra

Immersive 3D UTD learning galaxy: course → concept graph, Bayesian mastery, per-node quizzes, and explainable recommendations.

## Stack

- **Frontend:** Vite + React + TypeScript, ForceGraph3D, Zustand, Framer Motion
- **Backend:** FastAPI, Gemini (quiz/concept extraction), NV-Embed-v2 → 1024-dim projection, Beta-Binomial mastery
- **Data:** Demo data (`public/demo_data.json`), optional Nebula API, RMP pre-scraped JSON

## How to run

### 1. Frontend (required)

```bash
cd nebula-galaxy
npm install
npm run dev
```

Open http://localhost:5173. Complete onboarding, then explore the galaxy. Click a node for details and “Generate quiz”; for courses, use “Open concept map” for the Level 2 concept map.

### 2. Backend (optional – for real quizzes and mastery API)

In a **second terminal**:

```bash
cd nebula-galaxy/backend
python -m venv venv
source venv/bin/activate          # Windows:  venv\Scripts\activate
pip install -r requirements.txt
```

Add your API keys in **`backend/.env`** (copy from `backend/.env.example` if needed):

- **GEMINI_API_KEY** – for quiz and concept generation ([Google AI Studio](https://aistudio.google.com/apikey))
- **NEMOTRON_API_KEY** – for NVIDIA NIM (e.g. NV-Embed-v2 embeddings at [NVIDIA Build](https://build.nvidia.com))

Then start the API:

```bash
uvicorn main:app --reload --port 8000
```

The frontend proxies `/api` to `http://localhost:8000`. Without the backend, the app still runs with demo data and local Bayesian fallback.

## Data scripts (run before demo)

**[Nebula API](https://api.utdnebula.com/swagger/index.html)** – courses, professors, grade distributions:

```bash
pip install httpx
python scripts/fetch_nebula.py --output public/nebula_data.json
```

Fetches `/course/all`, `/professor/all`, and per-course `/course/{id}/grades` and `/course/{id}/professors`. No API key required for the public Nebula API.

**Rate My Professor** – scrape UTD professor ratings (clarity/difficulty) for insights:

```bash
python scripts/fetch_rmp.py --output public/rmp_data.json
```

If scraping fails (RMP may block or change structure), the script writes a template JSON; you can add entries manually. The app and backend can load `rmp_data.json` and `nebula_data.json` for course details and for Gemini when the user uploads a syllabus (Gemini extracts concepts and can use this metadata for recommendations).

## Environment

- **Root `.env`** – frontend: `VITE_NEBULA_API_KEY`, `VITE_API_URL` (defaults work with proxy to backend).
- **`backend/.env`** – backend: `GEMINI_API_KEY`, `NEMOTRON_API_KEY`, `NVIDIA_NIM_BASE_URL`, `MONGODB_URI`. Embedding dimension is **locked to 1024**; NV-Embed-v2 4096-dim vectors are projected to 1024 before storage.

## Features

- **Level 1 – Galactic degree plan:** UTD courses, prereq edges, node glow from mastery
- **Level 2 – Planetary concept map:** Concepts per course, centripetal force so concepts stay near the course
- **Dual-glow:** UTD average success vs your personalized mastery (Beta-Binomial with slip/guess)
- **Per-node panel:** Quiz generation (Gemini), mastery update on answer, “Open concept map” for courses
- **Breadcrumbs & Back/Home:** Galaxy → Course → Concept; warm start when returning to Level 1
- **Concept pipeline:** Syllabus PDF or Nebula description → Gemini extracts 5–8 concepts → prefixed IDs (`concept_<course>_<slug>`)

## Project layout

```
nebula-galaxy/
├── src/
│   ├── components/   # GalaxyGraph, ConceptMap, NodePanel, Breadcrumbs, OnboardingForm
│   ├── store/       # Zustand (graph, mastery, breadcrumbs, positions)
│   ├── data/        # loadGraph, demo data loader
│   ├── lib/         # api, bayesian, constants (EMBED_DIM=1024)
│   └── types/       # graph, user, api
├── public/
│   └── demo_data.json
├── backend/
│   ├── main.py
│   ├── config.py    # EMBED_DIM, NV_EMBED_RAW_DIM
│   ├── routers/    # generate-node-content, predict, bayesian-update, nebula/courses
│   └── services/   # gemini_service, bayesian_service, embedding (PCA 4096→1024)
└── README.md
```

## Hackathon tracks

- **Nebula Labs:** Course/concept decisions, DFW, scheduling, nested course → concept visualization
- **Dallas AI:** Prompt anchors (tone by mastery), feature attribution, explainable next steps
- **ML (MLH):** Gemini (quizzes, concept extraction), NV-Embed-v2 (embeddings, 1024-dim), Beta-Binomial mastery with slip/guess
