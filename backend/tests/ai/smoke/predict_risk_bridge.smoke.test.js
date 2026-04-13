import { spawnSync } from "child_process";
import { describe, it, expect } from "@jest/globals";
import {
  pythonBin,
  riskBridgeScript,
  riskModelDir,
  makeRiskRow,
} from "../helpers/aiFixtures.js";

const runBridge = ({ scriptPath, modelDir, row }) => {
  const commandArgs =
    pythonBin === "py"
      ? ["-3", scriptPath, "--model_dir", modelDir]
      : [scriptPath, "--model_dir", modelDir];

  const result = spawnSync(pythonBin, commandArgs, {
    input: JSON.stringify({ rows: [row] }),
    encoding: "utf-8",
    timeout: 120000,
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `Risk bridge failed with exit code: ${result.status}`,
        `STDOUT: ${result.stdout || "(empty)"}`,
        `STDERR: ${result.stderr || "(empty)"}`,
      ].join("\n")
    );
  }

  expect(result.stdout).toBeTruthy();

  return JSON.parse(result.stdout);
};

describe("AI Smoke - predict_risk_bridge.py", () => {
  it("TC_AI_SMOKE_001 returns a valid risk prediction", () => {
    const output = runBridge({
      scriptPath: riskBridgeScript,
      modelDir: riskModelDir,
      row: makeRiskRow(),
    });

    expect(Array.isArray(output.predictions)).toBe(true);
    expect(output.predictions).toHaveLength(1);

    const prediction = output.predictions[0];

    expect(["low", "medium", "high"]).toContain(prediction.predictedRiskLevel);
    expect(Number(prediction.confidence)).toBeGreaterThanOrEqual(0);
    expect(Number(prediction.confidence)).toBeLessThanOrEqual(1);
    expect(typeof prediction.classProbabilities).toBe("object");

    const probabilitySum = Object.values(prediction.classProbabilities).reduce(
      (sum, value) => sum + Number(value || 0),
      0
    );

    expect(probabilitySum).toBeGreaterThan(0.98);
    expect(probabilitySum).toBeLessThan(1.02);
  });
});