import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const makeLeanChain = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const makeSortedLeanChain = (value) => ({
  sort: jest.fn(() => makeLeanChain(value)),
});

const CURRENT_WEEK_START = new Date('2026-03-29T00:00:00.000Z');
const CURRENT_MONTH_START = new Date('2026-03-05T00:00:00.000Z');

const createUsageSessionModel = ({ currentSessions = [], previousSessions = [] } = {}) => ({
  find: jest.fn((query = {}) => {
    const gte = query?.startTime?.$gte;
    const key = gte ? new Date(gte).toISOString().slice(0, 10) : '';

    if (key === '2026-03-29' || key === '2026-03-05') {
      return makeSortedLeanChain(currentSessions);
    }

    return makeSortedLeanChain(previousSessions);
  }),
});

const createAiInsightModel = ({ currentAiInsights = [], previousAiInsights = [] } = {}) => ({
  find: jest.fn((query = {}) => {
    const key = query?.dayKey?.$gte;

    if (key === '2026-03-29' || key === '2026-03-05') {
      return makeSortedLeanChain(currentAiInsights);
    }

    return makeSortedLeanChain(previousAiInsights);
  }),
});

const createSettingsModel = ({ settings = null } = {}) => ({
  findOne: jest.fn(() => makeLeanChain(settings)),
});

const loadAnalyticsController = async ({
  settings = null,
  currentSessions = [],
  previousSessions = [],
  currentAiInsights = [],
  previousAiInsights = [],
  analyticsCurrent = null,
  analyticsPrevious = null,
  comparison = null,
  insights = null,
} = {}) => {
  const UsageSession = createUsageSessionModel({ currentSessions, previousSessions });
  const UserSettings = createSettingsModel({ settings });
  const AiInsight = createAiInsightModel({ currentAiInsights, previousAiInsights });

  const buildAnalytics = jest
    .fn()
    .mockReturnValueOnce(
      analyticsCurrent || {
        totalScreenMinutes: 210,
        averageDailyMinutes: 30,
        pickups: 18,
        unlocks: 12,
        lateNightMinutes: 20,
        peakHourLabel: '21:00',
        categoryBreakdown: [{ category: 'Social Media', minutes: 150, sharePct: 71 }],
        trendPoints: [{ key: '2026-04-04', label: 'Fri, Apr 4', shortLabel: '4/4', minutes: 65 }],
        totalActiveDays: 4,
        bestDayLabel: 'Fri, Apr 4',
        worstDayLabel: 'Tue, Apr 1',
        score: 74,
        riskLevel: 'medium',
      }
    )
    .mockReturnValueOnce(
      analyticsPrevious || {
        totalScreenMinutes: 280,
        averageDailyMinutes: 40,
        pickups: 22,
        unlocks: 15,
        lateNightMinutes: 30,
        peakHourLabel: '22:00',
        categoryBreakdown: [],
        trendPoints: [],
        totalActiveDays: 5,
        bestDayLabel: 'Thu, Mar 27',
        worstDayLabel: 'Mon, Mar 24',
        score: 61,
        riskLevel: 'medium',
      }
    );

  const buildAnalyticsComparison = jest.fn().mockReturnValue(
    comparison || {
      usageChangePct: -25,
      pickupChangePct: -18,
      unlockChangePct: -20,
      direction: 'improving',
      summary: 'Average daily screen time is down 25% versus the previous period.',
    }
  );

  const buildInsightsFromAnalytics = jest.fn().mockReturnValue(
    insights || [
      'Social Media is your top category this period.',
      'Late-night usage is improving.',
    ]
  );

  const analyzeDailyUsage = jest.fn(({ sessions = [], settings: activeSettings = {} }) => {
    const totalScreenMinutes = sessions.reduce(
      (sum, session) => sum + Number(session.durationMinutes || 0),
      0
    );
    const socialMinutes = sessions
      .filter((session) => String(session.category || '').toLowerCase().includes('social'))
      .reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
    const productivityMinutes = sessions
      .filter((session) => String(session.category || '').toLowerCase().includes('product'))
      .reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
    const lateNightMinutes = sessions
      .filter((session) => {
        const hour = new Date(session.startTime).getHours();
        return hour >= 23 || hour < 5;
      })
      .reduce((sum, session) => sum + Number(session.durationMinutes || 0), 0);
    const pickups = sessions.reduce((sum, session) => sum + Number(session.pickups || 0), 0);
    const unlocks = sessions.reduce((sum, session) => sum + Number(session.unlocks || 0), 0);
    const dailyLimit = Number(activeSettings?.dailyLimitMinutes || 240);
    const overLimitMinutes = Math.max(0, totalScreenMinutes - dailyLimit);

    return {
      totalScreenMinutes,
      socialMinutes,
      productivityMinutes,
      lateNightMinutes,
      pickups,
      unlocks,
      dailyLimit,
      score: overLimitMinutes >= 30 ? 40 : overLimitMinutes > 0 ? 63 : 88,
      riskLevel: overLimitMinutes >= 30 ? 'high' : overLimitMinutes > 0 ? 'medium' : 'low',
      reasons: overLimitMinutes >= 30 ? ['Excessive usage', 'Late-night usage'] : ['Balanced usage'],
    };
  });

  const filterUsageSessions = jest.fn((sessions = []) =>
    sessions.filter((session) => !String(session.appPackage || '').includes('systemui'))
  );

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({ default: UsageSession }));
  jest.unstable_mockModule('../../models/UserSettings.js', () => ({ default: UserSettings }));
  jest.unstable_mockModule('../../models/AiInsight.js', () => ({ default: AiInsight }));
  jest.unstable_mockModule('../../utils/asyncHandler.js', () => ({
    asyncHandler:
      (fn) =>
      async (req, res, next) => {
        try {
          return await fn(req, res, next);
        } catch (error) {
          return next(error);
        }
      },
  }));
  jest.unstable_mockModule('../../utils/date.js', () => ({
    formatDayKey: jest.fn((dateLike) => new Date(dateLike).toISOString().slice(0, 10)),
    getRangeStart: jest.fn((range) => {
      if (range === 'day') return new Date('2026-04-04T00:00:00.000Z');
      if (range === 'month') return new Date(CURRENT_MONTH_START);
      return new Date(CURRENT_WEEK_START);
    }),
    isLateNightHour: jest.fn((hour) => hour >= 23 || hour < 5),
  }));
  jest.unstable_mockModule('../../services/analytics.service.js', () => ({
    buildAnalytics,
    buildAnalyticsComparison,
    buildInsightsFromAnalytics,
  }));
  jest.unstable_mockModule('../../services/behavior.service.js', () => ({
    analyzeDailyUsage,
  }));
  jest.unstable_mockModule('../../utils/usageSessionFilters.js', () => ({
    filterUsageSessions,
  }));

  const module = await import('../analytics.controller.js');

  return {
    ...module,
    mocks: {
      UsageSession,
      UserSettings,
      AiInsight,
      buildAnalytics,
      buildAnalyticsComparison,
      buildInsightsFromAnalytics,
      analyzeDailyUsage,
      filterUsageSessions,
    },
  };
};

