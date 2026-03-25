import UsageSession from "../models/UsageSession.js";
import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey, getRangeStart } from "../utils/date.js";
import {
  analyzeDailyUsage,
  evaluateAppLimits,
} from "../services/behavior.service.js";
import { buildAnalytics } from "../services/analytics.service.js";
import { getLevelProgressFromPoints } from "../services/gamification.service.js";

export const getDashboard = asyncHandler(async (req, res) => {
  let settings = await UserSettings.findOne({ user: req.user._id });

  if (!settings) {
    settings = await UserSettings.create({ user: req.user._id });
  }

  const todayKey = formatDayKey();

  const todaySessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  });

  const currentWeekSessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: getRangeStart("week") },
  });

  const previousWeekStart = new Date(getRangeStart("week"));
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const previousWeekEnd = new Date(getRangeStart("week"));

  const previousWeekSessions = await UsageSession.find({
    user: req.user._id,
    startTime: {
      $gte: previousWeekStart,
      $lt: previousWeekEnd,
    },
  });

  const todayAnalysis = analyzeDailyUsage({
    sessions: todaySessions,
    settings,
  });

  const appLimits = await AppLimit.find({ user: req.user._id }).sort({
    dailyLimitMinutes: 1,
    appName: 1,
  });

  const appLimitSummary = evaluateAppLimits({
    sessions: todaySessions,
    appLimits,
    limitWarningsEnabled: settings?.notificationSettings?.limitWarnings !== false,
  });

  const currentAnalytics = buildAnalytics(currentWeekSessions, req.user);
  const previousAnalytics = buildAnalytics(previousWeekSessions, req.user);

  const improvementVsLastWeek =
    previousAnalytics.averageDailyMinutes > 0
      ? Math.round(
          ((previousAnalytics.averageDailyMinutes -
            currentAnalytics.averageDailyMinutes) /
            previousAnalytics.averageDailyMinutes) *
            100
        )
      : 0;

  const activePlan = await DetoxPlan.findOne({
    user: req.user._id,
    active: true,
  }).sort({ createdAt: -1 });

  const unreadNotifications = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  const leaderboard = await User.find({})
    .sort({ points: -1 })
    .limit(3)
    .select("name points");

  const pendingTask =
    activePlan?.days
      ?.find((day) => day.status !== "completed")
      ?.tasks?.find((task) => task.status !== "completed") || null;

  const focusAreas = settings?.focusAreas || [];
  const levelProgress = getLevelProgressFromPoints(req.user.points || 0);
  const topExceededApp = appLimitSummary.topExceededApp;

  res.json({
    success: true,
    dashboard: {
      userName: req.user.name,
      digitalWellnessScore: todayAnalysis.score,
      riskLevel: todayAnalysis.riskLevel,
      improvementVsLastWeek,
      pickups: todayAnalysis.pickups,
      unlocks: todayAnalysis.unlocks,
      streak: req.user.streakCount || 0,
      points: req.user.points || 0,
      badgesCount: Array.isArray(req.user.badges) ? req.user.badges.length : 0,
      currentLevelNumber: levelProgress.level?.number || 1,
      currentLevelTitle: levelProgress.level?.title || "Mindful Seed",
      progressPct: levelProgress.progressPct ?? 0,
      pointsToNextLevel: levelProgress.pointsToNextLevel ?? 0,
      todayScreenTime: todayAnalysis.totalScreenMinutes,
      dailyGoal: settings?.dailyLimitMinutes ?? 180,
      dailyChallenge:
        pendingTask?.title ||
        (topExceededApp
          ? `Reduce ${topExceededApp.appName} by ${topExceededApp.exceededMinutes} minutes`
          : focusAreas.includes("Social Media")
          ? "No Social Media until 12PM"
          : "Take a nature break"),
      aiRecommendations: [
        ...todayAnalysis.recommendations,
        ...appLimitSummary.exceededApps.map(
          (item) =>
            `${item.appName} is over limit by ${item.exceededMinutes} minutes.`
        ),
      ],
      unreadNotifications,
      leaderboard,

      overLimitAppsCount: appLimitSummary.exceededCount,
      topExceededAppName: topExceededApp?.appName || "",
      topExceededMinutes: topExceededApp?.exceededMinutes || 0,
      interventionMessage: topExceededApp
        ? `${topExceededApp.appName} needs immediate attention today.`
        : "No app limits exceeded today.",
    },
  });
});