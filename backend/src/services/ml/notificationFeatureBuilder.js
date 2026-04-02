import { buildPlanMlFeaturesForDay } from "./planFeatureBuilder.js";

const clampNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeString = (value, fallback = "") => {
  const normalized = String(value || "").trim();
  return normalized || fallback;
};

export const buildNotificationMlFeaturesForDay = async ({
  user,
  date = new Date(),
  sessions = null,
}) => {
  const base = await buildPlanMlFeaturesForDay({
    user,
    date,
    sessions,
  });

  const baseRow = base?.featureRow || {};

  const featureRow = {
    dailyLimitMinutes: clampNumber(baseRow.dailyLimitMinutes, 180),
    bedTimeMinutes: clampNumber(baseRow.bedTimeMinutes, 1380),
    wakeTimeMinutes: clampNumber(baseRow.wakeTimeMinutes, 420),
    gentleNudgesEnabled: clampNumber(baseRow.gentleNudgesEnabled, 1),
    dailySummariesEnabled: clampNumber(baseRow.dailySummariesEnabled, 1),
    achievementAlertsEnabled: clampNumber(baseRow.achievementAlertsEnabled, 1),
    limitWarningsEnabled: clampNumber(baseRow.limitWarningsEnabled, 1),
    sessionCount: clampNumber(baseRow.sessionCount, 0),
    totalScreenMinutes: clampNumber(baseRow.totalScreenMinutes, 0),
    socialMinutes: clampNumber(baseRow.socialMinutes, 0),
    productivityMinutes: clampNumber(baseRow.productivityMinutes, 0),
    pickups: clampNumber(baseRow.pickups, 0),
    unlocks: clampNumber(baseRow.unlocks, 0),
    lateNightMinutes: clampNumber(baseRow.lateNightMinutes, 0),
    sevenDayAvgScreenMinutes: clampNumber(baseRow.sevenDayAvgScreenMinutes, 0),
    yesterdayScore: clampNumber(baseRow.yesterdayScore, 0),
    overLimitMinutes: clampNumber(baseRow.overLimitMinutes, 0),
    score: clampNumber(baseRow.score, 0),
    overLimitAppsCount: clampNumber(baseRow.overLimitAppsCount, 0),
    topExceededMinutes: clampNumber(baseRow.topExceededMinutes, 0),
    focusPrimary: safeString(baseRow.focusPrimary, "Social Media"),
    focusSecondary: safeString(baseRow.focusSecondary, "General Balance"),
    riskLevel: safeString(baseRow.riskLevel, "low"),
  };

  return {
    ...base,
    featureRow,
  };
};