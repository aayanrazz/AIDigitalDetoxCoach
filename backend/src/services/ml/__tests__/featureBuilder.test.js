import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const makeLeanResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const loadFeatureBuilder = async ({
  settings = null,
  appLimits = [],
  currentDaySessions = [],
  yesterdaySessions = [],
  weekSessions = [],
} = {}) => {
  const UserSettings = {
    findOne: jest.fn(() => makeLeanResult(settings)),
  };

  const AppLimit = {
    find: jest.fn(() => makeLeanResult(appLimits)),
  };

  const UsageSession = {
    find: jest.fn((query = {}) => {
      if (query?.dayKey === '2026-04-04') {
        return makeLeanResult(currentDaySessions);
      }

      if (query?.dayKey === '2026-04-03') {
        return makeLeanResult(yesterdaySessions);
      }

      if (query?.startTime) {
        return makeLeanResult(weekSessions);
      }

      return makeLeanResult([]);
    }),
  };

  jest.unstable_mockModule('../../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));

  jest.unstable_mockModule('../../../models/AppLimit.js', () => ({
    default: AppLimit,
  }));

  jest.unstable_mockModule('../../../models/UsageSession.js', () => ({
    default: UsageSession,
  }));

  const module = await import('../featureBuilder.js');

  return {
    ...module,
    mocks: {
      UserSettings,
      AppLimit,
      UsageSession,
    },
  };
};

describe('Module 7 - featureBuilder.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('TC_ML_001 buildMlFeaturesForDay builds normalized feature row from settings, sessions, and app limits', async () => {
    const settings = {
      dailyLimitMinutes: 100,
      focusAreas: ['Productivity', 'Sleep'],
      theme: 'light',
      sleepSchedule: {
        bedTime: '22:30',
        wakeTime: '06:45',
      },
      notificationSettings: {
        gentleNudges: false,
        dailySummaries: true,
        achievementAlerts: false,
        limitWarnings: true,
      },
      integrations: {
        googleFitConnected: true,
      },
    };

    const appLimits = [
      {
        appPackage: 'com.social.app',
        dailyLimitMinutes: 50,
      },
      {
        appPackage: 'com.work.app',
        dailyLimitMinutes: 30,
      },
    ];

    const currentDaySessions = [
      {
        appPackage: 'com.social.app',
        appName: 'Social App',
        category: 'social networking',
        durationMinutes: 70,
        pickups: 8,
        unlocks: 5,
        startTime: '2026-04-04T14:00:00.000Z',
      },
      {
        appPackage: 'com.work.app',
        appName: 'Work App',
        category: 'productive tools',
        durationMinutes: 40,
        pickups: 3,
        unlocks: 2,
        startTime: '2026-04-04T23:30:00.000Z',
      },
      {
        appPackage: 'com.android.systemui',
        appName: 'System UI',
        category: 'Other',
        durationMinutes: 999,
        pickups: 99,
        unlocks: 99,
        startTime: '2026-04-04T10:00:00.000Z',
      },
    ];

    const yesterdaySessions = [
      {
        appPackage: 'com.yesterday.app',
        appName: 'Yesterday App',
        category: 'Social Media',
        durationMinutes: 120,
        pickups: 10,
        unlocks: 6,
        startTime: '2026-04-03T13:00:00.000Z',
      },
    ];

    const weekSessions = [
      {
        appPackage: 'com.a',
        appName: 'A',
        category: 'Social Media',
        durationMinutes: 70,
        pickups: 2,
        unlocks: 1,
        startTime: '2026-03-29T10:00:00.000Z',
      },
      {
        appPackage: 'com.b',
        appName: 'B',
        category: 'Productivity',
        durationMinutes: 70,
        pickups: 2,
        unlocks: 1,
        startTime: '2026-03-31T11:00:00.000Z',
      },
      {
        appPackage: 'com.c',
        appName: 'C',
        category: 'Streaming',
        durationMinutes: 70,
        pickups: 2,
        unlocks: 1,
        startTime: '2026-04-04T18:00:00.000Z',
      },
    ];

    const { buildMlFeaturesForDay, mocks } = await loadFeatureBuilder({
      settings,
      appLimits,
      currentDaySessions,
      yesterdaySessions,
      weekSessions,
    });

    const result = await buildMlFeaturesForDay({
      user: { _id: 'user-1' },
      date: new Date('2026-04-04T16:00:00.000Z'),
    });

    expect(mocks.UserSettings.findOne).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.AppLimit.find).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.UsageSession.find).toHaveBeenCalledWith({
      user: 'user-1',
      dayKey: '2026-04-04',
    });

    expect(result.dayKey).toBe('2026-04-04');
    expect(result.sessions).toHaveLength(2);
    expect(result.featureRow).toEqual(
      expect.objectContaining({
        dayOfWeek: 'Sat',
        isWeekend: 1,
        dailyLimitMinutes: 100,
        bedTimeMinutes: 1350,
        wakeTimeMinutes: 405,
        gentleNudgesEnabled: 0,
        dailySummariesEnabled: 1,
        achievementAlertsEnabled: 0,
        limitWarningsEnabled: 1,
        googleFitConnected: 1,
        focusPrimary: 'Productivity',
        focusSecondary: 'Sleep',
        theme: 'light',
        sessionCount: 2,
        totalScreenMinutes: 110,
        pickups: 11,
        unlocks: 7,
        lateNightMinutes: 40,
        avgSessionMinutes: 55,
        longestSessionMinutes: 70,
        peakHour: new Date('2026-04-04T14:00:00.000Z').getHours(),
        sevenDayAvgScreenMinutes: 30,
        yesterdayScore: 96,
        overLimitMinutes: 10,
        monitoredAppCount: 2,
        overLimitAppsCount: 2,
        topExceededMinutes: 20,
        socialMinutes: 70,
        productivityMinutes: 40,
        communicationMinutes: 0,
        educationMinutes: 0,
        streamingMinutes: 0,
        gamingMinutes: 0,
        otherMinutes: 0,
      })
    );

    expect(result.dailyAnalysis).toEqual(
      expect.objectContaining({
        score: 93,
        riskLevel: 'medium',
        totalScreenMinutes: 110,
        pickups: 11,
        unlocks: 7,
        lateNightMinutes: 40,
      })
    );
  });

  it('TC_ML_002 buildMlFeaturesForDay applies safe defaults when settings and history are missing', async () => {
    const { buildMlFeaturesForDay, mocks } = await loadFeatureBuilder({
      settings: null,
      appLimits: [],
      currentDaySessions: [],
      yesterdaySessions: [],
      weekSessions: [],
    });

    const result = await buildMlFeaturesForDay({
      user: { _id: 'user-2' },
      date: new Date('2026-04-04T09:00:00.000Z'),
      sessions: [],
    });

    expect(mocks.UsageSession.find).toHaveBeenCalledTimes(2);
    expect(result.sessions).toEqual([]);
    expect(result.dailyAnalysis).toEqual(
      expect.objectContaining({
        score: 100,
        riskLevel: 'low',
        totalScreenMinutes: 0,
      })
    );

    expect(result.featureRow).toEqual(
      expect.objectContaining({
        dailyLimitMinutes: 180,
        bedTimeMinutes: 1380,
        wakeTimeMinutes: 420,
        gentleNudgesEnabled: 1,
        dailySummariesEnabled: 1,
        achievementAlertsEnabled: 1,
        limitWarningsEnabled: 1,
        googleFitConnected: 0,
        focusPrimary: 'Social Media',
        focusSecondary: 'General Balance',
        theme: 'dark',
        sessionCount: 0,
        totalScreenMinutes: 0,
        pickups: 0,
        unlocks: 0,
        lateNightMinutes: 0,
        avgSessionMinutes: 0,
        longestSessionMinutes: 0,
        peakHour: 0,
        sevenDayAvgScreenMinutes: 0,
        yesterdayScore: 0,
        overLimitMinutes: 0,
        monitoredAppCount: 0,
        overLimitAppsCount: 0,
        topExceededMinutes: 0,
      })
    );
  });
});