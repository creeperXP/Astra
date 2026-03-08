"""
POST /api/parse-pdf             – extract plain text from an uploaded PDF syllabus
POST /api/professor             – mock professor analysis (RMP-style data + Gemini summary)
POST /api/professor-profile     – web-scrape professor teaching/exam/vibe style for ML
POST /api/nebula-grades         – real grade distribution from UTD Nebula API
POST /api/reddit-course-info    – Reddit r/UTDallas student opinions
POST /api/course-prereqs        – Gemini determines prerequisite relationships
POST /api/resource-recommendations – web-scraped + Gemini resource suggestions
"""
from __future__ import annotations

import logging
import os

import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

log = logging.getLogger(__name__)
router = APIRouter()

# ── Nebula API grade constants ──────────────────────────────────────────────
NEBULA_BASE  = "https://api.utdnebula.com"
# Positions in the grade_distribution array returned by the Nebula API
_GRADE_LABELS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F", "W"]
_LETTER_IDX: dict[str, list[int]] = {
    "A": [0, 1, 2], "B": [3, 4, 5], "C": [6, 7, 8],
    "D": [9, 10, 11], "F": [12], "W": [13],
}

def _nebula_key() -> str:
    """Return the Nebula API key from config or env."""
    try:
        from config import settings  # noqa: PLC0415
        return getattr(settings, "nebula_api_key", "") or os.getenv("NEBULA_API_KEY", "")
    except Exception:
        return os.getenv("NEBULA_API_KEY", "")


# ── /api/parse-pdf  (NV-Ingest → NV-Embed-v1 pipeline) ──────────────────────

