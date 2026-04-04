import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeLeanResult = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const makeTaskCollection = (tasks) => {
  const collection = tasks.map((task) => ({ ...task }));
  collection.id = (taskId) => collection.find((task) => task._id === taskId) || null;
  return collection;
};

const loadController = async ({
  userSettingsFindOne,
  userSettingsCreate,
  usageSessionFind,
  buildPlanMlFeaturesForDay,
  buildPlanTargetInsight,
  buildDetoxPlan,
  detoxPlanCreate,
  detoxPlanFindOne,
  detoxPlanUpdateMany,
  notificationCreate,
  rewardLedgerCreate,
  syncBadges,
  getLevelProgressFromPoints,
  serializeUser,
} = {}) => {
  const UserSettings = {
    findOne: userSettingsFindOne ?? jest.fn().mockResolvedValue({ dailyLimitMinutes: 180 }),
    create: userSettingsCreate ?? jest.fn().mockResolvedValue({ dailyLimitMinutes: 180 }),
  };

  const UsageSession = {
    find: usageSessionFind ?? jest.fn(() => makeLeanResult([])),
  };

  const DetoxPlan = {
    updateMany: detoxPlanUpdateMany ?? jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    create: detoxPlanCreate ?? jest.fn(),
    findOne: detoxPlanFindOne ?? jest.fn(),
  };

  const Notification = {
    create: notificationCreate ?? jest.fn().mockResolvedValue({ _id: 'notif-1' }),
  };

  const RewardLedger = {
    create: rewardLedgerCreate ?? jest.fn().mockResolvedValue({ _id: 'ledger-1' }),
  };

  jest.unstable_mockModule('../../models/UserSettings.js', () => ({ default: UserSettings }));
  jest.unstable_mockModule('../../models/UsageSession.js', () => ({ default: UsageSession }));
  jest.unstable_mockModule('../../models/DetoxPlan.js', () => ({ default: DetoxPlan }));
  jest.unstable_mockModule('../../models/Notification.js', () => ({ default: Notification }));
  jest.unstable_mockModule('../../models/RewardLedger.js', () => ({ default: RewardLedger }));
  jest.unstable_mockModule('../../services/ml/planFeatureBuilder.js', () => ({
    buildPlanMlFeaturesForDay: buildPlanMlFeaturesForDay ?? jest.fn().mockResolvedValue({ featureRow: { score: 62 } }),
  }));
  jest.unstable_mockModule('../../services/ml/planMl.service.js', () => ({
    buildPlanTargetInsight: buildPlanTargetInsight ?? jest.fn().mockResolvedValue({
      source: 'tensorflow',
      fallbackUsed: false,
      predictedTargetDailyLimitMinutes: 150,
      errorMessage: '',
    }),
  }));
  jest.unstable_mockModule('../../services/detoxPlan.service.js', () => ({
    buildDetoxPlan: buildDetoxPlan ?? jest.fn().mockReturnValue({
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-24T00:00:00.000Z'),
      durationDays: 21,
      targetDailyLimitMinutes: 150,
      aiInsight: 'Mock plan insight',
      planSummary: 'Mock plan summary',
      active: true,
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-04-04T00:00:00.000Z'),
          targetLimitMinutes: 180,
          status: 'in_progress',
          tasks: makeTaskCollection([
            { _id: 'task-1', title: 'Morning mindful start', type: 'wellness', status: 'in_progress' },
            { _id: 'task-2', title: 'Stay under 180 minutes', type: 'limit', status: 'pending' },
          ]),
        },
      ],
    }),
  }));
  jest.unstable_mockModule('../../services/gamification.service.js', () => ({
    syncBadges: syncBadges ?? jest.fn(() => []),
    getLevelProgressFromPoints: getLevelProgressFromPoints ?? jest.fn(() => ({
      level: { number: 2, title: 'Focus Explorer' },
      nextLevel: { number: 3, title: 'Balance Builder' },
      progressPct: 40,
      pointsToNextLevel: 120,
    })),
  }));
  jest.unstable_mockModule('../../utils/serialize.js', () => ({
    serializeUser: serializeUser ?? jest.fn((user) => ({ _id: user._id, points: user.points })),
  }));

  const controller = await import('../detoxPlan.controller.js');

  return {
    ...controller,
    mocks: {
      UserSettings,
      UsageSession,
      DetoxPlan,
      Notification,
      RewardLedger,
    },
  };
};

