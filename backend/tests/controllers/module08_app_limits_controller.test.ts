import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockAppLimitFindOneAndUpdate: any = jest.fn();
const mockAppLimitFindOneAndDelete: any = jest.fn();
const mockAppLimitFind: any = jest.fn();

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/models/AppLimit.js', () => ({
  default: {
    findOneAndUpdate: mockAppLimitFindOneAndUpdate,
    findOneAndDelete: mockAppLimitFindOneAndDelete,
    find: mockAppLimitFind
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/models/AiInsight.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/models/DetoxPlan.js', () => ({
  default: {}
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: (user: any) => user
}));

const { saveAppLimit, deleteAppLimit } = await import('../../src/controllers/settings.controller.js');

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

function chainSort(value: any) {
  const sort: any = jest.fn();
  sort.mockImplementationOnce(async () => value);
  return { sort };
}

function getNextError(next: any) {
  return next.mock.calls[0][0];
}

describe('Module 8 - settings.controller.js (app limits/intervention)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('TC_APP_LIMITS_CTRL_001 - saveAppLimit rejects when required fields are missing', async () => {
    const req = {
      user: { _id: 'user-001' },
      body: {
        appName: 'Instagram'
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await saveAppLimit(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('appName, appPackage, and dailyLimitMinutes are required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_APP_LIMITS_CTRL_002 - saveAppLimit rejects when daily limit is invalid', async () => {
    const req = {
      user: { _id: 'user-001' },
      body: {
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        dailyLimitMinutes: 0
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await saveAppLimit(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('dailyLimitMinutes must be a valid positive number.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_APP_LIMITS_CTRL_003 - saveAppLimit saves and returns normalized app limit', async () => {
    mockAppLimitFindOneAndUpdate.mockImplementationOnce(async () => ({
      user: 'user-001',
      appName: 'Instagram',
      appPackage: 'com.instagram.android',
      category: 'Social',
      dailyLimitMinutes: 30
    }));

    const req = {
      user: { _id: 'user-001' },
      body: {
        appName: '  Instagram  ',
        appPackage: '  com.instagram.android  ',
        category: '  Social  ',
        dailyLimitMinutes: 30
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await saveAppLimit(req, res as any, next);

    expect(mockAppLimitFindOneAndUpdate).toHaveBeenCalledWith(
      { user: 'user-001', appPackage: 'com.instagram.android' },
      {
        user: 'user-001',
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        category: 'Social',
        dailyLimitMinutes: 30
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'App limit saved successfully.',
      appLimit: {
        user: 'user-001',
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        category: 'Social',
        dailyLimitMinutes: 30
      }
    });
  });

  it('TC_APP_LIMITS_CTRL_004 - deleteAppLimit rejects when appPackage is missing', async () => {
    const req = {
      user: { _id: 'user-001' },
      params: {}
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await deleteAppLimit(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('appPackage is required.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_APP_LIMITS_CTRL_005 - deleteAppLimit removes selected app limit and returns remaining limits', async () => {
    mockAppLimitFindOneAndDelete.mockImplementationOnce(async () => ({
      _id: 'limit-001',
      user: 'user-001',
      appPackage: 'com.instagram.android'
    }));

    mockAppLimitFind.mockImplementationOnce(() =>
      chainSort([
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          dailyLimitMinutes: 45
        }
      ])
    );

    const req = {
      user: { _id: 'user-001' },
      params: {
        appPackage: '  com.instagram.android  '
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await deleteAppLimit(req, res as any, next);

    expect(mockAppLimitFindOneAndDelete).toHaveBeenCalledWith({
      user: 'user-001',
      appPackage: 'com.instagram.android'
    });

    expect(mockAppLimitFind).toHaveBeenCalledWith({
      user: 'user-001'
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'App limit removed successfully.',
      appLimits: [
        {
          appName: 'YouTube',
          appPackage: 'com.google.android.youtube',
          dailyLimitMinutes: 45
        }
      ]
    });
  });
});