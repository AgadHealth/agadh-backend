const express = require("express");
const router = express.Router();
const doctorController = require("../controller/doctorController");





router.post("/register",  doctorController.registerDoctor);

module.exports = router;
