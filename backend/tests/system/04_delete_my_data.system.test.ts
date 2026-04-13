import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import AppLimit from "../../src/models/AppLimit.js";
import UsageSession from "../../src/models/UsageSession.js";
import AiInsight from "../../src/models/AiInsight.js";
import DetoxPlan from "../../src/models/DetoxPlan.js";
import Notification from "../../src/models/Notification.js";
import {
  connectSystemTestDb,
  clearSystemTestDb,
  closeSystemTestDb,
} from "./helpers/systemDb";
import {
  api,
  authHeader,
  prepareOnboardedConsentedUser,
  saveSampleAppLimit,
  buildUsageAppsPayload,
} from "./helpers/systemTestUtils";

describe("System Testing - Delete My Data Flow", () => {
  beforeAll(async () => {
    await connectSystemTestDb();
  });

  beforeEach(async () => {
    await clearSystemTestDb();
  });

  afterAll(async () => {
    await closeSystemTestDb();
  });

  it("ST_SYS_004 should delete stored user data and block anonymized export afterward", async () => {
    const session = await prepareOnboardedConsentedUser();

    await saveSampleAppLimit(session.token, {
      dailyLimitMinutes: 60,
    });

    const ingestResponse = await api
      .post("/api/usage/ingest")
      .set(authHeader(session.token))
      .send({
        apps: buildUsageAppsPayload(),
      });

    expect(ingestResponse.status).toBe(200);
    expect(ingestResponse.body.success).toBe(true);

    const generatePlanResponse = await api
      .post("/api/detox-plans/generate")
      .set(authHeader(session.token))
      .send({});

    expect(generatePlanResponse.status).toBe(201);
    expect(generatePlanResponse.body.success).toBe(true);

    const usageCountBefore = await UsageSession.countDocuments({
      user: session.userId,
    });
    const appLimitCountBefore = await AppLimit.countDocuments({
      user: session.userId,
    });
    const aiInsightCountBefore = await AiInsight.countDocuments({
      user: session.userId,
    });
    const planCountBefore = await DetoxPlan.countDocuments({
      user: session.userId,
    });
    const notificationCountBefore = await Notification.countDocuments({
      user: session.userId,
    });

    expect(usageCountBefore).toBeGreaterThan(0);
    expect(appLimitCountBefore).toBeGreaterThan(0);
    expect(planCountBefore).toBeGreaterThan(0);
    expect(notificationCountBefore).toBeGreaterThan(0);
    expect(aiInsightCountBefore).toBeGreaterThanOrEqual(0);

    const deleteResponse = await api
      .delete("/api/privacy/delete-my-data")
      .set(authHeader(session.token))
      .send({});

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.success).toBe(true);
    expect(deleteResponse.body.deleted.usageSessions).toBe(true);
    expect(deleteResponse.body.deleted.appLimits).toBe(true);
    expect(deleteResponse.body.deleted.notifications).toBe(true);
    expect(deleteResponse.body.deleted.aiInsights).toBe(true);
    expect(deleteResponse.body.deleted.detoxPlans).toBe(true);

    const usageCountAfter = await UsageSession.countDocuments({
      user: session.userId,
    });
    const appLimitCountAfter = await AppLimit.countDocuments({
      user: session.userId,
    });
    const aiInsightCountAfter = await AiInsight.countDocuments({
      user: session.userId,
    });
    const planCountAfter = await DetoxPlan.countDocuments({
      user: session.userId,
    });
    const notificationCountAfter = await Notification.countDocuments({
      user: session.userId,
    });

    expect(usageCountAfter).toBe(0);
    expect(appLimitCountAfter).toBe(0);
    expect(aiInsightCountAfter).toBe(0);
    expect(planCountAfter).toBe(0);
    expect(notificationCountAfter).toBe(0);

    const settingsResponse = await api
      .get("/api/settings")
      .set(authHeader(session.token));

    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.success).toBe(true);
    expect(
      settingsResponse.body.settings.privacySettings.consentGiven
    ).toBe(false);
    expect(
      settingsResponse.body.settings.privacySettings.dataCollection
    ).toBe(false);
    expect(
      settingsResponse.body.settings.privacySettings.allowAnalyticsForTraining
    ).toBe(false);

    const blockedDatasetResponse = await api
      .get("/api/analytics/export-dataset?range=week&format=json")
      .set(authHeader(session.token));

    expect(blockedDatasetResponse.status).toBe(403);
    expect(blockedDatasetResponse.body.success).toBe(false);

    const activePlanResponse = await api
      .get("/api/detox-plans/active")
      .set(authHeader(session.token));

    expect(activePlanResponse.status).toBe(200);
    expect(activePlanResponse.body.success).toBe(true);
    expect(activePlanResponse.body.plan).toBeNull();

    const notificationsResponse = await api
      .get("/api/notifications")
      .set(authHeader(session.token));

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.success).toBe(true);
    expect(notificationsResponse.body.unreadCount).toBe(0);
    expect(notificationsResponse.body.notifications).toHaveLength(0);
  });
});