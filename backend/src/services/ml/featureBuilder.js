import UserSettings from "../../models/UserSettings.js";
import AppLimit from "../../models/AppLimit.js";
import UsageSession from "../../models/UsageSession.js";
import { formatDayKey, getRangeStart } from "../../utils/date.js";
import { analyzeDailyUsage } from "../../services/behavior.service.js";
import { buildAnalytics } from "../../services/analytics.service.js";

const CATEGORY_KEYS = [
  "Social",
  "Communication",
  "Productivity",
  "Education",
  "Streaming",
  "Gaming",
  "Other",
];

const CATEGORY_FIELD_MAP = {
  Social: "socialMinutes",
  Communication: "communicationMinutes",
  Productivity: "productivityMinutes",
  Education: "educationMinutes",
  Streaming: "streamingMinutes",
  Gaming: "gamingMinutes",
  Other: "otherMinutes",
};

const toMinutesFromHHMM = (value = "23:00") => {
  const [h = "23", m = "00"] = String(value).split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
};

const clampNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTopExceededMinutes = (sessions = [], appLimits = []) => {
  if (!Array.isArray(appLimits) || appLimits.length === 0) return 0;

  const minutesByPackage = new Map();

  for (const session of sessions) {
    const pkg = String(session.appPackage || "").trim();
    if (!pkg) continue;
    minutesByPackage.set(
      pkg,
      (minutesByPackage.get(pkg) || 0) + clampNumber(session.durationMinutes, 0)
    );
  }

  let maxExceeded = 0;

  for (const appLimit of appLimits) {
    const pkg = String(appLimit.appPackage || "").trim();
    const limitMinutes = clampNumber(appLimit.limitMinutes, 0);
    const usedMinutes = minutesByPackage.get(pkg) || 0;
    const exceeded = Math.max(0, usedMinutes - limitMinutes);
    maxExceeded = Math.max(maxExceeded, exceeded);
  }

  return Math.round(maxExceeded);
};

const getOverLimitAppsCount = (sessions = [], appLimits = []) => {
  if (!Array.isArray(appLimits) || appLimits.length === 0) return 0;

  const minutesByPackage = new Map();

  for (const session of sessions) {
    const pkg = String(session.appPackage || "").trim();
    if (!pkg) continue;
    minutesByPackage.set(
      pkg,
      (minutesByPackage.get(pkg) || 0) + clampNumber(session.durationMinutes, 0)
    );
  }

  let count = 0;

  for (const appLimit of appLimits) {
    const pkg = String(appLimit.appPackage || "").trim();
    const limitMinutes = clampNumber(appLimit.limitMinutes, 0);
    const usedMinutes = minutesByPackage.get(pkg) || 0;
    if (usedMinutes > limitMinutes) count += 1;
  }

  return count;
};

const getCategoryMinutes = (sessions = []) => {
  const totals = {
    socialMinutes: 0,
    communicationMinutes: 0,
    productivityMinutes: 0,
    educationMinutes: 0,
    streamingMinutes: 0,
    gamingMinutes: 0,
    otherMinutes: 0,
  };

  for (const session of sessions) {
    const category = CATEGORY_KEYS.includes(session.category)
      ? session.category
      : "Other";
    const key = CATEGORY_FIELD_MAP[category] || "otherMinutes";
    totals[key] += clampNumber(session.durationMinutes, 0);
  }

  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key]);
  }

  return totals;
};

const getPeakHour = (sessions = []) => {
  const hourly = Array.from({ length: 24 }, () => 0);

  for (const session of sessions) {
    const date = new Date(session.startTime);
    const hour = date.getHours();
    hourly[hour] += clampNumber(session.durationMinutes, 0);
  }

  const maxValue = Math.max(...hourly);
  return maxValue > 0 ? hourly.findIndex((value) => value === maxValue) : 0;
};

const getAvgSessionMinutes = (sessions = []) => {
  if (!sessions.length) return 0;

  const total = sessions.reduce(
    (sum, session) => sum + clampNumber(session.durationMinutes, 0),
    0
  );

  return Math.round(total / sessions.length);
};

const getLongestSessionMinutes = (sessions = []) => {
  let longest = 0;

  for (const session of sessions) {
    longest = Math.max(longest, clampNumber(session.durationMinutes, 0));
  }

  return Math.round(longest);
};

