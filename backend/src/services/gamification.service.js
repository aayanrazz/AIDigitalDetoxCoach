const LEVELS = [
  { number: 1, title: "Mindful Seed", minPoints: 0 },
  { number: 2, title: "Focus Explorer", minPoints: 200 },
  { number: 3, title: "Balance Builder", minPoints: 500 },
  { number: 4, title: "Calm Keeper", minPoints: 800 },
  { number: 5, title: "Digital Nomad", minPoints: 1200 },
  { number: 6, title: "Zen Master", minPoints: 2000 },
];

const BADGES = [
  { key: "sun", label: "Sun", rule: (user) => (user.streakCount || 0) >= 1 },
  { key: "zen", label: "Zen", rule: (user) => (user.streakCount || 0) >= 7 },
  { key: "focus", label: "Focus", rule: (user) => (user.points || 0) >= 500 },
  { key: "lock", label: "Lock", rule: (user) => user.isOnboarded === true },
  { key: "calm", label: "Calm", rule: (user) => (user.longestStreak || 0) >= 14 },
];

export const getLevelFromPoints = (points = 0) => {
  let current = LEVELS[0];

  for (const level of LEVELS) {
    if (points >= level.minPoints) {
      current = level;
    }
  }

  return current;
};

export const getNextLevelFromPoints = (points = 0) => {
  return LEVELS.find((level) => points < level.minPoints) || null;
};

export const getLevelProgressFromPoints = (points = 0) => {
  const currentLevel = getLevelFromPoints(points);
  const nextLevel = getNextLevelFromPoints(points);

  if (!nextLevel) {
    return {
      level: currentLevel,
      nextLevel: null,
      progressPct: 100,
      pointsToNextLevel: 0,
    };
  }

  const range = nextLevel.minPoints - currentLevel.minPoints;
  const earnedInsideLevel = Math.max(0, points - currentLevel.minPoints);
  const progressPct =
    range > 0 ? Math.min(100, Math.round((earnedInsideLevel / range) * 100)) : 100;

  return {
    level: currentLevel,
    nextLevel,
    progressPct,
    pointsToNextLevel: Math.max(0, nextLevel.minPoints - points),
  };
};

export const syncBadges = (user) => {
  if (!Array.isArray(user.badges)) {
    user.badges = [];
  }

  const existing = new Set(user.badges.map((badge) => badge.key));
  const newlyUnlocked = [];

  for (const badge of BADGES) {
    if (badge.rule(user) && !existing.has(badge.key)) {
      user.badges.push({
        key: badge.key,
        label: badge.label,
        earnedAt: new Date(),
      });
      newlyUnlocked.push(badge.label);
    }
  }

  return newlyUnlocked;
};