from __future__ import annotations

from dataclasses import dataclass

from app.models import (
    ConfidenceLevel,
    RecommendationReason,
    RouteCandidate,
    TripPrediction,
    UrgencyState,
)


@dataclass
class DecisionResult:
    winning: RouteCandidate
    losing: RouteCandidate
    reason: RecommendationReason
    urgency: UrgencyState
    confidence: ConfidenceLevel
    tie_used: bool


def select_candidate(
    route: str,
    predictions: list[TripPrediction],
    now: int,
    rider_ready_ts: int,
    transfer_overhead_seconds: int,
) -> RouteCandidate:
    eligible = [
        p
        for p in predictions
        if p.route_id == route
        and p.boarding_arrival_ts >= rider_ready_ts
        and p.destination_arrival_ts is not None
        and p.destination_arrival_ts >= p.boarding_arrival_ts
    ]
    eligible.sort(
        key=lambda p: (p.destination_arrival_ts or 0, p.boarding_arrival_ts)
    )

    best = eligible[0] if eligible else None
    destination_arrival_ts = best.destination_arrival_ts if best else None
    eta_seconds = (destination_arrival_ts - now) if destination_arrival_ts is not None else None
    transfer_margin = (best.boarding_arrival_ts - rider_ready_ts) if best else None

    return RouteCandidate(
        route=route,
        transfer_overhead_seconds=transfer_overhead_seconds,
        boarding_stop_id=(best.boarding_stop_id if best else None),
        boarding_arrival_ts=(best.boarding_arrival_ts if best else None),
        destination_arrival_ts=destination_arrival_ts,
        eta_seconds=eta_seconds,
        transfer_margin_seconds=transfer_margin,
    )


def _confidence_level(
    data_freshness_seconds: int,
    has_both_etas: bool,
    eta_gap_seconds: int | None,
    winner_transfer_margin_seconds: int | None,
    tie_used: bool,
    max_feed_age_seconds: int,
) -> ConfidenceLevel:
    if not has_both_etas:
        return ConfidenceLevel.LOW
    if data_freshness_seconds > max_feed_age_seconds:
        return ConfidenceLevel.LOW
    if tie_used:
        return ConfidenceLevel.LOW

    tight_transfer = (
        winner_transfer_margin_seconds is not None
        and winner_transfer_margin_seconds < 90
    )
    if tight_transfer or (eta_gap_seconds is not None and eta_gap_seconds <= 60):
        return ConfidenceLevel.MEDIUM
    if eta_gap_seconds is not None and eta_gap_seconds > 60:
        return ConfidenceLevel.HIGH
    return ConfidenceLevel.MEDIUM


def decide(
    candidate_a: RouteCandidate,
    candidate_b: RouteCandidate,
    tie_winner_route: str,
    tie_window_seconds: int,
    max_feed_age_seconds: int,
    data_freshness_seconds: int,
) -> DecisionResult | None:
    """Compare two candidates and pick a winner.

    Returns None if both candidates lack ETAs (DATA_UNAVAILABLE).
    """
    eta_a = candidate_a.eta_seconds
    eta_b = candidate_b.eta_seconds

    if eta_a is None and eta_b is None:
        return None

    if eta_a is None:
        winning, losing = candidate_b, candidate_a
        reason = RecommendationReason.LOW_CONFIDENCE
        tie_used = False
    elif eta_b is None:
        winning, losing = candidate_a, candidate_b
        reason = RecommendationReason.LOW_CONFIDENCE
        tie_used = False
    else:
        eta_gap = abs(eta_a - eta_b)
        if eta_gap <= tie_window_seconds:
            if candidate_a.route == tie_winner_route:
                winning, losing = candidate_a, candidate_b
            else:
                winning, losing = candidate_b, candidate_a
            reason = RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER
            tie_used = True
        elif eta_a < eta_b:
            winning, losing = candidate_a, candidate_b
            tie_used = False
            reason = (
                RecommendationReason.FASTEST_TIGHT_TRANSFER
                if (winning.transfer_margin_seconds is not None and winning.transfer_margin_seconds < 90)
                else RecommendationReason.FASTEST_CLEAR
            )
        else:
            winning, losing = candidate_b, candidate_a
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
        data_freshness_seconds=data_freshness_seconds,
        has_both_etas=(eta_a is not None and eta_b is not None),
        eta_gap_seconds=eta_gap,
        winner_transfer_margin_seconds=winning.transfer_margin_seconds,
        tie_used=tie_used,
        max_feed_age_seconds=max_feed_age_seconds,
    )

    if data_freshness_seconds > max_feed_age_seconds and confidence == ConfidenceLevel.HIGH:
        confidence = ConfidenceLevel.MEDIUM

    # Override reason when confidence is low
    if confidence == ConfidenceLevel.LOW and reason in {
        RecommendationReason.FASTEST_CLEAR,
        RecommendationReason.FASTEST_TIGHT_TRANSFER,
    }:
        reason = RecommendationReason.LOW_CONFIDENCE

    return DecisionResult(
        winning=winning,
        losing=losing,
        reason=reason,
        urgency=urgency,
        confidence=confidence,
        tie_used=tie_used,
    )