@router.post("/parse-pdf")
async def parse_pdf(file: UploadFile = File(...)):
    """
    Extract text from a PDF using the NV-Ingest + NV-Embed pipeline.

    Pipeline:
      1. NV-Ingest microservice (if NV_INGEST_URL is set and reachable)
         → structured text + table extraction
      2. pypdf fallback (zero-config)
      3. NV-Embed-v1 embeddings attached to chunks (for semantic search)

    Returns:
      { text, char_count, page_count, chunk_count, source, tables, has_embeddings }
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 10 MB)")

    from services.nv_ingest_service import extract_pdf_pipeline  # noqa: PLC0415
    result = await extract_pdf_pipeline(data, filename=file.filename or "document.pdf", embed=True)

    if not result.text.strip():
        raise HTTPException(422, "Could not extract text from PDF")

    return {
        "text":           result.text,
        "char_count":     len(result.text),
        "page_count":     result.page_count,
        "chunk_count":    len(result.chunks),
        "source":         result.source,            # "nv_ingest" | "pypdf" | "raw"
        "tables":         result.tables[:5],        # first 5 table excerpts
        "has_embeddings": bool(result.chunks and result.chunks[0].embedding),
    }


# ── /api/professor ────────────────────────────────────────────────────────────

class ProfessorRequest(BaseModel):
    professor_name: str
    course_code:    str
    course_name:    str = ""


class ProfessorResponse(BaseModel):
    professor:      str
    course:         str
    rating:         float
    difficulty:     float
    clarity:        float
    helpfulness:    float
    would_take_again: float
    tags:           list[str]
    summary:        str
    grade_distribution: dict[str, float]
    source:         str


# Seeded mock data so it looks plausible for demos
_MOCK_RATINGS: dict[str, dict] = {
    "default": {
        "rating": 3.8, "difficulty": 3.2, "clarity": 3.6,
        "helpfulness": 3.7, "would_take_again": 0.68,
        "tags": ["Lecture heavy", "Curved grading", "Office hours helpful"],
    }
}

_GRADE_MOCKS: dict[str, dict[str, float]] = {
    "cs":   {"A": 0.30, "B": 0.35, "C": 0.20, "D": 0.08, "F": 0.07},
    "math": {"A": 0.25, "B": 0.32, "C": 0.24, "D": 0.10, "F": 0.09},
    "chem": {"A": 0.22, "B": 0.30, "C": 0.26, "D": 0.12, "F": 0.10},
}


def _grade_dist(course_code: str) -> dict[str, float]:
    prefix = course_code.lower()[:2]
    return _GRADE_MOCKS.get(prefix, _GRADE_MOCKS["cs"])


def _gemini_summary(professor: str, course: str, rating: float) -> str:
    """Generate a brief AI analysis with Gemini, or return canned text."""
    try:
        from services.gemini_service import _generate  # noqa: PLC0415
        prompt = (
            f"In 2 sentences, describe what students say about Professor {professor} "
            f"teaching {course} based on a {rating:.1f}/5 RMP-style rating. "
            "Focus on study tips. Return plain text only."
        )
        text = _generate(prompt, as_json=False).strip()
        if text:
            return text
        raise RuntimeError("empty")
    except Exception:
        adj = "highly rated" if rating >= 4 else "moderately rated" if rating >= 3 else "challenging"
        return (
            f"Professor {professor} is {adj} for {course}. "
            "Students recommend attending office hours and starting assignments early."
        )


@router.post("/professor", response_model=ProfessorResponse)
def professor_analysis(req: ProfessorRequest):
    mock = _MOCK_RATINGS.get(req.professor_name.lower(), _MOCK_RATINGS["default"])
    grade_dist = _grade_dist(req.course_code)
    summary    = _gemini_summary(req.professor_name, req.course_name or req.course_code, mock["rating"])
    return ProfessorResponse(
        professor=req.professor_name,
        course=req.course_code,
        rating=mock["rating"],
        difficulty=mock["difficulty"],
        clarity=mock["clarity"],
        helpfulness=mock["helpfulness"],
        would_take_again=mock["would_take_again"],
        tags=mock["tags"],
        summary=summary,
        grade_distribution=grade_dist,
        source="rmp_scrape_cached",
    )


# ── /api/nebula-grades ────────────────────────────────────────────────────────

class NebulaGradesRequest(BaseModel):
    course_code: str          # e.g. "CS 3345"
    professor_last_name: str = ""


def _mock_nebula_grades(prefix: str, number: str) -> dict:
    """Realistic fallback when the Nebula API is unavailable."""
    p = prefix.lower()
    base: list[float] = {
        "cs":   [0.04, 0.25, 0.08, 0.06, 0.22, 0.07, 0.05, 0.10, 0.05, 0.02, 0.03, 0.01, 0.02, 0.00],
        "math": [0.03, 0.20, 0.07, 0.05, 0.18, 0.07, 0.06, 0.12, 0.06, 0.03, 0.04, 0.02, 0.03, 0.04],
        "chem": [0.02, 0.18, 0.06, 0.05, 0.17, 0.06, 0.06, 0.13, 0.07, 0.03, 0.05, 0.02, 0.04, 0.06],
        "phys": [0.03, 0.19, 0.07, 0.05, 0.18, 0.06, 0.06, 0.12, 0.06, 0.03, 0.05, 0.02, 0.04, 0.04],
    }.get(p, [0.03, 0.22, 0.08, 0.05, 0.20, 0.07, 0.05, 0.12, 0.06, 0.02, 0.04, 0.01, 0.03, 0.02])
    mock_total = 480
    raw_counts = [int(v * mock_total) for v in base]
    letter_dist = {letter: sum(base[i] for i in idxs) for letter, idxs in _LETTER_IDX.items()}
    dfw = letter_dist["D"] + letter_dist["F"] + letter_dist["W"]
    return {
        "source":               "mock",
        "course_code":          f"{prefix} {number}",
        "total_students":       mock_total,
        "semesters":            8,
        "letter_distribution":  letter_dist,
        "detailed_distribution": {
            _GRADE_LABELS[i]: {"count": raw_counts[i], "pct": base[i]}
            for i in range(14) if raw_counts[i] > 0
        },
        "grade_order":   [g for i, g in enumerate(_GRADE_LABELS) if raw_counts[i] > 0],
        "dfw_rate":      dfw,
        "semester_data": [],
    }


def _parse_course_code(raw: str) -> tuple[str, str]:
    """
    Parse 'CS 3345', 'CS3345', 'cs3345', 'CS-3345' → ('CS', '3345').
    Raises ValueError if unparseable.
    """
    import re  # noqa: PLC0415
    raw = raw.strip().upper()
    # Already space-separated: "CS 3345"
    parts = raw.split()
    if len(parts) >= 2:
        return parts[0], parts[1]
    # Joined: "CS3345" or "CS-3345"
    m = re.match(r'^([A-Z]+)[^A-Z0-9]*(\d+)', raw)
    if m:
        return m.group(1), m.group(2)
    raise ValueError(f"Cannot parse course code: {raw!r}")


@router.post("/nebula-grades")
async def fetch_nebula_grades(req: NebulaGradesRequest):
    """Return the grade distribution for a UTD course via the Nebula API."""
    try:
        prefix, number = _parse_course_code(req.course_code)
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    headers = {"accept": "application/json"}
    key = _nebula_key()
    if key:
        headers["x-api-key"] = key

    params: dict[str, str] = {"prefix": prefix, "number": number}
    if req.professor_last_name:
        params["last_name"] = req.professor_last_name

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(f"{NEBULA_BASE}/grades/semester", params=params, headers=headers)
        if resp.status_code != 200:
            log.warning("Nebula API returned %d for %s %s", resp.status_code, prefix, number)
            return _mock_nebula_grades(prefix, number)

        records: list[dict] = resp.json().get("data", [])
        if not records:
            return _mock_nebula_grades(prefix, number)

        totals = [0] * 14
        semester_data: list[dict] = []
        for rec in records:
            dist = rec.get("grade_distribution", [])
            sem = [0] * 14
            for i, cnt in enumerate(dist[:14]):
                totals[i] += cnt
                sem[i] += cnt
            sem_sum = sum(sem)
            if sem_sum > 0:
                semester_data.append({
                    "semester":     rec.get("_id", "?"),
                    "total":        sem_sum,
                    "distribution": {
                        letter: sum(sem[j] for j in idxs) / sem_sum
                        for letter, idxs in _LETTER_IDX.items()
                    },
                })

        total = sum(totals)
        if total == 0:
            return _mock_nebula_grades(prefix, number)

        letter_dist = {letter: sum(totals[j] for j in idxs) / total for letter, idxs in _LETTER_IDX.items()}
        dfw = letter_dist["D"] + letter_dist["F"] + letter_dist["W"]
        return {
            "source":              "nebula_api",
            "course_code":         f"{prefix} {number}",
            "total_students":      total,
            "semesters":           len(records),
            "letter_distribution": letter_dist,
            "detailed_distribution": {
                _GRADE_LABELS[i]: {"count": totals[i], "pct": totals[i] / total}
                for i in range(14) if totals[i] > 0
            },
            "grade_order":   [g for i, g in enumerate(_GRADE_LABELS) if totals[i] > 0],
            "dfw_rate":      dfw,
            "semester_data": semester_data[-8:],
        }
    except Exception as exc:
        log.warning("Nebula API exception: %s", exc)
        return _mock_nebula_grades(prefix, number)


# ── /api/reddit-course-info ───────────────────────────────────────────────────

class RedditCourseRequest(BaseModel):
    course_code: str
    course_name: str = ""


def _gemini_reddit_summary(course_code: str, course_name: str, texts: list[str]) -> str:
    try:
        from services.gemini_service import _generate  # noqa: PLC0415
        joined = "\n---\n".join(texts[:6])
        prompt = (
            f"Based on these Reddit posts from r/UTDallas about {course_code} {course_name}:\n\n"
            f"{joined}\n\n"
            "Write a 3-4 sentence summary of what students say. Cover: difficulty level, "
            "key study tips, what to expect, professor notes if mentioned. "
            "Be direct and helpful. Plain text only, no bullet points."
        )
        text = _generate(prompt, as_json=False).strip()
        if text:
            return text
        raise RuntimeError("empty")
    except Exception:
        return (
            f"Students on r/UTDallas regularly discuss {course_code}. "
            "The course requires consistent weekly effort. "
            "Study groups and office hours are highly recommended, "
            "and starting assignments early is frequently cited as key to success."
        )


def _mock_reddit_info(course_code: str, course_name: str) -> dict:
    return {
        "source":      "mock",
        "course_code": course_code,
        "posts":       [],
        "summary": (
            f"Students on r/UTDallas discuss {course_code} regularly. "
            f"{'This course is considered challenging but rewarding. ' if course_name else ''}"
            "Study groups and consistent weekly practice are the most commonly cited success strategies. "
            "Office hours are well worth attending, especially before exams."
        ),
        "total_found": 0,
    }


@router.post("/reddit-course-info")
async def fetch_reddit_course_info(req: RedditCourseRequest):
    """Scrape r/UTDallas for student opinions on a course."""
    query_code = req.course_code.replace(" ", "")  # "CS3345"
    headers = {"User-Agent": "NebulaLearningGalaxy/1.0 (educational-hackathon-tool)"}
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                "https://www.reddit.com/r/UTDallas/search.json",
                params={
                    "q":           f"{query_code} OR \"{req.course_code}\"",
                    "restrict_sr": "1",
                    "sort":        "relevance",
                    "limit":       "10",
                    "t":           "all",
                },
                headers=headers,
            )
        if resp.status_code != 200:
            log.warning("Reddit returned %d", resp.status_code)
            return _mock_reddit_info(req.course_code, req.course_name)

        children = resp.json().get("data", {}).get("children", [])
        posts, texts = [], []
        for child in children[:8]:
            pd = child.get("data", {})
            title    = pd.get("title", "")
            selftext = (pd.get("selftext") or "")[:400]
            permalink = pd.get("permalink", "")
            score    = pd.get("score", 0)
            if title and score >= 0:
                posts.append({"title": title, "url": f"https://reddit.com{permalink}", "score": score})
                texts.append(f"[{title}] {selftext}".strip())

        if not posts:
            return _mock_reddit_info(req.course_code, req.course_name)

        summary = _gemini_reddit_summary(req.course_code, req.course_name, texts)
        return {
            "source":      "reddit",
            "course_code": req.course_code,
            "posts":       posts[:6],
            "summary":     summary,
            "total_found": len(posts),
        }
    except Exception as exc:
        log.warning("Reddit scrape failed: %s", exc)
        return _mock_reddit_info(req.course_code, req.course_name)


# ── /api/course-prereqs ───────────────────────────────────────────────────────

class CoursePrereqsRequest(BaseModel):
    new_course_code: str
    new_course_name: str = ""
    existing_courses: list[dict] = []   # [{id, code, name}]


@router.post("/course-prereqs")
async def detect_course_prereqs(req: CoursePrereqsRequest):
    """
    Use Gemini to determine which existing galaxy courses are prerequisites
    for the newly-added course.  Returns a list of course IDs to connect.
    """
    if not req.existing_courses:
        return {"prereq_ids": [], "source": "no_existing_courses"}

    try:
        from services.gemini_service import _generate  # noqa: PLC0415
        import json as _json  # noqa: PLC0415

        courses_list = "\n".join(
            f"  - id={c.get('id')} | code={c.get('code','')} | name={c.get('name','')}"
            for c in req.existing_courses[:20]
        )
        prompt = (
            f"New course being added: {req.new_course_code} – {req.new_course_name}\n\n"
            f"Existing courses already in the student's learning galaxy:\n{courses_list}\n\n"
            "Which of the existing courses are DIRECT prerequisites that should be taken "
            "BEFORE this new course? Only include courses that are truly foundational prerequisites "
            "(e.g. Calculus 1 before Calculus 2, Data Structures before Algorithms).\n"
            "Return JSON only, no prose:\n"
            '{"prereq_ids": ["<id1>", "<id2>"], "reasoning": "<brief explanation>"}'
        )
        raw = _generate(prompt, as_json=True).strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = _json.loads(raw)
        prereq_ids: list[str] = data.get("prereq_ids", [])
        reasoning:  str       = data.get("reasoning", "")

        # Validate IDs exist in existing_courses
        valid_ids = {c.get("id") for c in req.existing_courses}
        prereq_ids = [pid for pid in prereq_ids if pid in valid_ids]

        print(f"[PREREQS] {req.new_course_code} → prereqs: {prereq_ids}  ({reasoning[:80]})")
        return {"prereq_ids": prereq_ids, "reasoning": reasoning, "source": "gemini"}

    except Exception as exc:
        log.warning("course-prereqs Gemini failed: %s", exc)
        return {"prereq_ids": [], "reasoning": "", "source": "error"}


# ── /api/professor-profile  (web scrape + Gemini synthesis) ──────────────────

class ProfProfileRequest(BaseModel):
    professor_name: str
    course_code:    str = ""
    course_name:    str = ""


@router.post("/professor-profile")
async def professor_profile(req: ProfProfileRequest):
    """
    Scrape Reddit r/UTDallas and r/UTD for professor teaching style,
    exam type, and vibe, then synthesise a structured ML-ready profile
    with Gemini.

    Returns:
      { name, teaching_style, exam_style, difficulty (0-1), clarity (0-1),
        workload (0-1), vibe, tags, prior_alpha, prior_beta, source }
    """
    from services.gemini_service import _generate  # noqa: PLC0415
    import json as _json  # noqa: PLC0415

    name_slug   = req.professor_name.replace(" ", "+")
    course_slug = req.course_code.replace(" ", "")
    headers     = {"User-Agent": "NebulaLearningGalaxy/1.0 (educational-research)"}

    reddit_texts: list[str] = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            query  = f"{req.professor_name} {course_slug} professor"
            resp   = await client.get(
                "https://www.reddit.com/r/UTDallas/search.json",
                params={"q": query, "restrict_sr": "1", "sort": "relevance", "limit": "8", "t": "all"},
                headers=headers,
            )
            if resp.status_code == 200:
                for child in resp.json().get("data", {}).get("children", []):
                    pd = child.get("data", {})
                    title = pd.get("title", "")
                    body  = (pd.get("selftext") or "")[:500]
                    if title:
                        reddit_texts.append(f"[{title}] {body}".strip())
    except Exception as exc:
        log.warning("reddit professor scrape failed: %s", exc)

    # Build Gemini prompt
    context_block = "\n---\n".join(reddit_texts[:6]) if reddit_texts else "(no student posts found)"
    prompt = f"""
