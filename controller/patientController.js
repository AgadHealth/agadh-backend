const { randomUUID } = require("crypto");
const QRCode = require("qrcode");
const Patient = require("../model/patient");
const getSupabaseClient = require("../config/supabaseClient");

const fileRecordTypes = ["report", "lab_test", "imaging", "other"];
const labRecordTypes = ["blood_test", "urine_test", "imaging", "pathology", "other"];

const pick = (body, columns) =>
  columns.reduce((payload, column) => {
    if (body[column] !== undefined) payload[column] = body[column];
    return payload;
  }, {});

const getActor = async (userId) => {
  const { data, error } = await getSupabaseClient()
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
};

const resolvePatientId = async (req) => {
  const actor = await getActor(req.user.id);
  if (actor.role === "patient") return req.user.id;

  const patientId = req.body.patient_id || req.query.patient_id;
  if (!patientId) throw new Error("patient_id is required for doctor actions.");

  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .select("id")
    .eq("patient_id", patientId)
    .eq("doctor_id", req.user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Active patient access is required.");
  return patientId;
};

const withCreator = async (req, payload) => ({
  ...payload,
  created_by: req.user.id,
  doctor_id: (await getActor(req.user.id)).role === "doctor" ? req.user.id : (req.body.doctor_id ?? null),
});

const listRecord = (table) => async (req, res) => {
  try {
    const patientId = await resolvePatientId(req);
    const records = await Patient.listRecords(table, patientId);
    return res.json({ success: true, records });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

const createVitalPayload = (req) =>
  withCreator(req, {
    ...pick(req.body, [
      "blood_pressure_systolic",
      "blood_pressure_diastolic",
      "heart_rate",
      "weight_kg",
    ]),
    recorded_at: new Date().toISOString(),
    notes: req.body.notes ?? null,
  });

const createFilePayload = async (req, allowedTypes) => {
  const payload = await withCreator(req, {
    ...pick(req.body, [
      "file_name",
      "file_url",
      "storage_path",
      "mime_type",
      "file_size_bytes",
      "record_type",
    ]),
  });
  if (req.body.notes !== undefined) payload.notes = req.body.notes ?? null;
  if (!payload.file_name || !payload.file_url || !payload.storage_path) {
    throw new Error("file_name, file_url, and storage_path are required.");
  }
  if (!allowedTypes.includes(payload.record_type)) {
    throw new Error(`record_type must be one of: ${allowedTypes.join(", ")}.`);
  }
  return payload;
};

const createRecord = (table, getPayload) => async (req, res) => {
  try {
    const patientId = await resolvePatientId(req);
    const record = await Patient.createRecord(table, patientId, await getPayload(req));
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
        .eq("id", req.user.id)
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
        .eq("id", req.user.id)
        .single();
      if (error) throw error;
      if (user.role !== "patient") {
        return res.status(403).json({ error: "Patient profile required." });
      }
      const patient = await Patient.upsertProfile(req.user.id);
      return res.json({ success: true, patient });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const patient = await Patient.findByUserId(req.user.id);
      return res.json({ success: true, patient });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  listVitals: listRecord("vitals"),
  addVital: createRecord("vitals", createVitalPayload),
  listLabTests: listRecord("lab_tests"),
  addLabTest: createRecord("lab_tests", (req) => createFilePayload(req, labRecordTypes)),
  listFiles: listRecord("patient_files"),
  addFileMetadata: createRecord("patient_files", (req) => createFilePayload(req, fileRecordTypes)),

  createUploadUrl: async (req, res) => {
    const { fileName, mimeType } = req.body;
    if (!fileName) return res.status(400).json({ error: "fileName is required." });

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${req.user.id}/${randomUUID()}-${safeName}`;

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .storage.from("medical-records")
        .createSignedUploadUrl(path);
      if (error) throw error;
      const { data: publicData } = supabase.storage
        .from("medical-records")
        .getPublicUrl(path);
      return res.json({
        success: true,
        path,
        storage_path: path,
        file_url: publicData.publicUrl,
        mimeType,
        signedUrl: data.signedUrl,
        token: data.token,
      });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  generatePatientQR: async (req, res) => {
    try {
      const patient = await Patient.findByUserId(req.user.id);
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
