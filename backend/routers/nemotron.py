"""Nemotron Nano (NVIDIA) visual explanation endpoint."""
from __future__ import annotations

import json
import os
import re

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

SYSTEM_PROMPT = """You are a visual learning assistant helping students understand computer science and math concepts.
Given a concept or question, respond with structured JSON only — no markdown, no code fences:
{
  "explanation": "clear 2-4 sentence explanation written for a student",
  "visualization_description": "describe what a helpful 3D or visual representation would look like (nodes, arrows, animations, shapes)",
  "key_points": ["concise point 1", "concise point 2", "concise point 3"],
  "analogy": "a vivid real-world analogy that makes the concept click",
  "common_mistakes": ["mistake 1", "mistake 2"]
}"""


class NemotronRequest(BaseModel):
    prompt: str
    context: str | None = None  # node description / course context


@router.post("/nemotron")
async def nemotron_visualize(req: NemotronRequest):
    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "error": "NEMOTRON_API_KEY not set in .env",
            "data": _fallback(req.prompt),
        }

    user_content = req.prompt
    if req.context:
        user_content = f"Context: {req.context}\n\nConcept / Question: {req.prompt}"

    try:
        from openai import OpenAI  # openai package already in requirements
        client = OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=api_key,
        )
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": user_content},
            ],
            temperature=0.7,
            top_p=1,
            max_tokens=2048,
            extra_body={
                "reasoning_budget": 2048,
                "chat_template_kwargs": {"enable_thinking": True},
            },
        )
        content = completion.choices[0].message.content or ""
        cleaned = re.sub(r'```json\s*|\s*```', '', content).strip()
        m = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if m:
            try:
                return {"success": True, "data": json.loads(m.group()), "raw": content}
            except Exception:
                pass
        # Plain-text fallback
        return {
            "success": True,
            "data": {
                "explanation": content,
                "key_points": [],
                "visualization_description": "",
                "analogy": "",
                "common_mistakes": [],
            },
            "raw": content,
        }
    except Exception as e:
        print(f"[NEMOTRON] error: {e}")
        return {"success": False, "error": str(e), "data": _fallback(req.prompt)}


def _fallback(prompt: str) -> dict:
    return {
        "explanation": f"Nemotron could not be reached. Here is the concept you asked about: '{prompt}'.",
        "key_points": ["Check NEMOTRON_API_KEY in backend/.env", "Ensure the NVIDIA API endpoint is reachable"],
        "visualization_description": "",
        "analogy": "",
        "common_mistakes": [],
    }


# ── Professional: learning flow (divided topics) from Nemotron ───────────────────

FLOWCHART_SYSTEM = """You are a learning path advisor for professionals. Given topics they want to learn and optional context (time available, project, expertise, past learning), output a JSON array of learning steps. No markdown, no code fences. Format exactly:
[
  {"id": "step-1", "label": "Short step name", "description": "One sentence on what to do or learn"},
  {"id": "step-2", "label": "...", "description": "..."}
]
- Use the learner's TIME AVAILABLE from context: if they have limited time (e.g. 1–2 weeks), suggest fewer steps (4–5) that are high-impact; if they have more time, you can suggest more depth (6–8 steps).
- Split broad topics into concrete steps. Order by dependency where sensible. Keep labels under 6 words.
Return only the JSON array."""


class FlowchartRequest(BaseModel):
    topics: list[str]
    prompt: str | None = None  # game plan / project / time crunch / refinement


@router.post("/nemotron/flowchart")
async def nemotron_flowchart(req: FlowchartRequest):
    topics_str = ", ".join(req.topics) if req.topics else "general upskilling"
    user_content = f"Topics to learn: {topics_str}."
    if req.prompt and req.prompt.strip():
        user_content += f"\n\nContext (use this to tailor steps—especially TIME AVAILABLE): {req.prompt.strip()}"

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        steps = [{"id": f"step-{i+1}", "label": t, "description": f"Learn and apply {t}."} for i, t in enumerate(req.topics[:8])]
        if not steps:
            steps = [{"id": "step-1", "label": "Get started", "description": "Add topics and refine your game plan."}]
        return {"success": False, "steps": steps, "error": "NEMOTRON_API_KEY not set"}

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": FLOWCHART_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=1024,
        )
        content = (completion.choices[0].message.content or "").strip()
        cleaned = re.sub(r"```json\s*|\s*```", "", content).strip()
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if m:
            steps = json.loads(m.group())
            if isinstance(steps, list):
                for i, s in enumerate(steps):
                    if not isinstance(s, dict):
                        steps[i] = {"id": f"step-{i+1}", "label": str(s), "description": ""}
                    else:
                        s.setdefault("id", f"step-{i+1}")
                        s.setdefault("label", str(s.get("label", "")) or f"Step {i+1}")
                        s.setdefault("description", str(s.get("description", "")))
                return {"success": True, "steps": steps}
        # Fallback
        steps = [{"id": f"step-{i+1}", "label": t, "description": f"Learn and apply {t}."} for i, t in enumerate(req.topics[:8])]
        if not steps:
            steps = [{"id": "step-1", "label": "Get started", "description": "Refine your topics and prompt, then generate again."}]
        return {"success": True, "steps": steps}
    except Exception as e:
        print(f"[NEMOTRON flowchart] error: {e}")
        steps = [{"id": f"step-{i+1}", "label": t, "description": f"Learn and apply {t}."} for i, t in enumerate((req.topics or [])[:8])]
        if not steps:
            steps = [{"id": "step-1", "label": "Get started", "description": "Try again or add topics."}]
        return {"success": False, "steps": steps, "error": str(e)}


