import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import AppLimit from "../models/AppLimit.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import {
  analyzeDailyUsage,
  evaluateAppLimits,
} from "../services/behavior.service.js";

function normalizeSession(userId, session) {
  const rawStart = session?.startTime ? new Date(session.startTime) : new Date();
  const startTime = Number.isNaN(rawStart.getTime()) ? new Date() : rawStart;

  const safeDurationMinutes = Math.max(0, Number(session?.durationMinutes || 0));

  const rawEnd = session?.endTime ? new Date(session.endTime) : new Date(startTime);
  let endTime = Number.isNaN(rawEnd.getTime()) ? new Date(startTime) : rawEnd;

  if (endTime <= startTime) {
    endTime = new Date(startTime.getTime() + Math.max(1, safeDurationMinutes) * 60_000);
  }

  const appName = String(session?.appName || "").trim();
  const appPackage = String(session?.appPackage || "").trim();

  if (!appName || !appPackage) {
    throw new ApiError(400, "Each session must include appName and appPackage.");
  }

  const pickups = Math.max(0, Number(session?.pickups || 0));
  const unlocks = Math.max(0, Number(session?.unlocks || 0));
  const dayKey = session?.dayKey || formatDayKey(startTime);

  return {
    user: userId,
    appName,
    appPackage,
    category: String(session?.category || "Other").trim() || "Other",
    durationMinutes: safeDurationMinutes,
    pickups,
    unlocks,
    startTime,
    endTime,
    platform: session?.platform || "android",
    source: session?.source || "native_bridge",
    dayKey,
    hourBucket: startTime.getHours(),
  };
}

function mapAppsPayloadToSessions(userId, apps = []) {
  const now = Date.now();

  return apps
    .map((app, index) => {
      const packageName = String(app?.packageName || app?.appPackage || "").trim();
      const appName = String(app?.appName || packageName).trim();

      const minutes = Math.max(
        0,
        Number(
          app?.minutesUsed ??
            Math.round(Number(app?.foregroundMs || 0) / 60000) ??
            0
        )
      );

      const endTime = new Date(now - index * 1000).toISOString();
      const startTime = new Date(
        now - index * 1000 - Math.max(1, minutes) * 60_000
      ).toISOString();

      return normalizeSession(userId, {
        appName,
        appPackage: packageName,
        category: String(app?.category || "Other").trim() || "Other",
        durationMinutes: minutes,
        pickups: Number(app?.pickups || 0),
        unlocks: Number(app?.unlocks || 0),
        startTime,
        endTime,
        platform: "android",
        source: "native_bridge",
      });
    })
    .filter((session) => session.appPackage && session.durationMinutes >= 0);
}

function serializeUsageSession(session) {
  return {
    appName: session.appName,
    appPackage: session.appPackage,
    category: session.category || "Other",
    durationMinutes: Number(session.durationMinutes || 0),
    pickups: Number(session.pickups || 0),
    unlocks: Number(session.unlocks || 0),
    startTime: session.startTime,
    endTime: session.endTime,
    platform: session.platform,
    source: session.source,
    dayKey: session.dayKey,
  };
}

async function ensureUserSettings(userId) {
  let settings = await UserSettings.findOne({ user: userId });

  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }

  return settings;
}

async function createUnreadNotificationIfNeeded(userId, item) {
  const exists = await Notification.findOne({
    user: userId,
    title: item.title,
    isRead: false,
  });

  if (!exists) {
    await Notification.create({
      user: userId,
      type: item.type,
      title: item.title,
      body: item.body,
      cta: item.cta,
    });
  }
}

function buildTodayUsagePayload({
  todayKey,
  todaySessions,
  analysis,
  aiInsight,
  appLimitSummary,
}) {
  return {
    dayKey: todayKey,
    totalMinutes: Number(analysis.totalScreenMinutes || 0),
    focusScore: Number(analysis.score || 0),
    riskLevel: analysis.riskLevel || aiInsight?.riskLevel || "low",
    sessions: todaySessions.map((session) => serializeUsageSession(session)),
    topApps: todaySessions.slice(0, 5).map((session) => serializeUsageSession(session)),
    appLimitSummary: {
      monitoredApps: appLimitSummary.monitoredApps || [],
      exceededApps: appLimitSummary.exceededApps || [],
      exceededCount: Number(appLimitSummary.exceededCount || 0),
      topExceededApp: appLimitSummary.topExceededApp || null,
    },
    aiInsight,
  };
}

