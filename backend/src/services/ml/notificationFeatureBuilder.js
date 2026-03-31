import { buildPlanMlFeaturesForDay } from "./planFeatureBuilder.js";

const clampNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

  const featureRow = {
    dailyLimitMinutes: clampNumber(base.featureRow.dailyLimitMinutes, 180),
    bedTimeMinutes: clampNumber(base.featureRow.bedTimeMinutes, 1380),
    wakeTimeMinutes: clampNumber(base.featureRow.wakeTimeMinutes, 420),
    gentleNudgesEnabled: clampNumber(
      base.featureRow.gentleNudgesEnabled,
      1
    ),
    dailySummariesEnabled: clampNumber(
      base.featureRow.dailySummariesEnabled,
      1
    ),
    achievementAlertsEnabled: clampNumber(
      base.featureRow.achievementAlertsEnabled,
      1
    ),
    limitWarningsEnabled: clampNumber(
      base.featureRow.limitWarningsEnabled,
      1
    ),
    sessionCount: clampNumber(base.featureRow.sessionCount, 0),
    totalScreenMinutes: clampNumber(base.featureRow.totalScreenMinutes, 0),
    socialMinutes: clampNumber(base.featureRow.socialMinutes, 0),
    productivityMinutes: clampNumber(
      base.featureRow.productivityMinutes,
      0
    ),
    pickups: clampNumber(base.featureRow.pickups, 0),
    unlocks: clampNumber(base.featureRow.unlocks, 0),
    lateNightMinutes: clampNumber(base.featureRow.lateNightMinutes, 0),
    sevenDayAvgScreenMinutes: clampNumber(
      base.featureRow.sevenDayAvgScreenMinutes,
      0
    ),
    yesterdayScore: clampNumber(base.featureRow.yesterdayScore, 0),
    overLimitMinutes: clampNumber(base.featureRow.overLimitMinutes, 0),
    score: clampNumber(base.featureRow.score, 0),
    overLimitAppsCount: clampNumber(
      base.featureRow.overLimitAppsCount,
      0
    ),
    topExceededMinutes: clampNumber(base.featureRow.topExceededMinutes, 0),
    focusPrimary: base.featureRow.focusPrimary || "Social Media",
    focusSecondary: base.featureRow.focusSecondary || "General Balance",
    riskLevel: base.featureRow.riskLevel || "low",
  };

  return {
    ...base,
    featureRow,
  };
};