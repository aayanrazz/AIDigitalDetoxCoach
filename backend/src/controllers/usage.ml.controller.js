import UsageSession from "../models/UsageSession.js";
import UserSettings from "../models/UserSettings.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import { buildMlFeaturesForDay } from "../services/ml/featureBuilder.js";
import { buildMlInsight } from "../services/ml/ml.service.js";
import { buildNotificationMlFeaturesForDay } from "../services/ml/notificationFeatureBuilder.js";
import { buildNotificationInsight } from "../services/ml/notificationMl.service.js";
import {
  isIgnoredUsageEntry,
  normalizeUsageSession,
  normalizeUsageCategory,
} from "../utils/usageSessionFilters.js";

const NOTIFICATION_DEDUPE_MINUTES = 20;
const DEBUG_ML_INGEST = process.env.DEBUG_ML_INGEST === "true";

const debugLog = (...args) => {
  if (DEBUG_ML_INGEST) {
    console.log(...args);
  }
};

const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSafeDate = (value, fallback = new Date()) => {
  const parsed = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
};

const resolveBestScore = (mlInsight, dailyAnalysis) => {
  const mlScore = toSafeNumber(mlInsight?.score, NaN);
  if (Number.isFinite(mlScore)) {
    return mlScore;
  }

  return toSafeNumber(dailyAnalysis?.score, 0);
};

const createMlNotification = async ({
  userId,
  title,
  body,
  type = "summary",
  cta = null,
  metadata = {},
}) => {
  const recentThreshold = new Date(
    Date.now() - NOTIFICATION_DEDUPE_MINUTES * 60 * 1000
  );

  const existingRecent = await Notification.findOne({
    user: userId,
    type,
    title,
    "metadata.generatedBy": "notification_ml",
    createdAt: { $gte: recentThreshold },
  }).lean();

  if (existingRecent) {
    return {
      _id: existingRecent._id,
      skippedDuplicate: true,
    };
  }

  const created = await Notification.create({
    user: userId,
    type,
    title,
    body,
    ...(cta ? { cta } : {}),
    metadata,
  });

  return created;
};

const mapAppsPayloadToSessions = (apps = []) => {
  const now = Date.now();

  return apps.map((app, index) => {
    const durationMinutes = Math.max(
      0,
      toSafeNumber(
        app?.durationMinutes ??
          app?.minutesUsed ??
          (app?.foregroundMs !== undefined
            ? Math.round(toSafeNumber(app.foregroundMs, 0) / 60000)
            : 0),
        0
      )
    );

    const fallbackEnd = new Date(now - index * 1000);
    const endTime = app?.lastTimeUsed
      ? toSafeDate(app.lastTimeUsed, fallbackEnd)
      : fallbackEnd;

    const safeDurationForClock = Math.max(1, durationMinutes);
    const startTime = new Date(
      endTime.getTime() - safeDurationForClock * 60_000
    );

    return {
      appName: String(app?.appName || "").trim(),
      appPackage: String(app?.packageName || app?.appPackage || "").trim(),
      category: String(app?.category || "Other").trim() || "Other",
      durationMinutes,
      pickups: Math.max(0, toSafeNumber(app?.pickups, 0)),
      unlocks: Math.max(0, toSafeNumber(app?.unlocks, 0)),
      startTime,
      endTime,
      platform: "android",
      source: "native_bridge",
      hourBucket: startTime.getHours(),
    };
  });
};

const sanitizeIncomingSession = ({ item = {}, userId }) => {
  const appPackage = String(
    item?.appPackage || item?.packageName || ""
  ).trim();

  if (!appPackage) {
    return null;
  }

  const rawStart = toSafeDate(item?.startTime, new Date());

  const durationMinutes = Math.max(
    0,
    toSafeNumber(
      item?.durationMinutes ??
        item?.minutesUsed ??
        (item?.foregroundMs !== undefined
          ? Math.round(toSafeNumber(item.foregroundMs, 0) / 60000)
          : 0),
      0
    )
  );

  const rawEnd = item?.endTime
    ? toSafeDate(item.endTime, rawStart)
    : new Date(rawStart.getTime() + Math.max(1, durationMinutes) * 60_000);

  const endTime =
    rawEnd <= rawStart
      ? new Date(rawStart.getTime() + Math.max(1, durationMinutes) * 60_000)
      : rawEnd;

  const baseSession = normalizeUsageSession({
    user: userId,
    dayKey: item?.dayKey || formatDayKey(rawStart),
    appName: String(item?.appName || "").trim(),
    appPackage,
    category: String(item?.category || "Other").trim() || "Other",
    durationMinutes,
    pickups: Math.max(0, toSafeNumber(item?.pickups, 0)),
    unlocks: Math.max(0, toSafeNumber(item?.unlocks, 0)),
    startTime: rawStart,
    endTime,
    hourBucket:
      item?.hourBucket !== undefined
        ? Math.max(0, toSafeNumber(item.hourBucket, rawStart.getHours()))
        : rawStart.getHours(),
    source: String(item?.source || "native_bridge").trim() || "native_bridge",
    platform: String(item?.platform || "android").trim() || "android",
  });

  if (
    isIgnoredUsageEntry({
      appPackage: baseSession.appPackage,
      appName: baseSession.appName,
    })
  ) {
    return null;
  }

  return {
    ...baseSession,
    durationMinutes,
    pickups: Math.max(0, toSafeNumber(baseSession.pickups, 0)),
    unlocks: Math.max(0, toSafeNumber(baseSession.unlocks, 0)),
    category: normalizeUsageCategory(baseSession.category || "Other"),
    startTime: rawStart,
    endTime,
  };
};

