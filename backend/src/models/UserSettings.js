import mongoose from "mongoose";

const PRIVACY_RETENTION_OPTIONS = [7, 30, 90, 180, 365];

const userSettingsSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
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
      bedTime: { type: String, default: "23:00" },
      wakeTime: { type: String, default: "07:00" },
    },
    notificationSettings: {
      gentleNudges: { type: Boolean, default: true },
      dailySummaries: { type: Boolean, default: true },
      achievementAlerts: { type: Boolean, default: true },
      limitWarnings: { type: Boolean, default: true },
    },
    privacySettings: {
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
    integrations: {
      googleFitConnected: { type: Boolean, default: false },
      appleHealthConnected: { type: Boolean, default: false },
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