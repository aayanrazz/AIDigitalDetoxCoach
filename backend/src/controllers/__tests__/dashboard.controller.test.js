import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const makeSortedChain = (value) => ({
  sort: jest.fn().mockResolvedValue(value),
});

const makeUserQueryChain = (value) => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      select: jest.fn().mockResolvedValue(value),
    })),
  })),
});

const loadDashboardController = async ({
  settings = null,
  createdSettings = null,
  todaySessions = [],
  currentWeekSessions = [],
  previousWeekSessions = [],
  appLimits = [],
  todayAnalysis = null,
  appLimitSummary = null,
  mlInsight = null,
  currentAnalytics = null,
  previousAnalytics = null,
  activePlan = null,
  unreadNotifications = 0,
  leaderboard = [],
  levelProgress = null,
  badges = [],
  nextBadgeHint = null,
} = {}) => {
  const UserSettings = {
    findOne: jest.fn().mockResolvedValue(settings),
    create: jest.fn().mockResolvedValue(createdSettings ?? settings),
  };

  const UsageSession = {
    find: jest.fn((query = {}) => {
      if (query?.dayKey === '2026-04-04') {
        return Promise.resolve(todaySessions);
      }

      if (query?.startTime?.$lte) {
        return Promise.resolve(currentWeekSessions);
      }

      if (query?.startTime?.$lt) {
        return Promise.resolve(previousWeekSessions);
      }

      return Promise.resolve([]);
    }),
  };

  const AppLimit = {
    find: jest.fn(() => ({
      lean: jest.fn().mockResolvedValue(appLimits),
    })),
  };

  const AiInsight = {
    findOne: jest.fn(() => makeSortedChain(mlInsight)),
  };

  const DetoxPlan = {
    findOne: jest.fn(() => makeSortedChain(activePlan)),
  };

  const Notification = {
    countDocuments: jest.fn().mockResolvedValue(unreadNotifications),
  };

  const User = {
    find: jest.fn(() => makeUserQueryChain(leaderboard)),
  };

  const analyzeDailyUsage = jest.fn().mockReturnValue(
    todayAnalysis ?? {
      score: 64,
      riskLevel: 'medium',
      pickups: 12,
      unlocks: 9,
      totalScreenMinutes: 180,
      recommendations: ['Reduce short check-ins.'],
    }
  );

  const evaluateAppLimits = jest.fn().mockReturnValue(
    appLimitSummary ?? {
      exceededCount: 0,
      topExceededApp: null,
    }
  );

  const buildAnalytics = jest
    .fn()
    .mockReturnValueOnce(
      currentAnalytics ?? {
        averageDailyMinutes: 120,
      }
    )
    .mockReturnValueOnce(
      previousAnalytics ?? {
        averageDailyMinutes: 180,
      }
    );

  const getLevelProgressFromPoints = jest.fn().mockReturnValue(
    levelProgress ?? {
      level: { number: 3, title: 'Focused Builder' },
      progressPct: 65,
      pointsToNextLevel: 140,
    }
  );

  const getUnlockedBadgeDetails = jest.fn().mockReturnValue(badges);
  const getNextBadgeHint = jest.fn().mockReturnValue(nextBadgeHint);

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({
    default: UsageSession,
  }));
  jest.unstable_mockModule('../../models/DetoxPlan.js', () => ({
    default: DetoxPlan,
  }));
  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));
  jest.unstable_mockModule('../../models/User.js', () => ({
    default: User,
  }));
  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));
  jest.unstable_mockModule('../../models/AppLimit.js', () => ({
    default: AppLimit,
  }));
  jest.unstable_mockModule('../../models/AiInsight.js', () => ({
    default: AiInsight,
  }));
  jest.unstable_mockModule('../../services/behavior.service.js', () => ({
    analyzeDailyUsage,
    evaluateAppLimits,
  }));
  jest.unstable_mockModule('../../services/analytics.service.js', () => ({
    buildAnalytics,
  }));
  jest.unstable_mockModule('../../services/gamification.service.js', () => ({
    getLevelProgressFromPoints,
    getUnlockedBadgeDetails,
    getNextBadgeHint,
  }));
  jest.unstable_mockModule('../../utils/date.js', () => ({
    formatDayKey: jest.fn(() => '2026-04-04'),
    getRangeStart: jest.fn(() => new Date('2026-03-29T00:00:00.000Z')),
  }));

  const module = await import('../dashboard.controller.js');

  return {
    ...module,
    mocks: {
      UserSettings,
      UsageSession,
      AppLimit,
      AiInsight,
      Notification,
      User,
      DetoxPlan,
      analyzeDailyUsage,
      evaluateAppLimits,
      buildAnalytics,
      getLevelProgressFromPoints,
      getUnlockedBadgeDetails,
      getNextBadgeHint,
    },
  };
};

const makeReq = (overrides = {}) => ({
  user: {
    _id: 'user-1',
    name: 'Aayan',
    points: 320,
    streakCount: 5,
    badges: ['starter'],
    ...overrides,
  },
});

const makeRes = () => ({
  json: jest.fn(),
});

