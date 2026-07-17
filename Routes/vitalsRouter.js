const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireConsent = require("../middleware/requireConsent");
const requireRole = require("../middleware/requireRole");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");
const { isValidUUID } = require("../helpers/validators");

const router = express.Router();

// GET /api/vitals/my-vitals (patient only)
router.get("/my-vitals", requireAuth, requireConsent, requireRole("patient"), async (req, res) => {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", req.user.userId)
      .order("recorded_at", { ascending: false });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/vitals/:patientId (doctor only)
router.get("/:patientId", requireAuth, requireConsent, requireRole("doctor"), async (req, res) => {
  const { patientId } = req.params;
  if (!isValidUUID(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID format." });
  }
  try {
    const active = await isAccessActive(patientId, req.user.userId);
    if (!active) {
      return res.status(403).json({ error: "Access denied. You do not have active access to this patient." });
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("vitals")
      .select("*")
      .eq("patient_id", patientId)
      .order("recorded_at", { ascending: false });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
