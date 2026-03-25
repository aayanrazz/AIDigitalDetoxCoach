import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";

const ACTION_DEFAULTS = {
  open_rewards: { label: "VIEW REWARDS", action: "open_rewards" },
  open_detox_plan: { label: "VIEW PLAN", action: "open_detox_plan" },
  open_usage_tab: { label: "REVIEW USAGE", action: "open_usage_tab" },
  open_analytics_tab: { label: "VIEW ANALYTICS", action: "open_analytics_tab" },
  open_profile_setup: { label: "SET GOALS", action: "open_profile_setup" },
  open_settings: { label: "OPEN SETTINGS", action: "open_settings" },
  wind_down: { label: "OPEN SETTINGS", action: "open_settings" },
  open_notifications: { label: "VIEW NOTIFICATIONS", action: "open_notifications" },
  open_home: { label: "GO HOME", action: "open_home" },
  start_break: { label: "START BREAK", action: "start_break" },
  show_message: { label: "OPEN", action: "show_message" },
};

function normalizeCta(cta) {
  if (!cta) return null;

  const rawAction = String(cta.action || "").trim();
  const mappedAction = rawAction === "wind_down" ? "open_settings" : rawAction;
  const defaults =
    ACTION_DEFAULTS[mappedAction] || ACTION_DEFAULTS.show_message;

  return {
    label: String(cta.label || defaults.label).trim(),
    action: defaults.action,
  };
}

function serializeNotification(notification) {
  const item =
    typeof notification?.toObject === "function"
      ? notification.toObject()
      : notification;

  return {
    ...item,
    cta: normalizeCta(item?.cta),
  };
}

export const getNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  res.json({
    success: true,
    unreadCount,
    notifications: items.map((item) => serializeNotification(item)),
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!notification) {
    throw new ApiError(404, "Notification not found.");
  }

  notification.isRead = true;
  await notification.save();

  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });

  res.json({
    success: true,
    message: "Notification marked as read.",
    unreadCount,
    notification: serializeNotification(notification),
  });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );

  res.json({
    success: true,
    message: "All notifications marked as read.",
    unreadCount: 0,
  });
});