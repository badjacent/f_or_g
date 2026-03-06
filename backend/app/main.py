from __future__ import annotations

import os
import time
from dataclasses import dataclass
from enum import Enum
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from google.transit import gtfs_realtime_pb2


load_dotenv()


class RecommendationReason(str, Enum):
    FASTEST_CLEAR = "FASTEST_CLEAR"
    FASTEST_TIGHT_TRANSFER = "FASTEST_TIGHT_TRANSFER"
    ABOUT_THE_SAME_PREFER_EASIER = "ABOUT_THE_SAME_PREFER_EASIER"
    LOW_CONFIDENCE = "LOW_CONFIDENCE"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


class UrgencyState(str, Enum):
    NORMAL = "NORMAL"
    HURRY = "HURRY"


class ConfidenceLevel(str, Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


@dataclass
class TripPrediction:
    route_id: str
    trip_id: str
    boarding_stop_id: str
    boarding_arrival_ts: int
    destination_arrival_ts: int | None


@dataclass
class ParsedFeed:
    fetched_at: int
    feed_ts: int
    predictions: list[TripPrediction]


@dataclass
class RouteCandidate:
    route: str
    transfer_overhead_seconds: int
    boarding_stop_id: str | None
    boarding_arrival_ts: int | None
    destination_arrival_ts: int | None
    eta_seconds: int | None
    transfer_margin_seconds: int | None


TRANSFER_OVERHEAD_SECONDS = {
    "F": 0,
    "G": 90,
}

MAX_FEED_AGE_SECONDS = int(os.getenv("MAX_FEED_AGE_SECONDS", "60"))
TIE_WINDOW_SECONDS = int(os.getenv("TIE_WINDOW_SECONDS", "60"))
FEED_CACHE_SECONDS = int(os.getenv("FEED_CACHE_SECONDS", "20"))

MTA_FEED_URLS = [
    url.strip()
    for url in os.getenv(
        "MTA_FEED_URLS",
        (
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm,"
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
        ),
    ).split(",")
    if url.strip()
]
MTA_API_KEY = os.getenv("MTA_API_KEY", "")

BOARDING_STOP_IDS_F = {
    stop.strip()
    for stop in os.getenv("MTA_BOARDING_STOP_IDS_F", "A41S").split(",")
    if stop.strip()
}
BOARDING_STOP_IDS_G = {
    stop.strip()
    for stop in os.getenv("MTA_BOARDING_STOP_IDS_G", "A42S").split(",")
    if stop.strip()
}
DESTINATION_STOP_ID = os.getenv("MTA_DESTINATION_STOP_ID", "F21S").strip() or None

_feed_cache: ParsedFeed | None = None


def _fetch_feed() -> ParsedFeed:
    global _feed_cache

    now = int(time.time())
    if _feed_cache and (now - _feed_cache.fetched_at) <= FEED_CACHE_SECONDS:
        return _feed_cache

    headers = {"x-api-key": MTA_API_KEY} if MTA_API_KEY else {}
    feed_ts_values: list[int] = []
    predictions: list[TripPrediction] = []

    for feed_url in MTA_FEED_URLS:
        response = requests.get(feed_url, headers=headers, timeout=4)
        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)
        feed_ts_values.append(int(feed.header.timestamp) if feed.header.timestamp else now)

        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue

            trip_update = entity.trip_update
            trip = trip_update.trip
            route_id = trip.route_id
            if route_id not in {"F", "G"}:
                continue

            allowed_boarding = BOARDING_STOP_IDS_F if route_id == "F" else BOARDING_STOP_IDS_G
            if not allowed_boarding:
                continue

            trip_id = trip.trip_id or entity.id or f"{route_id}-unknown"
            boarding_options: list[tuple[int, str]] = []
            destination_arrival: int | None = None

            for stop_update in trip_update.stop_time_update:
                if not stop_update.arrival.time:
                    continue

                arrival_ts = int(stop_update.arrival.time)
                if arrival_ts < now - 60:
                    continue

                if stop_update.stop_id in allowed_boarding:
                    boarding_options.append((arrival_ts, stop_update.stop_id))

                if DESTINATION_STOP_ID and stop_update.stop_id == DESTINATION_STOP_ID:
                    if destination_arrival is None or arrival_ts < destination_arrival:
                        destination_arrival = arrival_ts

            if not boarding_options:
                continue

            boarding_arrival_ts, boarding_stop_id = min(boarding_options, key=lambda pair: pair[0])
            predictions.append(
                TripPrediction(
                    route_id=route_id,
                    trip_id=trip_id,
                    boarding_stop_id=boarding_stop_id,
                    boarding_arrival_ts=boarding_arrival_ts,
                    destination_arrival_ts=destination_arrival,
                )
            )

    feed_ts = min(feed_ts_values) if feed_ts_values else now
    parsed = ParsedFeed(fetched_at=now, feed_ts=feed_ts, predictions=predictions)
    _feed_cache = parsed
    return parsed


