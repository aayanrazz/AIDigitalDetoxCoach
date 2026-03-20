export const formatDayKey = (dateLike = new Date()) => {
  const d = new Date(dateLike);
  return d.toISOString().split("T")[0];
};

export const addDays = (dateLike, days) => {
  const d = new Date(dateLike);
  d.setDate(d.getDate() + days);
  return d;
};

export const getRangeStart = (range = "week") => {
  const now = new Date();
  const d = new Date(now);

  if (range === "day") {
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === "week") {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  if (range === "month") {
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  d.setHours(0, 0, 0, 0);
  return d;
};

export const isLateNightHour = (hour) => hour >= 23 || hour < 6;