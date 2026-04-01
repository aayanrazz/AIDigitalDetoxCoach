import UserSettings from "../models/UserSettings.js";
import AppLimit from "../models/AppLimit.js";
import Notification from "../models/Notification.js";
import UsageSession from "../models/UsageSession.js";
import AiInsight from "../models/AiInsight.js";
import DetoxPlan from "../models/DetoxPlan.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeUser } from "../utils/serialize.js";

const PRIVACY_POLICY_VERSION = "v1.0";
const RETENTION_OPTIONS = [7, 30, 90, 180, 365];
const ALLOWED_THEMES = ["dark", "light", "system"];

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

function clampRetentionDays(value, fallback = 30) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return RETENTION_OPTIONS.includes(parsed) ? parsed : fallback;
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

function normalizeTheme(value, fallback = "dark") {
  const normalized = String(value || "").trim().toLowerCase();
  return ALLOWED_THEMES.includes(normalized) ? normalized : fallback;
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

function normalizePrivacySettings(existing = {}, incoming = {}) {
  const consentGiven =
    incoming.consentGiven !== undefined
      ? Boolean(incoming.consentGiven)
      : existing.consentGiven ?? false;

  const anonymizeData =
    incoming.anonymizeData !== undefined
      ? Boolean(incoming.anonymizeData)
      : existing.anonymizeData ?? true;

  const dataCollection =
    incoming.dataCollection !== undefined
      ? Boolean(incoming.dataCollection)
      : existing.dataCollection ?? false;

  const allowAnalyticsForTraining =
    incoming.allowAnalyticsForTraining !== undefined
      ? Boolean(incoming.allowAnalyticsForTraining)
      : existing.allowAnalyticsForTraining ?? false;

  const retentionDays =
    incoming.retentionDays !== undefined
      ? clampRetentionDays(incoming.retentionDays, existing.retentionDays ?? 30)
      : existing.retentionDays ?? 30;

  return {
    dataCollection: consentGiven ? dataCollection : false,
    anonymizeData,
    allowAnalyticsForTraining: consentGiven
      ? allowAnalyticsForTraining
      : false,
    retentionDays,
    consentGiven,
    consentVersion:
      incoming.consentVersion !== undefined
        ? String(incoming.consentVersion || "").trim() || PRIVACY_POLICY_VERSION
        : existing.consentVersion || PRIVACY_POLICY_VERSION,
    consentedAt:
      incoming.consentedAt !== undefined
        ? incoming.consentedAt
        : existing.consentedAt ?? null,
    withdrawnAt:
      incoming.withdrawnAt !== undefined
        ? incoming.withdrawnAt
        : existing.withdrawnAt ?? null,
    policyLastViewedAt:
      incoming.policyLastViewedAt !== undefined
        ? incoming.policyLastViewedAt
        : existing.policyLastViewedAt ?? null,
    deletionRequestedAt:
      incoming.deletionRequestedAt !== undefined
        ? incoming.deletionRequestedAt
        : existing.deletionRequestedAt ?? null,
    lastRetentionCleanupAt:
      incoming.lastRetentionCleanupAt !== undefined
        ? incoming.lastRetentionCleanupAt
        : existing.lastRetentionCleanupAt ?? null,
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

function buildPrivacyPolicyPayload(settings) {
  return {
    version: PRIVACY_POLICY_VERSION,
    updatedAt: "2026-03-27",
    summary: [
      "This app asks for clear consent before collecting usage data for analytics.",
      "You can enable anonymized storage and limit how long data is kept.",
      "You can stop collection and request deletion of stored usage data from inside the app.",
      "Anonymized dataset exports remove direct identity fields and app names.",
    ],
    sections: [
      {
        title: "What data may be collected",
        items: [
          "App usage duration",
          "Pickups and unlock counts",
          "Notification interactions",
          "Selected detox preferences and settings",
        ],
      },
      {
        title: "Why data is used",
        items: [
          "To show analytics and reports",
          "To generate detox plans",
          "To trigger gentle interventions",
          "To prepare anonymized training datasets when you allow it",
        ],
      },
      {
        title: "Your controls",
        items: [
          "Give or withdraw consent at any time",
          "Disable data collection",
          "Enable anonymization",
          "Choose retention period",
          "Delete your stored usage data",
        ],
      },
    ],
    retentionOptions: RETENTION_OPTIONS,
    securityPractices: [
      "Usage exports can be anonymized before sharing.",
      "Delete-my-data removes stored usage sessions, app limits, notifications, AI insights, and detox plans from the backend.",
      "Production deployment should use HTTPS so data is encrypted in transit.",
      "Sensitive secrets should stay in environment variables on the server.",
    ],
    currentPrivacySettings: normalizePrivacySettings(
      settings?.privacySettings || {}
    ),
  };
}

export const getSettings = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  settings.privacySettings = normalizePrivacySettings(
    settings.privacySettings || {}
  );
  await settings.save();

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
    settings.privacySettings = normalizePrivacySettings(
      settings.privacySettings || {},
      privacySettings
    );
  } else {
    settings.privacySettings = normalizePrivacySettings(
      settings.privacySettings || {}
    );
  }

  if (integrations !== undefined) {
    settings.integrations = {
      ...settings.integrations,
      ...integrations,
    };
  }

  if (theme !== undefined) {
    settings.theme = normalizeTheme(theme, settings.theme || "dark");
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
  settings.privacySettings = normalizePrivacySettings(
    settings.privacySettings || {}
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

export const getPrivacyPolicy = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  settings.privacySettings = normalizePrivacySettings(
    settings.privacySettings || {},
    {
      policyLastViewedAt: new Date(),
    }
  );

  await settings.save();

  res.json({
    success: true,
    policy: buildPrivacyPolicyPayload(settings),
  });
});

export const savePrivacyConsent = asyncHandler(async (req, res) => {
  const settings = await ensureSettings(req.user._id);

  const {
    consentGiven,
    dataCollection,
    anonymizeData,
    allowAnalyticsForTraining,
    retentionDays,
  } = req.body;

  const previousConsent = Boolean(settings?.privacySettings?.consentGiven);
  const nextConsent = Boolean(consentGiven);

  const normalized = normalizePrivacySettings(settings.privacySettings || {}, {
    consentGiven: nextConsent,
    dataCollection,
    anonymizeData,
    allowAnalyticsForTraining,
    retentionDays,
    consentVersion: PRIVACY_POLICY_VERSION,
    consentedAt: nextConsent
      ? settings?.privacySettings?.consentedAt || new Date()
      : null,
    withdrawnAt: nextConsent
      ? null
      : previousConsent
      ? new Date()
      : settings?.privacySettings?.withdrawnAt || null,
    policyLastViewedAt: new Date(),
  });

  settings.privacySettings = normalized;
  await settings.save();

  res.json({
    success: true,
    message: normalized.consentGiven
      ? "Privacy consent saved successfully."
      : "Consent withdrawn and data collection disabled.",
    privacySettings: settings.privacySettings,
  });
});

export const deleteMyData = asyncHandler(async (req, res) => {
  await Promise.all([
    UsageSession.deleteMany({ user: req.user._id }),
    AppLimit.deleteMany({ user: req.user._id }),
    Notification.deleteMany({ user: req.user._id }),
    AiInsight.deleteMany({ user: req.user._id }),
    DetoxPlan.deleteMany({ user: req.user._id }),
  ]);

  const settings = await ensureSettings(req.user._id);

  settings.privacySettings = normalizePrivacySettings(
    settings.privacySettings || {},
    {
      consentGiven: false,
      dataCollection: false,
      anonymizeData: true,
      allowAnalyticsForTraining: false,
      consentedAt: null,
      withdrawnAt: new Date(),
      deletionRequestedAt: new Date(),
    }
  );

  await settings.save();

  res.json({
    success: true,
    message:
      "Stored usage data, app limits, notifications, AI insights, and detox plans were deleted successfully.",
    deleted: {
      usageSessions: true,
      appLimits: true,
      notifications: true,
      aiInsights: true,
      detoxPlans: true,
    },
    privacySettings: settings.privacySettings,
  });
});