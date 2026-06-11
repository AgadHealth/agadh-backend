const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");

const router = express.Router();

const calculateAge = (dobString) => {
  if (!dobString) return null;
  const today = new Date();
  const birthDate = new Date(dobString);
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// GET /api/patients/:patientId/details (doctor only)
router.get("/:patientId/details", requireAuth, requireRole("doctor"), async (req, res) => {
  const { patientId } = req.params;
  try {
    const active = await isAccessActive(patientId, req.user.userId);
    if (!active) {
      return res.status(403).json({ error: "Access denied. You do not have active access to this patient." });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("patients")
      .select("*, users(full_name, date_of_birth, gender, phone_number)")
      .eq("id", patientId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ error: "Patient not found." });
    }

    const { id, users, ...additionalPatientFields } = data;
    const userFields = users || {};
    const age = calculateAge(userFields.date_of_birth);

    return res.status(200).json({
      full_name: userFields.full_name || null,
      age: age,
      gender: userFields.gender || null,
      phone_number: userFields.phone_number || null,
      date_of_birth: userFields.date_of_birth || null,
      ...additionalPatientFields,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
