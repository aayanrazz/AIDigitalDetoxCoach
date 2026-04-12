import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSettingsFindOne: any = jest.fn();
const mockSettingsCreate: any = jest.fn();
const mockUsageFind: any = jest.fn();
const mockDetoxPlanUpdateMany: any = jest.fn();
const mockDetoxPlanCreate: any = jest.fn();
const mockDetoxPlanFindOne: any = jest.fn();
const mockNotificationCreate: any = jest.fn();
const mockRewardLedgerCreate: any = jest.fn();
const mockBuildPlanMlFeaturesForDay: any = jest.fn();
const mockBuildPlanTargetInsight: any = jest.fn();
const mockBuildDetoxPlan: any = jest.fn();
const mockSyncBadges: any = jest.fn();
const mockGetLevelProgressFromPoints: any = jest.fn();
const mockSerializeUser: any = jest.fn((user: any) => ({
  _id: user._id,
  name: user.name || 'Aayan',
  email: user.email || 'aayan@example.com',
  points: user.points
}));

const mockFormatDayKey: any = jest.fn((date?: Date) => {
  if (!date) return '2026-04-12';
  const iso = new Date(date).toISOString().slice(0, 10);
  if (iso === '2026-04-11') return '2026-04-11';
  if (iso === '2026-04-12') return '2026-04-12';
  return '2026-04-10';
});

const mockAddDays: any = jest.fn((date: Date, days: number) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
});

jest.unstable_mockModule('../../src/models/UserSettings.js', () => ({
  default: {
    findOne: mockSettingsFindOne,
    create: mockSettingsCreate
  }
}));

jest.unstable_mockModule('../../src/models/UsageSession.js', () => ({
  default: {
    find: mockUsageFind
  }
}));

jest.unstable_mockModule('../../src/models/DetoxPlan.js', () => ({
  default: {
    updateMany: mockDetoxPlanUpdateMany,
    create: mockDetoxPlanCreate,
    findOne: mockDetoxPlanFindOne
  }
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    create: mockNotificationCreate
  }
}));

jest.unstable_mockModule('../../src/models/RewardLedger.js', () => ({
  default: {
    create: mockRewardLedgerCreate
  }
}));

jest.unstable_mockModule('../../src/utils/date.js', () => ({
  formatDayKey: mockFormatDayKey,
  addDays: mockAddDays
}));

jest.unstable_mockModule('../../src/services/detoxPlan.service.js', () => ({
  buildDetoxPlan: mockBuildDetoxPlan
}));

jest.unstable_mockModule('../../src/services/gamification.service.js', () => ({
  syncBadges: mockSyncBadges,
  getLevelProgressFromPoints: mockGetLevelProgressFromPoints
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: mockSerializeUser
}));

jest.unstable_mockModule('../../src/services/ml/planFeatureBuilder.js', () => ({
  buildPlanMlFeaturesForDay: mockBuildPlanMlFeaturesForDay
}));

jest.unstable_mockModule('../../src/services/ml/planMl.service.js', () => ({
  buildPlanTargetInsight: mockBuildPlanTargetInsight
}));

const { generateDetoxPlan, getActivePlan, completePlanTask } = await import('../../src/controllers/detoxPlan.controller.js');
const { getPlanTargetPreviewWithMl } = await import('../../src/controllers/planPreview.ml.controller.js');

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

function chainLeanResolved(value: any) {
  return {
    lean: jest.fn().mockImplementationOnce(async () => value)
  };
}

function chainSortResolved(value: any) {
  return {
    sort: jest.fn().mockImplementationOnce(async () => value)
  };
}

function getNextError(next: any) {
  return next.mock.calls[0][0];
}

