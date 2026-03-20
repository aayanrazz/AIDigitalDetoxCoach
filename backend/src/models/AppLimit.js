import mongoose from "mongoose";

const appLimitSchema = new mongoose.Schema(
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
    },
    dailyLimitMinutes: {
      type: Number,
      required: true,
      min: 1,
      max: 1440,
    },
  },
  { timestamps: true }
);

appLimitSchema.index({ user: 1, appPackage: 1 }, { unique: true });

const AppLimit = mongoose.model("AppLimit", appLimitSchema);
export default AppLimit;