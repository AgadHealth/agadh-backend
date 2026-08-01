const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { sendPushNotification } = require("../services/notificationService");
const {
  checkRecordCompletenessReminders,
  checkConsentExpiryReminders,
} = require("../services/scheduledCheckService");

const router = express.Router();

// ── Scheduled Notification Checks: POST /api/notifications/run-scheduled-checks ──
// Triggered externally by cron service (e.g. cron-job.org / Render Cron).
// Protected by X-Cron-Secret header matching process.env.CRON_SECRET.
router.post("/run-scheduled-checks", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const reqSecret = req.headers["x-cron-secret"] || req.query.cron_secret;

  if (!cronSecret || reqSecret !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized. Invalid or missing cron secret." });
  }

  try {
    const recordResult = await checkRecordCompletenessReminders();
    const consentResult = await checkConsentExpiryReminders();

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total_users_evaluated: Math.max(recordResult.stats.evaluated, consentResult.stats.evaluated),
        record_completeness: recordResult.stats,
        consent_expiry: consentResult.stats,
      },
      user_errors: [...recordResult.errors, ...consentResult.errors],
    };

    return res.status(200).json(summary);
  } catch (err) {
    console.error("Error executing scheduled notification checks:", err);
    return res.status(500).json({ error: "Failed to execute scheduled checks.", details: err.message });
  }
});

// ── Temporary Test Route: POST /api/notifications/test-send ──────────────────
// Protected endpoint to verify push notification sending to the current logged-in user.
// Body (optional): { title?: string, body?: string, data?: object }
router.post("/test-send", requireAuth, async (req, res) => {
  const userId = req.user.userId;
  const { title, body, data } = req.body || {};

  const notificationTitle = title || "Test Push Notification";
  const notificationBody = body || "This is a test push notification from Agadh Health backend.";
  const notificationData = data || { test: true };

  const result = await sendPushNotification(
    userId,
    "test",
    notificationTitle,
    notificationBody,
    notificationData
  );

  if (!result.success) {
    return res.status(400).json({
      error: "Failed to send test push notification.",
      details: result,
    });
  }

  return res.status(200).json({
    message: "Test push notification attempt processed.",
    result,
  });
});

module.exports = router;
