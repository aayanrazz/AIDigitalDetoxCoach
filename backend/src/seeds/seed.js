import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import UserSettings from "../models/UserSettings.js";
import UsageSession from "../models/UsageSession.js";
import AiInsight from "../models/AiInsight.js";
import DetoxPlan from "../models/DetoxPlan.js";
import Notification from "../models/Notification.js";
import RewardLedger from "../models/RewardLedger.js";
import AppLimit from "../models/AppLimit.js";
import { addDays, formatDayKey } from "../utils/date.js";
import { analyzeDailyUsage } from "../services/behavior.service.js";
import { buildDetoxPlan } from "../services/detoxPlan.service.js";

const createSession = ({
  dayOffset,
  hour,
  durationMinutes,
  appName,
  appPackage,
  category,
  pickups = 3,
  unlocks = 2,
}) => {
  const date = addDays(new Date(), dayOffset);
  date.setHours(hour, 0, 0, 0);
  const end = new Date(date);
  end.setMinutes(end.getMinutes() + durationMinutes);

  return {
    startTime: date,
    endTime: end,
    durationMinutes,
    appName,
    appPackage,
    category,
    pickups,
    unlocks,
    platform: "android",
    source: "seed",
    dayKey: formatDayKey(date),
    hourBucket: date.getHours(),
  };
};

