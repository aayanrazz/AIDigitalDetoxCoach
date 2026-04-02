import AiInsight from "../../models/AiInsight.js";
import { buildMlFeaturesForDay } from "./featureBuilder.js";

const clampNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizePlanTarget = (value, fallback = 180) => {
  const parsed = Math.round(clampNumber(value, fallback));
  return Math.max(60, Math.min(480, parsed));
};

export const buildPlanMlFeaturesForDay = async ({
  user,
  date = new Date(),
  sessions = null,
}) => {
  const base = await buildMlFeaturesForDay({
    user,
    date,
    sessions,
  });

  const existingInsight = await AiInsight.findOne({
    user: user._id,
    dayKey: base.dayKey,
  })
    .sort({ createdAt: -1 })
    .lean();

  const baseRow = base?.featureRow || {};

  const score = clampNumber(
    existingInsight?.score,
    clampNumber(base?.dailyAnalysis?.score, 0)
  );

  const riskLevel =
    String(
      existingInsight?.riskLevel ||
        base?.dailyAnalysis?.riskLevel ||
        "low"
    ).trim() || "low";

  const featureRow = {
    ...baseRow,
    score,
    riskLevel,
  };

  return {
    ...base,
    existingInsight,
    featureRow,
  };
};