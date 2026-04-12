import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockNotificationFind: any = jest.fn();
const mockNotificationCountDocuments: any = jest.fn();
const mockNotificationFindOne: any = jest.fn();
const mockNotificationUpdateMany: any = jest.fn();
const mockNotificationCreate: any = jest.fn();

const mockRewardLedgerFind: any = jest.fn();
const mockRewardLedgerCreate: any = jest.fn();

const mockUserFind: any = jest.fn();

const mockGetLevelProgressFromPoints: any = jest.fn();
const mockGetUnlockedBadgeDetails: any = jest.fn();
const mockGetBadgeStats: any = jest.fn();
const mockGetNextBadgeHint: any = jest.fn();
const mockSerializeUser: any = jest.fn((user: any) => ({
  _id: user._id,
  name: user.name,
  points: user.points,
  streakCount: user.streakCount
}));

jest.unstable_mockModule('../../src/models/Notification.js', () => ({
  default: {
    find: mockNotificationFind,
    countDocuments: mockNotificationCountDocuments,
    findOne: mockNotificationFindOne,
    updateMany: mockNotificationUpdateMany,
    create: mockNotificationCreate
  }
}));

jest.unstable_mockModule('../../src/models/RewardLedger.js', () => ({
  default: {
    find: mockRewardLedgerFind,
    create: mockRewardLedgerCreate
  }
}));

jest.unstable_mockModule('../../src/models/User.js', () => ({
  default: {
    find: mockUserFind
  }
}));

jest.unstable_mockModule('../../src/utils/serialize.js', () => ({
  serializeUser: mockSerializeUser
}));

jest.unstable_mockModule('../../src/services/gamification.service.js', () => ({
  getLevelProgressFromPoints: mockGetLevelProgressFromPoints,
  getUnlockedBadgeDetails: mockGetUnlockedBadgeDetails,
  getBadgeStats: mockGetBadgeStats,
  getNextBadgeHint: mockGetNextBadgeHint
}));

const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead
} = await import('../../src/controllers/notification.controller.js');

const {
  getRewardsSummary,
  redeemReward
} = await import('../../src/controllers/rewards.controller.js');

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

function notifFindChain(value: any) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn().mockImplementationOnce(async () => value)
    }))
  };
}

function ledgerFindChain(value: any) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn().mockImplementationOnce(async () => value)
    }))
  };
}

function leaderboardFindChain(value: any) {
  return {
    sort: jest.fn(() => ({
      limit: jest.fn(() => ({
        select: jest.fn().mockImplementationOnce(async () => value)
      }))
    }))
  };
}

function getNextError(next: any) {
  return next.mock.calls[0][0];
}

