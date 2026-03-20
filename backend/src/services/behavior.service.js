import { isLateNightHour } from "../utils/date.js";

export const analyzeDailyUsage = ({ sessions = [], settings }) => {
  const dailyLimit = settings?.dailyLimitMinutes || 240;

  const totals = {
    totalScreenMinutes: 0,
    pickups: 0,
    unlocks: 0,
    lateNightMinutes: 0,
    socialMinutes: 0,
    productivityMinutes: 0,
  };

  for (const session of sessions) {
    const hour = new Date(session.startTime).getHours();

    totals.totalScreenMinutes += session.durationMinutes || 0;
    totals.pickups += session.pickups || 0;
    totals.unlocks += session.unlocks || 0;

    if (isLateNightHour(hour)) {
      totals.lateNightMinutes += session.durationMinutes || 0;
    }

    if ((session.category || "").toLowerCase().includes("social")) {
      totals.socialMinutes += session.durationMinutes || 0;
    }

    if ((session.category || "").toLowerCase().includes("product")) {
      totals.productivityMinutes += session.durationMinutes || 0;
    }
  }

  const overLimitMinutes = Math.max(0, totals.totalScreenMinutes - dailyLimit);

  let score = 100;
  score -= Math.min(35, Math.round(overLimitMinutes / 6));
  score -= Math.min(20, Math.round(totals.lateNightMinutes / 10));
  score -= Math.min(15, Math.round(totals.pickups / 10));

  if (totals.productivityMinutes > totals.socialMinutes) {
    score += 5;
  }

  score = Math.max(0, Math.min(100, score));

  let riskLevel = "low";
  if (score < 45 || overLimitMinutes > 60) riskLevel = "high";
  else if (score < 70 || overLimitMinutes > 0) riskLevel = "medium";

  const reasons = [];
  if (overLimitMinutes > 0) {
    reasons.push(`You are ${overLimitMinutes} minutes above your daily target.`);
  }
  if (totals.lateNightMinutes >= 30) {
    reasons.push("Late-night usage was detected and may affect sleep quality.");
  }
  if (totals.pickups >= 60) {
    reasons.push("High pickup frequency suggests compulsive checking behavior.");
  }

  const recommendations = [];
  if (totals.socialMinutes > 90) {
    recommendations.push("Reduce social media usage by at least 15 minutes tomorrow.");
  }
  if (totals.lateNightMinutes >= 30) {
    recommendations.push("Start wind-down mode 30 minutes earlier tonight.");
  }
  if (totals.pickups >= 40) {
    recommendations.push("Turn off non-essential notifications for one focus block.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Great job. Maintain your current digital wellness routine.");
  }

  const notifications = [];
  if (overLimitMinutes >= 15 && settings?.notificationSettings?.limitWarnings !== false) {
    notifications.push({
      type: "limit_warning",
      title: "Daily limit reached",
      body: `You passed your ${dailyLimit} minute target today.`,
      cta: { label: "5 MIN BREAK", action: "start_break" },
    });
  }

  if (totals.lateNightMinutes >= 30 && settings?.notificationSettings?.gentleNudges !== false) {
    notifications.push({
      type: "sleep",
      title: "Time to sleep",
      body: "It is getting late. Put the phone away.",
      cta: { label: "START WIND DOWN", action: "wind_down" },
    });
  }

  return {
    score,
    riskLevel,
    dailyLimit,
    ...totals,
    reasons,
    recommendations,
    notifications,
  };
};