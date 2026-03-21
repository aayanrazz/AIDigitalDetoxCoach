import mongoose from "mongoose";
import validator from "validator";

const badgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, "Invalid email address"],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    avatarUrl: {
      type: String,
      default: "",
    },
    age: {
      type: Number,
      min: 1,
      max: 120,
      default: null,
    },
    occupation: {
      type: String,
      trim: true,
      default: "",
    },
    goal: {
      type: String,
      trim: true,
      default: "",
    },
    points: {
      type: Number,
      default: 0,
      min: 0,
    },
    streakCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    longestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastStreakDate: {
      type: Date,
      default: null,
    },
    detoxScore: {
      type: Number,
      default: 85,
      min: 0,
      max: 100,
    },
    badges: {
      type: [badgeSchema],
      default: [],
    },
    isOnboarded: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User;