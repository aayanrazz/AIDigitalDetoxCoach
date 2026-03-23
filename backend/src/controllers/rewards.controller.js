import RewardLedger from "../models/RewardLedger.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { serializeUser } from "../utils/serialize.js";
import { getLevelProgressFromPoints } from "../services/gamification.service.js";

const REDEEMABLES = {
  DARK_THEME_PRO: {
    code: "DARK_THEME_PRO",
    title: "Dark Theme Pro",
    points: 500,
  },
  FOCUS_DAY_PASS: {
    code: "FOCUS_DAY_PASS",
    title: "Focus Day Pass",
    points: 700,
  },
  PLANT_A_TREE: {
    code: "PLANT_A_TREE",
    title: "Plant a Tree",
    points: 1000,
  },
};

export const getRewardsSummary = asyncHandler(async (req, res) => {
  const recentRewards = await RewardLedger.find({
    user: req.user._id,
  })
    .sort({ createdAt: -1 })
    .limit(12);

  const leaderboard = await User.find({})
    .sort({ points: -1 })
    .limit(10)
    .select("name points streakCount");

  const levelProgress = getLevelProgressFromPoints(req.user.points);

  res.json({
    success: true,
    user: serializeUser(req.user),
    level: levelProgress.level,
    nextLevel: levelProgress.nextLevel,
    levelProgress: {
      progressPct: levelProgress.progressPct,
      pointsToNextLevel: levelProgress.pointsToNextLevel,
    },
    recentRewards,
    leaderboard,
    redeemables: Object.values(REDEEMABLES),
  });
});

export const redeemReward = asyncHandler(async (req, res) => {
  const { code } = req.body;
  const item = REDEEMABLES[code];

  if (!item) {
    throw new ApiError(400, "Invalid reward code.");
  }

  if ((req.user.points || 0) < item.points) {
    throw new ApiError(400, "Not enough points.");
  }

  req.user.points -= item.points;
  await req.user.save();

  await RewardLedger.create({
    user: req.user._id,
    type: "redeem",
    points: -item.points,
    title: item.title,
    description: `Redeemed ${item.title}`,
  });

  await Notification.create({
    user: req.user._id,
    type: "achievement",
    title: "Reward redeemed",
    body: `You redeemed ${item.title}. Keep going to unlock more.`,
    cta: {
      label: "VIEW REWARDS",
      action: "open_rewards",
    },
  });

  const levelProgress = getLevelProgressFromPoints(req.user.points);

  res.json({
    success: true,
    message: `${item.title} redeemed successfully.`,
    user: serializeUser(req.user),
    level: levelProgress.level,
    nextLevel: levelProgress.nextLevel,
    levelProgress: {
      progressPct: levelProgress.progressPct,
      pointsToNextLevel: levelProgress.pointsToNextLevel,
    },
  });
});