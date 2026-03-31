import { asyncHandler } from "../utils/asyncHandler.js";
import { buildNotificationMlFeaturesForDay } from "../services/ml/notificationFeatureBuilder.js";
import { buildNotificationInsight } from "../services/ml/notificationMl.service.js";

export const getNotificationPreviewWithMl = asyncHandler(async (req, res) => {
  const { featureRow } = await buildNotificationMlFeaturesForDay({
    user: req.user,
  });

  const notificationPrediction = await buildNotificationInsight({
    featureRow,
  });

  res.json({
    success: true,
    preview: {
      dominantNotificationType:
        notificationPrediction.dominantNotificationType,
      predictionSource: notificationPrediction.source,
      fallbackUsed: notificationPrediction.fallbackUsed,
      confidence: notificationPrediction.confidence,
      errorMessage: notificationPrediction.errorMessage || "",
      sendLimitWarning: notificationPrediction.sendLimitWarning,
      sendSleepNudge: notificationPrediction.sendSleepNudge,
      riskLevelUsed: featureRow.riskLevel,
      scoreUsed: featureRow.score,
      totalScreenMinutes: featureRow.totalScreenMinutes,
      overLimitMinutes: featureRow.overLimitMinutes,
      lateNightMinutes: featureRow.lateNightMinutes,
      pickups: featureRow.pickups,
      unlocks: featureRow.unlocks,
      sevenDayAvgScreenMinutes: featureRow.sevenDayAvgScreenMinutes,
      classProbabilities: notificationPrediction.classProbabilities,
    },
  });
});