export const ingestUsage = asyncHandler(async (req, res) => {
  const sessionsPayload = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  const appsPayload = Array.isArray(req.body?.apps) ? req.body.apps : [];

  if (sessionsPayload.length === 0 && appsPayload.length === 0) {
    throw new ApiError(400, "sessions or apps array is required.");
  }

  const normalized = sessionsPayload.length
    ? sessionsPayload.map((session) => normalizeSession(req.user._id, session))
    : mapAppsPayloadToSessions(req.user._id, appsPayload);

  if (normalized.length === 0) {
    throw new ApiError(400, "No valid usage data was provided.");
  }

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
  }).sort({ durationMinutes: -1, appName: 1 });

  const settings = await ensureUserSettings(req.user._id);

  const analysis = analyzeDailyUsage({
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

  const aiInsight = await AiInsight.findOneAndUpdate(
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
      reasons: [
        ...analysis.reasons,
        ...appLimitSummary.exceededApps.map(
          (item) =>
            `${item.appName} exceeded its daily limit by ${item.exceededMinutes} minutes.`
        ),
      ],
      recommendations: [
        ...analysis.recommendations,
        ...appLimitSummary.exceededApps.map(
          (item) =>
            `Reduce ${item.appName} by at least ${Math.min(
              item.exceededMinutes,
              20
            )} minutes tomorrow.`
        ),
      ],
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  req.user.detoxScore = analysis.score;
  await req.user.save();

  const allNotifications = [
    ...analysis.notifications,
    ...appLimitSummary.notifications,
  ];

  for (const item of allNotifications) {
    await createUnreadNotificationIfNeeded(req.user._id, item);
  }

  const todayUsage = buildTodayUsagePayload({
    todayKey,
    todaySessions,
    analysis,
    aiInsight,
    appLimitSummary,
  });

  res.status(201).json({
    success: true,
    message: "Usage sessions synced successfully.",
    syncedCount: normalized.length,
    analysis: {
      score: analysis.score,
      riskLevel: analysis.riskLevel,
      totalScreenMinutes: analysis.totalScreenMinutes,
      pickups: analysis.pickups,
      unlocks: analysis.unlocks,
      lateNightMinutes: analysis.lateNightMinutes,
      reasons: analysis.reasons,
      recommendations: aiInsight?.recommendations || analysis.recommendations,
    },
    appLimitSummary: todayUsage.appLimitSummary,
    topApps: todayUsage.topApps,
    sessions: todayUsage.sessions,
    todayUsage,
  });
});

export const getTodayUsage = asyncHandler(async (req, res) => {
  const todayKey = formatDayKey();

  const sessions = await UsageSession.find({
    user: req.user._id,
    dayKey: todayKey,
  }).sort({ durationMinutes: -1, appName: 1 });

  const settings = await ensureUserSettings(req.user._id);

  const analysis = analyzeDailyUsage({
    sessions,
    settings,
  });

  const aiInsight = await AiInsight.findOne({
    user: req.user._id,
    dayKey: todayKey,
  });

  const appLimits = await AppLimit.find({ user: req.user._id }).sort({
    dailyLimitMinutes: 1,
    appName: 1,
  });

  const appLimitSummary = evaluateAppLimits({
    sessions,
    appLimits,
    limitWarningsEnabled: settings?.notificationSettings?.limitWarnings !== false,
  });

  const todayUsage = buildTodayUsagePayload({
    todayKey,
    todaySessions: sessions,
    analysis,
    aiInsight,
    appLimitSummary,
  });

  res.json({
    success: true,
    dayKey: todayKey,
    sessions: todayUsage.sessions,
    appLimitSummary: todayUsage.appLimitSummary,
    totalMinutes: todayUsage.totalMinutes,
    aiInsight: aiInsight || {
      score: todayUsage.focusScore,
      riskLevel: todayUsage.riskLevel,
      totalScreenMinutes: todayUsage.totalMinutes,
      recommendations: analysis.recommendations,
    },
    todayUsage,
  });
});