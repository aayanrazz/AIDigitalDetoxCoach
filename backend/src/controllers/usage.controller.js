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
import {
  filterUsageSessions,
  normalizeUsageSession,
  normalizeUsageCategory,
  getSessionDurationMinutes,
  toSafeNumber,
} from "../utils/usageSessionFilters.js";

function normalizeSession(userId, session) {
  const rawStart = session?.startTime ? new Date(session.startTime) : new Date();
  const startTime = Number.isNaN(rawStart.getTime()) ? new Date() : rawStart;

  const safeDurationMinutes = Math.max(0, getSessionDurationMinutes(session));

  const rawEnd = session?.endTime ? new Date(session.endTime) : new Date(startTime);
  let endTime = Number.isNaN(rawEnd.getTime()) ? new Date(startTime) : rawEnd;

  if (endTime <= startTime) {
    endTime = new Date(
      startTime.getTime() + Math.max(1, safeDurationMinutes) * 60_000
    );
  }

  const appPackage = String(session?.appPackage || session?.packageName || "").trim();

  if (!appPackage) {
    throw new ApiError(400, "Each session must include appPackage.");
  }

  const pickups = Math.max(0, toSafeNumber(session?.pickups, 0));
  const unlocks = Math.max(0, toSafeNumber(session?.unlocks, 0));
  const dayKey = session?.dayKey || formatDayKey(startTime);

  return normalizeUsageSession({
    user: userId,
    appName: String(session?.appName || "").trim(),
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
    hourBucket:
      session?.hourBucket !== undefined
        ? toSafeNumber(session.hourBucket, startTime.getHours())
        : startTime.getHours(),
  });
}

function mapAppsPayloadToSessions(userId, apps = []) {
  const now = Date.now();

  return apps.map((app, index) => {
    const packageName = String(app?.packageName || app?.appPackage || "").trim();

    const durationMinutes = Math.max(0, getSessionDurationMinutes(app));

    const fallbackEnd = new Date(now - index * 1000);
    const endTime = app?.lastTimeUsed
      ? new Date(toSafeNumber(app.lastTimeUsed, fallbackEnd.getTime())).toISOString()
      : fallbackEnd.toISOString();

    const startTime = new Date(
      new Date(endTime).getTime() - Math.max(1, durationMinutes) * 60_000
    ).toISOString();

    return normalizeSession(userId, {
      appName: String(app?.appName || "").trim(),
      appPackage: packageName,
      category: String(app?.category || "Other").trim() || "Other",
      durationMinutes,
      pickups: toSafeNumber(app?.pickups, 0),
      unlocks: toSafeNumber(app?.unlocks, 0),
      startTime,
      endTime,
      platform: "android",
      source: "native_bridge",
    });
  });
}

function sanitizeUsageSessions(sessions = []) {
  return filterUsageSessions(sessions)
    .map((session) => ({
      ...session,
      category: normalizeUsageCategory(session?.category || "Other"),
      durationMinutes: Math.max(0, getSessionDurationMinutes(session)),
      pickups: Math.max(0, toSafeNumber(session?.pickups, 0)),
      unlocks: Math.max(0, toSafeNumber(session?.unlocks, 0)),
    }))
    .sort((a, b) => {
      const durationDiff = getSessionDurationMinutes(b) - getSessionDurationMinutes(a);

      if (durationDiff !== 0) return durationDiff;

      return String(a?.appName || "").localeCompare(String(b?.appName || ""));
    });
}

function serializeUsageSession(session) {
  return {
    appName: String(session?.appName || "").trim(),
    appPackage: String(session?.appPackage || "").trim(),
    category: normalizeUsageCategory(session?.category || "Other"),
    durationMinutes: Math.max(0, getSessionDurationMinutes(session)),
    pickups: Math.max(0, toSafeNumber(session?.pickups, 0)),
    unlocks: Math.max(0, toSafeNumber(session?.unlocks, 0)),
    startTime: session?.startTime,
    endTime: session?.endTime,
    platform: session?.platform,
    source: session?.source,
    dayKey: session?.dayKey,
  };
}

