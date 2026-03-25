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

    totals.totalScreenMinutes += Number(session.durationMinutes || 0);
    totals.pickups += Number(session.pickups || 0);
    totals.unlocks += Number(session.unlocks || 0);

    if (isLateNightHour(hour)) {
      totals.lateNightMinutes += Number(session.durationMinutes || 0);
    }

    if ((session.category || "").toLowerCase().includes("social")) {
      totals.socialMinutes += Number(session.durationMinutes || 0);
    }

    if ((session.category || "").toLowerCase().includes("product")) {
      totals.productivityMinutes += Number(session.durationMinutes || 0);
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
  if (
    overLimitMinutes >= 15 &&
    settings?.notificationSettings?.limitWarnings !== false
  ) {
    notifications.push({
      type: "limit_warning",
      title: "Daily limit reached",
      body: `You passed your ${dailyLimit} minute target today.`,
      cta: { label: "5 MIN BREAK", action: "start_break" },
    });
  }

  if (
    totals.lateNightMinutes >= 30 &&
    settings?.notificationSettings?.gentleNudges !== false
  ) {
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

export const evaluateAppLimits = ({
  sessions = [],
  appLimits = [],
  limitWarningsEnabled = true,
}) => {
  const usageByPackage = {};

  for (const session of sessions) {
    const appPackage = String(session.appPackage || "").trim();
    if (!appPackage) continue;

    if (!usageByPackage[appPackage]) {
      usageByPackage[appPackage] = {
        appName: session.appName || appPackage,
        appPackage,
        category: session.category || "Other",
        usedMinutes: 0,
      };
    }

    usageByPackage[appPackage].usedMinutes += Number(session.durationMinutes || 0);
  }

  const monitoredApps = appLimits
    .map((limit) => {
      const usage = usageByPackage[limit.appPackage] || {};
      const usedMinutes = Number(usage.usedMinutes || 0);
      const dailyLimitMinutes = Number(limit.dailyLimitMinutes || 0);
      const exceededMinutes = Math.max(0, usedMinutes - dailyLimitMinutes);
      const remainingMinutes = Math.max(0, dailyLimitMinutes - usedMinutes);

      return {
        appName: limit.appName || usage.appName || limit.appPackage,
        appPackage: limit.appPackage,
        category: limit.category || usage.category || "Other",
        usedMinutes,
        dailyLimitMinutes,
        exceededMinutes,
        remainingMinutes,
        isExceeded: exceededMinutes > 0,
      };
    })
    .sort((a, b) => b.usedMinutes - a.usedMinutes);

  const exceededApps = monitoredApps
    .filter((item) => item.isExceeded)
    .sort(
      (a, b) =>
        b.exceededMinutes - a.exceededMinutes || b.usedMinutes - a.usedMinutes
    );

  const notifications = [];

  if (limitWarningsEnabled) {
    for (const item of exceededApps) {
      notifications.push({
        type: "limit_warning",
        title: `${item.appName} limit exceeded`,
        body: `You used ${item.usedMinutes} minutes on ${item.appName}. Your limit is ${item.dailyLimitMinutes} minutes.`,
        cta: {
          label: "REVIEW USAGE",
          action: "open_usage_tab",
        },
      });
    }
  }

  return {
    monitoredApps,
    exceededApps,
    exceededCount: exceededApps.length,
    topExceededApp: exceededApps[0] || null,
    notifications,
  };
};