describe('Module 9 - dashboard.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T10:00:00.000Z'));
  });

  test('TC_DASH_001 getDashboard creates default settings when missing and maps base dashboard response', async () => {
    const createdSettings = {
      user: 'user-1',
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: { limitWarnings: true, dailySummaries: true },
    };

    const { getDashboard, mocks } = await loadDashboardController({
      settings: null,
      createdSettings,
      badges: [],
      nextBadgeHint: { hint: 'Keep going for your next badge.' },
    });

    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await getDashboard(req, res, next);

    expect(mocks.UserSettings.create).toHaveBeenCalledWith({ user: 'user-1' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      dashboard: expect.objectContaining({
        userName: 'Aayan',
        digitalWellnessScore: 64,
        riskLevel: 'medium',
        predictionSource: 'rule_based_fallback',
        mlConfidence: 0,
        dailyGoal: 180,
        unreadNotifications: 0,
        currentLevelNumber: 3,
        currentLevelTitle: 'Focused Builder',
        progressPct: 65,
        pointsToNextLevel: 140,
        badgesCount: 0,
        latestBadgeLabel: '',
        nextBadgeHintText: 'Keep going for your next badge.',
      }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_DASH_002 getDashboard prefers ML insight over rule-based fallback for score and risk fields', async () => {
    const { getDashboard } = await loadDashboardController({
      settings: {
        dailyLimitMinutes: 150,
        focusAreas: ['Productivity'],
        sleepSchedule: { bedTime: '22:30', wakeTime: '06:30' },
        notificationSettings: { limitWarnings: true, gentleNudges: false },
      },
      todayAnalysis: {
        score: 48,
        riskLevel: 'high',
        pickups: 7,
        unlocks: 5,
        totalScreenMinutes: 160,
        recommendations: ['Rule fallback recommendation'],
      },
      mlInsight: {
        score: 82,
        riskLevel: 'low',
        predictionSource: 'tensorflow',
        mlConfidence: 0.93,
      },
    });

    const req = makeReq({ points: 140, streakCount: 2 });
    const res = makeRes();
    const next = jest.fn();

    await getDashboard(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      dashboard: expect.objectContaining({
        digitalWellnessScore: 82,
        riskLevel: 'low',
        predictionSource: 'tensorflow',
        mlConfidence: 0.93,
      }),
    });
  });

  test('TC_DASH_003 getDashboard returns unread notifications and intervention message fields from app limits', async () => {
    const { getDashboard } = await loadDashboardController({
      settings: {
        dailyLimitMinutes: 180,
        focusAreas: ['Social Media'],
        sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
        notificationSettings: { limitWarnings: true },
      },
      appLimits: [
        { appPackage: 'com.instagram.android', dailyLimitMinutes: 60 },
      ],
      appLimitSummary: {
        exceededCount: 2,
        topExceededApp: {
          appName: 'Instagram',
          exceededMinutes: 25,
        },
      },
      unreadNotifications: 4,
    });

    const res = makeRes();
    await getDashboard(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      dashboard: expect.objectContaining({
        unreadNotifications: 4,
        overLimitAppsCount: 2,
        topExceededAppName: 'Instagram',
        topExceededMinutes: 25,
        interventionMessage:
          'Instagram is 25 minutes over its daily limit, and 1 more tracked app also exceeded today.',
      }),
    });
  });

  test('TC_DASH_004 getDashboard maps pending detox task into daily challenge and level badge fields', async () => {
    const { getDashboard } = await loadDashboardController({
      settings: {
        dailyLimitMinutes: 200,
        focusAreas: ['Gaming'],
        sleepSchedule: { bedTime: '22:00', wakeTime: '06:00' },
        notificationSettings: { limitWarnings: true },
      },
      activePlan: {
        days: [
          {
            status: 'in_progress',
            tasks: [
              { status: 'pending', title: 'Leave social apps closed for 1 hour' },
            ],
          },
        ],
      },
      badges: [
        { label: 'Starter', emoji: '🌱' },
        { label: 'Focus Guard', emoji: '🛡️' },
      ],
      nextBadgeHint: {
        hint: 'Finish one more challenge to unlock Deep Work.',
      },
    });

    const res = makeRes();
    await getDashboard(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      dashboard: expect.objectContaining({
        dailyChallenge: 'Leave social apps closed for 1 hour',
        badgesCount: 2,
        latestBadgeLabel: 'Focus Guard',
        latestBadgeEmoji: '🛡️',
        nextBadgeHintText: 'Finish one more challenge to unlock Deep Work.',
      }),
    });
  });

  test('TC_DASH_005 getDashboard builds settings-driven recommendations and weekly improvement percentage', async () => {
    const { getDashboard } = await loadDashboardController({
      settings: {
        dailyLimitMinutes: 190,
        focusAreas: ['Productivity'],
        sleepSchedule: { bedTime: '22:15', wakeTime: '06:45' },
        notificationSettings: {
          gentleNudges: false,
          dailySummaries: true,
          limitWarnings: true,
        },
      },
      todayAnalysis: {
        score: 75,
        riskLevel: 'low',
        pickups: 5,
        unlocks: 4,
        totalScreenMinutes: 120,
        recommendations: ['Reduce app switching in the evening.'],
      },
      currentAnalytics: {
        averageDailyMinutes: 120,
      },
      previousAnalytics: {
        averageDailyMinutes: 200,
      },
    });

    const res = makeRes();
    await getDashboard(makeReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      dashboard: expect.objectContaining({
        improvementVsLastWeek: 40,
        aiRecommendations: expect.arrayContaining([
          'Reduce app switching in the evening.',
          "Today's coaching is centered on your focus area: Productivity.",
          'Begin your low-distraction wind-down before 10:15 PM.',
          'Aim for a mindful start after 6:45 AM.',
          'Gentle nudges are off, so rely more on your dashboard and plan check-ins.',
          'Check your daily summary each evening to reflect on progress.',
        ]),
      }),
    });
  });
});