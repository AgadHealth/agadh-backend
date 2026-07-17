// ─── helpers/validators.js ─────────────────────────────────────────
// Shared, pure-function validation utilities for agadh-backend.
// No external dependencies — keeps the project's hand-rolled style.
// ────────────────────────────────────────────────────────────────────

/**
 * Strict email regex (RFC 5322–inspired, practical subset).
 * - Local part: alphanumeric + . _ % + -
 * - Domain: at least one dot, 2–63 char TLD, no consecutive dots
 * - Max 254 chars (RFC 5321 SMTP limit)
 */
const EMAIL_RE =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,63}$/;

/**
 * Phone: optional leading +, then 7–15 digits (ITU-T E.164 range).
 */
const PHONE_RE = /^\+?\d{7,15}$/;

/**
 * UUID v4 (case-insensitive).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * YYYY-MM-DD date string.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Access code: 10-character uppercase hex string.
 */
const ACCESS_CODE_RE = /^[0-9A-F]{10}$/;

// ── Whitelists ────────────────────────────────────────────────────

const VALID_GENDERS = ["male", "female", "other", "prefer_not_to_say"];
const VALID_BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const VALID_RECORD_TYPES = ["prescription", "report", "imaging", "lab_test"];

// ── Vitals ranges (intentionally generous to avoid false rejections) ─

const VITALS_RANGES = {
  blood_pressure_systolic: { min: 50, max: 300 },
  blood_pressure_diastolic: { min: 30, max: 200 },
  heart_rate: { min: 20, max: 300 },
  weight_kg: { min: 0.5, max: 500 },
};

const VITALS_KEYS = Object.keys(VITALS_RANGES);

// ── Validator Functions ──────────────────────────────────────────

function isValidEmail(str) {
  return typeof str === "string" && str.length <= 254 && EMAIL_RE.test(str);
}

function isValidPhone(str) {
  if (typeof str !== "string") return false;
  // Strip spaces and dashes before testing (users may enter "123-456-7890")
  const cleaned = str.replace(/[\s-]/g, "");
  return PHONE_RE.test(cleaned);
}

function isValidDate(str) {
  if (typeof str !== "string" || !DATE_RE.test(str)) return false;
  const d = new Date(str + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  // Not in the future
  if (d > new Date()) return false;
  // Not before 1900
  if (d.getFullYear() < 1900) return false;
  // Verify month/day didn't roll over (e.g. "2024-02-30" → March 1)
  const [y, m, day] = str.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

function isValidUUID(str) {
  return typeof str === "string" && UUID_RE.test(str);
}

function isValidGender(str) {
  return typeof str === "string" && VALID_GENDERS.includes(str.toLowerCase());
}

function isValidBloodGroup(str) {
  return typeof str === "string" && VALID_BLOOD_GROUPS.includes(str.toUpperCase());
}

function isValidRecordType(str) {
  return typeof str === "string" && VALID_RECORD_TYPES.includes(str.toLowerCase());
}

function isValidAccessCode(str) {
  return typeof str === "string" && ACCESS_CODE_RE.test(str.toUpperCase());
}

/**
 * Validate vitals object.
 * Returns { valid: true } or { valid: false, message: "..." }.
 * Requires at least one vital field to be present.
 */
function validateVitals(obj) {
  if (!obj || typeof obj !== "object") {
    return { valid: false, message: "Vitals data is required." };
  }

  const provided = VITALS_KEYS.filter((k) => obj[k] !== undefined && obj[k] !== null && obj[k] !== "");

  if (provided.length === 0) {
    return { valid: false, message: "At least one vital field is required (blood_pressure_systolic, blood_pressure_diastolic, heart_rate, weight_kg)." };
  }

  for (const key of provided) {
    const val = Number(obj[key]);
    if (isNaN(val)) {
      return { valid: false, message: `${key} must be a valid number.` };
    }
    const { min, max } = VITALS_RANGES[key];
    if (val < min || val > max) {
      return { valid: false, message: `${key} must be between ${min} and ${max}.` };
    }
  }

  return { valid: true };
}

/**
 * Trim a string and enforce a max length.
 * Returns the sanitized string, or the original value if not a string.
 */
function sanitizeString(str, maxLen = 255) {
  if (typeof str !== "string") return str;
  return str.trim().slice(0, maxLen);
}

// ── Exports ─────────────────────────────────────────────────────

module.exports = {
  isValidEmail,
  isValidPhone,
  isValidDate,
  isValidUUID,
  isValidGender,
  isValidBloodGroup,
  isValidRecordType,
  isValidAccessCode,
  validateVitals,
  sanitizeString,
  VALID_GENDERS,
  VALID_BLOOD_GROUPS,
  VALID_RECORD_TYPES,
  VITALS_RANGES,
};
