import { asyncHandler } from "../utils/asyncHandler.js";
import { buildPlanMlFeaturesForDay } from "../services/ml/planFeatureBuilder.js";
import { buildPlanTargetInsight } from "../services/ml/planMl.service.js";

export const getPlanTargetPreviewWithMl = asyncHandler(async (req, res) => {
  const { settings, dailyAnalysis, featureRow } =
    await buildPlanMlFeaturesForDay({
      user: req.user,
    });

  const currentDailyLimitMinutes = Number(settings?.dailyLimitMinutes || 180);

  const planPrediction = await buildPlanTargetInsight({
    featureRow,
    fallbackDailyLimit: currentDailyLimitMinutes,
  });

  res.json({
    success: true,
    preview: {
      currentDailyLimitMinutes,
      predictedTargetDailyLimitMinutes:
        planPrediction.predictedTargetDailyLimitMinutes,
      predictionSource: planPrediction.source,
      fallbackUsed: planPrediction.fallbackUsed,
      errorMessage: planPrediction.errorMessage || "",
      riskLevelUsed: featureRow.riskLevel,
      scoreUsed: featureRow.score,
      totalScreenMinutes: featureRow.totalScreenMinutes,
      overLimitMinutes: featureRow.overLimitMinutes,
      pickups: featureRow.pickups,
      unlocks: featureRow.unlocks,
      lateNightMinutes: featureRow.lateNightMinutes,
      sevenDayAvgScreenMinutes: featureRow.sevenDayAvgScreenMinutes,
      todayAnalysisRiskLevel: dailyAnalysis?.riskLevel || "low",
    },
  });
});