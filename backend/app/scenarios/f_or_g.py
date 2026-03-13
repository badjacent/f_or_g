from __future__ import annotations

import os
from typing import Any

from app.engine.decision import DecisionResult, select_candidate
from app.models import (
    ConfidenceLevel,
    FeedSnapshot,
    RecommendationReason,
    RouteCandidate,
    TripPrediction,
    UrgencyState,
)


def _split_env(key: str, default: str) -> set[str]:
    return {s.strip() for s in os.getenv(key, default).split(",") if s.strip()}


def _split_urls(key: str, default: str) -> list[str]:
    return [u.strip() for u in os.getenv(key, default).split(",") if u.strip()]


class FOrGScenario:
    STOP_NAMES: dict[str, str] = {
        "A41S": "Jay St\u2011MetroTech",
        "A41N": "Jay St\u2011MetroTech",
        "A42S": "Hoyt\u2011Schermerhorn",
        "A42N": "Hoyt\u2011Schermerhorn",
    }

    def __init__(self, direction: str = "outbound") -> None:
        self._direction = direction

        if direction == "outbound":
            # Southbound A/C: Jay St first, then Hoyt
            self.scenario_id = "f_or_g_outbound"
            self.route_choices = ("F", "G")
            self.tie_winner = "F"
            self.TRANSFER_OVERHEAD = {"F": 0, "G": 90}
            ac_jay_default = "A41S"
            ac_hoyt_default = "A42S"
            self._first_stop_is_jay = True
        else:
            # Northbound A/C: Hoyt first, then Jay St
            self.scenario_id = "f_or_g_inbound"
            self.route_choices = ("F", "G")
            self.tie_winner = "G"
            self.TRANSFER_OVERHEAD = {"F": 90, "G": 0}
            ac_jay_default = "A41N"
            ac_hoyt_default = "A42N"
            self._first_stop_is_jay = False

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
        # F and G boarding stops are always southbound (toward Carroll)
        self._boarding_stop_ids_f = _split_env("MTA_BOARDING_STOP_IDS_F", "A41S")
        self._boarding_stop_ids_g = _split_env("MTA_BOARDING_STOP_IDS_G", "A42S")
        self._destination_stop_id = (
            os.getenv("MTA_DESTINATION_STOP_ID", "F21S").strip() or None
        )
        self._ac_jay_stop_id = ac_jay_default
        self._ac_hoyt_stop_id = ac_hoyt_default

        # Stashed per-request for debug_data to reference
        self._last_ac_route: str | None = None
        self._last_ac_jay_ts: int | None = None
        self._last_ac_hoyt_ts: int | None = None
        self._last_rider_ready_f_ts: int = 0
        self._last_rider_ready_g_ts: int = 0

    @property
    def feed_urls(self) -> list[str]:
        return [*self._fg_feed_urls, self._ac_feed_url]

    def _extract_predictions(
        self, snapshot: FeedSnapshot, now: int
    ) -> list[TripPrediction]:
        predictions: list[TripPrediction] = []
        for tu in snapshot.trip_updates:
            if tu.route_id not in {"F", "G"}:
                continue
            allowed = (
                self._boarding_stop_ids_f
                if tu.route_id == "F"
                else self._boarding_stop_ids_g
            )
            if not allowed:
                continue

            boarding_options: list[tuple[int, str]] = []
            destination_arrival: int | None = None

            for st in tu.stop_times:
                if st.stop_id in allowed:
                    boarding_options.append((st.arrival_ts, st.stop_id))
                if (
                    self._destination_stop_id
                    and st.stop_id == self._destination_stop_id
                ):
                    if destination_arrival is None or st.arrival_ts < destination_arrival:
                        destination_arrival = st.arrival_ts

            if not boarding_options:
                continue

            boarding_ts, boarding_stop = min(boarding_options, key=lambda p: p[0])
            predictions.append(
                TripPrediction(
                    route_id=tu.route_id,
                    trip_id=tu.trip_id,
                    boarding_stop_id=boarding_stop,
                    boarding_arrival_ts=boarding_ts,
                    destination_arrival_ts=destination_arrival,
                )
            )
        return predictions

    def _extract_ac_windows(
        self, snapshot: FeedSnapshot, now: int
    ) -> list[tuple[str, int, int]]:
        """Return (route_id, jay_ts, hoyt_ts) tuples for A/C trains in the right direction.

        Outbound (southbound A/C): jay first, hoyt second → hoyt_ts >= jay_ts.
        Inbound (northbound A/C): hoyt first, jay second → jay_ts >= hoyt_ts.
        """
        windows: list[tuple[str, int, int]] = []
        for tu in snapshot.trip_updates:
            if tu.route_id not in {"A", "C"}:
                continue
            jay_ts: int | None = None
            hoyt_ts: int | None = None
            for st in tu.stop_times:
                if st.stop_id == self._ac_jay_stop_id:
                    jay_ts = st.arrival_ts
                elif st.stop_id == self._ac_hoyt_stop_id:
                    hoyt_ts = st.arrival_ts
            if jay_ts is None or hoyt_ts is None:
                continue
            if self._first_stop_is_jay:
                # Outbound: jay first, then hoyt
                if hoyt_ts >= jay_ts and jay_ts >= now:
                    windows.append((tu.route_id, jay_ts, hoyt_ts))
            else:
                # Inbound: hoyt first, then jay
                if jay_ts >= hoyt_ts and hoyt_ts >= now:
                    windows.append((tu.route_id, jay_ts, hoyt_ts))
        # Sort by the first stop's arrival time
        sort_key = 1 if self._first_stop_is_jay else 2
        return sorted(windows, key=lambda p: p[sort_key])

    def extract_candidates(
        self, snapshot: FeedSnapshot, now: int
    ) -> tuple[RouteCandidate, RouteCandidate]:
        predictions = self._extract_predictions(snapshot, now)
        ac_windows = self._extract_ac_windows(snapshot, now)
        ac_window = ac_windows[0] if ac_windows else None
        ac_route = ac_window[0] if ac_window else None
        ac_jay_ts = ac_window[1] if ac_window else None
        ac_hoyt_ts = ac_window[2] if ac_window else None

        rider_ready_f_ts = (
            ac_jay_ts + self.TRANSFER_OVERHEAD["F"]
            if ac_jay_ts is not None
            else now + self.TRANSFER_OVERHEAD["F"]
        )
        rider_ready_g_ts = (
            ac_hoyt_ts + self.TRANSFER_OVERHEAD["G"]
            if ac_hoyt_ts is not None
            else now + self.TRANSFER_OVERHEAD["G"]
        )

        # Stash for debug_data
        self._last_ac_route = ac_route
        self._last_ac_jay_ts = ac_jay_ts
        self._last_ac_hoyt_ts = ac_hoyt_ts
        self._last_rider_ready_f_ts = rider_ready_f_ts
        self._last_rider_ready_g_ts = rider_ready_g_ts

        candidate_f = select_candidate(
            "F", predictions, now, rider_ready_f_ts, self.TRANSFER_OVERHEAD["F"]
        )
        candidate_g = select_candidate(
            "G", predictions, now, rider_ready_g_ts, self.TRANSFER_OVERHEAD["G"]
        )
        return candidate_f, candidate_g

    def summary_text(
        self,
        recommended_route: str,
        reason: RecommendationReason,
        urgency: UrgencyState,
    ) -> str:
        if reason == RecommendationReason.DATA_UNAVAILABLE:
            return "No signal. Pull to refresh."
        if reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
            return f"F and G are close. Take {self.tie_winner}."
        if reason == RecommendationReason.FASTEST_TIGHT_TRANSFER:
            if urgency == UrgencyState.HURRY:
                return f"Take {recommended_route}. Transfer is tight."
            return f"Take {recommended_route}. It is still fastest."
        if reason == RecommendationReason.LOW_CONFIDENCE:
            return f"Take {recommended_route}, but confidence is low."
        return f"Take {recommended_route}. It is clearly faster."

    def narrative_text(
        self,
        result: DecisionResult,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
    ) -> str:
        winner = result.winning
        loser = result.losing
        stop_name = self.STOP_NAMES.get(
            winner.boarding_stop_id or "", winner.boarding_stop_id or "the platform"
        )

        if result.reason == RecommendationReason.ABOUT_THE_SAME_PREFER_EASIER:
            easy_route = self.tie_winner
            if self._first_stop_is_jay:
                easy_stop = self.STOP_NAMES.get("A41S", "Jay St")
            else:
                easy_stop = self.STOP_NAMES.get("A42N", "Hoyt")
            return (
                "Both routes arrive in about the same time. "
                f"The {easy_route} is the easier transfer at {easy_stop}"
                " \u2014 just cross the platform."
            )

        parts = [f"Switch to the {winner.route} at {stop_name}."]

        if winner.transfer_margin_seconds is not None:
            if winner.transfer_margin_seconds < 60:
                parts.append(
                    f"You only have {winner.transfer_margin_seconds} seconds to transfer to the {winner.route}."
                )
            elif winner.transfer_margin_seconds < 90:
                parts.append(
                    f"You only have about {winner.transfer_margin_seconds // 60} minute to transfer to the {winner.route}."
                )
            else:
                mins = winner.transfer_margin_seconds // 60
                parts.append(f"You'll have about {mins} minutes to transfer.")

        if (
            winner.eta_seconds is not None
            and loser.eta_seconds is not None
        ):
            diff_min = round(abs(winner.eta_seconds - loser.eta_seconds) / 60)
            if diff_min > 0:
                parts.append(
                    f"About {diff_min} min faster than the {loser.route}."
                )

        return " ".join(parts)

    def response_extras(
        self,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
    ) -> dict[str, Any]:
        f_cand = candidate_a if candidate_a.route == "F" else candidate_b
        g_cand = candidate_a if candidate_a.route == "G" else candidate_b
        return {
            "etaF": f_cand.eta_seconds,
            "etaG": g_cand.eta_seconds,
            "acRoute": self._last_ac_route,
        }

    def _candidate_debug(
        self, candidate: RouteCandidate, rider_ready_ts: int
    ) -> dict[str, Any]:
        return {
            "route": candidate.route,
            "transferOverheadSeconds": candidate.transfer_overhead_seconds,
            "riderReadyAtTs": rider_ready_ts,
            "switchAtTs": candidate.boarding_arrival_ts,
            "arriveAtTs": candidate.destination_arrival_ts,
            "switchStopId": candidate.boarding_stop_id,
            "destinationStopId": self._destination_stop_id,
            "etaToDestinationSeconds": candidate.eta_seconds,
            "transferMarginSeconds": candidate.transfer_margin_seconds,
        }

    def debug_data(
        self,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
        result: DecisionResult | None,
        snapshot: FeedSnapshot,
        now: int,
    ) -> dict[str, Any]:
        f_cand = candidate_a if candidate_a.route == "F" else candidate_b
        g_cand = candidate_a if candidate_a.route == "G" else candidate_b

        data: dict[str, Any] = {
            "etaF": f_cand.eta_seconds,
            "etaG": g_cand.eta_seconds,
            "transferMargins": {
                "F": f_cand.transfer_margin_seconds,
                "G": g_cand.transfer_margin_seconds,
            },
            "routeCandidates": {
                "F": self._candidate_debug(f_cand, self._last_rider_ready_f_ts),
                "G": self._candidate_debug(g_cand, self._last_rider_ready_g_ts),
            },
            "acReference": {
                "route": self._last_ac_route,
                "jayTs": self._last_ac_jay_ts,
                "hoytTs": self._last_ac_hoyt_ts,
            },
            "destinationStopId": self._destination_stop_id,
        }

        if result:
            data.update(
                {
                    "winningRoute": result.winning.route,
                    "recommendationReason": result.reason,
                    "urgencyState": result.urgency,
                    "confidenceLevel": result.confidence,
                }
            )
        else:
            data.update(
                {
                    "winningRoute": "?",
                    "recommendationReason": RecommendationReason.DATA_UNAVAILABLE,
                    "urgencyState": UrgencyState.NORMAL,
                    "confidenceLevel": ConfidenceLevel.DATA_UNAVAILABLE,
                }
            )

        return data
