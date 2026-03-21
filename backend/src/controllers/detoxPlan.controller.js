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
  getLevelFromPoints,
} from "../services/gamification.service.js";
import { serializeUser } from "../utils/serialize.js";

export const generateDetoxPlan = asyncHandler(async (req, res) => {
  const settings = await UserSettings.findOne({ user: req.user._id });

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
    body: "Your personalized 21-day detox plan is ready.",
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
  let task = null;

  for (const day of plan.days) {
    const foundTask = day.tasks.id(req.params.taskId);
    if (foundTask) {
      targetDay = day;
      task = foundTask;
      break;
    }
  }

  if (!task || !targetDay) {
    throw new ApiError(404, "Task not found.");
  }

  if (task.status === "completed") {
    throw new ApiError(400, "Task already completed.");
  }

  task.status = "completed";
  task.completedAt = new Date();

  const allCompleted = targetDay.tasks.every((t) => t.status === "completed");
  if (allCompleted) {
    targetDay.status = "completed";

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
        req.user.longestStreak,
        req.user.streakCount
      );
      req.user.lastStreakDate = new Date();
    }
  }

  req.user.points += 25;
  const newBadges = syncBadges(req.user);

  await req.user.save();
  await plan.save();

  await RewardLedger.create({
    user: req.user._id,
    type: "earn",
    points: 25,
    title: "Task completed",
    description: `Completed: ${task.title}`,
  });

  if (newBadges.length > 0) {
    await Notification.create({
      user: req.user._id,
      type: "achievement",
      title: "New badge unlocked",
      body: `You unlocked: ${newBadges.join(", ")}`,
      cta: {
        label: "VIEW BADGES",
        action: "open_rewards",
      },
    });
  }

  res.json({
    success: true,
    message: "Task completed successfully.",
    plan,
    user: {
      ...serializeUser(req.user),
      level: getLevelFromPoints(req.user.points),
    },
    newBadges,
  });
});