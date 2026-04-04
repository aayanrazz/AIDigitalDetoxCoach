import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeFindSortLean = value => ({
  sort: jest.fn(() => ({
    lean: jest.fn().mockResolvedValue(value),
  })),
});

const loadUsageController = async ({
  usageFind,
  userSettingsFindOne,
  userSettingsCreate,
  aiInsightFindOne,
  appLimitFind,
} = {}) => {
  const UsageSession = {
    find: usageFind ?? jest.fn(() => makeFindSortLean([])),
  };

  const UserSettings = {
    findOne:
      userSettingsFindOne ??
      jest.fn().mockResolvedValue({
        user: 'user-1',
        dailyLimitMinutes: 180,
        notificationSettings: { limitWarnings: true },
      }),
    create: userSettingsCreate ?? jest.fn(),
  };

  const AiInsight = {
    findOne: aiInsightFindOne ?? jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
  };

  const Notification = {
    find: jest.fn(),
    insertMany: jest.fn(),
  };

  const AppLimit = {
    find: appLimitFind ?? jest.fn(() => makeFindSortLean([])),
  };

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
  jest.unstable_mockModule('../../models/AppLimit.js', () => ({
    default: AppLimit,
  }));

  const controller = await import('../usage.controller.js');

  return {
    ...controller,
    mocks: {
      UsageSession,
      UserSettings,
      AiInsight,
      AppLimit,
    },
  };
};

describe('Module 6 - usage.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_USAGESYNC_013 getTodayUsage returns persisted aiInsight, sessions, and app-limit summary', async () => {
    const usageFind = jest.fn(() =>
      makeFindSortLean([
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          durationMinutes: 120,
          pickups: 12,
          unlocks: 14,
          startTime: '2026-04-04T10:00:00.000Z',
          endTime: '2026-04-04T12:00:00.000Z',
          source: 'native_bridge',
          platform: 'android',
          dayKey: '2026-04-04',
        },
      ])
    );

    const appLimitFind = jest.fn(() =>
      makeFindSortLean([
        {
          appName: 'Instagram',
          appPackage: 'com.instagram.android',
          category: 'Social Media',
          dailyLimitMinutes: 60,
        },
      ])
    );

    const aiInsightFindOne = jest.fn(() => ({
      lean: jest.fn().mockResolvedValue({
        score: 41,
        riskLevel: 'high',
        totalScreenMinutes: 120,
        recommendations: ['Reduce Instagram use'],
      }),
    }));

    const { getTodayUsage } = await loadUsageController({
      usageFind,
      aiInsightFindOne,
      appLimitFind,
      userSettingsFindOne: jest.fn().mockResolvedValue({
        user: 'user-1',
        dailyLimitMinutes: 60,
        notificationSettings: { limitWarnings: true },
      }),
    });

    const req = {
      user: { _id: 'user-1' },
    };
    const res = makeRes();
    const next = jest.fn();

    await getTodayUsage(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        sessions: [
          expect.objectContaining({
            appName: 'Instagram',
            appPackage: 'com.instagram.android',
            durationMinutes: 120,
          }),
        ],
        appLimitSummary: expect.objectContaining({
          exceededCount: 1,
          topExceededApp: expect.objectContaining({
            appName: 'Instagram',
            exceededMinutes: 60,
          }),
        }),
        totalMinutes: 120,
        aiInsight: {
          score: 41,
          riskLevel: 'high',
          totalScreenMinutes: 120,
          recommendations: ['Reduce Instagram use'],
        },
        todayUsage: expect.objectContaining({
          dayKey: expect.any(String),
          totalMinutes: 120,
          focusScore: 89,
          riskLevel: 'medium',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_USAGESYNC_014 getTodayUsage falls back to analysis-derived aiInsight when no persisted insight exists', async () => {
    const usageFind = jest.fn(() =>
      makeFindSortLean([
        {
          appName: 'Docs',
          appPackage: 'com.google.android.apps.docs',
          category: 'Productivity',
          durationMinutes: 45,
          pickups: 4,
          unlocks: 4,
          startTime: '2026-04-04T09:00:00.000Z',
          endTime: '2026-04-04T09:45:00.000Z',
          source: 'native_bridge',
          platform: 'android',
          dayKey: '2026-04-04',
        },
      ])
    );

    const { getTodayUsage } = await loadUsageController({
      usageFind,
      aiInsightFindOne: jest.fn(() => ({ lean: jest.fn().mockResolvedValue(null) })),
      appLimitFind: jest.fn(() => makeFindSortLean([])),
      userSettingsFindOne: jest.fn().mockResolvedValue({
        user: 'user-1',
        dailyLimitMinutes: 180,
        notificationSettings: { limitWarnings: true },
      }),
    });

    const req = {
      user: { _id: 'user-1' },
    };
    const res = makeRes();
    const next = jest.fn();

    await getTodayUsage(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        totalMinutes: 45,
        aiInsight: {
          score: 100,
          riskLevel: 'low',
          totalScreenMinutes: 45,
          recommendations: ['Great job. Maintain your current digital wellness routine.'],
        },
        todayUsage: expect.objectContaining({
          totalMinutes: 45,
          focusScore: 100,
          riskLevel: 'low',
        }),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});