const { randomUUID } = require("crypto");
const QRCode = require("qrcode");
const Patient = require("../model/patient");
const getSupabaseClient = require("../config/supabaseClient");

const recordColumns = {
  vitals: ["recorded_at", "blood_pressure_systolic", "blood_pressure_diastolic", "heart_rate", "blood_sugar", "weight_kg", "notes"],
  prescriptions: ["prescribed_at", "prescriber_name", "medication_name", "dosage", "frequency", "instructions"],
  lab_tests: ["test_name", "test_date", "lab_name", "status", "result_summary"],
  patient_files: ["file_name", "storage_path", "mime_type", "file_size_bytes", "record_type"],
};

const recordPayload = (table, body, userId) => {
  const payload = { created_by: userId };
  recordColumns[table].forEach((column) => {
    if (body[column] !== undefined) payload[column] = body[column];
  });
  return payload;
};

const listRecord = (table) => async (req, res) => {
  try {
    const records = await Patient.listRecords(table, req.authUser.id);
    return res.json({ success: true, records });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const createRecord = (table) => async (req, res) => {
  try {
    const record = await Patient.createRecord(
      table,
      req.authUser.id,
      recordPayload(table, req.body, req.authUser.id)
    );
    return res.status(201).json({ success: true, record });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const patientController = {
  requirePatient: async (req, res, next) => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("patients")
        .select("id")
        .eq("id", req.authUser.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(403).json({ error: "Patient profile required." });
      return next();
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  registerPatient: async (req, res) => {
    try {
      const { data: user, error } = await getSupabaseClient()
        .from("users")
        .select("role")
        .eq("id", req.authUser.id)
        .single();
      if (error) throw error;
      // Temporarily skip phone_verified until phone OTP/SMS delivery is enabled.
      if (user.role !== "patient") {
        return res.status(403).json({ error: "Patient profile required." });
      }
      const patient = await Patient.upsertProfile(req.authUser.id);
      return res.json({ success: true, patient });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const patient = await Patient.findByUserId(req.authUser.id);
      return res.json({ success: true, patient });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  listVitals: listRecord("vitals"),
  addVital: createRecord("vitals"),
  listPrescriptions: listRecord("prescriptions"),
  addPrescription: createRecord("prescriptions"),
  listLabTests: listRecord("lab_tests"),
  addLabTest: createRecord("lab_tests"),
  listFiles: listRecord("patient_files"),
  addFileMetadata: createRecord("patient_files"),

  createUploadUrl: async (req, res) => {
    const { fileName, mimeType } = req.body;
    if (!fileName) return res.status(400).json({ error: "fileName is required." });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${req.authUser.id}/${randomUUID()}-${safeName}`;

    try {
      const { data, error } = await getSupabaseClient()
        .storage.from("medical-records")
        .createSignedUploadUrl(path);
      if (error) throw error;
      return res.json({ success: true, path, mimeType, signedUrl: data.signedUrl, token: data.token });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  generatePatientQR: async (req, res) => {
    try {
      const patient = await Patient.findByUserId(req.authUser.id);
      if (!patient) return res.status(404).json({ error: "Patient profile not found." });
      const qrImage = await QRCode.toDataURL(
        JSON.stringify({ patientId: patient.id, fullName: patient.users.full_name })
      );
      return res.json({ success: true, qrImage });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = patientController;