def _select_candidate(route: str, predictions: list[TripPrediction], now: int) -> RouteCandidate:
    overhead = TRANSFER_OVERHEAD_SECONDS[route]
    rider_ready_ts = now + overhead

    eligible = [
        prediction
        for prediction in predictions
        if prediction.route_id == route
        and prediction.boarding_arrival_ts >= rider_ready_ts
        and prediction.destination_arrival_ts is not None
        and prediction.destination_arrival_ts >= prediction.boarding_arrival_ts
    ]
    eligible.sort(
        key=lambda prediction: (
            prediction.destination_arrival_ts or 0,
            prediction.boarding_arrival_ts,
        )
    )

    best_trip = eligible[0] if eligible else None
    destination_arrival_ts = best_trip.destination_arrival_ts if best_trip else None

    # Score by destination ETA only; transfer time is a catchability gate.
    eta_seconds = (destination_arrival_ts - now) if destination_arrival_ts is not None else None
    transfer_margin = (
        (best_trip.boarding_arrival_ts - rider_ready_ts) if best_trip else None
    )

    return RouteCandidate(
        route=route,
        transfer_overhead_seconds=overhead,
        boarding_stop_id=(best_trip.boarding_stop_id if best_trip else None),
        boarding_arrival_ts=(best_trip.boarding_arrival_ts if best_trip else None),
        destination_arrival_ts=destination_arrival_ts,
        eta_seconds=eta_seconds,
        transfer_margin_seconds=transfer_margin,
    )


def _candidate_debug(route: str, candidate: RouteCandidate) -> dict[str, Any]:
    return {
        "route": route,
        "switchAtTs": candidate.boarding_arrival_ts,
        "arriveAtTs": candidate.destination_arrival_ts,
        "switchStopId": candidate.boarding_stop_id,
        "destinationStopId": DESTINATION_STOP_ID,
        "etaToDestinationSeconds": candidate.eta_seconds,
        "transferMarginSeconds": candidate.transfer_margin_seconds,
    }


def _summary_text(
    recommended_route: str,
    reason: RecommendationReason,
    urgency: UrgencyState,
) -> str:
    if reason == RecommendationReason.DATA_UNAVAILABLE:
        return "No signal. Pull to refresh."
    if reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
        return "F and G are close. Take F."
    if reason == RecommendationReason.FASTEST_TIGHT_TRANSFER:
        if urgency == UrgencyState.HURRY:
            return f"Take {recommended_route} now. Transfer is tight."
        return f"Take {recommended_route}. It is still fastest."
    if reason == RecommendationReason.LOW_CONFIDENCE:
        return f"Take {recommended_route}, but confidence is low."
    return f"Take {recommended_route}. It is clearly faster."


def _confidence_level(
    data_freshness_seconds: int,
    has_both_etas: bool,
    eta_gap_seconds: int | None,
    winner_transfer_margin_seconds: int | None,
    tie_used: bool,
) -> ConfidenceLevel:
    if not has_both_etas:
        return ConfidenceLevel.LOW
    if data_freshness_seconds > MAX_FEED_AGE_SECONDS:
        return ConfidenceLevel.LOW
    if tie_used:
        return ConfidenceLevel.LOW

    tight_transfer = (
        winner_transfer_margin_seconds is not None and winner_transfer_margin_seconds < 90
    )
    if tight_transfer or (eta_gap_seconds is not None and eta_gap_seconds <= 60):
        return ConfidenceLevel.MEDIUM
    if eta_gap_seconds is not None and eta_gap_seconds > 60:
        return ConfidenceLevel.HIGH
    return ConfidenceLevel.MEDIUM


def _debug_payload_base(now: int, feed_ts: int | None, freshness: int | None) -> dict[str, Any]:
    return {
        "decisionTimestamp": now,
        "feedTimestamp": feed_ts,
        "dataFreshnessSeconds": freshness,
        "destinationStopId": DESTINATION_STOP_ID,
    }