const normalizeAndMergeSessions = ({ payloadSessions = [], userId }) => {
  const merged = new Map();

  for (const item of payloadSessions) {
    const incoming = sanitizeIncomingSession({ item, userId });

    if (!incoming) continue;

    const key = `${String(userId)}__${incoming.dayKey}__${incoming.appPackage}__${incoming.source}`;

    if (!merged.has(key)) {
      merged.set(key, incoming);
      continue;
    }

    const existing = merged.get(key);

    existing.durationMinutes += Math.max(0, toSafeNumber(incoming.durationMinutes, 0));
    existing.pickups += Math.max(0, toSafeNumber(incoming.pickups, 0));
    existing.unlocks += Math.max(0, toSafeNumber(incoming.unlocks, 0));

    if (incoming.startTime < existing.startTime) {
      existing.startTime = incoming.startTime;
    }

    if (incoming.endTime > existing.endTime) {
      existing.endTime = incoming.endTime;
    }

    if (toSafeNumber(incoming.hourBucket, 23) < toSafeNumber(existing.hourBucket, 23)) {
      existing.hourBucket = toSafeNumber(incoming.hourBucket, 0);
    }

    const existingName = String(existing.appName || "").trim();
    const incomingName = String(incoming.appName || "").trim();

    if (!existingName || existingName === existing.appPackage) {
      existing.appName = incomingName || existingName;
    }

    if (
      (!existing.category || existing.category === "Other") &&
      incoming.category
    ) {
      existing.category = incoming.category;
    }

    merged.set(key, existing);
  }

  return Array.from(merged.values()).sort((a, b) => {
    const durationDiff =
      toSafeNumber(b?.durationMinutes, 0) - toSafeNumber(a?.durationMinutes, 0);

    if (durationDiff !== 0) return durationDiff;

    return String(a?.appName || "").localeCompare(String(b?.appName || ""));
  });
};

const upsertUsageSessions = async ({ sessions = [], userId }) => {
  if (!sessions.length) return;

  const operations = sessions.map((session) => ({
    updateOne: {
      filter: {
        user: userId,
        dayKey: session.dayKey,
        appPackage: session.appPackage,
        source: session.source,
      },
      update: {
        $set: {
          user: userId,
          dayKey: session.dayKey,
          appName: session.appName,
          appPackage: session.appPackage,
          category: session.category,
          durationMinutes: Math.max(0, toSafeNumber(session.durationMinutes, 0)),
          pickups: Math.max(0, toSafeNumber(session.pickups, 0)),
          unlocks: Math.max(0, toSafeNumber(session.unlocks, 0)),
          startTime: session.startTime,
          endTime: session.endTime,
          hourBucket: toSafeNumber(session.hourBucket, 0),
          source: session.source,
          platform: session.platform || "android",
        },
      },
      upsert: true,
    },
  }));

  await UsageSession.bulkWrite(operations, { ordered: false });
};