async function ensureUserSettings(userId) {
  let settings = await UserSettings.findOne({ user: userId });

  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }

  return settings;
}

async function createUnreadNotificationsIfNeeded(userId, items = []) {
  if (!items.length) return;

  const uniqueItems = [];
  const seenKeys = new Set();

  for (const item of items) {
    const title = String(item?.title || "").trim();
    const body = String(item?.body || "").trim();
    const type = String(item?.type || "summary").trim();

    if (!title || !body) continue;

    const key = `${type}__${title}`;
    if (seenKeys.has(key)) continue;

    seenKeys.add(key);
    uniqueItems.push({
      type,
      title,
      body,
      cta: item?.cta,
    });
  }

  if (!uniqueItems.length) return;

  const existingUnread = await Notification.find({
    user: userId,
    isRead: false,
    title: { $in: uniqueItems.map((item) => item.title) },
  })
    .select("title type")
    .lean();

  const existingKeys = new Set(
    existingUnread.map((item) => `${item.type}__${item.title}`)
  );

  const docsToInsert = uniqueItems
    .filter((item) => !existingKeys.has(`${item.type}__${item.title}`))
    .map((item) => ({
      user: userId,
      type: item.type,
      title: item.title,
      body: item.body,
      cta: item.cta,
    }));

  if (docsToInsert.length) {
    await Notification.insertMany(docsToInsert, { ordered: false });
  }
}

function buildTodayUsagePayload({
  todayKey,
  todaySessions,
  analysis,
  aiInsight,
  appLimitSummary,
}) {
  const serializedSessions = todaySessions.map((session) =>
    serializeUsageSession(session)
  );

  const exceededApps = Array.isArray(appLimitSummary?.exceededApps)
    ? appLimitSummary.exceededApps
    : [];

  const monitoredApps = Array.isArray(appLimitSummary?.monitoredApps)
    ? appLimitSummary.monitoredApps
    : [];

  return {
    dayKey: todayKey,
    totalMinutes: Number(analysis?.totalScreenMinutes || 0),
    focusScore: Number(analysis?.score || 0),
    riskLevel: analysis?.riskLevel || aiInsight?.riskLevel || "low",
    sessions: serializedSessions,
    topApps: serializedSessions.slice(0, 5),
    appLimitSummary: {
      monitoredApps,
      exceededApps,
      exceededCount: Number(appLimitSummary?.exceededCount || 0),
      topExceededApp: appLimitSummary?.topExceededApp || null,
    },
    aiInsight,
  };
}

