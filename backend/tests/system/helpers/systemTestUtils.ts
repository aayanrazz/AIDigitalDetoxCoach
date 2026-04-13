import request from "supertest";
import { expect } from "@jest/globals";
import app from "../../../src/app.js";

function buildRequest(): any {
  return request(app as any) as any;
}

export const api = {
  get(url: string): any {
    return buildRequest().get(url);
  },

  post(url: string): any {
    return buildRequest().post(url);
  },

  put(url: string): any {
    return buildRequest().put(url);
  },

  patch(url: string): any {
    return buildRequest().patch(url);
  },

  delete(url: string): any {
    return buildRequest().delete(url);
  },
};

export type SystemUserSession = {
  token: string;
  userId: string;
  email: string;
  password: string;
};

export function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function registerSystemUser(
  overrides: Partial<{
    name: string;
    email: string;
    password: string;
  }> = {}
): Promise<SystemUserSession> {
  const unique = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  const payload = {
    name: overrides.name ?? "System Test User",
    email: overrides.email ?? `system_${unique}@example.com`,
    password: overrides.password ?? "Password123!",
  };

  const response = await api.post("/api/auth/register").send(payload);

  expect(response.status).toBe(201);
  expect(response.body.success).toBe(true);
  expect(response.body.token).toBeTruthy();
  expect(response.body.user?._id).toBeTruthy();

  return {
    token: response.body.token,
    userId: response.body.user._id,
    email: payload.email,
    password: payload.password,
  };
}

export async function completeProfileSetup(
  token: string,
  overrides: Partial<{
    name: string;
    age: number;
    occupation: string;
    goal: string;
    dailyLimitMinutes: number;
    focusAreas: string[];
    bedTime: string;
    wakeTime: string;
    notificationSettings: {
      gentleNudges: boolean;
      dailySummaries: boolean;
      achievementAlerts: boolean;
      limitWarnings: boolean;
    };
  }> = {}
): Promise<any> {
  return api
    .put("/api/profile/setup")
    .set(authHeader(token))
    .send({
      name: overrides.name ?? "System Test User",
      age: overrides.age ?? 24,
      occupation: overrides.occupation ?? "Student",
      goal: overrides.goal ?? "Reduce social media overuse",
      dailyLimitMinutes: overrides.dailyLimitMinutes ?? 90,
      focusAreas: overrides.focusAreas ?? ["Social Media", "Sleep"],
      bedTime: overrides.bedTime ?? "22:30",
      wakeTime: overrides.wakeTime ?? "06:30",
      notificationSettings:
        overrides.notificationSettings ?? {
          gentleNudges: true,
          dailySummaries: true,
          achievementAlerts: true,
          limitWarnings: true,
        },
    });
}

export async function savePrivacyConsent(
  token: string,
  overrides: Partial<{
    consentGiven: boolean;
    dataCollection: boolean;
    anonymizeData: boolean;
    allowAnalyticsForTraining: boolean;
    retentionDays: number;
  }> = {}
): Promise<any> {
  return api
    .put("/api/privacy/consent")
    .set(authHeader(token))
    .send({
      consentGiven: overrides.consentGiven ?? true,
      dataCollection: overrides.dataCollection ?? true,
      anonymizeData: overrides.anonymizeData ?? true,
      allowAnalyticsForTraining:
        overrides.allowAnalyticsForTraining ?? true,
      retentionDays: overrides.retentionDays ?? 30,
    });
}

export async function saveSampleAppLimit(
  token: string,
  overrides: Partial<{
    appName: string;
    appPackage: string;
    category: string;
    dailyLimitMinutes: number;
  }> = {}
): Promise<any> {
  return api
    .post("/api/settings/app-limits")
    .set(authHeader(token))
    .send({
      appName: overrides.appName ?? "Instagram",
      appPackage: overrides.appPackage ?? "com.instagram.android",
      category: overrides.category ?? "Social Media",
      dailyLimitMinutes: overrides.dailyLimitMinutes ?? 60,
    });
}

export function buildUsageAppsPayload(): Array<{
  appName: string;
  packageName: string;
  category: string;
  minutesUsed: number;
  pickups: number;
  unlocks: number;
  lastTimeUsed: string;
}> {
  const now = Date.now();

  return [
    {
      appName: "Instagram",
      packageName: "com.instagram.android",
      category: "Social Media",
      minutesUsed: 95,
      pickups: 18,
      unlocks: 18,
      lastTimeUsed: new Date(now).toISOString(),
    },
    {
      appName: "YouTube",
      packageName: "com.google.android.youtube",
      category: "Streaming",
      minutesUsed: 45,
      pickups: 8,
      unlocks: 8,
      lastTimeUsed: new Date(now - 5 * 60 * 1000).toISOString(),
    },
    {
      appName: "Gmail",
      packageName: "com.google.android.gm",
      category: "Productivity",
      minutesUsed: 20,
      pickups: 4,
      unlocks: 4,
      lastTimeUsed: new Date(now - 10 * 60 * 1000).toISOString(),
    },
  ];
}

export async function prepareOnboardedConsentedUser(): Promise<SystemUserSession> {
  const session = await registerSystemUser();

  const profileResponse = await completeProfileSetup(session.token);
  expect(profileResponse.status).toBe(200);
  expect(profileResponse.body.success).toBe(true);

  const privacyResponse = await savePrivacyConsent(session.token);
  expect(privacyResponse.status).toBe(200);
  expect(privacyResponse.body.success).toBe(true);

  return session;
}