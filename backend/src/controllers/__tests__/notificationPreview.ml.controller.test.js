import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const loadController = async ({
  buildNotificationMlFeaturesForDayImpl,
  buildNotificationInsightImpl,
} = {}) => {
  const buildNotificationMlFeaturesForDay =
    buildNotificationMlFeaturesForDayImpl ||
    jest.fn().mockResolvedValue({
      featureRow: {
        riskLevel: 'high',
        score: 41,
        totalScreenMinutes: 260,
        overLimitMinutes: 80,
        lateNightMinutes: 45,
        pickups: 22,
        unlocks: 19,
        sevenDayAvgScreenMinutes: 215,
      },
    });

  const buildNotificationInsight =
    buildNotificationInsightImpl ||
    jest.fn().mockResolvedValue({
      dominantNotificationType: 'limit_warning',
      source: 'tensorflow',
      fallbackUsed: false,
      confidence: 0.92,
      errorMessage: '',
      sendLimitWarning: true,
      sendSleepNudge: false,
      classProbabilities: {
        limit_warning: 0.92,
        none: 0.06,
        sleep: 0.02,
      },
    });

  jest.unstable_mockModule('../../services/ml/notificationFeatureBuilder.js', () => ({
    buildNotificationMlFeaturesForDay,
  }));

  jest.unstable_mockModule('../../services/ml/notificationMl.service.js', () => ({
    buildNotificationInsight,
  }));

  const module = await import('../notificationPreview.ml.controller.js');

  return {
    ...module,
    mocks: {
      buildNotificationMlFeaturesForDay,
      buildNotificationInsight,
    },
  };
};

describe('ML Controller - notificationPreview.ml.controller.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_AI_CTRL_003 returns a successful notification preview response', async () => {
    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    const { getNotificationPreviewWithMl, mocks } = await loadController();

    await getNotificationPreviewWithMl(req, res, next);

    expect(mocks.buildNotificationMlFeaturesForDay).toHaveBeenCalledWith({
      user: req.user,
    });

    expect(mocks.buildNotificationInsight).toHaveBeenCalledWith({
      featureRow: {
        riskLevel: 'high',
        score: 41,
        totalScreenMinutes: 260,
        overLimitMinutes: 80,
        lateNightMinutes: 45,
        pickups: 22,
        unlocks: 19,
        sevenDayAvgScreenMinutes: 215,
      },
    });

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      preview: {
        dominantNotificationType: 'limit_warning',
        predictionSource: 'tensorflow',
        fallbackUsed: false,
        confidence: 0.92,
        errorMessage: '',
        sendLimitWarning: true,
        sendSleepNudge: false,
        riskLevelUsed: 'high',
        scoreUsed: 41,
        totalScreenMinutes: 260,
        overLimitMinutes: 80,
        lateNightMinutes: 45,
        pickups: 22,
        unlocks: 19,
        sevenDayAvgScreenMinutes: 215,
        classProbabilities: {
          limit_warning: 0.92,
          none: 0.06,
          sleep: 0.02,
        },
      },
    });

    expect(next).not.toHaveBeenCalled();
  });

  it('TC_AI_CTRL_004 forwards prediction errors to next()', async () => {
    const error = new Error('Notification ML prediction failed.');
    const req = { user: { _id: 'user-1' } };
    const res = makeRes();
    const next = jest.fn();

    const { getNotificationPreviewWithMl } = await loadController({
      buildNotificationInsightImpl: jest.fn().mockRejectedValue(error),
    });

    await getNotificationPreviewWithMl(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});