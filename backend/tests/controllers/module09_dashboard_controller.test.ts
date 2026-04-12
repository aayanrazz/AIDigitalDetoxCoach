import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockUsageFind: any = jest.fn();
const mockDetoxPlanFindOne: any = jest.fn();
const mockNotificationCountDocuments: any = jest.fn();
const mockUserFind: any = jest.fn();
const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockAppLimitFind: any = jest.fn();
const mockAiInsightFindOne: any = jest.fn();
const mockAnalyzeDailyUsage: any = jest.fn();
const mockEvaluateAppLimits: any = jest.fn();
const mockBuildAnalytics: any = jest.fn();
const mockFormatDayKey: any = jest.fn(() => '2026-04-04');
const mockGetRangeStart: any = jest.fn(() => new Date('2026-03-29T00:00:00.000Z'));

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    find: mockUsageFind
  }
}));

jest.unstable_mockModule('../../src/models/DetoxPlan.js', () => ({
  default: {
    findOne: mockDetoxPlanFindOne
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    countDocuments: mockNotificationCountDocuments
  }
}));

jest.unstable_mockModule('../../src/models/User.js', () => ({
  default: {
    find: mockUserFind
  }
}));

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    findOne: mockSettingsFindOne,
    create: mockSettingsCreate
  }
}));

jest.unstable_mockModule('../../src/models/AppLimit.js', () => ({
  default: {
    find: mockAppLimitFind
  }
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {
    findOne: mockAiInsightFindOne
  }
}));

jest.unstable_mockModule('../../src/utils/date.js', () => ({
  formatDayKey: mockFormatDayKey,
  getRangeStart: mockGetRangeStart
}));

jest.unstable_mockModule('../../src/services/behavior.service.js', () => ({
  analyzeDailyUsage: mockAnalyzeDailyUsage,
  evaluateAppLimits: mockEvaluateAppLimits
}));

jest.unstable_mockModule('../../src/services/analytics.service.js', () => ({
  buildAnalytics: mockBuildAnalytics
}));

jest.unstable_mockModule('../../src/services/gamification.service.js', () => ({
  getLevelProgressFromPoints: jest.fn(() => ({
    level: { number: 3, title: 'Focused Builder' },
    progressPct: 65,
    pointsToNextLevel: 140
  })),
  getUnlockedBadgeDetails: jest.fn(() => []),
  getNextBadgeHint: jest.fn(() => ({ hint: 'Keep going for your next badge.' }))
}));

const { getDashboard } = await import('../../src/controllers/dashboard.controller.js');

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

function makeSortedChain(value: any) {
  return {
    sort: jest.fn().mockImplementationOnce(async () => value)
  };
}

function makeUserQueryChain(value: any) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        select: jest.fn().mockImplementationOnce(async () => value)
      }))
    }))
  };
}

function makeReq(overrides: Record<string, any> = {}) {
  return {
    user: {
      _id: 'user-1',
      name: 'Aayan',
      points: 320,
      streakCount: 5,
      badges: ['starter'],
      ...overrides
    }
  } as any;
}

