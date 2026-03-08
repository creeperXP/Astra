"""
NV-Ingest + NV-Embed PDF pipeline
==================================

Architecture
------------
  PDF bytes
    │
    ▼ Tier 1 ─────────────────────────────────────────────────────────────────
  NV-Ingest microservice  (if NV_INGEST_URL is set and server is reachable)
    POST <NV_INGEST_URL>/v1/ingest   multipart/form-data
    → structured JSON: {data: [{document_type, metadata: {content, table_content}}]}
    │
    │ (if unavailable)
    ▼ Tier 2 ─────────────────────────────────────────────────────────────────
  pypdf  (always available, zero-config)
    │
    ▼
  Extracted text chunks
    │
    ▼ Tier 3 ─────────────────────────────────────────────────────────────────
  NV-Embed-v1  (integrate.api.nvidia.com)  [optional – for semantic search]
    → per-chunk embeddings stored alongside text
    │
    ▼
  ExtractionResult { text: str, chunks: list[Chunk] }

Usage
-----
  from services.nv_ingest_service import extract_pdf_pipeline

  result = await extract_pdf_pipeline(pdf_bytes, filename="syllabus.pdf")
  print(result.text)          # full plain text
  print(result.chunks[0].embedding)  # NV-Embed-v1 vector for first chunk

Setup (optional – for Tier 1)
------------------------------
  1. Pull the NV-Ingest microservice:
       docker pull nvcr.io/nvidia/nv-ingest:25.4.2
       docker run -p 7670:7670 -p 8000:8000 nvcr.io/nvidia/nv-ingest:25.4.2
  2. Add to backend/.env:
       NV_INGEST_URL=http://localhost:8000
  If the server is not reachable, the service falls back silently to pypdf.
"""
from __future__ import annotations

import io
import logging
import os
from dataclasses import dataclass, field

import httpx
import numpy as np

log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
_NV_INGEST_URL = os.getenv("NV_INGEST_URL", "").rstrip("/")
_CHUNK_SIZE    = 1200   # chars per embedding chunk
_CHUNK_OVERLAP = 150    # overlap between chunks


# ── Data types ────────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    text:      str
    source:    str = "text"            # "text" | "table" | "chart"
    page:      int = 0
    embedding: list[float] = field(default_factory=list)


@dataclass
class ExtractionResult:
    text:      str                     # full joined text
    chunks:    list[Chunk]             # individual chunks (with embeddings if available)
    source:    str = "pypdf"           # "nv_ingest" | "pypdf" | "raw"
    tables:    list[str] = field(default_factory=list)   # extracted table text
    page_count: int = 0


# ── Tier 1: NV-Ingest REST API ────────────────────────────────────────────────

async def _nv_ingest_extract(pdf_bytes: bytes, filename: str) -> ExtractionResult | None:
    """
    Call the NV-Ingest microservice REST API.

    The microservice exposes:
      GET  <base>/health/ready               → 200 when ready
      POST <base>/v1/ingest                  → multipart, returns job result JSON
          fields:
            file:            (filename, bytes, "application/pdf")
            extract_text:    "true"
            extract_tables:  "true"
            text_depth:      "page"
    Response schema (simplified):
      { "data": [ { "document_type": "text"|"structured",
                    "metadata": { "content": "...", "table_content": "..." } } ] }
    """
    if not _NV_INGEST_URL:
        return None

    print(f"[NV-INGEST] 🚀 Attempting extraction via {_NV_INGEST_URL}")
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Health check first
            try:
                h = await client.get(f"{_NV_INGEST_URL}/health/ready", timeout=4.0)
                if h.status_code != 200:
                    print(f"[NV-INGEST] ⚠️  Server not ready (HTTP {h.status_code}) — falling back")
                    return None
            except Exception as hc_err:
                print(f"[NV-INGEST] ⚠️  Server unreachable ({hc_err}) — falling back to pypdf")
                return None

            # Submit extraction job
            resp = await client.post(
                f"{_NV_INGEST_URL}/v1/ingest",
                files={"file": (filename, pdf_bytes, "application/pdf")},
                data={
                    "extract_text":   "true",
                    "extract_tables": "true",
                    "text_depth":     "page",
                },
            )
            resp.raise_for_status()
            payload = resp.json()

    except httpx.HTTPStatusError as exc:
        print(f"[NV-INGEST] ❌ HTTP {exc.response.status_code}: {exc.response.text[:200]}")
        return None
    except Exception as exc:
        print(f"[NV-INGEST] ❌ Request failed: {exc}")
        return None

    # Parse the response
    data_items = payload.get("data", [])
    if not data_items:
        print("[NV-INGEST] ⚠️  Empty response — falling back")
        return None

    texts:  list[str] = []
    tables: list[str] = []
    chunks: list[Chunk] = []
    page = 0

    for item in data_items:
        doc_type = item.get("document_type", "text")
        meta     = item.get("metadata", {})
        content  = meta.get("content", "").strip()
        table_content = meta.get("table_content", "").strip()
        page_idx = meta.get("page_number", page)

        if content:
            texts.append(content)
            chunks.append(Chunk(text=content, source="text", page=page_idx))

        if table_content:
            tables.append(table_content)
            chunks.append(Chunk(text=table_content, source="table", page=page_idx))

        if doc_type in ("structured", "table"):
            cell_text = " | ".join(str(v) for v in meta.get("table_metadata", {}).values() if v)
            if cell_text:
                tables.append(cell_text)
                chunks.append(Chunk(text=cell_text, source="table", page=page_idx))

    full_text = "\n\n".join(texts + tables)
    print(f"[NV-INGEST] ✅ Extracted {len(full_text):,} chars, {len(tables)} tables, {len(chunks)} chunks")
    return ExtractionResult(
        text=full_text, chunks=chunks, source="nv_ingest",
        tables=tables, page_count=page + 1,
    )


