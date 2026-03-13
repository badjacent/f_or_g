from __future__ import annotations

import os
import random
from typing import Any

from app.engine.decision import DecisionResult, decide, select_candidate
from app.models import (
    ConfidenceLevel,
    FeedSnapshot,
    RecommendationReason,
    RouteCandidate,
    TripPrediction,
    UrgencyState,
)

# F-line stops south of Jay St (southbound stop IDs)
F_STOP_NAMES: dict[str, str] = {
    "F14S": "East Broadway",
    "F15S": "Delancey St\u2011Essex St",
    "F16S": "York St",
    "A41S": "Jay St\u2011MetroTech",
    "F21S": "Carroll St",
    "F22S": "Smith\u201d9 Sts",
    "F20S": "Bergen St",
}

# Carroll St is the destination
CARROLL_STOP_ID = "F21S"
JAY_STOP_ID = "A41S"

# Transfer overheads (seconds)
EXPRESS_TO_LOCAL_F_OVERHEAD = 0  # same platform at Jay
EXPRESS_TO_AC_PLATFORM_OVERHEAD = 90  # walk to A/C at Jay
AC_TO_G_PLATFORM_OVERHEAD = 90  # walk from A/C at Hoyt to G

# --- Text variants for local trains ---
LOCAL_SUMMARY_VARIANTS: list[str] = [
    "Carroll at {time}",
    "Home at {time}",
    "You're on a local \u2014 Carroll at {time}",
    "Sit tight. Carroll at {time}",
    "No transfer needed. Carroll at {time}",
    "Smooth sailing \u2014 Carroll at {time}",
    "Direct to Carroll at {time}",
]

LOCAL_NARRATIVE_VARIANTS: list[str] = [
    "{eta} \u2014 no transfer needed",
    "{eta} \u2014 stay on this train",
    "{eta} \u2014 relax, you're on a local",
    "{eta} \u2014 sit back and enjoy the ride",
    "{eta} to Carroll. Zero transfers, zero stress.",
    "{eta} \u2014 the easy way home",
    "{eta}. You picked the right train.",
]

# --- Text variants for express banner ---
EXPRESS_BANNER_VARIANTS: list[str] = [
    "Express F \u2014 transfer at Jay St ({time})",
    "This train skips Carroll \u2014 get off at Jay St ({time})",
    "Express! Exit at Jay St ({time}) and transfer",
    "Doesn't stop at Carroll \u2014 Jay St at {time}",
    "Wrong F. Off at Jay St ({time}), then transfer.",
    "Express F \u2014 you'll need to switch at Jay St ({time})",
    "Heads up: this F is express. Jay St at {time}.",
]

TIE_WINDOW_SECONDS = int(os.getenv("TIE_WINDOW_SECONDS", "60"))
MAX_FEED_AGE_SECONDS = int(os.getenv("MAX_FEED_AGE_SECONDS", "60"))


def _format_time(ts: int | None) -> str:
    """Format a unix timestamp as a local time string like '7:51 PM'."""
    if ts is None:
        return "\u2014"
    import time as _time
    return _time.strftime("%-I:%M %p", _time.localtime(ts))


def _format_eta(seconds: int | None) -> str:
    if seconds is None:
        return "\u2014"
    m = max(0, round(seconds / 60))
    return f"{m} min"


def _split_urls(key: str, default: str) -> list[str]:
    return [u.strip() for u in os.getenv(key, default).split(",") if u.strip()]


