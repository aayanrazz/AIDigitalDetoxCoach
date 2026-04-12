import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUsageFind: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockAiInsightFind: any = jest.fn();
const mockBuildAnalytics: any = jest.fn();
const mockBuildAnalyticsComparison: any = jest.fn();
const mockBuildInsightsFromAnalytics: any = jest.fn();
const mockAnalyzeDailyUsage: any = jest.fn();
const mockFormatDayKey: any = jest.fn();
const mockGetRangeStart: any = jest.fn();
const mockIsLateNightHour: any = jest.fn();
const mockFilterUsageSessions: any = jest.fn((sessions: any[]) => sessions);

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
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
    find: mockAiInsightFind
  }
}));

jest.unstable_mockModule('../../src/utils/date.js', () => ({
  formatDayKey: mockFormatDayKey,
  getRangeStart: mockGetRangeStart,
  isLateNightHour: mockIsLateNightHour
}));

jest.unstable_mockModule('../../src/services/analytics.service.js', () => ({
  buildAnalytics: mockBuildAnalytics,
  buildAnalyticsComparison: mockBuildAnalyticsComparison,
  buildInsightsFromAnalytics: mockBuildInsightsFromAnalytics
}));

jest.unstable_mockModule('../../src/services/behavior.service.js', () => ({
  analyzeDailyUsage: mockAnalyzeDailyUsage
}));

jest.unstable_mockModule('../../src/utils/usageSessionFilters.js', () => ({
  filterUsageSessions: mockFilterUsageSessions
}));

const {
  getAnalyticsSummary,
  exportAnalyticsReport,
  exportAnonymizedDataset
} = await import('../../src/controllers/analytics.controller.js');

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

function makeSortLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);

  const sort: any = jest.fn(() => ({
    lean
  }));

  return { sort };
}

function makeLean(value: any) {
  const lean: any = jest.fn();
  lean.mockImplementationOnce(async () => value);
  return { lean };
}

