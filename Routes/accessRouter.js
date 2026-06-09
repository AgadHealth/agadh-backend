const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const getSupabaseClient = require("../config/supabaseClient");

const router = express.Router();
router.use(requireAuth);

const requireRole = (role) => async (req, res, next) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("users")
      .select("role")
      .eq("id", req.user.id)
      .single();
    if (error) throw error;
    if (data.role !== role) return res.status(403).json({ error: `${role} role required.` });
    return next();
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};

router.post("/grant", requireRole("patient"), async (req, res) => {
  const { doctor_id } = req.body;
  if (!doctor_id) return res.status(400).json({ error: "doctor_id is required." });

  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .insert({ patient_id: req.user.id, doctor_id })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ data });
});

router.post("/revoke/:accessId", requireRole("patient"), async (req, res) => {
  const { accessId } = req.params;

  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", accessId)
    .eq("patient_id", req.user.id)
    .select();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
});

router.get("/my-doctors", requireRole("patient"), async (req, res) => {
  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .select("*, doctors(*)")
    .eq("patient_id", req.user.id)
    .is("revoked_at", null);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
});

router.get("/my-patients", requireRole("doctor"), async (req, res) => {
  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .select("*, patients(*)")
    .eq("doctor_id", req.user.id)
    .is("revoked_at", null);

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
});

module.exports = router;
