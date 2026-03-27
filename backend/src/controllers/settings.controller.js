import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeUser } from "../utils/serialize.js";

async function ensureSettings(userId) {
  let settings = await UserSettings.findOne({ user: userId });

  if (!settings) {
    settings = await UserSettings.create({ user: userId });
  }

  return settings;
}

function clampDailyLimit(value, fallback = 180) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(60, Math.min(1440, Math.round(parsed)));
}

function normalizeFocusAreas(value) {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(normalized)).slice(0, 5);
}

function normalizeTime(value, fallback = "23:00") {
  if (value === undefined || value === null || value === "") return fallback;

  const raw = String(value).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return fallback;

  const hours = Math.max(0, Math.min(23, Number(match[1])));
  const minutes = Math.max(0, Math.min(59, Number(match[2])));

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeNotificationSettings(existing = {}, incoming = {}) {
  return {
    gentleNudges:
      incoming.gentleNudges !== undefined
        ? Boolean(incoming.gentleNudges)
        : existing.gentleNudges ?? true,
    dailySummaries:
      incoming.dailySummaries !== undefined
        ? Boolean(incoming.dailySummaries)
        : existing.dailySummaries ?? true,
    achievementAlerts:
      incoming.achievementAlerts !== undefined
        ? Boolean(incoming.achievementAlerts)
        : existing.achievementAlerts ?? true,
    limitWarnings:
      incoming.limitWarnings !== undefined
        ? Boolean(incoming.limitWarnings)
        : existing.limitWarnings ?? true,
  };
}

function buildOnboardingSummary(user, settings) {
  return {
    goal: user.goal || "Reduce screen time",
    dailyLimitMinutes: settings.dailyLimitMinutes,
    primaryFocusArea: settings.focusAreas?.[0] || "Social Media",
    focusAreas: settings.focusAreas || [],
    bedTime: settings.sleepSchedule?.bedTime || "23:00",
    wakeTime: settings.sleepSchedule?.wakeTime || "07:00",
    notificationSettings: settings.notificationSettings,
  };
}

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);
  const appLimits = await AppLimit.find({ user: req.user._id }).sort({
    createdAt: -1,
  });

  res.json({
    success: true,
    user: serializeUser(req.user),
    settings,
    appLimits,
    onboardingSummary: buildOnboardingSummary(req.user, settings),
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const {
    name,
    avatarUrl,
    age,
    occupation,
    goal,
    dailyLimitMinutes,
    focusAreas,
    sleepSchedule,
    notificationSettings,
    privacySettings,
    integrations,
    theme,
  } = req.body;

  if (name !== undefined) req.user.name = String(name).trim();
  if (avatarUrl !== undefined) req.user.avatarUrl = String(avatarUrl).trim();

  if (age !== undefined && age !== null && age !== "") {
    req.user.age = Number(age);
  }

  if (occupation !== undefined) {
    req.user.occupation = String(occupation).trim();
  }

  if (goal !== undefined) {
    req.user.goal = String(goal).trim();
  }

  if (dailyLimitMinutes !== undefined) {
    settings.dailyLimitMinutes = clampDailyLimit(dailyLimitMinutes);
  }

  const normalizedFocusAreas = normalizeFocusAreas(focusAreas);
  if (normalizedFocusAreas !== undefined && normalizedFocusAreas.length > 0) {
    settings.focusAreas = normalizedFocusAreas;
  }

  if (sleepSchedule !== undefined) {
    settings.sleepSchedule = {
      bedTime: normalizeTime(
        sleepSchedule?.bedTime,
        settings.sleepSchedule?.bedTime || "23:00"
      ),
      wakeTime: normalizeTime(
        sleepSchedule?.wakeTime,
        settings.sleepSchedule?.wakeTime || "07:00"
      ),
    };
  }

  if (notificationSettings !== undefined) {
    settings.notificationSettings = normalizeNotificationSettings(
      settings.notificationSettings,
      notificationSettings
    );
  }

  if (privacySettings !== undefined) {
    settings.privacySettings = {
      ...settings.privacySettings,
      ...privacySettings,
    };
  }

  if (integrations !== undefined) {
    settings.integrations = {
      ...settings.integrations,
      ...integrations,
    };
  }

  if (theme !== undefined) {
    settings.theme = theme;
  }

  await req.user.save();
  await settings.save();

  const appLimits = await AppLimit.find({ user: req.user._id }).sort({
    createdAt: -1,
  });

  res.json({
    success: true,
    message: "Settings updated successfully.",
    user: serializeUser(req.user),
    settings,
    appLimits,
    onboardingSummary: buildOnboardingSummary(req.user, settings),
  });
});

