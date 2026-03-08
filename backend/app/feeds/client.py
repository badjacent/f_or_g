from __future__ import annotations

import time

import requests
from google.transit import gtfs_realtime_pb2

from app.models import FeedSnapshot, StopTimeEntry, TripUpdate


class FeedClient:
    def __init__(self, api_key: str = "", cache_seconds: int = 20):
        self._api_key = api_key
        self._cache_seconds = cache_seconds
        self._cache: dict[frozenset[str], FeedSnapshot] = {}

    def fetch(self, feed_urls: list[str]) -> FeedSnapshot:
        now = int(time.time())
        cache_key = frozenset(feed_urls)

        cached = self._cache.get(cache_key)
        if cached and (now - cached.fetched_at) <= self._cache_seconds:
            return cached

        headers = {"x-api-key": self._api_key} if self._api_key else {}
        feed_ts_values: list[int] = []
        trip_updates: list[TripUpdate] = []

        for feed_url in feed_urls:
            response = requests.get(feed_url, headers=headers, timeout=4)
            response.raise_for_status()

            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(response.content)
            feed_ts_values.append(
                int(feed.header.timestamp) if feed.header.timestamp else now
            )

            for entity in feed.entity:
                if not entity.HasField("trip_update"):
                    continue

                tu = entity.trip_update
                route_id = tu.trip.route_id
                if not route_id:
                    continue

                trip_id = tu.trip.trip_id or entity.id or f"{route_id}-unknown"
                stop_times: list[StopTimeEntry] = []

                for stu in tu.stop_time_update:
                    if not stu.arrival.time:
                        continue
                    arrival_ts = int(stu.arrival.time)
                    if arrival_ts < now - 60:
                        continue
                    stop_times.append(
                        StopTimeEntry(stop_id=stu.stop_id, arrival_ts=arrival_ts)
                    )

                if stop_times:
                    trip_updates.append(
                        TripUpdate(
                            route_id=route_id,
                            trip_id=trip_id,
                            stop_times=stop_times,
                        )
                    )

        feed_ts = min(feed_ts_values) if feed_ts_values else now
        snapshot = FeedSnapshot(
            fetched_at=now, feed_ts=feed_ts, trip_updates=trip_updates
        )
        self._cache[cache_key] = snapshot
        return snapshot
