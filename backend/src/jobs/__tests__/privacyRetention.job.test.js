import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const flushPromises = () => new Promise(resolve => setImmediate(resolve));

const makeFindChain = rows => {
  const chain = {
    select: jest.fn(),
    lean: jest.fn(),
  };

  chain.select.mockReturnValue(chain);
  chain.lean.mockResolvedValue(rows);

  return chain;
};

const loadPrivacyRetentionJob = async ({
  settingsRows = [],
  usageDeleteManyImpl,
  notificationDeleteManyImpl,
  insightDeleteManyImpl,
  planDeleteManyImpl,
  updateOneImpl,
} = {}) => {
  const findChain = makeFindChain(settingsRows);

  const UserSettings = {
    find: jest.fn(() => findChain),
    updateOne: updateOneImpl ?? jest.fn().mockResolvedValue({ acknowledged: true }),
  };

  const UsageSession = {
    deleteMany:
      usageDeleteManyImpl ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const Notification = {
    deleteMany:
      notificationDeleteManyImpl ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const AiInsight = {
    deleteMany:
      insightDeleteManyImpl ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  const DetoxPlan = {
    deleteMany:
      planDeleteManyImpl ?? jest.fn().mockResolvedValue({ deletedCount: 0 }),
  };

  jest.unstable_mockModule('../../models/UserSettings.js', () => ({
    default: UserSettings,
  }));

  jest.unstable_mockModule('../../models/UsageSession.js', () => ({
    default: UsageSession,
  }));

  jest.unstable_mockModule('../../models/Notification.js', () => ({
    default: Notification,
  }));

  jest.unstable_mockModule('../../models/AiInsight.js', () => ({
    default: AiInsight,
  }));

  jest.unstable_mockModule('../../models/DetoxPlan.js', () => ({
    default: DetoxPlan,
  }));

  const jobModule = await import('../privacyRetention.job.js');

  return {
    ...jobModule,
    mocks: {
      UserSettings,
      UsageSession,
      Notification,
      AiInsight,
      DetoxPlan,
      findChain,
    },
  };
};

describe('privacyRetention.job', () => {
  let setIntervalSpy;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({
      unref: jest.fn(),
    }));

    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('TC_PRIVACY_011 privacyRetention job purges expired data for retained records', async () => {
    const settingsRows = [
      {
        _id: 'settings-1',
        user: 'user-1',
        privacySettings: {
          retentionDays: 30,
        },
      },
      {
        _id: 'settings-2',
        user: 'user-2',
        privacySettings: {
          retentionDays: 7,
        },
      },
    ];

    const usageDeleteMany = jest
      .fn()
      .mockResolvedValueOnce({ deletedCount: 4 })
      .mockResolvedValueOnce({ deletedCount: 1 });

    const notificationDeleteMany = jest
      .fn()
      .mockResolvedValueOnce({ deletedCount: 2 })
      .mockResolvedValueOnce({ deletedCount: 0 });

    const insightDeleteMany = jest
      .fn()
      .mockResolvedValueOnce({ deletedCount: 3 })
      .mockResolvedValueOnce({ deletedCount: 1 });

    const planDeleteMany = jest
      .fn()
      .mockResolvedValueOnce({ deletedCount: 1 })
      .mockResolvedValueOnce({ deletedCount: 2 });

    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });

    const { startPrivacyRetentionJob, mocks } = await loadPrivacyRetentionJob({
      settingsRows,
      usageDeleteManyImpl: usageDeleteMany,
      notificationDeleteManyImpl: notificationDeleteMany,
      insightDeleteManyImpl: insightDeleteMany,
      planDeleteManyImpl: planDeleteMany,
      updateOneImpl: updateOne,
    });

    startPrivacyRetentionJob();
    await flushPromises();
    await flushPromises();

    expect(mocks.UserSettings.find).toHaveBeenCalledWith({
      'privacySettings.retentionDays': { $exists: true },
    });

    expect(mocks.findChain.select).toHaveBeenCalledWith('_id user privacySettings');
    expect(mocks.findChain.lean).toHaveBeenCalledTimes(1);

    expect(usageDeleteMany).toHaveBeenCalledTimes(2);
    expect(notificationDeleteMany).toHaveBeenCalledTimes(2);
    expect(insightDeleteMany).toHaveBeenCalledTimes(2);
    expect(planDeleteMany).toHaveBeenCalledTimes(2);

    expect(usageDeleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: 'user-1',
        startTime: { $lt: expect.any(Date) },
      })
    );

    expect(notificationDeleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: 'user-1',
        createdAt: { $lt: expect.any(Date) },
      })
    );

    expect(insightDeleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: 'user-1',
        createdAt: { $lt: expect.any(Date) },
      })
    );

    expect(planDeleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: 'user-1',
        createdAt: { $lt: expect.any(Date) },
      })
    );

    expect(usageDeleteMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        user: 'user-2',
        startTime: { $lt: expect.any(Date) },
      })
    );

    expect(mocks.UserSettings.updateOne).toHaveBeenCalledTimes(2);
    expect(mocks.UserSettings.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: 'settings-1' },
      {
        $set: {
          'privacySettings.lastRetentionCleanupAt': expect.any(Date),
        },
      }
    );

    expect(mocks.UserSettings.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: 'settings-2' },
      {
        $set: {
          'privacySettings.lastRetentionCleanupAt': expect.any(Date),
        },
      }
    );

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), SIX_HOURS_MS);

    const timer = setIntervalSpy.mock.results[0]?.value;
    expect(timer.unref).toHaveBeenCalledTimes(1);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[privacy-retention] checked=2 totalDeleted=14'
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  test('TC_PRIVACY_012 privacyRetention job leaves collections untouched when no eligible settings exist', async () => {
    const usageDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const notificationDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const insightDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const planDeleteMany = jest.fn().mockResolvedValue({ deletedCount: 0 });
    const updateOne = jest.fn().mockResolvedValue({ acknowledged: true });

    const { startPrivacyRetentionJob, mocks } = await loadPrivacyRetentionJob({
      settingsRows: [],
      usageDeleteManyImpl: usageDeleteMany,
      notificationDeleteManyImpl: notificationDeleteMany,
      insightDeleteManyImpl: insightDeleteMany,
      planDeleteManyImpl: planDeleteMany,
      updateOneImpl: updateOne,
    });

    startPrivacyRetentionJob();
    await flushPromises();
    await flushPromises();

    expect(mocks.UserSettings.find).toHaveBeenCalledWith({
      'privacySettings.retentionDays': { $exists: true },
    });

    expect(mocks.findChain.select).toHaveBeenCalledWith('_id user privacySettings');
    expect(mocks.findChain.lean).toHaveBeenCalledTimes(1);

    expect(usageDeleteMany).not.toHaveBeenCalled();
    expect(notificationDeleteMany).not.toHaveBeenCalled();
    expect(insightDeleteMany).not.toHaveBeenCalled();
    expect(planDeleteMany).not.toHaveBeenCalled();
    expect(mocks.UserSettings.updateOne).not.toHaveBeenCalled();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), SIX_HOURS_MS);

    const timer = setIntervalSpy.mock.results[0]?.value;
    expect(timer.unref).toHaveBeenCalledTimes(1);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[privacy-retention] checked=0 totalDeleted=0'
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});