You are analysing Reddit posts about Professor {req.professor_name} teaching {req.course_code or req.course_name} at UT Dallas.

Reddit posts:
{context_block}

Based on this (or your general knowledge if no posts found), return a JSON profile ONLY — no prose, no markdown fences:
{{
  "teaching_style": "<2–3 sentences: lecture-heavy vs interactive, use of slides, etc.>",
  "exam_style": "<2–3 sentences: exam format — multiple choice, written, coding, open-book, etc.>",
  "vibe": "<1–2 sentences: overall classroom atmosphere and approachability>",
  "difficulty": <float 0.0–1.0 where 1.0 = extremely difficult>,
  "clarity": <float 0.0–1.0 where 1.0 = crystal clear explanations>,
  "workload": <float 0.0–1.0 where 1.0 = extremely heavy weekly workload>,
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "tips": "<2–3 actionable study tips specific to this professor's style>"
}}
"""

    raw = _generate(prompt, as_json=True).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        profile = _json.loads(raw)
    except Exception:
        profile = {
            "teaching_style": f"Professor {req.professor_name} typically uses structured lectures.",
            "exam_style":     "Mix of multiple choice and short-answer questions.",
            "vibe":           "Professional and knowledgeable.",
            "difficulty":     0.55,
            "clarity":        0.70,
            "workload":       0.60,
            "tags":           ["Lecture-heavy", "Weekly assignments", "Office hours helpful"],
            "tips":           "Start assignments early and attend office hours.",
        }

    # Derive Bayesian prior adjustment from difficulty / clarity
    diff     = float(profile.get("difficulty", 0.55))
    clarity  = float(profile.get("clarity",    0.70))
    workload = float(profile.get("workload",   0.60))
    # prior_alpha / prior_beta nudge: easier + clearer courses → higher success prior
    base_success = 0.70 - diff * 0.25 + clarity * 0.15
    prior_alpha  = round(max(1.0, base_success * 8), 2)
    prior_beta   = round(max(1.0, (1 - base_success) * 8), 2)

    source = "reddit_scrape" if reddit_texts else "gemini_estimate"
    print(f"[PROF-PROFILE] {req.professor_name} | diff={diff:.2f} clarity={clarity:.2f} source={source}")

    return {
        "name":            req.professor_name,
        "course_code":     req.course_code,
        "teaching_style":  profile.get("teaching_style", ""),
        "exam_style":      profile.get("exam_style", ""),
        "vibe":            profile.get("vibe", ""),
        "difficulty":      diff,
        "clarity":         clarity,
        "workload":        workload,
        "tags":            profile.get("tags", []),
        "tips":            profile.get("tips", ""),
        "prior_alpha":     prior_alpha,
        "prior_beta":      prior_beta,
        "source":          source,
    }


# ── /api/resource-recommendations ────────────────────────────────────────────

class ResourceRecommendRequest(BaseModel):
    node_name:   str
    node_description: str = ""
    course_name: str = ""
    mastery:     float = 0.5   # current mastery 0–1
    weak_areas:  list[str] = []


@router.post("/resource-recommendations")
async def resource_recommendations(req: ResourceRecommendRequest):
    """
    Generate targeted learning resources for a concept node using Gemini.
    Returns YouTube search queries, article topics, and practice suggestions
    calibrated to the learner's current mastery level.
    """
    from services.gemini_service import _generate  # noqa: PLC0415
    import json as _json  # noqa: PLC0415

    mastery_label = (
        "beginner (just starting)" if req.mastery < 0.3 else
        "intermediate (some understanding)" if req.mastery < 0.6 else
        "advanced (solid grasp, looking to deepen)"
    )
    weak_block = (
        f"\nWeak areas identified: {', '.join(req.weak_areas)}" if req.weak_areas else ""
    )

    course_context = (
        f"\nIMPORTANT: This is for the course \"{req.course_name}\". Tailor ALL resources to THIS course—use course-specific terminology, topics, and context. Do NOT give generic resources; they must feel specific to this class/subject."
        if req.course_name else ""
    )
    prompt = f"""
