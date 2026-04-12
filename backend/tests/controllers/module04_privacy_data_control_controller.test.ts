import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockUsageDeleteMany: any = jest.fn();
const mockAppLimitDeleteMany: any = jest.fn();
const mockNotificationDeleteMany: any = jest.fn();
const mockAiInsightDeleteMany: any = jest.fn();
const mockDetoxPlanDeleteMany: any = jest.fn();

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    findOne: mockSettingsFindOne,
    create: mockSettingsCreate
  }
}));

jest.unstable_mockModule('../../src/models/AppLimit.js', () => ({
  default: {
    deleteMany: mockAppLimitDeleteMany
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    deleteMany: mockNotificationDeleteMany
  }
}));

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    deleteMany: mockUsageDeleteMany
  }
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {
    deleteMany: mockAiInsightDeleteMany
  }
}));

jest.unstable_mockModule('../../src/models/DetoxPlan.js', () => ({
  default: {
    deleteMany: mockDetoxPlanDeleteMany
  }
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: (user: any) => user
}));

const {
  getPrivacyPolicy,
  savePrivacyConsent,
  deleteMyData
} = await import('../../src/controllers/settings.controller.js');

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

describe('Module 4 - settings.controller.js (privacy/data control)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_PRIVACY_CTRL_001 - getPrivacyPolicy creates default settings when none exist and returns privacy policy payload', async () => {
    const createdSettings = {
      user: 'user-001',
      privacySettings: {},
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockSettingsFindOne
      .mockImplementationOnce(async () => null)
      .mockImplementationOnce(async () => createdSettings);
    mockSettingsCreate.mockImplementationOnce(async () => createdSettings);

    const req = { user: { _id: 'user-001' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await getPrivacyPolicy(req, res as any, next);

    expect(mockSettingsFindOne).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockSettingsCreate).toHaveBeenCalledWith({ user: 'user-001' });
    expect(createdSettings.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.policy.version).toBe('v1.0');
    expect(Array.isArray(res.body.policy.retentionOptions)).toBe(true);
    expect(res.body.policy.currentPrivacySettings).toBeTruthy();
  });

  it('TC_PRIVACY_CTRL_002 - getPrivacyPolicy updates policyLastViewedAt on existing settings', async () => {
    const settingsDoc = {
      user: 'user-001',
      privacySettings: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 30,
        policyLastViewedAt: null
      },
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);

    const req = { user: { _id: 'user-001' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await getPrivacyPolicy(req, res as any, next);

    expect(settingsDoc.save).toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.policy.currentPrivacySettings.policyLastViewedAt).toBeTruthy();
  });

  it('TC_PRIVACY_CTRL_003 - savePrivacyConsent withdraws consent and disables collection and training flags', async () => {
    const settingsDoc = {
      user: 'user-001',
      privacySettings: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 30,
        consentedAt: new Date('2026-04-01T10:00:00Z'),
        withdrawnAt: null,
        policyLastViewedAt: null
      },
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);

    const req = {
      user: { _id: 'user-001' },
      body: {
        consentGiven: false,
        dataCollection: true,
        anonymizeData: true,
        allowAnalyticsForTraining: true,
        retentionDays: 90
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await savePrivacyConsent(req, res as any, next);

    expect(settingsDoc.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Consent withdrawn and data collection disabled.');
    expect(res.body.privacySettings.consentGiven).toBe(false);
    expect(res.body.privacySettings.dataCollection).toBe(false);
    expect(res.body.privacySettings.allowAnalyticsForTraining).toBe(false);
    expect(res.body.privacySettings.retentionDays).toBe(90);
    expect(res.body.privacySettings.withdrawnAt).toBeTruthy();
  });

  it('TC_PRIVACY_CTRL_004 - savePrivacyConsent stores granted consent, retention, and privacy preferences', async () => {
    const settingsDoc = {
      user: 'user-001',
      privacySettings: {
        consentGiven: false,
        dataCollection: false,
        anonymizeData: true,
        allowAnalyticsForTraining: false,
        retentionDays: 30,
        consentedAt: null,
        withdrawnAt: null,
        policyLastViewedAt: null
      },
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);

    const req = {
      user: { _id: 'user-001' },
      body: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 180
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await savePrivacyConsent(req, res as any, next);

    expect(settingsDoc.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Privacy consent saved successfully.');
    expect(res.body.privacySettings.consentGiven).toBe(true);
    expect(res.body.privacySettings.dataCollection).toBe(true);
    expect(res.body.privacySettings.allowAnalyticsForTraining).toBe(true);
    expect(res.body.privacySettings.anonymizeData).toBe(false);
    expect(res.body.privacySettings.retentionDays).toBe(180);
    expect(res.body.privacySettings.consentedAt).toBeTruthy();
    expect(res.body.privacySettings.consentVersion).toBe('v1.0');
  });

  it('TC_PRIVACY_CTRL_005 - deleteMyData removes stored collections and resets privacy settings', async () => {
    mockUsageDeleteMany.mockImplementationOnce(async () => ({ acknowledged: true }));
    mockAppLimitDeleteMany.mockImplementationOnce(async () => ({ acknowledged: true }));
    mockNotificationDeleteMany.mockImplementationOnce(async () => ({ acknowledged: true }));
    mockAiInsightDeleteMany.mockImplementationOnce(async () => ({ acknowledged: true }));
    mockDetoxPlanDeleteMany.mockImplementationOnce(async () => ({ acknowledged: true }));

    const settingsDoc = {
      user: 'user-001',
      privacySettings: {
        consentGiven: true,
        dataCollection: true,
        anonymizeData: false,
        allowAnalyticsForTraining: true,
        retentionDays: 30,
        consentedAt: new Date('2026-04-01T10:00:00Z'),
        withdrawnAt: null,
        deletionRequestedAt: null
      },
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockSettingsFindOne.mockImplementationOnce(async () => settingsDoc);

    const req = { user: { _id: 'user-001' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await deleteMyData(req, res as any, next);

    expect(mockUsageDeleteMany).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockAppLimitDeleteMany).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockNotificationDeleteMany).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockAiInsightDeleteMany).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockDetoxPlanDeleteMany).toHaveBeenCalledWith({ user: 'user-001' });

    expect(settingsDoc.save).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.deleted).toEqual({
      usageSessions: true,
      appLimits: true,
      notifications: true,
      aiInsights: true,
      detoxPlans: true
    });
    expect(res.body.privacySettings.consentGiven).toBe(false);
    expect(res.body.privacySettings.dataCollection).toBe(false);
    expect(res.body.privacySettings.allowAnalyticsForTraining).toBe(false);
    expect(res.body.privacySettings.anonymizeData).toBe(true);
    expect(res.body.privacySettings.deletionRequestedAt).toBeTruthy();
  });
});