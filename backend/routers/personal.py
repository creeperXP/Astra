"""
POST /api/personal/generate  – generate a personal skill tree + resource links
"""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

log = logging.getLogger(__name__)
router = APIRouter()


class PersonalGenerateRequest(BaseModel):
    skill_name:  str
    description: str = ""
    links:       list[str] = []


def _gemini_generate(name: str, description: str, links: list[str]) -> dict[str, Any]:
    try:
        from services.gemini_service import _generate  # noqa: PLC0415

        extra = f"User-provided links: {', '.join(links)}" if links else ""
        prompt = f"""You are building a personal skill-tree learning galaxy for someone who wants to learn "{name}".
{f'Description: {description}' if description else ''}
{extra}

Create a skill tree with 5-8 nodes ordered from beginner to advanced.
For each node, provide 2-3 FREE learning resources (YouTube videos, free websites).
Use real YouTube search URLs in format: https://www.youtube.com/results?search_query=<query>

Return ONLY valid JSON:
{{
  "emoji": "🎷",
  "nodes": [
    {{
      "id": "skill_<slug>_<node_slug>",
      "name": "Node Name (2-4 words)",
      "description": "What the learner will achieve (1-2 sentences)",
      "deps": [],
      "resources": [
        {{
          "type": "youtube",
          "title": "Video title",
          "url": "https://www.youtube.com/results?search_query=...",
          "description": "What you will learn"
        }},
        {{
          "type": "website",
          "title": "Resource name",
          "url": "https://...",
          "description": "What you will learn"
        }}
      ]
    }}
  ],
  "links": [
    {{"source": "node_id_1", "target": "node_id_2", "type": "hard"}}
  ]
}}

Use REAL, FREE resources. Prefer YouTube for video content, Wikipedia/free sites for reading.
slug = skill name lowercased with underscores."""

        raw = _generate(prompt, as_json=True).strip()
        if raw:
            return json.loads(raw)
        raise RuntimeError("empty response")
    except Exception as exc:
        log.error("personal generate failed: %s", exc)
        return {}


def _fallback_tree(name: str) -> dict[str, Any]:
    slug = name.lower().replace(" ", "_")[:20]
    return {
        "emoji": "⭐",
        "nodes": [
            {
                "id": f"skill_{slug}_intro",
                "name": f"{name} Fundamentals",
                "description": f"Learn the core basics of {name}.",
                "deps": [],
                "resources": [
                    {
                        "type": "youtube",
                        "title": f"{name} for Beginners",
                        "url": f"https://www.youtube.com/results?search_query={name.replace(' ', '+')}+for+beginners",
                        "description": "Start here",
                    }
                ],
            },
            {
                "id": f"skill_{slug}_intermediate",
                "name": "Intermediate Practice",
                "description": f"Build on your {name} foundation with guided exercises.",
                "deps": [f"skill_{slug}_intro"],
                "resources": [
                    {
                        "type": "youtube",
                        "title": f"Intermediate {name} tutorial",
                        "url": f"https://www.youtube.com/results?search_query={name.replace(' ', '+')}+intermediate+tutorial",
                        "description": "Level up your skills",
                    }
                ],
            },
            {
                "id": f"skill_{slug}_advanced",
                "name": "Advanced Techniques",
                "description": f"Master advanced {name} techniques used by experts.",
                "deps": [f"skill_{slug}_intermediate"],
                "resources": [
                    {
                        "type": "youtube",
                        "title": f"Advanced {name}",
                        "url": f"https://www.youtube.com/results?search_query={name.replace(' ', '+')}+advanced+techniques",
                        "description": "Expert-level skills",
                    }
                ],
            },
        ],
        "links": [
            {"source": f"skill_{slug}_intro",        "target": f"skill_{slug}_intermediate", "type": "hard"},
            {"source": f"skill_{slug}_intermediate",  "target": f"skill_{slug}_advanced",     "type": "hard"},
        ],
    }


@router.post("/personal/generate")
def generate_personal_skill(req: PersonalGenerateRequest):
    data = _gemini_generate(req.skill_name, req.description, req.links)
    if not data.get("nodes"):
        data = _fallback_tree(req.skill_name)

    slug = req.skill_name.lower().replace(" ", "_")[:20]
    skill_id = f"personal_{slug}_{hash(req.skill_name) % 100000:05d}"

    return {
        "skill_id":    skill_id,
        "name":        req.skill_name,
        "emoji":       data.get("emoji", "⭐"),
        "description": req.description,
        "nodes":       data.get("nodes", []),
        "links":       data.get("links", []),
    }