const applyNotificationSafeguards = ({
  notificationPrediction,
  riskLevel,
  settings,
  featureRow,
}) => {
  const dailyLimitMinutes = toSafeNumber(settings?.dailyLimitMinutes, 180);
  const totalScreenMinutes = toSafeNumber(featureRow?.totalScreenMinutes, 0);
  const overLimitMinutes = toSafeNumber(
    featureRow?.overLimitMinutes,
    Math.max(0, totalScreenMinutes - dailyLimitMinutes)
  );
  const lateNightMinutes = toSafeNumber(featureRow?.lateNightMinutes, 0);

  const ruleLimitWarning =
    overLimitMinutes >= 10 ||
    (riskLevel === "high" && totalScreenMinutes >= dailyLimitMinutes);

  const ruleSleepNudge = lateNightMinutes >= 15;

  const sendLimitWarning = Boolean(
    notificationPrediction?.sendLimitWarning || ruleLimitWarning
  );

  const sendSleepNudge = Boolean(
    notificationPrediction?.sendSleepNudge || ruleSleepNudge
  );

  const dominantNotificationType =
    sendLimitWarning && sendSleepNudge
      ? "both"
      : sendLimitWarning
      ? "limit_warning"
      : sendSleepNudge
      ? "sleep"
      : "none";

  return {
    ...notificationPrediction,
    dominantNotificationType,
    sendLimitWarning,
    sendSleepNudge,
    safeguardApplied:
      (!notificationPrediction?.sendLimitWarning && sendLimitWarning) ||
      (!notificationPrediction?.sendSleepNudge && sendSleepNudge),
    source: notificationPrediction?.source || "tensorflow",
    fallbackUsed: Boolean(notificationPrediction?.fallbackUsed),
    confidence: toSafeNumber(notificationPrediction?.confidence, 0),
    classProbabilities: notificationPrediction?.classProbabilities || {},
    errorMessage: notificationPrediction?.errorMessage || "",
  };
};

const createNotificationsFromMlPrediction = async ({
  userId,
  notificationPrediction,
  settings,
  featureRow,
}) => {
  const created = [];

  const bedTime = settings?.sleepSchedule?.bedTime || "23:00";
  const dailyLimitMinutes = toSafeNumber(settings?.dailyLimitMinutes, 180);
  const totalScreenMinutes = toSafeNumber(featureRow?.totalScreenMinutes, 0);
  const overLimitMinutes = toSafeNumber(featureRow?.overLimitMinutes, 0);
  const lateNightMinutes = toSafeNumber(featureRow?.lateNightMinutes, 0);

  if (notificationPrediction.sendLimitWarning) {
    const title = "Usage limit warning";
    const body =
      overLimitMinutes > 0
        ? `You are ${overLimitMinutes} minutes over your ${dailyLimitMinutes}-minute daily limit. Take a short break now.`
        : `You are approaching your ${dailyLimitMinutes}-minute daily limit. Stay mindful of your screen time.`;

    const notification = await createMlNotification({
      userId,
      title,
      body,
      type: "limit_warning",
      cta: {
        label: "VIEW PLAN",
        action: "open_detox_plan",
      },
      metadata: {
        generatedBy: "notification_ml",
        dominantNotificationType:
          notificationPrediction.dominantNotificationType,
        predictionSource: notificationPrediction.source,
        safeguardApplied: Boolean(notificationPrediction.safeguardApplied),
        totalScreenMinutes,
        dailyLimitMinutes,
        overLimitMinutes,
      },
    });

    created.push({
      id: notification._id,
      title,
      kind: "limit_warning",
      skippedDuplicate: Boolean(notification.skippedDuplicate),
    });
  }

  if (notificationPrediction.sendSleepNudge) {
    const title = "Sleep protection reminder";
    const body =
      lateNightMinutes > 0
        ? `Late-night usage is ${lateNightMinutes} minutes today. Start winding down before ${bedTime}.`
        : `Your bedtime target is ${bedTime}. Start winding down and avoid more screen time tonight.`;

    const notification = await createMlNotification({
      userId,
      title,
      body,
      type: "summary",
      cta: {
        label: "VIEW PLAN",
        action: "open_detox_plan",
      },
      metadata: {
        generatedBy: "notification_ml",
        dominantNotificationType:
          notificationPrediction.dominantNotificationType,
        predictionSource: notificationPrediction.source,
        safeguardApplied: Boolean(notificationPrediction.safeguardApplied),
        bedTime,
        lateNightMinutes,
      },
    });

    created.push({
      id: notification._id,
      title,
      kind: "sleep",
      skippedDuplicate: Boolean(notification.skippedDuplicate),
    });
  }

  return created;
};

const getAnalysisDate = (normalizedSessions = []) => {
  if (!normalizedSessions.length) {
    return new Date();
  }

  return normalizedSessions.reduce((latest, session) => {
    const sessionDate = toSafeDate(session.startTime, new Date());
    return sessionDate > latest ? sessionDate : latest;
  }, toSafeDate(normalizedSessions[0]?.startTime, new Date()));
};

