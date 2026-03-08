"""
Embedding service — NV-Embed-v1 via NVIDIA Build API (primary).

Pipeline priority:
  1. NVIDIA Build API  (nvapi-... key → integrate.api.nvidia.com, nvidia/nv-embed-v1, 4096-dim → PCA 1024)
  2. Local SentenceTransformer nvidia/NV-Embed-v2  (requires ~3 GB model)
  3. Local SentenceTransformer all-MiniLM-L6-v2    (384-dim → pad 1024)
  4. Hash pseudo-embeddings                        (no dependencies)

RULE: EMBED_DIM = 1024. Never store raw 4096-dim vectors.
"""
from __future__ import annotations

import logging
import os
import sys

import numpy as np

try:
    from sklearn.decomposition import PCA as _PCA
    _SKLEARN_OK = True
except ImportError:
    _PCA = None  # type: ignore[assignment,misc]
    _SKLEARN_OK = False

_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(_here))
from config import EMBED_DIM, NV_EMBED_RAW_DIM, settings  # type: ignore

log = logging.getLogger(__name__)

# ── PCA projection ──────────────────────────────────────────────────────────
_pca: object | None = None


def get_pca():
    global _pca
    if not _SKLEARN_OK:
        return None
    if _pca is None:
        _pca = _PCA(n_components=EMBED_DIM)
        rng = np.random.default_rng(42)
        dummy = rng.standard_normal((200, NV_EMBED_RAW_DIM)).astype(np.float32)
        _pca.fit(dummy)
    return _pca


def project_to_1024(vec: np.ndarray) -> np.ndarray:
    """
    Project any dimension → EMBED_DIM=1024.

    For NV-Embed-v1/v2 (4096-dim): truncate to first 1024 dims + renormalise.
    This is the recommended approach for L2-normalised NVIDIA embeddings — the
    first EMBED_DIM dimensions preserve semantic similarity for nearest-neighbour
    search without requiring PCA fitting.
    """
    dim = vec.shape[-1]
    v   = vec.astype(np.float32)

    if dim == EMBED_DIM:
        return v

    if dim > EMBED_DIM:
        # Truncate + renormalise (works for 4096-dim NV-Embed and any larger dim)
        v = v[:EMBED_DIM]
        n = np.linalg.norm(v)
        return v / n if n > 0 else v

    # dim < EMBED_DIM (e.g. 384 from MiniLM): zero-pad + renormalise
    padded = np.zeros(EMBED_DIM, dtype=np.float32)
    padded[:dim] = v
    n = np.linalg.norm(padded)
    return padded / n if n > 0 else padded


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# ── Backend A: NVIDIA Build API (nvapi key → integrate.api.nvidia.com) ──────

# Always use the NVIDIA Build API endpoint when an nvapi key is available
_NVIDIA_API_BASE  = "https://integrate.api.nvidia.com"
_NVIDIA_API_MODEL = "nvidia/nv-embed-v1"


