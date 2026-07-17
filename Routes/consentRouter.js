const express = require("express");
const requireJwt = require("../middleware/requireJwt");
const consentController = require("../controller/consentController");

const router = express.Router();

// GET /api/consent/active?role=patient|doctor
router.get("/active", requireJwt, consentController.getActiveConsent);

// POST /api/consent/submit
router.post("/submit", requireJwt, consentController.submitConsent);

module.exports = router;
