const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const patientController = require("../controller/patientController");

const router = express.Router();

router.use(requireAuth);
router.post("/register",   patientController.registerPatient);
router.post("/vitals",     patientController.addVital);

module.exports = router;
