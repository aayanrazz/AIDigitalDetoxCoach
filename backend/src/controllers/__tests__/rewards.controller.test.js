import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const makeRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

const makeSortedLimitSelectResult = (value) => ({
  sort: jest.fn(() => ({
    limit: jest.fn(() => ({
      select: jest.fn().mockResolvedValue(value),
    })),
  })),
});

const makeSortedLimitResult = (value) => ({
  sort: jest.fn(() => ({
    limit: jest.fn().mockResolvedValue(value),
  })),
});

const loadRewardsController = async ({
  rewardFind,
  userFind,
  rewardCreate,
  notificationCreate,
  levelProgress,
  unlockedBadges,
  badgeStats,
  nextBadgeHint,
  serializeUser,
} = {}) => {
  const RewardLedger = {
    find: rewardFind ?? jest.fn(() => makeSortedLimitResult([])),
    create: rewardCreate ?? jest.fn().mockResolvedValue({ _id: 'ledger-1' }),
  };

  const User = {
    find: userFind ?? jest.fn(() => makeSortedLimitSelectResult([])),
  };

  const Notification = {
    create: notificationCreate ?? jest.fn().mockResolvedValue({ _id: 'notif-1' }),
  };

  jest.unstable_mockModule('../../models/RewardLedger.js', () => ({ default: RewardLedger }));
  jest.unstable_mockModule('../../models/User.js', () => ({ default: User }));
  jest.unstable_mockModule('../../models/Notification.js', () => ({ default: Notification }));
  jest.unstable_mockModule('../../utils/serialize.js', () => ({
    serializeUser: serializeUser ?? jest.fn((user) => ({ _id: user._id, points: user.points })),
  }));
  jest.unstable_mockModule('../../services/gamification.service.js', () => ({
    getLevelProgressFromPoints: levelProgress ?? jest.fn(() => ({
      level: { number: 2, title: 'Focus Explorer' },
      nextLevel: { number: 3, title: 'Balance Builder' },
      progressPct: 40,
      pointsToNextLevel: 120,
    })),
    getUnlockedBadgeDetails: unlockedBadges ?? jest.fn(() => [{ key: 'sun', label: 'Sun', emoji: '☀️' }]),
    getBadgeStats: badgeStats ?? jest.fn(() => ({ unlockedCount: 1, totalBadges: 5, completionPct: 20 })),
    getNextBadgeHint: nextBadgeHint ?? jest.fn(() => ({ key: 'zen', label: 'Zen', hint: 'Reach 7 days' })),
  }));

  const controller = await import('../rewards.controller.js');
  return { ...controller, mocks: { RewardLedger, User, Notification } };
};

describe('Module 12 - rewards.controller', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('TC_ENGAGE_004 getRewardsSummary returns leaderboard, level progress, badges, and redeemables', async () => {
    const rewards = [{ _id: 'r1', type: 'earn', points: 25, title: 'Task completed' }];
    const leaderboard = [{ name: 'Aayan', points: 620, streakCount: 3 }];

    const { getRewardsSummary } = await loadRewardsController({
      rewardFind: jest.fn(() => makeSortedLimitResult(rewards)),
      userFind: jest.fn(() => makeSortedLimitSelectResult(leaderboard)),
      serializeUser: jest.fn(() => ({ _id: 'user-1', points: 620 })),
    });

    const req = { user: { _id: 'user-1', points: 620, badges: [{ key: 'sun', label: 'Sun' }] } };
    const res = makeRes();
    const next = jest.fn();

    await getRewardsSummary(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        user: { _id: 'user-1', points: 620 },
        level: { number: 2, title: 'Focus Explorer' },
        nextLevel: { number: 3, title: 'Balance Builder' },
        levelProgress: { progressPct: 40, pointsToNextLevel: 120 },
        badges: [{ key: 'sun', label: 'Sun', emoji: '☀️' }],
        badgeStats: { unlockedCount: 1, totalBadges: 5, completionPct: 20 },
        nextBadgeHint: { key: 'zen', label: 'Zen', hint: 'Reach 7 days' },
        recentRewards: rewards,
        leaderboard,
        redeemables: expect.arrayContaining([
          expect.objectContaining({ code: 'DARK_THEME_PRO', points: 500 }),
          expect.objectContaining({ code: 'FOCUS_DAY_PASS', points: 700 }),
          expect.objectContaining({ code: 'PLANT_A_TREE', points: 1000 }),
        ]),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_ENGAGE_005 redeemReward deducts points, creates ledger and notification, and returns updated level data', async () => {
    const user = {
      _id: 'user-1',
      points: 800,
      badges: [{ key: 'sun', label: 'Sun' }],
      save: jest.fn().mockResolvedValue(undefined),
    };

    const { redeemReward, mocks } = await loadRewardsController({
      serializeUser: jest.fn((u) => ({ _id: u._id, points: u.points })),
    });

    const req = { user, body: { code: 'FOCUS_DAY_PASS' } };
    const res = makeRes();
    const next = jest.fn();

    await redeemReward(req, res, next);

    expect(user.points).toBe(100);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(mocks.RewardLedger.create).toHaveBeenCalledWith({
      user: 'user-1',
      type: 'redeem',
      points: -700,
      title: 'Focus Day Pass',
      description: 'Redeemed Focus Day Pass',
    });
    expect(mocks.Notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user: 'user-1',
        type: 'achievement',
        title: 'Reward redeemed',
      })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Focus Day Pass redeemed successfully.',
        user: { _id: 'user-1', points: 100 },
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('TC_ENGAGE_006 redeemReward rejects invalid code or insufficient points', async () => {
    const { redeemReward } = await loadRewardsController();

    const resA = makeRes();
    const nextA = jest.fn();
    await redeemReward({ user: { _id: 'user-1', points: 100 }, body: { code: 'UNKNOWN' } }, resA, nextA);
    expect(nextA).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Invalid reward code.' }));

    const resB = makeRes();
    const nextB = jest.fn();
    await redeemReward({ user: { _id: 'user-1', points: 100 }, body: { code: 'PLANT_A_TREE' } }, resB, nextB);
    expect(nextB).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: 'Not enough points.' }));
  });
});