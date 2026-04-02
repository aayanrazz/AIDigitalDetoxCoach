export const BLOCKED_PACKAGE_EXACT = new Set([
  "android",
  "com.google.android.apps.nexuslauncher",
  "com.android.launcher",
  "com.android.launcher3",
  "com.android.permissioncontroller",
  "com.google.android.permissioncontroller",
  "com.google.android.overlay.modules.permissioncontroller",
  "com.samsung.android.app.launcher",
  "com.sec.android.app.launcher",
  "com.miui.home",
  "com.oneplus.launcher",
  "com.oppo.launcher",
  "com.vivo.launcher",
  "com.realme.launcher",
  "com.huawei.android.launcher",
  "com.transsion.hilauncher",
]);

export const BLOCKED_PACKAGE_PREFIXES = [
  "com.android.systemui",
  "com.android.permissioncontroller",
  "com.google.android.permissioncontroller",
  "com.google.android.overlay.modules.permissioncontroller",
];

export const BLOCKED_NAME_FRAGMENTS = [
  "launcher",
  "pixel launcher",
  "system ui",
  "permission controller",
];

export const normalizeUsageCategory = (value = "Other") => {
  const raw = String(value || "").trim();
  const lower = raw.toLowerCase();

  if (lower.includes("social")) return "Social Media";
  if (lower.includes("stream")) return "Streaming";
  if (lower.includes("product")) return "Productivity";
  if (lower.includes("game")) return "Gaming";
  if (lower.includes("educat")) return "Education";
  if (lower.includes("commun")) return "Communication";

  return raw || "Other";
};

export const isIgnoredUsageEntry = ({ appPackage = "", appName = "" } = {}) => {
  const normalizedPackage = String(appPackage || "").trim().toLowerCase();
  const normalizedName = String(appName || "").trim().toLowerCase();

  if (!normalizedPackage) {
    return true;
  }

  if (BLOCKED_PACKAGE_EXACT.has(normalizedPackage)) {
    return true;
  }

  if (
    BLOCKED_PACKAGE_PREFIXES.some((prefix) =>
      normalizedPackage.startsWith(prefix)
    )
  ) {
    return true;
  }

  if (
    BLOCKED_NAME_FRAGMENTS.some((fragment) => normalizedName.includes(fragment))
  ) {
    return true;
  }

  return false;
};

export const filterUsageSessions = (sessions = []) => {
  if (!Array.isArray(sessions)) return [];

  return sessions
    .filter(
      (session) =>
        !isIgnoredUsageEntry({
          appPackage: session?.appPackage,
          appName: session?.appName,
        })
    )
    .map((session) => ({
      ...session,
      category: normalizeUsageCategory(session?.category || "Other"),
    }));
};