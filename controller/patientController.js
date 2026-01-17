const Patient = require("../model/patient");
const QRCode = require("qrcode");

const patientController = {
  registerPatient: async (req, res) => {
    try {
      const { FirstName, LastName, Email, PhoneNumber, DOB, Address, vitals } =
        req.body;

      const newPatient = new Patient({
        FirstName,
        LastName,
        Email,
        PhoneNumber,
        DOB,
        Address,
        vitals,
      });

      await newPatient.save();

      res.json({
        success: true,
        message: "Patient registered successfully.",
      });
    } catch (error) {
      console.error("Patient registration error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  uploadFileUrl: async (req, res) => {
    try {
      const { PhoneNumber, filename } = req.body; // filename can be a string or array
      const patient = await Patient.findOne({ PhoneNumber });
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      // Ensure uploadFiles array exists
      if (!Array.isArray(patient.uploadFiles)) {
        patient.uploadFiles = [];
      }
      // Support multiple filenames (array or string)
      if (Array.isArray(filename)) {
        filename.forEach((file) => {
          patient.uploadFiles.push({ filename: file });
        });
      } else if (typeof filename === "string") {
        patient.uploadFiles.push({ filename });
      }
      await patient.save();
      res.json({
        success: true,
        message: "File(s) uploaded successfully.",
        patient,
      });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: error.message });
    }
  },

  generatePatientQR: async (req, res) => {
    try {
      const { PhoneNumber } = req.params;
      const patient = await Patient.findOne({ PhoneNumber });
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }

      // Prepare data for QR code
      const qrData = {
        FirstName: patient.FirstName,
        LastName: patient.LastName,
        Email: patient.Email,
        PhoneNumber: patient.PhoneNumber,
        DOB: patient.DOB,
        Address: patient.Address,
        vitals: patient.vitals,
        reports: patient.uploadFiles.map((f) => f.filename),
      };

      // Generate QR code as Data URL (base64 image)
      const qrImage = await QRCode.toDataURL(JSON.stringify(qrData));

      res.json({
        success: true,
        qrImage, // base64 image string
        patient: qrData,
      });
    } catch (error) {
      console.error("QR code generation error:", error);
      res.status(500).json({ error: error.message });
    }
  },
  patientVitals: async (req, res) => {
    try {
      const { PhoneNumber } = req.params;
      const patient = await Patient.findOne({ PhoneNumber });
      if (!patient) {
        return res.status(404).json({ error: "Patient not found" });
      }
      res.json({
        success: true,
        vitals: patient.vitals,
      });
    } catch (error) {
      console.error("Vitals sharing error:", error);
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = patientController;
