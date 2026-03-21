import { formatDayKey, isLateNightHour } from "../utils/date.js";

export const buildAnalytics = (sessions = [], user = null) => {
  const dayMap = {};
  const categoryMap = {};
  const hourlyMap = Array.from({ length: 24 }, () => 0);

  let totalScreenMinutes = 0;
  let pickups = 0;
  let unlocks = 0;
  let lateNightMinutes = 0;

  for (const session of sessions) {
    const minutes = session.durationMinutes || 0;
    const dayKey = session.dayKey || formatDayKey(session.startTime);
    const category = session.category || "Other";
    const hour = new Date(session.startTime).getHours();

    totalScreenMinutes += minutes;
    pickups += session.pickups || 0;
    unlocks += session.unlocks || 0;

    dayMap[dayKey] = (dayMap[dayKey] || 0) + minutes;
    categoryMap[category] = (categoryMap[category] || 0) + minutes;
    hourlyMap[hour] += minutes;

    if (isLateNightHour(hour)) {
      lateNightMinutes += minutes;
    }
  }

  const trend = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, minutes]) => ({ day, minutes }));

  const categoryBreakdown = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([category, minutes]) => ({ category, minutes }));

  const maxHourValue = Math.max(...hourlyMap);
  const peakHour = hourlyMap.findIndex((m) => m === maxHourValue);

  const averageDailyMinutes = trend.length
    ? Math.round(totalScreenMinutes / trend.length)
    : 0;

  return {
    totalScreenMinutes,
    averageDailyMinutes,
    pickups,
    unlocks,
    lateNightMinutes,
    peakHour,
    trend,
    categoryBreakdown,
    streakCount: user?.streakCount || 0,
    score: user?.detoxScore || 0,
  };
};

export const buildInsightsFromAnalytics = (analytics) => {
  const insights = [];

  if (analytics.categoryBreakdown[0]) {
    insights.push(
      `${analytics.categoryBreakdown[0].category} is your top category this period.`
    );
  }

  if (analytics.lateNightMinutes >= 30) {
    insights.push("Late-night usage was detected and may be affecting sleep.");
  }

  if (analytics.pickups >= 40) {
    insights.push("Pickup frequency is high; try a focused notification schedule.");
  }

  if (insights.length === 0) {
    insights.push("Your digital wellness pattern looks balanced this period.");
  }

  return insights;
};