# ── Tier 2: pypdf fallback ────────────────────────────────────────────────────

def _pypdf_extract(pdf_bytes: bytes) -> ExtractionResult:
    """Extract text from PDF using pypdf."""
    print("[NV-INGEST] 📄 Using pypdf extraction")
    try:
        import pypdf  # noqa: PLC0415
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        pages  = [page.extract_text() or "" for page in reader.pages]
        pages  = [p.strip() for p in pages if p.strip()]
        text   = "\n\n".join(pages)
        chunks = [Chunk(text=p, source="text", page=i) for i, p in enumerate(pages)]
        print(f"[NV-INGEST] ✅ pypdf extracted {len(text):,} chars from {len(pages)} pages")
        return ExtractionResult(
            text=text, chunks=chunks, source="pypdf",
            tables=[], page_count=len(pages)
        )
    except Exception as exc:
        log.warning("pypdf failed: %s", exc)
        print(f"[NV-INGEST] ⚠️  pypdf failed: {exc} — using raw byte decode")

    # Raw fallback
    raw = pdf_bytes.decode("latin-1", errors="replace")
    printable = "".join(c if 32 <= ord(c) < 127 or c in "\n\r\t" else " " for c in raw)
    text = " ".join(printable.split())[:12000]
    return ExtractionResult(
        text=text,
        chunks=[Chunk(text=text, source="text")],
        source="raw",
    )


# ── Tier 3: NV-Embed-v1 embeddings ───────────────────────────────────────────

def _split_into_chunks(text: str, size: int = _CHUNK_SIZE, overlap: int = _CHUNK_OVERLAP) -> list[str]:
    """Slide a window over text to produce overlapping chunks."""
    if not text:
        return []
    chunks = []
    start  = 0
    while start < len(text):
        end = start + size
        chunks.append(text[start:end])
        start = end - overlap
        if start >= len(text):
            break
    return chunks


async def _embed_chunks(chunks: list[Chunk]) -> None:
    """
    Attach NV-Embed-v1 embeddings to chunks in-place.
    Silently skips if the API is unavailable.
    """
    if not chunks:
        return
    try:
        from services.embedding import embed  # noqa: PLC0415
        texts = [c.text[:512] for c in chunks]   # truncate for speed
        print(f"[NV-INGEST] 🔢 Embedding {len(chunks)} chunks via NV-Embed-v1…")
        vecs  = embed(texts)
        for chunk, vec in zip(chunks, vecs):
            chunk.embedding = vec.tolist()
        print(f"[NV-INGEST] ✅ Embeddings attached (dim={len(vecs[0])})")
    except Exception as exc:
        print(f"[NV-INGEST] ⚠️  Embedding skipped: {exc}")


# ── Public API ────────────────────────────────────────────────────────────────

async def extract_pdf_pipeline(
    pdf_bytes: bytes,
    filename:  str = "document.pdf",
    embed:     bool = True,
) -> ExtractionResult:
    """
    Full pipeline:
      PDF → NV-Ingest (if available) OR pypdf → NV-Embed-v1 (if requested)

    Args:
        pdf_bytes: raw bytes of the PDF file
        filename:  original filename (used for MIME detection)
        embed:     if True, attach NV-Embed-v1 vectors to each chunk

    Returns:
        ExtractionResult with .text (str) and .chunks (list[Chunk])
    """
    # ── Step 1: Extract ──────────────────────────────────────────────────────
    result = await _nv_ingest_extract(pdf_bytes, filename)
    if result is None:
        result = _pypdf_extract(pdf_bytes)

    # ── Step 2: Chunk large pages for better embedding granularity ───────────
    refined: list[Chunk] = []
    for chunk in result.chunks:
        if len(chunk.text) > _CHUNK_SIZE * 1.5:
            sub_texts = _split_into_chunks(chunk.text)
            for st in sub_texts:
                refined.append(Chunk(text=st, source=chunk.source, page=chunk.page))
        else:
            refined.append(chunk)
    result.chunks = refined

    # ── Step 3: Embed ────────────────────────────────────────────────────────
    if embed:
        await _embed_chunks(result.chunks)

    print(
        f"[NV-INGEST] Pipeline complete: "
        f"source={result.source}  chars={len(result.text):,}  "
        f"chunks={len(result.chunks)}  "
        f"has_embeddings={bool(result.chunks and result.chunks[0].embedding)}"
    )
    return result


def extract_pdf_pipeline_sync(
    pdf_bytes: bytes,
    filename:  str = "document.pdf",
    embed:     bool = False,
) -> ExtractionResult:
    """
    Synchronous wrapper for use in non-async contexts.
    Does NOT embed by default (embedding is async).
    """
    result = None
    if _NV_INGEST_URL:
        import asyncio  # noqa: PLC0415
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures  # noqa: PLC0415
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, extract_pdf_pipeline(pdf_bytes, filename, embed=False))
                    result = future.result(timeout=30)
            else:
                result = loop.run_until_complete(extract_pdf_pipeline(pdf_bytes, filename, embed=False))
        except Exception:
            pass

    return result or _pypdf_extract(pdf_bytes)
