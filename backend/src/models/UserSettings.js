import mongoose from "mongoose";

const PRIVACY_RETENTION_OPTIONS = [7, 30, 90, 180, 365];

const sleepScheduleSchema = new mongoose.Schema(
  {
    bedTime: { type: String, default: "23:00" },
    wakeTime: { type: String, default: "07:00" },
  },
  { _id: false }
);

const notificationSettingsSchema = new mongoose.Schema(
  {
    gentleNudges: { type: Boolean, default: true },
    dailySummaries: { type: Boolean, default: true },
    achievementAlerts: { type: Boolean, default: true },
    limitWarnings: { type: Boolean, default: true },
  },
  { _id: false }
);

const privacySettingsSchema = new mongoose.Schema(
  {
    dataCollection: { type: Boolean, default: false },
    anonymizeData: { type: Boolean, default: true },
    allowAnalyticsForTraining: { type: Boolean, default: false },
    retentionDays: {
      type: Number,
      enum: PRIVACY_RETENTION_OPTIONS,
      default: 30,
    },
    consentGiven: { type: Boolean, default: false },
    consentVersion: { type: String, default: "v1.0", trim: true },
    consentedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
    policyLastViewedAt: { type: Date, default: null },
    deletionRequestedAt: { type: Date, default: null },
    lastRetentionCleanupAt: { type: Date, default: null },
  },
  { _id: false }
);

const integrationsSchema = new mongoose.Schema(
  {
    googleFitConnected: { type: Boolean, default: false },
    appleHealthConnected: { type: Boolean, default: false },
  },
  { _id: false }
);

const userSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    dailyLimitMinutes: {
      type: Number,
      default: 240,
      min: 30,
      max: 1440,
    },

    focusAreas: {
      type: [String],
      default: ["Social Media", "Productivity"],
    },

    sleepSchedule: {
      type: sleepScheduleSchema,
      default: () => ({}),
    },

    notificationSettings: {
      type: notificationSettingsSchema,
      default: () => ({}),
    },

    privacySettings: {
      type: privacySettingsSchema,
      default: () => ({}),
    },

    integrations: {
      type: integrationsSchema,
      default: () => ({}),
    },

    theme: {
      type: String,
      enum: ["dark", "light", "system"],
      default: "dark",
    },
  },
  { timestamps: true }
);

const UserSettings = mongoose.model("UserSettings", userSettingsSchema);

export default UserSettings;