export const ingestUsage = asyncHandler(async (req, res) => {
  const sessionsPayload = Array.isArray(req.body?.sessions)
    ? req.body.sessions
    : [];
  const appsPayload = Array.isArray(req.body?.apps) ? req.body.apps : [];

  if (sessionsPayload.length === 0 && appsPayload.length === 0) {
    throw new ApiError(400, "sessions or apps array is required.");
  }

  const mappedSessions = sessionsPayload.length
    ? sessionsPayload.map((session) => normalizeSession(req.user._id, session))
    : mapAppsPayloadToSessions(req.user._id, appsPayload);

  const normalized = sanitizeUsageSessions(mappedSessions);

  if (normalized.length === 0) {
    throw new ApiError(
      400,
      "No valid user-facing usage data was provided after filtering."
    );
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

  const [todaySessionsRaw, settings, appLimits] = await Promise.all([
    UsageSession.find({
      user: req.user._id,
      dayKey: todayKey,
    })
      .sort({ durationMinutes: -1, appName: 1 })
      .lean(),
    ensureUserSettings(req.user._id),
    AppLimit.find({ user: req.user._id })
      .sort({
        dailyLimitMinutes: 1,
        appName: 1,
      })
      .lean(),
  ]);

  const todaySessions = sanitizeUsageSessions(todaySessionsRaw);

  const analysis = analyzeDailyUsage({
    sessions: todaySessions,
    settings,
  });

  const appLimitSummary = evaluateAppLimits({
    sessions: todaySessions,
    appLimits,
    limitWarningsEnabled: settings?.notificationSettings?.limitWarnings !== false,
  });

  const exceededApps = Array.isArray(appLimitSummary?.exceededApps)
    ? appLimitSummary.exceededApps
    : [];

  const aiInsight = await AiInsight.findOneAndUpdate(
    { user: req.user._id, dayKey: todayKey },
    {
      $set: {
        user: req.user._id,
        dayKey: todayKey,
        score: Number(analysis?.score || 0),
        riskLevel: analysis?.riskLevel || "low",
        totalScreenMinutes: Number(analysis?.totalScreenMinutes || 0),
        pickups: Number(analysis?.pickups || 0),
        unlocks: Number(analysis?.unlocks || 0),
        lateNightMinutes: Number(analysis?.lateNightMinutes || 0),
        reasons: [
          ...(Array.isArray(analysis?.reasons) ? analysis.reasons : []),
          ...exceededApps.map(
            (item) =>
              `${item.appName} exceeded its daily limit by ${item.exceededMinutes} minutes.`
          ),
        ],
        recommendations: [
          ...(Array.isArray(analysis?.recommendations)
            ? analysis.recommendations
            : []),
          ...exceededApps.map(
            (item) =>
              `Reduce ${item.appName} by at least ${Math.min(
                Number(item?.exceededMinutes || 0),
                20
              )} minutes tomorrow.`
          ),
        ],
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  req.user.detoxScore = Number(analysis?.score || 0);
  await req.user.save();

  const allNotifications = [
    ...(Array.isArray(analysis?.notifications) ? analysis.notifications : []),
    ...(Array.isArray(appLimitSummary?.notifications)
      ? appLimitSummary.notifications
      : []),
  ];

  await createUnreadNotificationsIfNeeded(req.user._id, allNotifications);

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
      score: Number(analysis?.score || 0),
      riskLevel: analysis?.riskLevel || "low",
      totalScreenMinutes: Number(analysis?.totalScreenMinutes || 0),
      pickups: Number(analysis?.pickups || 0),
      unlocks: Number(analysis?.unlocks || 0),
      lateNightMinutes: Number(analysis?.lateNightMinutes || 0),
      reasons: Array.isArray(analysis?.reasons) ? analysis.reasons : [],
      recommendations:
        aiInsight?.recommendations ||
        (Array.isArray(analysis?.recommendations)
          ? analysis.recommendations
          : []),
    },
    appLimitSummary: todayUsage.appLimitSummary,
    topApps: todayUsage.topApps,
    sessions: todayUsage.sessions,
    todayUsage,
  });
});

export const getTodayUsage = asyncHandler(async (req, res) => {
  const todayKey = formatDayKey();

  const [sessionsRaw, settings, aiInsight, appLimits] = await Promise.all([
    UsageSession.find({
      user: req.user._id,
      dayKey: todayKey,
    })
      .sort({ durationMinutes: -1, appName: 1 })
      .lean(),
    ensureUserSettings(req.user._id),
    AiInsight.findOne({
      user: req.user._id,
      dayKey: todayKey,
    }).lean(),
    AppLimit.find({ user: req.user._id })
      .sort({
        dailyLimitMinutes: 1,
        appName: 1,
      })
      .lean(),
  ]);

  const sessions = sanitizeUsageSessions(sessionsRaw);

  const analysis = analyzeDailyUsage({
    sessions,
    settings,
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
      recommendations: Array.isArray(analysis?.recommendations)
        ? analysis.recommendations
        : [],
    },
    todayUsage,
  });
});