def _embed_nvidia_api(texts: list[str]) -> list[np.ndarray]:
    """
    Call NVIDIA Build API for NV-Embed-v1 embeddings.
    Key format: nvapi-...   Endpoint: integrate.api.nvidia.com/v1/embeddings
    """
    import httpx  # noqa: PLC0415

    key = settings.nemotron_api_key or os.getenv("NEMOTRON_API_KEY", "")
    if not key:
        raise RuntimeError("[EMBED] No NVIDIA API key configured")

    # Use the configured base URL or fall back to the standard NVIDIA Build endpoint
    base = (settings.nvidia_nim_base_url or _NVIDIA_API_BASE).rstrip("/")

    print(f"[EMBED] 🚀 Calling NVIDIA {_NVIDIA_API_MODEL} @ {base}/v1/embeddings  texts={len(texts)}")

    payload = {
        "model":           _NVIDIA_API_MODEL,
        "input":           texts,
        "encoding_format": "float",
        "input_type":      "query",
        "truncate":        "END",
    }
    with httpx.Client(timeout=60) as client:
        r = client.post(
            f"{base}/v1/embeddings",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        r.raise_for_status()
        data = r.json()

    raw = [np.array(item["embedding"], dtype=np.float32) for item in data["data"]]
    dim = raw[0].shape[0] if raw else 0
    print(f"[EMBED] ✅ NVIDIA API OK — raw dim={dim}, projecting to {EMBED_DIM}")
    return [project_to_1024(v) for v in raw]


# ── Backend B: Local SentenceTransformer (nvidia/NV-Embed-v2) ───────────────
_st_nv_model = None


def _embed_st_nvidia(texts: list[str]) -> list[np.ndarray]:
    global _st_nv_model
    try:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
    except ImportError:
        raise RuntimeError("sentence_transformers not installed")

    print("[EMBED] 🔄 Loading local nvidia/NV-Embed-v2 (may be slow on first call)…")
    if _st_nv_model is None:
        _st_nv_model = SentenceTransformer("nvidia/NV-Embed-v2", trust_remote_code=True)

    vecs = _st_nv_model.encode(texts, normalize_embeddings=True)
    print(f"[EMBED] ✅ Local NV-Embed-v2 OK — {len(vecs)} vectors")
    return [project_to_1024(np.array(v, dtype=np.float32)) for v in vecs]


# ── Backend C: Lightweight fallback (all-MiniLM-L6-v2, 384-dim) ─────────────
_st_mini_model = None


def _embed_mini(texts: list[str]) -> list[np.ndarray]:
    global _st_mini_model
    try:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
    except ImportError:
        raise RuntimeError("sentence_transformers not installed")

    print("[EMBED] 🔄 Using MiniLM fallback (all-MiniLM-L6-v2)…")
    try:
        if _st_mini_model is None:
            _st_mini_model = SentenceTransformer("all-MiniLM-L6-v2")
        vecs = _st_mini_model.encode(texts, normalize_embeddings=True)
        print(f"[EMBED] ✅ MiniLM OK — {len(vecs)} vectors (384-dim → padded to {EMBED_DIM})")
        return [project_to_1024(np.array(v, dtype=np.float32)) for v in vecs]
    except Exception as exc:
        _st_mini_model = None
        raise RuntimeError(str(exc)) from exc


# ── Backend D: Pure-Python hash fallback ─────────────────────────────────────

def _embed_hash(texts: list[str]) -> list[np.ndarray]:
    import hashlib  # noqa: PLC0415
    print(f"[EMBED] ⚠️  Using hash pseudo-embeddings (no semantic meaning) for {len(texts)} texts")
    results = []
    for text in texts:
        seed_bytes = hashlib.sha256(text.encode()).digest()
        seed_int   = int.from_bytes(seed_bytes[:8], "big")
        rng = np.random.default_rng(seed_int)
        vec = rng.standard_normal(EMBED_DIM).astype(np.float32)
        n   = np.linalg.norm(vec)
        results.append(vec / n if n > 0 else vec)
    return results


# ── Public API ───────────────────────────────────────────────────────────────

def embed(texts: list[str]) -> list[np.ndarray]:
    """
    Embed texts → EMBED_DIM=1024 vectors.
    Priority: NVIDIA Build API → local NV-Embed-v2 → MiniLM → hash.
    """
    if not texts:
        return []

    print(f"[EMBED] embed() called with {len(texts)} text(s). First: '{texts[0][:60]}…'")

    # 1. NVIDIA Build API (nvapi key)
    try:
        return _embed_nvidia_api(texts)
    except Exception as e:
        print(f"[EMBED] ⚠️  NVIDIA API failed: {e}")
        log.warning("NVIDIA API embed failed (%s), trying local NV-Embed-v2", e)

    # 2. Local nvidia/NV-Embed-v2
    try:
        return _embed_st_nvidia(texts)
    except Exception as e:
        print(f"[EMBED] ⚠️  Local NV-Embed-v2 failed: {e}")
        log.warning("Local NV-Embed-v2 failed (%s), falling back to MiniLM", e)

    # 3. Lightweight MiniLM
    try:
        return _embed_mini(texts)
    except Exception as e:
        print(f"[EMBED] ⚠️  MiniLM failed: {e}")
        log.warning("MiniLM fallback failed (%s), using hash embeddings", e)

    # 4. Zero-dependency hash
    return _embed_hash(texts)


def compute_soft_edges(
    node_ids: list[str],
    texts: list[str],
    threshold: float = 0.82,
) -> list[dict]:
    """Cosine-similarity soft edges between nodes (NV-Embed powered)."""
    if len(node_ids) < 2:
        return []
    print(f"[EMBED] compute_soft_edges: {len(node_ids)} nodes, threshold={threshold}")
    vecs  = embed(texts)
    edges = []
    for i in range(len(node_ids)):
        for j in range(i + 1, len(node_ids)):
            sim = cosine_similarity(vecs[i], vecs[j])
            if sim >= threshold:
                edges.append({
                    "source":     node_ids[i],
                    "target":     node_ids[j],
                    "similarity": round(float(sim), 4),
                    "type":       "soft",
                })
    print(f"[EMBED] Found {len(edges)} soft edges above threshold={threshold}")
    return edges
