import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
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

function normalizeFocusAreas(value) {
  if (!Array.isArray(value)) return undefined;

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
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
  });
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const {
    name,
    avatarUrl,
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

  if (dailyLimitMinutes !== undefined) {
    settings.dailyLimitMinutes = Number(dailyLimitMinutes);
  }

  const normalizedFocusAreas = normalizeFocusAreas(focusAreas);
  if (normalizedFocusAreas !== undefined) {
    settings.focusAreas = normalizedFocusAreas;
  }

  if (sleepSchedule !== undefined) {
    settings.sleepSchedule = {
      bedTime:
        sleepSchedule?.bedTime !== undefined
          ? String(sleepSchedule.bedTime)
          : settings.sleepSchedule.bedTime,
      wakeTime:
        sleepSchedule?.wakeTime !== undefined
          ? String(sleepSchedule.wakeTime)
          : settings.sleepSchedule.wakeTime,
    };
  }

  if (notificationSettings !== undefined) {
    settings.notificationSettings = {
      ...settings.notificationSettings,
      ...notificationSettings,
    };
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

  if (name !== undefined && String(name).trim()) {
    req.user.name = String(name).trim();
  }

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
    settings.dailyLimitMinutes = Number(dailyLimitMinutes);
  }

  const normalizedFocusAreas = normalizeFocusAreas(focusAreas);
  if (normalizedFocusAreas !== undefined) {
    settings.focusAreas = normalizedFocusAreas;
  }

  if (bedTime !== undefined || wakeTime !== undefined) {
    settings.sleepSchedule = {
      bedTime:
        bedTime !== undefined ? String(bedTime) : settings.sleepSchedule.bedTime,
      wakeTime:
        wakeTime !== undefined
          ? String(wakeTime)
          : settings.sleepSchedule.wakeTime,
    };
  }

  if (notificationSettings !== undefined) {
    settings.notificationSettings = {
      ...settings.notificationSettings,
      ...notificationSettings,
    };
  }

  req.user.isOnboarded = true;

  await req.user.save();
  await settings.save();

  res.json({
    success: true,
    message: "Profile setup completed.",
    user: serializeUser(req.user),
    settings,
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