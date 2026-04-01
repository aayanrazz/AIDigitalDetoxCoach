import UsageSession from "../models/UsageSession.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import { buildMlFeaturesForDay } from "../services/ml/featureBuilder.js";
import { buildMlInsight } from "../services/ml/ml.service.js";
import { buildNotificationMlFeaturesForDay } from "../services/ml/notificationFeatureBuilder.js";
import { buildNotificationInsight } from "../services/ml/notificationMl.service.js";

const BLOCKED_PACKAGES = ["com.google.android.apps.nexuslauncher"];
const NOTIFICATION_DEDUPE_MINUTES = 20;
const DEBUG_ML_INGEST = process.env.DEBUG_ML_INGEST === "true";

const debugLog = (...args) => {
  if (DEBUG_ML_INGEST) {
    console.log(...args);
  }
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

const normalizeAndMergeSessions = ({ payloadSessions = [], userId }) => {
  const merged = new Map();

  for (const item of payloadSessions) {
    const appPackage = String(item.appPackage || "").trim();

    if (!appPackage) continue;
    if (BLOCKED_PACKAGES.includes(appPackage)) continue;

    const source = String(item.source || "native_bridge").trim();
    const dayKey = item.dayKey || formatDayKey(item.startTime || new Date());
    const key = `${String(userId)}__${dayKey}__${appPackage}__${source}`;

    const startTime = item.startTime ? new Date(item.startTime) : new Date();
    const endTime = item.endTime ? new Date(item.endTime) : undefined;

    const incoming = {
      user: userId,
      dayKey,
      appName: item.appName || appPackage,
      appPackage,
      category: item.category || "Other",
      durationMinutes: Math.max(0, Number(item.durationMinutes || 0)),
      pickups: Math.max(0, Number(item.pickups || 0)),
      unlocks: Math.max(0, Number(item.unlocks || 0)),
      startTime,
      endTime,
      hourBucket: Number(
        item.hourBucket ?? new Date(item.startTime || new Date()).getHours()
      ),
      source,
      platform: item.platform || "android",
    };

    if (!merged.has(key)) {
      merged.set(key, incoming);
      continue;
    }

    const existing = merged.get(key);

    existing.durationMinutes += incoming.durationMinutes;
    existing.pickups += incoming.pickups;
    existing.unlocks += incoming.unlocks;

    if (
      incoming.startTime &&
      (!existing.startTime || incoming.startTime < existing.startTime)
    ) {
      existing.startTime = incoming.startTime;
    }

    if (
      incoming.endTime &&
      (!existing.endTime || incoming.endTime > existing.endTime)
    ) {
      existing.endTime = incoming.endTime;
    }

    if (incoming.hourBucket < existing.hourBucket) {
      existing.hourBucket = incoming.hourBucket;
    }

    if (!existing.appName && incoming.appName) {
      existing.appName = incoming.appName;
    }

    if (!existing.category && incoming.category) {
      existing.category = incoming.category;
    }

    merged.set(key, existing);
  }

  return Array.from(merged.values());
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
          durationMinutes: session.durationMinutes,
          pickups: session.pickups,
          unlocks: session.unlocks,
          startTime: session.startTime,
          endTime: session.endTime,
          hourBucket: session.hourBucket,
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
  const dailyLimitMinutes = Number(settings?.dailyLimitMinutes || 180);
  const totalScreenMinutes = Number(featureRow?.totalScreenMinutes || 0);
  const overLimitMinutes = Number(
    featureRow?.overLimitMinutes ??
      Math.max(0, totalScreenMinutes - dailyLimitMinutes)
  );
  const lateNightMinutes = Number(featureRow?.lateNightMinutes || 0);

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
    confidence: Number(notificationPrediction?.confidence || 0),
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
  const dailyLimitMinutes = Number(settings?.dailyLimitMinutes || 180);
  const totalScreenMinutes = Number(featureRow?.totalScreenMinutes || 0);
  const overLimitMinutes = Number(featureRow?.overLimitMinutes || 0);
  const lateNightMinutes = Number(featureRow?.lateNightMinutes || 0);

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
    const sessionDate = new Date(session.startTime || new Date());
    return sessionDate > latest ? sessionDate : latest;
  }, new Date(normalizedSessions[0].startTime || new Date()));
};

export const ingestUsageWithMl = asyncHandler(async (req, res) => {
  const payloadSessions = Array.isArray(req.body.sessions)
    ? req.body.sessions
    : [];

  if (!payloadSessions.length) {
    return res
      .status(400)
      .json({ success: false, message: "No usage sessions provided." });
  }

  const normalizedSessions = normalizeAndMergeSessions({
    payloadSessions,
    userId: req.user._id,
  });

  if (!normalizedSessions.length) {
    return res.json({
      success: true,
      message: "No syncable usage sessions found after filtering system apps.",
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

  const { dayKey, settings, dailyAnalysis, featureRow } =
    await buildMlFeaturesForDay({
      user: req.user,
      date: analysisDate,
      sessions: normalizedSessions,
    });

  debugLog("ML ANALYSIS DAY KEY:", dayKey);
  debugLog("ML FEATURE ROW USED FOR RISK:", featureRow);

  const mlInsight = await buildMlInsight({
    featureRow,
    fallbackAnalysis: dailyAnalysis,
  });

  await AiInsight.findOneAndUpdate(
    { user: req.user._id, dayKey },
    {
      $set: {
        user: req.user._id,
        dayKey,
        score: Number(dailyAnalysis.score || 0),
        riskLevel: mlInsight.riskLevel,
        recommendations: Array.isArray(dailyAnalysis.recommendations)
          ? dailyAnalysis.recommendations
          : [],
        reasons: Array.isArray(dailyAnalysis.reasons)
          ? dailyAnalysis.reasons
          : [],
        predictionSource: mlInsight.source,
        modelVersion: process.env.ML_MODEL_VERSION || "risk-v1",
        mlConfidence: Number(mlInsight.confidence || 0),
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

  const notificationFeatures = await buildNotificationMlFeaturesForDay({
    user: req.user,
    date: analysisDate,
    sessions: normalizedSessions,
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
      sessionsReceived: payloadSessions.length,
      sessionsNormalized: normalizedSessions.length,
      dayKey,
    },
    analysis: {
      score: Number(dailyAnalysis.score || 0),
      riskLevel: mlInsight.riskLevel,
      predictionSource: mlInsight.source,
      mlConfidence: Number(mlInsight.confidence || 0),
      fallbackUsed: Boolean(mlInsight.fallbackUsed),
      totalScreenMinutes: Number(dailyAnalysis.totalScreenMinutes || 0),
      overLimitMinutes: Math.max(
        0,
        Number(dailyAnalysis.totalScreenMinutes || 0) -
          Number(settings?.dailyLimitMinutes || 180)
      ),
    },
    notificationMeta: {
      dominantNotificationType:
        notificationPrediction.dominantNotificationType,
      predictionSource: notificationPrediction.source,
      fallbackUsed: Boolean(notificationPrediction.fallbackUsed),
      confidence: Number(notificationPrediction.confidence || 0),
      safeguardApplied: Boolean(notificationPrediction.safeguardApplied),
      sendLimitWarning: Boolean(notificationPrediction.sendLimitWarning),
      sendSleepNudge: Boolean(notificationPrediction.sendSleepNudge),
      classProbabilities: notificationPrediction.classProbabilities || {},
      errorMessage: notificationPrediction.errorMessage || "",
      createdNotifications,
    },
  });
});