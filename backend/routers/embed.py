"""
Embedding endpoints:
  POST /api/embed            – encode texts → 1024-dim vectors
  POST /api/soft-edges       – cosine-similarity discovery edges between concepts
  POST /api/extract-concepts – Gemini concept extraction from syllabus / description
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.embedding import embed, compute_soft_edges
from services.gemini_service import extract_concepts_from_syllabus

router = APIRouter()


# ── /api/embed ────────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    texts: list[str]


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int


@router.post("/embed", response_model=EmbedResponse)
def embed_endpoint(req: EmbedRequest):
    if not req.texts:
        raise HTTPException(400, "No texts provided")
    vecs = embed(req.texts)
    return EmbedResponse(
        embeddings=[v.tolist() for v in vecs],
        dim=len(vecs[0]) if vecs else 0,
    )


# ── /api/soft-edges ───────────────────────────────────────────────────────────

class SoftEdgeRequest(BaseModel):
    node_ids: list[str]
    texts:    list[str]
    threshold: float = Field(default=0.82, ge=0.0, le=1.0)


class SoftEdgeResponse(BaseModel):
    edges: list[dict]


@router.post("/soft-edges", response_model=SoftEdgeResponse)
def soft_edges(req: SoftEdgeRequest):
    if len(req.node_ids) != len(req.texts):
        raise HTTPException(400, "node_ids and texts must have the same length")
    edges = compute_soft_edges(req.node_ids, req.texts, req.threshold)
    return SoftEdgeResponse(edges=edges)


# ── /api/extract-concepts ─────────────────────────────────────────────────────

class ExtractConceptsRequest(BaseModel):
    course_code:   str
    syllabus_text: str | None = None
    course_description: str | None = None


class ConceptNode(BaseModel):
    id:   str
    name: str
    deps: list[str]
    is_estimated: bool = False


class ExtractConceptsResponse(BaseModel):
    concepts: list[ConceptNode]
    source:   str  # "syllabus" | "description" | "fallback"


@router.post("/extract-concepts", response_model=ExtractConceptsResponse)
def extract_concepts(req: ExtractConceptsRequest):
    text   = (req.syllabus_text or "").strip()
    source = "syllabus" if text else "description"

    if not text:
        text = (req.course_description or "").strip()
        if not text:
            source = "fallback"

    raw = extract_concepts_from_syllabus(text, req.course_code)
    nodes = [
        ConceptNode(
            id=c["id"],
            name=c["name"],
            deps=c.get("deps", []),
            is_estimated=(source != "syllabus"),
        )
        for c in raw
    ]
    return ExtractConceptsResponse(concepts=nodes, source=source)
