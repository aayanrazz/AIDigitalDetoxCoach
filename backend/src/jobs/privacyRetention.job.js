import UserSettings from "../models/UserSettings.js";
import UsageSession from "../models/UsageSession.js";
import Notification from "../models/Notification.js";
import AiInsight from "../models/AiInsight.js";
import DetoxPlan from "../models/DetoxPlan.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

let started = false;
let isRunning = false;

async function runPrivacyRetentionCleanup() {
  if (isRunning) {
    console.log("[privacy-retention] cleanup skipped because previous run is still active");
    return;
  }

  isRunning = true;

  try {
    const settingsRows = await UserSettings.find({
      "privacySettings.retentionDays": { $exists: true },
    })
      .select("_id user privacySettings")
      .lean();

    const now = Date.now();
    let usersChecked = 0;
    let totalDeleted = 0;

    for (const row of settingsRows) {
      const userId = row?.user;
      const retentionDays = Number(row?.privacySettings?.retentionDays || 30);

      if (!userId || !Number.isFinite(retentionDays) || retentionDays <= 0) {
        continue;
      }

      usersChecked += 1;

      const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);

      const [usageResult, notificationResult, insightResult, planResult] =
        await Promise.all([
          UsageSession.deleteMany({
            user: userId,
            startTime: { $lt: cutoff },
          }),
          Notification.deleteMany({
            user: userId,
            createdAt: { $lt: cutoff },
          }),
          AiInsight.deleteMany({
            user: userId,
            createdAt: { $lt: cutoff },
          }),
          DetoxPlan.deleteMany({
            user: userId,
            createdAt: { $lt: cutoff },
          }),
        ]);

      totalDeleted +=
        Number(usageResult?.deletedCount || 0) +
        Number(notificationResult?.deletedCount || 0) +
        Number(insightResult?.deletedCount || 0) +
        Number(planResult?.deletedCount || 0);

      await UserSettings.updateOne(
        { _id: row._id },
        {
          $set: {
            "privacySettings.lastRetentionCleanupAt": new Date(),
          },
        }
      );
    }

    console.log(
      `[privacy-retention] checked=${usersChecked} totalDeleted=${totalDeleted}`
    );
  } catch (error) {
    console.error("[privacy-retention] cleanup failed:", error.message);
  } finally {
    isRunning = false;
  }
}

export function startPrivacyRetentionJob() {
  if (started) return;

  started = true;

  runPrivacyRetentionCleanup();

  const timer = setInterval(() => {
    runPrivacyRetentionCleanup();
  }, SIX_HOURS_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }
}