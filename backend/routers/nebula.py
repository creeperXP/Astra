import os
from fastapi import APIRouter, Request
import httpx

router = APIRouter()

# Fallback: demo data path relative to backend
DEMO_JSON = os.path.join(os.path.dirname(__file__), "..", "..", "public", "demo_data.json")


@router.get("/nebula/courses")
async def nebula_courses(request: Request):
    key = request.headers.get("X-Nebula-Key") or os.getenv("NEBULA_API_KEY")
    if not key:
        return _demo_courses()
    try:
        async with httpx.AsyncClient() as client:
            # Example Nebula API; replace with actual UTD Nebula endpoint
            r = await client.get(
                "https://api.utd.edu/v1/courses",
                headers={"Authorization": f"Bearer {key}"},
                timeout=5.0,
            )
            if r.status_code == 200:
                return r.json()
    except Exception:
        pass
    return _demo_courses()


def _demo_courses():
    import json
    try:
        with open(DEMO_JSON) as f:
            data = json.load(f)
            return {"courses": data.get("courses", [])}
    except FileNotFoundError:
        return {"courses": []}
