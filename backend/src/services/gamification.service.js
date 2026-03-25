const LEVELS = [
  { number: 1, title: "Mindful Seed", minPoints: 0 },
  { number: 2, title: "Focus Explorer", minPoints: 200 },
  { number: 3, title: "Balance Builder", minPoints: 500 },
  { number: 4, title: "Calm Keeper", minPoints: 800 },
  { number: 5, title: "Digital Nomad", minPoints: 1200 },
  { number: 6, title: "Zen Master", minPoints: 2000 },
];

const BADGES = [
  {
    key: "lock",
    label: "Lock",
    emoji: "🌱",
    description: "Completed onboarding and started the detox journey.",
    hint: "Finish profile setup to unlock this badge.",
    rule: (user) => user.isOnboarded === true,
  },
  {
    key: "sun",
    label: "Sun",
    emoji: "☀️",
    description: "Completed your first streak day.",
    hint: "Complete one full detox day to unlock this badge.",
    rule: (user) => (user.streakCount || 0) >= 1,
  },
  {
    key: "zen",
    label: "Zen",
    emoji: "🧘",
    description: "Maintained a 7-day wellness streak.",
    hint: "Reach a 7-day streak to unlock this badge.",
    rule: (user) => (user.streakCount || 0) >= 7,
  },
  {
    key: "focus",
    label: "Focus",
    emoji: "🎯",
    description: "Earned at least 500 points through mindful progress.",
    hint: "Earn 500 total points to unlock this badge.",
    rule: (user) => (user.points || 0) >= 500,
  },
  {
    key: "calm",
    label: "Calm",
    emoji: "🌙",
    description: "Reached a longest streak of 14 days.",
    hint: "Reach a 14-day longest streak to unlock this badge.",
    rule: (user) => (user.longestStreak || 0) >= 14,
  },
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
  const level = getLevelFromPoints(points);
  const nextLevel = getNextLevelFromPoints(points);

  if (!nextLevel) {
    return {
      level,
      nextLevel: null,
      progressPct: 100,
      pointsToNextLevel: 0,
    };
  }

  const range = nextLevel.minPoints - level.minPoints;
  const earnedInsideLevel = Math.max(0, points - level.minPoints);
  const progressPct =
    range > 0 ? Math.min(100, Math.round((earnedInsideLevel / range) * 100)) : 100;

  return {
    level,
    nextLevel,
    progressPct,
    pointsToNextLevel: Math.max(0, nextLevel.minPoints - points),
  };
};

export const getBadgeCatalog = () =>
  BADGES.map((badge) => ({
    key: badge.key,
    label: badge.label,
    emoji: badge.emoji,
    description: badge.description,
    hint: badge.hint,
  }));

export const getBadgePresentation = (badge) => {
  const definition = BADGES.find((item) => item.key === badge?.key);

  return {
    key: badge?.key || definition?.key || "",
    label: badge?.label || definition?.label || "",
    emoji: definition?.emoji || "🏅",
    description: definition?.description || "Achievement unlocked.",
    earnedAt: badge?.earnedAt || null,
  };
};

export const getUnlockedBadgeDetails = (user) => {
  if (!Array.isArray(user?.badges)) return [];

  return user.badges.map((badge) => getBadgePresentation(badge));
};

export const getNextBadgeHint = (user) => {
  const earnedKeys = new Set((user?.badges || []).map((badge) => badge.key));

  for (const badge of BADGES) {
    if (!earnedKeys.has(badge.key)) {
      return {
        key: badge.key,
        label: badge.label,
        emoji: badge.emoji,
        description: badge.description,
        hint: badge.hint,
      };
    }
  }

  return null;
};

export const getBadgeStats = (user) => {
  const unlockedCount = Array.isArray(user?.badges) ? user.badges.length : 0;
  const totalBadges = BADGES.length;
  const completionPct =
    totalBadges > 0 ? Math.round((unlockedCount / totalBadges) * 100) : 0;

  return {
    unlockedCount,
    totalBadges,
    completionPct,
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