# ── Professional: per-step details (recommendations, sources with timestamps, visuals) ──

STEP_DETAILS_SYSTEM = """You are a learning advisor. For the given learning step and project context (including time available), respond with JSON only (no markdown):
{
  "explanation": "2-4 sentences on how this step applies to their project and what to do",
  "key_points": ["point 1", "point 2", "point 3"],
  "practice_scenario": "One concrete practice task or scenario the learner can do (e.g. 'Build a small API that returns the current time')",
  "visualization_description": "brief description of a diagram or visual that would help (e.g. flowchart, diagram)",
  "analogy": "one short real-world analogy",
  "sources": [
    {"title": "Short descriptive name", "type": "youtube", "search_query": "topic tutorial", "timestamp": "0:00"},
    {"title": "Doc or article name", "type": "article", "search_query": "topic documentation"}
  ]
}
- Consider TIME AVAILABLE from context: if limited, suggest shorter resources; if more time, suggest deeper materials.
- For sources use RELIABLE links that always work: use "search_query" (required) instead of specific URLs so we can build a search link. For YouTube use search_query like "topic name tutorial" or "topic explained". For article use search_query like "topic official docs". Optional "timestamp" for YouTube (e.g. "5:30") when a specific moment is useful. Do NOT invent specific video IDs or article URLs—they often break. Use only search_query.
- practice_scenario: one actionable task for the learner. Return only the JSON object."""


class StepDetailsRequest(BaseModel):
    topic: str
    description: str = ""
    project_context: str = ""


@router.post("/nemotron/step-details")
async def nemotron_step_details(req: StepDetailsRequest):
    user_content = f"Learning step: {req.topic}. {req.description}".strip()
    if req.project_context:
        user_content += f"\n\nProject context: {req.project_context}"

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "data": _step_details_fallback(req.topic, req.description),
            "error": "NEMOTRON_API_KEY not set",
        }

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": STEP_DETAILS_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=1024,
        )
        content = (completion.choices[0].message.content or "").strip()
        cleaned = re.sub(r"```json\s*|\s*```", "", content).strip()
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            data = json.loads(m.group())
            data.setdefault("practice_scenario", "")
            sources = data.get("sources") or []
            if isinstance(sources, list):
                from urllib.parse import quote_plus
                for s in sources:
                    if isinstance(s, dict):
                        s.setdefault("title", "Resource")
                        s.setdefault("type", "article")
                        # Prefer search_query so links always work (no dead video/article URLs)
                        q = (s.get("search_query") or s.get("title") or "").strip()
                        if q:
                            if s.get("type") == "youtube":
                                s["url"] = "https://www.youtube.com/results?search_query=" + quote_plus(q)
                                if s.get("timestamp"):
                                    s["title"] = (s.get("title") or q) + " (start at " + s["timestamp"] + ")"
                            else:
                                s["url"] = "https://www.google.com/search?q=" + quote_plus(q)
                        elif not s.get("url") or not (s.get("url", "").startswith("http")):
                            s["url"] = "https://www.youtube.com/results?search_query=" + quote_plus(s.get("title", "learn")) if s.get("type") == "youtube" else "https://www.google.com/search?q=" + quote_plus(s.get("title", "learn"))
                        # If we still have a direct video URL (model returned url, no search_query), add timestamp
                        if s.get("type") == "youtube" and s.get("timestamp") and s.get("url") and "results?search_query" not in s.get("url", ""):
                            if "youtube.com" in s.get("url", "") or "youtu.be" in s.get("url", ""):
                                s["url"] = _youtube_url_with_timestamp(s["url"], s["timestamp"])
            return {"success": True, "data": data}
        return {"success": True, "data": _step_details_fallback(req.topic, req.description)}
    except Exception as e:
        print(f"[NEMOTRON step-details] error: {e}")
        return {"success": False, "data": _step_details_fallback(req.topic, req.description), "error": str(e)}


