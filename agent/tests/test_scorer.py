import json
from pathlib import Path

from scorer import canonical_skill, score_job

CASES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "shared"
        / "fixtures"
        / "scorer-cases.json"
    ).read_text()
)


def test_aliases():
    assert canonical_skill("js") == "JavaScript"
    assert canonical_skill("node") == "Node.js"


def test_matches_typescript_scorer():
    assert CASES["cases"], "fixture is empty; run npm test to regenerate"
    for case in CASES["cases"]:
        got = score_job(case["snapshot"], case["job"])
        want = case["expected"]
        if want is None:
            assert got is None, case["name"]
            continue
        assert got is not None, case["name"]
        assert got["score"] == want["score"], case["name"]
        assert got["factors"] == want["factors"], case["name"]
        assert got["accommodationCoverage"] == want["accommodationCoverage"], case[
            "name"
        ]


def test_no_identity_needed():
    case = CASES["cases"][0]
    assert "userId" not in case["snapshot"]
