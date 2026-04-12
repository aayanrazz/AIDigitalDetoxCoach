import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUsageBulkWrite: any = jest.fn();
const mockUsageFind: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockAiInsightFindOneAndUpdate: any = jest.fn();
const mockNotificationFindOne: any = jest.fn();
const mockNotificationCreate: any = jest.fn();
const mockBuildMlFeaturesForDay: any = jest.fn();
const mockBuildMlInsight: any = jest.fn();
const mockBuildNotificationMlFeaturesForDay: any = jest.fn();
const mockBuildNotificationInsight: any = jest.fn();
const mockFormatDayKey: any = jest.fn(() => '2026-04-12');
const mockIgnoredUsageEntry: any = jest.fn(() => false);
const mockNormalizeUsageSession: any = jest.fn((value: any) => value);
const mockNormalizeUsageCategory: any = jest.fn((value: string) => value || 'Other');
const mockGetSessionDurationMinutes: any = jest.fn((value: any) => Number(value?.durationMinutes || value?.totalTimeInForeground || 0));
const mockToSafeNumber: any = jest.fn((value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
});

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    bulkWrite: mockUsageBulkWrite,
    find: mockUsageFind
  }
}));

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    findOne: mockSettingsFindOne
  }
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {
    findOneAndUpdate: mockAiInsightFindOneAndUpdate
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    findOne: mockNotificationFindOne,
    create: mockNotificationCreate
  }
}));

jest.unstable_mockModule('../../src/utils/date.js', () => ({
  formatDayKey: mockFormatDayKey
}));

jest.unstable_mockModule('../../src/services/ml/featureBuilder.js', () => ({
  buildMlFeaturesForDay: mockBuildMlFeaturesForDay
}));

jest.unstable_mockModule('../../src/services/ml/ml.service.js', () => ({
  buildMlInsight: mockBuildMlInsight
}));

jest.unstable_mockModule('../../src/services/ml/notificationFeatureBuilder.js', () => ({
  buildNotificationMlFeaturesForDay: mockBuildNotificationMlFeaturesForDay
}));

jest.unstable_mockModule('../../src/services/ml/notificationMl.service.js', () => ({
  buildNotificationInsight: mockBuildNotificationInsight
}));

jest.unstable_mockModule('../../src/utils/usageSessionFilters.js', () => ({
  isIgnoredUsageEntry: mockIgnoredUsageEntry,
  normalizeUsageSession: mockNormalizeUsageSession,
  normalizeUsageCategory: mockNormalizeUsageCategory,
  getSessionDurationMinutes: mockGetSessionDurationMinutes,
  toSafeNumber: mockToSafeNumber
}));

const { ingestUsageWithMl } = await import('../../src/controllers/usage.ml.controller.js');
const { getNotificationPreviewWithMl } = await import('../../src/controllers/notificationPreview.ml.controller.js');

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
};

function createRes(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    }
  };
}

function chainSelectLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  const select: any = jest.fn(() => ({ lean }));
  return { select };
}

function chainSortLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  const sort: any = jest.fn(() => ({ lean }));
  return { sort };
}

