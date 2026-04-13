import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";

const metricsPath = path.resolve(
  process.cwd(),
  "..",
  "ml",
  "notification_model_artifacts",
  "metrics.json"
);

const readMetrics = () => {
  const raw = fs.readFileSync(metricsPath, "utf-8");
  return JSON.parse(raw);
};

describe("Notification Model Metrics Validation", () => {
  it("TC_AI_CLASS_011 should load notification metrics.json successfully", () => {
    expect(fs.existsSync(metricsPath)).toBe(true);

    const metrics = readMetrics();

    expect(metrics).toBeDefined();
    expect(typeof metrics).toBe("object");
  });

  it("TC_AI_CLASS_012 should have acceptable overall accuracy", () => {
    const metrics = readMetrics();

    expect(metrics.test_accuracy).toBeGreaterThanOrEqual(0.9);
    expect(metrics.plain_accuracy_score).toBeGreaterThanOrEqual(0.9);
  });

  it("TC_AI_CLASS_013 should have acceptable macro and weighted f1", () => {
    const metrics = readMetrics();

    expect(metrics.macro_f1).toBeGreaterThanOrEqual(0.9);
    expect(metrics.weighted_f1).toBeGreaterThanOrEqual(0.9);
  });

  it("TC_AI_CLASS_014 should contain expected notification classes", () => {
    const metrics = readMetrics();

    expect(metrics.classes).toEqual(
      expect.arrayContaining(["both", "limit_warning", "none", "sleep"])
    );
    expect(metrics.classes).toHaveLength(4);
  });

  it("TC_AI_CLASS_015 should have valid classification report fields", () => {
    const metrics = readMetrics();

    expect(metrics.classification_report).toBeDefined();
    expect(metrics.classification_report["both"]).toBeDefined();
    expect(metrics.classification_report["limit_warning"]).toBeDefined();
    expect(metrics.classification_report["none"]).toBeDefined();
    expect(metrics.classification_report["sleep"]).toBeDefined();
    expect(metrics.classification_report["macro avg"]).toBeDefined();
    expect(metrics.classification_report["weighted avg"]).toBeDefined();
  });

  it("TC_AI_CLASS_016 should have acceptable precision recall and f1 for each class", () => {
    const metrics = readMetrics();
    const report = metrics.classification_report;

    expect(report["both"].precision).toBeGreaterThanOrEqual(0.85);
    expect(report["both"].recall).toBeGreaterThanOrEqual(0.85);
    expect(report["both"]["f1-score"]).toBeGreaterThanOrEqual(0.85);

    expect(report["limit_warning"].precision).toBeGreaterThanOrEqual(0.9);
    expect(report["limit_warning"].recall).toBeGreaterThanOrEqual(0.9);
    expect(report["limit_warning"]["f1-score"]).toBeGreaterThanOrEqual(0.9);

    expect(report["none"].precision).toBeGreaterThanOrEqual(0.95);
    expect(report["none"].recall).toBeGreaterThanOrEqual(0.95);
    expect(report["none"]["f1-score"]).toBeGreaterThanOrEqual(0.95);

    expect(report["sleep"].precision).toBeGreaterThanOrEqual(0.85);
    expect(report["sleep"].recall).toBeGreaterThanOrEqual(0.9);
    expect(report["sleep"]["f1-score"]).toBeGreaterThanOrEqual(0.9);
  });

  it("TC_AI_CLASS_017 should have acceptable macro and weighted averages in report", () => {
    const metrics = readMetrics();
    const report = metrics.classification_report;

    expect(report["macro avg"].precision).toBeGreaterThanOrEqual(0.9);
    expect(report["macro avg"].recall).toBeGreaterThanOrEqual(0.9);
    expect(report["macro avg"]["f1-score"]).toBeGreaterThanOrEqual(0.9);

    expect(report["weighted avg"].precision).toBeGreaterThanOrEqual(0.95);
    expect(report["weighted avg"].recall).toBeGreaterThanOrEqual(0.95);
    expect(report["weighted avg"]["f1-score"]).toBeGreaterThanOrEqual(0.95);
  });

  it("TC_AI_CLASS_018 should have a valid confusion matrix shape", () => {
    const metrics = readMetrics();
    const matrix = metrics.confusion_matrix;

    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix).toHaveLength(4);

    for (const row of matrix) {
      expect(Array.isArray(row)).toBe(true);
      expect(row).toHaveLength(4);
    }
  });

  it("TC_AI_CLASS_019 should show correct-class predictions on the diagonal", () => {
    const metrics = readMetrics();
    const matrix = metrics.confusion_matrix;

    expect(matrix[0][0]).toBeGreaterThan(0);
    expect(matrix[1][1]).toBeGreaterThan(0);
    expect(matrix[2][2]).toBeGreaterThan(0);
    expect(matrix[3][3]).toBeGreaterThan(0);
  });

  it("TC_AI_CLASS_020 should contain valid dataset split counts and target column", () => {
    const metrics = readMetrics();

    expect(metrics.train_rows).toBeGreaterThan(0);
    expect(metrics.valid_rows).toBeGreaterThan(0);
    expect(metrics.test_rows).toBeGreaterThan(0);
    expect(metrics.target_column).toBe("dominantNotificationType");
  });
});