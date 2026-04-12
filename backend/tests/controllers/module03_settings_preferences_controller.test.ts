
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockAppLimitFind: any = jest.fn();

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

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    create: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    deleteMany: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {
    deleteMany: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/models/DetoxPlan.js', () => ({
  default: {
    deleteMany: jest.fn()
  }
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: jest.fn((user: any) => ({
    _id: user._id,
    id: user._id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    age: user.age,
    occupation: user.occupation,
    goal: user.goal
  }))
}));

const { getSettings, updateSettings } = await import('../../src/controllers/settings.controller.js');

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
};

function createMockResponse(): MockResponse {
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

function chainSort(value: any) {
  const sort: any = jest.fn();
  sort.mockImplementationOnce(async () => value);
  return { sort };
}

describe('Module 3 - settings.controller.js (settings/preferences)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_SETTINGS_CTRL_001 - getSettings creates default settings when none exist', async () => {
    const settingsDoc = {
      _id: 'settings-001',
      user: 'user-001',
      dailyLimitMinutes: 180,
      privacySettings: {},
      notificationSettings: { gentleNudges: true, dailySummaries: true, achievementAlerts: true, limitWarnings: true },
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => null);
    mockSettingsCreate.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        goal: ''
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await getSettings(req, res as any, next);

    expect(mockSettingsCreate).toHaveBeenCalledWith({ user: 'user-001' });
    expect(settingsDoc.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.appLimits).toEqual([]);
    expect(res.body.onboardingSummary).toEqual({
      goal: 'Reduce screen time',
      dailyLimitMinutes: 180,
      primaryFocusArea: 'Social Media',
      focusAreas: [],
      bedTime: '23:00',
      wakeTime: '07:00',
      notificationSettings: settingsDoc.notificationSettings
    });
  });

  it('TC_SETTINGS_CTRL_002 - getSettings returns existing settings, app limits, and onboarding summary', async () => {
    const settingsDoc = {
      _id: 'settings-002',
      user: 'user-001',
      dailyLimitMinutes: 120,
      focusAreas: ['Gaming', 'Social Media'],
      sleepSchedule: { bedTime: '22:30', wakeTime: '06:30' },
      notificationSettings: {
        gentleNudges: false,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: false
      },
      privacySettings: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30
      },
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([
      { appPackage: 'com.instagram.android', dailyLimitMinutes: 45 }
    ]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        goal: 'Reduce gaming'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await getSettings(req, res as any, next);

    expect(mockSettingsCreate).not.toHaveBeenCalled();
    expect(settingsDoc.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.appLimits).toEqual([
      { appPackage: 'com.instagram.android', dailyLimitMinutes: 45 }
    ]);
    expect(res.body.onboardingSummary).toEqual({
      goal: 'Reduce gaming',
      dailyLimitMinutes: 120,
      primaryFocusArea: 'Gaming',
      focusAreas: ['Gaming', 'Social Media'],
      bedTime: '22:30',
      wakeTime: '06:30',
      notificationSettings: settingsDoc.notificationSettings
    });
  });

  it('TC_SETTINGS_CTRL_003 - updateSettings clamps daily limit, normalizes theme, and removes duplicate focus areas', async () => {
    const settingsDoc = {
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true
      },
      privacySettings: {
        consentGiven: false,
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30
      },
      integrations: {},
      theme: 'dark',
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        save: jest.fn(async () => true)
      },
      body: {
        dailyLimitMinutes: 9999,
        theme: 'LIGHT',
        focusAreas: ['Social Media', 'Gaming', 'Gaming', 'Video Streaming']
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await updateSettings(req, res as any, next);

    expect(settingsDoc.dailyLimitMinutes).toBe(1440);
    expect(settingsDoc.theme).toBe('light');
    expect(settingsDoc.focusAreas).toEqual(['Social Media', 'Gaming', 'Video Streaming']);
    expect(req.user.save).toHaveBeenCalled();
    expect(settingsDoc.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Settings updated successfully.');
  });

  it('TC_SETTINGS_CTRL_004 - updateSettings normalizes sleep schedule and merges integrations', async () => {
    const settingsDoc = {
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:30', wakeTime: '07:00' },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true
      },
      privacySettings: {
        consentGiven: false,
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30
      },
      integrations: { googleFit: false, appleHealth: false },
      theme: 'dark',
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        save: jest.fn(async () => true)
      },
      body: {
        sleepSchedule: {
          bedTime: '25:99',
          wakeTime: '6:05'
        },
        integrations: {
          googleFit: true
        }
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await updateSettings(req, res as any, next);

    expect(settingsDoc.sleepSchedule).toEqual({
      bedTime: '23:30',
      wakeTime: '06:05'
    });
    expect(settingsDoc.integrations).toEqual({
      googleFit: true,
      appleHealth: false
    });
    expect(res.body.success).toBe(true);
  });

  it('TC_SETTINGS_CTRL_005 - updateSettings normalizes notification settings and disables data collection when consent is false', async () => {
    const settingsDoc = {
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true
      },
      privacySettings: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 30,
        consentVersion: 'v1.0'
      },
      integrations: {},
      theme: 'dark',
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Aayan',
        save: jest.fn(async () => true)
      },
      body: {
        notificationSettings: {
          gentleNudges: false,
          limitWarnings: false
        },
        privacySettings: {
          consentGiven: false,
          dataCollection: true,
          anonymizeData: true,
          allowAnalyticsForTraining: true,
          retentionDays: 365
        }
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await updateSettings(req, res as any, next);

    expect(settingsDoc.notificationSettings).toEqual({
      gentleNudges: false,
      dailySummaries: true,
      achievementAlerts: true,
      limitWarnings: false
    });

    expect(settingsDoc.privacySettings.consentGiven).toBe(false);
    expect(settingsDoc.privacySettings.dataCollection).toBe(false);
    expect(settingsDoc.privacySettings.allowAnalyticsForTraining).toBe(false);
    expect(settingsDoc.privacySettings.anonymizeData).toBe(true);
    expect(settingsDoc.privacySettings.retentionDays).toBe(365);
    expect(res.body.success).toBe(true);
  });

  it('TC_SETTINGS_CTRL_006 - updateSettings trims profile fields and keeps existing theme when invalid theme is provided', async () => {
    const settingsDoc = {
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media'],
      sleepSchedule: { bedTime: '23:00', wakeTime: '07:00' },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true
      },
      privacySettings: {
        consentGiven: false,
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30
      },
      integrations: {},
      theme: 'dark',
      save: jest.fn(async () => true)
    } as any;

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);
    mockAppLimitFind.mockImplementationOnce(() => chainSort([{ appPackage: 'com.youtube.android', dailyLimitMinutes: 60 }]));

    const req = {
      user: {
        _id: 'user-001',
        name: 'Old Name',
        avatarUrl: '',
        age: 20,
        occupation: 'Old Occupation',
        goal: 'Old Goal',
        save: jest.fn(async () => true)
      },
      body: {
        name: '  New Name  ',
        avatarUrl: '  https://example.com/avatar.png  ',
        age: '22',
        occupation: '  Student  ',
        goal: '  Reduce social media  ',
        theme: 'blue'
      }
    } as any;

    const res = createMockResponse();
    const next: any = jest.fn();

    await updateSettings(req, res as any, next);

    expect(req.user.name).toBe('New Name');
    expect(req.user.avatarUrl).toBe('https://example.com/avatar.png');
    expect(req.user.age).toBe(22);
    expect(req.user.occupation).toBe('Student');
    expect(req.user.goal).toBe('Reduce social media');
    expect(settingsDoc.theme).toBe('dark');
    expect(res.body.appLimits).toEqual([{ appPackage: 'com.youtube.android', dailyLimitMinutes: 60 }]);
    expect(res.body.success).toBe(true);
  });
});
