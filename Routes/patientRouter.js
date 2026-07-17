const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireConsent = require("../middleware/requireConsent");
const patientController = require("../controller/patientController");

const router = express.Router();

router.use(requireAuth);
router.post("/register",   patientController.registerPatient);
router.post("/vitals",     requireConsent, patientController.addVital);
router.post("/profile/update",   requireConsent, patientController.updateProfile);

module.exports = router;
