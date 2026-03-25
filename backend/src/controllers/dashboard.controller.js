import UsageSession from "../models/UsageSession.js";
import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import UserSettings from "../models/UserSettings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey, getRangeStart } from "../utils/date.js";
import { analyzeDailyUsage } from "../services/behavior.service.js";
import { buildAnalytics } from "../services/analytics.service.js";
import {
  getLevelProgressFromPoints,
  getUnlockedBadgeDetails,
  getNextBadgeHint,
} from "../services/gamification.service.js";

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
  const badges = getUnlockedBadgeDetails(req.user);
  const latestBadge = badges.length ? badges[badges.length - 1] : null;
  const nextBadgeHint = getNextBadgeHint(req.user);

  res.json({
    success: true,
    dashboard: {
      userName: req.user.name,
      digitalWellnessScore: todayAnalysis.score,
      improvementVsLastWeek,
      pickups: todayAnalysis.pickups,
      unlocks: todayAnalysis.unlocks,
      streak: req.user.streakCount || 0,
      points: req.user.points || 0,
      todayScreenTime: todayAnalysis.totalScreenMinutes,
      dailyGoal: settings?.dailyLimitMinutes ?? 180,
      dailyChallenge:
        pendingTask?.title ||
        (focusAreas.includes("Social Media")
          ? "No Social Media until 12PM"
          : "Take a nature break"),
      aiRecommendations: todayAnalysis.recommendations,
      unreadNotifications,
      leaderboard,

      currentLevelNumber: levelProgress.level?.number || 1,
      currentLevelTitle: levelProgress.level?.title || "Mindful Seed",
      progressPct: levelProgress.progressPct ?? 0,
      pointsToNextLevel: levelProgress.pointsToNextLevel ?? 0,

      badgesCount: badges.length,
      latestBadgeLabel: latestBadge?.label || "",
      latestBadgeEmoji: latestBadge?.emoji || "",
      nextBadgeHintText: nextBadgeHint?.hint || "All badges unlocked.",
    },
  });
});