def _build_recommendation() -> dict[str, Any]:
    now = int(time.time())

    try:
        parsed = _fetch_feed()
    except Exception:
        base = _debug_payload_base(now, None, None)
        base.update(
            {
                "etaF": None,
                "etaG": None,
                "transferMargins": {"F": None, "G": None},
                "routeCandidates": {"F": None, "G": None},
                "winningRoute": "?",
                "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
                "urgencyState": UrgencyState.NORMAL,
                "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            }
        )
        return {
            "recommendedRoute": "?",
            "urgencyState": UrgencyState.NORMAL,
            "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
            "summaryText": "No signal.",
            "etaF": None,
            "etaG": None,
            "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            "dataFreshnessSeconds": None,
            "debugData": base,
        }

    data_freshness = max(0, now - parsed.feed_ts)

    candidate_f = _select_candidate("F", parsed.predictions, now)
    candidate_g = _select_candidate("G", parsed.predictions, now)

    eta_f = candidate_f.eta_seconds
    eta_g = candidate_g.eta_seconds

    if eta_f is None and eta_g is None:
        base = _debug_payload_base(now, parsed.feed_ts, data_freshness)
        base.update(
            {
                "etaF": None,
                "etaG": None,
                "transferMargins": {
                    "F": candidate_f.transfer_margin_seconds,
                    "G": candidate_g.transfer_margin_seconds,
                },
                "routeCandidates": {
                    "F": _candidate_debug("F", candidate_f),
                    "G": _candidate_debug("G", candidate_g),
                },
                "winningRoute": "?",
                "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
                "urgencyState": UrgencyState.NORMAL,
                "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            }
        )
        return {
            "recommendedRoute": "?",
            "urgencyState": UrgencyState.NORMAL,
            "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
            "summaryText": "No signal.",
            "etaF": None,
            "etaG": None,
            "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
            "dataFreshnessSeconds": data_freshness,
            "debugData": base,
        }

    if eta_f is None:
        winning = candidate_g
        losing = candidate_f
        reason = RecommendationReason.LOW_CONFIDENCE
        tie_used = False
    elif eta_g is None:
        winning = candidate_f
        losing = candidate_g
        reason = RecommendationReason.LOW_CONFIDENCE
        tie_used = False
    else:
        eta_gap = abs(eta_f - eta_g)
        if eta_gap <= TIE_WINDOW_SECONDS:
            winning = candidate_f
            losing = candidate_g
            reason = RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER
            tie_used = True
        elif eta_f < eta_g:
            winning = candidate_f
            losing = candidate_g
            tie_used = False
            reason = (
                RecommendationReason.FASTEST_TIGHT_TRANSFER
                if (winning.transfer_margin_seconds is not None and winning.transfer_margin_seconds < 90)
                else RecommendationReason.FASTEST_CLEAR
            )
        else:
            winning = candidate_g
            losing = candidate_f
            tie_used = False
            reason = (
                RecommendationReason.FASTEST_TIGHT_TRANSFER
                if (winning.transfer_margin_seconds is not None and winning.transfer_margin_seconds < 90)
                else RecommendationReason.FASTEST_CLEAR
            )

    urgency = (
        UrgencyState.HURRY
        if (winning.transfer_margin_seconds is not None and winning.transfer_margin_seconds < 90)
        else UrgencyState.NORMAL
    )

    eta_gap = (
        abs((winning.eta_seconds or 0) - (losing.eta_seconds or 0))
        if winning.eta_seconds is not None and losing.eta_seconds is not None
        else None
    )

    confidence = _confidence_level(
        data_freshness_seconds=data_freshness,
        has_both_etas=(eta_f is not None and eta_g is not None),
        eta_gap_seconds=eta_gap,
        winner_transfer_margin_seconds=winning.transfer_margin_seconds,
        tie_used=tie_used,
    )

    if data_freshness > MAX_FEED_AGE_SECONDS and confidence == ConfidenceLevel.HIGH:
        confidence = ConfidenceLevel.MEDIUM

    payload = {
        "recommendedRoute": winning.route,
        "urgencyState": urgency,
        "recommendationReason": reason,
        "summaryText": _summary_text(winning.route, reason, urgency),
        "etaF": eta_f,
        "etaG": eta_g,
        "confidenceLevel": confidence,
        "dataFreshnessSeconds": data_freshness,
        "debugData": {
            "decisionTimestamp": now,
            "feedTimestamp": parsed.feed_ts,
            "dataFreshnessSeconds": data_freshness,
            "etaF": eta_f,
            "etaG": eta_g,
            "transferMargins": {
                "F": candidate_f.transfer_margin_seconds,
                "G": candidate_g.transfer_margin_seconds,
            },
            "routeCandidates": {
                "F": _candidate_debug("F", candidate_f),
                "G": _candidate_debug("G", candidate_g),
            },
            "destinationStopId": DESTINATION_STOP_ID,
            "winningRoute": winning.route,
            "recommendationReason": reason,
            "urgencyState": urgency,
            "confidenceLevel": confidence,
        },
    }

    if confidence == ConfidenceLevel.LOW and reason in {
        RecommendationReason.FASTEST_CLEAR,
        RecommendationReason.FASTEST_TIGHT_TRANSFER,
    }:
        payload["recommendationReason"] = RecommendationReason.LOW_CONFIDENCE
        payload["summaryText"] = _summary_text(
            winning.route,
            RecommendationReason.LOW_CONFIDENCE,
            urgency,
        )

    return payload


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
    with open(os.path.join(os.path.dirname(__file__), "..", "static", "debug.html"), "r", encoding="utf-8") as f:
        return f.read()