class OnTheFScenario:
    def __init__(self) -> None:
        self._fg_feed_urls = _split_urls(
            "MTA_FEED_URLS",
            (
                "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm,"
                "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
            ),
        )
        self._ac_feed_url = os.getenv(
            "MTA_A_C_FEED_URL",
            "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace",
        )

    @property
    def feed_urls(self) -> list[str]:
        return [*self._fg_feed_urls, self._ac_feed_url]

    def identify_f_trains(
        self, snapshot: FeedSnapshot, now: int
    ) -> list[dict[str, Any]]:
        """Find southbound F trains that will stop at Jay St, determine local vs express."""
        trains: list[dict[str, Any]] = []

        for tu in snapshot.trip_updates:
            if tu.route_id != "F":
                continue

            jay_ts: int | None = None
            carroll_ts: int | None = None
            next_stop_id: str | None = None
            next_stop_ts: int | None = None

            for st in tu.stop_times:
                if st.stop_id == JAY_STOP_ID:
                    jay_ts = st.arrival_ts
                if st.stop_id == CARROLL_STOP_ID:
                    carroll_ts = st.arrival_ts
                # Find the next stop the train hasn't passed yet
                if st.arrival_ts >= now:
                    if next_stop_ts is None or st.arrival_ts < next_stop_ts:
                        next_stop_ts = st.arrival_ts
                        next_stop_id = st.stop_id

            # Must have Jay St in the future
            if jay_ts is None or jay_ts < now:
                continue

            is_local = carroll_ts is not None
            next_stop_name = F_STOP_NAMES.get(next_stop_id or "", None)

            trains.append({
                "tripId": tu.trip_id,
                "isLocal": is_local,
                "nextStopId": next_stop_id,
                "nextStopName": next_stop_name,
                "nextStopTs": next_stop_ts,
                "jayArrivalTs": jay_ts,
                "carrollArrivalTs": carroll_ts,  # None for express
            })

        # Sort by Jay St arrival ascending
        trains.sort(key=lambda t: t["jayArrivalTs"])
        return trains

    def _extract_predictions(
        self, snapshot: FeedSnapshot, now: int
    ) -> list[TripPrediction]:
        """Extract F and G predictions for local trains stopping at Carroll."""
        predictions: list[TripPrediction] = []
        for tu in snapshot.trip_updates:
            if tu.route_id not in {"F", "G"}:
                continue

            boarding_stop_id = JAY_STOP_ID if tu.route_id == "F" else "A42S"
            boarding_ts: int | None = None
            destination_ts: int | None = None

            for st in tu.stop_times:
                if st.stop_id == boarding_stop_id:
                    boarding_ts = st.arrival_ts
                if st.stop_id == CARROLL_STOP_ID and tu.route_id == "F":
                    destination_ts = st.arrival_ts
                if st.stop_id == CARROLL_STOP_ID and tu.route_id == "G":
                    destination_ts = st.arrival_ts

            if boarding_ts is None:
                continue

            predictions.append(
                TripPrediction(
                    route_id=tu.route_id,
                    trip_id=tu.trip_id,
                    boarding_stop_id=boarding_stop_id,
                    boarding_arrival_ts=boarding_ts,
                    destination_arrival_ts=destination_ts,
                )
            )
        return predictions

    def _extract_ac_windows(
        self, snapshot: FeedSnapshot, now: int
    ) -> list[tuple[str, int, int]]:
        """Return (route_id, jay_ts, hoyt_ts) for southbound A/C trains."""
        windows: list[tuple[str, int, int]] = []
        for tu in snapshot.trip_updates:
            if tu.route_id not in {"A", "C"}:
                continue
            jay_ts: int | None = None
            hoyt_ts: int | None = None
            for st in tu.stop_times:
                if st.stop_id == "A41S":
                    jay_ts = st.arrival_ts
                elif st.stop_id == "A42S":
                    hoyt_ts = st.arrival_ts
            if jay_ts is None or hoyt_ts is None:
                continue
            # Southbound: jay first, then hoyt
            if hoyt_ts >= jay_ts and jay_ts >= now:
                windows.append((tu.route_id, jay_ts, hoyt_ts))
        return sorted(windows, key=lambda p: p[1])

    def build_transfer_decision(
        self,
        express_jay_ts: int,
        snapshot: FeedSnapshot,
        now: int,
        data_freshness: int,
    ) -> dict[str, Any]:
        """Build a full F-or-G recommendation for an express F rider arriving at Jay St."""
        predictions = self._extract_predictions(snapshot, now)
        ac_windows = self._extract_ac_windows(snapshot, now)

        # F candidate: next local F at Jay after express rider arrives
        rider_ready_f_ts = express_jay_ts + EXPRESS_TO_LOCAL_F_OVERHEAD
        candidate_f = select_candidate(
            "F", predictions, now, rider_ready_f_ts, EXPRESS_TO_LOCAL_F_OVERHEAD
        )

        # G candidate: find first A/C arriving at Jay after express rider arrives,
        # then compute rider-ready time at Hoyt G platform
        ac_route: str | None = None
        ac_jay_ts: int | None = None
        ac_hoyt_ts: int | None = None
        for route_id, j_ts, h_ts in ac_windows:
            if j_ts >= express_jay_ts + EXPRESS_TO_AC_PLATFORM_OVERHEAD:
                ac_route = route_id
                ac_jay_ts = j_ts
                ac_hoyt_ts = h_ts
                break

        rider_ready_g_ts = (
            ac_hoyt_ts + AC_TO_G_PLATFORM_OVERHEAD
            if ac_hoyt_ts is not None
            else now + EXPRESS_TO_AC_PLATFORM_OVERHEAD + AC_TO_G_PLATFORM_OVERHEAD
        )
        candidate_g = select_candidate(
            "G", predictions, now, rider_ready_g_ts, AC_TO_G_PLATFORM_OVERHEAD
        )

        result = decide(
            candidate_f,
            candidate_g,
            tie_winner_route="F",
            tie_window_seconds=TIE_WINDOW_SECONDS,
            max_feed_age_seconds=MAX_FEED_AGE_SECONDS,
            data_freshness_seconds=data_freshness,
        )

        now_iso = ""  # Not needed for nested response

        if result is None:
            return {
                "recommendedRoute": "?",
                "urgencyState": UrgencyState.NORMAL,
                "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
                "summaryText": "No signal.",
                "narrativeText": None,
                "uncertaintyNote": "No train timing data available.",
                "etaF": None,
                "etaG": None,
                "acRoute": None,
                "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
                "dataFreshnessSeconds": data_freshness,
                "serverTimeEpochSeconds": now,
                "debugData": {},
            }

        # Build summary/narrative similar to FOrGScenario
        summary = self._summary_text(result.winning.route, result.reason, result.urgency)
        narrative = self._narrative_text(result, candidate_f, candidate_g)
        uncertainty = self._uncertainty_note(result, candidate_f, candidate_g, data_freshness)

        return {
            "recommendedRoute": result.winning.route,
            "urgencyState": result.urgency,
            "recommendationReason": result.reason,
            "summaryText": summary,
            "narrativeText": narrative,
            "uncertaintyNote": uncertainty,
            "etaF": candidate_f.eta_seconds,
            "etaG": candidate_g.eta_seconds,
            "acRoute": ac_route,
            "confidenceLevel": result.confidence,
            "dataFreshnessSeconds": data_freshness,
            "serverTimeEpochSeconds": now,
            "debugData": {
                "acReference": {
                    "route": ac_route,
                    "jayTs": ac_jay_ts,
                    "hoytTs": ac_hoyt_ts,
                },
                "routeCandidates": {
                    "F": {
                        "switchStopId": candidate_f.boarding_stop_id,
                        "switchAtTs": candidate_f.boarding_arrival_ts,
                        "arriveAtTs": candidate_f.destination_arrival_ts,
                        "transferMarginSeconds": candidate_f.transfer_margin_seconds,
                    },
                    "G": {
                        "switchStopId": candidate_g.boarding_stop_id,
                        "switchAtTs": candidate_g.boarding_arrival_ts,
                        "arriveAtTs": candidate_g.destination_arrival_ts,
                        "transferMarginSeconds": candidate_g.transfer_margin_seconds,
                    },
                },
            },
        }

    def _summary_text(
        self, route: str, reason: RecommendationReason, urgency: UrgencyState
    ) -> str:
        if reason == RecommendationReason.DATA_UNAVAILABLE:
            return "No signal. Pull to refresh."
        if reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
            return "F and G are close. Wait for F."
        if reason == RecommendationReason.FASTEST_TIGHT_TRANSFER:
            if urgency == UrgencyState.HURRY:
                return f"Take {route}. Transfer is tight."
            return f"Take {route}. It is still fastest."
        if reason == RecommendationReason.LOW_CONFIDENCE:
            return f"Take {route}, but confidence is low."
        return f"Take {route}. It is clearly faster."

    def _narrative_text(
        self,
        result: DecisionResult,
        candidate_f: RouteCandidate,
        candidate_g: RouteCandidate,
    ) -> str:
        winner = result.winning
        loser = result.losing

        if result.reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
            return (
                "Both routes arrive in about the same time. "
                "Waiting for a local F is easier \u2014 same platform."
            )

        if winner.route == "F":
            parts = ["Wait for a local F at Jay St."]
        else:
            parts = ["Transfer to the G via A/C."]

        if (
            winner.eta_seconds is not None
            and loser.eta_seconds is not None
        ):
            diff_min = round(abs(winner.eta_seconds - loser.eta_seconds) / 60)
            if diff_min > 0:
                parts.append(f"About {diff_min} min faster than the {loser.route}.")

        return " ".join(parts)

    def _uncertainty_note(
        self,
        result: DecisionResult | None,
        candidate_f: RouteCandidate,
        candidate_g: RouteCandidate,
        data_freshness: int,
    ) -> str | None:
        if result is None:
            return "No train timing data available."
        if result.confidence in (ConfidenceLevel.HIGH, ConfidenceLevel.MEDIUM):
            return None
        if candidate_f.eta_seconds is None or candidate_g.eta_seconds is None:
            missing = "F" if candidate_f.eta_seconds is None else "G"
            return f"No upcoming {missing} trains found."
        if data_freshness > MAX_FEED_AGE_SECONDS:
            return f"Train data is {data_freshness}s old and may be outdated."
        return "Limited confidence in this recommendation."

    def build_response(
        self, snapshot: FeedSnapshot, now: int, data_freshness: int
    ) -> dict[str, Any]:
        """Build the full onTheF response."""
        raw_trains = self.identify_f_trains(snapshot, now)

        trains: list[dict[str, Any]] = []
        for t in raw_trains:
            if t["isLocal"]:
                carroll_eta = (
                    t["carrollArrivalTs"] - now
                    if t["carrollArrivalTs"] is not None
                    else None
                )
                carroll_time = _format_time(t["carrollArrivalTs"])
                eta_str = _format_eta(carroll_eta)
                trains.append({
                    **t,
                    "caseTag": "local_direct",
                    "carrollEtaSeconds": carroll_eta,
                    "transferDecision": None,
                    "summaryText": random.choice(LOCAL_SUMMARY_VARIANTS).format(time=carroll_time),
                    "narrativeText": random.choice(LOCAL_NARRATIVE_VARIANTS).format(eta=eta_str),
                    "expressBannerText": None,
                })
            else:
                # Express: build transfer decision
                transfer = self.build_transfer_decision(
                    t["jayArrivalTs"], snapshot, now, data_freshness
                )
                # Carroll ETA = ETA via winning transfer option
                winning_route = transfer["recommendedRoute"]
                if winning_route == "F":
                    carroll_eta = transfer["etaF"]
                elif winning_route == "G":
                    carroll_eta = transfer["etaG"]
                else:
                    carroll_eta = None

                # For express, carrollArrivalTs comes from the transfer
                carroll_ts = now + carroll_eta if carroll_eta is not None else None
                jay_time = _format_time(t["jayArrivalTs"])

                trains.append({
                    **t,
                    "caseTag": "express_transfer",
                    "carrollArrivalTs": carroll_ts,
                    "carrollEtaSeconds": carroll_eta,
                    "transferDecision": transfer,
                    "summaryText": transfer["summaryText"],
                    "narrativeText": transfer["narrativeText"],
                    "expressBannerText": random.choice(EXPRESS_BANNER_VARIANTS).format(time=jay_time),
                })

        return {
            "trains": trains,
            "dataFreshnessSeconds": data_freshness,
            "serverTimeEpochSeconds": now,
        }
