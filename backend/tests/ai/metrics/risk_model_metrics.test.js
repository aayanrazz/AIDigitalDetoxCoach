import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";

const metricsPath = path.resolve(
  process.cwd(),
  "..",
  "ml",
  "risk_model_artifacts",
  "metrics.json"
);

const readMetrics = () => {
  const raw = fs.readFileSync(metricsPath, "utf-8");
  return JSON.parse(raw);
};

describe("Risk Model Metrics Validation", () => {
  it("TC_AI_CLASS_001 should load risk metrics.json successfully", () => {
    expect(fs.existsSync(metricsPath)).toBe(true);

    const metrics = readMetrics();

    expect(metrics).toBeDefined();
    expect(typeof metrics).toBe("object");
  });

  it("TC_AI_CLASS_002 should have acceptable overall accuracy", () => {
    const metrics = readMetrics();

    expect(metrics.test_accuracy).toBeGreaterThanOrEqual(0.9);
    expect(metrics.plain_accuracy_score).toBeGreaterThanOrEqual(0.9);
  });

  it("TC_AI_CLASS_003 should contain expected risk classes", () => {
    const metrics = readMetrics();

    expect(metrics.classes).toEqual(
      expect.arrayContaining(["high", "low", "medium"])
    );
    expect(metrics.classes).toHaveLength(3);
  });

  it("TC_AI_CLASS_004 should have valid classification report fields", () => {
    const metrics = readMetrics();

    expect(metrics.classification_report).toBeDefined();
    expect(metrics.classification_report["high"]).toBeDefined();
    expect(metrics.classification_report["low"]).toBeDefined();
    expect(metrics.classification_report["medium"]).toBeDefined();
    expect(metrics.classification_report["macro avg"]).toBeDefined();
    expect(metrics.classification_report["weighted avg"]).toBeDefined();
  });

  it("TC_AI_CLASS_005 should have acceptable precision recall and f1 for each class", () => {
    const metrics = readMetrics();
    const report = metrics.classification_report;

    expect(report["high"].precision).toBeGreaterThanOrEqual(0.8);
    expect(report["high"].recall).toBeGreaterThanOrEqual(0.8);
    expect(report["high"]["f1-score"]).toBeGreaterThanOrEqual(0.8);

    expect(report["low"].precision).toBeGreaterThanOrEqual(0.9);
    expect(report["low"].recall).toBeGreaterThanOrEqual(0.9);
    expect(report["low"]["f1-score"]).toBeGreaterThanOrEqual(0.9);

    expect(report["medium"].precision).toBeGreaterThanOrEqual(0.85);
    expect(report["medium"].recall).toBeGreaterThanOrEqual(0.85);
    expect(report["medium"]["f1-score"]).toBeGreaterThanOrEqual(0.85);
  });

  it("TC_AI_CLASS_006 should have acceptable macro and weighted averages", () => {
    const metrics = readMetrics();
    const report = metrics.classification_report;

    expect(report["macro avg"].precision).toBeGreaterThanOrEqual(0.9);
    expect(report["macro avg"].recall).toBeGreaterThanOrEqual(0.9);
    expect(report["macro avg"]["f1-score"]).toBeGreaterThanOrEqual(0.9);

    expect(report["weighted avg"].precision).toBeGreaterThanOrEqual(0.95);
    expect(report["weighted avg"].recall).toBeGreaterThanOrEqual(0.95);
    expect(report["weighted avg"]["f1-score"]).toBeGreaterThanOrEqual(0.95);
  });

  it("TC_AI_CLASS_007 should have a valid confusion matrix shape", () => {
    const metrics = readMetrics();
    const matrix = metrics.confusion_matrix;

    expect(Array.isArray(matrix)).toBe(true);
    expect(matrix).toHaveLength(3);

    for (const row of matrix) {
      expect(Array.isArray(row)).toBe(true);
      expect(row).toHaveLength(3);
    }
  });

  it("TC_AI_CLASS_008 should show correct-class predictions on the diagonal", () => {
    const metrics = readMetrics();
    const matrix = metrics.confusion_matrix;

    expect(matrix[0][0]).toBeGreaterThan(0);
    expect(matrix[1][1]).toBeGreaterThan(0);
    expect(matrix[2][2]).toBeGreaterThan(0);
  });

  it("TC_AI_CLASS_009 should contain valid dataset split counts", () => {
    const metrics = readMetrics();

    expect(metrics.train_rows).toBeGreaterThan(0);
    expect(metrics.valid_rows).toBeGreaterThan(0);
    expect(metrics.test_rows).toBeGreaterThan(0);
  });

  it("TC_AI_CLASS_010 should target the correct output column", () => {
    const metrics = readMetrics();

    expect(metrics.target_column).toBe("riskLevel");
  });
});