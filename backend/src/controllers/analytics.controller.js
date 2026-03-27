import crypto from "crypto";
import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey, getRangeStart, isLateNightHour } from "../utils/date.js";
import {
  buildAnalytics,
  buildAnalyticsComparison,
  buildInsightsFromAnalytics,
} from "../services/analytics.service.js";
import { analyzeDailyUsage } from "../services/behavior.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const getPreviousWindow = (startDate) => {
  const now = new Date();
  const currentStart = new Date(startDate);
  const windowMs = now.getTime() - currentStart.getTime();

  const previousEnd = new Date(currentStart);
  const previousStart = new Date(currentStart.getTime() - windowMs);

  return { previousStart, previousEnd };
};

const normalizeRange = (value) => {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }
  return "week";
};

const toStartOfDay = (dateLike) => {
  const d = new Date(dateLike);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getRelativeDayIndex = (startDate, dateLike) => {
  const diffMs =
    toStartOfDay(dateLike).getTime() - toStartOfDay(startDate).getTime();
  return Math.max(0, Math.round(diffMs / DAY_MS));
};

const toWeekdayLabel = (dateLike) =>
  new Date(dateLike).toLocaleDateString(undefined, { weekday: "short" });

const hashAppToken = (userId, appPackage) => {
  const digest = crypto
    .createHash("sha256")
    .update(`${String(userId)}::${String(appPackage || "")}`)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();

  return `APP_${digest}`;
};

const escapeCsvValue = (value) => {
  const raw = value === undefined || value === null ? "" : String(value);
  const escaped = raw.replace(/"/g, '""');
  return `"${escaped}"`;
};

const toCsv = (rows = [], columns = []) => {
  const header = columns.join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(row[column])).join(",")
  );
  return [header, ...body].join("\n");
};

const buildAnalyticsBundle = ({
  range,
  sessions,
  previousSessions,
  user,
  startDate,
  endDate,
}) => {
  const analytics = buildAnalytics({
    sessions,
    user,
    range,
    startDate,
    endDate,
  });

  const previousAnalytics = buildAnalytics({
    sessions: previousSessions,
    user,
    range,
    startDate: getPreviousWindow(startDate).previousStart,
    endDate: getPreviousWindow(startDate).previousEnd,
  });

  const comparison = buildAnalyticsComparison(analytics, previousAnalytics);
  const insights = buildInsightsFromAnalytics(analytics, comparison);

  return {
    analytics: {
      ...analytics,
      comparison,
    },
    insights,
  };
};

const buildEpisodeLabels = ({ sessions = [], settings = {}, startDate }) => {
  const sessionsByDay = new Map();

  for (const session of sessions) {
    const dayKey = session.dayKey || formatDayKey(session.startTime);
    if (!sessionsByDay.has(dayKey)) {
      sessionsByDay.set(dayKey, []);
    }
    sessionsByDay.get(dayKey).push(session);
  }

  const episodeLabels = Array.from(sessionsByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dayKey, daySessions], index) => {
      const analysis = analyzeDailyUsage({ sessions: daySessions, settings });
      const dayStart = daySessions[0]?.startTime || dayKey;
      const overLimitMinutes = Math.max(
        0,
        Number(analysis.totalScreenMinutes || 0) -
          Number(analysis.dailyLimit || 0)
      );

      let behaviorLabel = "balanced_usage";

      if (
        analysis.riskLevel === "high" ||
        overLimitMinutes >= 30 ||
        Number(analysis.lateNightMinutes || 0) >= 45 ||
        Number(analysis.pickups || 0) >= 60
      ) {
        behaviorLabel = "addictive_behavior_episode";
      } else if (analysis.riskLevel === "medium" || overLimitMinutes > 0) {
        behaviorLabel = "risky_usage_episode";
      }

      return {
        episodeId: `EP_${index + 1}`,
        dayToken: `D${getRelativeDayIndex(startDate, dayStart) + 1}`,
        relativeDayIndex: getRelativeDayIndex(startDate, dayStart),
        weekday: toWeekdayLabel(dayStart),
        totalScreenMinutes: Number(analysis.totalScreenMinutes || 0),
        socialMinutes: Number(analysis.socialMinutes || 0),
        productivityMinutes: Number(analysis.productivityMinutes || 0),
        lateNightMinutes: Number(analysis.lateNightMinutes || 0),
        pickups: Number(analysis.pickups || 0),
        unlocks: Number(analysis.unlocks || 0),
        dailyLimitMinutes: Number(analysis.dailyLimit || 0),
        overLimitMinutes,
        detoxScore: Number(analysis.score || 0),
        riskLevel: analysis.riskLevel || "low",
        behaviorLabel,
        isAddictiveBehaviorEpisode:
          behaviorLabel === "addictive_behavior_episode" ? 1 : 0,
        reasons: Array.isArray(analysis.reasons)
          ? analysis.reasons.join(" | ")
          : "",
      };
    });

  return episodeLabels;
};

