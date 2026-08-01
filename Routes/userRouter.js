const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireJwt = require("../middleware/requireJwt");
const userController = require("../controller/userController");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");

const accountDeletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 60 minutes
  max: 3,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many account deletion attempts. Please wait before trying again.",
  },
});

const router = express.Router();

// /me requires a fully-formed profile row in the users table
router.get("/me", requireAuth, userController.me);

// Profile upsert: only validate the JWT — the users row doesn't exist yet
// for brand-new registrations, so we must NOT use requireAuth here.
router.put("/profile", requireJwt, userController.upsertProfile);

// Email Sync: called after client-side OTP verification completes.
router.post("/email/sync", requireAuth, userController.syncEmail);

// Device management routes (Manage Devices & Sessions screen)
router.get("/devices", requireAuth, userController.getUserDevices);
router.delete("/devices/:id", requireAuth, userController.deleteUserDevice);
router.post("/devices/logout-others", requireAuth, userController.logoutOtherDevices);
router.post("/push-token", requireAuth, userController.updatePushToken);
router.delete("/account", requireAuth, accountDeletionLimiter, userController.deleteAccount);

module.exports = router;