const runSeed = async () => {
  try {
    await connectDB();

    await Promise.all([
      User.deleteMany({}),
      UserSettings.deleteMany({}),
      UsageSession.deleteMany({}),
      AiInsight.deleteMany({}),
      DetoxPlan.deleteMany({}),
      Notification.deleteMany({}),
      RewardLedger.deleteMany({}),
      AppLimit.deleteMany({}),
    ]);

    const passwordHash = await bcrypt.hash("Password123!", 10);

    const user = await User.create({
      name: "Aayan Razz",
      email: "demo@detox.app",
      passwordHash,
      isOnboarded: true,
      points: 1240,
      streakCount: 5,
      longestStreak: 15,
      detoxScore: 85,
      badges: [
        { key: "sun", label: "Sun" },
        { key: "zen", label: "Zen" },
        { key: "focus", label: "Focus" },
        { key: "lock", label: "Lock" },
      ],
    });

    const settings = await UserSettings.create({
      user: user._id,
      dailyLimitMinutes: 240,
      focusAreas: ["Social Media", "Productivity"],
      sleepSchedule: {
        bedTime: "23:00",
        wakeTime: "07:00",
      },
      notificationSettings: {
        gentleNudges: true,
        dailySummaries: true,
        achievementAlerts: true,
        limitWarnings: true,
      },
      privacySettings: {
        dataCollection: true,
        anonymizeData: true,
      },
      integrations: {
        googleFitConnected: false,
        appleHealthConnected: false,
      },
      theme: "dark",
    });

    const rawSessions = [
      createSession({
        dayOffset: -6,
        hour: 9,
        durationMinutes: 35,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 8,
        unlocks: 6,
      }),
      createSession({
        dayOffset: -6,
        hour: 13,
        durationMinutes: 40,
        appName: "YouTube",
        appPackage: "com.google.android.youtube",
        category: "Entertainment",
        pickups: 6,
        unlocks: 4,
      }),
      createSession({
        dayOffset: -6,
        hour: 20,
        durationMinutes: 50,
        appName: "Notion",
        appPackage: "notion.id",
        category: "Productivity",
        pickups: 2,
        unlocks: 2,
      }),

      createSession({
        dayOffset: -5,
        hour: 10,
        durationMinutes: 45,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 10,
        unlocks: 7,
      }),
      createSession({
        dayOffset: -5,
        hour: 15,
        durationMinutes: 30,
        appName: "Chrome",
        appPackage: "com.android.chrome",
        category: "Productivity",
        pickups: 3,
        unlocks: 2,
      }),
      createSession({
        dayOffset: -5,
        hour: 23,
        durationMinutes: 35,
        appName: "TikTok",
        appPackage: "com.zhiliaoapp.musically",
        category: "Social Media",
        pickups: 7,
        unlocks: 5,
      }),

      createSession({
        dayOffset: -4,
        hour: 9,
        durationMinutes: 25,
        appName: "WhatsApp",
        appPackage: "com.whatsapp",
        category: "Communication",
        pickups: 6,
        unlocks: 5,
      }),
      createSession({
        dayOffset: -4,
        hour: 11,
        durationMinutes: 55,
        appName: "YouTube",
        appPackage: "com.google.android.youtube",
        category: "Entertainment",
        pickups: 5,
        unlocks: 3,
      }),
      createSession({
        dayOffset: -4,
        hour: 18,
        durationMinutes: 60,
        appName: "Notion",
        appPackage: "notion.id",
        category: "Productivity",
        pickups: 2,
        unlocks: 1,
      }),

      createSession({
        dayOffset: -3,
        hour: 8,
        durationMinutes: 30,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 6,
        unlocks: 4,
      }),
      createSession({
        dayOffset: -3,
        hour: 14,
        durationMinutes: 65,
        appName: "YouTube",
        appPackage: "com.google.android.youtube",
        category: "Entertainment",
        pickups: 5,
        unlocks: 4,
      }),
      createSession({
        dayOffset: -3,
        hour: 22,
        durationMinutes: 20,
        appName: "Spotify",
        appPackage: "com.spotify.music",
        category: "Entertainment",
        pickups: 2,
        unlocks: 2,
      }),

      createSession({
        dayOffset: -2,
        hour: 9,
        durationMinutes: 20,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 4,
        unlocks: 3,
      }),
      createSession({
        dayOffset: -2,
        hour: 15,
        durationMinutes: 80,
        appName: "Notion",
        appPackage: "notion.id",
        category: "Productivity",
        pickups: 2,
        unlocks: 1,
      }),
      createSession({
        dayOffset: -2,
        hour: 23,
        durationMinutes: 15,
        appName: "TikTok",
        appPackage: "com.zhiliaoapp.musically",
        category: "Social Media",
        pickups: 4,
        unlocks: 3,
      }),

      createSession({
        dayOffset: -1,
        hour: 7,
        durationMinutes: 15,
        appName: "Meditation",
        appPackage: "app.meditation",
        category: "Wellness",
        pickups: 1,
        unlocks: 1,
      }),
      createSession({
        dayOffset: -1,
        hour: 12,
        durationMinutes: 35,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 5,
        unlocks: 4,
      }),
      createSession({
        dayOffset: -1,
        hour: 16,
        durationMinutes: 90,
        appName: "Notion",
        appPackage: "notion.id",
        category: "Productivity",
        pickups: 2,
        unlocks: 1,
      }),

      createSession({
        dayOffset: 0,
        hour: 8,
        durationMinutes: 12,
        appName: "Meditation",
        appPackage: "app.meditation",
        category: "Wellness",
        pickups: 1,
        unlocks: 1,
      }),
      createSession({
        dayOffset: 0,
        hour: 10,
        durationMinutes: 55,
        appName: "Instagram",
        appPackage: "com.instagram.android",
        category: "Social Media",
        pickups: 8,
        unlocks: 6,
      }),
      createSession({
        dayOffset: 0,
        hour: 14,
        durationMinutes: 60,
        appName: "YouTube",
        appPackage: "com.google.android.youtube",
        category: "Entertainment",
        pickups: 5,
        unlocks: 4,
      }),
      createSession({
        dayOffset: 0,
        hour: 18,
        durationMinutes: 68,
        appName: "Notion",
        appPackage: "notion.id",
        category: "Productivity",
        pickups: 2,
        unlocks: 1,
      }),
      createSession({
        dayOffset: 0,
        hour: 23,
        durationMinutes: 25,
        appName: "TikTok",
        appPackage: "com.zhiliaoapp.musically",
        category: "Social Media",
        pickups: 5,
        unlocks: 4,
      }),
    ];

    const sessions = rawSessions.map((session) => ({
      ...session,
      user: user._id,
    }));

    await UsageSession.insertMany(sessions);

    const todayKey = formatDayKey();
    const todaySessions = await UsageSession.find({
      user: user._id,
      dayKey: todayKey,
    });

    const analysis = analyzeDailyUsage({
      sessions: todaySessions,
      settings,
    });

    await AiInsight.create({
      user: user._id,
      dayKey: todayKey,
      score: analysis.score,
      riskLevel: analysis.riskLevel,
      totalScreenMinutes: analysis.totalScreenMinutes,
      pickups: analysis.pickups,
      unlocks: analysis.unlocks,
      lateNightMinutes: analysis.lateNightMinutes,
      reasons: analysis.reasons,
      recommendations: analysis.recommendations,
    });

    const planData = buildDetoxPlan({
      avgDailyMinutes: 272,
      settings,
      score: analysis.score,
    });

    await DetoxPlan.create({
      user: user._id,
      ...planData,
    });

    await Notification.insertMany([
      {
        user: user._id,
        type: "limit_warning",
        title: "Instagram limit reached",
        body: "You have hit your 30 minute daily limit.",
        cta: { label: "5 MIN BREAK", action: "start_break" },
      },
      {
        user: user._id,
        type: "summary",
        title: "Weekly Report",
        body: "Screen time is down 12% vs last week.",
        cta: { label: "VIEW CHART", action: "open_analytics" },
      },
      {
        user: user._id,
        type: "achievement",
        title: "3 Days Streak!",
        body: "Great job keeping your phone down.",
        cta: { label: "VIEW BADGE", action: "open_rewards" },
      },
      {
        user: user._id,
        type: "sleep",
        title: "Time to sleep",
        body: "It is getting late. Put the phone away.",
        cta: { label: "START WIND DOWN", action: "wind_down" },
      },
    ]);

    await RewardLedger.insertMany([
      {
        user: user._id,
        type: "earn",
        points: 150,
        title: "Weekly Goal Met",
        description: "Completed weekly goal",
      },
      {
        user: user._id,
        type: "earn",
        points: 50,
        title: "Social Detox",
        description: "Reduced social media usage",
      },
    ]);

    await AppLimit.create({
      user: user._id,
      appName: "Instagram",
      appPackage: "com.instagram.android",
      category: "Social Media",
      dailyLimitMinutes: 30,
    });

    console.log("✅ Seed complete");
    console.log("Demo login:");
    console.log("Email: demo@detox.app");
    console.log("Password: Password123!");

    await mongoose.connection.close();
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
};

runSeed();