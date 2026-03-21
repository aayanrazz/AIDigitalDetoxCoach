const getLevelFromPointsLocal = (points = 0) => {
  const levels = [
    { number: 1, title: "Mindful Seed", minPoints: 0 },
    { number: 2, title: "Focus Explorer", minPoints: 200 },
    { number: 3, title: "Balance Builder", minPoints: 500 },
    { number: 4, title: "Calm Keeper", minPoints: 800 },
    { number: 5, title: "Digital Nomad", minPoints: 1200 },
    { number: 6, title: "Zen Master", minPoints: 2000 },
  ];

  let current = levels[0];
  for (const level of levels) {
    if (points >= level.minPoints) current = level;
  }
  return current;
};

export const serializeUser = (user) => {
  const level = getLevelFromPointsLocal(user.points || 0);

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    points: user.points,
    streakCount: user.streakCount,
    longestStreak: user.longestStreak,
    detoxScore: user.detoxScore,
    currentLevelNumber: level.number,
    currentLevelTitle: level.title,
    badges: user.badges || [],
    isOnboarded: user.isOnboarded,
    createdAt: user.createdAt,
  };
};