const buildSessionRows = ({
  sessions = [],
  userId,
  startDate,
  episodeLabels = [],
}) => {
  const episodeMap = new Map(episodeLabels.map((item) => [item.dayToken, item]));

  return sessions.map((session, index) => {
    const sessionStart = new Date(session.startTime);
    const relativeDayIndex = getRelativeDayIndex(startDate, sessionStart);
    const dayToken = `D${relativeDayIndex + 1}`;
    const linkedEpisode = episodeMap.get(dayToken);

    return {
      recordId: `REC_${index + 1}`,
      dayToken,
      relativeDayIndex,
      weekday: toWeekdayLabel(sessionStart),
      hourBucket: Number(session.hourBucket ?? sessionStart.getHours()),
      appToken: hashAppToken(userId, session.appPackage),
      category: String(session.category || "Other"),
      durationMinutes: Number(session.durationMinutes || 0),
      pickups: Number(session.pickups || 0),
      unlocks: Number(session.unlocks || 0),
      isLateNight: isLateNightHour(sessionStart.getHours()) ? 1 : 0,
      platform: session.platform || "android",
      source: session.source || "native_bridge",
      riskLevel: linkedEpisode?.riskLevel || "low",
      behaviorLabel: linkedEpisode?.behaviorLabel || "balanced_usage",
      isAddictiveBehaviorEpisode:
        linkedEpisode?.isAddictiveBehaviorEpisode || 0,
    };
  });
};

export const getAnalyticsSummary = asyncHandler(async (req, res) => {
  const range = normalizeRange(req.query.range || "week");
  const startDate = getRangeStart(range);
  const endDate = new Date();

  const { previousStart, previousEnd } = getPreviousWindow(startDate);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: startDate, $lte: endDate },
  }).sort({ startTime: 1 });

  const previousSessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: previousStart, $lt: previousEnd },
  }).sort({ startTime: 1 });

  const { analytics, insights } = buildAnalyticsBundle({
    range,
    sessions,
    previousSessions,
    user: req.user,
    startDate,
    endDate,
  });

  res.json({
    success: true,
    range,
    analytics,
    insights,
  });
});

export const exportAnalyticsReport = asyncHandler(async (req, res) => {
  const range = normalizeRange(req.query.range || "month");
  const startDate = getRangeStart(range);
  const endDate = new Date();

  const { previousStart, previousEnd } = getPreviousWindow(startDate);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: startDate, $lte: endDate },
  }).sort({ startTime: 1 });

  const previousSessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: previousStart, $lt: previousEnd },
  }).sort({ startTime: 1 });

  const { analytics, insights } = buildAnalyticsBundle({
    range,
    sessions,
    previousSessions,
    user: req.user,
    startDate,
    endDate,
  });

  res.json({
    success: true,
    generatedAt: new Date(),
    report: {
      range,
      analytics,
      insights,
    },
  });
});

export const exportAnonymizedDataset = asyncHandler(async (req, res) => {
  const range = normalizeRange(req.query.range || "month");
  const startDate = getRangeStart(range);
  const endDate = new Date();

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: startDate, $lte: endDate },
  }).sort({ startTime: 1 });

  const settings =
    (await UserSettings.findOne({ user: req.user._id }).lean()) || {
      dailyLimitMinutes: 240,
      notificationSettings: {},
    };

  const episodeLabels = buildEpisodeLabels({
    sessions,
    settings,
    startDate,
  });

  const sessionRows = buildSessionRows({
    sessions,
    userId: req.user._id,
    startDate,
    episodeLabels,
  });

  const sessionColumns = [
    "recordId",
    "dayToken",
    "relativeDayIndex",
    "weekday",
    "hourBucket",
    "appToken",
    "category",
    "durationMinutes",
    "pickups",
    "unlocks",
    "isLateNight",
    "platform",
    "source",
    "riskLevel",
    "behaviorLabel",
    "isAddictiveBehaviorEpisode",
  ];

  const episodeColumns = [
    "episodeId",
    "dayToken",
    "relativeDayIndex",
    "weekday",
    "totalScreenMinutes",
    "socialMinutes",
    "productivityMinutes",
    "lateNightMinutes",
    "pickups",
    "unlocks",
    "dailyLimitMinutes",
    "overLimitMinutes",
    "detoxScore",
    "riskLevel",
    "behaviorLabel",
    "isAddictiveBehaviorEpisode",
    "reasons",
  ];

  res.json({
    success: true,
    generatedAt: new Date(),
    dataset: {
      range,
      format: req.query.format === "csv" ? "csv" : "json",
      summary: {
        sessionCount: sessionRows.length,
        episodeCount: episodeLabels.length,
        dailyLimitMinutes: Number(settings.dailyLimitMinutes || 240),
        includesAppNames: false,
        includesPersonalIdentity: false,
        exportNotes: [
          "App names and package names are replaced with anonymized app tokens.",
          "Exact user identity fields are excluded.",
          "Day tokens are relative labels such as D1, D2, D3 instead of calendar dates.",
          "Episode labels are generated from simple rule-based risk detection for later model training.",
        ],
      },
      sessionRows,
      episodeLabels,
      sessionRowsCsv: toCsv(sessionRows, sessionColumns),
      episodeLabelsCsv: toCsv(episodeLabels, episodeColumns),
    },
  });
});