export const OWN_APP_PACKAGE = 'com.detoxcoachmobile';

export const BLOCKED_PACKAGE_EXACT = new Set([
  'android',
  OWN_APP_PACKAGE,
  'com.google.android.apps.nexuslauncher',
  'com.android.launcher',
  'com.android.launcher3',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.google.android.overlay.modules.permissioncontroller',
  'com.samsung.android.app.launcher',
  'com.sec.android.app.launcher',
  'com.miui.home',
  'com.oneplus.launcher',
  'com.oppo.launcher',
  'com.vivo.launcher',
  'com.realme.launcher',
  'com.huawei.android.launcher',
  'com.transsion.hilauncher',
  'com.google.android.settings.intelligence',
  'com.google.android.documentsui',
  'com.android.documentsui',
  'com.android.packageinstaller',
  'com.google.android.packageinstaller',
]);

export const BLOCKED_PACKAGE_PREFIXES = [
  'com.android.systemui',
  'com.android.permissioncontroller',
  'com.google.android.permissioncontroller',
  'com.google.android.overlay.modules.permissioncontroller',
  'com.android.providers.',
  'com.google.android.overlay.modules.',
];

export const BLOCKED_PACKAGE_FRAGMENTS = [
  'settings.intelligence',
  'documentsui',
  'packageinstaller',
  'permissioncontroller',
];

export const BLOCKED_NAME_FRAGMENTS = [
  'launcher',
  'pixel launcher',
  'system ui',
  'permission controller',
  'settings intelligence',
  'document ui',
  'documentsui',
  'package installer',
];

export const READABLE_TOKEN_MAP = {
  whatsapp: 'WhatsApp',
  youtube: 'YouTube',
  gmail: 'Gmail',
  instagram: 'Instagram',
  facebook: 'Facebook',
  messenger: 'Messenger',
  tiktok: 'TikTok',
  spotify: 'Spotify',
  netflix: 'Netflix',
  chrome: 'Chrome',
  telegram: 'Telegram',
  snapchat: 'Snapchat',
};

const IGNORED_PACKAGE_TOKENS = new Set([
  'com',
  'org',
  'net',
  'android',
  'google',
  'apps',
  'app',
  'mobile',
]);

export const normalizePackageName = (value = '') => {
  return String(value || '').trim().toLowerCase();
};

export const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const capitalizeToken = (token = '') => {
  if (!token) return '';
  return token.charAt(0).toUpperCase() + token.slice(1);
};

export const buildReadableAppNameFromPackage = (packageName = '') => {
  const normalized = normalizePackageName(packageName);

  if (!normalized) {
    return 'Unknown App';
  }

  const tokens = normalized
    .split('.')
    .flatMap((part) => part.split(/[_-]/g))
    .map((part) => part.trim())
    .filter(
      (part) => part.length > 0 && !IGNORED_PACKAGE_TOKENS.has(part)
    );

  const meaningfulTokens = tokens.length >= 2 ? tokens.slice(-2) : tokens;

  const readable = meaningfulTokens
    .map((token) => READABLE_TOKEN_MAP[token] || capitalizeToken(token))
    .join(' ')
    .trim();

  return readable || packageName || 'Unknown App';
};

export const isProbablyPackageLabel = (appName = '', packageName = '') => {
  const normalizedName = normalizePackageName(appName);
  const normalizedPackage = normalizePackageName(packageName);

  if (!normalizedName) return true;
  if (normalizedName === normalizedPackage) return true;

  return /^[a-z0-9_.]+$/.test(normalizedName) && normalizedName.includes('.');
};

export const normalizeUsageAppName = (appName = '', packageName = '') => {
  const raw = String(appName || '').trim();

  if (!raw) {
    return buildReadableAppNameFromPackage(packageName);
  }

  if (isProbablyPackageLabel(raw, packageName)) {
    return buildReadableAppNameFromPackage(packageName);
  }

  return raw;
};

export const normalizeUsageCategory = (value = 'Other') => {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('social')) return 'Social Media';
  if (lower.includes('stream')) return 'Streaming';
  if (lower.includes('product')) return 'Productivity';
  if (lower.includes('game')) return 'Gaming';
  if (lower.includes('educat')) return 'Education';
  if (lower.includes('commun')) return 'Communication';

  return raw || 'Other';
};

export const getSessionDurationMinutes = (session = {}) => {
  if (session?.durationMinutes !== undefined && session?.durationMinutes !== null) {
    return Math.max(0, toSafeNumber(session.durationMinutes, 0));
  }

  if (session?.minutesUsed !== undefined && session?.minutesUsed !== null) {
    return Math.max(0, toSafeNumber(session.minutesUsed, 0));
  }

  if (session?.foregroundMs !== undefined && session?.foregroundMs !== null) {
    return Math.max(0, Math.round(toSafeNumber(session.foregroundMs, 0) / 60000));
  }

  return 0;
};

export const isIgnoredUsageEntry = ({ appPackage = '', appName = '' } = {}) => {
  const normalizedPackage = normalizePackageName(appPackage);
  const normalizedName = String(appName || '').trim().toLowerCase();

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
    BLOCKED_PACKAGE_FRAGMENTS.some((fragment) =>
      normalizedPackage.includes(fragment)
    )
  ) {
    return true;
  }

  if (
    BLOCKED_NAME_FRAGMENTS.some((fragment) =>
      normalizedName.includes(fragment)
    )
  ) {
    return true;
  }

  return false;
};

export const normalizeUsageSession = (session = {}) => {
  const normalizedPackage = String(
    session?.appPackage || session?.packageName || ''
  ).trim();

  const normalizedName = normalizeUsageAppName(
    session?.appName,
    normalizedPackage
  );

  return {
    ...session,
    appPackage: normalizedPackage,
    appName: normalizedName,
    category: normalizeUsageCategory(session?.category || 'Other'),
    durationMinutes: getSessionDurationMinutes(session),
    pickups: Math.max(0, toSafeNumber(session?.pickups, 0)),
    unlocks: Math.max(0, toSafeNumber(session?.unlocks, 0)),
  };
};

export const filterUsageSessions = (sessions = []) => {
  if (!Array.isArray(sessions)) return [];

  const cleaned = sessions
    .map((session) => normalizeUsageSession(session))
    .filter(
      (session) =>
        !!String(session?.appPackage || '').trim() &&
        !isIgnoredUsageEntry({
          appPackage: session?.appPackage,
          appName: session?.appName,
        })
    );

  const uniqueByPackage = new Map();

  for (const session of cleaned) {
    const key = normalizePackageName(session?.appPackage);

    if (!uniqueByPackage.has(key)) {
      uniqueByPackage.set(key, session);
      continue;
    }

    const existing = uniqueByPackage.get(key);

    const currentDuration = getSessionDurationMinutes(session);
    const existingDuration = getSessionDurationMinutes(existing);

    if (currentDuration >= existingDuration) {
      uniqueByPackage.set(key, session);
    }
  }

  return Array.from(uniqueByPackage.values()).sort((a, b) => {
    return getSessionDurationMinutes(b) - getSessionDurationMinutes(a);
  });
};