export const completeProfileSetup = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const {
    name,
    age,
    occupation,
    goal,
    dailyLimitMinutes,
    focusAreas,
    bedTime,
    wakeTime,
    notificationSettings,
  } = req.body;

  const normalizedName = String(name || "").trim();
  const normalizedGoal = String(goal || "").trim();
  const normalizedFocusAreas = normalizeFocusAreas(focusAreas);

  if (!normalizedName) {
    throw new ApiError(400, "Display name is required.");
  }

  if (!normalizedGoal) {
    throw new ApiError(400, "Main detox goal is required.");
  }

  if (!normalizedFocusAreas || normalizedFocusAreas.length === 0) {
    throw new ApiError(400, "Select at least one focus area.");
  }

  req.user.name = normalizedName;
  req.user.goal = normalizedGoal;
  req.user.age =
    age !== undefined && age !== null && age !== "" ? Number(age) : req.user.age;
  req.user.occupation =
    occupation !== undefined ? String(occupation).trim() : req.user.occupation;

  settings.dailyLimitMinutes = clampDailyLimit(dailyLimitMinutes, 180);
  settings.focusAreas = normalizedFocusAreas;
  settings.sleepSchedule = {
    bedTime: normalizeTime(bedTime, "23:00"),
    wakeTime: normalizeTime(wakeTime, "07:00"),
  };
  settings.notificationSettings = normalizeNotificationSettings(
    settings.notificationSettings,
    notificationSettings || {}
  );

  req.user.isOnboarded = true;

  await req.user.save();
  await settings.save();

  await Notification.create({
    user: req.user._id,
    type: "system",
    title: "Profile setup completed",
    body: `Your detox coach now uses your ${settings.dailyLimitMinutes}-minute daily goal, ${settings.focusAreas[0]} focus, and ${settings.sleepSchedule.bedTime} bedtime preference.`,
    cta: {
      label: "VIEW PLAN",
      action: "open_detox_plan",
    },
  });

  res.json({
    success: true,
    message: "Profile setup completed.",
    user: serializeUser(req.user),
    settings,
    onboardingSummary: buildOnboardingSummary(req.user, settings),
  });
});

export const deleteAppLimit = asyncHandler(async (req, res) => {
  const appPackage = String(req.params.appPackage || "").trim();

  if (!appPackage) {
    throw new ApiError(400, "appPackage is required.");
  }

  await AppLimit.findOneAndDelete({
    user: req.user._id,
    appPackage,
  });

  const appLimits = await AppLimit.find({ user: req.user._id }).sort({
    createdAt: -1,
  });

  res.json({
    success: true,
    message: "App limit removed successfully.",
    appLimits,
  });
});

export const saveAppLimit = asyncHandler(async (req, res) => {
  const { appName, appPackage, category, dailyLimitMinutes } = req.body;

  if (!appName || !appPackage || dailyLimitMinutes === undefined) {
    throw new ApiError(
      400,
      "appName, appPackage, and dailyLimitMinutes are required."
    );
  }

  const normalizedLimit = Number(dailyLimitMinutes);

  if (!Number.isFinite(normalizedLimit) || normalizedLimit <= 0) {
    throw new ApiError(400, "dailyLimitMinutes must be a valid positive number.");
  }

  const limit = await AppLimit.findOneAndUpdate(
    { user: req.user._id, appPackage: String(appPackage).trim() },
    {
      user: req.user._id,
      appName: String(appName).trim(),
      appPackage: String(appPackage).trim(),
      category: category ? String(category).trim() : "Other",
      dailyLimitMinutes: normalizedLimit,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  res.json({
    success: true,
    message: "App limit saved successfully.",
    appLimit: limit,
  });
});