def _timestamp_to_seconds(ts: str) -> int:
    parts = [int(p) for p in ts.strip().split(":") if p.isdigit()]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return parts[0] if parts else 0


def _youtube_url_with_timestamp(url: str, timestamp: str) -> str:
    if not url or "youtube.com" not in url and "youtu.be" not in url:
        return url
    base = url.split("?")[0]
    params = {}
    if "?" in url:
        from urllib.parse import parse_qs, urlparse
        parsed = urlparse(url)
        params = {k: v[0] if v else "" for k, v in parse_qs(parsed.query).items()}
    params["t"] = str(_timestamp_to_seconds(timestamp))
    from urllib.parse import urlencode
    return url.split("?")[0] + "?" + urlencode(params)


def _step_details_fallback(topic: str, description: str) -> dict:
    from urllib.parse import quote_plus
    q = quote_plus(f"{topic} tutorial")
    return {
        "explanation": f"Focus on '{topic}'. {description or 'Apply it to your project.'}",
        "key_points": ["Practice with a small example", "Relate to your current work", "Review key concepts"],
        "practice_scenario": f"Try building a small example that uses {topic}, or explain it in your own words.",
        "visualization_description": f"A flowchart or diagram showing steps for {topic}.",
        "analogy": "",
        "sources": [
            {"title": f"{topic} tutorial", "type": "youtube", "url": f"https://www.youtube.com/results?search_query={q}", "timestamp": "0:00"},
            {"title": f"{topic} documentation", "type": "article", "url": f"https://www.google.com/search?q={quote_plus(topic + ' documentation')}"},
        ],
    }


# ── Professional: add branches (prerequisites or follow-up steps) from per-card prompt ──

BRANCHES_SYSTEM = """You are a learning path advisor. The user is on a step and asked for clarification or more steps. Respond with a JSON array of new steps only (no markdown):
[{"id": "step-p1", "label": "Short name", "description": "One sentence"}, ...]
If they asked for prerequisites, return 1-3 steps that should come BEFORE the current step. If they asked for follow-up or "what next", return 1-3 steps that come AFTER. Keep labels under 6 words. Return only the JSON array."""


class BranchesRequest(BaseModel):
    step_id: str
    step_label: str
    prompt: str
    branch_type: str = "prerequisites"  # "prerequisites" | "follow_up"


@router.post("/nemotron/branches")
async def nemotron_branches(req: BranchesRequest):
    user_content = f"Current step: {req.step_label}. User request: {req.prompt}. Type: {req.branch_type}."

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        extra = [{"id": f"step-{req.step_id}-1", "label": "Prerequisite", "description": "Cover this before the main step."}] if req.branch_type == "prerequisites" else [{"id": f"step-{req.step_id}+1", "label": "Next step", "description": "Follow-up after this step."}]
        return {"success": False, "steps": extra, "error": "NEMOTRON_API_KEY not set"}

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": BRANCHES_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=512,
        )
        content = (completion.choices[0].message.content or "").strip()
        cleaned = re.sub(r"```json\s*|\s*```", "", content).strip()
        m = re.search(r"\[[\s\S]*\]", cleaned)
        if m:
            steps = json.loads(m.group())
            if isinstance(steps, list):
                for i, s in enumerate(steps):
                    if isinstance(s, dict):
                        s.setdefault("id", f"branch-{req.step_id}-{i}")
                        s.setdefault("label", str(s.get("label", "")) or f"Step {i+1}")
                        s.setdefault("description", str(s.get("description", "")))
                return {"success": True, "steps": steps}
        return {"success": True, "steps": []}
    except Exception as e:
        print(f"[NEMOTRON branches] error: {e}")
        return {"success": False, "steps": [], "error": str(e)}


# ── Professional: general question about the entire path ──

PATH_QUESTION_SYSTEM = """You are a learning path advisor. The user has built a learning path (a list of steps) and is asking a general question about the whole path—e.g. how it fits together, whether to reorder, how long it might take, what to focus on first, or how it relates to their goal. Use the path summary and any project context to answer helpfully in 2-6 sentences. Return plain text only, no JSON."""


class PathQuestionRequest(BaseModel):
    path_summary: str  # e.g. "Step 1: X; Step 2: Y; ..." or list of step labels
    question: str
    project_context: str = ""


@router.post("/nemotron/path-question")
async def nemotron_path_question(req: PathQuestionRequest):
    user_content = f"Learning path:\n{req.path_summary}\n\nUser question: {req.question}"
    if req.project_context.strip():
        user_content += f"\n\nProject/context: {req.project_context.strip()}"

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        return {"success": False, "answer": "Path Q&A is unavailable (API key not set).", "error": "NEMOTRON_API_KEY not set"}

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": PATH_QUESTION_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=512,
        )
        raw = (completion.choices[0].message.content or "").strip()
        answer = raw if raw else "I couldn't generate an answer. Try rephrasing your question about your path."
        return {"success": True, "answer": answer}
    except Exception as e:
        print(f"[NEMOTRON path-question] error: {e}")
        return {"success": False, "answer": "Something went wrong. Please try again.", "error": str(e)}


