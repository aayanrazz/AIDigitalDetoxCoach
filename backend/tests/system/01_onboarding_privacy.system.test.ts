import { beforeAll, beforeEach, afterAll, describe, expect, it } from "@jest/globals";
import {
  connectSystemTestDb,
  clearSystemTestDb,
  closeSystemTestDb,
} from "./helpers/systemDb";
import {
  api,
  authHeader,
  registerSystemUser,
  completeProfileSetup,
  savePrivacyConsent,
  saveSampleAppLimit,
} from "./helpers/systemTestUtils";

describe("System Testing - Onboarding and Privacy Flow", () => {
  beforeAll(async () => {
    await connectSystemTestDb();
  });

  beforeEach(async () => {
    await clearSystemTestDb();
  });

  afterAll(async () => {
    await closeSystemTestDb();
  });

  it("ST_SYS_001 should register, onboard, update settings, save app limit, and persist privacy consent", async () => {
    const session = await registerSystemUser();

    const meResponse = await api
      .get("/api/auth/me")
      .set(authHeader(session.token));

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body.user.email).toBe(session.email);

    const profileResponse = await completeProfileSetup(session.token, {
      dailyLimitMinutes: 120,
      focusAreas: ["Social Media", "Productivity"],
    });

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.user.isOnboarded).toBe(true);
    expect(profileResponse.body.settings.dailyLimitMinutes).toBe(120);

    const updateSettingsResponse = await api
      .put("/api/settings")
      .set(authHeader(session.token))
      .send({
        theme: "light",
        dailyLimitMinutes: 90,
        sleepSchedule: {
          bedTime: "22:00",
          wakeTime: "06:00",
        },
        focusAreas: ["Social Media", "Sleep"],
        notificationSettings: {
          gentleNudges: true,
          dailySummaries: true,
          achievementAlerts: true,
          limitWarnings: true,
        },
      });

    expect(updateSettingsResponse.status).toBe(200);
    expect(updateSettingsResponse.body.success).toBe(true);
    expect(updateSettingsResponse.body.settings.theme).toBe("light");
    expect(updateSettingsResponse.body.settings.dailyLimitMinutes).toBe(90);

    const appLimitResponse = await saveSampleAppLimit(session.token, {
      dailyLimitMinutes: 60,
    });

    expect(appLimitResponse.status).toBe(200);
    expect(appLimitResponse.body.success).toBe(true);
    expect(appLimitResponse.body.appLimit.appPackage).toBe(
      "com.instagram.android"
    );

    const privacyPolicyResponse = await api
      .get("/api/privacy/policy")
      .set(authHeader(session.token));

    expect(privacyPolicyResponse.status).toBe(200);
    expect(privacyPolicyResponse.body.success).toBe(true);
    expect(privacyPolicyResponse.body.policy).toBeDefined();

    const privacyConsentResponse = await savePrivacyConsent(session.token, {
      consentGiven: true,
      dataCollection: true,
      anonymizeData: true,
      allowAnalyticsForTraining: true,
      retentionDays: 30,
    });

    expect(privacyConsentResponse.status).toBe(200);
    expect(privacyConsentResponse.body.success).toBe(true);
    expect(
      privacyConsentResponse.body.privacySettings.consentGiven
    ).toBe(true);
    expect(
      privacyConsentResponse.body.privacySettings.dataCollection
    ).toBe(true);
    expect(
      privacyConsentResponse.body.privacySettings.allowAnalyticsForTraining
    ).toBe(true);

    const settingsResponse = await api
      .get("/api/settings")
      .set(authHeader(session.token));

    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.body.success).toBe(true);
    expect(settingsResponse.body.settings.dailyLimitMinutes).toBe(90);
    expect(settingsResponse.body.appLimits).toHaveLength(1);
    expect(settingsResponse.body.user.isOnboarded).toBe(true);
  });
});