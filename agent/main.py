"""MatchAgent (Fetch.ai uAgents).

Polls Convex for anonymous match requests over HTTPS with a shared bearer secret, scores the
candidate jobs, and posts the results back. It never sees account identifiers or disability
data and has no database access. If it is offline, Convex scores with its TypeScript fallback.
"""

from __future__ import annotations

import logging
import os

import httpx
from uagents import Agent, Context

from scorer import score_job

CONVEX_SITE_URL = os.environ.get("CONVEX_SITE_URL", "http://127.0.0.1:3211").rstrip("/")
SECRET = os.environ["AGENT_SHARED_SECRET"]
AGENT_ID = os.environ.get("AGENT_ID", "match-agent-1")
POLL_SECONDS = float(os.environ.get("POLL_SECONDS", "0.5"))

agent = Agent(
    name="break_in_different_match_agent",
    seed=os.environ.get("AGENT_SEED", AGENT_ID + "-seed"),
)
client = httpx.AsyncClient(timeout=10, headers={"Authorization": f"Bearer {SECRET}"})
log = logging.getLogger("match_agent")


def handle(request: dict) -> dict:
    snapshot = request["snapshot"]
    results = [
        r for job in request["jobs"] if (r := score_job(snapshot, job)) is not None
    ]
    return {"requestId": request["requestId"], "engine": "uagent", "results": results}


@agent.on_interval(period=POLL_SECONDS)
async def poll(ctx: Context) -> None:
    try:
        res = await client.post(
            f"{CONVEX_SITE_URL}/agent/claim", json={"agentId": AGENT_ID}
        )
        if res.status_code == 429:
            return
        res.raise_for_status()
        request = res.json().get("request")
        if not request:
            return
        payload = handle(request)
        out = await client.post(f"{CONVEX_SITE_URL}/agent/result", json=payload)
        # Log request IDs and status codes only.
        ctx.logger.info(
            f"scored request {request['requestId']}: {len(payload['results'])} jobs, HTTP {out.status_code}"
        )
    except httpx.HTTPError as e:
        ctx.logger.warning(f"convex unreachable: {type(e).__name__}")


if __name__ == "__main__":
    agent.run()
