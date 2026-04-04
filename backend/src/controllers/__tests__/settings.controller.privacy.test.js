import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const buildSettingsDoc = (overrides = {}) => ({
  user: 'user-1',
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
    consentedAt: null,
    policyLastViewedAt: null,
    deletionRequestedAt: null,
  },
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const loadPrivacyController = async ({
  userSettingsFindOne,
  userSettingsCreate,
  usageDeleteMany,
  insightDeleteMany,
  notificationDeleteMany,
  appLimitDeleteMany,
  detoxPlanDeleteMany,
} = {}) => {
  const UserSettings = {
    findOne: userSettingsFindOne ?? jest.fn(),
    create: userSettingsCreate ?? jest.fn(),
  };

  const UsageSession = {
    deleteMany: usageDeleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const AiInsight = {
    deleteMany: insightDeleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const Notification = {
    create: jest.fn(),
    deleteMany: notificationDeleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const AppLimit = {
    find: jest.fn(() => ({ sort: jest.fn().mockResolvedValue([]) })),
    deleteMany: appLimitDeleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const DetoxPlan = {
    deleteMany: detoxPlanDeleteMany ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const serializeUser = jest.fn(user => ({
    _id: user._id,
    name: user.name,
    goal: user.goal,
  }));

  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({
    default: UsageSession,
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
      UsageSession,
      AiInsight,
      Notification,
      AppLimit,
      DetoxPlan,
      serializeUser,
    },
  };
};

describe('settings.controller privacy, consent, and data-control module', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('TC_PRIVACY_006 backend getPrivacyPolicy returns policy with normalized current privacy settings', async () => {
    const settings = buildSettingsDoc({
      privacySettings: {},
    });

    const { getPrivacyPolicy } = await loadPrivacyController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await getPrivacyPolicy(req, res, next);

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

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        policy: expect.objectContaining({
          version: expect.any(String),
          retentionOptions: expect.arrayContaining([7, 30, 90, 180, 365]),
          currentPrivacySettings: expect.objectContaining({
            dataCollection: false,
            anonymizeData: true,
            allowAnalyticsForTraining: false,
            retentionDays: 30,
            consentGiven: false,
            consentVersion: 'v1.0',
          }),
        }),
      })
    );

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_PRIVACY_007 backend savePrivacyConsent persists consent, anonymization, training, and retention values', async () => {
    const settings = buildSettingsDoc();

    const { savePrivacyConsent } = await loadPrivacyController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
      },
      body: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await savePrivacyConsent(req, res, next);

    expect(settings.privacySettings).toEqual(
      expect.objectContaining({
        consentGiven: true,
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
      })
    );

    expect(settings.privacySettings.consentedAt).toEqual(expect.any(Date));
    expect(settings.save).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        privacySettings: expect.objectContaining({
          consentGiven: true,
          dataCollection: true,
          anonymizeData: true,
          allowAnalyticsForTraining: true,
          retentionDays: 90,
        }),
      })
    );

    expect(next).not.toHaveBeenCalled();
  });

  test('TC_PRIVACY_008 backend savePrivacyConsent blocks collection and training when consent is false', async () => {
    const settings = buildSettingsDoc({
      privacySettings: {
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
        consentGiven: true,
        consentVersion: 'v1.0',
        consentedAt: new Date(),
        policyLastViewedAt: null,
        deletionRequestedAt: null,
      },
    });

    const { savePrivacyConsent } = await loadPrivacyController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
      },
      body: {
        consentGiven: false,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 90,
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await savePrivacyConsent(req, res, next);

    expect(settings.privacySettings).toEqual(
      expect.objectContaining({
        consentGiven: false,
        dataCollection: false,
        anonymizeData: false,
        allowAnalyticsForTraining: false,
        retentionDays: 90,
      })
    );

    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_PRIVACY_009 backend savePrivacyConsent sanitizes invalid retention days to allowed values', async () => {
    const settings = buildSettingsDoc();

    const { savePrivacyConsent } = await loadPrivacyController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
    });

    const req = {
      user: {
        _id: 'user-1',
      },
      body: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 999,
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await savePrivacyConsent(req, res, next);

    expect([7, 30, 90, 180, 365]).toContain(
      settings.privacySettings.retentionDays
    );
    expect(settings.privacySettings.retentionDays).not.toBe(999);

    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_PRIVACY_010 backend deleteMyData clears stored user data and updates privacy state', async () => {
    const settings = buildSettingsDoc();

    const { deleteMyData, mocks } = await loadPrivacyController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settings),
      usageDeleteMany: jest.fn().mockResolvedValue({ deletedCount: 12 }),
      insightDeleteMany: jest.fn().mockResolvedValue({ deletedCount: 3 }),
      notificationDeleteMany: jest.fn().mockResolvedValue({ deletedCount: 2 }),
      appLimitDeleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      detoxPlanDeleteMany: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    });

    const req = {
      user: {
        _id: 'user-1',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteMyData(req, res, next);

    expect(mocks.UsageSession.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.AiInsight.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.Notification.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.AppLimit.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mocks.DetoxPlan.deleteMany).toHaveBeenCalledWith({ user: 'user-1' });

    expect(settings.privacySettings).toEqual(
      expect.objectContaining({
        consentGiven: false,
        dataCollection: false,
        allowAnalyticsForTraining: false,
      })
    );

    expect(settings.privacySettings.deletionRequestedAt).toEqual(expect.any(Date));
    expect(settings.save).toHaveBeenCalledTimes(1);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: expect.any(String),
      })
    );

    expect(next).not.toHaveBeenCalled();
  });
});