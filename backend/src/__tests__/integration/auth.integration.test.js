import { describe, it, expect, beforeAll, beforeEach, afterAll } from "@jest/globals";
import mongoose from "mongoose";
import request from "supertest";

import app from "../../app.js";
import User from "../../models/User.js";
import UserSettings from "../../models/UserSettings.js";
import Notification from "../../models/Notification.js";

const REGISTER_PAYLOAD = {
  name: "Integration Tester",
  email: "integration.auth@example.com",
  password: "Password123!",
};

async function connectTestDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  }
}

async function clearTestDb() {
  if (mongoose.connection.readyState !== 0 && mongoose.connection.db) {
    await mongoose.connection.db.dropDatabase();
  }
}

describe("Authentication and session integration", () => {
  beforeAll(async () => {
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await clearTestDb();

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  it("TC_AUTH_INT_001 register creates user, settings, welcome notification, and returns token", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send(REGISTER_PAYLOAD);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("Account created successfully.");
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(20);

    expect(response.body.user).toMatchObject({
      name: "Integration Tester",
      email: "integration.auth@example.com",
      isOnboarded: false,
    });

    const dbUser = await User.findOne({
      email: "integration.auth@example.com",
    }).select("+passwordHash");

    expect(dbUser).not.toBeNull();
    expect(dbUser.name).toBe("Integration Tester");
    expect(dbUser.email).toBe("integration.auth@example.com");
    expect(dbUser.passwordHash).toBeTruthy();
    expect(dbUser.lastLoginAt).toBeNull();

    const dbSettings = await UserSettings.findOne({ user: dbUser._id });
    expect(dbSettings).not.toBeNull();
    expect(dbSettings.dailyLimitMinutes).toBe(240);
    expect(dbSettings.privacySettings.consentGiven).toBe(false);

    const welcomeNotification = await Notification.findOne({ user: dbUser._id });
    expect(welcomeNotification).not.toBeNull();
    expect(welcomeNotification.type).toBe("system");
    expect(welcomeNotification.title).toBe("Welcome to Digital Detox Coach");
    expect(welcomeNotification.body).toBe(
      "Complete your profile setup to generate your first detox plan."
    );

    expect(String(response.body.settings.user)).toBe(String(dbUser._id));
  });

  it("TC_AUTH_INT_002 login returns token, normalized user, and updates lastLoginAt", async () => {
    await request(app).post("/api/auth/register").send(REGISTER_PAYLOAD);

    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "  INTEGRATION.AUTH@EXAMPLE.COM  ",
      password: "Password123!",
    });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.success).toBe(true);
    expect(loginResponse.body.message).toBe("Login successful.");
    expect(typeof loginResponse.body.token).toBe("string");
    expect(loginResponse.body.user.email).toBe("integration.auth@example.com");
    expect(loginResponse.body.user.name).toBe("Integration Tester");

    const dbUser = await User.findOne({
      email: "integration.auth@example.com",
    });

    expect(dbUser).not.toBeNull();
    expect(dbUser.lastLoginAt).not.toBeNull();

    const dbSettings = await UserSettings.findOne({ user: dbUser._id });
    expect(dbSettings).not.toBeNull();
    expect(String(loginResponse.body.settings.user)).toBe(String(dbUser._id));
  });

  it("TC_AUTH_INT_003 session works with bearer token on /auth/me", async () => {
    const registerResponse = await request(app)
      .post("/api/auth/register")
      .send(REGISTER_PAYLOAD);

    const token = registerResponse.body.token;

    const meResponse = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.success).toBe(true);
    expect(meResponse.body.user).toMatchObject({
      name: "Integration Tester",
      email: "integration.auth@example.com",
      isOnboarded: false,
    });

    const dbUser = await User.findOne({
      email: "integration.auth@example.com",
    });

    expect(dbUser).not.toBeNull();
    expect(String(meResponse.body.user._id)).toBe(String(dbUser._id));
    expect(String(meResponse.body.settings.user)).toBe(String(dbUser._id));
  });

  it("TC_AUTH_INT_004 /auth/me rejects missing token", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Not authorized. Missing token.");
  });

  it("TC_AUTH_INT_005 login rejects wrong password", async () => {
    await request(app).post("/api/auth/register").send(REGISTER_PAYLOAD);

    const response = await request(app).post("/api/auth/login").send({
      email: "integration.auth@example.com",
      password: "WrongPassword123!",
    });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Invalid email or password.");
  });

  it("TC_AUTH_INT_006 register rejects duplicate email", async () => {
    await request(app).post("/api/auth/register").send(REGISTER_PAYLOAD);

    const response = await request(app).post("/api/auth/register").send({
      name: "Another User",
      email: "integration.auth@example.com",
      password: "Password123!",
    });

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Email already exists.");
  });
});