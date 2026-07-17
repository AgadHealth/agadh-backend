const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireConsent = require("../middleware/requireConsent");
const doctorController = require("../controller/doctorController");

const router = express.Router();

router.use(requireAuth);
router.post("/register", doctorController.registerDoctor);
router.get("/profile", requireConsent, doctorController.getProfile);
router.post("/profile/update", requireConsent, doctorController.updateProfile);

module.exports = router;
