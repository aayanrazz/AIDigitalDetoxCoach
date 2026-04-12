import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockBulkWrite: any = jest.fn();
const mockUsageFind: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockAppLimitFind: any = jest.fn();
const mockAiInsightUpdate: any = jest.fn();
const mockNotificationFind: any = jest.fn();
const mockNotificationInsertMany: any = jest.fn();
const mockAnalyzeDailyUsage: any = jest.fn();
const mockEvaluateAppLimits: any = jest.fn();
const mockFormatDayKey: any = jest.fn();
const mockFilterUsageSessions: any = jest.fn();
const mockNormalizeUsageSession: any = jest.fn((x: any) => x);
const mockNormalizeUsageCategory: any = jest.fn((x: string) => x || 'Other');
const mockGetSessionDurationMinutes: any = jest.fn(
  (x: any) => Number(x?.durationMinutes || x?.totalTimeInForeground || 0)
);
const mockToSafeNumber: any = jest.fn((value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
});

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    bulkWrite: mockBulkWrite,
    find: mockUsageFind
  }
}));

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    findOne: mockSettingsFindOne,
    create: mockSettingsCreate
  }
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {
    findOneAndUpdate: mockAiInsightUpdate
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    find: mockNotificationFind,
    insertMany: mockNotificationInsertMany
  }
}));

jest.unstable_mockModule('../../src/models/AppLimit.js', () => ({
  default: {
    find: mockAppLimitFind
  }
}));

jest.unstable_mockModule('../../src/utils/date.js', () => ({
  formatDayKey: mockFormatDayKey
}));

jest.unstable_mockModule('../../src/services/behavior.service.js', () => ({
  analyzeDailyUsage: mockAnalyzeDailyUsage,
  evaluateAppLimits: mockEvaluateAppLimits
}));

jest.unstable_mockModule('../../src/utils/usageSessionFilters.js', () => ({
  filterUsageSessions: mockFilterUsageSessions,
  normalizeUsageSession: mockNormalizeUsageSession,
  normalizeUsageCategory: mockNormalizeUsageCategory,
  getSessionDurationMinutes: mockGetSessionDurationMinutes,
  toSafeNumber: mockToSafeNumber
}));

const { ingestUsage } = await import('../../src/controllers/usage.controller.js');

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

function chainSortLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  const sort: any = jest.fn(() => ({
    lean
  }));

  return { sort };
}

function chainSelectLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  const select: any = jest.fn(() => ({
    lean
  }));

  return { select };
}

describe('Module 5 - usage.controller.js (usage collection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDayKey.mockReturnValue('2026-04-12');
    mockFilterUsageSessions.mockImplementation((items: any[]) => items);
  });

  it('TC_USAGE_COLLECTION_CTRL_001 - ingestUsage rejects when sessions or apps array is missing', async () => {
    const req = {
      user: { _id: 'user-001' },
      body: {}
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsage(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);

    const error = next.mock.calls[0][0];
    expect(error).toBeTruthy();
    expect(String(error.message)).toMatch(/sessions or apps array/i);
  });

  it('TC_USAGE_COLLECTION_CTRL_002 - ingestUsage accepts apps payload and stores normalized usage sessions', async () => {
    mockUsageFind.mockImplementationOnce(() =>
      chainSortLean([
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social',
          durationMinutes: 40,
          pickups: 3,
          unlocks: 3,
          dayKey: '2026-04-12',
          source: 'native_bridge'
        }
      ])
    );

    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 180,
      notificationSettings: {},
      save: jest.fn()
    }));

    mockAppLimitFind.mockImplementationOnce(() => chainSortLean([]));

    mockAnalyzeDailyUsage.mockImplementationOnce(() => ({
      score: 72,
      riskLevel: 'medium',
      totalScreenMinutes: 40,
      pickups: 3,
      unlocks: 3,
      lateNightMinutes: 0,
      reasons: ['High social media use'],
      recommendations: ['Reduce usage tomorrow'],
      notifications: []
    }));

    mockEvaluateAppLimits.mockImplementationOnce(() => ({
      monitoredApps: [],
      exceededApps: [],
      exceededCount: 0,
      topExceededApp: null,
      notifications: []
    }));

    mockAiInsightUpdate.mockImplementationOnce(async () => ({
      recommendations: ['Reduce usage tomorrow']
    }));

    mockNotificationFind.mockImplementationOnce(() =>
      chainSelectLean([])
    );

    const req = {
      user: {
        _id: 'user-001',
        save: jest.fn().mockImplementationOnce(async () => true)
      },
      body: {
        apps: [
          {
            appName: 'Instagram',
            packageName: 'com.instagram.android',
            category: 'Social',
            totalTimeInForeground: 40,
            pickups: 3,
            unlocks: 3,
            lastTimeUsed: Date.now()
          }
        ]
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await ingestUsage(req, res as any, next);

    expect(mockBulkWrite).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.syncedCount).toBe(1);
  });
});