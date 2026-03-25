import UsageSession from "../models/UsageSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getRangeStart } from "../utils/date.js";
import {
  buildAnalytics,
  buildAnalyticsComparison,
  buildInsightsFromAnalytics,
} from "../services/analytics.service.js";

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

  const analytics = buildAnalytics({
    sessions,
    user: req.user,
    range,
    startDate,
    endDate,
  });

  const previousAnalytics = buildAnalytics({
    sessions: previousSessions,
    user: req.user,
    range,
    startDate: previousStart,
    endDate: previousEnd,
  });

  const comparison = buildAnalyticsComparison(analytics, previousAnalytics);
  const insights = buildInsightsFromAnalytics(analytics, comparison);

  res.json({
    success: true,
    range,
    analytics: {
      ...analytics,
      comparison,
    },
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

  const analytics = buildAnalytics({
    sessions,
    user: req.user,
    range,
    startDate,
    endDate,
  });

  const previousAnalytics = buildAnalytics({
    sessions: previousSessions,
    user: req.user,
    range,
    startDate: previousStart,
    endDate: previousEnd,
  });

  const comparison = buildAnalyticsComparison(analytics, previousAnalytics);
  const insights = buildInsightsFromAnalytics(analytics, comparison);

  res.json({
    success: true,
    generatedAt: new Date(),
    report: {
      range,
      analytics: {
        ...analytics,
        comparison,
      },
      insights,
    },
  });
});