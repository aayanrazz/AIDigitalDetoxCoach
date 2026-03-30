import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_DIR =
  process.env.ML_MODEL_DIR ||
  path.resolve(process.cwd(), "ml", "risk_model_artifacts");

const PYTHON_BIN = process.env.ML_PYTHON_BIN || "python";

const BRIDGE_SCRIPT =
  process.env.ML_BRIDGE_SCRIPT ||
  path.resolve(__dirname, "../../scripts/predict_risk_bridge.py");

const DEFAULT_TIMEOUT_MS = Number(process.env.ML_PREDICT_TIMEOUT_MS || 15000);

const parseJsonSafe = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const predictRiskWithTensorFlow = ({
  featureRow,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      PYTHON_BIN,
      [BRIDGE_SCRIPT, "--model_dir", MODEL_DIR],
      {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
        env: process.env,
      }
    );

    let stdout = "";
    let stderr = "";
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      child.kill("SIGKILL");
      reject(new Error("TensorFlow prediction timed out."));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk || "");
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    child.on("error", (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);

      if (code !== 0) {
        return reject(
          new Error(
            `TensorFlow bridge failed with exit code ${code}. ${stderr || stdout}`.trim()
          )
        );
      }

      const parsed = parseJsonSafe(stdout, null);

      if (!parsed) {
        return reject(
          new Error(`TensorFlow bridge returned invalid JSON. ${stdout}`.trim())
        );
      }

      resolve(parsed);
    });

    child.stdin.write(JSON.stringify({ rows: [featureRow] }));
    child.stdin.end();
  });

export const buildMlInsight = async ({ featureRow, fallbackAnalysis }) => {
  try {
    const response = await predictRiskWithTensorFlow({ featureRow });

    const first = Array.isArray(response?.predictions)
      ? response.predictions[0]
      : null;

    if (!first) {
      throw new Error("TensorFlow bridge returned no predictions.");
    }

    return {
      source: "tensorflow",
      riskLevel: first.predictedRiskLevel || fallbackAnalysis.riskLevel || "low",
      confidence: Number(first.confidence || 0),
      classProbabilities: first.classProbabilities || {},
      score: Number(fallbackAnalysis.score || 0),
      fallbackUsed: false,
    };
  } catch (error) {
    return {
      source: "rule_based_fallback",
      riskLevel: fallbackAnalysis.riskLevel || "low",
      confidence: 0,
      classProbabilities: {},
      score: Number(fallbackAnalysis.score || 0),
      fallbackUsed: true,
      errorMessage: error.message,
    };
  }
};