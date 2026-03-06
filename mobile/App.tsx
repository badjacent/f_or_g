import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
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
  etaF: number | null;
  etaG: number | null;
  confidenceLevel: ConfidenceLevel;
  dataFreshnessSeconds: number | null;
  debugData: Record<string, unknown>;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const ROUTE_COLORS: Record<RecommendationResponse["recommendedRoute"], string> = {
  F: "#EB6800",
  G: "#799534",
  "?": "#0062CF",
};

function toMinutes(seconds: number | null): string {
  if (seconds == null) {
    return "--";
  }
  return `${Math.max(0, Math.round(seconds / 60))}m`;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(
    null,
  );
  const [showDebug, setShowDebug] = useState(false);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRecommendation(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendation`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`API ${response.status}`);
      }
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

  const urgencyLabel = useMemo(() => {
    if (!recommendation) {
      return "";
    }
    if (recommendation.urgencyState === "HURRY") {
      return "HURRY";
    }
    return "";
  }, [recommendation]);

  const routeColor = recommendation
    ? ROUTE_COLORS[recommendation.recommendedRoute]
    : "#0062CF";

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <Text style={styles.title}>F or G</Text>

        {loading ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#194f76" />
            <Text style={styles.subtle}>Computing fresh recommendation...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerBlock}>
            <Text style={styles.route}>?</Text>
            <Text style={styles.summary}>No signal</Text>
            <Text style={styles.subtle}>{error}</Text>
          </View>
        ) : recommendation ? (
          <View style={styles.centerBlock}>
            <Pressable
              onLongPress={() => setShowDebug((previous) => !previous)}
              delayLongPress={500}
            >
              <View style={[styles.routeBadge, { backgroundColor: routeColor }]}>
                <Text style={styles.route}>{recommendation.recommendedRoute}</Text>
              </View>
            </Pressable>
            {urgencyLabel ? <Text style={styles.hurry}>{urgencyLabel}</Text> : null}
            <Text style={styles.summary}>{recommendation.summaryText}</Text>

            <View style={styles.etasRow}>
              <Text style={styles.etaText}>F {toMinutes(recommendation.etaF)}</Text>
              <Text style={styles.etaText}>G {toMinutes(recommendation.etaG)}</Text>
            </View>

            {showDebug ? (
              <View style={styles.debugBox}>
                <Text style={styles.debugTitle}>Debug</Text>
                <Text style={styles.debugText}>
                  {JSON.stringify(recommendation.debugData, null, 2)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.refreshButton} onPress={fetchRecommendation}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#f8f4ec",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
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
    gap: 10,
  },
  routeBadge: {
    width: 220,
    height: 220,
    borderRadius: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  route: {
    fontSize: 136,
    lineHeight: 136,
    fontWeight: "900",
    color: "#ffffff",
  },
  hurry: {
    fontSize: 24,
    fontWeight: "800",
    color: "#af3b2b",
    letterSpacing: 1.8,
  },
  summary: {
    fontSize: 18,
    textAlign: "center",
    color: "#1f2a35",
    maxWidth: 320,
  },
  subtle: {
    fontSize: 14,
    color: "#647383",
    textAlign: "center",
  },
  etasRow: {
    marginTop: 6,
    flexDirection: "row",
    gap: 16,
  },
  etaText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#194f76",
  },
  footer: {
    alignItems: "center",
    paddingBottom: 14,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: "#d4dce2",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: "#ffffffcc",
  },
  refreshText: {
    color: "#5f6f7e",
    fontSize: 12,
    letterSpacing: 0.6,
    fontWeight: "600",
  },
  debugBox: {
    width: "100%",
    maxHeight: 220,
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
