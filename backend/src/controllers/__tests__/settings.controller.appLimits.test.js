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
  appLimitFindOneAndUpdate,
  appLimitFindOneAndDelete,
  appLimitFind,
} = {}) => {
  const UserSettings = {
    findOne: jest.fn(),
    create: jest.fn(),
  };

  const AppLimit = {
    findOneAndUpdate:
      appLimitFindOneAndUpdate ?? jest.fn().mockResolvedValue(null),
    findOneAndDelete:
      appLimitFindOneAndDelete ?? jest.fn().mockResolvedValue(null),
    find: appLimitFind ?? jest.fn(() => makeSortedResult([])),
  };

  const Notification = { create: jest.fn() };
  const UsageSession = {};
  const AiInsight = {};
  const DetoxPlan = {};

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
    serializeUser: jest.fn(user => ({ _id: user._id, name: user.name })),
  }));

  const controller = await import('../settings.controller.js');

  return {
    ...controller,
    mocks: {
      AppLimit,
    },
  };
};

describe('Module 8 - settings.controller app limits', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('TC_LIMITS_001 saveAppLimit rejects missing required fields', async () => {
    const { saveAppLimit } = await loadSettingsController();

    const req = {
      user: { _id: 'user-1' },
      body: {
        appName: 'Instagram',
        dailyLimitMinutes: 60,
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await saveAppLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      message: 'appName, appPackage, and dailyLimitMinutes are required.',
    });
    expect(res.json).not.toHaveBeenCalled();
  });

  test('TC_LIMITS_002 saveAppLimit rejects invalid daily limit values', async () => {
    const { saveAppLimit, mocks } = await loadSettingsController();

    const req = {
      user: { _id: 'user-1' },
      body: {
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        dailyLimitMinutes: '0',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await saveAppLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      message: 'dailyLimitMinutes must be a valid positive number.',
    });
    expect(mocks.AppLimit.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('TC_LIMITS_003 saveAppLimit upserts trimmed app limit successfully', async () => {
    const savedLimit = {
      _id: 'limit-1',
      appName: 'Instagram',
      appPackage: 'com.instagram.android',
      category: 'Social Media',
      dailyLimitMinutes: 90,
    };

    const { saveAppLimit, mocks } = await loadSettingsController({
      appLimitFindOneAndUpdate: jest.fn().mockResolvedValue(savedLimit),
    });

    const req = {
      user: { _id: 'user-1' },
      body: {
        appName: '  Instagram  ',
        appPackage: '  com.instagram.android  ',
        category: '  Social Media  ',
        dailyLimitMinutes: '90',
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await saveAppLimit(req, res, next);

    expect(mocks.AppLimit.findOneAndUpdate).toHaveBeenCalledWith(
      { user: 'user-1', appPackage: 'com.instagram.android' },
      {
        user: 'user-1',
        appName: 'Instagram',
        appPackage: 'com.instagram.android',
        category: 'Social Media',
        dailyLimitMinutes: 90,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'App limit saved successfully.',
      appLimit: savedLimit,
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('TC_LIMITS_004 deleteAppLimit rejects missing appPackage param', async () => {
    const { deleteAppLimit } = await loadSettingsController();

    const req = {
      user: { _id: 'user-1' },
      params: { appPackage: '   ' },
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteAppLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      message: 'appPackage is required.',
    });
    expect(res.json).not.toHaveBeenCalled();
  });

  test('TC_LIMITS_005 deleteAppLimit removes the limit and returns remaining list', async () => {
    const remainingLimits = [
      {
        _id: 'limit-2',
        appName: 'YouTube',
        appPackage: 'com.google.android.youtube',
        dailyLimitMinutes: 60,
      },
    ];

    const { deleteAppLimit, mocks } = await loadSettingsController({
      appLimitFindOneAndDelete: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      appLimitFind: jest.fn(() => makeSortedResult(remainingLimits)),
    });

    const req = {
      user: { _id: 'user-1' },
      params: { appPackage: ' com.instagram.android ' },
    };
    const res = makeRes();
    const next = jest.fn();

    await deleteAppLimit(req, res, next);

    expect(mocks.AppLimit.findOneAndDelete).toHaveBeenCalledWith({
      user: 'user-1',
      appPackage: 'com.instagram.android',
    });
    expect(mocks.AppLimit.find).toHaveBeenCalledWith({ user: 'user-1' });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'App limit removed successfully.',
      appLimits: remainingLimits,
    });
    expect(next).not.toHaveBeenCalled();
  });
});