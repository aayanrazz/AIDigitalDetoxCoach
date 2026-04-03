import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeSortedResult = (value = []) => ({
  sort: jest.fn().mockResolvedValue(value),
});

const loadSettingsController = async ({
  userSettingsFindOne,
  userSettingsCreate,
  appLimitFind,
  serializeUserImpl,
} = {}) => {
  const UserSettings = {
    findOne: userSettingsFindOne ?? jest.fn(),
    create: userSettingsCreate ?? jest.fn(),
  };

  const AppLimit = {
    find: appLimitFind ?? jest.fn(() => makeSortedResult([])),
  };

  const Notification = {
    create: jest.fn(),
  };

  const UsageSession = {};
  const AiInsight = {};
  const DetoxPlan = {};

  const serializeUser =
    serializeUserImpl ??
    jest.fn(user => ({
      _id: user._id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      age: user.age,
      occupation: user.occupation,
      goal: user.goal,
    }));

  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));

  jest.unstable_mockModule('../../models/AppLimit.js', () => ({
    default: AppLimit,
  }));

  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({
    default: UsageSession,
  }));

  jest.unstable_mockModule('../../models/AiInsight.js', () => ({
    default: AiInsight,
  }));

  jest.unstable_mockModule('../../models/DetoxPlan.js', () => ({
    default: DetoxPlan,
  }));

  jest.unstable_mockModule('../../utils/serialize.js', () => ({
    serializeUser,
  }));

  const controller = await import('../settings.controller.js');

  return {
    ...controller,
    mocks: {
      UserSettings,
      AppLimit,
      Notification,
      serializeUser,
    },
  };
};

