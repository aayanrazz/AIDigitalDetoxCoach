import bcrypt from "bcryptjs";
import User from "../models/User.js";
import UserSettings from "../models/UserSettings.js";
import Notification from "../models/Notification.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken } from "../utils/jwt.js";
import { serializeUser } from "../utils/serialize.js";

export const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, "Name, email, and password are required.");
  }

  if (password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters.");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    throw new ApiError(409, "Email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  const settings = await UserSettings.create({
    user: user._id,
  });

  await Notification.create({
    user: user._id,
    type: "system",
    title: "Welcome to Digital Detox Coach",
    body: "Complete your profile setup to generate your first detox plan.",
    cta: {
      label: "SET GOALS",
      action: "open_profile_setup",
    },
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    message: "Account created successfully.",
    token,
    user: serializeUser(user),
    settings,
  });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");
  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password.");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const settings = await UserSettings.findOne({ user: user._id });
  const token = generateToken(user._id);

  res.json({
    success: true,
    message: "Login successful.",
    token,
    user: serializeUser(user),
    settings,
  });
});

export const getMe = asyncHandler(async (req, res) => {
  const settings = await UserSettings.findOne({ user: req.user._id });

  res.json({
    success: true,
    user: serializeUser(req.user),
    settings,
  });
});