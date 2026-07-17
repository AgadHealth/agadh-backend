const Patient = require("../model/patient");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");
const { isValidDate, isValidPhone, isValidUUID, validateVitals, sanitizeString } = require("../helpers/validators");

const pick = (body, columns) =>
  columns.reduce((payload, column) => {
    if (body[column] !== undefined) payload[column] = body[column];
    return payload;
  }, {});

const resolvePatientId = async (req) => {
  if (req.user.role === "patient") return req.user.userId;

  const patientId = req.body.patient_id || req.query.patient_id;
  if (!patientId) throw new Error("patient_id is required for doctor actions.");
  if (!isValidUUID(patientId)) throw new Error("Invalid patient ID format.");

  const active = await isAccessActive(patientId, req.user.userId);
  if (!active) throw new Error("Active patient access is required.");
  return patientId;
};

const withCreator = (req, payload) => ({
  ...payload,
  created_by: req.user.userId,
  doctor_id: req.user.role === "doctor" ? req.user.userId : (req.body.doctor_id ?? null),
});



const createVitalPayload = (req) => {
  const vitals = pick(req.body, [
    "blood_pressure_systolic",
    "blood_pressure_diastolic",
    "heart_rate",
    "weight_kg",
  ]);

  const result = validateVitals(vitals);
  if (!result.valid) {
    const err = new Error(result.message);
    err.statusCode = 400;
    throw err;
  }

  return withCreator(req, {
    ...vitals,
    recorded_at: new Date().toISOString(),
    notes: req.body.notes ? sanitizeString(req.body.notes, 1000) : null,
  });
};

const createRecord = (table, getPayload) => async (req, res) => {
  try {
    const patientId = await resolvePatientId(req);
    const payload = getPayload(req);
    const record = await Patient.createRecord(table, patientId, payload);
    return res.status(201).json({ success: true, record });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ error: error.message });
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

  updateProfile: async (req, res) => {
    if (req.user.role !== "patient") {
      return res.status(403).json({ error: "Patient authorization required." });
    }

    const {
      date_of_birth,
      phone_number,
      address,
      blood_group,
      emergency_contact_name,
      emergency_contact_phone,
    } = req.body;

    if (!date_of_birth) {
      return res.status(400).json({ error: "Date of birth is required." });
    }
    if (!isValidDate(date_of_birth)) {
      return res.status(400).json({ error: "Invalid date of birth. Use YYYY-MM-DD format, must not be in the future." });
    }
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required." });
    }
    if (!isValidPhone(phone_number)) {
      return res.status(400).json({ error: "Invalid phone number format. Use 7-15 digits, optionally prefixed with +." });
    }
    if (emergency_contact_phone && !isValidPhone(emergency_contact_phone)) {
      return res.status(400).json({ error: "Invalid emergency contact phone format." });
    }

    if (blood_group && blood_group.trim() !== "") {
      const validBloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
      if (!validBloodGroups.includes(blood_group.toUpperCase().trim())) {
        return res.status(400).json({ error: "Invalid blood group type." });
      }
    }

    try {
      const supabase = getSupabaseClient();
      
      // Update users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .update({
          date_of_birth,
          phone_number: phone_number.replace(/[\s-]/g, ""),
          address: address ? sanitizeString(address, 500) : null,
        })
        .eq("id", req.user.userId)
        .select()
        .single();

      if (userError) {
        if (userError.code === "23505" || userError.message.includes("unique")) {
          return res.status(409).json({ error: "Phone number is already registered to another account." });
        }
        throw userError;
      }

      // Update patients table
      const { data: patientData, error: patientError } = await supabase
        .from("patients")
        .update({
          blood_group: blood_group ? blood_group.toUpperCase().trim() : null,
          emergency_contact_name: emergency_contact_name ? sanitizeString(emergency_contact_name, 100) : null,
          emergency_contact_phone: emergency_contact_phone ? emergency_contact_phone.replace(/[\s-]/g, "") : null,
        })
        .eq("id", req.user.userId)
        .select()
        .single();

      if (patientError) {
        return res.status(500).json({ error: `Failed to update medical details: ${patientError.message}` });
      }

      // Return combined data
      const combinedUser = {
        ...userData,
        blood_group: patientData.blood_group,
        emergency_contact_name: patientData.emergency_contact_name,
        emergency_contact_phone: patientData.emergency_contact_phone,
      };

      return res.json({ success: true, user: combinedUser });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = patientController;
