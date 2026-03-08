import os

# Load .env into os.environ BEFORE any other imports so os.getenv() works everywhere
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=True)
print(f"[STARTUP] Gemini key loaded: {'YES ✅' if os.getenv('GEMINI_API_KEY') else 'NO ❌'}")
print(f"[STARTUP] MongoDB URI loaded: {'YES ✅' if os.getenv('MONGODB_URI') else 'NO ❌'}")
print(f"[STARTUP] NVIDIA key loaded: {'YES ✅' if os.getenv('NEMOTRON_API_KEY') else 'NO ❌'}")
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import generate_content, predict, bayesian, nebula, embed as embed_router, upload as upload_router, persist as persist_router, personal as personal_router, node_content as node_content_router, nemotron as nemotron_router

app = FastAPI(title="Nebula Learning Galaxy API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(generate_content.router, prefix="/api", tags=["generate"])
app.include_router(predict.router,          prefix="/api", tags=["predict"])
app.include_router(bayesian.router,         prefix="/api", tags=["bayesian"])
app.include_router(nebula.router,           prefix="/api", tags=["nebula"])
app.include_router(embed_router.router,     prefix="/api", tags=["embeddings"])
app.include_router(upload_router.router,    prefix="/api", tags=["upload"])
app.include_router(persist_router.router,   prefix="/api", tags=["persist"])
app.include_router(personal_router.router,      prefix="/api", tags=["personal"])
app.include_router(node_content_router.router,  prefix="/api", tags=["node-content"])
app.include_router(nemotron_router.router,      prefix="/api", tags=["nemotron"])


@app.get("/api/health")
def health():
    return {"status": "ok", "embed_dim": 1024}
