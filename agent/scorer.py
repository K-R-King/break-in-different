"""MatchAgent scorer. Mirrors convex/match/scorer.ts; both run shared/fixtures/scorer-cases.json.

Score = 100 x (0.60 S + 0.30 R + 0.10 L) - P
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Any

CONFLICT_PENALTY = 25
CONFLICT_CAP = 40

ROLE_ADJACENCY: dict[str, list[str]] = {
    "full_stack_developer": [
        "frontend_engineer",
        "backend_engineer",
        "software_engineer",
    ],
    "ml_engineer": ["applied_scientist", "data_scientist"],
}

_SHARED = Path(
    os.environ.get(
        "SHARED_FIXTURES",
        Path(__file__).resolve().parent.parent / "shared" / "fixtures",
    )
)
_ALIASES: dict[str, str] = {}
for row in json.loads((_SHARED / "skill-aliases.json").read_text())["skills"]:
    canonical, *aliases = row
    for term in [canonical, *aliases]:
        _ALIASES[" ".join(term.strip().lower().split())] = canonical


def _key(s: str) -> str:
    return " ".join(s.strip().lower().split())


def canonical_skill(name: str) -> str:
    return _ALIASES.get(_key(name), name.strip())


def skill_key(name: str) -> str:
    return _key(canonical_skill(name))


def role_match(role_ids: list[str], family: str) -> str | None:
    if family in role_ids:
        return "exact"
    if any(family in ROLE_ADJACENCY.get(r, []) for r in role_ids):
        return "adjacent"
    return None


def _round_half_up(x: float) -> int:
    # JavaScript Math.round semantics, so both scorers agree on .5 cases.
    return math.floor(x + 0.5)


def score_job(snapshot: dict[str, Any], job: dict[str, Any]) -> dict[str, Any] | None:
    role = role_match(snapshot["roleIds"], job["roleFamily"])
    if role is None:
        return None

    user_skills = {skill_key(s) for s in snapshot["skills"]}
    total = matched_weight = 0.0
    matched: list[str] = []
    missing: list[str] = []
    for s in job["skills"]:
        w = 1.0 if s["level"] == "required" else 0.5
        total += w
        if skill_key(s["name"]) in user_skills:
            matched_weight += w
            matched.append(canonical_skill(s["name"]))
        else:
            missing.append(canonical_skill(s["name"]))
    limited = len(job["skills"]) == 0
    S = 0.5 if limited else matched_weight / total
    R = 1.0 if role == "exact" else 0.5

    user_loc = snapshot["locationText"].strip().lower()
    loc_text = snapshot["locationText"].strip()
    if job["workplaceType"] == "remote":
        fit, reason = 1, "job is remote"
    elif not user_loc:
        fit, reason = 1, "no location set"
    elif user_loc in job["location"].lower():
        fit, reason = 1, f'location matches "{loc_text}"'
    else:
        fit, reason = 0, f'not in "{loc_text}"'

    conflicts: list[dict[str, str]] = []
    coverage: dict[str, list[str]] = {
        "requiredStated": [],
        "requiredNotMentioned": [],
        "requiredConflicting": [],
    }
    for code in snapshot["requiredAccommodations"]:
        info = next((a for a in job["accommodations"] if a["code"] == code), None)
        if info and info.get("contradicts") and info.get("evidence"):
            conflicts.append({"code": code, "quote": info["evidence"]})
            coverage["requiredConflicting"].append(code)
        elif info and info["label"] in ("stated", "verified"):
            coverage["requiredStated"].append(code)
        else:
            coverage["requiredNotMentioned"].append(code)
    P = min(len(conflicts) * CONFLICT_PENALTY, CONFLICT_CAP)

    raw = 100 * (0.6 * S + 0.3 * R + 0.1 * fit) - P
    score = max(0, min(100, _round_half_up(raw)))
    return {
        "jobId": job["jobId"],
        "score": score,
        "factors": {
            "skills": {
                "ratio": _round_half_up(S * 100) / 100,
                "matched": matched,
                "missing": missing,
                "limitedInfo": limited,
            },
            "role": {"type": role},
            "location": {"fit": fit, "reason": reason},
            "conflicts": conflicts,
        },
        "accommodationCoverage": coverage,
        "explanation": "",
        "engine": "uagent",
    }
