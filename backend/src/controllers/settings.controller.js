import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeUser } from "../utils/serialize.js";

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await UserSettings.findOne({ user: req.user._id });
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
  const settings = await UserSettings.findOne({ user: req.user._id });

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

  if (name !== undefined) req.user.name = name;
  if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;

  if (dailyLimitMinutes !== undefined) settings.dailyLimitMinutes = dailyLimitMinutes;
  if (focusAreas !== undefined) settings.focusAreas = focusAreas;

  if (sleepSchedule !== undefined) {
    settings.sleepSchedule = {
      ...settings.sleepSchedule,
      ...sleepSchedule,
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

  if (theme !== undefined) settings.theme = theme;

  await req.user.save();
  await settings.save();

  res.json({
    success: true,
    message: "Settings updated successfully.",
    user: serializeUser(req.user),
    settings,
  });
});

export const completeProfileSetup = asyncHandler(async (req, res) => {
  const settings = await UserSettings.findOne({ user: req.user._id });

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

  if (age !== undefined) req.user.age = Number(age);
  if (occupation !== undefined) req.user.occupation = String(occupation).trim();
  if (goal !== undefined) req.user.goal = String(goal).trim();

  if (dailyLimitMinutes !== undefined) {
    settings.dailyLimitMinutes = Number(dailyLimitMinutes);
  }

  if (focusAreas !== undefined) settings.focusAreas = focusAreas;

  if (bedTime !== undefined || wakeTime !== undefined) {
    settings.sleepSchedule = {
      bedTime: bedTime || settings.sleepSchedule.bedTime,
      wakeTime: wakeTime || settings.sleepSchedule.wakeTime,
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

  if (!appName || !appPackage || !dailyLimitMinutes) {
    throw new ApiError(
      400,
      "appName, appPackage, and dailyLimitMinutes are required."
    );
  }

  const limit = await AppLimit.findOneAndUpdate(
    { user: req.user._id, appPackage },
    {
      user: req.user._id,
      appName,
      appPackage,
      category,
      dailyLimitMinutes,
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