describe('Module 11 - detoxPlan.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-04T10:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('TC_PLAN_006 generateDetoxPlan archives old plans, creates a new plan, and returns plan meta', async () => {
    const settingsDoc = { user: 'user-1', dailyLimitMinutes: 180 };
    const planDoc = {
      _id: 'plan-1',
      user: 'user-1',
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-24T00:00:00.000Z'),
      durationDays: 21,
      targetDailyLimitMinutes: 150,
      aiInsight: 'Mock plan insight',
      planSummary: 'Mock plan summary',
      active: true,
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-04-04T00:00:00.000Z'),
          targetLimitMinutes: 180,
          status: 'in_progress',
          tasks: makeTaskCollection([
            { _id: 'task-1', title: 'Mindful start', type: 'wellness', status: 'in_progress' },
            { _id: 'task-2', title: 'Stay under 180 minutes', type: 'limit', status: 'pending' },
          ]),
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };

    const buildDetoxPlanMock = jest.fn().mockReturnValue({
      startDate: new Date('2026-04-04T00:00:00.000Z'),
      endDate: new Date('2026-04-24T00:00:00.000Z'),
      durationDays: 21,
      targetDailyLimitMinutes: 150,
      aiInsight: 'ML-assisted plan',
      planSummary: 'Plan summary',
      active: true,
      days: planDoc.days,
    });

    const { generateDetoxPlan, mocks } = await loadController({
      userSettingsFindOne: jest.fn().mockResolvedValue(settingsDoc),
      usageSessionFind: jest.fn(() => makeLeanResult([
        { dayKey: '2026-04-03', durationMinutes: 240 },
        { dayKey: '2026-04-02', durationMinutes: 180 },
      ])),
      buildPlanMlFeaturesForDay: jest.fn().mockResolvedValue({ featureRow: { score: 64 } }),
      buildPlanTargetInsight: jest.fn().mockResolvedValue({
        source: 'tensorflow',
        fallbackUsed: false,
        predictedTargetDailyLimitMinutes: 150,
        errorMessage: '',
      }),
      buildDetoxPlan: buildDetoxPlanMock,
      detoxPlanCreate: jest.fn().mockResolvedValue(planDoc),
    });

    const req = { user: { _id: 'user-1', detoxScore: 20 } };
    const res = makeRes();
    const next = jest.fn();

    await generateDetoxPlan(req, res, next);

    expect(mocks.DetoxPlan.updateMany).toHaveBeenCalledWith(
      { user: 'user-1', active: true },
      { $set: { active: false } }
    );
    expect(buildDetoxPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({
        avgDailyMinutes: 210,
        settings: settingsDoc,
        score: 64,
        predictedTargetDailyLimitMinutes: 150,
        planPredictionSource: 'tensorflow',
      })
    );
    expect(mocks.Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        type: 'summary',
        title: 'New detox plan generated',
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Detox plan generated successfully.',
        plan: expect.objectContaining({
          totalDays: 1,
          totalTasks: 2,
          currentDayNumber: 1,
        }),
        planMeta: {
          targetSource: 'tensorflow',
          fallbackUsed: false,
          predictedTargetDailyLimitMinutes: 150,
          effectiveTargetDailyLimitMinutes: 150,
          averageRecentDailyMinutes: 210,
          scoreUsed: 64,
          errorMessage: '',
        },
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_PLAN_007 completePlanTask awards base, day, and plan points and syncs badges on final task completion', async () => {
    const finalTask = { _id: 'task-2', title: 'Stay under 180 minutes', type: 'limit', status: 'in_progress' };
    const planDoc = {
      _id: 'plan-1',
      user: 'user-1',
      durationDays: 1,
      active: true,
      days: [
        {
          dayNumber: 1,
          date: new Date('2026-04-04T00:00:00.000Z'),
          targetLimitMinutes: 180,
          status: 'in_progress',
          tasks: makeTaskCollection([
            { _id: 'task-1', title: 'Morning mindful start', type: 'wellness', status: 'completed', completedAt: new Date('2026-04-04T08:00:00.000Z') },
            finalTask,
          ]),
        },
      ],
      save: jest.fn().mockResolvedValue(undefined),
    };

    const syncBadgesMock = jest.fn(() => ['Sun']);
    const serializeUserMock = jest.fn((user) => ({ _id: user._id, points: user.points }));
    const levelProgressMock = jest.fn(() => ({
      level: { number: 2, title: 'Focus Explorer' },
      nextLevel: { number: 3, title: 'Balance Builder' },
      progressPct: 55,
      pointsToNextLevel: 90,
    }));

    const { completePlanTask, mocks } = await loadController({
      detoxPlanFindOne: jest.fn().mockResolvedValue(planDoc),
      syncBadges: syncBadgesMock,
      getLevelProgressFromPoints: levelProgressMock,
      serializeUser: serializeUserMock,
    });

    const req = {
      params: { planId: 'plan-1', taskId: 'task-2' },
      user: {
        _id: 'user-1',
        points: 180,
        streakCount: 0,
        longestStreak: 0,
        lastStreakDate: null,
        badges: [],
        save: jest.fn().mockResolvedValue(undefined),
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await completePlanTask(req, res, next);

    expect(planDoc.days[0].tasks.id('task-2').status).toBe('completed');
    expect(planDoc.days[0].tasks.id('task-2').completedAt).toBeInstanceOf(Date);
    expect(req.user.points).toBe(495);
    expect(req.user.streakCount).toBe(1);
    expect(req.user.longestStreak).toBe(1);
    expect(req.user.lastStreakDate).toBeInstanceOf(Date);
    expect(syncBadgesMock).toHaveBeenCalledWith(req.user);
    expect(req.user.save).toHaveBeenCalledTimes(1);
    expect(planDoc.save).toHaveBeenCalledTimes(1);
    expect(mocks.RewardLedger.create).toHaveBeenCalledTimes(3);
    expect(mocks.Notification.create).toHaveBeenCalledTimes(3);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Task completed successfully.',
        user: expect.objectContaining({
          _id: 'user-1',
          points: 495,
          level: { number: 2, title: 'Focus Explorer' },
          nextLevel: { number: 3, title: 'Balance Builder' },
          progressPct: 55,
          pointsToNextLevel: 90,
        }),
        completion: {
          taskTitle: 'Stay under 180 minutes',
          taskType: 'limit',
          basePointsEarned: 25,
          dayBonusPoints: 40,
          planBonusPoints: 250,
          totalPointsEarned: 315,
          dayCompleted: true,
          planCompleted: true,
          completedDayNumber: 1,
        },
        newBadges: ['Sun'],
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_PLAN_008 completePlanTask rejects already completed tasks', async () => {
    const planDoc = {
      _id: 'plan-1',
      user: 'user-1',
      active: true,
      days: [
        {
          dayNumber: 1,
          tasks: makeTaskCollection([
            { _id: 'task-1', title: 'Already done', type: 'habit', status: 'completed' },
          ]),
        },
      ],
    };

    const { completePlanTask } = await loadController({
      detoxPlanFindOne: jest.fn().mockResolvedValue(planDoc),
    });

    const req = {
      params: { planId: 'plan-1', taskId: 'task-1' },
      user: { _id: 'user-1' },
    };
    const res = makeRes();
    const next = jest.fn();

    await completePlanTask(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      message: 'Task already completed.',
    });
    expect(res.json).not.toHaveBeenCalled();
  });
});