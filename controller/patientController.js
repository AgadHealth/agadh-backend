const Patient = require("../model/patient");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");

const pick = (body, columns) =>
  columns.reduce((payload, column) => {
    if (body[column] !== undefined) payload[column] = body[column];
    return payload;
  }, {});

const resolvePatientId = async (req) => {
  if (req.user.role === "patient") return req.user.userId;

  const patientId = req.body.patient_id || req.query.patient_id;
  if (!patientId) throw new Error("patient_id is required for doctor actions.");

  const active = await isAccessActive(patientId, req.user.userId);
  if (!active) throw new Error("Active patient access is required.");
  return patientId;
};

const withCreator = (req, payload) => ({
  ...payload,
  created_by: req.user.userId,
  doctor_id: req.user.role === "doctor" ? req.user.userId : (req.body.doctor_id ?? null),
});



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

const createRecord = (table, getPayload) => async (req, res) => {
  try {
    const patientId = await resolvePatientId(req);
    const record = await Patient.createRecord(table, patientId, getPayload(req));
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

  addVital:    createRecord("vitals", createVitalPayload),
};

module.exports = patientController;
