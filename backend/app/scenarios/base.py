from __future__ import annotations

from typing import Any, Protocol

from app.engine.decision import DecisionResult
from app.models import (
    FeedSnapshot,
    RecommendationReason,
    RouteCandidate,
    UrgencyState,
)


class Scenario(Protocol):
    @property
    def scenario_id(self) -> str: ...

    @property
    def feed_urls(self) -> list[str]: ...

    @property
    def route_choices(self) -> tuple[str, str]: ...

    @property
    def tie_winner(self) -> str: ...

    def extract_candidates(
        self, snapshot: FeedSnapshot, now: int
    ) -> tuple[RouteCandidate, RouteCandidate]:
        """Build two route candidates from raw feed data.

        All scenario-specific logic lives here: which stops matter,
        transfer overheads, anchor train logic, rider-ready times.
        """
        ...

    def summary_text(
        self,
        recommended_route: str,
        reason: RecommendationReason,
        urgency: UrgencyState,
    ) -> str: ...

    def narrative_text(
        self,
        result: DecisionResult,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
    ) -> str:
        """A 1-3 sentence story explaining the recommendation:
        where to switch, transfer window, time advantage."""
        ...

    def response_extras(
        self,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
    ) -> dict[str, Any]:
        """Extra top-level response fields (e.g. etaF, etaG)."""
        ...

    def debug_data(
        self,
        candidate_a: RouteCandidate,
        candidate_b: RouteCandidate,
        result: DecisionResult | None,
        snapshot: FeedSnapshot,
        now: int,
    ) -> dict[str, Any]:
        """Scenario-specific debug payload."""
        ...
