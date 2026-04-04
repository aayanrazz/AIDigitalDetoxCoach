import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeLeanChain = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const loadUsageMlController = async ({
  usageBulkWrite,
  userSettingsFindOne,
  aiInsightFindOneAndUpdate,
  notificationFindOne,
  notificationCreate,
  buildMlFeaturesForDayImpl,
  buildMlInsightImpl,
  buildNotificationMlFeaturesForDayImpl,
  buildNotificationInsightImpl,
} = {}) => {
  const UsageSession = {
    bulkWrite: usageBulkWrite ?? jest.fn().mockResolvedValue(undefined),
  };

  const UserSettings = {
    findOne:
      userSettingsFindOne ??
      jest.fn(() => ({
        select: jest.fn(() =>
          makeLeanChain({
            privacySettings: {
              consentGiven: true,
              dataCollection: true,
              anonymizeData: true,
              allowAnalyticsForTraining: false,
              retentionDays: 30,
            },
          })
        ),
      })),
  };

  const AiInsight = {
    findOneAndUpdate:
      aiInsightFindOneAndUpdate ?? jest.fn().mockResolvedValue({ _id: 'ai-1' }),
  };

  const Notification = {
    findOne: notificationFindOne ?? jest.fn(() => makeLeanChain(null)),
    create: notificationCreate ?? jest.fn().mockResolvedValue({ _id: 'notification-1' }),
  };

  const buildMlFeaturesForDay =
    buildMlFeaturesForDayImpl ??
    jest.fn().mockResolvedValue({
      dayKey: '2026-04-04',
      settings: { dailyLimitMinutes: 180, sleepSchedule: { bedTime: '23:00' } },
      dailyAnalysis: {
        score: 44,
        riskLevel: 'medium',
        totalScreenMinutes: 240,
        pickups: 18,
        unlocks: 20,
        lateNightMinutes: 20,
        recommendations: ['Take a break'],
        reasons: ['Above target'],
      },
      featureRow: {
        totalScreenMinutes: 240,
        overLimitMinutes: 60,
        lateNightMinutes: 20,
      },
    });

  const buildMlInsight =
    buildMlInsightImpl ??
    jest.fn().mockResolvedValue({
      score: 39,
      riskLevel: 'high',
      source: 'tensorflow',
      confidence: 0.93,
      fallbackUsed: false,
      classProbabilities: { low: 0.02, medium: 0.15, high: 0.83 },
    });

  const buildNotificationMlFeaturesForDay =
    buildNotificationMlFeaturesForDayImpl ??
    jest.fn().mockResolvedValue({
      settings: { dailyLimitMinutes: 180, sleepSchedule: { bedTime: '23:00' } },
      featureRow: {
        totalScreenMinutes: 240,
        overLimitMinutes: 60,
        lateNightMinutes: 20,
      },
    });

  const buildNotificationInsight =
    buildNotificationInsightImpl ??
    jest.fn().mockResolvedValue({
      sendLimitWarning: true,
      sendSleepNudge: false,
      source: 'tensorflow',
      fallbackUsed: false,
      confidence: 0.84,
      classProbabilities: { limit_warning: 0.84, none: 0.16 },
      errorMessage: '',
    });

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({
    default: UsageSession,
  }));
  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));
  jest.unstable_mockModule('../../models/AiInsight.js', () => ({
    default: AiInsight,
  }));
  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));
  jest.unstable_mockModule('../../services/ml/featureBuilder.js', () => ({
    buildMlFeaturesForDay,
  }));
  jest.unstable_mockModule('../../services/ml/ml.service.js', () => ({
    buildMlInsight,
  }));
  jest.unstable_mockModule('../../services/ml/notificationFeatureBuilder.js', () => ({
    buildNotificationMlFeaturesForDay,
  }));
  jest.unstable_mockModule('../../services/ml/notificationMl.service.js', () => ({
    buildNotificationInsight,
  }));

  const controller = await import('../usage.ml.controller.js');

  return {
    ...controller,
    mocks: {
      UsageSession,
      UserSettings,
      AiInsight,
      Notification,
      buildMlFeaturesForDay,
      buildMlInsight,
      buildNotificationMlFeaturesForDay,
      buildNotificationInsight,
    },
  };
};

