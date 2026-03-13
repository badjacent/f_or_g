/**
 * Mock scenarios for UI preview mode.
 * Each scenario represents a distinct UI state the app can be in.
 * Page through these in the app to verify layout and copy for all cases.
 */

type UrgencyState = "NORMAL" | "HURRY";
type RecommendationReason =
  | "FASTEST_CLEAR"
  | "FASTEST_TIGHT_TRANSFER"
  | "ABOUT_THE_SAME_PREFER_EASIER"
  | "LOW_CONFIDENCE"
  | "DATA_UNAVAILABLE";
type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "DATA_UNAVAILABLE";

export type MockScenario = {
  name: string;
  data: {
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
};

// Base timestamp: pretend it's 7:45 PM
const BASE = Math.floor(Date.now() / 1000);
const min = (m: number) => m * 60;

function makeDebugData(overrides: {
  jayTs?: number | null;
  hoytTs?: number | null;
  fSwitchAt?: number | null;
  fArriveAt?: number | null;
  gSwitchAt?: number | null;
  gArriveAt?: number | null;
}): Record<string, unknown> {
  return {
    acReference: {
      jayTs: overrides.jayTs ?? null,
      hoytTs: overrides.hoytTs ?? null,
    },
    routeCandidates: {
      F: {
        switchStopId: "A41S",
        switchAtTs: overrides.fSwitchAt ?? null,
        arriveAtTs: overrides.fArriveAt ?? null,
        transferMarginSeconds: overrides.fSwitchAt && overrides.jayTs
          ? overrides.fSwitchAt - overrides.jayTs
          : null,
      },
      G: {
        switchStopId: "A42S",
        switchAtTs: overrides.gSwitchAt ?? null,
        arriveAtTs: overrides.gArriveAt ?? null,
        transferMarginSeconds: overrides.gSwitchAt && overrides.hoytTs
          ? overrides.gSwitchAt - (overrides.hoytTs + 90)
          : null,
      },
    },
  };
}

export const SCENARIOS: MockScenario[] = [
  {
    name: "F wins clearly",
    data: {
      recommendedRoute: "F",
      urgencyState: "NORMAL",
      recommendationReason: "FASTEST_CLEAR",
      summaryText: "F is 4 min faster",
      narrativeText: null,
      uncertaintyNote: null,
      etaF: min(9),
      etaG: min(13),
      confidenceLevel: "HIGH",
      dataFreshnessSeconds: 12,
      debugData: makeDebugData({
        jayTs: BASE + min(3),
        hoytTs: BASE + min(5),
        fSwitchAt: BASE + min(3),
        fArriveAt: BASE + min(9),
        gSwitchAt: BASE + min(7),
        gArriveAt: BASE + min(13),
      }),
    },
  },
  {
    name: "G wins clearly",
    data: {
      recommendedRoute: "G",
      urgencyState: "NORMAL",
      recommendationReason: "FASTEST_CLEAR",
      summaryText: "G is 5 min faster",
      narrativeText: null,
      uncertaintyNote: null,
      etaF: min(18),
      etaG: min(13),
      confidenceLevel: "HIGH",
      dataFreshnessSeconds: 8,
      debugData: makeDebugData({
        jayTs: BASE + min(3),
        hoytTs: BASE + min(5),
        fSwitchAt: BASE + min(12),
        fArriveAt: BASE + min(18),
        gSwitchAt: BASE + min(7),
        gArriveAt: BASE + min(13),
      }),
    },
  },
  {
    name: "F wins — HURRY",
    data: {
      recommendedRoute: "F",
      urgencyState: "HURRY",
      recommendationReason: "FASTEST_TIGHT_TRANSFER",
      summaryText: "F is 6 min faster",
      narrativeText: "Fastest if you hustle \u2014 next F is tight",
      uncertaintyNote: null,
      etaF: min(9),
      etaG: min(15),
      confidenceLevel: "HIGH",
      dataFreshnessSeconds: 5,
      debugData: makeDebugData({
        jayTs: BASE + min(2),
        hoytTs: BASE + min(4),
        fSwitchAt: BASE + min(3),
        fArriveAt: BASE + min(9),
        gSwitchAt: BASE + min(9),
        gArriveAt: BASE + min(15),
      }),
    },
  },
  {
    name: "G wins — HURRY",
    data: {
      recommendedRoute: "G",
      urgencyState: "HURRY",
      recommendationReason: "FASTEST_TIGHT_TRANSFER",
      summaryText: "G is 3 min faster",
      narrativeText: "You can probably catch it, but do not dawdle",
      uncertaintyNote: null,
      etaF: min(14),
      etaG: min(11),
      confidenceLevel: "HIGH",
      dataFreshnessSeconds: 10,
      debugData: makeDebugData({
        jayTs: BASE + min(3),
        hoytTs: BASE + min(4),
        fSwitchAt: BASE + min(8),
        fArriveAt: BASE + min(14),
        gSwitchAt: BASE + min(5),
        gArriveAt: BASE + min(11),
      }),
    },
  },
  {
    name: "About the same — prefer F",
    data: {
      recommendedRoute: "F",
      urgencyState: "NORMAL",
      recommendationReason: "ABOUT_THE_SAME_PREFER_EASIER",
      summaryText: "About the same \u2014 take F",
      narrativeText: "Times are close; F is the easier transfer",
      uncertaintyNote: null,
      etaF: min(10),
      etaG: min(11),
      confidenceLevel: "MEDIUM",
      dataFreshnessSeconds: 15,
      debugData: makeDebugData({
        jayTs: BASE + min(3),
        hoytTs: BASE + min(5),
        fSwitchAt: BASE + min(4),
        fArriveAt: BASE + min(10),
        gSwitchAt: BASE + min(7),
        gArriveAt: BASE + min(11),
      }),
    },
  },
  {
    name: "Low confidence",
    data: {
      recommendedRoute: "F",
      urgencyState: "NORMAL",
      recommendationReason: "LOW_CONFIDENCE",
      summaryText: "F is probably faster",
      narrativeText: null,
      uncertaintyNote: "Feed data is stale \u2014 times may have shifted",
      etaF: min(11),
      etaG: min(15),
      confidenceLevel: "LOW",
      dataFreshnessSeconds: 55,
      debugData: makeDebugData({
        jayTs: BASE + min(4),
        hoytTs: BASE + min(6),
        fSwitchAt: BASE + min(5),
        fArriveAt: BASE + min(11),
        gSwitchAt: BASE + min(9),
        gArriveAt: BASE + min(15),
      }),
    },
  },
  {
    name: "Data unavailable",
    data: {
      recommendedRoute: "?",
      urgencyState: "NORMAL",
      recommendationReason: "DATA_UNAVAILABLE",
      summaryText: "No train data available",
      narrativeText: null,
      uncertaintyNote: "Could not reach MTA feeds",
      etaF: null,
      etaG: null,
      confidenceLevel: "DATA_UNAVAILABLE",
      dataFreshnessSeconds: null,
      debugData: makeDebugData({}),
    },
  },
  {
    name: "F wins — only F data",
    data: {
      recommendedRoute: "F",
      urgencyState: "NORMAL",
      recommendationReason: "LOW_CONFIDENCE",
      summaryText: "Take F \u2014 no G data",
      narrativeText: null,
      uncertaintyNote: "G predictions unavailable",
      etaF: min(10),
      etaG: null,
      confidenceLevel: "LOW",
      dataFreshnessSeconds: 20,
      debugData: makeDebugData({
        jayTs: BASE + min(3),
        hoytTs: null,
        fSwitchAt: BASE + min(4),
        fArriveAt: BASE + min(10),
        gSwitchAt: null,
        gArriveAt: null,
      }),
    },
  },
];
