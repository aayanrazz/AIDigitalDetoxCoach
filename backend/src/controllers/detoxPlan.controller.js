import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import RewardLedger from "../models/RewardLedger.js";
import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { getRangeStart, formatDayKey, addDays } from "../utils/date.js";
import { buildAnalytics } from "../services/analytics.service.js";
import { buildDetoxPlan } from "../services/detoxPlan.service.js";
import {
  syncBadges,
  getLevelProgressFromPoints,
} from "../services/gamification.service.js";
import { serializeUser } from "../utils/serialize.js";

async function ensureSettings(userId) {
  let settings = await UserSettings.findOne({ user: userId });

  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }

  return settings;
}

function getTaskPointValue(type = "habit") {
  if (type === "restriction") return 30;
  if (type === "limit") return 25;
  if (type === "sleep") return 20;
  if (type === "wellness") return 20;
  if (type === "reflection") return 15;
  return 15;
}

export const generateDetoxPlan = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: { $gte: getRangeStart("week") },
  });

  const analytics = buildAnalytics(sessions, req.user);

  await DetoxPlan.updateMany(
    { user: req.user._id, active: true },
    { $set: { active: false } }
  );

  const planData = buildDetoxPlan({
    avgDailyMinutes: analytics.averageDailyMinutes || settings.dailyLimitMinutes,
    settings,
    score: req.user.detoxScore,
  });

  const plan = await DetoxPlan.create({
    user: req.user._id,
    ...planData,
  });

  await Notification.create({
    user: req.user._id,
    type: "summary",
    title: "New detox plan generated",
    body: "Your personalized detox plan is ready. Start with today's focus tasks.",
    cta: {
      label: "VIEW PLAN",
      action: "open_detox_plan",
    },
  });

  res.status(201).json({
    success: true,
    message: "Detox plan generated successfully.",
    plan,
  });
});

export const getActivePlan = asyncHandler(async (req, res) => {
  const plan = await DetoxPlan.findOne({
    user: req.user._id,
    active: true,
  }).sort({ createdAt: -1 });

  res.json({
    success: true,
    plan,
  });
});

export const completePlanTask = asyncHandler(async (req, res) => {
  const plan = await DetoxPlan.findOne({
    _id: req.params.planId,
    user: req.user._id,
  });

  if (!plan) {
    throw new ApiError(404, "Detox plan not found.");
  }

  let targetDay = null;
  let targetTask = null;

  for (const day of plan.days) {
    const foundTask = day.tasks.id(req.params.taskId);
    if (foundTask) {
      targetDay = day;
      targetTask = foundTask;
      break;
    }
  }

  if (!targetTask || !targetDay) {
    throw new ApiError(404, "Task not found.");
  }

  if (targetTask.status === "completed") {
    throw new ApiError(400, "Task already completed.");
  }

  targetTask.status = "completed";
  targetTask.completedAt = new Date();

  const basePoints = getTaskPointValue(targetTask.type);
  req.user.points += basePoints;

  const allCompletedForDay = targetDay.tasks.every(
    (task) => task.status === "completed"
  );

  if (allCompletedForDay) {
    targetDay.status = "completed";
    req.user.points += 40;

    const todayKey = formatDayKey();
    const yesterdayKey = formatDayKey(addDays(new Date(), -1));
    const lastStreakKey = req.user.lastStreakDate
      ? formatDayKey(req.user.lastStreakDate)
      : null;

    if (lastStreakKey !== todayKey) {
      if (lastStreakKey === yesterdayKey) {
        req.user.streakCount += 1;
      } else {
        req.user.streakCount = 1;
      }

      req.user.longestStreak = Math.max(
        req.user.longestStreak || 0,
        req.user.streakCount || 0
      );
      req.user.lastStreakDate = new Date();
    }

    const nextPendingDay = plan.days.find((day) => day.status === "pending");
    if (nextPendingDay) {
      nextPendingDay.status = "in_progress";
      if (nextPendingDay.tasks?.length) {
        const nextOpenTask = nextPendingDay.tasks.find(
          (task) => task.status !== "completed"
        );
        if (nextOpenTask && nextOpenTask.status === "pending") {
          nextOpenTask.status = "in_progress";
        }
      }
    }

    await RewardLedger.create({
      user: req.user._id,
      type: "earn",
      points: 40,
      title: "Day completed",
      description: `Completed day ${targetDay.dayNumber} of your detox plan.`,
    });

    await Notification.create({
      user: req.user._id,
      type: "summary",
      title: "Daily detox goal completed",
      body: `Excellent work. You completed day ${targetDay.dayNumber} of your detox plan.`,
      cta: {
        label: "VIEW REWARDS",
        action: "open_rewards",
      },
    });
  } else {
    targetDay.status = "in_progress";
  }

  const allPlanDaysCompleted = plan.days.every((day) => day.status === "completed");

  if (allPlanDaysCompleted && plan.active) {
    plan.active = false;
    req.user.points += 250;

    await RewardLedger.create({
      user: req.user._id,
      type: "earn",
      points: 250,
      title: "Plan completed",
      description: `Completed the full ${plan.durationDays}-day detox plan.`,
    });

    await Notification.create({
      user: req.user._id,
      type: "achievement",
      title: "Detox plan completed",
      body: "You completed your full detox plan. Amazing consistency.",
      cta: {
        label: "VIEW REWARDS",
        action: "open_rewards",
      },
    });
  }

  const newBadges = syncBadges(req.user);

  await req.user.save();
  await plan.save();

  await RewardLedger.create({
    user: req.user._id,
    type: "earn",
    points: basePoints,
    title: "Task completed",
    description: `Completed: ${targetTask.title}`,
  });

  if (newBadges.length > 0) {
    await Notification.create({
      user: req.user._id,
      type: "achievement",
      title: "New badge unlocked",
      body: `You unlocked: ${newBadges.join(", ")}`,
      cta: {
        label: "VIEW REWARDS",
        action: "open_rewards",
      },
    });
  }

  const levelProgress = getLevelProgressFromPoints(req.user.points);

  res.json({
    success: true,
    message: "Task completed successfully.",
    plan,
    user: {
      ...serializeUser(req.user),
      level: levelProgress.level,
      nextLevel: levelProgress.nextLevel,
      progressPct: levelProgress.progressPct,
      pointsToNextLevel: levelProgress.pointsToNextLevel,
    },
    newBadges,
  });
});