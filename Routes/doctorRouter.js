const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const doctorController = require("../controller/doctorController");

const router = express.Router();

router.use(requireAuth);
router.post("/register", doctorController.registerDoctor);

module.exports = router;
