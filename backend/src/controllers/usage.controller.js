import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import { analyzeDailyUsage } from "../services/behavior.service.js";

export const ingestUsage = asyncHandler(async (req, res) => {
  const { sessions } = req.body;

  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new ApiError(400, "sessions array is required.");
  }

  const prepared = sessions.map((session) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);

    return {
      user: req.user._id,
      appName: session.appName,
      appPackage: session.appPackage,
      category: session.category || "Other",
      durationMinutes: Number(session.durationMinutes || 0),
      pickups: Number(session.pickups || 0),
      unlocks: Number(session.unlocks || 0),
      startTime,
      endTime,
      platform: session.platform || "android",
      source: session.source || "native_bridge",
      dayKey: formatDayKey(startTime),
      hourBucket: startTime.getHours(),
    };
  });

  await UsageSession.insertMany(prepared);

  const todayKey = formatDayKey();
  const todaySessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  });

  const settings = await UserSettings.findOne({ user: req.user._id });
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
    message: "Usage sessions ingested successfully.",
    createdCount: prepared.length,
    analysis,
  });
});

export const getTodayUsage = asyncHandler(async (req, res) => {
  const todayKey = formatDayKey();

  const sessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  }).sort({ startTime: -1 });

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