import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const loadNotificationFeatureBuilder = async ({
  planResult,
} = {}) => {
  const buildPlanMlFeaturesForDay = jest.fn().mockResolvedValue(
    planResult || {
      dayKey: '2026-04-04',
      featureRow: {},
    }
  );

  jest.unstable_mockModule('../planFeatureBuilder.js', () => ({
    buildPlanMlFeaturesForDay,
  }));

  const module = await import('../notificationFeatureBuilder.js');

  return {
    ...module,
    mocks: {
      buildPlanMlFeaturesForDay,
    },
  };
};

describe('Module 7 - notificationFeatureBuilder.js', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ML_006 buildNotificationMlFeaturesForDay normalizes defaults for missing fields', async () => {
    const { buildNotificationMlFeaturesForDay } = await loadNotificationFeatureBuilder({
      planResult: {
        dayKey: '2026-04-04',
        featureRow: {},
      },
    });

    const result = await buildNotificationMlFeaturesForDay({
      user: { _id: 'user-1' },
    });

    expect(result.featureRow).toEqual({
      dailyLimitMinutes: 180,
      bedTimeMinutes: 1380,
      wakeTimeMinutes: 420,
      gentleNudgesEnabled: 1,
      dailySummariesEnabled: 1,
      achievementAlertsEnabled: 1,
      limitWarningsEnabled: 1,
      sessionCount: 0,
      totalScreenMinutes: 0,
      socialMinutes: 0,
      productivityMinutes: 0,
      pickups: 0,
      unlocks: 0,
      lateNightMinutes: 0,
      sevenDayAvgScreenMinutes: 0,
      yesterdayScore: 0,
      overLimitMinutes: 0,
      score: 0,
      overLimitAppsCount: 0,
      topExceededMinutes: 0,
      focusPrimary: 'Social Media',
      focusSecondary: 'General Balance',
      riskLevel: 'low',
    });
  });

  it('TC_ML_007 buildNotificationMlFeaturesForDay preserves valid normalized values from plan features', async () => {
    const { buildNotificationMlFeaturesForDay, mocks } = await loadNotificationFeatureBuilder({
      planResult: {
        dayKey: '2026-04-04',
        settings: { dailyLimitMinutes: 150 },
        featureRow: {
          dailyLimitMinutes: '150',
          bedTimeMinutes: '1320',
          wakeTimeMinutes: '390',
          gentleNudgesEnabled: 0,
          dailySummariesEnabled: 1,
          achievementAlertsEnabled: 0,
          limitWarningsEnabled: 1,
          sessionCount: '6',
          totalScreenMinutes: '220',
          socialMinutes: '120',
          productivityMinutes: '50',
          pickups: '14',
          unlocks: '9',
          lateNightMinutes: '35',
          sevenDayAvgScreenMinutes: '110',
          yesterdayScore: '74',
          overLimitMinutes: '70',
          score: '52',
          overLimitAppsCount: '2',
          topExceededMinutes: '40',
          focusPrimary: ' Productivity ',
          focusSecondary: ' Sleep ',
          riskLevel: ' high ',
        },
      },
    });

    const result = await buildNotificationMlFeaturesForDay({
      user: { _id: 'user-2' },
      date: new Date('2026-04-04T10:00:00.000Z'),
      sessions: [{ appPackage: 'com.app' }],
    });

    expect(mocks.buildPlanMlFeaturesForDay).toHaveBeenCalledWith({
      user: { _id: 'user-2' },
      date: new Date('2026-04-04T10:00:00.000Z'),
      sessions: [{ appPackage: 'com.app' }],
    });

    expect(result.featureRow).toEqual({
      dailyLimitMinutes: 150,
      bedTimeMinutes: 1320,
      wakeTimeMinutes: 390,
      gentleNudgesEnabled: 0,
      dailySummariesEnabled: 1,
      achievementAlertsEnabled: 0,
      limitWarningsEnabled: 1,
      sessionCount: 6,
      totalScreenMinutes: 220,
      socialMinutes: 120,
      productivityMinutes: 50,
      pickups: 14,
      unlocks: 9,
      lateNightMinutes: 35,
      sevenDayAvgScreenMinutes: 110,
      yesterdayScore: 74,
      overLimitMinutes: 70,
      score: 52,
      overLimitAppsCount: 2,
      topExceededMinutes: 40,
      focusPrimary: 'Productivity',
      focusSecondary: 'Sleep',
      riskLevel: 'high',
    });
  });
});