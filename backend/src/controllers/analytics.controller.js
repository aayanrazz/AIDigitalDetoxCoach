import UsageSession from "../models/UsageSession.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getRangeStart } from "../utils/date.js";
import {
  buildAnalytics,
  buildInsightsFromAnalytics,
} from "../services/analytics.service.js";

export const getAnalyticsSummary = asyncHandler(async (req, res) => {
  const range = req.query.range || "week";
  const startDate = getRangeStart(range);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: startDate },
  }).sort({ startTime: 1 });

  const analytics = buildAnalytics(sessions, req.user);
  const insights = buildInsightsFromAnalytics(analytics);

  res.json({
    success: true,
    range,
    analytics,
    insights,
  });
});

export const exportAnalyticsReport = asyncHandler(async (req, res) => {
  const range = req.query.range || "month";
  const startDate = getRangeStart(range);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: startDate },
  }).sort({ startTime: 1 });

  const analytics = buildAnalytics(sessions, req.user);
  const insights = buildInsightsFromAnalytics(analytics);

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