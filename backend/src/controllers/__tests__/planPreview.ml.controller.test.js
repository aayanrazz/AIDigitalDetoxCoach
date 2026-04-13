import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const loadController = async ({
  buildPlanMlFeaturesForDayImpl,
  buildPlanTargetInsightImpl,
} = {}) => {
  const buildPlanMlFeaturesForDay =
    buildPlanMlFeaturesForDayImpl ||
    jest.fn().mockResolvedValue({
      settings: {
        dailyLimitMinutes: 180,
      },
      dailyAnalysis: {
        riskLevel: 'medium',
      },
      featureRow: {
        riskLevel: 'high',
        score: 44,
        totalScreenMinutes: 250,
        overLimitMinutes: 70,
        pickups: 20,
        unlocks: 18,
        lateNightMinutes: 35,
        sevenDayAvgScreenMinutes: 210,
      },
    });

  const buildPlanTargetInsight =
    buildPlanTargetInsightImpl ||
    jest.fn().mockResolvedValue({
      predictedTargetDailyLimitMinutes: 150,
      source: 'tensorflow',
      fallbackUsed: false,
      errorMessage: '',
    });

  jest.unstable_mockModule('../../services/ml/planFeatureBuilder.js', () => ({
    buildPlanMlFeaturesForDay,
  }));

  jest.unstable_mockModule('../../services/ml/planMl.service.js', () => ({
    buildPlanTargetInsight,
  }));

  const module = await import('../planPreview.ml.controller.js');

  return {
    ...module,
    mocks: {
      buildPlanMlFeaturesForDay,
      buildPlanTargetInsight,
    },
  };
};

describe('ML Controller - planPreview.ml.controller.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_AI_CTRL_001 returns a successful plan preview response', async () => {
    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    const { getPlanTargetPreviewWithMl, mocks } = await loadController();

    await getPlanTargetPreviewWithMl(req, res, next);

    expect(mocks.buildPlanMlFeaturesForDay).toHaveBeenCalledWith({
      user: req.user,
    });

    expect(mocks.buildPlanTargetInsight).toHaveBeenCalledWith({
      featureRow: {
        riskLevel: 'high',
        score: 44,
        totalScreenMinutes: 250,
        overLimitMinutes: 70,
        pickups: 20,
        unlocks: 18,
        lateNightMinutes: 35,
        sevenDayAvgScreenMinutes: 210,
      },
      fallbackDailyLimit: 180,
    });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      preview: {
        currentDailyLimitMinutes: 180,
        predictedTargetDailyLimitMinutes: 150,
        predictionSource: 'tensorflow',
        fallbackUsed: false,
        errorMessage: '',
        riskLevelUsed: 'high',
        scoreUsed: 44,
        totalScreenMinutes: 250,
        overLimitMinutes: 70,
        pickups: 20,
        unlocks: 18,
        lateNightMinutes: 35,
        sevenDayAvgScreenMinutes: 210,
        todayAnalysisRiskLevel: 'medium',
      },
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('TC_AI_CTRL_002 forwards builder errors to next()', async () => {
    const error = new Error('Plan ML feature build failed.');
    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    const { getPlanTargetPreviewWithMl } = await loadController({
      buildPlanMlFeaturesForDayImpl: jest.fn().mockRejectedValue(error),
    });

    await getPlanTargetPreviewWithMl(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});