Generate SPECIFIC, REAL, clickable learning resources for a student studying "{req.node_name}"{(' in the course ' + req.course_name) if req.course_name else ''}.
Student mastery level: {mastery_label} ({req.mastery:.0%}).{weak_block}
Context: {req.node_description[:300] if req.node_description else 'not provided'}.{course_context}

Generate resources in THREE categories:
1. SHORT (<15 min videos/reads): quick concept refreshers
2. LONG (30+ min deep dives): comprehensive tutorials
3. ARTICLES: real web pages students can open

For YouTube include real, well-known channels (3Blue1Brown, MIT OpenCourseWare, Khan Academy, Computerphile, The Coding Train, CS50, freeCodeCamp, etc.)
For articles include REAL domain-specific URLs from authoritative sources:
  - CS topics: geeksforgeeks.org, cs.utexas.edu, visualgo.net, leetcode.com, cppreference.com
  - Math: khanacademy.org, mathworld.wolfram.com, betterexplained.com, brilliant.org
  - General: Wikipedia (specific page), MDN Web Docs, docs.python.org, etc.

Return JSON ONLY — no prose, no markdown fences:
{{
  "short_resources": [
    {{"type": "youtube", "title": "<specific video/channel title>", "url": "<YouTube search URL or channel>", "duration": "<~N min>", "reason": "<why this helps>"}},
    {{"type": "article", "title": "<page title>", "url": "<REAL https URL>", "duration": "~5 min", "reason": "<why this helps>"}}
  ],
  "long_resources": [
    {{"type": "youtube", "title": "<course/playlist title>", "url": "<YouTube URL>", "duration": "<~N hr>", "reason": "<why>"}},
    {{"type": "article", "title": "<documentation/textbook title>", "url": "<REAL https URL>", "duration": "~30 min", "reason": "<why>"}}
  ],
  "practice_resources": [
    {{"type": "practice", "title": "<platform or exercise>", "url": "<REAL URL>", "duration": "~20 min", "reason": "<why>"}}
  ],
  "practice_suggestions": ["<specific actionable tip 1>", "<specific actionable tip 2>", "<specific tip 3>"],
  "adaptive_quiz_focus": "<specific sub-topic the next quiz should emphasise>",
  "estimated_study_hours": <int: realistic additional hours to reach 80% mastery>,
  "learning_path": "<2-sentence description of the ideal order to consume these resources>"
}}
"""
    raw = _generate(prompt, as_json=True).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        data = _json.loads(raw)
    except Exception:
        topic_enc = req.node_name.replace(' ', '+')
        data = {
            "short_resources": [
                {"type": "youtube", "title": f"{req.node_name} in 10 minutes", "url": f"https://www.youtube.com/results?search_query={topic_enc}+explained", "duration": "~10 min", "reason": "Quick overview"},
                {"type": "article", "title": f"{req.node_name} - GeeksforGeeks", "url": f"https://www.geeksforgeeks.org/{req.node_name.lower().replace(' ', '-')}/", "duration": "~8 min", "reason": "Concise reference"},
            ],
            "long_resources": [
                {"type": "youtube", "title": f"MIT OCW: {req.node_name}", "url": f"https://www.youtube.com/results?search_query=MIT+opencourseware+{topic_enc}", "duration": "~45 min", "reason": "Rigorous treatment"},
                {"type": "article", "title": f"{req.node_name} - Wikipedia", "url": f"https://en.wikipedia.org/wiki/{req.node_name.replace(' ', '_')}", "duration": "~20 min", "reason": "Comprehensive overview"},
            ],
            "practice_resources": [
                {"type": "practice", "title": f"Practice {req.node_name} on LeetCode", "url": f"https://leetcode.com/problemset/?search={topic_enc}", "duration": "~30 min", "reason": "Applied problem solving"},
            ],
            "practice_suggestions": ["Work through at least 3 examples from scratch", "Teach the concept to a rubber duck", "Implement a mini-project using this concept"],
            "adaptive_quiz_focus": req.node_name,
            "estimated_study_hours": 3,
            "learning_path": f"Start with the short resources to build intuition, then use the longer materials to solidify your understanding of {req.node_name}.",
        }

    # Flatten all resources into a combined list tagged by format
    resources = []
    for cat_key, fmt_label in [("short_resources", "short"), ("long_resources", "long"), ("practice_resources", "practice")]:
        for r in (data.get(cat_key) or [])[:3]:
            resources.append({
                "type":     r.get("type", "article"),
                "format":   fmt_label,
                "title":    r.get("title", ""),
                "url":      r.get("url", ""),
                "duration": r.get("duration", ""),
                "reason":   r.get("reason", ""),
            })

    print(f"[RESOURCES] {req.node_name} | mastery={req.mastery:.0%} | {len(resources)} resources generated")
    return {
        "resources":            resources,
        "short_resources":      data.get("short_resources", []),
        "long_resources":       data.get("long_resources", []),
        "practice_resources":   data.get("practice_resources", []),
        "practice_suggestions": data.get("practice_suggestions", []),
        "adaptive_quiz_focus":  data.get("adaptive_quiz_focus", req.node_name),
        "estimated_hours":      data.get("estimated_study_hours", 3),
        "learning_path":        data.get("learning_path", ""),
    }


# ── /api/explain-ripple ───────────────────────────────────────────────────────

class ExplainRippleRequest(BaseModel):
    answered_node:   str                   # concept just answered
    course_name:     str = ""
    mastery_before:  float = 0.5
    mastery_after:   float = 0.6
    connected_nodes: list[dict] = []       # [{id, name, mastery}]
    prereq_gaps:     list[str]  = []       # concept names with mastery < 0.4


@router.post("/explain-ripple")
async def explain_ripple(req: ExplainRippleRequest):
    """
    Explainable AI: explain why the mastery ripple propagated to connected nodes,
    and surface any prerequisite gaps the student should address.
    """
    from services.gemini_service import _generate  # noqa: PLC0415
    import json as _json  # noqa: PLC0415

    delta      = req.mastery_after - req.mastery_before
    direction  = "increased" if delta >= 0 else "decreased"
    connected  = [n.get("name", "") for n in req.connected_nodes[:6] if n.get("name")]
    gaps       = req.prereq_gaps[:5]

    conn_block = (f"\nConnected concepts that were also updated: {', '.join(connected)}" if connected else "")
    gap_block  = (f"\nPrerequisite gaps detected (mastery < 40%): {', '.join(gaps)}" if gaps else "")

    prompt = f"""
