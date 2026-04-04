import { describe, it, expect } from '@jest/globals';
import {
  getLevelFromPoints,
  getNextLevelFromPoints,
  getLevelProgressFromPoints,
  getBadgeCatalog,
  getBadgePresentation,
  getUnlockedBadgeDetails,
  getNextBadgeHint,
  getBadgeStats,
  syncBadges,
} from '../gamification.service.js';

describe('Module 12 - gamification.service', () => {
  it('TC_ENGAGE_011 calculates level progression and next level correctly', () => {
    expect(getLevelFromPoints(0)).toEqual({ number: 1, title: 'Mindful Seed', minPoints: 0 });
    expect(getLevelFromPoints(850)).toEqual({ number: 4, title: 'Calm Keeper', minPoints: 800 });
    expect(getNextLevelFromPoints(850)).toEqual({ number: 5, title: 'Digital Nomad', minPoints: 1200 });
    expect(getLevelProgressFromPoints(850)).toEqual({
      level: { number: 4, title: 'Calm Keeper', minPoints: 800 },
      nextLevel: { number: 5, title: 'Digital Nomad', minPoints: 1200 },
      progressPct: 13,
      pointsToNextLevel: 350,
    });
    expect(getLevelProgressFromPoints(2500)).toEqual({
      level: { number: 6, title: 'Zen Master', minPoints: 2000 },
      nextLevel: null,
      progressPct: 100,
      pointsToNextLevel: 0,
    });
  });

  it('TC_ENGAGE_012 syncBadges unlocks new badges and exposes badge presentation helpers', () => {
    const user = {
      isOnboarded: true,
      streakCount: 7,
      longestStreak: 14,
      points: 700,
      badges: [{ key: 'lock', label: 'Lock', earnedAt: new Date('2026-04-01T00:00:00.000Z') }],
    };

    const newlyUnlocked = syncBadges(user);

    expect(newlyUnlocked).toEqual(['Sun', 'Zen', 'Focus', 'Calm']);
    expect(getUnlockedBadgeDetails(user)).toHaveLength(5);
    expect(getBadgeStats(user)).toEqual({ unlockedCount: 5, totalBadges: 5, completionPct: 100 });
    expect(getNextBadgeHint(user)).toBeNull();
    expect(getBadgeCatalog()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'lock', emoji: '🌱' }),
      expect.objectContaining({ key: 'sun', emoji: '☀️' }),
    ]));
    expect(getBadgePresentation({ key: 'sun', earnedAt: '2026-04-04T00:00:00.000Z' })).toEqual(
      expect.objectContaining({ key: 'sun', label: 'Sun', emoji: '☀️' })
    );
  });
});