const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const patientController = require("../controller/patientController");

const router = express.Router();

router.use(requireAuth);
router.post("/register", patientController.registerPatient);
router.use(patientController.requirePatient);
router.get("/me", patientController.me);
router.get("/vitals", patientController.listVitals);
router.post("/vitals", patientController.addVital);
router.get("/prescriptions", patientController.listPrescriptions);
router.post("/prescriptions", patientController.addPrescription);
router.get("/lab-tests", patientController.listLabTests);
router.post("/lab-tests", patientController.addLabTest);
router.get("/files", patientController.listFiles);
router.post("/files", patientController.addFileMetadata);
router.post("/files/upload-url", patientController.createUploadUrl);
router.post("/upload", patientController.addFileMetadata);
router.get("/qrcode", patientController.generatePatientQR);

module.exports = router;