describe('Module 12 - notification.controller.js / rewards.controller.js', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetLevelProgressFromPoints.mockReturnValue({
      level: { number: 2, title: 'Focused Builder' },
      nextLevel: { number: 3, title: 'Deep Work' },
      progressPct: 65,
      pointsToNextLevel: 140
    });

    mockGetUnlockedBadgeDetails.mockReturnValue([
      { label: 'Starter', emoji: '🌱' }
    ]);

    mockGetBadgeStats.mockReturnValue({
      unlockedCount: 1,
      totalCount: 8
    });

    mockGetNextBadgeHint.mockReturnValue({
      hint: 'Keep your streak for one more day.'
    });
  });

  it('TC_NOTIF_CTRL_001 - getNotifications returns normalized notifications and unread count', async () => {
    mockNotificationFind.mockImplementationOnce(() =>
      notifFindChain([
        {
          _id: 'notif-1',
          user: 'user-1',
          title: 'Wind down reminder',
          body: 'Prepare for sleep.',
          isRead: false,
          cta: { action: 'wind_down' },
          createdAt: new Date('2026-04-12T10:00:00Z')
        },
        {
          _id: 'notif-2',
          user: 'user-1',
          title: 'Reward redeemed',
          body: 'You unlocked a reward.',
          isRead: true,
          cta: { label: 'VIEW REWARDS', action: 'open_rewards' },
          createdAt: new Date('2026-04-12T09:00:00Z')
        }
      ])
    );
    mockNotificationCountDocuments.mockImplementationOnce(async () => 1);

    const req = { user: { _id: 'user-1' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await getNotifications(req, res as any, next);

    expect(mockNotificationFind).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mockNotificationCountDocuments).toHaveBeenCalledWith({
      user: 'user-1',
      isRead: false
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: true,
      unreadCount: 1,
      notifications: [
        expect.objectContaining({
          _id: 'notif-1',
          title: 'Wind down reminder',
          cta: {
            label: 'OPEN SETTINGS',
            action: 'open_settings'
          }
        }),
        expect.objectContaining({
          _id: 'notif-2',
          title: 'Reward redeemed',
          cta: {
            label: 'VIEW REWARDS',
            action: 'open_rewards'
          }
        })
      ]
    });
  });

  it('TC_NOTIF_CTRL_002 - markNotificationRead returns 404 when notification is not found', async () => {
    mockNotificationFindOne.mockImplementationOnce(async () => null);

    const req = {
      user: { _id: 'user-1' },
      params: { id: 'missing-id' }
    } as any;
    const res = createRes();
    const next: any = jest.fn();

    await markNotificationRead(req, res as any, next);

    expect(mockNotificationFindOne).toHaveBeenCalledWith({
      _id: 'missing-id',
      user: 'user-1'
    });
    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Notification not found.');
    expect(error.statusCode).toBe(404);
  });

  it('TC_NOTIF_CTRL_003 - markNotificationRead updates notification state and returns unread count', async () => {
    const saveSpy: any = jest.fn().mockImplementationOnce(async () => true);
    const notificationDoc = {
      _id: 'notif-1',
      user: 'user-1',
      title: 'Reminder',
      body: 'Take a short break.',
      isRead: false,
      cta: { action: 'open_home' },
      save: saveSpy,
      toObject: () => ({
        _id: 'notif-1',
        user: 'user-1',
        title: 'Reminder',
        body: 'Take a short break.',
        isRead: true,
        cta: { action: 'open_home' }
      })
    };

    mockNotificationFindOne.mockImplementationOnce(async () => notificationDoc);
    mockNotificationCountDocuments.mockImplementationOnce(async () => 2);

    const req = {
      user: { _id: 'user-1' },
      params: { id: 'notif-1' }
    } as any;
    const res = createRes();
    const next: any = jest.fn();

    await markNotificationRead(req, res as any, next);

    expect(saveSpy).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: true,
      message: 'Notification marked as read.',
      unreadCount: 2,
      notification: expect.objectContaining({
        _id: 'notif-1',
        isRead: true,
        cta: {
          label: 'GO HOME',
          action: 'open_home'
        }
      })
    });
  });

  it('TC_NOTIF_CTRL_004 - markAllNotificationsRead marks all unread notifications as read', async () => {
    mockNotificationUpdateMany.mockImplementationOnce(async () => ({
      acknowledged: true,
      modifiedCount: 3
    }));

    const req = { user: { _id: 'user-1' } } as any;
    const res = createRes();
    const next: any = jest.fn();

    await markAllNotificationsRead(req, res as any, next);

    expect(mockNotificationUpdateMany).toHaveBeenCalledWith(
      { user: 'user-1', isRead: false },
      { $set: { isRead: true } }
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: true,
      message: 'All notifications marked as read.',
      unreadCount: 0
    });
  });

  it('TC_REWARDS_CTRL_001 - getRewardsSummary returns rewards summary, leaderboard, and redeemables', async () => {
    mockRewardLedgerFind.mockImplementationOnce(() =>
      ledgerFindChain([
        {
          _id: 'ledger-1',
          title: 'Completed task',
          points: 20,
          type: 'earn'
        }
      ])
    );

    mockUserFind.mockImplementationOnce(() =>
      leaderboardFindChain([
        { name: 'Aayan', points: 320, streakCount: 5 },
        { name: 'Bishal', points: 280, streakCount: 4 }
      ])
    );

    const req = {
      user: {
        _id: 'user-1',
        name: 'Aayan',
        points: 320,
        streakCount: 5,
        badges: ['starter']
      }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await getRewardsSummary(req, res as any, next);

    expect(mockRewardLedgerFind).toHaveBeenCalledWith({ user: 'user-1' });
    expect(mockUserFind).toHaveBeenCalledWith({});
    expect(next).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
    expect(res.body.user).toEqual({
      _id: 'user-1',
      name: 'Aayan',
      points: 320,
      streakCount: 5
    });
    expect(res.body.level).toEqual({ number: 2, title: 'Focused Builder' });
    expect(res.body.levelProgress).toEqual({
      progressPct: 65,
      pointsToNextLevel: 140
    });
    expect(res.body.redeemables).toHaveLength(3);
    expect(res.body.leaderboard).toHaveLength(2);
    expect(res.body.badges).toHaveLength(1);
  });

  it('TC_REWARDS_CTRL_002 - redeemReward rejects invalid reward code', async () => {
    const req = {
      user: { _id: 'user-1', name: 'Aayan', points: 600, save: jest.fn() },
      body: { code: 'INVALID_CODE' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await redeemReward(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Invalid reward code.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_REWARDS_CTRL_003 - redeemReward rejects when user does not have enough points', async () => {
    const req = {
      user: { _id: 'user-1', name: 'Aayan', points: 100, save: jest.fn() },
      body: { code: 'PLANT_A_TREE' }
    } as any;

    const res = createRes();
    const next: any = jest.fn();

    await redeemReward(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = getNextError(next);
    expect(error.message).toBe('Not enough points.');
    expect(error.statusCode).toBe(400);
  });

  it('TC_REWARDS_CTRL_004 - redeemReward deducts points, creates ledger and notification, and returns updated summary', async () => {
    const saveSpy: any = jest.fn().mockImplementationOnce(async () => true);

    const req = {
      user: {
        _id: 'user-1',
        name: 'Aayan',
        points: 1200,
        streakCount: 5,
        badges: ['starter'],
        save: saveSpy
      },
      body: { code: 'PLANT_A_TREE' }
    } as any;

    mockRewardLedgerCreate.mockImplementationOnce(async () => ({
      _id: 'ledger-1'
    }));
    mockNotificationCreate.mockImplementationOnce(async () => ({
      _id: 'notif-1'
    }));

    const res = createRes();
    const next: any = jest.fn();

    await redeemReward(req, res as any, next);

    expect(saveSpy).toHaveBeenCalled();
    expect(req.user.points).toBe(200);

    expect(mockRewardLedgerCreate).toHaveBeenCalledWith({
      user: 'user-1',
      type: 'redeem',
      points: -1000,
      title: 'Plant a Tree',
      description: 'Redeemed Plant a Tree'
    });

    expect(mockNotificationCreate).toHaveBeenCalledWith({
      user: 'user-1',
      type: 'achievement',
      title: 'Reward redeemed',
      body: 'You redeemed Plant a Tree. Keep going to unlock more.',
      cta: {
        label: 'VIEW REWARDS',
        action: 'open_rewards'
      }
    });

    expect(next).not.toHaveBeenCalled();
    expect(res.body).toEqual({
      success: true,
      message: 'Plant a Tree redeemed successfully.',
      user: {
        _id: 'user-1',
        name: 'Aayan',
        points: 200,
        streakCount: 5
      },
      level: { number: 2, title: 'Focused Builder' },
      nextLevel: { number: 3, title: 'Deep Work' },
      levelProgress: {
        progressPct: 65,
        pointsToNextLevel: 140
      },
      badges: [{ label: 'Starter', emoji: '🌱' }],
      badgeStats: {
        unlockedCount: 1,
        totalCount: 8
      },
      latestBadge: { label: 'Starter', emoji: '🌱' },
      nextBadgeHint: {
        hint: 'Keep your streak for one more day.'
      }
    });
  });
});