const getPrivacySyncState = async (userId) => {
  const settings = await UserSettings.findOne({ user: userId })
    .select("privacySettings")
    .lean();

  const privacySettings = settings?.privacySettings || {};

  const consentGiven = Boolean(privacySettings.consentGiven);
  const dataCollection = Boolean(privacySettings.dataCollection);

  return {
    settingsFound: Boolean(settings),
    consentGiven,
    dataCollection,
    anonymizeData:
      privacySettings.anonymizeData !== undefined
        ? Boolean(privacySettings.anonymizeData)
        : true,
    allowAnalyticsForTraining: Boolean(
      privacySettings.allowAnalyticsForTraining
    ),
    retentionDays: Number(privacySettings.retentionDays || 30),
    allowServerSync: consentGiven && dataCollection,
  };
};

const buildPrivacyBlockedResponse = ({ payloadCount, privacy }) => ({
  success: true,
  message:
    "Usage sync skipped because privacy consent or data collection is disabled.",
  syncMeta: {
    sessionsReceived: payloadCount,
    sessionsNormalized: 0,
    dayKey: null,
    skippedDueToPrivacy: true,
    privacy,
  },
  analysis: {
    score: 100,
    riskLevel: "low",
    predictionSource: "privacy_blocked",
    mlConfidence: 0,
    fallbackUsed: true,
    totalScreenMinutes: 0,
    overLimitMinutes: 0,
  },
  notificationMeta: {
    dominantNotificationType: "none",
    predictionSource: "privacy_blocked",
    fallbackUsed: true,
    confidence: 0,
    safeguardApplied: false,
    sendLimitWarning: false,
    sendSleepNudge: false,
    classProbabilities: {},
    errorMessage: "Usage sync blocked by privacy settings.",
    createdNotifications: [],
  },
});

