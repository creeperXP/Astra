#!/usr/bin/env python3
"""
Fetch courses, professors, and grade distributions from the UTD Nebula API.
API docs: https://api.utdnebula.com/swagger/index.html
Output: public/nebula_data.json (courses, professors, grade distributions).
Requires: VITE_NEBULA_API_KEY in .env
Syllabus/Gemini extraction can run later; this script only pulls from the API.
"""
import argparse
import json
import os
import sys
from datetime import datetime

try:
    import httpx
except ImportError:
    print("pip install httpx", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    print("pip install python-dotenv", file=sys.stderr)
    sys.exit(1)

# Load environment variables
load_dotenv()

BASE = "https://api.utdnebula.com"
OUTPUT_DEFAULT = os.path.join(os.path.dirname(__file__), "..", "public", "nebula_data.json")
API_KEY = os.getenv("VITE_NEBULA_API_KEY")


def get(path: str, client: httpx.Client) -> dict | list | None:
    url = f"{BASE}{path}"
    try:
        r = client.get(url, timeout=20.0)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"GET {path}: {e}", file=sys.stderr)
        return None


def main():
    p = argparse.ArgumentParser(description="Fetch Nebula API data (courses, profs, grades)")
    p.add_argument("--output", "-o", default=OUTPUT_DEFAULT, help="Output JSON path")
    args = p.parse_args()

    if not API_KEY:
        print("Error: VITE_NEBULA_API_KEY not found in .env", file=sys.stderr)
        sys.exit(1)

    out_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    headers = {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
    }

    with httpx.Client(headers=headers) as client:
        # Courses
        courses_payload = get("/course/all", client)
        if not courses_payload:
            print("No courses from /course/all; trying /course", file=sys.stderr)
            courses_payload = get("/course", client)
        if isinstance(courses_payload, dict) and "data" in courses_payload:
            courses_list = courses_payload.get("data") or []
        elif isinstance(courses_payload, list):
            courses_list = courses_payload
        else:
            courses_list = []

        # Professors
        profs_payload = get("/professor/all", client)
        if isinstance(profs_payload, dict) and "data" in profs_payload:
            professors = profs_payload.get("data") or []
        elif isinstance(profs_payload, list):
            professors = profs_payload
        else:
            professors = []

        # Build section list for grade/professor fetch
        section_ids = []
        if courses_list:
            for course in courses_list[:200]:  # Limit courses to avoid too many API calls
                sections = course.get("sections", [])
                if sections:
                    section_ids.extend(sections[:5])  # Limit sections per course

        grades_by_section = {}
        professors_by_section = {}
        for sid in section_ids[:200]:  # Limit total sections
            g = get(f"/section/{sid}/grades", client)
            if g and isinstance(g, dict) and g.get("data"):
                grades_by_section[str(sid)] = g["data"]
            elif g and isinstance(g, list):
                grades_by_section[str(sid)] = g
            p = get(f"/section/{sid}/professors", client)
            if p and isinstance(p, dict) and p.get("data"):
                professors_by_section[str(sid)] = p["data"]
            elif p and isinstance(p, list):
                professors_by_section[str(sid)] = p

        output_data = {
            "courses": courses_list,
            "professors": professors,
            "gradesBySection": grades_by_section,
            "professorsBySection": professors_by_section,
            "metadata": {
                "total_courses": len(courses_list),
                "total_professors": len(professors),
                "total_sections_with_grades": len(grades_by_section),
                "total_sections_with_professors": len(professors_by_section),
                "fetched_at": datetime.utcnow().isoformat(),
            }
        }
    with open(out_path, "w") as f:
        json.dump(output_data, f, indent=2)
    print(f"Wrote {len(courses_list)} courses, {len(professors)} professors, {len(grades_by_section)} sections with grades to {out_path}")


if __name__ == "__main__":
    main()
