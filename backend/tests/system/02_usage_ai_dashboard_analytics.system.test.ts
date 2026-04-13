import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
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

describe("System Testing - Usage, AI, Dashboard, and Analytics Flow", () => {
  beforeAll(async () => {
    await connectSystemTestDb();
  });

  beforeEach(async () => {
    await clearSystemTestDb();
  });

  afterAll(async () => {
    await closeSystemTestDb();
  });

  it("ST_SYS_002 should ingest usage and expose dashboard analytics and dataset export successfully", async () => {
    const session = await prepareOnboardedConsentedUser();

    const appLimitResponse = await saveSampleAppLimit(session.token, {
      appName: "Instagram",
      appPackage: "com.instagram.android",
      category: "Social Media",
      dailyLimitMinutes: 60,
    });

    expect(appLimitResponse.status).toBe(200);
    expect(appLimitResponse.body.success).toBe(true);

    const ingestResponse = await api
      .post("/api/usage/ingest")
      .set(authHeader(session.token))
      .send({
        apps: buildUsageAppsPayload(),
      });

    expect(ingestResponse.status).toBe(200);
    expect(ingestResponse.body.success).toBe(true);
    expect(ingestResponse.body.syncMeta).toBeDefined();
    expect(ingestResponse.body.syncMeta.sessionsNormalized).toBeGreaterThan(0);
    expect(ingestResponse.body.analysis).toBeDefined();
    expect(["low", "medium", "high"]).toContain(
      ingestResponse.body.analysis.riskLevel
    );
    expect(["tensorflow", "rule_based_fallback"]).toContain(
      ingestResponse.body.analysis.predictionSource
    );

    const dashboardResponse = await api
      .get("/api/dashboard")
      .set(authHeader(session.token));

    expect(dashboardResponse.status).toBe(200);
    expect(dashboardResponse.body.success).toBe(true);
    expect(dashboardResponse.body.dashboard).toBeDefined();
    expect(
      typeof dashboardResponse.body.dashboard.digitalWellnessScore
    ).toBe("number");
    expect(dashboardResponse.body.dashboard.todayScreenTime).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(
      dashboardResponse.body.dashboard.riskLevel
    );
    expect(
      dashboardResponse.body.dashboard.overLimitAppsCount
    ).toBeGreaterThanOrEqual(0);

    const analyticsSummaryResponse = await api
      .get("/api/analytics/summary?range=week")
      .set(authHeader(session.token));

    expect(analyticsSummaryResponse.status).toBe(200);
    expect(analyticsSummaryResponse.body.success).toBe(true);
    expect(analyticsSummaryResponse.body.range).toBe("week");
    expect(analyticsSummaryResponse.body.analytics).toBeDefined();
    expect(
      typeof analyticsSummaryResponse.body.analytics.totalScreenMinutes
    ).toBe("number");
    expect(
      typeof analyticsSummaryResponse.body.analytics.averageDailyMinutes
    ).toBe("number");
    expect(
      typeof analyticsSummaryResponse.body.analytics.score
    ).toBe("number");

    const analyticsExportResponse = await api
      .get("/api/analytics/export?range=week")
      .set(authHeader(session.token));

    expect(analyticsExportResponse.status).toBe(200);
    expect(analyticsExportResponse.body.success).toBe(true);
    expect(analyticsExportResponse.body.report).toBeDefined();
    expect(analyticsExportResponse.body.report.analytics).toBeDefined();
    expect(analyticsExportResponse.body.report.insights).toBeDefined();

    const datasetExportResponse = await api
      .get("/api/analytics/export-dataset?range=week&format=json")
      .set(authHeader(session.token));

    expect(datasetExportResponse.status).toBe(200);
    expect(datasetExportResponse.body.success).toBe(true);
    expect(datasetExportResponse.body.dataset).toBeDefined();
    expect(Array.isArray(datasetExportResponse.body.dataset.sessionRows)).toBe(
      true
    );
    expect(Array.isArray(datasetExportResponse.body.dataset.episodeLabels)).toBe(
      true
    );
    expect(
      datasetExportResponse.body.dataset.summary.includesAppNames
    ).toBe(false);
    expect(
      datasetExportResponse.body.dataset.summary.includesPersonalIdentity
    ).toBe(false);

    const notificationsResponse = await api
      .get("/api/notifications")
      .set(authHeader(session.token));

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.success).toBe(true);
    expect(Array.isArray(notificationsResponse.body.notifications)).toBe(true);
    expect(
      typeof notificationsResponse.body.unreadCount
    ).toBe("number");
  });
});