describe('Module 7 - usage.ml.controller.js / notificationPreview.ml.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDayKey.mockReturnValue('2026-04-12');
    mockIgnoredUsageEntry.mockReturnValue(false);
  });

  it('TC_USAGE_ML_CTRL_001 - ingestUsageWithMl rejects empty payload', async () => {
    const req = {
      user: { _id: 'user-001' },
      body: {}
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsageWithMl(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'No usage sessions or apps were provided.'
    });
  });

  it('TC_USAGE_ML_CTRL_002 - ingestUsageWithMl returns privacy blocked response when consent is disabled', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      chainSelectLean({
        privacySettings: {
          consentGiven: false,
          dataCollection: false,
          anonymizeData: true,
          allowAnalyticsForTraining: false,
          retentionDays: 30
        }
      })
    );

    const req = {
      user: { _id: 'user-001' },
      body: {
        apps: [
          {
            appName: 'Instagram',
            packageName: 'com.instagram.android',
            totalTimeInForeground: 15
          }
        ]
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsageWithMl(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncMeta.skippedDueToPrivacy).toBe(true);
    expect(res.body.analysis.predictionSource).toBe('privacy_blocked');
    expect(res.body.notificationMeta.predictionSource).toBe('privacy_blocked');
  });

  it('TC_USAGE_ML_CTRL_003 - ingestUsageWithMl returns fallback response when all sessions are filtered out', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      chainSelectLean({
        privacySettings: {
          consentGiven: true,
          dataCollection: true,
          anonymizeData: true,
          allowAnalyticsForTraining: false,
          retentionDays: 30
        }
      })
    );

    mockIgnoredUsageEntry.mockReturnValue(true);

    const req = {
      user: { _id: 'user-001' },
      body: {
        apps: [
          {
            appName: 'Android System',
            packageName: 'com.android.systemui',
            totalTimeInForeground: 20,
            pickups: 1,
            unlocks: 1,
            lastTimeUsed: Date.now()
          }
        ]
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsageWithMl(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.syncMeta.sessionsNormalized).toBe(0);
    expect(res.body.analysis.predictionSource).toBe('rule_based_fallback');
    expect(res.body.notificationMeta.createdNotifications).toEqual([]);
  });

  it('TC_USAGE_ML_CTRL_004 - ingestUsageWithMl stores insight and creates ML notifications on successful analysis', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      chainSelectLean({
        privacySettings: {
          consentGiven: true,
          dataCollection: true,
          anonymizeData: true,
          allowAnalyticsForTraining: false,
          retentionDays: 30
        }
      })
    );

    mockUsageFind.mockImplementationOnce(() =>
      chainSortLean([
        {
          user: 'user-001',
          dayKey: '2026-04-12',
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social',
          durationMinutes: 95,
          pickups: 8,
          unlocks: 7,
          startTime: new Date('2026-04-12T10:00:00Z'),
          endTime: new Date('2026-04-12T11:35:00Z'),
          hourBucket: 10,
          source: 'native_bridge',
          platform: 'android'
        }
      ])
    );

    mockBuildMlFeaturesForDay.mockImplementationOnce(async () => ({
      dayKey: '2026-04-12',
      settings: {
        dailyLimitMinutes: 60,
        sleepSchedule: { bedTime: '23:00' }
      },
      dailyAnalysis: {
        score: 58,
        riskLevel: 'high',
        totalScreenMinutes: 95,
        pickups: 8,
        unlocks: 7,
        lateNightMinutes: 0,
        recommendations: ['Take a 15 minute break'],
        reasons: ['Usage is above daily limit']
      },
      featureRow: {
        totalScreenMinutes: 95,
        overLimitMinutes: 35,
        lateNightMinutes: 0,
        pickups: 8,
        unlocks: 7
      }
    }));

    mockBuildMlInsight.mockImplementationOnce(async () => ({
      score: 62,
      riskLevel: 'high',
      source: 'tensorflow',
      confidence: 0.91,
      classProbabilities: { high: 0.91, medium: 0.07, low: 0.02 },
      fallbackUsed: false
    }));

    mockAiInsightFindOneAndUpdate.mockImplementationOnce(async () => ({
      _id: 'insight-001'
    }));

    mockBuildNotificationMlFeaturesForDay.mockImplementationOnce(async () => ({
      settings: {
        dailyLimitMinutes: 60,
        sleepSchedule: { bedTime: '23:00' }
      },
      featureRow: {
        totalScreenMinutes: 95,
        overLimitMinutes: 35,
        lateNightMinutes: 0,
        pickups: 8,
        unlocks: 7
      }
    }));

    mockBuildNotificationInsight.mockImplementationOnce(async () => ({
      dominantNotificationType: 'limit_warning',
      source: 'tensorflow',
      fallbackUsed: false,
      confidence: 0.94,
      classProbabilities: { limit_warning: 0.94 },
      errorMessage: '',
      sendLimitWarning: true,
      sendSleepNudge: false
    }));

    mockNotificationFindOne.mockImplementationOnce(() => ({
      lean: jest.fn().mockImplementationOnce(async () => null)
    }));

    mockNotificationCreate.mockImplementationOnce(async () => ({
      _id: 'notif-001'
    }));

    const req = {
      user: {
        _id: 'user-001',
        save: jest.fn().mockImplementationOnce(async () => true),
        detoxScore: 0
      },
      body: {
        apps: [
          {
            appName: 'Instagram',
            packageName: 'com.instagram.android',
            category: 'Social',
            totalTimeInForeground: 95,
            pickups: 8,
            unlocks: 7,
            lastTimeUsed: Date.now()
          }
        ]
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsageWithMl(req, res as any, next);

    expect(mockUsageBulkWrite).toHaveBeenCalled();
    expect(mockAiInsightFindOneAndUpdate).toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalled();
    expect(req.user.detoxScore).toBe(62);
    expect(req.user.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.analysis.predictionSource).toBe('tensorflow');
    expect(res.body.analysis.riskLevel).toBe('high');
    expect(res.body.notificationMeta.dominantNotificationType).toBe('limit_warning');
    expect(res.body.notificationMeta.createdNotifications.length).toBe(1);
  });

  it('TC_USAGE_ML_CTRL_005 - getNotificationPreviewWithMl returns preview based on ML prediction output', async () => {
    mockBuildNotificationMlFeaturesForDay.mockImplementationOnce(async () => ({
      featureRow: {
        riskLevel: 'medium',
        score: 70,
        totalScreenMinutes: 180,
        overLimitMinutes: 20,
        lateNightMinutes: 10,
        pickups: 30,
        unlocks: 25,
        sevenDayAvgScreenMinutes: 160
      }
    }));

    mockBuildNotificationInsight.mockImplementationOnce(async () => ({
      dominantNotificationType: 'limit_warning',
      source: 'tensorflow',
      fallbackUsed: false,
      confidence: 0.92,
      errorMessage: '',
      sendLimitWarning: true,
      sendSleepNudge: false,
      classProbabilities: { limit_warning: 0.92 }
    }));

    const req = { user: { _id: 'user-001' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await getNotificationPreviewWithMl(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview.predictionSource).toBe('tensorflow');
    expect(res.body.preview.dominantNotificationType).toBe('limit_warning');
    expect(res.body.preview.totalScreenMinutes).toBe(180);
  });
});
