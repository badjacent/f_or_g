from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


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
class StopTimeEntry:
    stop_id: str
    arrival_ts: int


@dataclass
class TripUpdate:
    route_id: str
    trip_id: str
    stop_times: list[StopTimeEntry]


@dataclass
class FeedSnapshot:
    fetched_at: int
    feed_ts: int
    trip_updates: list[TripUpdate]


@dataclass
class TripPrediction:
    route_id: str
    trip_id: str
    boarding_stop_id: str
    boarding_arrival_ts: int
    destination_arrival_ts: int | None


@dataclass
class RouteCandidate:
    route: str
    transfer_overhead_seconds: int
    boarding_stop_id: str | None
    boarding_arrival_ts: int | None
    destination_arrival_ts: int | None
    eta_seconds: int | None
    transfer_margin_seconds: int | None
