import { formatDayKey, isLateNightHour } from "../utils/date.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toHourLabel = (hour) => `${String(hour).padStart(2, "0")}:00`;

const toShortDateLabel = (dateLike) => {
  const d = new Date(dateLike);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const toLongDateLabel = (dateLike) => {
  const d = new Date(dateLike);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const buildRangeBuckets = ({ range, startDate, endDate = new Date() }) => {
  if (range === "day") {
    return Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: toHourLabel(hour),
      shortLabel: String(hour),
      minutes: 0,
    }));
  }

  const buckets = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    buckets.push({
      key: formatDayKey(cursor),
      label: toLongDateLabel(cursor),
      shortLabel: toShortDateLabel(cursor),
      minutes: 0,
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return buckets;
};

const deriveScore = ({ totalScreenMinutes, pickups, lateNightMinutes }) => {
  let score = 100;

  score -= Math.min(35, Math.round(totalScreenMinutes / 18));
  score -= Math.min(20, Math.round(pickups / 10));
  score -= Math.min(20, Math.round(lateNightMinutes / 8));

  return clamp(score, 0, 100);
};

const deriveRiskLevel = (score) => {
  if (score < 45) return "high";
  if (score < 70) return "medium";
  return "low";
};

const percentageChange = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);

  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return Math.round(((currentValue - previousValue) / previousValue) * 100);
};

const getDailyUsageSnapshots = (sessions = []) => {
  const byDay = new Map();

  for (const session of sessions) {
    const dayKey = session?.dayKey || formatDayKey(session?.startTime || new Date());
    const startTime = new Date(session?.startTime || new Date());
    const hour = startTime.getHours();

    if (!byDay.has(dayKey)) {
      byDay.set(dayKey, {
        totalScreenMinutes: 0,
        pickups: 0,
        lateNightMinutes: 0,
      });
    }

    const current = byDay.get(dayKey);
    const minutes = Number(session?.durationMinutes || 0);

    current.totalScreenMinutes += minutes;
    current.pickups += Number(session?.pickups || 0);

    if (isLateNightHour(hour)) {
      current.lateNightMinutes += minutes;
    }
  }

  return Array.from(byDay.values());
};

const getAiInsightScores = (aiInsights = []) => {
  if (!Array.isArray(aiInsights) || aiInsights.length === 0) {
    return [];
  }

  const latestByDay = new Map();

  for (const insight of aiInsights) {
    const dayKey = String(insight?.dayKey || "").trim();
    if (!dayKey) continue;

    const existing = latestByDay.get(dayKey);
    const currentCreatedAt = new Date(insight?.createdAt || insight?.updatedAt || 0).getTime();
    const existingCreatedAt = new Date(
      existing?.createdAt || existing?.updatedAt || 0
    ).getTime();

    if (!existing || currentCreatedAt >= existingCreatedAt) {
      latestByDay.set(dayKey, insight);
    }
  }

  return Array.from(latestByDay.values())
    .map((insight) => Number(insight?.score))
    .filter((score) => Number.isFinite(score));
};

const resolveAnalyticsScore = ({ sessions = [], aiInsights = [] }) => {
  const aiScores = getAiInsightScores(aiInsights);

  if (aiScores.length > 0) {
    return Math.round(
      aiScores.reduce((sum, score) => sum + score, 0) / aiScores.length
    );
  }

  const dailySnapshots = getDailyUsageSnapshots(sessions);

  if (dailySnapshots.length === 0) {
    return 100;
  }

  const derivedScores = dailySnapshots.map((snapshot) =>
    deriveScore({
      totalScreenMinutes: snapshot.totalScreenMinutes,
      pickups: snapshot.pickups,
      lateNightMinutes: snapshot.lateNightMinutes,
    })
  );

  return Math.round(
    derivedScores.reduce((sum, score) => sum + score, 0) / derivedScores.length
  );
};

