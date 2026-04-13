import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export const projectRoot = process.cwd();

const canRunCommand = (command, args = ["--version"]) => {
  try {
    const result = spawnSync(command, args, {
      encoding: "utf-8",
      timeout: 10000,
      shell: false,
    });

    return !result.error && result.status === 0;
  } catch {
    return false;
  }
};

const resolvePythonBin = () => {
  const envPython = process.env.ML_PYTHON_BIN;
  if (envPython && fs.existsSync(envPython)) {
    return envPython;
  }

  const localCandidates = [
    path.resolve(projectRoot, ".venv", "Scripts", "python.exe"),
    path.resolve(projectRoot, ".venv", "bin", "python"),
    path.resolve(projectRoot, "..", ".venv", "Scripts", "python.exe"),
    path.resolve(projectRoot, "..", ".venv", "bin", "python"),
  ];

  for (const candidate of localCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (canRunCommand("python")) {
    return "python";
  }

  if (canRunCommand("py", ["-3", "--version"])) {
    return "py";
  }

  if (canRunCommand("python3")) {
    return "python3";
  }

  throw new Error(
    [
      "Python executable not found for AI smoke tests.",
      "Create a virtual environment inside backend/.venv and install requirements:",
      "  py -3 -m venv .venv",
      "  .\\.venv\\Scripts\\Activate.ps1",
      "  pip install -r ..\\ml\\requirements.txt",
      'Or set ML_PYTHON_BIN explicitly, for example:',
      '  $env:ML_PYTHON_BIN = "$PWD\\.venv\\Scripts\\python.exe"',
    ].join("\n")
  );
};

export const pythonBin = resolvePythonBin();

export const riskBridgeScript = path.resolve(
  projectRoot,
  "src",
  "scripts",
  "predict_risk_bridge.py"
);

export const planBridgeScript = path.resolve(
  projectRoot,
  "src",
  "scripts",
  "predict_plan_bridge.py"
);

export const notificationBridgeScript = path.resolve(
  projectRoot,
  "src",
  "scripts",
  "predict_notification_bridge.py"
);

export const riskModelDir = path.resolve(
  projectRoot,
  "..",
  "ml",
  "risk_model_artifacts"
);

export const planModelDir = path.resolve(
  projectRoot,
  "..",
  "ml",
  "plan_model_artifacts"
);

export const notificationModelDir = path.resolve(
  projectRoot,
  "..",
  "ml",
  "notification_model_artifacts"
);

export const makeRiskRow = (overrides = {}) => ({
  isWeekend: 0,
  dailyLimitMinutes: 180,
  bedTimeMinutes: 1380,
  wakeTimeMinutes: 420,
  gentleNudgesEnabled: 1,
  dailySummariesEnabled: 1,
  achievementAlertsEnabled: 1,
  limitWarningsEnabled: 1,
  googleFitConnected: 0,
  sessionCount: 9,
  totalScreenMinutes: 245,
  socialMinutes: 120,
  communicationMinutes: 25,
  productivityMinutes: 40,
  educationMinutes: 10,
  streamingMinutes: 20,
  gamingMinutes: 15,
  otherMinutes: 15,
  pickups: 28,
  unlocks: 24,
  lateNightMinutes: 35,
  avgSessionMinutes: 27,
  longestSessionMinutes: 60,
  peakHour: 22,
  sevenDayAvgScreenMinutes: 210,
  yesterdayScore: 58,
  overLimitMinutes: 65,
  monitoredAppCount: 6,
  overLimitAppsCount: 2,
  topExceededMinutes: 40,
  dayOfWeek: "Friday",
  focusPrimary: "Productivity",
  focusSecondary: "Sleep",
  theme: "light",
  ...overrides,
});

export const makePlanRow = (overrides = {}) => ({
  dailyLimitMinutes: 180,
  bedTimeMinutes: 1380,
  wakeTimeMinutes: 420,
  gentleNudgesEnabled: 1,
  dailySummariesEnabled: 1,
  achievementAlertsEnabled: 1,
  limitWarningsEnabled: 1,
  googleFitConnected: 0,
  sessionCount: 9,
  totalScreenMinutes: 245,
  socialMinutes: 120,
  productivityMinutes: 40,
  pickups: 28,
  unlocks: 24,
  lateNightMinutes: 35,
  avgSessionMinutes: 27,
  longestSessionMinutes: 60,
  peakHour: 22,
  sevenDayAvgScreenMinutes: 210,
  yesterdayScore: 58,
  overLimitMinutes: 65,
  score: 49,
  overLimitAppsCount: 2,
  topExceededMinutes: 40,
  focusPrimary: "Productivity",
  focusSecondary: "Sleep",
  theme: "light",
  riskLevel: "medium",
  ...overrides,
});

export const makeNotificationRow = (overrides = {}) => ({
  dailyLimitMinutes: 180,
  bedTimeMinutes: 1380,
  wakeTimeMinutes: 420,
  gentleNudgesEnabled: 1,
  dailySummariesEnabled: 1,
  achievementAlertsEnabled: 1,
  limitWarningsEnabled: 1,
  sessionCount: 9,
  totalScreenMinutes: 245,
  socialMinutes: 120,
  productivityMinutes: 40,
  pickups: 28,
  unlocks: 24,
  lateNightMinutes: 35,
  sevenDayAvgScreenMinutes: 210,
  yesterdayScore: 58,
  overLimitMinutes: 65,
  score: 49,
  overLimitAppsCount: 2,
  topExceededMinutes: 40,
  focusPrimary: "Productivity",
  focusSecondary: "Sleep",
  riskLevel: "medium",
  ...overrides,
});