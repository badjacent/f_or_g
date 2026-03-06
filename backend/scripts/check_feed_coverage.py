#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from collections import Counter

import requests
from dotenv import load_dotenv
from google.transit import gtfs_realtime_pb2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check whether a GTFS-RT feed currently includes target routes/stops."
    )
    parser.add_argument(
        "--feed-url",
        default=os.getenv(
            "MTA_FEED_URLS",
            (
                "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm,"
                "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g"
            ),
        ),
        help="GTFS-RT trip updates URL, or comma-separated URLs.",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("MTA_API_KEY", ""),
        help="Optional API key (x-api-key header).",
    )
    parser.add_argument(
        "--routes",
        default="F,G",
        help="Comma-separated route IDs to verify.",
    )
    parser.add_argument(
        "--stops-f",
        default=os.getenv("MTA_BOARDING_STOP_IDS_F", "A41S"),
        help="Comma-separated stop IDs expected for F route.",
    )
    parser.add_argument(
        "--stops-g",
        default=os.getenv("MTA_BOARDING_STOP_IDS_G", "A42S"),
        help="Comma-separated stop IDs expected for G route.",
    )
    return parser.parse_args()


def split_ids(raw: str) -> set[str]:
    return {part.strip() for part in raw.split(",") if part.strip()}


def main() -> int:
    load_dotenv()
    args = parse_args()

    headers = {"x-api-key": args.api_key} if args.api_key else {}
    feed_urls = [url.strip() for url in args.feed_url.split(",") if url.strip()]
    target_routes = split_ids(args.routes)
    route_counter: Counter[str] = Counter()
    stop_counter_by_route: dict[str, Counter[str]] = {}
    for feed_url in feed_urls:
        response = requests.get(feed_url, headers=headers, timeout=8)
        response.raise_for_status()

        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response.content)

        for entity in feed.entity:
            if not entity.HasField("trip_update"):
                continue
            trip_update = entity.trip_update
            route_id = trip_update.trip.route_id
            if not route_id:
                continue

            route_counter[route_id] += 1
            if route_id not in stop_counter_by_route:
                stop_counter_by_route[route_id] = Counter()
            for stop_update in trip_update.stop_time_update:
                if stop_update.stop_id:
                    stop_counter_by_route[route_id][stop_update.stop_id] += 1

    print(f"Feed URLs: {', '.join(feed_urls)}")
    print(f"TripUpdate entities: {sum(route_counter.values())}")
    print("Routes seen (top 20):")
    for route_id, count in route_counter.most_common(20):
        print(f"  {route_id}: {count}")

    print("\nTarget route presence:")
    for route_id in sorted(target_routes):
        present = route_counter[route_id] > 0
        print(f"  {route_id}: {'YES' if present else 'NO'} ({route_counter[route_id]} trip updates)")

    checks = {
        "F": split_ids(args.stops_f),
        "G": split_ids(args.stops_g),
    }
    print("\nConfigured stop coverage:")
    for route_id, expected_stops in checks.items():
        if not expected_stops:
            print(f"  {route_id}: no expected stops configured")
            continue
        seen_stops = set(stop_counter_by_route.get(route_id, {}).keys())
        found = sorted(expected_stops & seen_stops)
        missing = sorted(expected_stops - seen_stops)
        print(f"  {route_id} expected: {sorted(expected_stops)}")
        print(f"    found in feed: {found if found else 'none'}")
        print(f"    missing: {missing if missing else 'none'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