describe('Module 10 - analytics.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRangeStart.mockImplementation((range: string) => {
      if (range === 'month') {
        return new Date('2026-03-01T00:00:00.000Z');
      }
      return new Date('2026-04-01T00:00:00.000Z');
    });
    mockFormatDayKey.mockImplementation((dateLike: any) => {
      const d = new Date(dateLike);
      return d.toISOString().slice(0, 10);
    });
    mockIsLateNightHour.mockImplementation((hour: number) => hour >= 23 || hour < 5);
    mockFilterUsageSessions.mockImplementation((sessions: any[]) => sessions);
  });

  it('TC_ANALYTICS_CTRL_001 - getAnalyticsSummary defaults invalid range to week and returns analytics with comparison and insights', async () => {
    mockUsageFind
      .mockImplementationOnce(() => makeSortLean([
        {
          user: 'user-001',
          dayKey: '2026-04-02',
          startTime: new Date('2026-04-02T10:00:00.000Z'),
          durationMinutes: 45,
          category: 'Social',
          appPackage: 'com.instagram.android'
        }
      ]))
      .mockImplementationOnce(() => makeSortLean([
        {
          user: 'user-001',
          dayKey: '2026-03-31',
          startTime: new Date('2026-03-31T10:00:00.000Z'),
          durationMinutes: 60,
          category: 'Video',
          appPackage: 'com.google.android.youtube'
        }
      ]));

    mockAiInsightFind
      .mockImplementationOnce(() => makeSortLean([
        { user: 'user-001', dayKey: '2026-04-02', score: 70, riskLevel: 'medium' }
      ]))
      .mockImplementationOnce(() => makeSortLean([
        { user: 'user-001', dayKey: '2026-03-31', score: 55, riskLevel: 'high' }
      ]));

    mockBuildAnalytics
      .mockImplementationOnce(() => ({ totalMinutes: 45, averageDailyMinutes: 45, score: 70 }))
      .mockImplementationOnce(() => ({ totalMinutes: 60, averageDailyMinutes: 60, score: 55 }));

    mockBuildAnalyticsComparison.mockImplementationOnce(() => ({
      averageDailyMinutesDelta: -15,
      scoreDelta: 15
    }));

    mockBuildInsightsFromAnalytics.mockImplementationOnce(() => [
      'Usage improved compared with the previous window.'
    ]);

    const req = {
      user: { _id: 'user-001', name: 'Aayan' },
      query: { range: 'year' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await getAnalyticsSummary(req, res as any, next);

    expect(mockGetRangeStart).toHaveBeenCalledWith('week');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      range: 'week',
      analytics: {
        totalMinutes: 45,
        averageDailyMinutes: 45,
        score: 70,
        comparison: {
          averageDailyMinutesDelta: -15,
          scoreDelta: 15
        }
      },
      insights: ['Usage improved compared with the previous window.']
    });
  });

  it('TC_ANALYTICS_CTRL_002 - exportAnalyticsReport returns generated report for normalized month range', async () => {
    mockUsageFind
      .mockImplementationOnce(() => makeSortLean([]))
      .mockImplementationOnce(() => makeSortLean([]));

    mockAiInsightFind
      .mockImplementationOnce(() => makeSortLean([]))
      .mockImplementationOnce(() => makeSortLean([]));

    mockBuildAnalytics
      .mockImplementationOnce(() => ({ totalMinutes: 120, averageDailyMinutes: 30, score: 82 }))
      .mockImplementationOnce(() => ({ totalMinutes: 150, averageDailyMinutes: 37.5, score: 74 }));

    mockBuildAnalyticsComparison.mockImplementationOnce(() => ({
      totalMinutesDelta: -30,
      scoreDelta: 8
    }));

    mockBuildInsightsFromAnalytics.mockImplementationOnce(() => [
      'Your monthly trend is moving in the right direction.'
    ]);

    const req = {
      user: { _id: 'user-001', name: 'Aayan' },
      query: { range: 'month' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await exportAnalyticsReport(req, res as any, next);

    expect(mockGetRangeStart).toHaveBeenCalledWith('month');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.generatedAt).toBeTruthy();
    expect(res.body.report).toEqual({
      range: 'month',
      analytics: {
        totalMinutes: 120,
        averageDailyMinutes: 30,
        score: 82,
        comparison: {
          totalMinutesDelta: -30,
          scoreDelta: 8
        }
      },
      insights: ['Your monthly trend is moving in the right direction.']
    });
  });

  it('TC_ANALYTICS_CTRL_003 - exportAnonymizedDataset blocks export when privacy consent or training consent is missing', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      makeLean({
        privacySettings: {
          consentGiven: false,
          allowAnalyticsForTraining: false,
          anonymizeData: true,
          retentionDays: 30
        }
      })
    );

    const req = {
      user: { _id: 'user-001' },
      query: { range: 'month', format: 'csv' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await exportAnonymizedDataset(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message:
        'Anonymized dataset export is disabled until the user gives consent and allows analytics for training.',
      privacy: {
        consentGiven: false,
        allowAnalyticsForTraining: false,
        anonymizeData: true,
        retentionDays: 30
      }
    });
  });

  it('TC_ANALYTICS_CTRL_004 - exportAnonymizedDataset returns anonymized rows, episode labels, and csv output when consent is enabled', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      makeLean({
        dailyLimitMinutes: 180,
        privacySettings: {
          consentGiven: true,
          allowAnalyticsForTraining: true,
          anonymizeData: true,
          retentionDays: 90
        }
      })
    );

    mockUsageFind.mockImplementationOnce(() =>
      makeSortLean([
        {
          user: 'user-001',
          dayKey: '2026-03-02',
          startTime: new Date('2026-03-02T23:15:00.000Z'),
          durationMinutes: 80,
          pickups: 11,
          unlocks: 9,
          appPackage: 'com.instagram.android',
          category: 'Social',
          platform: 'android',
          source: 'native_bridge'
        }
      ])
    );

    mockAnalyzeDailyUsage.mockImplementationOnce(() => ({
      totalScreenMinutes: 80,
      socialMinutes: 80,
      productivityMinutes: 0,
      lateNightMinutes: 50,
      pickups: 11,
      unlocks: 9,
      dailyLimit: 60,
      score: 42,
      riskLevel: 'high',
      reasons: ['Late-night overuse and above-limit screen time']
    }));

    const req = {
      user: { _id: 'user-001' },
      query: { range: 'month', format: 'csv' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await exportAnonymizedDataset(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataset.range).toBe('month');
    expect(res.body.dataset.format).toBe('csv');
    expect(res.body.dataset.summary).toEqual(
      expect.objectContaining({
        sessionCount: 1,
        episodeCount: 1,
        dailyLimitMinutes: 180,
        includesAppNames: false,
        includesPersonalIdentity: false
      })
    );
    expect(res.body.dataset.privacy).toEqual({
      consentGiven: true,
      allowAnalyticsForTraining: true,
      anonymizeData: true,
      retentionDays: 90
    });
    expect(res.body.dataset.sessionRows).toHaveLength(1);
    expect(res.body.dataset.episodeLabels).toHaveLength(1);
    expect(res.body.dataset.sessionRows[0]).toEqual(
      expect.objectContaining({
        dayToken: 'D2',
        relativeDayIndex: 1,
        weekday: expect.any(String),
        hourBucket: 23,
        appToken: expect.stringMatching(/^APP_[A-F0-9]{12}$/),
        category: 'Social',
        durationMinutes: 80,
        isLateNight: 1,
        behaviorLabel: 'addictive_behavior_episode',
        isAddictiveBehaviorEpisode: 1
      })
    );
    expect(res.body.dataset.episodeLabels[0]).toEqual(
      expect.objectContaining({
        episodeId: 'EP_1',
        dayToken: 'D2',
        totalScreenMinutes: 80,
        lateNightMinutes: 50,
        overLimitMinutes: 20,
        detoxScore: 42,
        riskLevel: 'high',
        behaviorLabel: 'addictive_behavior_episode',
        isAddictiveBehaviorEpisode: 1
      })
    );
    expect(res.body.dataset.sessionRowsCsv).toContain('recordId,dayToken,relativeDayIndex');
    expect(res.body.dataset.episodeLabelsCsv).toContain('episodeId,dayToken,relativeDayIndex');
    expect(res.body.dataset.sessionRowsCsv).not.toContain('com.instagram.android');
  });

  it('TC_ANALYTICS_CTRL_005 - exportAnonymizedDataset defaults invalid range to week and invalid format to json', async () => {
    mockSettingsFindOne.mockImplementationOnce(() =>
      makeLean({
        dailyLimitMinutes: 240,
        privacySettings: {
          consentGiven: true,
          allowAnalyticsForTraining: true,
          anonymizeData: true,
          retentionDays: 30
        }
      })
    );

    mockUsageFind.mockImplementationOnce(() => makeSortLean([]));

    const req = {
      user: { _id: 'user-001' },
      query: { range: 'year', format: 'xml' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await exportAnonymizedDataset(req, res as any, next);

    expect(mockGetRangeStart).toHaveBeenCalledWith('week');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.dataset.range).toBe('week');
    expect(res.body.dataset.format).toBe('json');
    expect(res.body.dataset.summary.sessionCount).toBe(0);
    expect(res.body.dataset.summary.episodeCount).toBe(0);
  });
});
