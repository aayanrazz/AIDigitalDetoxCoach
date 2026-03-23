import { addDays } from "../utils/date.js";

const DEFAULT_FOCUS_AREAS = ["Social Media", "Productivity"];
const DEFAULT_BED_TIME = "23:00";
const DEFAULT_WAKE_TIME = "07:00";

function parseTime(value = "23:00") {
  const [h = "23", m = "00"] = String(value).split(":");
  const hours = Math.max(0, Math.min(23, Number(h) || 0));
  const minutes = Math.max(0, Math.min(59, Number(m) || 0));
  return { hours, minutes };
}

function format12Hour(value = "23:00") {
  const { hours, minutes } = parseTime(value);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function minusMinutes(value = "23:00", offset = 30) {
  const { hours, minutes } = parseTime(value);
  let total = hours * 60 + minutes - offset;

  while (total < 0) total += 24 * 60;

  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function buildFocusTaskTitle(focusAreas = []) {
  const primary = focusAreas[0] || "Social Media";

  if (primary.toLowerCase().includes("social")) return "No Social Media Focus Block";
  if (primary.toLowerCase().includes("gaming")) return "No Gaming Focus Block";
  if (primary.toLowerCase().includes("stream")) return "No Streaming Focus Block";
  if (primary.toLowerCase().includes("study")) return "Study Without Distractions";
  if (primary.toLowerCase().includes("product")) return "Deep Productivity Block";

  return "Deep Focus Session";
}

function clampMinutes(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const buildDetoxPlan = ({
  avgDailyMinutes = 240,
  settings = null,
  score = 75,
}) => {
  const focusAreas = settings?.focusAreas?.length
    ? settings.focusAreas
    : DEFAULT_FOCUS_AREAS;

  const bedTime = settings?.sleepSchedule?.bedTime || DEFAULT_BED_TIME;
  const wakeTime = settings?.sleepSchedule?.wakeTime || DEFAULT_WAKE_TIME;

  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const durationDays = 21;
  const configuredLimit = clampMinutes(settings?.dailyLimitMinutes || 240, 60, 1440);
  const baseTarget = clampMinutes(
    Math.round(avgDailyMinutes || configuredLimit),
    90,
    configuredLimit
  );

  const scoreFactor = score < 45 ? 0.68 : score < 70 ? 0.75 : 0.82;
  const finalTarget = clampMinutes(Math.round(baseTarget * scoreFactor), 75, baseTarget);

  const focusTaskTitle = buildFocusTaskTitle(focusAreas);
  const windDownTime = format12Hour(minusMinutes(bedTime, 30));
  const wakeTimeLabel = format12Hour(wakeTime);

  const days = Array.from({ length: durationDays }, (_, index) => {
    const date = addDays(startDate, index);

    const targetLimitMinutes = Math.round(
      baseTarget - ((baseTarget - finalTarget) * index) / (durationDays - 1)
    );

    const isToday = index === 0;

    return {
      dayNumber: index + 1,
      date,
      targetLimitMinutes,
      status: isToday ? "in_progress" : "pending",
      tasks: [
        {
          title: `Mindful Start after ${wakeTimeLabel}`,
          type: "wellness",
          status: isToday ? "in_progress" : "pending",
          targetTime: wakeTimeLabel,
        },
        {
          title: focusTaskTitle,
          type: "restriction",
          status: "pending",
          targetTime: "12:00 PM",
        },
        {
          title: `Stay under ${targetLimitMinutes} minutes`,
          type: "limit",
          status: "pending",
          targetTime: "06:00 PM",
        },
        {
          title: `Start wind-down before ${windDownTime}`,
          type: "sleep",
          status: "pending",
          targetTime: windDownTime,
        },
        {
          title: "Evening Reflection",
          type: "reflection",
          status: "pending",
          targetTime: "08:30 PM",
        },
      ],
    };
  });

  const aiInsight =
    score < 45
      ? "High-risk behavior detected. This plan reduces screen time faster and emphasizes sleep protection and distraction control."
      : score < 70
      ? "Moderate-risk behavior detected. This plan gradually reduces usage while reinforcing focus and healthy routines."
      : "Stable behavior detected. This plan helps maintain progress while slowly improving focus and recovery time.";

  const planSummary = `A ${durationDays}-day personalized detox plan based on your recent screen time, focus areas, and daily rhythm.`;

  return {
    startDate,
    endDate: addDays(startDate, durationDays - 1),
    durationDays,
    targetDailyLimitMinutes: finalTarget,
    aiInsight,
    planSummary,
    days,
    active: true,
  };
};