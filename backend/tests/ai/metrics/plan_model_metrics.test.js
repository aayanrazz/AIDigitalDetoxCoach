import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";

const metricsPath = path.resolve(
  process.cwd(),
  "..",
  "ml",
  "plan_model_artifacts",
  "metrics.json"
);

const readMetrics = () => {
  const raw = fs.readFileSync(metricsPath, "utf-8");
  return JSON.parse(raw);
};

describe("Plan Model Regression Metrics Validation", () => {
  it("TC_AI_REG_001 should load plan metrics.json successfully", () => {
    expect(fs.existsSync(metricsPath)).toBe(true);

    const metrics = readMetrics();

    expect(metrics).toBeDefined();
    expect(typeof metrics).toBe("object");
  });

  it("TC_AI_REG_002 should have acceptable R2 score", () => {
    const metrics = readMetrics();

    expect(metrics.test_r2).toBeGreaterThanOrEqual(0.9);
  });

  it("TC_AI_REG_003 should have acceptable RMSE", () => {
    const metrics = readMetrics();

    expect(metrics.test_rmse).toBeLessThanOrEqual(10);
  });

  it("TC_AI_REG_004 should have acceptable MAE", () => {
    const metrics = readMetrics();

    expect(metrics.test_mae).toBeLessThanOrEqual(5);
  });

  it("TC_AI_REG_005 should have acceptable MSE loss", () => {
    const metrics = readMetrics();

    expect(metrics.test_loss_mse).toBeLessThanOrEqual(20);
  });

  it("TC_AI_REG_006 should contain valid dataset split counts", () => {
    const metrics = readMetrics();

    expect(metrics.train_rows).toBeGreaterThan(0);
    expect(metrics.valid_rows).toBeGreaterThan(0);
    expect(metrics.test_rows).toBeGreaterThan(0);
  });

  it("TC_AI_REG_007 should target the correct output column", () => {
    const metrics = readMetrics();

    expect(metrics.target_column).toBe("targetDailyLimitMinutes");
  });

  it("TC_AI_REG_008 should contain feature lists", () => {
    const metrics = readMetrics();

    expect(Array.isArray(metrics.numeric_features)).toBe(true);
    expect(Array.isArray(metrics.categorical_features)).toBe(true);

    expect(metrics.numeric_features.length).toBeGreaterThan(0);
    expect(metrics.categorical_features.length).toBeGreaterThan(0);
  });

  it("TC_AI_REG_009 should contain practical prediction note", () => {
    const metrics = readMetrics();

    expect(typeof metrics.prediction_note).toBe("string");
    expect(metrics.prediction_note.length).toBeGreaterThan(0);
  });
});