describe('settings.controller preferences module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('TC_SETTINGS_009 backend getSettings creates default settings and normalizes privacy defaults', async () => {
    const createdSettings = {
      user: 'user-1',
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {},
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const appLimits = [{ appName: 'YouTube', dailyLimitMinutes: 60 }];

    const { getSettings, mocks } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(null),
      userSettingsCreate: jest.fn().mockResolvedValue(createdSettings),
      appLimitFind: jest.fn(() => makeSortedResult(appLimits)),
    });

    const req = {
      user: {
        _id: 'user-1',
        name: 'Aayan',
        goal: '',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await getSettings(req, res, next);

    expect(mocks.UserSettings.findOne).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.UserSettings.create).toHaveBeenCalledWith({ user: 'user-1' });
    expect(createdSettings.save).toHaveBeenCalledTimes(1);

    expect(createdSettings.privacySettings).toEqual(
      expect.objectContaining({
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        settings: createdSettings,
        appLimits,
        onboardingSummary: {
          goal: 'Reduce screen time',
          dailyLimitMinutes: 240,
          primaryFocusArea: 'Social Media',
          focusAreas: ['Social Media', 'Productivity'],
          bedTime: '23:00',
          wakeTime: '07:00',
          notificationSettings: {
            gentleNudges: true,
            dailySummaries: true,
            achievementAlerts: true,
            limitWarnings: true,
          },
        },
      })
    );

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_SETTINGS_010 backend updateSettings persists trimmed user fields and normalizes theme, time, and daily limit', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: {
        bedTime: '23:00',
        wakeTime: '07:00',
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: false,
      },
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const userSave = jest.fn().mockResolvedValue(undefined);

    const req = {
      user: {
        _id: 'user-1',
        name: 'Old Name',
        avatarUrl: '',
        age: 25,
        occupation: 'Old Occupation',
        goal: 'Old Goal',
        save: userSave,
      },
      body: {
        name: '  Aayan  ',
        avatarUrl: '  https://example.com/avatar.png  ',
        age: '21',
        occupation: '  Student  ',
        goal: '  Better balance  ',
        dailyLimitMinutes: 30,
        sleepSchedule: {
          bedTime: '25:99',
          wakeTime: '7:05',
        },
        theme: 'LIGHT',
      },
    };

    const { updateSettings } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      appLimitFind: jest.fn(() => makeSortedResult([])),
    });

    const res = makeRes();
    const next = jest.fn();

    await updateSettings(req, res, next);

    expect(req.user.name).toBe('Aayan');
    expect(req.user.avatarUrl).toBe('https://example.com/avatar.png');
    expect(req.user.age).toBe(21);
    expect(req.user.occupation).toBe('Student');
    expect(req.user.goal).toBe('Better balance');

    expect(settings.dailyLimitMinutes).toBe(60);
    expect(settings.sleepSchedule).toEqual({
      bedTime: '23:59',
      wakeTime: '07:05',
    });
    expect(settings.theme).toBe('light');

    expect(userSave).toHaveBeenCalledTimes(1);
    expect(settings.save).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Settings updated successfully.',
        settings,
      })
    );

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_SETTINGS_011 backend updateSettings sanitizes invalid retention days and blocks collection/training without consent', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: {
        bedTime: '23:00',
        wakeTime: '07:00',
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: false,
      },
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn().mockResolvedValue(undefined),
      },
      body: {
        privacySettings: {
          consentGiven: false,
          dataCollection: true,
          anonymizeData: false,
          allowAnalyticsForTraining: true,
          retentionDays: 999,
        },
      },
    };

    const { updateSettings } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      appLimitFind: jest.fn(() => makeSortedResult([])),
    });

    const res = makeRes();
    const next = jest.fn();

    await updateSettings(req, res, next);

    expect(settings.privacySettings).toEqual(
      expect.objectContaining({
        consentGiven: false,
        dataCollection: false,
        anonymizeData: false,
        allowAnalyticsForTraining: false,
        retentionDays: 90,
        consentVersion: 'v1.0',
      })
    );

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_SETTINGS_012 backend updateSettings normalizes, de-duplicates, and caps focus areas', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: {
        bedTime: '23:00',
        wakeTime: '07:00',
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: false,
      },
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn().mockResolvedValue(undefined),
      },
      body: {
        focusAreas: [
          ' Social Media ',
          'Gaming',
          'Gaming',
          'Study',
          'Streaming',
          'Reading',
          'Coding',
        ],
      },
    };

    const { updateSettings } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      appLimitFind: jest.fn(() => makeSortedResult([])),
    });

    const res = makeRes();
    const next = jest.fn();

    await updateSettings(req, res, next);

    expect(settings.focusAreas).toEqual([
      'Social Media',
      'Gaming',
      'Study',
      'Streaming',
      'Reading',
    ]);

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_SETTINGS_013 backend updateSettings keeps existing focus areas when incoming focus list is empty', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: {
        bedTime: '23:00',
        wakeTime: '07:00',
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: false,
      },
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn().mockResolvedValue(undefined),
      },
      body: {
        focusAreas: ['   ', ''],
      },
    };

    const { updateSettings } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      appLimitFind: jest.fn(() => makeSortedResult([])),
    });

    const res = makeRes();
    const next = jest.fn();

    await updateSettings(req, res, next);

    expect(settings.focusAreas).toEqual(['Social Media', 'Productivity']);
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_SETTINGS_014 backend updateSettings applies notification toggle behavior and integration merge correctly', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media', 'Productivity'],
      sleepSchedule: {
        bedTime: '23:00',
        wakeTime: '07:00',
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: true,
      },
      theme: 'dark',
      save: jest.fn().mockResolvedValue(undefined),
    };

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn().mockResolvedValue(undefined),
      },
      body: {
        notificationSettings: {
          dailySummaries: false,
          limitWarnings: false,
        },
        integrations: {
          googleFitConnected: true,
        },
      },
    };

    const { updateSettings } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      appLimitFind: jest.fn(() => makeSortedResult([])),
    });

    const res = makeRes();
    const next = jest.fn();

    await updateSettings(req, res, next);

    expect(settings.notificationSettings).toEqual({
      gentleNudges: true,
      dailySummaries: false,
      achievementAlerts: true,
      limitWarnings: false,
    });

    expect(settings.integrations).toEqual({
      googleFitConnected: true,
      appleHealthConnected: true,
    });

    expect(next).not.toHaveBeenCalled();
  });
});