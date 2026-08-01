const getSupabaseClient = require("../config/supabaseClient");
const { sendPushNotification } = require("./notificationService");

/**
 * CHECK A: Record completeness reminder
 * Evaluates patient users who have existing records (patient_files or vitals)
 * but have had no new uploads or vitals recorded in the last 30 days.
 * Excludes patients with zero records.
 * Rate limited to maximum once per 7 days per user.
 */
async function checkRecordCompletenessReminders() {
  const supabase = getSupabaseClient();
  const now = new Date();
  const thirtyDaysAgoISO = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const stats = {
    evaluated: 0,
    sent: 0,
    skipped_preferences: 0,
    skipped_rate_limit: 0,
    skipped_no_records: 0,
    skipped_recent_activity: 0,
    errors: 0,
  };
  const errorsList = [];

  try {
    const { data: patients, error: patientErr } = await supabase
      .from("users")
      .select("id")
      .eq("role", "patient");

    if (patientErr) throw patientErr;

    for (const patient of patients || []) {
      const userId = patient.id;
      stats.evaluated++;

      try {
        // Query latest patient_file
        const { data: latestFile } = await supabase
          .from("patient_files")
          .select("created_at")
          .eq("patient_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Query latest vital
        const { data: latestVital } = await supabase
          .from("vitals")
          .select("recorded_at")
          .eq("patient_id", userId)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Exclude brand-new patients with zero records
        if (!latestFile && !latestVital) {
          stats.skipped_no_records++;
          continue;
        }

        const fileDate = latestFile ? new Date(latestFile.created_at).getTime() : 0;
        const vitalDate = latestVital ? new Date(latestVital.recorded_at).getTime() : 0;
        const maxActivityTime = Math.max(fileDate, vitalDate);
        const maxActivityISO = new Date(maxActivityTime).toISOString();

        // Skip if patient has recorded activity in the last 30 days
        if (maxActivityISO > thirtyDaysAgoISO) {
          stats.skipped_recent_activity++;
          continue;
        }

        // Check user notification_preferences for record_reminders
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("record_reminders")
          .eq("user_id", userId)
          .maybeSingle();

        if (pref && pref.record_reminders === false) {
          stats.skipped_preferences++;
          continue;
        }

        // Check 7-day rate limit in notifications log table
        const { data: recentSent } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "record_completeness_reminder")
          .gt("created_at", sevenDaysAgoISO)
          .limit(1)
          .maybeSingle();

        if (recentSent) {
          stats.skipped_rate_limit++;
          continue;
        }

        // Dispatch notification
        const title = "Keep your health record updated";
        const body = "It's been over a month since your last update. Adding your recent vitals or medical documents keeps your profile current.";

        const pushRes = await sendPushNotification(
          userId,
          "record_completeness_reminder",
          title,
          body,
          { screen: "/patient/vitals" }
        );

        if (pushRes.success) {
          stats.sent++;
        } else {
          stats.errors++;
          errorsList.push({ userId, check: "record_completeness", error: pushRes.error });
        }
      } catch (userErr) {
        stats.errors++;
        errorsList.push({ userId, check: "record_completeness", error: userErr.message });
      }
    }
  } catch (err) {
    console.error("checkRecordCompletenessReminders: Batch execution error:", err.message);
    errorsList.push({ check: "record_completeness_batch", error: err.message });
  }

  return { stats, errors: errorsList };
}

/**
 * CHECK B: Consent expiry / update reminder
 * Uses version-based staleness matching Agad's re-consent middleware (requireConsent.js).
 * Identifies users whose latest consent_records row does not match the active consent_versions row
 * for their role.
 * Rate limited: skips if a 'consent_expiry_reminder' notification was already sent to this user
 * after the active consent version creation date (or within the last 7 days as fallback).
 */
async function checkConsentExpiryReminders() {
  const supabase = getSupabaseClient();
  const now = new Date();
  const sevenDaysAgoISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const stats = {
    evaluated: 0,
    sent: 0,
    skipped_preferences: 0,
    skipped_rate_limit: 0,
    skipped_not_stale: 0,
    errors: 0,
  };
  const errorsList = [];

  try {
    // 1. Pre-fetch active consent versions for patient and doctor roles
    const { data: patientActiveVersion } = await supabase
      .from("consent_versions")
      .select("id, role, created_at")
      .eq("role", "patient")
      .eq("is_active", true)
      .maybeSingle();

    const { data: doctorActiveVersion } = await supabase
      .from("consent_versions")
      .select("id, role, created_at")
      .eq("role", "doctor")
      .eq("is_active", true)
      .maybeSingle();

    const activeVersionMap = {
      patient: patientActiveVersion,
      doctor: doctorActiveVersion,
    };

    // 2. Fetch all users
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, role");

    if (usersErr) throw usersErr;

    for (const user of users || []) {
      const userId = user.id;
      const role = user.role;
      stats.evaluated++;

      try {
        const activeVersion = activeVersionMap[role];
        // If no active version is defined for role, consent is not stale
        if (!activeVersion) {
          stats.skipped_not_stale++;
          continue;
        }

        // Fetch user's latest consent record (matching requireConsent.js logic)
        const { data: recentRecord } = await supabase
          .from("consent_records")
          .select("consent_version_id, consented_at")
          .eq("user_id", userId)
          .order("consented_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Check version mismatch (stale if no record exists or version ID doesn't match active version)
        const isStale = !recentRecord || recentRecord.consent_version_id !== activeVersion.id;

        if (!isStale) {
          stats.skipped_not_stale++;
          continue;
        }

        // Check user notification_preferences for consent_reminders
        const { data: pref } = await supabase
          .from("notification_preferences")
          .select("consent_reminders")
          .eq("user_id", userId)
          .maybeSingle();

        if (pref && pref.consent_reminders === false) {
          stats.skipped_preferences++;
          continue;
        }

        // Rate limit threshold date: activeVersion.created_at if present, or 7-day fallback
        const cutoffDateISO = activeVersion.created_at && !isNaN(new Date(activeVersion.created_at).getTime())
          ? (new Date(activeVersion.created_at) > new Date(sevenDaysAgoISO)
              ? new Date(activeVersion.created_at).toISOString()
              : sevenDaysAgoISO)
          : sevenDaysAgoISO;

        // Check if reminder was already sent to this user after the cutoff date
        const { data: recentSent } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", userId)
          .eq("type", "consent_expiry_reminder")
          .gt("created_at", cutoffDateISO)
          .limit(1)
          .maybeSingle();

        if (recentSent) {
          stats.skipped_rate_limit++;
          continue;
        }

        // Dispatch notification with factual copy (no countdown)
        const title = "Consent Update Required";
        const body = "Our Terms & Privacy Policy have been updated. A quick consent update is needed to keep your account access seamless.";

        const pushRes = await sendPushNotification(
          userId,
          "consent_expiry_reminder",
          title,
          body,
          { screen: "/consent" }
        );

        if (pushRes.success) {
          stats.sent++;
        } else {
          stats.errors++;
          errorsList.push({ userId, check: "consent_expiry", error: pushRes.error });
        }
      } catch (userErr) {
        stats.errors++;
        errorsList.push({ userId, check: "consent_expiry", error: userErr.message });
      }
    }
  } catch (err) {
    console.error("checkConsentExpiryReminders: Batch execution error:", err.message);
    errorsList.push({ check: "consent_expiry_batch", error: err.message });
  }

  return { stats, errors: errorsList };
}

module.exports = {
  checkRecordCompletenessReminders,
  checkConsentExpiryReminders,
};
