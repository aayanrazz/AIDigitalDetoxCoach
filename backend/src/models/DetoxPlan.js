import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    type: { type: String, default: "habit" },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    targetTime: { type: String, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const planDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    targetLimitMinutes: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "in_progress", "completed"],
      default: "pending",
    },
    tasks: {
      type: [taskSchema],
      default: [],
    },
  },
  { _id: false }
);

const detoxPlanSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationDays: { type: Number, default: 21 },
    targetDailyLimitMinutes: { type: Number, required: true },
    aiInsight: { type: String, default: "" },
    planSummary: { type: String, default: "" },
    days: {
      type: [planDaySchema],
      default: [],
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

const DetoxPlan = mongoose.model("DetoxPlan", detoxPlanSchema);

export default DetoxPlan;