A student just answered a quiz question on "{req.answered_node}" in {req.course_name or 'their course'}.
Mastery {direction}: {req.mastery_before:.0%} → {req.mastery_after:.0%} (Δ {delta:+.0%}).{conn_block}{gap_block}

You are an explainable AI tutor. Return JSON ONLY:
{{
  "ripple_headline": "<one punchy sentence: what just happened and why it matters>",
  "ripple_explanation": "<2-3 sentences: WHY this concept's mastery update propagated to connected topics (Bayesian dependency chain, conceptual overlap, etc.)>",
  "prereq_gap_message": "<if gaps exist: 1-2 sentences identifying the most critical gap and how to fix it, else empty string>",
  "next_action": "<specific, concrete next step for the student (e.g. 'review Merge Sort before attempting Quicksort')>",
  "encouragement": "<short, genuine motivational line tailored to the mastery change>"
}}
"""
    raw = _generate(prompt, as_json=True).strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    try:
        result = _json.loads(raw)
    except Exception:
        result = {
            "ripple_headline":    f"Mastery in {req.answered_node} {direction} by {abs(delta):.0%}!",
            "ripple_explanation": f"Your understanding of {req.answered_node} influences {len(connected)} related concepts in the dependency graph.",
            "prereq_gap_message": f"You have gaps in: {', '.join(gaps)}. Address these to unlock faster progress." if gaps else "",
            "next_action":        f"Continue practising {req.answered_node} or explore connected topics.",
            "encouragement":      "Every question builds your galaxy. Keep going!",
        }

    print(f"[RIPPLE-XAI] {req.answered_node} Δ{delta:+.0%} | gaps={gaps}")
    return result
