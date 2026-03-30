import UsageSession from "../models/UsageSession.js";
import AiInsight from "../models/AiInsight.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { formatDayKey } from "../utils/date.js";
import { buildMlFeaturesForDay } from "../services/ml/featureBuilder.js";
import { buildMlInsight } from "../services/ml/ml.service.js";

const BLOCKED_PACKAGES = [
  "com.google.android.apps.nexuslauncher",
];

const createRiskNotification = async ({
  userId,
  riskLevel,
  totalScreenMinutes,
  dailyLimitMinutes,
}) => {
  if (riskLevel !== "high") return null;

  try {
    return await Notification.create({
      user: userId,
      type: "summary",
      title: "High risk overuse detected",
      body: `Today's usage is ${totalScreenMinutes} minutes against a ${dailyLimitMinutes}-minute goal. Take a short detox break now.`,
      cta: {
        label: "VIEW PLAN",
        action: "open_detox_plan",
      },
      metadata: {
        riskLevel,
        totalScreenMinutes,
        dailyLimitMinutes,
      },
    });
  } catch (error) {
    console.error("Risk notification creation failed:", error.message);
    return null;
  }
};

const normalizeAndMergeSessions = ({ payloadSessions = [], userId }) => {
  const merged = new Map();

  for (const item of payloadSessions) {
    const appPackage = String(item.appPackage || "").trim();

    if (!appPackage) continue;
    if (BLOCKED_PACKAGES.includes(appPackage)) continue;

    const source = item.source || "native_bridge";
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
      durationMinutes: Number(item.durationMinutes || 0),
      pickups: Number(item.pickups || 0),
      unlocks: Number(item.unlocks || 0),
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

export const ingestUsageWithMl = asyncHandler(async (req, res) => {
  console.log("ML INGEST HIT");
  console.log("REQ BODY:", JSON.stringify(req.body, null, 2));
  console.log("REQ USER ID:", req.user?._id);

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
    });
  }

  const uniqueDayKeys = [
    ...new Set(normalizedSessions.map((item) => item.dayKey)),
  ];
  const uniqueSources = [
    ...new Set(normalizedSessions.map((item) => item.source)),
  ];

  await UsageSession.deleteMany({
    user: req.user._id,
    dayKey: { $in: uniqueDayKeys },
    source: { $in: uniqueSources },
  });

  await UsageSession.insertMany(normalizedSessions, { ordered: true });

  const { dayKey, settings, dailyAnalysis, featureRow } =
    await buildMlFeaturesForDay({
      user: req.user,
    });

  const mlInsight = await buildMlInsight({
    featureRow,
    fallbackAnalysis: dailyAnalysis,
  });

  await AiInsight.findOneAndUpdate(
    { user: req.user._id, dayKey },
    {
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
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }
  );

  await createRiskNotification({
    userId: req.user._id,
    riskLevel: mlInsight.riskLevel,
    totalScreenMinutes: Number(dailyAnalysis.totalScreenMinutes || 0),
    dailyLimitMinutes: Number(settings?.dailyLimitMinutes || 180),
  });

  res.json({
    success: true,
    message: "Usage ingested and ML prediction completed.",
    analysis: {
      score: dailyAnalysis.score,
      riskLevel: mlInsight.riskLevel,
      predictionSource: mlInsight.source,
      mlConfidence: mlInsight.confidence,
      fallbackUsed: mlInsight.fallbackUsed,
      totalScreenMinutes: dailyAnalysis.totalScreenMinutes,
      overLimitMinutes: Math.max(
        0,
        Number(dailyAnalysis.totalScreenMinutes || 0) -
          Number(settings?.dailyLimitMinutes || 180)
      ),
    },
  });
});