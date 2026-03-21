import express from "express";
import { register, login, getMe } from "../controllers/auth.controller.js";
import {
  getSettings,
  updateSettings,
  completeProfileSetup,
  saveAppLimit,
} from "../controllers/settings.controller.js";
import { ingestUsage, getTodayUsage } from "../controllers/usage.controller.js";
import {
  getAnalyticsSummary,
  exportAnalyticsReport,
} from "../controllers/analytics.controller.js";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notification.controller.js";
import {
  getRewardsSummary,
  redeemReward,
} from "../controllers/rewards.controller.js";
import {
  generateDetoxPlan,
  getActivePlan,
  completePlanTask,
} from "../controllers/detoxPlan.controller.js";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Health
router.get("/health", (_req, res) => {
  res.json({ success: true, message: "API is healthy" });
});

// Auth
router.post("/auth/register", register);
router.post("/auth/login", login);
router.get("/auth/me", protect, getMe);

// Profile / Settings
router.get("/settings", protect, getSettings);
router.put("/settings", protect, updateSettings);
router.put("/profile/setup", protect, completeProfileSetup);
router.post("/settings/app-limits", protect, saveAppLimit);

// Dashboard
router.get("/dashboard", protect, getDashboard);

// Usage
router.post("/usage/ingest", protect, ingestUsage);
router.get("/usage/today", protect, getTodayUsage);

// Analytics
router.get("/analytics/summary", protect, getAnalyticsSummary);
router.get("/analytics/export", protect, exportAnalyticsReport);

// Detox plan
router.post("/detox-plans/generate", protect, generateDetoxPlan);
router.get("/detox-plans/active", protect, getActivePlan);
router.patch(
  "/detox-plans/:planId/tasks/:taskId/complete",
  protect,
  completePlanTask
);

// Notifications
router.get("/notifications", protect, getNotifications);
router.patch("/notifications/mark-all-read", protect, markAllNotificationsRead);
router.patch("/notifications/:id/read", protect, markNotificationRead);

// Rewards
router.get("/rewards", protect, getRewardsSummary);
router.post("/rewards/redeem", protect, redeemReward);

export default router;