export const buildAnalytics = ({
  sessions = [],
  user = null,
  aiInsights = [],
  range = "week",
  startDate,
  endDate = new Date(),
}) => {
  const categoryMap = {};
  const hourlyMap = Array.from({ length: 24 }, () => 0);
  const buckets = buildRangeBuckets({ range, startDate, endDate });
  const bucketMinutes = Object.fromEntries(
    buckets.map((bucket) => [bucket.key, 0])
  );

  let totalScreenMinutes = 0;
  let pickups = 0;
  let unlocks = 0;
  let lateNightMinutes = 0;

  for (const session of sessions) {
    const minutes = Number(session.durationMinutes || 0);
    const category = String(session.category || "Other").trim() || "Other";
    const sessionStart = new Date(session.startTime);
    const hour = sessionStart.getHours();

    totalScreenMinutes += minutes;
    pickups += Number(session.pickups || 0);
    unlocks += Number(session.unlocks || 0);
    hourlyMap[hour] += minutes;
    categoryMap[category] = (categoryMap[category] || 0) + minutes;

    if (isLateNightHour(hour)) {
      lateNightMinutes += minutes;
    }

    const bucketKey =
      range === "day"
        ? String(hour)
        : session.dayKey || formatDayKey(session.startTime);

    if (bucketMinutes[bucketKey] !== undefined) {
      bucketMinutes[bucketKey] += minutes;
    }
  }

  const trendPoints = buckets.map((bucket) => ({
    ...bucket,
    minutes: Math.round(bucketMinutes[bucket.key] || 0),
  }));

  const categoryBreakdown = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, minutes]) => ({
      category,
      minutes: Math.round(minutes),
      sharePct:
        totalScreenMinutes > 0
          ? Math.round((Number(minutes) / totalScreenMinutes) * 100)
          : 0,
    }));

  const maxHourValue = Math.max(...hourlyMap);
  const peakHour =
    maxHourValue > 0 ? hourlyMap.findIndex((m) => m === maxHourValue) : 0;

  const totalDays = range === "day" ? 1 : Math.max(1, trendPoints.length);

  const averageDailyMinutes =
    totalDays > 0 ? Math.round(totalScreenMinutes / totalDays) : 0;

  const activePoints = trendPoints.filter((item) => item.minutes > 0);
  const bestPoint =
    activePoints.length > 0
      ? [...activePoints].sort((a, b) => b.minutes - a.minutes)[0]
      : null;
  const worstPoint =
    activePoints.length > 0
      ? [...activePoints].sort((a, b) => a.minutes - b.minutes)[0]
      : null;

  const score = resolveAnalyticsScore({ sessions, aiInsights });

  return {
    totalScreenMinutes,
    averageDailyMinutes,
    pickups,
    unlocks,
    lateNightMinutes,
    peakHour,
    peakHourLabel: toHourLabel(peakHour),
    trendLabel: range === "day" ? "Hourly Usage" : "Daily Usage",
    trendPoints,
    categoryBreakdown,
    totalActiveDays: activePoints.length,
    bestDayLabel: bestPoint?.label || "",
    worstDayLabel: worstPoint?.label || "",
    streakCount: user?.streakCount || 0,
    score,
    riskLevel: deriveRiskLevel(score),
  };
};

export const buildAnalyticsComparison = (currentAnalytics, previousAnalytics) => {
  const usageChangePct = percentageChange(
    currentAnalytics.averageDailyMinutes,
    previousAnalytics.averageDailyMinutes
  );

  const pickupChangePct = percentageChange(
    currentAnalytics.pickups,
    previousAnalytics.pickups
  );

  const unlockChangePct = percentageChange(
    currentAnalytics.unlocks,
    previousAnalytics.unlocks
  );

  let direction = "steady";

  if (usageChangePct <= -8) direction = "improving";
  else if (usageChangePct >= 8) direction = "worsening";

  let summary = "Your usage is stable compared with the previous period.";

  if (direction === "improving") {
    summary = `Great progress. Average daily screen time is down ${Math.abs(
      usageChangePct
    )}% versus the previous period.`;
  } else if (direction === "worsening") {
    summary = `Screen time is up ${Math.abs(
      usageChangePct
    )}% versus the previous period. Try reducing distractions tomorrow.`;
  }

  return {
    usageChangePct,
    pickupChangePct,
    unlockChangePct,
    direction,
    summary,
  };
};

export const buildInsightsFromAnalytics = (analytics, comparison) => {
  const insights = [];

  if (comparison?.direction === "improving") {
    insights.push(comparison.summary);
  }

  if (analytics.categoryBreakdown[0]) {
    insights.push(
      `${analytics.categoryBreakdown[0].category} is your top category this period.`
    );
  }

  if (analytics.lateNightMinutes >= 30) {
    insights.push("Late-night usage is high and may be affecting sleep quality.");
  }

  if (analytics.pickups >= 40) {
    insights.push("Pickup frequency is high. Try disabling non-essential notifications.");
  }

  if (analytics.averageDailyMinutes >= 240) {
    insights.push("Average daily usage is elevated. Aim to reduce at least 20 minutes tomorrow.");
  }

  if (analytics.bestDayLabel) {
    insights.push(`Your best controlled usage period was ${analytics.bestDayLabel}.`);
  }

  if (insights.length === 0) {
    insights.push("Your digital wellness pattern looks balanced this period.");
  }

  return insights.slice(0, 5);
};