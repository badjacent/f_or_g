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
import { SCENARIOS, ON_THE_F_SCENARIOS } from "./scenarios";
import type { MockOnTheFScenario } from "./scenarios";

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

type OnTheFTrain = {
  tripId: string;
  isLocal: boolean;
  caseTag: string;
  nextStopId: string | null;
  nextStopName: string | null;
  nextStopTs: number | null;
  jayArrivalTs: number | null;
  carrollArrivalTs: number | null;
  carrollEtaSeconds: number | null;
  transferDecision: RecommendationResponse | null;
  summaryText: string | null;
  narrativeText: string | null;
  expressBannerText: string | null;
};

type OnTheFResponse = {
  trains: OnTheFTrain[];
  dataFreshnessSeconds: number | null;
  serverTimeEpochSeconds: number;
};

type FullResponse = {
  outbound: RecommendationResponse;
  inbound: RecommendationResponse;
  onTheF: OnTheFResponse;
};

type AppMode = "outbound" | "inbound" | "onTheF";

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

const MODE_LABELS: Record<AppMode, string> = {
  outbound: "\u2192 Brooklyn",
  inbound: "\u2192 Manhattan",
  onTheF: "On the F",
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
  route: string | null;
  jayTs: number | null;
  hoytTs: number | null;
} {
  const acRef = debugData["acReference"];
  if (!acRef || typeof acRef !== "object")
    return { route: null, jayTs: null, hoytTs: null };
  const ref = acRef as Record<string, unknown>;
  return {
    route: typeof ref["route"] === "string" ? ref["route"] : null,
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
  station,
  acRoute,
  acTs,
  boardTs,
  carrollTs,
  isWinner,
  routeColor,
}: {
  route: "F" | "G";
  station: string;
  acRoute: string | null;
  acTs: number | null;
  boardTs: number | null | undefined;
  carrollTs: number | null | undefined;
  isWinner: boolean;
  routeColor: string;
}) {
  const acName = acRoute ?? "A/C";
  return (
    <View
      style={[
        styles.timeline,
        isWinner ? styles.timelineWinner : styles.timelineDimmed,
      ]}
    >
      <View style={styles.timelineBoxes}>
        <View style={[styles.timelineBox, isWinner ? styles.boxWinner : styles.boxDimmed]}>
          <Text style={styles.boxLabel}>{station} ({acName})</Text>
          <Text style={[styles.boxTime, isWinner && styles.boxTimeBold]}>
            {toClock(acTs)}
          </Text>
        </View>
        <Text style={styles.timelineArrow}>{"\u2192"}</Text>
        <View style={[styles.timelineBox, isWinner ? styles.boxWinner : styles.boxDimmed]}>
          <Text style={[styles.boxLabel, { color: routeColor, fontWeight: "800" }]}>
            {station} ({route})
          </Text>
          <Text style={[styles.boxTime, isWinner && styles.boxTimeBold]}>
            {toClock(boardTs)}
          </Text>
        </View>
        <Text style={styles.timelineArrow}>{"\u2192"}</Text>
        <View style={[styles.timelineBox, isWinner ? styles.boxWinner : styles.boxDimmed]}>
          <Text style={styles.boxLabel}>Carroll ({route})</Text>
          <Text style={[styles.boxTime, isWinner && styles.boxTimeBold]}>
            {toClock(carrollTs)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function OnTheFTrainView({ train }: { train: OnTheFTrain }) {
  if (train.isLocal) {
    return (
      <View style={styles.centerBlock}>
        {/* Local F bullet */}
        <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS.F }]}>
          <Text style={styles.bulletLetter}>F</Text>
        </View>

        <Text style={styles.summary}>
          {train.summaryText ?? `Carroll at ${toClock(train.carrollArrivalTs)}`}
        </Text>
        <Text style={styles.narrative}>
          {train.narrativeText ?? `${toMinutes(train.carrollEtaSeconds)} \u2014 no transfer needed`}
        </Text>
      </View>
    );
  }

  // Express case — render transfer decision
  const transfer = train.transferDecision;
  if (!transfer) {
    return (
      <View style={styles.centerBlock}>
        <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
          <Text style={styles.bulletLetter}>?</Text>
        </View>
        <Text style={styles.summary}>Express F {"\u2014"} no transfer data</Text>
      </View>
    );
  }

  const routeColor = ROUTE_COLORS[transfer.recommendedRoute];
  const candidateF = readRouteCandidate(transfer.debugData, "F");
  const candidateG = readRouteCandidate(transfer.debugData, "G");
  const acRef = readAcReference(transfer.debugData);
  const winnerIsF = transfer.recommendedRoute === "F";
  const isUncertain =
    transfer.confidenceLevel === "LOW" ||
    transfer.confidenceLevel === "DATA_UNAVAILABLE";

  return (
    <View style={styles.centerBlock}>
      {/* Express warning banner */}
      <View style={styles.expressBanner}>
        <Text style={styles.expressBannerText}>
          {train.expressBannerText ?? `Express F \u2014 transfer at Jay St (${toClock(train.jayArrivalTs)})`}
        </Text>
      </View>

      {/* Hero bullet(s) */}
      <View style={styles.diamondToCircle}>
        <View style={[styles.diamondOuter, { backgroundColor: ROUTE_COLORS.F }]}>
          <Text style={styles.diamondLetter}>F</Text>
        </View>
        <Text style={styles.diamondArrow}>{"\u2192"}</Text>
        <View style={[styles.bulletSmall, { backgroundColor: routeColor }]}>
          <Text style={styles.bulletLetterSmall}>
            {transfer.recommendedRoute}
          </Text>
        </View>
      </View>

      {transfer.urgencyState === "HURRY" && (
        <Text style={styles.hurry}>HURRY</Text>
      )}

      <Text style={styles.summary}>{transfer.summaryText}</Text>

      {transfer.narrativeText ? (
        <Text style={styles.narrative}>{transfer.narrativeText}</Text>
      ) : null}

      {/* Route timelines */}
      <View style={styles.timelines}>
        <RouteTimeline
          route="F"
          station="Jay"
          acRoute={acRef.route}
          acTs={acRef.jayTs}
          boardTs={candidateF?.switchAtTs}
          carrollTs={candidateF?.arriveAtTs}
          isWinner={winnerIsF}
          routeColor={ROUTE_COLORS.F}
        />
        <RouteTimeline
          route="G"
          station="Hoyt"
          acRoute={acRef.route}
          acTs={acRef.hoytTs}
          boardTs={candidateG?.switchAtTs}
          carrollTs={candidateG?.arriveAtTs}
          isWinner={!winnerIsF}
          routeColor={ROUTE_COLORS.G}
        />
      </View>

      {isUncertain && transfer.uncertaintyNote ? (
        <View style={styles.uncertaintyBox}>
          <Text style={styles.uncertaintyText}>
            {transfer.uncertaintyNote}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function App() {
  const currentTime = useCurrentTime();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullResponse, setFullResponse] = useState<FullResponse | null>(null);
  const [mode, setMode] = useState<AppMode>("outbound");
  const [onTheFIndex, setOnTheFIndex] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  const fetchRecommendation = useCallback(async () => {
    setLoading(true);
    setError(null);
    setFullResponse(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/recommendation?v=2`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const data = (await response.json()) as FullResponse;
      setFullResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecommendation();
  }, [fetchRecommendation]);

  // Reset train index when switching to onTheF mode or changing preview scenario
  useEffect(() => {
    setOnTheFIndex(0);
  }, [mode, previewIndex]);

  // Active recommendation for outbound/inbound modes
  const recommendation =
    mode !== "onTheF" ? (fullResponse?.[mode] ?? null) : null;

  // On the F data
  const onTheFData = fullResponse?.onTheF ?? null;

  // Preview mode scenarios — depends on current mode
  const isOnTheFPreview = previewMode && mode === "onTheF";
  const previewScenarioList = mode === "onTheF" ? ON_THE_F_SCENARIOS : SCENARIOS;

  // In preview mode for outbound/inbound, use mock data
  const displayData =
    previewMode && mode !== "onTheF"
      ? (SCENARIOS[previewIndex]?.data as RecommendationResponse | undefined) ?? null
      : recommendation;

  // In preview mode for onTheF, use mock data
  const previewOnTheFData: OnTheFResponse | null = isOnTheFPreview
    ? (ON_THE_F_SCENARIOS[previewIndex]?.data as OnTheFResponse)
    : null;

  const activeOnTheFData = isOnTheFPreview ? previewOnTheFData : onTheFData;

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
    : { route: null, jayTs: null, hoytTs: null };

  const isUncertain =
    displayData &&
    (displayData.confidenceLevel === "LOW" ||
      displayData.confidenceLevel === "DATA_UNAVAILABLE");

  const winnerIsF = displayData?.recommendedRoute === "F";

  // On the F: current train
  const onTheFTrains = activeOnTheFData?.trains ?? [];
  const currentTrain = onTheFTrains[onTheFIndex] ?? null;

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

        {/* Mode switcher — row of three pill buttons */}
        <View style={styles.modeSwitcher}>
          {(["outbound", "inbound", "onTheF"] as AppMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => {
                setMode(m);
                setPreviewIndex(0);
              }}
              style={[
                styles.modePill,
                mode === m ? styles.modePillActive : styles.modePillInactive,
              ]}
            >
              <Text
                style={[
                  styles.modePillText,
                  mode === m
                    ? styles.modePillTextActive
                    : styles.modePillTextInactive,
                ]}
              >
                {MODE_LABELS[m]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Outbound / Inbound modes */}
        {mode !== "onTheF" && (
          <>
            {!previewMode && loading && !recommendation ? (
              <View style={styles.centerBlock}>
                <ActivityIndicator size="large" color="#194f76" />
                <Text style={styles.subtle}>Loading...</Text>
              </View>
            ) : !previewMode && error ? (
              <View style={styles.centerBlock}>
                <Pressable
                  onLongPress={() => setShowDebug((prev) => !prev)}
                  delayLongPress={500}
                >
                  <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
                    <Text style={styles.bulletLetter}>?</Text>
                  </View>
                </Pressable>
                <Text style={styles.summary}>No signal</Text>
                <Text style={styles.subtle}>{error}</Text>
                {showDebug && !previewMode ? (
                  <View style={styles.debugBox}>
                    <TouchableOpacity
                      onPress={() => {
                        setPreviewMode(true);
                        setPreviewIndex(0);
                      }}
                      style={styles.previewToggle}
                    >
                      <Text style={styles.previewToggleText}>
                        Preview Scenarios
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
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

                {/* Hurry callout */}
                {displayData.urgencyState === "HURRY" && (
                  <Text style={styles.hurry}>HURRY</Text>
                )}

                {/* Summary */}
                <Text style={styles.summary}>{displayData.summaryText}</Text>

                {/* Narrative */}
                {displayData.narrativeText ? (
                  <Text style={styles.narrative}>{displayData.narrativeText}</Text>
                ) : null}

                {/* Route timelines */}
                <View style={styles.timelines}>
                  <RouteTimeline
                    route="F"
                    station="Jay"
                    acRoute={acRef.route}
                    acTs={acRef.jayTs}
                    boardTs={candidateF?.switchAtTs}
                    carrollTs={candidateF?.arriveAtTs}
                    isWinner={winnerIsF}
                    routeColor={ROUTE_COLORS.F}
                  />
                  <RouteTimeline
                    route="G"
                    station="Hoyt"
                    acRoute={acRef.route}
                    acTs={acRef.hoytTs}
                    boardTs={candidateG?.switchAtTs}
                    carrollTs={candidateG?.arriveAtTs}
                    isWinner={!winnerIsF}
                    routeColor={ROUTE_COLORS.G}
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
                {showDebug && !previewMode ? (
                  <View style={styles.debugBox}>
                    <TouchableOpacity
                      onPress={() => {
                        setPreviewMode(true);
                        setPreviewIndex(0);
                      }}
                      style={styles.previewToggle}
                    >
                      <Text style={styles.previewToggleText}>
                        Preview Scenarios
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
          </>
        )}

        {/* On the F mode */}
        {mode === "onTheF" && (
          <>
            {!previewMode && loading && !onTheFData ? (
              <View style={styles.centerBlock}>
                <ActivityIndicator size="large" color="#194f76" />
                <Text style={styles.subtle}>Loading...</Text>
              </View>
            ) : !previewMode && error ? (
              <View style={styles.centerBlock}>
                <Pressable
                  onLongPress={() => setShowDebug((prev) => !prev)}
                  delayLongPress={500}
                >
                  <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
                    <Text style={styles.bulletLetter}>?</Text>
                  </View>
                </Pressable>
                <Text style={styles.summary}>No signal</Text>
                <Text style={styles.subtle}>{error}</Text>
                {showDebug && !previewMode ? (
                  <View style={styles.debugBox}>
                    <TouchableOpacity
                      onPress={() => {
                        setPreviewMode(true);
                        setPreviewIndex(0);
                      }}
                      style={styles.previewToggle}
                    >
                      <Text style={styles.previewToggleText}>
                        Preview Scenarios
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : onTheFTrains.length === 0 ? (
              <View style={styles.centerBlock}>
                <View style={[styles.bullet, { backgroundColor: ROUTE_COLORS["?"] }]}>
                  <Text style={styles.bulletLetter}>?</Text>
                </View>
                <Text style={styles.summary}>No F trains found</Text>
                <Text style={styles.subtle}>Pull to refresh</Text>
              </View>
            ) : currentTrain ? (
              <>
                <OnTheFTrainView train={currentTrain} />

                {/* Train pager */}
                {onTheFTrains.length > 1 && (
                  <View style={styles.trainPager}>
                    <TouchableOpacity
                      onPress={() =>
                        setOnTheFIndex((i) =>
                          i > 0 ? i - 1 : onTheFTrains.length - 1,
                        )
                      }
                      style={styles.previewArrow}
                    >
                      <Text style={styles.previewArrowText}>{"\u25C0"}</Text>
                    </TouchableOpacity>
                    <View style={styles.trainPagerLabel}>
                      <Text style={styles.trainPagerText}>
                        {currentTrain.nextStopName
                          ? `Next: ${currentTrain.nextStopName}`
                          : ""}
                        {currentTrain.jayArrivalTs
                          ? ` \u00B7 Jay at ${toClock(currentTrain.jayArrivalTs)}`
                          : ""}
                      </Text>
                      <Text style={styles.trainPagerCount}>
                        Train {onTheFIndex + 1} of {onTheFTrains.length}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() =>
                        setOnTheFIndex((i) =>
                          i < onTheFTrains.length - 1 ? i + 1 : 0,
                        )
                      }
                      style={styles.previewArrow}
                    >
                      <Text style={styles.previewArrowText}>{"\u25B6"}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Debug panel for onTheF */}
                {showDebug && !previewMode ? (
                  <View style={styles.debugBox}>
                    <TouchableOpacity
                      onPress={() => {
                        setPreviewMode(true);
                        setPreviewIndex(0);
                      }}
                      style={styles.previewToggle}
                    >
                      <Text style={styles.previewToggleText}>
                        Preview Scenarios
                      </Text>
                    </TouchableOpacity>
                    <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                      <Text style={styles.debugTitle}>Debug</Text>
                      <Text style={styles.debugText}>
                        {JSON.stringify(currentTrain, null, 2)}
                      </Text>
                    </ScrollView>
                  </View>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
      {previewMode && (
        <View style={styles.previewBanner}>
          <TouchableOpacity
            onPress={() =>
              setPreviewIndex((i) =>
                i > 0 ? i - 1 : previewScenarioList.length - 1,
              )
            }
            style={styles.previewArrow}
          >
            <Text style={styles.previewArrowText}>{"\u25C0"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setPreviewMode(false)}
            style={styles.previewLabel}
          >
            <Text style={styles.previewTitle}>
              {previewScenarioList[previewIndex]?.name}
            </Text>
            <Text style={styles.previewCount}>
              {previewIndex + 1} / {previewScenarioList.length} — tap to exit
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              setPreviewIndex((i) =>
                i < previewScenarioList.length - 1 ? i + 1 : 0,
              )
            }
            style={styles.previewArrow}
          >
            <Text style={styles.previewArrowText}>{"\u25B6"}</Text>
          </TouchableOpacity>
        </View>
      )}
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

  // Mode switcher
  modeSwitcher: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  modePill: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  modePillActive: {
    backgroundColor: "#23435c",
  },
  modePillInactive: {
    backgroundColor: "rgba(35, 67, 92, 0.15)",
  },
  modePillText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  modePillTextActive: {
    color: "#ffffff",
  },
  modePillTextInactive: {
    color: "#23435c",
    opacity: 0.6,
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
    lineHeight: 140,
    fontWeight: "700",
    fontFamily: "Helvetica-Bold",
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
    gap: 6,
    marginTop: 4,
  },
  timeline: {
    paddingVertical: 2,
  },
  timelineWinner: {},
  timelineDimmed: {
    opacity: 0.55,
  },
  timelineBoxes: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  timelineBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  boxWinner: {
    backgroundColor: "#ffffff",
    borderColor: "#dce1e6",
  },
  boxDimmed: {
    backgroundColor: "#f4f2ee",
    borderColor: "#e4e0da",
  },
  timelineArrow: {
    fontSize: 16,
    color: "#b0b8c1",
  },
  boxLabel: {
    fontSize: 12,
    color: "#667788",
    fontWeight: "600",
  },
  boxTime: {
    fontSize: 15,
    color: "#667788",
    fontVariant: ["tabular-nums"],
  },
  boxTimeBold: {
    fontWeight: "700",
    color: "#194f76",
  },

  // Diamond-to-circle transition
  diamondToCircle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  diamondOuter: {
    width: 111,
    height: 111,
    borderRadius: 17,
    transform: [{ rotate: "45deg" }],
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  diamondLetter: {
    fontSize: 72,
    lineHeight: 81,
    fontWeight: "700",
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    transform: [{ rotate: "-45deg" }],
  },
  diamondArrow: {
    fontSize: 32,
    color: "#1f2a35",
    fontWeight: "700",
  },
  bulletSmall: {
    width: 135,
    height: 135,
    borderRadius: 68,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  bulletLetterSmall: {
    fontSize: 90,
    lineHeight: 99,
    fontWeight: "700",
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },

  // Express banner
  expressBanner: {
    backgroundColor: "#FFF3E0",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    maxWidth: 340,
    marginBottom: 4,
  },
  expressBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#E65100",
    textAlign: "center",
  },

  // Train pager
  trainPager: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    width: "100%",
    maxWidth: 340,
  },
  trainPagerLabel: {
    flex: 1,
    alignItems: "center",
  },
  trainPagerText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3f5365",
    textAlign: "center",
  },
  trainPagerCount: {
    fontSize: 11,
    color: "#667788",
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
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  previewArrow: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  previewArrowText: {
    fontSize: 16,
    color: "rgba(0,0,0,0.25)",
  },
  previewLabel: {
    flex: 1,
    alignItems: "center",
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(0,0,0,0.25)",
  },
  previewCount: {
    fontSize: 11,
    color: "rgba(0,0,0,0.18)",
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
