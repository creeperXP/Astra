#!/usr/bin/env python3
"""
Scrape Rate My Professor data for UTD and save to public/rmp_data.json.
Run before demo; the app loads this JSON for insights (clarity, difficulty).
If scraping fails (RMP blocks or structure changes), writes a template JSON.
"""
import argparse
import json
import os
import re
import sys

try:
    import httpx
except ImportError:
    print("pip install httpx", file=sys.stderr)
    sys.exit(1)

OUTPUT_DEFAULT = os.path.join(os.path.dirname(__file__), "..", "public", "rmp_data.json")
RMP_SEARCH_URL = "https://www.ratemyprofessors.com/search/professors?q=UT+Dallas"

TEMPLATE = {
    "school": "UT Dallas",
    "professors": [],
    "note": "Run scripts/fetch_rmp.py to populate, or add entries manually for professor clarity/difficulty.",
}


def scrape_rmp_light(client: httpx.Client) -> list[dict]:
    """Attempt to get professor list; return empty if blocked or structure unknown."""
    try:
        r = client.get(
            RMP_SEARCH_URL,
            timeout=15.0,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NebulaLabs/1.0)"},
        )
        if r.status_code != 200:
            return []
        text = r.text
        # RMP often serves React app; data may be in __NEXT_DATA__ or similar
        match = re.search(r'"teachers":\s*(\[.*?\])', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        match = re.search(r'"professors":\s*(\[.*?\])', text, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        return []
    except Exception as e:
        print(f"RMP scrape attempt: {e}", file=sys.stderr)
        return []


def main():
    p = argparse.ArgumentParser(description="Scrape RMP for UTD professors → rmp_data.json")
    p.add_argument("--output", "-o", default=OUTPUT_DEFAULT, help="Output JSON path")
    args = p.parse_args()

    out_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    with httpx.Client(follow_redirects=True) as client:
        professors = scrape_rmp_light(client)

    if not professors:
        # Normalize to our expected shape for app
        data = {
            **TEMPLATE,
            "professors": [
                {"name": "Sample Professor", "department": "CS", "rating": 4.0, "difficulty": 3.0, "clarity": 4.5},
            ],
        }
        print("No RMP data scraped; writing template. Add professors manually or run with network access.", file=sys.stderr)
    else:
        data = {"school": "UT Dallas", "professors": professors}

    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
