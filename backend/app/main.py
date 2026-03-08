from __future__ import annotations

import os
import time
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.engine.decision import DecisionResult, decide
from app.feeds.client import FeedClient
from app.models import (
    ConfidenceLevel,
    RecommendationReason,
    RouteCandidate,
    UrgencyState,
)
from app.scenarios.f_or_g import FOrGScenario

load_dotenv()

MAX_FEED_AGE_SECONDS = int(os.getenv("MAX_FEED_AGE_SECONDS", "60"))
TIE_WINDOW_SECONDS = int(os.getenv("TIE_WINDOW_SECONDS", "60"))
FEED_CACHE_SECONDS = int(os.getenv("FEED_CACHE_SECONDS", "20"))
MTA_API_KEY = os.getenv("MTA_API_KEY", "")

scenario = FOrGScenario()
feed_client = FeedClient(api_key=MTA_API_KEY, cache_seconds=FEED_CACHE_SECONDS)


def _uncertainty_note(
    result: DecisionResult | None,
    candidate_a: RouteCandidate,
    candidate_b: RouteCandidate,
    data_freshness: int,
) -> str | None:
    if result is None:
        return "No train timing data available."
    if result.confidence in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM):
        return None
    # LOW confidence — explain why
    if result.reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
        return None  # Close call, not real uncertainty
    if candidate_a.eta_seconds is None or candidate_b.eta_seconds is None:
        missing = candidate_a.route if candidate_a.eta_seconds is None else candidate_b.route
        return f"No upcoming {missing} trains found."
    if data_freshness > MAX_FEED_AGE_SECONDS:
        return f"Train data is {data_freshness}s old and may be outdated."
    return "Limited confidence in this recommendation."


def _build_recommendation() -> dict[str, Any]:
    now = int(time.time())
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

    try:
        snapshot = feed_client.fetch(scenario.feed_urls)
    except Exception:
        debug = {
            "decisionTimestamp": now,
            "feedTimestamp": None,
            "dataFreshnessSeconds": None,
        }
        return {
            "recommendedRoute": "?",
            "urgencyState": UrgencyState.NORMAL,
            "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
            "summaryText": "No signal.",
            "narrativeText": None,
            "uncertaintyNote": "Could not reach train data feeds.",
            "etaF": None,
            "etaG": None,
            "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            "dataFreshnessSeconds": None,
            "serverTimeEpochSeconds": now,
            "serverTimeIsoUtc": now_iso,
            "debugData": debug,
        }

    data_freshness = max(0, now - snapshot.feed_ts)
    candidate_a, candidate_b = scenario.extract_candidates(snapshot, now)

    result = decide(
        candidate_a,
        candidate_b,
        tie_winner_route=scenario.tie_winner,
        tie_window_seconds=TIE_WINDOW_SECONDS,
        max_feed_age_seconds=MAX_FEED_AGE_SECONDS,
        data_freshness_seconds=data_freshness,
    )

    extras = scenario.response_extras(candidate_a, candidate_b)
    scenario_debug = scenario.debug_data(
        candidate_a, candidate_b, result, snapshot, now
    )

    debug = {
        "decisionTimestamp": now,
        "feedTimestamp": snapshot.feed_ts,
        "dataFreshnessSeconds": data_freshness,
    }
    debug.update(scenario_debug)

    uncertainty = _uncertainty_note(result, candidate_a, candidate_b, data_freshness)

    if result is None:
        return {
            "recommendedRoute": "?",
            "urgencyState": UrgencyState.NORMAL,
            "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
            "summaryText": "No signal.",
            "narrativeText": None,
            "uncertaintyNote": uncertainty,
            "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            "dataFreshnessSeconds": data_freshness,
            "serverTimeEpochSeconds": now,
            "serverTimeIsoUtc": now_iso,
            "debugData": debug,
            **extras,
        }

    debug["serverTimeIsoUtc"] = now_iso

    summary = scenario.summary_text(
        result.winning.route, result.reason, result.urgency
    )
    narrative = scenario.narrative_text(result, candidate_a, candidate_b)

    return {
        "recommendedRoute": result.winning.route,
        "urgencyState": result.urgency,
        "recommendationReason": result.reason,
        "summaryText": summary,
        "narrativeText": narrative,
        "uncertaintyNote": uncertainty,
        "confidenceLevel": result.confidence,
        "dataFreshnessSeconds": data_freshness,
        "serverTimeEpochSeconds": now,
        "serverTimeIsoUtc": now_iso,
        "debugData": debug,
        **extras,
    }


app = FastAPI(title="F or G API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/recommendation")
def recommendation() -> dict[str, Any]:
    return _build_recommendation()


@app.get("/debug", response_class=HTMLResponse)
def debug_page() -> str:
    with open(
        os.path.join(os.path.dirname(__file__), "..", "static", "debug.html"),
        "r",
        encoding="utf-8",
    ) as f:
        return f.read()
