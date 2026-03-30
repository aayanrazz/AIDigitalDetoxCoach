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
      default: 0,
    },
    riskLevel: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },
    recommendations: {
      type: [String],
      default: [],
    },
    reasons: {
      type: [String],
      default: [],
    },
    predictionSource: {
      type: String,
      enum: ["tensorflow", "rule_based_fallback"],
      default: "rule_based_fallback",
    },
    modelVersion: {
      type: String,
      default: "risk-v1",
    },
    mlConfidence: {
      type: Number,
      default: 0,
    },
    classProbabilities: {
      type: Object,
      default: {},
    },
    featureSnapshot: {
      type: Object,
      default: {},
    },
    fallbackUsed: {
      type: Boolean,
      default: false,
    },
    lastCalculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

aiInsightSchema.index({ user: 1, dayKey: 1 }, { unique: true });

export default mongoose.model("AiInsight", aiInsightSchema);