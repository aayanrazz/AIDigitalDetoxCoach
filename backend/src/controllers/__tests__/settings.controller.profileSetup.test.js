import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeAppLimitFindResult = (value = []) => ({
  sort: jest.fn().mockResolvedValue(value),
});

const loadSettingsController = async ({
  userSettingsFindOne,
  userSettingsCreate,
  appLimitFind,
  notificationCreate,
  serializeUserImpl,
} = {}) => {
  const UserSettings = {
    findOne: userSettingsFindOne ?? jest.fn(),
    create: userSettingsCreate ?? jest.fn(),
  };

  const AppLimit = {
    find: appLimitFind ?? jest.fn(() => makeAppLimitFindResult([])),
  };

  const Notification = {
    create: notificationCreate ?? jest.fn(),
  };

  const UsageSession = {};
  const AiInsight = {};
  const DetoxPlan = {};

  const serializeUser =
    serializeUserImpl ??
    jest.fn(user => ({
      _id: user._id,
      name: user.name,
      age: user.age,
      occupation: user.occupation,
      goal: user.goal,
      isOnboarded: user.isOnboarded,
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

describe('settings.controller profile setup module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('TC_PROFILE_008 getSettings creates default settings when none exist', async () => {
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
      save: jest.fn().mockResolvedValue(undefined),
    };

    const { getSettings, mocks } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(null),
      userSettingsCreate: jest.fn().mockResolvedValue(createdSettings),
      appLimitFind: jest.fn(() => makeAppLimitFindResult([])),
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

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        settings: createdSettings,
        appLimits: [],
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

  test('TC_PROFILE_009 completeProfileSetup rejects missing display name', async () => {
    const settings = {
      notificationSettings: {},
      privacySettings: {},
      save: jest.fn(),
    };

    const { completeProfileSetup, mocks } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn(),
      },
      body: {
        name: '   ',
        goal: 'Reduce distraction',
        focusAreas: ['Social Media'],
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await completeProfileSetup(req, res, next);

    expect(mocks.UserSettings.findOne).toHaveBeenCalledWith({ user: 'user-1' });
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Display name is required.',
      })
    );
  });

  test('TC_PROFILE_010 completeProfileSetup rejects missing detox goal', async () => {
    const settings = {
      notificationSettings: {},
      privacySettings: {},
      save: jest.fn(),
    };

    const { completeProfileSetup } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn(),
      },
      body: {
        name: 'Aayan',
        goal: '   ',
        focusAreas: ['Social Media'],
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await completeProfileSetup(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Main detox goal is required.',
      })
    );
  });

  test('TC_PROFILE_011 completeProfileSetup rejects empty focus areas', async () => {
    const settings = {
      notificationSettings: {},
      privacySettings: {},
      save: jest.fn(),
    };

    const { completeProfileSetup } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
        save: jest.fn(),
      },
      body: {
        name: 'Aayan',
        goal: 'Reduce distraction',
        focusAreas: ['   ', ''],
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await completeProfileSetup(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Select at least one focus area.',
      })
    );
  });

  test('TC_PROFILE_012 completeProfileSetup normalizes values, updates isOnboarded, saves settings, and creates notification', async () => {
    const settings = {
      dailyLimitMinutes: 240,
      focusAreas: ['Social Media'],
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
      privacySettings: {},
      save: jest.fn().mockResolvedValue(undefined),
    };

    const userSave = jest.fn().mockResolvedValue(undefined);

    const { completeProfileSetup, mocks } = await loadSettingsController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      notificationCreate: jest.fn().mockResolvedValue({}),
    });

    const req = {
      user: {
        _id: 'user-1',
        name: 'Old Name',
        age: 25,
        occupation: 'Old Occupation',
        goal: 'Old Goal',
        isOnboarded: false,
        save: userSave,
      },
      body: {
        name: '  Aayan  ',
        age: '21',
        occupation: '  Student  ',
        goal: '  Focus better  ',
        dailyLimitMinutes: 30,
        focusAreas: [' Social Media ', 'Study', 'Study', 'Gaming', 'Streaming', 'Sleep'],
        bedTime: '25:99',
        wakeTime: '7:05',
        notificationSettings: {
          dailySummaries: false,
        },
      },
    };

    const res = makeRes();
    const next = jest.fn();

    await completeProfileSetup(req, res, next);

    expect(req.user.name).toBe('Aayan');
    expect(req.user.goal).toBe('Focus better');
    expect(req.user.age).toBe(21);
    expect(req.user.occupation).toBe('Student');
    expect(req.user.isOnboarded).toBe(true);

    expect(settings.dailyLimitMinutes).toBe(60);
    expect(settings.focusAreas).toEqual([
      'Social Media',
      'Study',
      'Gaming',
      'Streaming',
      'Sleep',
    ]);
    expect(settings.sleepSchedule).toEqual({
      bedTime: '23:59',
      wakeTime: '07:05',
    });

    expect(settings.notificationSettings).toEqual({
      gentleNudges: true,
      dailySummaries: false,
      achievementAlerts: true,
      limitWarnings: true,
    });

    expect(settings.privacySettings).toEqual(
      expect.objectContaining({
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentGiven: false,
        consentVersion: 'v1.0',
      })
    );

    expect(userSave).toHaveBeenCalledTimes(1);
    expect(settings.save).toHaveBeenCalledTimes(1);

    expect(mocks.Notification.create).toHaveBeenCalledWith({
      user: 'user-1',
      type: 'system',
      title: 'Profile setup completed',
      body: 'Your detox coach now uses your 60-minute daily goal, Social Media focus, and 23:59 bedtime preference.',
      cta: {
        label: 'VIEW PLAN',
        action: 'open_detox_plan',
      },
    });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Profile setup completed.',
        settings,
        onboardingSummary: {
          goal: 'Focus better',
          dailyLimitMinutes: 60,
          primaryFocusArea: 'Social Media',
          focusAreas: ['Social Media', 'Study', 'Gaming', 'Streaming', 'Sleep'],
          bedTime: '23:59',
          wakeTime: '07:05',
          notificationSettings: {
            gentleNudges: true,
            dailySummaries: false,
            achievementAlerts: true,
            limitWarnings: true,
          },
        },
      })
    );

    expect(next).not.toHaveBeenCalled();
  });
});