const getSevenDayAverage = async (userId) => {
  const weekStart = getRangeStart("week");

  const sessions = await UsageSession.find({
    user: userId,
    startTime: { $gte: weekStart, $lte: new Date() },
  }).lean();

  const analytics = buildAnalytics({
    sessions,
    range: "week",
    startDate: weekStart,
    endDate: new Date(),
  });

  return clampNumber(analytics.averageDailyMinutes, 0);
};

const getYesterdayScore = async (userId, settings, currentDay) => {
  const yesterday = new Date(currentDay);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDayKey(yesterday);

  const yesterdaySessions = await UsageSession.find({
    user: userId,
    dayKey: yesterdayKey,
  }).lean();

  if (!yesterdaySessions.length) return 0;

  const yesterdayAnalysis = analyzeDailyUsage({
    sessions: yesterdaySessions,
    settings,
  });

  return clampNumber(yesterdayAnalysis.score, 0);
};

export const buildMlFeaturesForDay = async ({
  user,
  date = new Date(),
  sessions = null,
}) => {
  const settings =
    (await UserSettings.findOne({ user: user._id }).lean()) || {};

  const appLimits = await AppLimit.find({ user: user._id }).lean();

  const dayKey = formatDayKey(date);

  const daySessions = sessions
    ? sessions
    : await UsageSession.find({ user: user._id, dayKey }).lean();

  const dailyAnalysis = analyzeDailyUsage({
    sessions: daySessions,
    settings,
  });

  const categories = getCategoryMinutes(daySessions);
  const sevenDayAvgScreenMinutes = await getSevenDayAverage(user._id);
  const yesterdayScore = await getYesterdayScore(user._id, settings, date);

  const focusPrimary = settings?.focusAreas?.[0] || "Social Media";
  const focusSecondary = settings?.focusAreas?.[1] || "General Balance";
  const theme = settings?.theme || "dark";

  const featureRow = {
    isWeekend: [0, 6].includes(new Date(date).getDay()) ? 1 : 0,
    dayOfWeek: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
    dailyLimitMinutes: clampNumber(settings?.dailyLimitMinutes, 180),
    bedTimeMinutes: toMinutesFromHHMM(
      settings?.sleepSchedule?.bedTime || "23:00"
    ),
    wakeTimeMinutes: toMinutesFromHHMM(
      settings?.sleepSchedule?.wakeTime || "07:00"
    ),
    gentleNudgesEnabled:
      settings?.notificationSettings?.gentleNudges === false ? 0 : 1,
    dailySummariesEnabled:
      settings?.notificationSettings?.dailySummaries === true ? 1 : 0,
    achievementAlertsEnabled:
      settings?.notificationSettings?.achievementAlerts === false ? 0 : 1,
    limitWarningsEnabled:
      settings?.notificationSettings?.usageLimitWarnings === false ? 0 : 1,
    googleFitConnected: settings?.integrations?.googleFitConnected ? 1 : 0,
    focusPrimary,
    focusSecondary,
    theme,
    sessionCount: daySessions.length,
    totalScreenMinutes: clampNumber(dailyAnalysis.totalScreenMinutes, 0),
    pickups: clampNumber(dailyAnalysis.pickups, 0),
    unlocks: clampNumber(dailyAnalysis.unlocks, 0),
    lateNightMinutes: clampNumber(dailyAnalysis.lateNightMinutes, 0),
    avgSessionMinutes: getAvgSessionMinutes(daySessions),
    longestSessionMinutes: getLongestSessionMinutes(daySessions),
    peakHour: getPeakHour(daySessions),
    sevenDayAvgScreenMinutes,
    yesterdayScore,
    overLimitMinutes: Math.max(
      0,
      clampNumber(dailyAnalysis.totalScreenMinutes, 0) -
        clampNumber(settings?.dailyLimitMinutes, 180)
    ),
    monitoredAppCount: new Set(
      daySessions
        .map((session) => String(session.appPackage || "").trim())
        .filter(Boolean)
    ).size,
    overLimitAppsCount: getOverLimitAppsCount(daySessions, appLimits),
    topExceededMinutes: getTopExceededMinutes(daySessions, appLimits),
    ...categories,
  };

  return {
    dayKey,
    settings,
    appLimits,
    sessions: daySessions,
    dailyAnalysis,
    featureRow,
  };
};