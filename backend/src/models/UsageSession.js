import mongoose from "mongoose";

const usageSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    appName: {
      type: String,
      required: true,
      trim: true,
    },
    appPackage: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      default: "Other",
      trim: true,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    pickups: {
      type: Number,
      default: 0,
      min: 0,
    },
    unlocks: {
      type: Number,
      default: 0,
      min: 0,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    platform: {
      type: String,
      enum: ["android", "ios", "web"],
      default: "android",
    },
    source: {
      type: String,
      enum: ["native_bridge", "manual", "seed"],
      default: "native_bridge",
    },
    dayKey: {
      type: String,
      required: true,
      index: true,
    },
    hourBucket: {
      type: Number,
      min: 0,
      max: 23,
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate sync inflation for one app on one day from the same source.
usageSessionSchema.index(
  { user: 1, dayKey: 1, appPackage: 1, source: 1 },
  { unique: true }
);

const UsageSession = mongoose.model("UsageSession", usageSessionSchema);

export default UsageSession;