# ── Professional: clarification only (no new steps) ──

CLARIFY_SYSTEM = """You are a learning advisor. The user is on a specific step of their learning path and asked a clarification question. Answer concisely in 2-4 sentences. Do not add new steps or change the path. Return plain text only, no JSON."""


class ClarifyRequest(BaseModel):
    step_id: str
    step_label: str
    prompt: str


@router.post("/nemotron/clarify")
async def nemotron_clarify(req: ClarifyRequest):
    user_content = f"Step: {req.step_label}. User question: {req.prompt}"

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        return {"success": False, "clarification": "Clarification is unavailable (API key not set).", "error": "NEMOTRON_API_KEY not set"}

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": CLARIFY_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=256,
        )
        raw = (completion.choices[0].message.content or "").strip()
        clarification = raw if raw else "I’m not sure how to answer that. Try rephrasing or asking for prerequisites/follow-up steps using the other button."
        return {"success": True, "clarification": clarification}
    except Exception as e:
        print(f"[NEMOTRON clarify] error: {e}")
        return {"success": False, "clarification": "Clarification is temporarily unavailable. Please try again.", "error": str(e)}


# ── Professional: single "Ask" — clarification + optional suggested steps (user confirms) ──

ASK_SYSTEM = """You are a learning path advisor. The user is on a step and asked a question (clarification, or what to learn before/after).

1. Answer their question in 2-5 sentences, plain text. Be helpful and concise.

2. If their question implies they need prerequisites (things to learn before this step) or follow-up steps (what to do after), you MAY suggest steps. If you suggest steps, append exactly one line that is valid JSON (no markdown, no code fence) in this format:
SUGGESTED_STEPS: {"suggested_type": "prerequisites" or "follow_up", "steps": [{"id": "step-1", "label": "Short name", "description": "One sentence"}, ...]}

If the user is only asking for clarification and does not need new steps added to the path, do NOT include SUGGESTED_STEPS.
Keep step labels under 6 words. Return at most 3 steps. Return only the clarification text plus optionally the single SUGGESTED_STEPS line."""


class AskRequest(BaseModel):
    step_id: str
    step_label: str
    prompt: str


@router.post("/nemotron/ask")
async def nemotron_ask(req: AskRequest):
    user_content = f"Step: {req.step_label}. User question: {req.prompt}"

    api_key = os.getenv("NEMOTRON_API_KEY", "")
    if not api_key:
        return {
            "success": False,
            "clarification": "Ask is unavailable (API key not set).",
            "suggested_steps": None,
            "suggested_type": None,
            "error": "NEMOTRON_API_KEY not set",
        }

    try:
        from openai import OpenAI
        client = OpenAI(base_url="https://integrate.api.nvidia.com/v1", api_key=api_key)
        completion = client.chat.completions.create(
            model="nvidia/nemotron-3-nano-30b-a3b",
            messages=[
                {"role": "system", "content": ASK_SYSTEM},
                {"role": "user", "content": user_content},
            ],
            temperature=0.5,
            max_tokens=512,
        )
        content = (completion.choices[0].message.content or "").strip()
        # Extract clarification (text before SUGGESTED_STEPS)
        clarification = content
        suggested_steps = None
        suggested_type = None
        if "SUGGESTED_STEPS:" in content:
            parts = content.split("SUGGESTED_STEPS:", 1)
            clarification = parts[0].strip()
            try:
                raw = parts[1].strip()
                m = re.search(r"\{[\s\S]*\}", raw)
                if m:
                    data = json.loads(m.group())
                    suggested_steps = data.get("steps") or []
                    suggested_type = data.get("suggested_type") or "prerequisites"
                    if suggested_type not in ("prerequisites", "follow_up"):
                        suggested_type = "prerequisites"
                    if isinstance(suggested_steps, list):
                        for i, s in enumerate(suggested_steps):
                            if isinstance(s, dict):
                                s.setdefault("id", f"ask-{req.step_id}-{i}")
                                s.setdefault("label", str(s.get("label", "")) or f"Step {i+1}")
                                s.setdefault("description", str(s.get("description", "")))
            except (json.JSONDecodeError, TypeError):
                pass
        return {
            "success": True,
            "clarification": clarification,
            "suggested_steps": suggested_steps,
            "suggested_type": suggested_type,
        }
    except Exception as e:
        print(f"[NEMOTRON ask] error: {e}")
        return {
            "success": False,
            "clarification": "",
            "suggested_steps": None,
            "suggested_type": None,
            "error": str(e),
        }