const makeReq = (query = {}, user = { _id: 'user-1', streakCount: 6, points: 320 }) => ({ query, user });
const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('Module 10 - analytics.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('TC_ANALYTICS_001 getAnalyticsSummary defaults invalid range to week and returns analytics bundle', async () => {
    const { getAnalyticsSummary, mocks } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 180,
        privacySettings: { consentGiven: true, allowAnalyticsForTraining: true },
      },
      currentSessions: [
        {
          user: 'user-1',
          dayKey: '2026-04-04',
          startTime: '2026-04-04T10:00:00.000Z',
          durationMinutes: 70,
          pickups: 5,
          unlocks: 4,
          category: 'Social Media',
          appPackage: 'com.instagram.android',
        },
      ],
      previousSessions: [
        {
          user: 'user-1',
          dayKey: '2026-03-31',
          startTime: '2026-03-31T11:00:00.000Z',
          durationMinutes: 90,
          pickups: 7,
          unlocks: 5,
          category: 'Productivity',
          appPackage: 'com.todo.app',
        },
      ],
    });

    const req = makeReq({ range: 'invalid' });
    const res = makeRes();
    const next = jest.fn();

    await getAnalyticsSummary(req, res, next);

    expect(mocks.buildAnalytics).toHaveBeenCalledTimes(2);
    expect(mocks.buildAnalytics.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        range: 'week',
        sessions: expect.arrayContaining([
          expect.objectContaining({ appPackage: 'com.instagram.android' }),
        ]),
      })
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      range: 'week',
      analytics: expect.objectContaining({
        totalScreenMinutes: 210,
        comparison: expect.objectContaining({ direction: 'improving' }),
      }),
      insights: [
        'Social Media is your top category this period.',
        'Late-night usage is improving.',
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_ANALYTICS_002 getAnalyticsSummary loads previous-window comparison inputs for month range', async () => {
    const { getAnalyticsSummary, mocks } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 200,
        privacySettings: { consentGiven: true, allowAnalyticsForTraining: true },
      },
      currentSessions: [
        {
          dayKey: '2026-04-01',
          startTime: '2026-04-01T09:00:00.000Z',
          durationMinutes: 55,
          pickups: 3,
          unlocks: 2,
          category: 'Productivity',
          appPackage: 'com.todo.app',
        },
      ],
      previousSessions: [
        {
          dayKey: '2026-03-10',
          startTime: '2026-03-10T22:00:00.000Z',
          durationMinutes: 120,
          pickups: 10,
          unlocks: 8,
          category: 'Social Media',
          appPackage: 'com.social.app',
        },
      ],
      currentAiInsights: [{ dayKey: '2026-04-01', score: 86, createdAt: '2026-04-01T10:00:00.000Z' }],
      previousAiInsights: [{ dayKey: '2026-03-10', score: 60, createdAt: '2026-03-10T10:00:00.000Z' }],
    });

    const res = makeRes();
    await getAnalyticsSummary(makeReq({ range: 'month' }), res, jest.fn());

    expect(mocks.buildAnalytics.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        range: 'month',
        aiInsights: [{ dayKey: '2026-04-01', score: 86, createdAt: '2026-04-01T10:00:00.000Z' }],
      })
    );
    expect(mocks.buildAnalytics.mock.calls[1][0]).toEqual(
      expect.objectContaining({
        range: 'month',
        aiInsights: [{ dayKey: '2026-03-10', score: 60, createdAt: '2026-03-10T10:00:00.000Z' }],
      })
    );
    expect(mocks.buildAnalyticsComparison).toHaveBeenCalledTimes(1);
    expect(mocks.buildInsightsFromAnalytics).toHaveBeenCalledTimes(1);
  });

  test('TC_ANALYTICS_003 exportAnalyticsReport returns generated report for month range', async () => {
    const { exportAnalyticsReport } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 180,
        privacySettings: { consentGiven: true, allowAnalyticsForTraining: true },
      },
      currentSessions: [
        {
          dayKey: '2026-04-02',
          startTime: '2026-04-02T10:00:00.000Z',
          durationMinutes: 65,
          pickups: 4,
          unlocks: 3,
          category: 'Productivity',
          appPackage: 'com.todo.app',
        },
      ],
    });

    const res = makeRes();
    await exportAnalyticsReport(makeReq({ range: 'month' }), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      generatedAt: expect.any(Date),
      report: {
        range: 'month',
        analytics: expect.objectContaining({
          totalScreenMinutes: 210,
          comparison: expect.objectContaining({ summary: expect.any(String) }),
        }),
        insights: [
          'Social Media is your top category this period.',
          'Late-night usage is improving.',
        ],
      },
    });
  });

  test('TC_ANALYTICS_004 exportAnonymizedDataset blocks when training consent is disabled', async () => {
    const { exportAnonymizedDataset } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 180,
        privacySettings: {
          consentGiven: true,
          allowAnalyticsForTraining: false,
          anonymizeData: true,
          retentionDays: 30,
        },
      },
    });

    const req = makeReq({ range: 'month', format: 'csv' });
    const res = makeRes();

    await exportAnonymizedDataset(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        'Anonymized dataset export is disabled until the user gives consent and allows analytics for training.',
      privacy: {
        consentGiven: true,
        allowAnalyticsForTraining: false,
        anonymizeData: true,
        retentionDays: 30,
      },
    });
  });

  test('TC_ANALYTICS_005 exportAnonymizedDataset builds anonymized session rows and episode labels', async () => {
    const { exportAnonymizedDataset } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 180,
        privacySettings: {
          consentGiven: true,
          allowAnalyticsForTraining: true,
          anonymizeData: true,
          retentionDays: 45,
        },
      },
      currentSessions: [
        {
          dayKey: '2026-03-29',
          startTime: '2026-03-29T23:15:00.000Z',
          durationMinutes: 160,
          pickups: 40,
          unlocks: 8,
          category: 'Social Media',
          appPackage: 'com.instagram.android',
          platform: 'android',
          source: 'native_bridge',
        },
        {
          dayKey: '2026-03-30',
          startTime: '2026-03-30T09:00:00.000Z',
          durationMinutes: 40,
          pickups: 4,
          unlocks: 3,
          category: 'Productivity',
          appPackage: 'com.todo.app',
          platform: 'android',
          source: 'native_bridge',
        },
      ],
    });

    const res = makeRes();
    await exportAnonymizedDataset(makeReq({ range: 'month', format: 'json' }), res, jest.fn());

    const payload = res.json.mock.calls[0][0];

    expect(payload.success).toBe(true);
    expect(payload.dataset.range).toBe('month');
    expect(payload.dataset.format).toBe('json');
    expect(payload.dataset.summary).toEqual(
      expect.objectContaining({
        sessionCount: 2,
        episodeCount: 2,
        dailyLimitMinutes: 180,
        includesAppNames: false,
        includesPersonalIdentity: false,
      })
    );

    const firstRow = payload.dataset.sessionRows[0];
    expect(firstRow).toEqual(
      expect.objectContaining({
        recordId: 'REC_1',
        category: 'Social Media',
        durationMinutes: 160,
        pickups: 40,
        unlocks: 8,
        riskLevel: 'low',
      })
    );
    expect(firstRow.appToken).toMatch(/^APP_[A-F0-9]{12}$/);
    expect(firstRow.dayToken).toMatch(/^D\d+$/);
    expect(firstRow.relativeDayIndex).toBeGreaterThanOrEqual(0);
    expect(firstRow.hourBucket).toBe(new Date('2026-03-29T23:15:00.000Z').getHours());
    expect([0, 1]).toContain(firstRow.isLateNight);
    expect([0, 1]).toContain(firstRow.isAddictiveBehaviorEpisode);
    expect(['balanced_usage', 'addictive_behavior_episode']).toContain(
      firstRow.behaviorLabel
    );
    expect(firstRow.weekday).toEqual(expect.any(String));
    expect(firstRow.platform).toBe('android');
    expect(firstRow.source).toBe('native_bridge');

    const firstEpisode = payload.dataset.episodeLabels[0];
    expect(firstEpisode).toEqual(
      expect.objectContaining({
        episodeId: 'EP_1',
        totalScreenMinutes: 160,
        dailyLimitMinutes: 180,
        overLimitMinutes: 0,
        riskLevel: 'low',
      })
    );
    expect(firstEpisode.dayToken).toMatch(/^D\d+$/);
    expect(firstEpisode.relativeDayIndex).toBeGreaterThanOrEqual(0);
    expect(firstEpisode.weekday).toEqual(expect.any(String));
    expect(['balanced_usage', 'addictive_behavior_episode']).toContain(
      firstEpisode.behaviorLabel
    );

    expect(payload.dataset.privacy).toEqual({
      consentGiven: true,
      allowAnalyticsForTraining: true,
      anonymizeData: true,
      retentionDays: 45,
    });
  });

  test('TC_ANALYTICS_006 exportAnonymizedDataset returns session and episode CSV strings', async () => {
    const { exportAnonymizedDataset } = await loadAnalyticsController({
      settings: {
        dailyLimitMinutes: 180,
        privacySettings: {
          consentGiven: true,
          allowAnalyticsForTraining: true,
          anonymizeData: true,
          retentionDays: 30,
        },
      },
      currentSessions: [
        {
          dayKey: '2026-03-29',
          startTime: '2026-03-29T23:15:00.000Z',
          durationMinutes: 40,
          pickups: 4,
          unlocks: 3,
          category: 'Social Media',
          appPackage: 'com.instagram.android',
          platform: 'android',
          source: 'native_bridge',
        },
      ],
    });

    const res = makeRes();
    await exportAnonymizedDataset(makeReq({ range: 'month', format: 'csv' }), res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.dataset.sessionRowsCsv).toContain('recordId,dayToken,relativeDayIndex');
    expect(payload.dataset.sessionRowsCsv).toContain('"REC_1"');
    expect(payload.dataset.episodeLabelsCsv).toContain('episodeId,dayToken,relativeDayIndex');
    expect(payload.dataset.episodeLabelsCsv).toContain('"EP_1"');
  });
});