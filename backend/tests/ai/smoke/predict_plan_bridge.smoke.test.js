import { spawnSync } from "child_process";
import { describe, it, expect } from "@jest/globals";
import {
  pythonBin,
  planBridgeScript,
  planModelDir,
  makePlanRow,
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
        `Plan bridge failed with exit code: ${result.status}`,
        `STDOUT: ${result.stdout || "(empty)"}`,
        `STDERR: ${result.stderr || "(empty)"}`,
      ].join("\n")
    );
  }

  expect(result.stdout).toBeTruthy();

  return JSON.parse(result.stdout);
};

describe("AI Smoke - predict_plan_bridge.py", () => {
  it("TC_AI_SMOKE_002 returns a valid plan target prediction", () => {
    const output = runBridge({
      scriptPath: planBridgeScript,
      modelDir: planModelDir,
      row: makePlanRow(),
    });

    expect(Array.isArray(output.predictions)).toBe(true);
    expect(output.predictions).toHaveLength(1);

    const prediction = output.predictions[0];

    expect(
      Number.isFinite(Number(prediction.predictedTargetDailyLimitMinutes))
    ).toBe(true);
    expect(Number(prediction.predictedTargetDailyLimitMinutes)).toBeGreaterThanOrEqual(60);
    expect(Number(prediction.predictedTargetDailyLimitMinutes)).toBeLessThanOrEqual(480);
  });
});