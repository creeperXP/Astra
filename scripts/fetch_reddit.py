#!/usr/bin/env python3
"""
Scrape Reddit (r/utdallas primarily) for professor-specific discussions.
Extracts: difficulty ratings, exam styles, workload, class reviews.
Uses professor names from Nebula data to search for relevant discussions.
Output: public/reddit_professors_data.json
"""
import argparse
import json
import os
import re
import sys
import time
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

OUTPUT_DEFAULT = os.path.join(os.path.dirname(__file__), "..", "public", "reddit_professors_data.json")
NEBULA_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "public", "nebula_data.json")

# Load environment variables
load_dotenv()

# Patterns to extract difficulty, exam style, workload
DIFFICULTY_PATTERNS = [
    r"(?:very\s+)?(easy|hard|difficult|tough|impossible|doable|manageable)",
    r"class\s+is\s+(easy|hard|challenging|brutal|straightforward)",
    r"difficulty:\s*(easy|hard|medium|intermediate|advanced)",
    r"(?:^|\s)(easy|hard|medium)(?:\s|$)",
]

EXAM_PATTERNS = [
    r"exam(?:s)?(?:\s+is|\s+are)?\s+([^.!?]{20,80})",
    r"(?:midterm|final|quiz|test)\s+(?:is|was|had)\s+([^.!?]{15,80})",
    r"exam style:\s*([^.!?]{20,100})",
    r"(?:lots of|many|few|no)\s+(essay|multiple choice|short answer|free response|fill[- ]in|calculation)",
]

WORKLOAD_PATTERNS = [
    r"(?:workload|assignments?|homework|projects?)\s+(?:is|was)\s+(light|moderate|heavy|brutal|intense)",
    r"(?:spend|spent|spend.*?)\s+(\d+[\w\s]*hours?)\s+(?:per\s+week|studying|on\s+the\s+class)",
]


def load_nebula_professors() -> list[tuple[str, str]]:
    """Load professor names from Nebula data."""
    if not os.path.exists(NEBULA_DATA_PATH):
        print("Warning: Nebula data not found; using generic search", file=sys.stderr)
        return []

    try:
        with open(NEBULA_DATA_PATH) as f:
            data = json.load(f)
        
        professors = []
        for prof in data.get("professors", []):
            first = prof.get("first_name", "").strip()
            last = prof.get("last_name", "").strip()
            if first and last:
                professors.append((first, last))
        
        return professors[:100]  # Limit to first 100 for practical searches
    except Exception as e:
        print(f"Warning: Could not load Nebula professors: {e}", file=sys.stderr)
        return []


def extract_metadata(text: str) -> dict:
    """Extract difficulty, exam style, and workload from text."""
    metadata = {
        "difficulty": [],
        "exam_style": [],
        "workload": [],
    }
    
    if not text:
        return metadata
    
    text_lower = text.lower()
    
    # Extract difficulty
    for pattern in DIFFICULTY_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        metadata["difficulty"].extend(matches)
    
    # Extract exam style
    for pattern in EXAM_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        metadata["exam_style"].extend([m.strip()[:50] for m in matches])
    
    # Extract workload
    for pattern in WORKLOAD_PATTERNS:
        matches = re.findall(pattern, text_lower, re.IGNORECASE)
        metadata["workload"].extend([m.strip()[:50] for m in matches])
    
    # Remove duplicates and empty
    metadata = {k: list(set(v)) for k, v in metadata.items()}
    metadata = {k: [x for x in v if x] for k, v in metadata.items()}
    
    return metadata


def search_reddit_for_professor(prof_first: str, prof_last: str, limit: int = 10) -> list[dict]:
    """
    Search r/utdallas for discussions about a specific professor.
    """
    threads = []
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; NebulaLabs/1.0)",
        "Accept": "application/json",
    }
    
    search_queries = [
        f"{prof_last}",  # Last name
        f"{prof_first} {prof_last}",  # Full name
        f"prof {prof_last}",  # "prof LastName"
        f"dr {prof_last}",  # "dr LastName"
    ]
    
    try:
        with httpx.Client(timeout=20.0, headers=headers) as client:
            for query in search_queries:
                url = f"https://www.reddit.com/r/utdallas/search.json?q={query}&restrict_sr=on&limit={limit}"
                
                try:
                    response = client.get(url)
                    if response.status_code != 200:
                        continue
                    
                    data = response.json()
                    posts = data.get("data", {}).get("children", [])
                    
                    for post_data in posts:
                        post = post_data.get("data", {})
                        title = post.get("title", "")
                        body = post.get("selftext", "")
                        
                        # Skip if too short or already added
                        combined_text = f"{title} {body}"
                        if len(combined_text) < 50:
                            continue
                        
                        post_id = post.get("id")
                        if any(t["post_id"] == post_id for t in threads):
                            continue
                        
                        metadata = extract_metadata(combined_text)
                        
                        # Only include if we found useful metadata
                        if not any(metadata.values()):
                            continue
                        
                        thread_data = {
                            "subreddit": "utdallas",
                            "post_id": post_id,
                            "title": title,
                            "url": f"https://reddit.com{post.get('permalink', '')}",
                            "score": post.get("score", 0),
                            "num_comments": post.get("num_comments", 0),
                            "created_utc": post.get("created_utc"),
                            "body": body[:300] if body else None,
                            "professor": {"first_name": prof_first, "last_name": prof_last},
                            "metadata": metadata,
                        }
                        
                        threads.append(thread_data)
                    
                    time.sleep(0.5)  # Rate limit
                
                except Exception as e:
                    print(f"Error searching for '{query}': {e}", file=sys.stderr)
                    continue
    
    except Exception as e:
        print(f"Error searching Reddit: {e}", file=sys.stderr)
    
    return threads


def main():
    p = argparse.ArgumentParser(description="Scrape Reddit r/utdallas for professor reviews")
    p.add_argument("--output", "-o", default=OUTPUT_DEFAULT, help="Output JSON path")
    p.add_argument("--prof-limit", type=int, default=50, help="Number of professors to search")
    p.add_argument("--post-limit", type=int, default=10, help="Posts per professor search")
    args = p.parse_args()

    out_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print("Loading professors from Nebula data...", file=sys.stderr)
    professors = load_nebula_professors()
    
    if not professors:
        print("No professors found; using generic search keywords", file=sys.stderr)
        professors = [("Unknown", "Professor")]
    
    professors = professors[:args.prof_limit]
    print(f"Searching for {len(professors)} professors...", file=sys.stderr)

    all_threads = []
    for i, (first, last) in enumerate(professors):
        print(f"[{i+1}/{len(professors)}] Searching for {first} {last}...", file=sys.stderr)
        threads = search_reddit_for_professor(first, last, limit=args.post_limit)
        all_threads.extend(threads)
        time.sleep(1)  # Rate limit between professors

    output_data = {
        "source": "reddit_utdallas",
        "scraped_at": datetime.utcnow().isoformat(),
        "total_professor_discussions": len(all_threads),
        "professors_searched": len(professors),
        "threads": sorted(all_threads, key=lambda x: x.get("score", 0), reverse=True),
    }

    with open(out_path, "w") as f:
        json.dump(output_data, f, indent=2)

    print(f"Wrote {len(all_threads)} professor discussions to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
