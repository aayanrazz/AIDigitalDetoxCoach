import UsageSession from "../models/UsageSession.js";
import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
import AiInsight from "../models/AiInsight.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey, getRangeStart } from "../utils/date.js";
import {
  analyzeDailyUsage,
  evaluateAppLimits,
} from "../services/behavior.service.js";
import { buildAnalytics } from "../services/analytics.service.js";
import {
  getLevelProgressFromPoints,
  getUnlockedBadgeDetails,
  getNextBadgeHint,
} from "../services/gamification.service.js";

function formatTimeHint(value = "23:00") {
  const [h = "23", m = "00"] = String(value).split(":");
  const hours = Number(h) || 0;
  const minutes = Number(m) || 0;
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function buildSettingsDrivenChallenge(settings, pendingTask) {
  if (pendingTask?.title) return pendingTask.title;

  const primary = settings?.focusAreas?.[0] || "Social Media";

  if (primary.toLowerCase().includes("social")) {
    return "Avoid social scrolling until midday";
  }

  if (primary.toLowerCase().includes("gaming")) {
    return "Keep gaming out of your first focus block";
  }

  if (primary.toLowerCase().includes("product")) {
    return "Use only productive apps during your next work session";
  }

  return `Start wind-down before ${settings?.sleepSchedule?.bedTime || "23:00"}`;
}

function buildSettingsDrivenRecommendations(settings, todayAnalysis) {
  const recommendations = [...(todayAnalysis?.recommendations || [])];

  const primary = settings?.focusAreas?.[0];
  const bedTime = settings?.sleepSchedule?.bedTime;
  const wakeTime = settings?.sleepSchedule?.wakeTime;
  const notifications = settings?.notificationSettings || {};

  if (primary) {
    recommendations.push(
      `Today's coaching is centered on your focus area: ${primary}.`
    );
  }

  if (bedTime) {
    recommendations.push(
      `Begin your low-distraction wind-down before ${formatTimeHint(bedTime)}.`
    );
  }

  if (wakeTime) {
    recommendations.push(
      `Aim for a mindful start after ${formatTimeHint(wakeTime)}.`
    );
  }

  if (notifications.gentleNudges === false) {
    recommendations.push(
      "Gentle nudges are off, so rely more on your dashboard and plan check-ins."
    );
  }

  if (notifications.dailySummaries === true) {
    recommendations.push(
      "Check your daily summary each evening to reflect on progress."
    );
  }

  return Array.from(new Set(recommendations)).slice(0, 6);
}

function buildInterventionMessage(appLimitSummary = {}) {
  const exceededCount = Number(appLimitSummary?.exceededCount || 0);
  const topExceededApp = appLimitSummary?.topExceededApp || null;

  if (exceededCount <= 0) {
    return "";
  }

  if (!topExceededApp?.appName) {
    return exceededCount === 1
      ? "One tracked app is over its daily limit today."
      : `${exceededCount} tracked apps are over their daily limits today.`;
  }

  const exceededMinutes = Number(topExceededApp.exceededMinutes || 0);

  if (exceededCount === 1) {
    return `${topExceededApp.appName} is ${exceededMinutes} minutes over its daily limit. Take a short break or close it for now.`;
  }

  return `${topExceededApp.appName} is ${exceededMinutes} minutes over its daily limit, and ${
    exceededCount - 1
  } more tracked app${exceededCount - 1 === 1 ? "" : "s"} also exceeded today.`;
}

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

  const appLimits = await AppLimit.find({ user: req.user._id }).lean();

  const weekStart = getRangeStart("week");
  const now = new Date();

  const currentWeekSessions = await UsageSession.find({
    user: req.user._id,
    startTime: {
      $gte: weekStart,
      $lte: now,
    },
  });

  const previousWeekStart = new Date(weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  const previousWeekEnd = new Date(weekStart);

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

  const appLimitSummary = evaluateAppLimits({
    sessions: todaySessions,
    appLimits,
    limitWarningsEnabled: settings?.notificationSettings?.limitWarnings !== false,
  });

  const topExceededApp = appLimitSummary.topExceededApp || null;

  const mlInsight = await AiInsight.findOne({
    user: req.user._id,
    dayKey: todayKey,
  }).sort({ createdAt: -1 });

  const currentAnalytics = buildAnalytics({
    sessions: currentWeekSessions,
    user: req.user,
    range: "week",
    startDate: weekStart,
    endDate: now,
  });

  const previousAnalytics = buildAnalytics({
    sessions: previousWeekSessions,
    user: req.user,
    range: "week",
    startDate: previousWeekStart,
    endDate: previousWeekEnd,
  });

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

  const levelProgress = getLevelProgressFromPoints(req.user.points || 0);
  const badges = getUnlockedBadgeDetails(req.user);
  const latestBadge = badges.length ? badges[badges.length - 1] : null;
  const nextBadgeHint = getNextBadgeHint(req.user);

  res.json({
    success: true,
    dashboard: {
      userName: req.user.name,
      digitalWellnessScore: mlInsight?.score ?? todayAnalysis.score,
      improvementVsLastWeek,
      pickups: todayAnalysis.pickups,
      unlocks: todayAnalysis.unlocks,
      streak: req.user.streakCount || 0,
      points: req.user.points || 0,
      riskLevel: mlInsight?.riskLevel || todayAnalysis.riskLevel,
      predictionSource: mlInsight?.predictionSource || "rule_based_fallback",
      mlConfidence: Number(mlInsight?.mlConfidence || 0),
      todayScreenTime: todayAnalysis.totalScreenMinutes,
      dailyGoal: settings?.dailyLimitMinutes ?? 180,
      dailyChallenge: buildSettingsDrivenChallenge(settings, pendingTask),
      aiRecommendations: buildSettingsDrivenRecommendations(
        settings,
        todayAnalysis
      ),
      unreadNotifications,
      overLimitAppsCount: Number(appLimitSummary.exceededCount || 0),
      topExceededAppName: topExceededApp?.appName || "",
      topExceededMinutes: Number(topExceededApp?.exceededMinutes || 0),
      interventionMessage: buildInterventionMessage(appLimitSummary),
      leaderboard,
      currentLevelNumber: levelProgress.level?.number || 1,
      currentLevelTitle: levelProgress.level?.title || "Mindful Seed",
      progressPct: levelProgress.progressPct ?? 0,
      pointsToNextLevel: levelProgress.pointsToNextLevel ?? 0,
      badgesCount: badges.length,
      latestBadgeLabel: latestBadge?.label || "",
      latestBadgeEmoji: latestBadge?.emoji || "",
      nextBadgeHintText:
        nextBadgeHint?.hint ||
        "Keep following your plan to unlock more badges.",
    },
  });
});