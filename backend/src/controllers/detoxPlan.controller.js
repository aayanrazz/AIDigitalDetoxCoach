import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import RewardLedger from "../models/RewardLedger.js";
import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { formatDayKey, addDays } from "../utils/date.js";
import { buildDetoxPlan } from "../services/detoxPlan.service.js";
import {
  syncBadges,
  getLevelProgressFromPoints,
} from "../services/gamification.service.js";
import { serializeUser } from "../utils/serialize.js";
import { buildPlanMlFeaturesForDay } from "../services/ml/planFeatureBuilder.js";
import { buildPlanTargetInsight } from "../services/ml/planMl.service.js";

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

function getAverageDailyMinutes(sessions = [], fallback = 240) {
  if (!sessions.length) return fallback;

  const byDay = new Map();

  for (const session of sessions) {
    const dayKey =
      session.dayKey ||
      formatDayKey(session.startTime ? new Date(session.startTime) : new Date());

    byDay.set(
      dayKey,
      (byDay.get(dayKey) || 0) + Number(session.durationMinutes || 0)
    );
  }

  const totals = Array.from(byDay.values());
  if (!totals.length) return fallback;

  return Math.max(
    60,
    Math.round(totals.reduce((sum, value) => sum + value, 0) / totals.length)
  );
}

function applyPlanFlowState(plan) {
  if (!plan?.days?.length) return;

  const firstOpenDayIndex = plan.days.findIndex((day) =>
    day.tasks?.some((task) => task.status !== "completed")
  );

  if (firstOpenDayIndex === -1) {
    for (const day of plan.days) {
      day.status = "completed";

      for (const task of day.tasks || []) {
        task.status = "completed";
      }
    }
    return;
  }

  plan.days.forEach((day, dayIndex) => {
    const hasIncompleteTask = day.tasks?.some(
      (task) => task.status !== "completed"
    );

    if (!hasIncompleteTask) {
      day.status = "completed";
      return;
    }

    if (dayIndex < firstOpenDayIndex) {
      day.status = "completed";
      return;
    }

    if (dayIndex === firstOpenDayIndex) {
      day.status = "in_progress";

      let promoted = false;

      for (const task of day.tasks || []) {
        if (task.status === "completed") continue;

        if (!promoted) {
          task.status = "in_progress";
          promoted = true;
        } else {
          task.status = "pending";
        }
      }

      return;
    }

    day.status = "pending";

    for (const task of day.tasks || []) {
      if (task.status !== "completed") {
        task.status = "pending";
      }
    }
  });
}

function enrichPlan(planDoc) {
  if (!planDoc) return null;

  const raw =
    typeof planDoc.toObject === "function" ? planDoc.toObject() : planDoc;

  const days = (raw.days || []).map((day) => {
    const tasks = (day.tasks || []).map((task) => ({
      ...task,
      pointsReward: getTaskPointValue(task.type),
    }));

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === "completed"
    ).length;

    return {
      ...day,
      tasks,
      totalTasks,
      completedTasks,
      progressPct:
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };
  });

  const totalDays = days.length;
  const completedDays = days.filter((day) => day.status === "completed").length;
  const pendingDays = days.filter((day) => day.status === "pending").length;
  const totalTasks = days.reduce((sum, day) => sum + (day.totalTasks || 0), 0);
  const completedTasks = days.reduce(
    (sum, day) => sum + (day.completedTasks || 0),
    0
  );

  const currentDay =
    days.find((day) => day.status === "in_progress") ||
    days.find((day) => day.status === "pending") ||
    days[days.length - 1] ||
    null;

  return {
    ...raw,
    days,
    totalDays,
    completedDays,
    pendingDays,
    totalTasks,
    completedTasks,
    overallProgressPct:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    currentDayNumber: currentDay?.dayNumber ?? null,
    status:
      !raw.active && completedDays === totalDays ? "completed" : "active",
  };
}

