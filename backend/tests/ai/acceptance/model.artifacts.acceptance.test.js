import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";
import {
  riskModelDir,
  planModelDir,
  notificationModelDir,
} from "../helpers/aiFixtures.js";

const expectFilesToExist = (dirPath, requiredFiles) => {
  expect(fs.existsSync(dirPath)).toBe(true);

  for (const fileName of requiredFiles) {
    const fullPath = path.join(dirPath, fileName);
    expect(fs.existsSync(fullPath)).toBe(true);
  }
};

describe("AI Acceptance - model artifact presence", () => {
  it("TC_AI_ARTIFACT_001 risk model artifacts exist", () => {
    expectFilesToExist(riskModelDir, [
      "risk_classifier.keras",
      "preprocessor.joblib",
      "label_encoder.joblib",
      "metrics.json",
      "feature_info.json",
    ]);
  });

  it("TC_AI_ARTIFACT_002 plan model artifacts exist", () => {
    expectFilesToExist(planModelDir, [
      "plan_target_regressor.keras",
      "plan_preprocessor.joblib",
      "metrics.json",
      "feature_info.json",
    ]);
  });

  it("TC_AI_ARTIFACT_003 notification model artifacts exist", () => {
    expectFilesToExist(notificationModelDir, [
      "notification_type_classifier.keras",
      "notification_preprocessor.joblib",
      "notification_label_encoder.joblib",
      "metrics.json",
      "feature_info.json",
    ]);
  });
});