import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";
import {
  riskModelDir,
  planModelDir,
  notificationModelDir,
} from "../helpers/aiFixtures.js";

const readJson = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

describe("AI Acceptance - model metrics", () => {
  it("TC_AI_METRIC_001 risk model accuracy is acceptable", () => {
    const metrics = readJson(path.join(riskModelDir, "metrics.json"));

    expect(metrics.test_accuracy).toBeGreaterThanOrEqual(0.9);
    expect(metrics.train_rows).toBeGreaterThan(0);
    expect(metrics.valid_rows).toBeGreaterThan(0);
    expect(metrics.test_rows).toBeGreaterThan(0);
    expect(metrics.classes).toEqual(
      expect.arrayContaining(["low", "medium", "high"])
    );
  });

  it("TC_AI_METRIC_002 plan model regression quality is acceptable", () => {
    const metrics = readJson(path.join(planModelDir, "metrics.json"));

    expect(metrics.test_r2).toBeGreaterThanOrEqual(0.9);
    expect(metrics.test_rmse).toBeLessThanOrEqual(10);
    expect(metrics.train_rows).toBeGreaterThan(0);
    expect(metrics.valid_rows).toBeGreaterThan(0);
    expect(metrics.test_rows).toBeGreaterThan(0);
  });

  it("TC_AI_METRIC_003 notification model accuracy is acceptable", () => {
    const metrics = readJson(path.join(notificationModelDir, "metrics.json"));

    expect(metrics.test_accuracy).toBeGreaterThanOrEqual(0.9);
    expect(metrics.macro_f1).toBeGreaterThanOrEqual(0.9);
    expect(metrics.weighted_f1).toBeGreaterThanOrEqual(0.9);
    expect(metrics.classes).toEqual(
      expect.arrayContaining(["both", "limit_warning", "none", "sleep"])
    );
  });
});