export const generateDetoxPlan = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const sessions = await UsageSession.find({
    user: req.user._id,
    startTime: {
      $gte: addDays(new Date(), -7),
    },
  }).lean();

  const avgDailyMinutes = getAverageDailyMinutes(
    sessions,
    settings.dailyLimitMinutes || 240
  );

  const { featureRow } = await buildPlanMlFeaturesForDay({
    user: req.user,
  });

  const planPrediction = await buildPlanTargetInsight({
    featureRow,
    fallbackDailyLimit:
      Number(settings.dailyLimitMinutes || 0) || avgDailyMinutes || 180,
  });

  await DetoxPlan.updateMany(
    { user: req.user._id, active: true },
    { $set: { active: false } }
  );

  const effectiveScore = Number(
    featureRow?.score || req.user.detoxScore || 75
  );

  const planData = buildDetoxPlan({
    avgDailyMinutes,
    settings,
    score: effectiveScore,
    predictedTargetDailyLimitMinutes:
      planPrediction.predictedTargetDailyLimitMinutes,
    planPredictionSource: planPrediction.source,
  });

  const plan = await DetoxPlan.create({
    user: req.user._id,
    ...planData,
  });

  applyPlanFlowState(plan);
  await plan.save();

  await Notification.create({
    user: req.user._id,
    type: "summary",
    title: "New detox plan generated",
    body: "Your personalized detox plan is ready. Start with today’s focus tasks.",
    cta: {
      label: "VIEW PLAN",
      action: "open_detox_plan",
    },
  });

  res.status(201).json({
    success: true,
    message: "Detox plan generated successfully.",
    plan: enrichPlan(plan),
    planMeta: {
      targetSource: planPrediction.source,
      fallbackUsed: planPrediction.fallbackUsed,
      predictedTargetDailyLimitMinutes:
        planPrediction.predictedTargetDailyLimitMinutes,
      effectiveTargetDailyLimitMinutes: plan.targetDailyLimitMinutes,
      averageRecentDailyMinutes: avgDailyMinutes,
      scoreUsed: effectiveScore,
      errorMessage: planPrediction.errorMessage || "",
    },
  });
});

export const getActivePlan = asyncHandler(async (req, res) => {
  const plan = await DetoxPlan.findOne({
    user: req.user._id,
    active: true,
  }).sort({ createdAt: -1 });

  if (plan) {
    applyPlanFlowState(plan);
    await plan.save();
  }

  res.json({
    success: true,
    plan: enrichPlan(plan),
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

  if (!targetDay || !targetTask) {
    throw new ApiError(404, "Task not found.");
  }

  if (targetTask.status === "completed") {
    throw new ApiError(400, "Task already completed.");
  }

  targetTask.status = "completed";
  targetTask.completedAt = new Date();

  const basePointsEarned = getTaskPointValue(targetTask.type);
  let dayBonusPoints = 0;
  let planBonusPoints = 0;

  req.user.points = Number(req.user.points || 0) + basePointsEarned;

  const dayCompleted = targetDay.tasks.every(
    (task) => task.status === "completed"
  );

  if (dayCompleted) {
    dayBonusPoints = 40;
    req.user.points += dayBonusPoints;

    const todayKey = formatDayKey();
    const yesterdayKey = formatDayKey(addDays(new Date(), -1));
    const lastStreakKey = req.user.lastStreakDate
      ? formatDayKey(req.user.lastStreakDate)
      : null;

    if (lastStreakKey !== todayKey) {
      if (lastStreakKey === yesterdayKey) {
        req.user.streakCount = Number(req.user.streakCount || 0) + 1;
      } else {
        req.user.streakCount = 1;
      }

      req.user.longestStreak = Math.max(
        Number(req.user.longestStreak || 0),
        Number(req.user.streakCount || 0)
      );
      req.user.lastStreakDate = new Date();
    }
  }

  applyPlanFlowState(plan);

  const planCompleted = plan.days.every((day) => day.status === "completed");

  if (planCompleted && plan.active) {
    plan.active = false;
    planBonusPoints = 250;
    req.user.points += planBonusPoints;
  }

  const newBadges = syncBadges(req.user);

  await req.user.save();
  await plan.save();

  await RewardLedger.create({
    user: req.user._id,
    type: "earn",
    points: basePointsEarned,
    title: "Task completed",
    description: `Completed: ${targetTask.title}`,
  });

  if (dayBonusPoints > 0) {
    await RewardLedger.create({
      user: req.user._id,
      type: "earn",
      points: dayBonusPoints,
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
  }

  if (planBonusPoints > 0) {
    await RewardLedger.create({
      user: req.user._id,
      type: "earn",
      points: planBonusPoints,
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

  const levelProgress = getLevelProgressFromPoints(req.user.points || 0);

  res.json({
    success: true,
    message: "Task completed successfully.",
    plan: enrichPlan(plan),
    user: {
      ...serializeUser(req.user),
      level: levelProgress.level,
      nextLevel: levelProgress.nextLevel,
      progressPct: levelProgress.progressPct,
      pointsToNextLevel: levelProgress.pointsToNextLevel,
    },
    completion: {
      taskTitle: targetTask.title,
      taskType: targetTask.type || "habit",
      basePointsEarned,
      dayBonusPoints,
      planBonusPoints,
      totalPointsEarned:
        basePointsEarned + dayBonusPoints + planBonusPoints,
      dayCompleted,
      planCompleted,
      completedDayNumber: dayCompleted ? targetDay.dayNumber : null,
    },
    newBadges,
  });
});