describe('Module 9 - dashboard.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDayKey.mockReturnValue('2026-04-04');
    mockGetRangeStart.mockReturnValue(new Date('2026-03-29T00:00:00.000Z'));
  });

  it('TC_DASH_CTRL_001 - getDashboard creates default settings when missing and maps base dashboard response', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => null);
    mockSettingsCreate.mockImplementationOnce(async () => ({
      user: 'user-1',
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: { limitWarnings: true, dailySummaries: true }
    }));

    mockUsageFind
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    mockAppLimitFind.mockReturnValueOnce({
      lean: jest.fn().mockImplementationOnce(async () => [])
    });

    mockAnalyzeDailyUsage.mockReturnValueOnce({
      score: 64,
      riskLevel: 'medium',
      pickups: 12,
      unlocks: 9,
      totalScreenMinutes: 180,
      recommendations: ['Reduce short check-ins.']
    });

    mockEvaluateAppLimits.mockReturnValueOnce({
      exceededCount: 0,
      topExceededApp: null
    });

    mockAiInsightFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockBuildAnalytics
      .mockReturnValueOnce({ averageDailyMinutes: 120 })
      .mockReturnValueOnce({ averageDailyMinutes: 180 });
    mockDetoxPlanFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockNotificationCountDocuments.mockImplementationOnce(async () => 0);
    mockUserFind.mockReturnValueOnce(makeUserQueryChain([]));

    const req = makeReq();
    const res = createRes();
    const next: any = jest.fn();

    await getDashboard(req, res as any, next);

    expect(mockSettingsCreate).toHaveBeenCalledWith({ user: 'user-1' });
    expect(next).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.dashboard).toEqual(
      expect.objectContaining({
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
        nextBadgeHintText: 'Keep going for your next badge.'
      })
    );
  });

  it('TC_DASH_CTRL_002 - getDashboard prefers ML insight over rule-based fallback for score and risk fields', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 150,
      focusAreas: ['Productivity'],
      sleepSchedule: { bedTime: '22:30', wakeTime: '06:30' },
      notificationSettings: { limitWarnings: true, gentleNudges: false }
    }));

    mockUsageFind
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    mockAppLimitFind.mockReturnValueOnce({
      lean: jest.fn().mockImplementationOnce(async () => [])
    });

    mockAnalyzeDailyUsage.mockReturnValueOnce({
      score: 48,
      riskLevel: 'high',
      pickups: 7,
      unlocks: 5,
      totalScreenMinutes: 160,
      recommendations: ['Rule fallback recommendation']
    });

    mockEvaluateAppLimits.mockReturnValueOnce({
      exceededCount: 0,
      topExceededApp: null
    });

    mockAiInsightFindOne.mockReturnValueOnce(
      makeSortedChain({
        score: 82,
        riskLevel: 'low',
        predictionSource: 'tensorflow',
        mlConfidence: 0.93
      })
    );

    mockBuildAnalytics
      .mockReturnValueOnce({ averageDailyMinutes: 120 })
      .mockReturnValueOnce({ averageDailyMinutes: 180 });
    mockDetoxPlanFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockNotificationCountDocuments.mockImplementationOnce(async () => 0);
    mockUserFind.mockReturnValueOnce(makeUserQueryChain([]));

    const res = createRes();
    await getDashboard(makeReq({ points: 140, streakCount: 2 }), res as any, jest.fn());

    expect(res.body.dashboard).toEqual(
      expect.objectContaining({
        digitalWellnessScore: 82,
        riskLevel: 'low',
        predictionSource: 'tensorflow',
        mlConfidence: 0.93
      })
    );
  });

  it('TC_DASH_CTRL_003 - getDashboard returns unread notifications and intervention message fields from app limits', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: { limitWarnings: true }
    }));

    mockUsageFind
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    mockAppLimitFind.mockReturnValueOnce({
      lean: jest.fn().mockImplementationOnce(async () => [
        { appPackage: 'com.instagram.android', dailyLimitMinutes: 60 }
      ])
    });

    mockAnalyzeDailyUsage.mockReturnValueOnce({
      score: 64,
      riskLevel: 'medium',
      pickups: 12,
      unlocks: 9,
      totalScreenMinutes: 180,
      recommendations: ['Reduce short check-ins.']
    });

    mockEvaluateAppLimits.mockReturnValueOnce({
      exceededCount: 2,
      topExceededApp: {
        appName: 'Instagram',
        exceededMinutes: 25
      }
    });

    mockAiInsightFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockBuildAnalytics
      .mockReturnValueOnce({ averageDailyMinutes: 120 })
      .mockReturnValueOnce({ averageDailyMinutes: 180 });
    mockDetoxPlanFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockNotificationCountDocuments.mockImplementationOnce(async () => 4);
    mockUserFind.mockReturnValueOnce(makeUserQueryChain([]));

    const res = createRes();
    await getDashboard(makeReq(), res as any, jest.fn());

    expect(res.body.dashboard).toEqual(
      expect.objectContaining({
        unreadNotifications: 4,
        overLimitAppsCount: 2,
        topExceededAppName: 'Instagram',
        topExceededMinutes: 25,
        interventionMessage: 'Instagram is 25 minutes over its daily limit, and 1 more tracked app also exceeded today.'
      })
    );
  });

  it('TC_DASH_CTRL_004 - getDashboard maps pending detox task into daily challenge and badge fields', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 200,
      focusAreas: ['Gaming'],
      sleepSchedule: { bedTime: '22:00', wakeTime: '06:00' },
      notificationSettings: { limitWarnings: true }
    }));

    mockUsageFind
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    mockAppLimitFind.mockReturnValueOnce({
      lean: jest.fn().mockImplementationOnce(async () => [])
    });

    mockAnalyzeDailyUsage.mockReturnValueOnce({
      score: 70,
      riskLevel: 'low',
      pickups: 8,
      unlocks: 6,
      totalScreenMinutes: 100,
      recommendations: ['Stay focused']
    });

    mockEvaluateAppLimits.mockReturnValueOnce({
      exceededCount: 0,
      topExceededApp: null
    });

    mockAiInsightFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockBuildAnalytics
      .mockReturnValueOnce({ averageDailyMinutes: 110 })
      .mockReturnValueOnce({ averageDailyMinutes: 160 });
    mockDetoxPlanFindOne.mockReturnValueOnce(
      makeSortedChain({
        days: [
          {
            status: 'in_progress',
            tasks: [
              { status: 'pending', title: 'Leave social apps closed for 1 hour' }
            ]
          }
        ]
      })
    );
    mockNotificationCountDocuments.mockImplementationOnce(async () => 1);
    mockUserFind.mockReturnValueOnce(makeUserQueryChain([{ name: 'Aayan', points: 320 }]));

    const { getUnlockedBadgeDetails, getNextBadgeHint } = await import('../../src/services/gamification.service.js');
    (getUnlockedBadgeDetails as any).mockReturnValueOnce([
      { label: 'Starter', emoji: '🌱' },
      { label: 'Focus Guard', emoji: '🛡️' }
    ]);
    (getNextBadgeHint as any).mockReturnValueOnce({
      hint: 'Finish one more challenge to unlock Deep Work.'
    });

    const res = createRes();
    await getDashboard(makeReq(), res as any, jest.fn());

    expect(res.body.dashboard).toEqual(
      expect.objectContaining({
        dailyChallenge: 'Leave social apps closed for 1 hour',
        badgesCount: 2,
        latestBadgeLabel: 'Focus Guard',
        latestBadgeEmoji: '🛡️',
        nextBadgeHintText: 'Finish one more challenge to unlock Deep Work.'
      })
    );
  });

  it('TC_DASH_CTRL_005 - getDashboard builds settings-driven recommendations and weekly improvement percentage', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => ({
      dailyLimitMinutes: 190,
      focusAreas: ['Productivity'],
      sleepSchedule: { bedTime: '22:15', wakeTime: '06:45' },
      notificationSettings: {
        gentleNudges: false,
        dailySummaries: true,
        limitWarnings: true
      }
    }));

    mockUsageFind
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => [])
      .mockImplementationOnce(async () => []);

    mockAppLimitFind.mockReturnValueOnce({
      lean: jest.fn().mockImplementationOnce(async () => [])
    });

    mockAnalyzeDailyUsage.mockReturnValueOnce({
      score: 75,
      riskLevel: 'low',
      pickups: 5,
      unlocks: 4,
      totalScreenMinutes: 120,
      recommendations: ['Reduce app switching in the evening.']
    });

    mockEvaluateAppLimits.mockReturnValueOnce({
      exceededCount: 0,
      topExceededApp: null
    });

    mockAiInsightFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockBuildAnalytics
      .mockReturnValueOnce({ averageDailyMinutes: 120 })
      .mockReturnValueOnce({ averageDailyMinutes: 200 });
    mockDetoxPlanFindOne.mockReturnValueOnce(makeSortedChain(null));
    mockNotificationCountDocuments.mockImplementationOnce(async () => 0);
    mockUserFind.mockReturnValueOnce(makeUserQueryChain([]));

    const res = createRes();
    await getDashboard(makeReq(), res as any, jest.fn());

    expect(res.body.dashboard).toEqual(
      expect.objectContaining({
        improvementVsLastWeek: 40,
        aiRecommendations: expect.arrayContaining([
          'Reduce app switching in the evening.',
          "Today's coaching is centered on your focus area: Productivity.",
          'Begin your low-distraction wind-down before 10:15 PM.',
          'Aim for a mindful start after 6:45 AM.',
          'Gentle nudges are off, so rely more on your dashboard and plan check-ins.',
          'Check your daily summary each evening to reflect on progress.'
        ])
      })
    );
  });
});