import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SCENARIOS } from "./scenarios";

type UrgencyState = "NORMAL" | "HURRY";
type RecommendationReason =
  | "FASTEST_CLEAR"
  | "FASTEST_TIGHT_TRANSFER"
  | "ABOUT_THE_SAME_PREFER_EASIER"
  | "LOW_CONFIDENCE"
  | "DATA_UNAVAILABLE";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "DATA_UNAVAILABLE";

type RecommendationResponse = {
  recommendedRoute: "F" | "G" | "?";
  urgencyState: UrgencyState;
  recommendationReason: RecommendationReason;
  summaryText: string;
  narrativeText: string | null;
  uncertaintyNote: string | null;
  etaF: number | null;
  etaG: number | null;
  confidenceLevel: ConfidenceLevel;
  dataFreshnessSeconds: number | null;
  debugData: Record<string, unknown>;
};

type RouteCandidateDebug = {
  switchStopId?: string | null;
  transferMarginSeconds?: number | null;
  switchAtTs?: number | null;
  arriveAtTs?: number | null;
};

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (__DEV__ ? "http://localhost:8000" : "https://forg.aionyourside.net");

// Official MTA route colors
const ROUTE_COLORS: Record<RecommendationResponse["recommendedRoute"], string> = {
  F: "#FF6319",
  G: "#6CBE45",
  "?": "#808183",
};

function toMinutes(seconds: number | null): string {
  if (seconds == null) return "\u2014";
  const m = Math.max(0, Math.round(seconds / 60));
  return `${m} min`;
}

function toClock(ts: number | null | undefined): string {
  if (ts == null) return "\u2014";
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function readRouteCandidate(
  debugData: Record<string, unknown>,
  route: "F" | "G",
): RouteCandidateDebug | null {
  const routeCandidates = debugData["routeCandidates"];
  if (!routeCandidates || typeof routeCandidates !== "object") return null;
  const candidate = (routeCandidates as Record<string, unknown>)[route];
  if (!candidate || typeof candidate !== "object") return null;
  return candidate as RouteCandidateDebug;
}

function readAcReference(debugData: Record<string, unknown>): {
  jayTs: number | null;
  hoytTs: number | null;
} {
  const acRef = debugData["acReference"];
  if (!acRef || typeof acRef !== "object") return { jayTs: null, hoytTs: null };
  const ref = acRef as Record<string, unknown>;
  return {
    jayTs: typeof ref["jayTs"] === "number" ? ref["jayTs"] : null,
    hoytTs: typeof ref["hoytTs"] === "number" ? ref["hoytTs"] : null,
  };
}

function useCurrentTime(): string {
  const [now, setNow] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
  );
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setNow(
        new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      );
    }, 10_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);
  return now;
}

