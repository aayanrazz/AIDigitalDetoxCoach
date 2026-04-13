import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import User from "../../src/models/User.js";
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

describe("System Testing - Plan, Notifications, and Rewards Flow", () => {
  beforeAll(async () => {
    await connectSystemTestDb();
  });

  beforeEach(async () => {
    await clearSystemTestDb();
  });

  afterAll(async () => {
    await closeSystemTestDb();
  });

  it("ST_SYS_003 should generate a plan complete a task read notifications and redeem a reward", async () => {
    const session = await prepareOnboardedConsentedUser();

    const appLimitResponse = await saveSampleAppLimit(session.token, {
      dailyLimitMinutes: 60,
    });

    expect(appLimitResponse.status).toBe(200);

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
    expect(generatePlanResponse.body.plan).toBeDefined();
    expect(generatePlanResponse.body.plan.days.length).toBeGreaterThan(0);
    expect(generatePlanResponse.body.planMeta).toBeDefined();
    expect(
      typeof generatePlanResponse.body.planMeta.effectiveTargetDailyLimitMinutes
    ).toBe("number");

    const activePlanResponse = await api
      .get("/api/detox-plans/active")
      .set(authHeader(session.token));

    expect(activePlanResponse.status).toBe(200);
    expect(activePlanResponse.body.success).toBe(true);
    expect(activePlanResponse.body.plan).toBeDefined();

    const plan = activePlanResponse.body.plan;
    const firstDayWithTask = plan.days.find(
      (day: any) => Array.isArray(day.tasks) && day.tasks.length > 0
    );

    expect(firstDayWithTask).toBeDefined();

    const taskToComplete = firstDayWithTask.tasks.find(
      (task: any) => task.status !== "completed"
    );

    expect(taskToComplete).toBeDefined();

    const completeTaskResponse = await api
      .patch(
        `/api/detox-plans/${plan._id}/tasks/${taskToComplete._id}/complete`
      )
      .set(authHeader(session.token))
      .send({});

    expect(completeTaskResponse.status).toBe(200);
    expect(completeTaskResponse.body.success).toBe(true);
    expect(completeTaskResponse.body.plan).toBeDefined();
    expect(completeTaskResponse.body.completion).toBeDefined();
    expect(
      completeTaskResponse.body.completion.totalPointsEarned
    ).toBeGreaterThan(0);

    const notificationsResponse = await api
      .get("/api/notifications")
      .set(authHeader(session.token));

    expect(notificationsResponse.status).toBe(200);
    expect(notificationsResponse.body.success).toBe(true);
    expect(Array.isArray(notificationsResponse.body.notifications)).toBe(true);

    const markAllReadResponse = await api
      .patch("/api/notifications/mark-all-read")
      .set(authHeader(session.token))
      .send({});

    expect(markAllReadResponse.status).toBe(200);
    expect(markAllReadResponse.body.success).toBe(true);
    expect(markAllReadResponse.body.unreadCount).toBe(0);

    await User.findByIdAndUpdate(session.userId, {
      $set: {
        points: 1000,
      },
    });

    const rewardsSummaryResponse = await api
      .get("/api/rewards")
      .set(authHeader(session.token));

    expect(rewardsSummaryResponse.status).toBe(200);
    expect(rewardsSummaryResponse.body.success).toBe(true);
    expect(Array.isArray(rewardsSummaryResponse.body.redeemables)).toBe(true);
    expect(rewardsSummaryResponse.body.redeemables.length).toBeGreaterThan(0);

    const redeemResponse = await api
      .post("/api/rewards/redeem")
      .set(authHeader(session.token))
      .send({
        code: "DARK_THEME_PRO",
      });

    expect(redeemResponse.status).toBe(200);
    expect(redeemResponse.body.success).toBe(true);
    expect(redeemResponse.body.message).toMatch(/redeemed successfully/i);
    expect(redeemResponse.body.user.points).toBeLessThan(1000);
  });
});