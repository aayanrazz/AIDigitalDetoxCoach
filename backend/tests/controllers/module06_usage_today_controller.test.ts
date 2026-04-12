import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUsageFind: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockAiInsightFindOne: any = jest.fn();
const mockAppLimitFind: any = jest.fn();
const mockAnalyzeDailyUsage: any = jest.fn();
const mockEvaluateAppLimits: any = jest.fn();
const mockFormatDayKey: any = jest.fn();
const mockFilterUsageSessions: any = jest.fn();
const mockNormalizeUsageCategory: any = jest.fn((value: string) => value || 'Other');
const mockGetSessionDurationMinutes: any = jest.fn((value: any) => Number(value?.durationMinutes || 0));
const mockToSafeNumber: any = jest.fn((value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
});

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
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
    findOne: mockAiInsightFindOne
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {}
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
  normalizeUsageSession: (value: any) => value,
  normalizeUsageCategory: mockNormalizeUsageCategory,
  getSessionDurationMinutes: mockGetSessionDurationMinutes,
  toSafeNumber: mockToSafeNumber
}));

const { getTodayUsage } = await import('../../src/controllers/usage.controller.js');

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

function chainLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  return { lean };
}

describe('Module 6 - usage.controller.js (today usage summary)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDayKey.mockReturnValue('2026-04-12');
    mockFilterUsageSessions.mockImplementation((items: any[]) => items);
  });

  it('TC_USAGE_TODAY_CTRL_001 - getTodayUsage returns today usage summary with app limit information', async () => {
    mockUsageFind.mockImplementationOnce(() =>
      chainSortLean([
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social',
          durationMinutes: 55,
          pickups: 5,
          unlocks: 5,
          startTime: new Date(),
          endTime: new Date(),
          source: 'native_bridge',
          dayKey: '2026-04-12'
        }
      ])
    );

    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 120,
      notificationSettings: { limitWarnings: true }
    }));

    mockAiInsightFindOne.mockImplementationOnce(() =>
      chainLean({
        score: 68,
        riskLevel: 'medium',
        recommendations: ['Take a break']
      })
    );

    mockAppLimitFind.mockImplementationOnce(() =>
      chainSortLean([
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          dailyLimitMinutes: 30
        }
      ])
    );

    mockAnalyzeDailyUsage.mockImplementationOnce(() => ({
      score: 68,
      riskLevel: 'medium',
      totalScreenMinutes: 55,
      recommendations: ['Take a break']
    }));

    mockEvaluateAppLimits.mockImplementationOnce(() => ({
      monitoredApps: [{ appName: 'Instagram' }],
      exceededApps: [{ appName: 'Instagram', exceededMinutes: 25 }],
      exceededCount: 1,
      topExceededApp: { appName: 'Instagram', exceededMinutes: 25 }
    }));

    const req = {
      user: { _id: 'user-001' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await getTodayUsage(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalMinutes).toBe(55);
    expect(res.body.appLimitSummary.exceededCount).toBe(1);
    expect(res.body.todayUsage.topApps[0].appName).toBe('Instagram');
  });

  it('TC_USAGE_TODAY_CTRL_002 - getTodayUsage creates default settings when no settings document exists', async () => {
    mockUsageFind.mockImplementationOnce(() => chainSortLean([]));

    mockSettingsFindOne.mockImplementationOnce(async () => null);
    mockSettingsCreate.mockImplementationOnce(async () => ({
      user: 'user-001',
      dailyLimitMinutes: 180,
      notificationSettings: {}
    }));

    mockAiInsightFindOne.mockImplementationOnce(() => chainLean(null));
    mockAppLimitFind.mockImplementationOnce(() => chainSortLean([]));

    mockAnalyzeDailyUsage.mockImplementationOnce(() => ({
      score: 100,
      riskLevel: 'low',
      totalScreenMinutes: 0,
      recommendations: []
    }));

    mockEvaluateAppLimits.mockImplementationOnce(() => ({
      monitoredApps: [],
      exceededApps: [],
      exceededCount: 0,
      topExceededApp: null
    }));

    const req = {
      user: { _id: 'user-001' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await getTodayUsage(req, res as any, next);

    expect(mockSettingsCreate).toHaveBeenCalledWith({ user: 'user-001' });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalMinutes).toBe(0);
  });
});