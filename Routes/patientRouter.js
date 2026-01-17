const express = require("express");
const router = express.Router();
const patientController = require("../controller/patientController");

router.post("/register", patientController.registerPatient);
router.post("/upload", patientController.uploadFileUrl);
router.get("/getVitals/:PhoneNumber", patientController.patientVitals);
router.get("/qrcode/:PhoneNumber", patientController.generatePatientQR);


module.exports = router;