function RouteTimeline({
  route,
  acLabel,
  acTs,
  boardTs,
  carrollTs,
  etaSeconds,
  isWinner,
  routeColor,
}: {
  route: "F" | "G";
  acLabel: string;
  acTs: number | null;
  boardTs: number | null | undefined;
  carrollTs: number | null | undefined;
  etaSeconds: number | null;
  isWinner: boolean;
  routeColor: string;
}) {
  return (
    <View
      style={[
        styles.timeline,
        isWinner ? styles.timelineWinner : styles.timelineDimmed,
      ]}
    >
      <View style={styles.timelineHeader}>
        <View style={[styles.timelineDot, { backgroundColor: routeColor }]} />
        <Text
          style={[
            styles.timelineRoute,
            isWinner && { color: routeColor },
          ]}
        >
          {route} route
        </Text>
        {etaSeconds != null && (
          <Text style={styles.timelineTotal}>{toMinutes(etaSeconds)}</Text>
        )}
      </View>
      <View style={styles.timelineSteps}>
        <View style={styles.timelineStep}>
          <Text style={styles.stepLabel}>{acLabel}</Text>
          <Text style={[styles.stepTime, isWinner && styles.stepTimeBold]}>
            {toClock(acTs)}
          </Text>
        </View>
        <View style={styles.timelineStep}>
          <Text style={styles.stepLabel}>Board {route}</Text>
          <Text style={[styles.stepTime, isWinner && styles.stepTimeBold]}>
            {toClock(boardTs)}
          </Text>
        </View>
        <View style={styles.timelineStep}>
          <Text style={styles.stepLabel}>Carroll St</Text>
          <Text style={[styles.stepTime, isWinner && styles.stepTimeBold]}>
            {toClock(carrollTs)}
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function App() {
  const currentTime = useCurrentTime();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendation`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = (await response.json()) as RecommendationResponse;
      setRecommendation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendation();
  }, [fetchRecommendation]);

  // In preview mode, use mock data; otherwise use live API data
  const displayData = previewMode
    ? (SCENARIOS[previewIndex]?.data as RecommendationResponse | undefined) ?? null
    : recommendation;

  const routeColor = displayData
    ? ROUTE_COLORS[displayData.recommendedRoute]
    : ROUTE_COLORS["?"];

  const candidateF = displayData
    ? readRouteCandidate(displayData.debugData, "F")
    : null;
  const candidateG = displayData
    ? readRouteCandidate(displayData.debugData, "G")
    : null;
  const acRef = displayData
    ? readAcReference(displayData.debugData)
    : { jayTs: null, hoytTs: null };

  const isUncertain =
    displayData &&
    (displayData.confidenceLevel === "LOW" ||
      displayData.confidenceLevel === "DATA_UNAVAILABLE");

  const winnerIsF = displayData?.recommendedRoute === "F";

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchRecommendation} />
        }
      >
        <Text style={styles.title}>{currentTime}</Text>

        {/* Preview mode banner */}
        {previewMode && (
          <View style={styles.previewBanner}>
            <TouchableOpacity
              onPress={() =>
                setPreviewIndex((i) =>
                  i > 0 ? i - 1 : SCENARIOS.length - 1,
                )
              }
              style={styles.previewArrow}
            >
              <Text style={styles.previewArrowText}>{"\u25C0"}</Text>
            </TouchableOpacity>
            <View style={styles.previewLabel}>
              <Text style={styles.previewTitle}>
                {SCENARIOS[previewIndex]?.name}
              </Text>
              <Text style={styles.previewCount}>
                {previewIndex + 1} / {SCENARIOS.length}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() =>
                setPreviewIndex((i) =>
                  i < SCENARIOS.length - 1 ? i + 1 : 0,
                )
              }
              style={styles.previewArrow}
            >
              <Text style={styles.previewArrowText}>{"\u25B6"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!previewMode && loading && !recommendation ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#194f76" />
            <Text style={styles.subtle}>Loading...</Text>
          </View>
        ) : !previewMode && error ? (
          <View style={styles.centerBlock}>
            <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
              <Text style={styles.bulletLetter}>?</Text>
            </View>
            <Text style={styles.summary}>No signal</Text>
            <Text style={styles.subtle}>{error}</Text>
          </View>
        ) : displayData ? (
          <View style={styles.centerBlock}>
            {/* MTA-style bullet */}
            <Pressable
              onLongPress={() => setShowDebug((prev) => !prev)}
              delayLongPress={500}
            >
              <View style={[styles.bullet, { backgroundColor: routeColor }]}>
                <Text style={styles.bulletLetter}>
                  {displayData.recommendedRoute}
                </Text>
              </View>
            </Pressable>

            {/* Hurry callout — immediately under bullet */}
            {displayData.urgencyState === "HURRY" && (
              <Text style={styles.hurry}>HURRY</Text>
            )}

            {/* Summary */}
            <Text style={styles.summary}>{displayData.summaryText}</Text>

            {/* Narrative */}
            {displayData.narrativeText ? (
              <Text style={styles.narrative}>{displayData.narrativeText}</Text>
            ) : null}

            {/* Route timelines — winner first */}
            <View style={styles.timelines}>
              <RouteTimeline
                route={winnerIsF ? "F" : "G"}
                acLabel={winnerIsF ? "A at Jay St" : "A/C at Hoyt"}
                acTs={winnerIsF ? acRef.jayTs : acRef.hoytTs}
                boardTs={
                  winnerIsF ? candidateF?.switchAtTs : candidateG?.switchAtTs
                }
                carrollTs={
                  winnerIsF ? candidateF?.arriveAtTs : candidateG?.arriveAtTs
                }
                etaSeconds={winnerIsF ? displayData.etaF : displayData.etaG}
                isWinner={true}
                routeColor={winnerIsF ? ROUTE_COLORS.F : ROUTE_COLORS.G}
              />
              <RouteTimeline
                route={winnerIsF ? "G" : "F"}
                acLabel={winnerIsF ? "A/C at Hoyt" : "A at Jay St"}
                acTs={winnerIsF ? acRef.hoytTs : acRef.jayTs}
                boardTs={
                  winnerIsF ? candidateG?.switchAtTs : candidateF?.switchAtTs
                }
                carrollTs={
                  winnerIsF ? candidateG?.arriveAtTs : candidateF?.arriveAtTs
                }
                etaSeconds={winnerIsF ? displayData.etaG : displayData.etaF}
                isWinner={false}
                routeColor={winnerIsF ? ROUTE_COLORS.G : ROUTE_COLORS.F}
              />
            </View>

            {/* Uncertainty warning */}
            {isUncertain && displayData.uncertaintyNote ? (
              <View style={styles.uncertaintyBox}>
                <Text style={styles.uncertaintyText}>
                  {displayData.uncertaintyNote}
                </Text>
              </View>
            ) : null}

            {/* Debug panel */}
            {showDebug ? (
              <View style={styles.debugBox}>
                <TouchableOpacity
                  onPress={() => {
                    setPreviewMode((prev) => !prev);
                    setPreviewIndex(0);
                  }}
                  style={styles.previewToggle}
                >
                  <Text style={styles.previewToggleText}>
                    {previewMode ? "Exit Preview" : "Preview Scenarios"}
                  </Text>
                </TouchableOpacity>
                <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                  <Text style={styles.debugTitle}>Debug</Text>
                  <Text style={styles.debugText}>
                    {JSON.stringify(displayData.debugData, null, 2)}
                  </Text>
                </ScrollView>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8f4ec",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 24,
  },
  title: {
    position: "absolute",
    top: 16,
    fontSize: 20,
    letterSpacing: 2,
    color: "#23435c",
    fontWeight: "700",
  },
  centerBlock: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },

  // MTA-style bullet
  bullet: {
    width: 180,
    height: 180,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  bulletLetter: {
    fontSize: 120,
    lineHeight: 132,
    fontWeight: "900",
    color: "#ffffff",
  },

  hurry: {
    fontSize: 26,
    fontWeight: "900",
    color: "#D03C2F",
    letterSpacing: 3,
  },
  summary: {
    fontSize: 18,
    textAlign: "center",
    color: "#1f2a35",
    maxWidth: 320,
  },

  // Narrative
  narrative: {
    fontSize: 15,
    color: "#3f5365",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
  },

  // Route timelines
  timelines: {
    width: "100%",
    maxWidth: 320,
    gap: 8,
    marginTop: 4,
  },
  timeline: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  timelineWinner: {
    backgroundColor: "#ffffff",
    borderColor: "#dce1e6",
  },
  timelineDimmed: {
    backgroundColor: "#f4f2ee",
    borderColor: "#e4e0da",
    opacity: 0.7,
  },
  timelineHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  timelineRoute: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1f2a35",
    flex: 1,
  },
  timelineTotal: {
    fontSize: 14,
    fontWeight: "700",
    color: "#667788",
  },
  timelineSteps: {
    gap: 4,
  },
  timelineStep: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stepLabel: {
    fontSize: 14,
    color: "#667788",
  },
  stepTime: {
    fontSize: 15,
    color: "#667788",
    fontVariant: ["tabular-nums"],
  },
  stepTimeBold: {
    fontWeight: "700",
    color: "#194f76",
  },

  // Uncertainty warning
  uncertaintyBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 340,
  },
  uncertaintyText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#D03C2F",
    textAlign: "center",
  },

  subtle: {
    fontSize: 14,
    color: "#647383",
    textAlign: "center",
  },

  // Debug
  debugBox: {
    width: "100%",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d7dfe6",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
    gap: 8,
  },
  debugScroll: {
    maxHeight: 220,
  },
  debugTitle: {
    fontSize: 12,
    textTransform: "uppercase",
    color: "#4d6174",
    marginBottom: 6,
    fontWeight: "700",
  },
  debugText: {
    fontFamily: "Courier",
    fontSize: 11,
    color: "#263745",
  },

  // Preview mode
  previewBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#194f76",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 12,
    width: "100%",
    maxWidth: 320,
  },
  previewArrow: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  previewArrowText: {
    fontSize: 18,
    color: "#ffffff",
  },
  previewLabel: {
    flex: 1,
    alignItems: "center",
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  previewCount: {
    fontSize: 12,
    color: "#a0bdd4",
  },
  previewToggle: {
    backgroundColor: "#194f76",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: "center",
  },
  previewToggleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#ffffff",
  },
});