describe('Module 6 - usage.ml.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_USAGESYNC_008 ingestUsageWithMl rejects empty sessions payload', async () => {
    const { ingestUsageWithMl } = await loadUsageMlController();

    const req = {
      body: {},
      user: { _id: 'user-1', save: jest.fn().mockResolvedValue(undefined) },
    };
    const res = makeRes();
    const next = jest.fn();

    await ingestUsageWithMl(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'No usage sessions provided.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_USAGESYNC_009 ingestUsageWithMl skips sync when privacy consent or data collection is disabled', async () => {
    const userSettingsFindOne = jest.fn(() => ({
      select: jest.fn(() =>
        makeLeanChain({
          privacySettings: {
            consentGiven: false,
            dataCollection: true,
            anonymizeData: true,
            allowAnalyticsForTraining: false,
            retentionDays: 30,
          },
        })
      ),
    }));

    const { ingestUsageWithMl, mocks } = await loadUsageMlController({
      userSettingsFindOne,
    });

    const req = {
      body: {
        sessions: [
          {
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            durationMinutes: 30,
            startTime: '2026-04-04T10:00:00.000Z',
            endTime: '2026-04-04T10:30:00.000Z',
          },
        ],
      },
      user: { _id: 'user-1', save: jest.fn().mockResolvedValue(undefined) },
    };
    const res = makeRes();
    const next = jest.fn();

    await ingestUsageWithMl(req, res, next);

    expect(mocks.UsageSession.bulkWrite).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message:
          'Usage sync skipped because privacy consent or data collection is disabled.',
        syncMeta: expect.objectContaining({
          skippedDueToPrivacy: true,
          sessionsReceived: 1,
          sessionsNormalized: 0,
        }),
        analysis: expect.objectContaining({
          predictionSource: 'privacy_blocked',
          riskLevel: 'low',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_USAGESYNC_010 ingestUsageWithMl filters blocked apps and merges duplicate sessions before bulk upsert', async () => {
    const usageBulkWrite = jest.fn().mockResolvedValue(undefined);

    const { ingestUsageWithMl, mocks } = await loadUsageMlController({
      usageBulkWrite,
      buildNotificationInsightImpl: jest.fn().mockResolvedValue({
        sendLimitWarning: false,
        sendSleepNudge: false,
        source: 'tensorflow',
        fallbackUsed: false,
        confidence: 0.5,
        classProbabilities: { none: 0.5 },
        errorMessage: '',
      }),
    });

    const req = {
      body: {
        sessions: [
          {
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            category: 'social networking',
            durationMinutes: 20,
            pickups: 2,
            unlocks: 3,
            source: 'native_bridge',
            startTime: '2026-04-04T10:00:00.000Z',
            endTime: '2026-04-04T10:20:00.000Z',
          },
          {
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            category: 'social networking',
            durationMinutes: 15,
            pickups: 1,
            unlocks: 2,
            source: 'native_bridge',
            startTime: '2026-04-04T10:30:00.000Z',
            endTime: '2026-04-04T10:45:00.000Z',
          },
          {
            appName: 'Pixel Launcher',
            appPackage: 'com.google.android.apps.nexuslauncher',
            category: 'Other',
            durationMinutes: 10,
            source: 'native_bridge',
            startTime: '2026-04-04T09:00:00.000Z',
            endTime: '2026-04-04T09:10:00.000Z',
          },
        ],
      },
      user: {
        _id: 'user-1',
        save: jest.fn().mockResolvedValue(undefined),
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await ingestUsageWithMl(req, res, next);

    expect(mocks.UsageSession.bulkWrite).toHaveBeenCalledTimes(1);
    const operations = mocks.UsageSession.bulkWrite.mock.calls[0][0];
    expect(operations).toHaveLength(1);

    expect(operations[0]).toEqual(
      expect.objectContaining({
        updateOne: expect.objectContaining({
          filter: expect.objectContaining({
            user: 'user-1',
            appPackage: 'com.instagram.android',
            source: 'native_bridge',
          }),
          update: {
            $set: expect.objectContaining({
              appName: 'Instagram',
              category: 'Social Media',
              durationMinutes: 35,
              pickups: 3,
              unlocks: 5,
              hourBucket: new Date('2026-04-04T10:00:00.000Z').getHours(),
            }),
          },
          upsert: true,
        }),
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        syncMeta: expect.objectContaining({
          sessionsReceived: 3,
          sessionsNormalized: 1,
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_USAGESYNC_011 ingestUsageWithMl persists AI insight, saves user detox score, and returns ML analysis metadata', async () => {
    const aiInsightFindOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'ai-1' });

    const { ingestUsageWithMl, mocks } = await loadUsageMlController({
      aiInsightFindOneAndUpdate,
    });

    const req = {
      body: {
        sessions: [
          {
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            category: 'social networking',
            durationMinutes: 90,
            pickups: 8,
            unlocks: 10,
            source: 'native_bridge',
            startTime: '2026-04-04T22:30:00.000Z',
            endTime: '2026-04-05T00:00:00.000Z',
          },
        ],
      },
      user: {
        _id: 'user-1',
        detoxScore: 0,
        save: jest.fn().mockResolvedValue(undefined),
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await ingestUsageWithMl(req, res, next);

    expect(mocks.buildMlFeaturesForDay).toHaveBeenCalledTimes(1);
    expect(mocks.buildMlInsight).toHaveBeenCalledWith({
      featureRow: {
        totalScreenMinutes: 240,
        overLimitMinutes: 60,
        lateNightMinutes: 20,
      },
      fallbackAnalysis: expect.objectContaining({
        score: 44,
        totalScreenMinutes: 240,
      }),
    });

    expect(mocks.AiInsight.findOneAndUpdate).toHaveBeenCalledWith(
      { user: 'user-1', dayKey: '2026-04-04' },
      {
        $set: expect.objectContaining({
          user: 'user-1',
          dayKey: '2026-04-04',
          score: 39,
          riskLevel: 'high',
          predictionSource: 'tensorflow',
          mlConfidence: 0.93,
          classProbabilities: { low: 0.02, medium: 0.15, high: 0.83 },
          featureSnapshot: {
            totalScreenMinutes: 240,
            overLimitMinutes: 60,
            lateNightMinutes: 20,
          },
          fallbackUsed: false,
          recommendations: ['Take a break'],
          reasons: ['Above target'],
          modelVersion: 'risk-v1',
          lastCalculatedAt: expect.any(Date),
        }),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );

    expect(req.user.detoxScore).toBe(39);
    expect(req.user.save).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        analysis: expect.objectContaining({
          score: 39,
          riskLevel: 'high',
          predictionSource: 'tensorflow',
          mlConfidence: 0.93,
          fallbackUsed: false,
          totalScreenMinutes: 240,
          overLimitMinutes: 60,
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_USAGESYNC_012 ingestUsageWithMl creates safeguard-based limit-warning notification when rule conditions require it', async () => {
    const notificationCreate = jest.fn().mockResolvedValue({ _id: 'notification-1' });

    const { ingestUsageWithMl, mocks } = await loadUsageMlController({
      notificationCreate,
      buildMlInsightImpl: jest.fn().mockResolvedValue({
        score: 38,
        riskLevel: 'high',
        source: 'tensorflow',
        confidence: 0.88,
        fallbackUsed: false,
        classProbabilities: { high: 0.88, medium: 0.12 },
      }),
      buildNotificationInsightImpl: jest.fn().mockResolvedValue({
        sendLimitWarning: false,
        sendSleepNudge: false,
        source: 'tensorflow',
        fallbackUsed: false,
        confidence: 0.22,
        classProbabilities: { none: 0.78, limit_warning: 0.22 },
        errorMessage: '',
      }),
      buildNotificationMlFeaturesForDayImpl: jest.fn().mockResolvedValue({
        settings: { dailyLimitMinutes: 180, sleepSchedule: { bedTime: '23:00' } },
        featureRow: {
          totalScreenMinutes: 240,
          overLimitMinutes: 60,
          lateNightMinutes: 0,
        },
      }),
    });

    const req = {
      body: {
        sessions: [
          {
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            category: 'social networking',
            durationMinutes: 120,
            pickups: 10,
            unlocks: 12,
            source: 'native_bridge',
            startTime: '2026-04-04T20:00:00.000Z',
            endTime: '2026-04-04T22:00:00.000Z',
          },
        ],
      },
      user: {
        _id: 'user-1',
        detoxScore: 0,
        save: jest.fn().mockResolvedValue(undefined),
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await ingestUsageWithMl(req, res, next);

    expect(mocks.Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        type: 'limit_warning',
        title: 'Usage limit warning',
        body: 'You are 60 minutes over your 180-minute daily limit. Take a short break now.',
        cta: {
          label: 'VIEW PLAN',
          action: 'open_detox_plan',
        },
        metadata: expect.objectContaining({
          generatedBy: 'notification_ml',
          dominantNotificationType: 'limit_warning',
          predictionSource: 'tensorflow',
          safeguardApplied: true,
          totalScreenMinutes: 240,
          dailyLimitMinutes: 180,
          overLimitMinutes: 60,
        }),
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationMeta: expect.objectContaining({
          dominantNotificationType: 'limit_warning',
          safeguardApplied: true,
          sendLimitWarning: true,
          sendSleepNudge: false,
          createdNotifications: [
            expect.objectContaining({
              id: 'notification-1',
              kind: 'limit_warning',
              skippedDuplicate: false,
            }),
          ],
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});