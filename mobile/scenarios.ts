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
  transferDecision: MockScenario["data"] | null;
  summaryText: string | null;
  narrativeText: string | null;
  expressBannerText: string | null;
};

export type MockOnTheFScenario = {
  name: string;
  data: {
    trains: OnTheFTrain[];
    dataFreshnessSeconds: number | null;
    serverTimeEpochSeconds: number;
  };
};

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

export type MockCompassScenario = {
  name: string;
  data: {
    simulatedHeading: number | null;
  };
};

export const COMPASS_SCENARIOS: MockCompassScenario[] = [
  { name: "Brooklyn bound (165°)", data: { simulatedHeading: 165 } },
  { name: "Queens bound (345°)", data: { simulatedHeading: 345 } },
  { name: "Slightly off Brooklyn (140°)", data: { simulatedHeading: 140 } },
  { name: "Slightly off Queens (10°)", data: { simulatedHeading: 10 } },
  { name: "Perpendicular (75°)", data: { simulatedHeading: 75 } },
  { name: "No compass data", data: { simulatedHeading: null } },
];

export const ON_THE_F_SCENARIOS: MockOnTheFScenario[] = [
  {
    name: "Local F — direct to Carroll",
    data: {
      trains: [
        {
          tripId: "mock-local-1",
          isLocal: true,
          caseTag: "local_direct",
          nextStopId: "F16S",
          nextStopName: "York St",
          nextStopTs: BASE + min(2),
          jayArrivalTs: BASE + min(4),
          carrollArrivalTs: BASE + min(6),
          carrollEtaSeconds: min(6),
          transferDecision: null,
          summaryText: "Sit tight. Carroll at 7:51 PM",
          narrativeText: "6 min \u2014 sit back and enjoy the ride",
          expressBannerText: null,
        },
      ],
      dataFreshnessSeconds: 8,
      serverTimeEpochSeconds: BASE,
    },
  },
  {
    name: "Express F — transfer favors G",
    data: {
      trains: [
        {
          tripId: "mock-express-g",
          isLocal: false,
          caseTag: "express_transfer",
          nextStopId: "F16S",
          nextStopName: "York St",
          nextStopTs: BASE + min(2),
          jayArrivalTs: BASE + min(5),
          carrollArrivalTs: BASE + min(15),
          carrollEtaSeconds: min(15),
          summaryText: "Take G. It is clearly faster.",
          narrativeText: "Transfer to the G via A/C. About 4 min faster than the F.",
          expressBannerText: "This train skips Carroll \u2014 get off at Jay St (7:50 PM)",
          transferDecision: {
            recommendedRoute: "G",
            urgencyState: "NORMAL",
            recommendationReason: "FASTEST_CLEAR",
            summaryText: "Take G. It is clearly faster.",
            narrativeText: "Transfer to the G via A/C. About 4 min faster than the F.",
            uncertaintyNote: null,
            etaF: min(20),
            etaG: min(15),
            confidenceLevel: "HIGH",
            dataFreshnessSeconds: 8,
            debugData: makeDebugData({
              jayTs: BASE + min(7),
              hoytTs: BASE + min(9),
              fSwitchAt: BASE + min(14),
              fArriveAt: BASE + min(20),
              gSwitchAt: BASE + min(11),
              gArriveAt: BASE + min(15),
            }),
          },
        },
      ],
      dataFreshnessSeconds: 8,
      serverTimeEpochSeconds: BASE,
    },
  },
  {
    name: "Express F — wait for local F",
    data: {
      trains: [
        {
          tripId: "mock-express-f",
          isLocal: false,
          caseTag: "express_transfer",
          nextStopId: "F15S",
          nextStopName: "Delancey St\u2011Essex St",
          nextStopTs: BASE + min(1),
          jayArrivalTs: BASE + min(4),
          carrollArrivalTs: BASE + min(12),
          carrollEtaSeconds: min(12),
          summaryText: "Take F. It is clearly faster.",
          narrativeText: "Wait for a local F at Jay St. About 5 min faster than the G.",
          expressBannerText: "Wrong F. Off at Jay St (7:49 PM), then transfer.",
          transferDecision: {
            recommendedRoute: "F",
            urgencyState: "NORMAL",
            recommendationReason: "FASTEST_CLEAR",
            summaryText: "Take F. It is clearly faster.",
            narrativeText: "Wait for a local F at Jay St. About 5 min faster than the G.",
            uncertaintyNote: null,
            etaF: min(12),
            etaG: min(17),
            confidenceLevel: "HIGH",
            dataFreshnessSeconds: 10,
            debugData: makeDebugData({
              jayTs: BASE + min(6),
              hoytTs: BASE + min(8),
              fSwitchAt: BASE + min(6),
              fArriveAt: BASE + min(12),
              gSwitchAt: BASE + min(10),
              gArriveAt: BASE + min(17),
            }),
          },
        },
      ],
      dataFreshnessSeconds: 10,
      serverTimeEpochSeconds: BASE,
    },
  },
  {
    name: "Multiple trains — express then local",
    data: {
      trains: [
        {
          tripId: "mock-express-multi",
          isLocal: false,
          caseTag: "express_transfer",
          nextStopId: "F16S",
          nextStopName: "York St",
          nextStopTs: BASE + min(2),
          jayArrivalTs: BASE + min(4),
          carrollArrivalTs: BASE + min(14),
          carrollEtaSeconds: min(14),
          summaryText: "Take G. Transfer is tight.",
          narrativeText: "Transfer to the G via A/C. About 3 min faster than the F.",
          expressBannerText: "Heads up: this F is express. Jay St at 7:49 PM.",
          transferDecision: {
            recommendedRoute: "G",
            urgencyState: "HURRY",
            recommendationReason: "FASTEST_TIGHT_TRANSFER",
            summaryText: "Take G. Transfer is tight.",
            narrativeText: "Transfer to the G via A/C. About 3 min faster than the F.",
            uncertaintyNote: null,
            etaF: min(17),
            etaG: min(14),
            confidenceLevel: "MEDIUM",
            dataFreshnessSeconds: 5,
            debugData: makeDebugData({
              jayTs: BASE + min(6),
              hoytTs: BASE + min(7),
              fSwitchAt: BASE + min(11),
              fArriveAt: BASE + min(17),
              gSwitchAt: BASE + min(9),
              gArriveAt: BASE + min(14),
            }),
          },
        },
        {
          tripId: "mock-local-multi",
          isLocal: true,
          caseTag: "local_direct",
          nextStopId: "F14S",
          nextStopName: "East Broadway",
          nextStopTs: BASE + min(5),
          jayArrivalTs: BASE + min(8),
          carrollArrivalTs: BASE + min(11),
          carrollEtaSeconds: min(11),
          transferDecision: null,
          summaryText: "Smooth sailing \u2014 Carroll at 7:56 PM",
          narrativeText: "11 min. You picked the right train.",
          expressBannerText: null,
        },
      ],
      dataFreshnessSeconds: 5,
      serverTimeEpochSeconds: BASE,
    },
  },
];
