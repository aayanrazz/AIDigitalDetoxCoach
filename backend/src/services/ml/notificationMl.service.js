import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_DIR =
  process.env.ML_NOTIFICATION_MODEL_DIR ||
  path.resolve(process.cwd(), "..", "ml", "notification_model_artifacts");

const PYTHON_BIN = process.env.ML_PYTHON_BIN || "python";

const BRIDGE_SCRIPT =
  process.env.ML_NOTIFICATION_BRIDGE_SCRIPT ||
  path.resolve(__dirname, "../../scripts/predict_notification_bridge.py");

const DEFAULT_TIMEOUT_MS = Number(process.env.ML_PREDICT_TIMEOUT_MS || 60000);

const parseJsonSafe = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeNotificationType = (value = "none") => {
  const allowed = ["none", "limit_warning", "sleep", "both"];
  return allowed.includes(value) ? value : "none";
};

const mapTypeToActions = (type) => {
  const normalized = normalizeNotificationType(type);

  return {
    dominantNotificationType: normalized,
    sendLimitWarning:
      normalized === "limit_warning" || normalized === "both",
    sendSleepNudge: normalized === "sleep" || normalized === "both",
  };
};

const buildFallbackNotificationType = (featureRow = {}) => {
  const overLimitMinutes = Number(featureRow.overLimitMinutes || 0);
  const lateNightMinutes = Number(featureRow.lateNightMinutes || 0);
  const limitWarningsEnabled = Number(featureRow.limitWarningsEnabled || 0);
  const gentleNudgesEnabled = Number(featureRow.gentleNudgesEnabled || 0);

  const allowLimit = limitWarningsEnabled === 1;
  const allowSleep = gentleNudgesEnabled === 1;

  const shouldSendLimit = allowLimit && overLimitMinutes > 0;
  const shouldSendSleep = allowSleep && lateNightMinutes >= 30;

  if (shouldSendLimit && shouldSendSleep) return "both";
  if (shouldSendLimit) return "limit_warning";
  if (shouldSendSleep) return "sleep";
  return "none";
};

export const predictNotificationTypeWithTensorFlow = ({
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
      reject(new Error("Notification TensorFlow prediction timed out."));
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
            `Notification TensorFlow bridge failed with exit code ${code}. ${
              stderr || stdout
            }`.trim()
          )
        );
      }

      const parsed = parseJsonSafe(stdout, null);

      if (!parsed) {
        return reject(
          new Error(
            `Notification TensorFlow bridge returned invalid JSON. ${stdout}`.trim()
          )
        );
      }

      resolve(parsed);
    });

    child.stdin.write(JSON.stringify({ rows: [featureRow] }));
    child.stdin.end();
  });

export const buildNotificationInsight = async ({ featureRow }) => {
  try {
    const response = await predictNotificationTypeWithTensorFlow({ featureRow });

    const first = Array.isArray(response?.predictions)
      ? response.predictions[0]
      : null;

    if (!first) {
      throw new Error("Notification TensorFlow bridge returned no predictions.");
    }

    const dominantNotificationType = normalizeNotificationType(
      first.predictedNotificationType
    );

    return {
      source: "tensorflow",
      confidence: Number(first.confidence || 0),
      classProbabilities: first.classProbabilities || {},
      fallbackUsed: false,
      ...mapTypeToActions(dominantNotificationType),
    };
  } catch (error) {
    const fallbackType = buildFallbackNotificationType(featureRow);

    return {
      source: "rule_based_fallback",
      confidence: 0,
      classProbabilities: {},
      fallbackUsed: true,
      errorMessage: error.message,
      ...mapTypeToActions(fallbackType),
    };
  }
};