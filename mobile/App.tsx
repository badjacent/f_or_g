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
  View,
} from "react-native";

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

function readAcJayTs(debugData: Record<string, unknown>): number | null {
  const acRef = debugData["acReference"];
  if (!acRef || typeof acRef !== "object") return null;
  const jayTs = (acRef as Record<string, unknown>)["jayTs"];
  return typeof jayTs === "number" ? jayTs : null;
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

export default function App() {
  const currentTime = useCurrentTime();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] =
    useState<RecommendationResponse | null>(null);
  const [showDebug, setShowDebug] = useState(false);

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

  const routeColor = recommendation
    ? ROUTE_COLORS[recommendation.recommendedRoute]
    : ROUTE_COLORS["?"];

  const candidateF = recommendation
    ? readRouteCandidate(recommendation.debugData, "F")
    : null;
  const candidateG = recommendation
    ? readRouteCandidate(recommendation.debugData, "G")
    : null;
  const acJayTs = recommendation
    ? readAcJayTs(recommendation.debugData)
    : null;

  const isUncertain =
    recommendation &&
    (recommendation.confidenceLevel === "LOW" ||
      recommendation.confidenceLevel === "DATA_UNAVAILABLE");

  // Carroll arrival time for the recommended route
  const recommendedCandidate =
    recommendation?.recommendedRoute === "G" ? candidateG : candidateF;
  const carrollArrivalTs = recommendedCandidate?.arriveAtTs;

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

        {loading && !recommendation ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#194f76" />
            <Text style={styles.subtle}>Loading...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBlock}>
            <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
              <Text style={styles.bulletLetter}>?</Text>
            </View>
            <Text style={styles.summary}>No signal</Text>
            <Text style={styles.subtle}>{error}</Text>
          </View>
        ) : recommendation ? (
          <View style={styles.centerBlock}>
            {/* MTA-style bullet */}
            <Pressable
              onLongPress={() => setShowDebug((prev) => !prev)}
              delayLongPress={500}
            >
              <View style={[styles.bullet, { backgroundColor: routeColor }]}>
                <Text style={styles.bulletLetter}>
                  {recommendation.recommendedRoute}
                </Text>
              </View>
            </Pressable>

            {/* Summary */}
            <Text style={styles.summary}>{recommendation.summaryText}</Text>

            {/* Timing chart — A/C, F, G */}
            <View style={styles.chart}>
              <View style={styles.chartCol}>
                <View
                  style={[styles.chartDot, { backgroundColor: "#0039A6" }]}
                />
                <Text style={styles.chartRoute}>A/C</Text>
                <Text style={styles.chartEta}>{toClock(acJayTs)}</Text>
                <Text style={styles.chartLabel}>arrives</Text>
              </View>
              <View style={styles.chartDivider} />
              <View
                style={[
                  styles.chartCol,
                  recommendation.recommendedRoute === "F" && styles.chartColActive,
                ]}
              >
                <View
                  style={[styles.chartDot, { backgroundColor: ROUTE_COLORS.F }]}
                />
                <Text style={styles.chartRoute}>F</Text>
                <Text style={styles.chartEta}>{toClock(candidateF?.switchAtTs)}</Text>
                <Text style={styles.chartLabel}>{toMinutes(recommendation.etaF)}</Text>
              </View>
              <View style={styles.chartDivider} />
              <View
                style={[
                  styles.chartCol,
                  recommendation.recommendedRoute === "G" && styles.chartColActive,
                ]}
              >
                <View
                  style={[styles.chartDot, { backgroundColor: ROUTE_COLORS.G }]}
                />
                <Text style={styles.chartRoute}>G</Text>
                <Text style={styles.chartEta}>{toClock(candidateG?.switchAtTs)}</Text>
                <Text style={styles.chartLabel}>{toMinutes(recommendation.etaG)}</Text>
              </View>
            </View>

            {/* Narrative */}
            {recommendation.narrativeText ? (
              <Text style={styles.narrative}>{recommendation.narrativeText}</Text>
            ) : null}

            {/* Carroll arrival */}
            {carrollArrivalTs ? (
              <View style={styles.carrollBox}>
                <Text style={styles.carrollText}>
                  Arrive Carroll St at {toClock(carrollArrivalTs)}
                </Text>
              </View>
            ) : null}

            {/* Hurry callout */}
            {recommendation.urgencyState === "HURRY" ? (
              <Text style={styles.hurry}>
                HURRY TO THE {recommendation.recommendedRoute}
              </Text>
            ) : null}

            {/* Uncertainty warning */}
            {isUncertain && recommendation.uncertaintyNote ? (
              <View style={styles.uncertaintyBox}>
                <Text style={styles.uncertaintyText}>
                  {recommendation.uncertaintyNote}
                </Text>
              </View>
            ) : null}

            {/* Debug panel */}
            {showDebug ? (
              <ScrollView style={styles.debugBox} nestedScrollEnabled>
                <Text style={styles.debugTitle}>Debug</Text>
                <Text style={styles.debugText}>
                  {JSON.stringify(recommendation.debugData, null, 2)}
                </Text>
              </ScrollView>
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
    fontSize: 24,
    fontWeight: "800",
    color: "#D03C2F",
    letterSpacing: 2,
  },
  summary: {
    fontSize: 18,
    textAlign: "center",
    color: "#1f2a35",
    maxWidth: 320,
  },

  // Timing chart
  chart: {
    flexDirection: "row",
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dce1e6",
    backgroundColor: "#ffffff",
    overflow: "hidden",
    width: "100%",
    maxWidth: 300,
  },
  chartCol: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    gap: 4,
  },
  chartColActive: {
    backgroundColor: "#f0f4f7",
  },
  chartDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  chartRoute: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1f2a35",
  },
  chartEta: {
    fontSize: 18,
    fontWeight: "700",
    color: "#194f76",
  },
  chartLabel: {
    fontSize: 12,
    color: "#667788",
  },
  chartDivider: {
    width: 1,
    backgroundColor: "#dce1e6",
  },

  // Narrative
  narrative: {
    fontSize: 15,
    color: "#3f5365",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
  },

  // Carroll arrival
  carrollBox: {
    borderRadius: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dce1e6",
    paddingVertical: 10,
    paddingHorizontal: 18,
    maxWidth: 300,
    width: "100%",
    alignItems: "center" as const,
  },
  carrollText: {
    fontSize: 16,
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
    maxHeight: 260,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d7dfe6",
    borderRadius: 10,
    backgroundColor: "#fff",
    padding: 10,
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
});
