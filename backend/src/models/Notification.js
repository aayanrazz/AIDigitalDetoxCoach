import mongoose from "mongoose";

const notificationCtaSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      default: "",
      trim: true,
    },
    action: {
      type: String,
      default: "",
      trim: true,
    },
    screen: {
      type: String,
      default: "",
      trim: true,
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const notificationMetadataSchema = new mongoose.Schema(
  {
    generatedBy: { type: String, default: "" },
    dominantNotificationType: { type: String, default: "" },
    predictionSource: { type: String, default: "" },
    safeguardApplied: { type: Boolean, default: false },
    totalScreenMinutes: { type: Number, default: 0 },
    dailyLimitMinutes: { type: Number, default: 0 },
    overLimitMinutes: { type: Number, default: 0 },
    bedTime: { type: String, default: "" },
    lateNightMinutes: { type: Number, default: 0 },
  },
  { _id: false, strict: false }
);

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "limit_warning",
        "summary",
        "achievement",
        "sleep",
        "system",
      ],
      default: "system",
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
    cta: {
      type: notificationCtaSchema,
      default: undefined,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    metadata: {
      type: notificationMetadataSchema,
      default: {},
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ "metadata.generatedBy": 1 });

const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);

export default Notification;