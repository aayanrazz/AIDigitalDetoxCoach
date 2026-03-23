import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import { analyzeDailyUsage } from "../services/behavior.service.js";

function normalizeSession(userId, session) {
  const startTime = new Date(session.startTime);
  const endTime = new Date(session.endTime);

  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new ApiError(400, "Invalid startTime or endTime in session payload.");
  }

  if (!session.appName || !session.appPackage) {
    throw new ApiError(400, "Each session must include appName and appPackage.");
  }

  const durationMinutes = Math.max(0, Number(session.durationMinutes || 0));
  const pickups = Math.max(0, Number(session.pickups || 0));
  const unlocks = Math.max(0, Number(session.unlocks || 0));
  const dayKey = session.dayKey || formatDayKey(startTime);

  return {
    user: userId,
    appName: String(session.appName).trim(),
    appPackage: String(session.appPackage).trim(),
    category: String(session.category || "Other").trim(),
    durationMinutes,
    pickups,
    unlocks,
    startTime,
    endTime,
    platform: session.platform || "android",
    source: session.source || "native_bridge",
    dayKey,
    hourBucket: startTime.getHours(),
  };
}

async function ensureUserSettings(userId) {
  let settings = await UserSettings.findOne({ user: userId });

  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }

  return settings;
}

export const ingestUsage = asyncHandler(async (req, res) => {
  const { sessions } = req.body;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new ApiError(400, "sessions array is required.");
  }

  const normalized = sessions.map((session) =>
    normalizeSession(req.user._id, session)
  );

  const operations = normalized.map((session) => ({
    updateOne: {
      filter: {
        user: req.user._id,
        dayKey: session.dayKey,
        appPackage: session.appPackage,
        source: session.source,
      },
      update: {
        $set: session,
      },
      upsert: true,
    },
  }));

  if (operations.length > 0) {
    await UsageSession.bulkWrite(operations, { ordered: false });
  }

  const todayKey = formatDayKey();

  const todaySessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  }).sort({ durationMinutes: -1 });

  const settings = await ensureUserSettings(req.user._id);
  const analysis = analyzeDailyUsage({ sessions: todaySessions, settings });

  await AiInsight.findOneAndUpdate(
    { user: req.user._id, dayKey: todayKey },
    {
      user: req.user._id,
      dayKey: todayKey,
      score: analysis.score,
      riskLevel: analysis.riskLevel,
      totalScreenMinutes: analysis.totalScreenMinutes,
      pickups: analysis.pickups,
      unlocks: analysis.unlocks,
      lateNightMinutes: analysis.lateNightMinutes,
      reasons: analysis.reasons,
      recommendations: analysis.recommendations,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  req.user.detoxScore = analysis.score;
  await req.user.save();

  for (const item of analysis.notifications) {
    const exists = await Notification.findOne({
      user: req.user._id,
      title: item.title,
      isRead: false,
    });

    if (!exists) {
      await Notification.create({
        user: req.user._id,
        type: item.type,
        title: item.title,
        body: item.body,
        cta: item.cta,
      });
    }
  }

  res.status(201).json({
    success: true,
    message: "Usage sessions synced successfully.",
    syncedCount: normalized.length,
    analysis,
    topApps: todaySessions.slice(0, 5),
  });
});

export const getTodayUsage = asyncHandler(async (req, res) => {
  const todayKey = formatDayKey();

  const sessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  }).sort({ durationMinutes: -1 });

  const aiInsight = await AiInsight.findOne({
    user: req.user._id,
    dayKey: todayKey,
  });

  res.json({
    success: true,
    dayKey: todayKey,
    sessions,
    aiInsight,
  });
});