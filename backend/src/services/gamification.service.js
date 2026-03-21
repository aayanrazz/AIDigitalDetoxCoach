const LEVELS = [
  { number: 1, title: "Mindful Seed", minPoints: 0 },
  { number: 2, title: "Focus Explorer", minPoints: 200 },
  { number: 3, title: "Balance Builder", minPoints: 500 },
  { number: 4, title: "Calm Keeper", minPoints: 800 },
  { number: 5, title: "Digital Nomad", minPoints: 1200 },
  { number: 6, title: "Zen Master", minPoints: 2000 },
];

const BADGES = [
  { key: "sun", label: "Sun", rule: (user) => user.streakCount >= 1 },
  { key: "zen", label: "Zen", rule: (user) => user.streakCount >= 7 },
  { key: "focus", label: "Focus", rule: (user) => user.points >= 500 },
  { key: "lock", label: "Lock", rule: (user) => user.isOnboarded === true },
];

export const getLevelFromPoints = (points = 0) => {
  let current = LEVELS[0];
  for (const level of LEVELS) {
    if (points >= level.minPoints) current = level;
  }
  return current;
};

export const syncBadges = (user) => {
  const existing = new Set((user.badges || []).map((b) => b.key));
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