export const ingestUsageWithMl = asyncHandler(async (req, res) => {
  const sessionsPayload = Array.isArray(req.body?.sessions)
    ? req.body.sessions
    : [];
  const appsPayload = Array.isArray(req.body?.apps) ? req.body.apps : [];

  if (!sessionsPayload.length && !appsPayload.length) {
    return res.status(400).json({
      success: false,
      message: "No usage sessions or apps were provided.",
    });
  }

  const payloadCount = sessionsPayload.length || appsPayload.length;

  const privacy = await getPrivacySyncState(req.user._id);

  if (!privacy.allowServerSync) {
    debugLog("ML INGEST BLOCKED BY PRIVACY SETTINGS:", privacy);

    return res.json(
      buildPrivacyBlockedResponse({
        payloadCount,
        privacy,
      })
    );
  }

  const rawPayloadSessions = sessionsPayload.length
    ? sessionsPayload
    : mapAppsPayloadToSessions(appsPayload);

  const normalizedSessions = normalizeAndMergeSessions({
    payloadSessions: rawPayloadSessions,
    userId: req.user._id,
  });

  if (!normalizedSessions.length) {
    return res.json({
      success: true,
      message: "No syncable usage sessions found after filtering system apps.",
      syncMeta: {
        sessionsReceived: payloadCount,
        sessionsNormalized: 0,
        dayKey: null,
        skippedDueToPrivacy: false,
        privacy,
      },
      analysis: {
        score: 100,
        riskLevel: "low",
        predictionSource: "rule_based_fallback",
        mlConfidence: 0,
        fallbackUsed: true,
        totalScreenMinutes: 0,
        overLimitMinutes: 0,
      },
      notificationMeta: {
        dominantNotificationType: "none",
        predictionSource: "rule_based_fallback",
        fallbackUsed: true,
        confidence: 0,
        safeguardApplied: false,
        sendLimitWarning: false,
        sendSleepNudge: false,
        classProbabilities: {},
        errorMessage: "",
        createdNotifications: [],
      },
    });
  }

  await upsertUsageSessions({
    sessions: normalizedSessions,
    userId: req.user._id,
  });

  const analysisDate = getAnalysisDate(normalizedSessions);
  const dayKeyForAnalysis = formatDayKey(analysisDate);

  const persistedSessionsRaw = await UsageSession.find({
    user: req.user._id,
    dayKey: dayKeyForAnalysis,
  })
    .sort({ durationMinutes: -1, appName: 1 })
    .lean();

  const persistedDaySessions = normalizeAndMergeSessions({
    payloadSessions: persistedSessionsRaw,
    userId: req.user._id,
  });

  const analysisSessions = persistedDaySessions.length
    ? persistedDaySessions
    : normalizedSessions;

  const { dayKey, settings, dailyAnalysis, featureRow } =
    await buildMlFeaturesForDay({
      user: req.user,
      date: analysisDate,
      sessions: analysisSessions,
    });

  debugLog("ML ANALYSIS DAY KEY:", dayKey);
  debugLog("ML FEATURE ROW USED FOR RISK:", featureRow);

  const mlInsight = await buildMlInsight({
    featureRow,
    fallbackAnalysis: dailyAnalysis,
  });

  const resolvedScore = resolveBestScore(mlInsight, dailyAnalysis);

  await AiInsight.findOneAndUpdate(
    { user: req.user._id, dayKey },
    {
      $set: {
        user: req.user._id,
        dayKey,
        score: resolvedScore,
        riskLevel: mlInsight.riskLevel,
        totalScreenMinutes: toSafeNumber(dailyAnalysis?.totalScreenMinutes, 0),
        pickups: toSafeNumber(dailyAnalysis?.pickups, 0),
        unlocks: toSafeNumber(dailyAnalysis?.unlocks, 0),
        lateNightMinutes: toSafeNumber(dailyAnalysis?.lateNightMinutes, 0),
        recommendations: Array.isArray(dailyAnalysis?.recommendations)
          ? dailyAnalysis.recommendations
          : [],
        reasons: Array.isArray(dailyAnalysis?.reasons)
          ? dailyAnalysis.reasons
          : [],
        predictionSource: mlInsight.source,
        modelVersion: process.env.ML_MODEL_VERSION || "risk-v1",
        mlConfidence: toSafeNumber(mlInsight.confidence, 0),
        classProbabilities: mlInsight.classProbabilities || {},
        featureSnapshot: featureRow,
        fallbackUsed: Boolean(mlInsight.fallbackUsed),
        lastCalculatedAt: new Date(),
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );

  req.user.detoxScore = resolvedScore;
  await req.user.save();

  const notificationFeatures = await buildNotificationMlFeaturesForDay({
    user: req.user,
    date: analysisDate,
    sessions: analysisSessions,
  });

  const effectiveSettings = notificationFeatures?.settings || settings;
  const notificationFeatureRow = notificationFeatures?.featureRow || {};

  debugLog(
    "ML FEATURE ROW USED FOR NOTIFICATIONS:",
    notificationFeatureRow
  );

  const rawNotificationPrediction = await buildNotificationInsight({
    featureRow: notificationFeatureRow,
  });

  const notificationPrediction = applyNotificationSafeguards({
    notificationPrediction: rawNotificationPrediction,
    riskLevel: mlInsight.riskLevel,
    settings: effectiveSettings,
    featureRow: notificationFeatureRow,
  });

  const createdNotifications = await createNotificationsFromMlPrediction({
    userId: req.user._id,
    notificationPrediction,
    settings: effectiveSettings,
    featureRow: notificationFeatureRow,
  });

  res.json({
    success: true,
    message: "Usage ingested and ML prediction completed.",
    syncMeta: {
      sessionsReceived: payloadCount,
      sessionsNormalized: normalizedSessions.length,
      dayKey,
      skippedDueToPrivacy: false,
      privacy,
    },
    analysis: {
      score: resolvedScore,
      riskLevel: mlInsight.riskLevel,
      predictionSource: mlInsight.source,
      mlConfidence: toSafeNumber(mlInsight.confidence, 0),
      fallbackUsed: Boolean(mlInsight.fallbackUsed),
      totalScreenMinutes: toSafeNumber(dailyAnalysis?.totalScreenMinutes, 0),
      overLimitMinutes: Math.max(
        0,
        toSafeNumber(
          featureRow?.overLimitMinutes,
          toSafeNumber(dailyAnalysis?.totalScreenMinutes, 0) -
            toSafeNumber(settings?.dailyLimitMinutes, 180)
        )
      ),
    },
    notificationMeta: {
      dominantNotificationType:
        notificationPrediction.dominantNotificationType,
      predictionSource: notificationPrediction.source,
      fallbackUsed: Boolean(notificationPrediction.fallbackUsed),
      confidence: toSafeNumber(notificationPrediction.confidence, 0),
      safeguardApplied: Boolean(notificationPrediction.safeguardApplied),
      sendLimitWarning: Boolean(notificationPrediction.sendLimitWarning),
      sendSleepNudge: Boolean(notificationPrediction.sendSleepNudge),
      classProbabilities: notificationPrediction.classProbabilities || {},
      errorMessage: notificationPrediction.errorMessage || "",
      createdNotifications,
    },
  });
});