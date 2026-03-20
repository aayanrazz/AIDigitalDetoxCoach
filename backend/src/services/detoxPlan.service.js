import { addDays } from "../utils/date.js";

const buildFocusTaskTitle = (focusAreas = []) => {
  if (focusAreas.includes("Social Media")) return "No Social Media";
  if (focusAreas.includes("Gaming")) return "No Gaming";
  if (focusAreas.includes("Streaming")) return "No Streaming";
  return "Deep Focus Session";
};

export const buildDetoxPlan = ({ avgDailyMinutes = 240, settings, score = 75 }) => {
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const durationDays = 21;
  const configuredLimit = settings?.dailyLimitMinutes || 240;
  const baseTarget = Math.min(Math.max(avgDailyMinutes || configuredLimit, 120), configuredLimit);
  const finalTarget = Math.max(90, Math.round(baseTarget * 0.75));
  const focusTaskTitle = buildFocusTaskTitle(settings?.focusAreas || []);

  const days = Array.from({ length: durationDays }, (_, index) => {
    const date = addDays(startDate, index);
    const targetLimitMinutes = Math.round(
      baseTarget - ((baseTarget - finalTarget) * index) / (durationDays - 1)
    );

    return {
      dayNumber: index + 1,
      date,
      targetLimitMinutes,
      status: index === 0 ? "in_progress" : "pending",
      tasks: [
        {
          title: "Morning Meditation",
          type: "wellness",
          status: index === 0 ? "completed" : "pending",
          targetTime: "07:30 AM",
        },
        {
          title: focusTaskTitle,
          type: "restriction",
          status: index === 0 ? "in_progress" : "pending",
          targetTime: "12:00 PM",
        },
        {
          title: "Evening Reflection",
          type: "reflection",
          status: "pending",
          targetTime: "08:00 PM",
        },
      ],
    };
  });

  const aiInsight =
    score < 60
      ? "Plan optimized to reduce late-night scrolling and high pickup frequency."
      : "Plan optimized to maintain your progress while gradually lowering screen time.";

  return {
    startDate,
    endDate: addDays(startDate, durationDays - 1),
    durationDays,
    targetDailyLimitMinutes: finalTarget,
    aiInsight,
    planSummary: `Reduce screen time gradually over ${durationDays} days with reflection, focus restrictions, and better sleep timing.`,
    days,
    active: true,
  };
};