describe('Module 11 - detoxPlan.controller.js / planPreview.ml.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFormatDayKey.mockImplementation((date?: Date) => {
      if (!date) return '2026-04-12';
      const iso = new Date(date).toISOString().slice(0, 10);
      if (iso === '2026-04-11') return '2026-04-11';
      if (iso === '2026-04-12') return '2026-04-12';
      return '2026-04-10';
    });
  });

  it('TC_DETOX_PLAN_CTRL_001 - generateDetoxPlan creates default settings, deactivates old plan, and returns generated plan', async () => {
    mockSettingsFindOne.mockImplementationOnce(async () => null);
    mockSettingsCreate.mockImplementationOnce(async () => ({
      user: 'user-001',
      dailyLimitMinutes: 180,
      focusAreas: ['Social Media']
    }));

    mockUsageFind.mockImplementationOnce(() =>
      chainLeanResolved([
        {
          dayKey: '2026-04-11',
          durationMinutes: 240
        },
        {
          dayKey: '2026-04-12',
          durationMinutes: 180
        }
      ])
    );

    mockBuildPlanMlFeaturesForDay.mockImplementationOnce(async () => ({
      featureRow: {
        score: 72,
        riskLevel: 'medium'
      }
    }));

    mockBuildPlanTargetInsight.mockImplementationOnce(async () => ({
      predictedTargetDailyLimitMinutes: 150,
      source: 'tensorflow',
      fallbackUsed: false,
      errorMessage: ''
    }));

    mockBuildDetoxPlan.mockImplementationOnce(() => ({
      targetDailyLimitMinutes: 150,
      durationDays: 7,
      active: true,
      days: [
        {
          dayNumber: 1,
          status: 'pending',
          tasks: [
            {
              _id: 'task-001',
              title: 'No social apps for 1 hour',
              type: 'habit',
              status: 'pending'
            }
          ]
        }
      ]
    }));

    mockDetoxPlanUpdateMany.mockImplementationOnce(async () => ({ acknowledged: true }));

    const planDoc = {
      _id: 'plan-001',
      user: 'user-001',
      targetDailyLimitMinutes: 150,
      durationDays: 7,
      active: true,
      days: [
        {
          dayNumber: 1,
          status: 'pending',
          tasks: [
            {
              _id: 'task-001',
              title: 'No social apps for 1 hour',
              type: 'habit',
              status: 'pending'
            }
          ]
        }
      ],
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockDetoxPlanCreate.mockImplementationOnce(async () => planDoc);
    mockNotificationCreate.mockImplementationOnce(async () => ({ _id: 'noti-001' }));

    const req = {
      user: {
        _id: 'user-001',
        detoxScore: 75
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await generateDetoxPlan(req, res as any, next);

    expect(mockSettingsCreate).toHaveBeenCalledWith({ user: 'user-001' });
    expect(mockDetoxPlanUpdateMany).toHaveBeenCalledWith(
      { user: 'user-001', active: true },
      { $set: { active: false } }
    );
    expect(planDoc.save).toHaveBeenCalled();
    expect(mockNotificationCreate).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Detox plan generated successfully.');
    expect(res.body.planMeta.targetSource).toBe('tensorflow');
    expect(res.body.plan.currentDayNumber).toBe(1);
  });

  it('TC_DETOX_PLAN_CTRL_002 - getActivePlan returns enriched active plan with computed progress', async () => {
    const planDoc = {
      _id: 'plan-001',
      active: true,
      durationDays: 7,
      days: [
        {
          dayNumber: 1,
          status: 'pending',
          tasks: [
            {
              _id: 'task-001',
              title: 'Sleep on time',
              type: 'sleep',
              status: 'pending'
            }
          ]
        }
      ],
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockDetoxPlanFindOne.mockImplementationOnce(() => chainSortResolved(planDoc));

    const req = {
      user: { _id: 'user-001' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await getActivePlan(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(planDoc.save).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.plan._id).toBe('plan-001');
    expect(res.body.plan.currentDayNumber).toBe(1);
    expect(res.body.plan.days[0].tasks[0].pointsReward).toBe(20);
  });

  it('TC_DETOX_PLAN_CTRL_003 - completePlanTask rejects when detox plan is not found', async () => {
    mockDetoxPlanFindOne.mockImplementationOnce(async () => null);

    const req = {
      user: { _id: 'user-001' },
      params: { planId: 'missing-plan', taskId: 'missing-task' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await completePlanTask(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Detox plan not found.');
    expect(error.statusCode).toBe(404);
  });

  it('TC_DETOX_PLAN_CTRL_004 - completePlanTask completes task, awards points, and returns completion summary', async () => {
    const targetTask: any = {
      _id: 'task-001',
      title: 'Sleep before 10 PM',
      type: 'sleep',
      status: 'pending',
      completedAt: null
    };

    const tasks: any = [targetTask];
    tasks.id = (taskId: string) => (taskId === 'task-001' ? targetTask : null);

    const targetDay: any = {
      dayNumber: 1,
      status: 'in_progress',
      tasks
    };

    const planDoc: any = {
      _id: 'plan-001',
      user: 'user-001',
      durationDays: 1,
      active: true,
      days: [targetDay],
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    mockDetoxPlanFindOne.mockImplementationOnce(async () => planDoc);

    mockSyncBadges.mockImplementationOnce(() => ['Consistency Star']);
    mockGetLevelProgressFromPoints.mockImplementationOnce(() => ({
      level: { number: 2, title: 'Focused Starter' },
      nextLevel: { number: 3, title: 'Focused Builder' },
      progressPct: 55,
      pointsToNextLevel: 90
    }));

    mockRewardLedgerCreate
      .mockImplementationOnce(async () => ({ _id: 'reward-001' }))
      .mockImplementationOnce(async () => ({ _id: 'reward-002' }))
      .mockImplementationOnce(async () => ({ _id: 'reward-003' }));

    mockNotificationCreate
      .mockImplementationOnce(async () => ({ _id: 'noti-day' }))
      .mockImplementationOnce(async () => ({ _id: 'noti-plan' }))
      .mockImplementationOnce(async () => ({ _id: 'noti-badge' }));

    const userDoc: any = {
      _id: 'user-001',
      name: 'Aayan',
      email: 'aayan@example.com',
      points: 100,
      streakCount: 0,
      longestStreak: 0,
      lastStreakDate: null,
      badges: [],
      save: jest.fn().mockImplementationOnce(async () => true)
    };

    const req = {
      user: userDoc,
      params: {
        planId: 'plan-001',
        taskId: 'task-001'
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await completePlanTask(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(userDoc.save).toHaveBeenCalled();
    expect(planDoc.save).toHaveBeenCalled();
    expect(mockRewardLedgerCreate).toHaveBeenCalledTimes(3);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(3);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe('Task completed successfully.');
    expect(res.body.completion).toEqual(
      expect.objectContaining({
        taskTitle: 'Sleep before 10 PM',
        taskType: 'sleep',
        basePointsEarned: 20,
        dayBonusPoints: 40,
        planBonusPoints: 250,
        totalPointsEarned: 310,
        dayCompleted: true,
        planCompleted: true,
        completedDayNumber: 1
      })
    );
    expect(res.body.newBadges).toEqual(['Consistency Star']);
    expect(res.body.user).toEqual(
      expect.objectContaining({
        points: 410,
        progressPct: 55,
        pointsToNextLevel: 90
      })
    );
  });

  it('TC_PLAN_PREVIEW_CTRL_001 - getPlanTargetPreviewWithMl returns preview based on ML prediction output', async () => {
    mockBuildPlanMlFeaturesForDay.mockImplementationOnce(async () => ({
      settings: { dailyLimitMinutes: 180 },
      dailyAnalysis: { riskLevel: 'medium' },
      featureRow: {
        riskLevel: 'medium',
        score: 70,
        totalScreenMinutes: 200,
        overLimitMinutes: 20,
        pickups: 25,
        unlocks: 25,
        lateNightMinutes: 10,
        sevenDayAvgScreenMinutes: 180
      }
    }));

    mockBuildPlanTargetInsight.mockImplementationOnce(async () => ({
      predictedTargetDailyLimitMinutes: 150,
      source: 'tensorflow',
      fallbackUsed: false,
      errorMessage: ''
    }));

    const req = { user: { _id: 'user-001' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await getPlanTargetPreviewWithMl(req, res as any, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview).toEqual(
      expect.objectContaining({
        currentDailyLimitMinutes: 180,
        predictedTargetDailyLimitMinutes: 150,
        predictionSource: 'tensorflow',
        fallbackUsed: false,
        todayAnalysisRiskLevel: 'medium'
      })
    );
  });
});
