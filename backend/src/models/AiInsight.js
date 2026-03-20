import mongoose from "mongoose";

const aiInsightSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    dayKey: {
      type: String,
      required: true,
      index: true,
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      required: true,
    },
    totalScreenMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    pickups: {
      type: Number,
      required: true,
      default: 0,
    },
    unlocks: {
      type: Number,
      required: true,
      default: 0,
    },
    lateNightMinutes: {
      type: Number,
      required: true,
      default: 0,
    },
    reasons: {
      type: [String],
      default: [],
    },
    recommendations: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

aiInsightSchema.index({ user: 1, dayKey: 1 }, { unique: true });

const AiInsight = mongoose.model("AiInsight", aiInsightSchema);

export default AiInsight;