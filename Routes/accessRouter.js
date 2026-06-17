const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const getSupabaseClient = require("../config/supabaseClient");

const generateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,          
  max: 5,                             // 5 generated codes per window per user
  keyGenerator: (req) => req.user?.userId || req.ip,
  standardHeaders: true,              
  legacyHeaders: false,              
  message: {
    error: "Too many access codes generated. Please wait before generating another.",
  },
});

const claimLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,          // 15-minute sliding window
  max: 10,                            // 10 claim attempts per window per IP
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many claim attempts. Please wait before trying again.",
  },
});

const router = express.Router();

router.use(requireAuth);

router.post("/generate", generateLimiter, requireRole("patient"), async (req, res) => {
  const { duration_minutes } = req.body;

  const ALLOWED = [15, 30, 60];
  if (!ALLOWED.includes(Number(duration_minutes))) {
    return res
      .status(400)
      .json({ error: "Invalid duration. Choose 15, 30, or 60 minutes." });
  }

  const access_code = crypto.randomBytes(5).toString("hex").toUpperCase();
  const now = new Date();
  const expires_at = new Date(now.getTime() + Number(duration_minutes) * 60 * 1000);

  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .insert({
      patient_id: req.user.userId,
      access_code,
      // Column is named access_duration_hours in DB but stores minutes per spec
      access_duration_hours: Number(duration_minutes),
      granted_at: now.toISOString(),
      expires_at: expires_at.toISOString(),
      revoked_at: null,
    })
    .select("access_code")
    .single();

  if (error) return res.status(400).json({ error: error.message });
  return res.status(201).json({ access_code: data.access_code });
});

router.post("/claim", claimLimiter, requireRole("doctor"), async (req, res) => {
  const { access_code } = req.body;
  if (!access_code) {
    return res.status(400).json({ error: "access_code is required." });
  }

  const supabase = getSupabaseClient();

  const { data: existingRow, error: findError } = await supabase
    .from('patient_doctor_access')
    .select('id, doctor_id, expires_at, revoked_at, patient_id')
    .eq('access_code', req.body.access_code?.trim().toUpperCase())
    .maybeSingle();


  // Check row exists
  if (findError || !existingRow) {
    return res.status(404).json({ error: 'Invalid code.' });
  }

  // Check not already claimed
  if (existingRow.doctor_id !== null) {
    return res.status(400).json({ error: 'This code has already been used.' });
  }

  // Check not expired
  if (new Date(existingRow.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This access code has expired.' });
  }

  // Check not revoked
  if (existingRow.revoked_at !== null) {
    return res.status(403).json({ error: 'This access has been revoked.' });
  }

  // Delete any old matching records for this patient/doctor pair to prevent unique constraint violation
  const { error: deleteError } = await supabase
    .from('patient_doctor_access')
    .delete()
    .eq('patient_id', existingRow.patient_id)
    .eq('doctor_id', req.user.userId);

  if (deleteError) {
    console.error('Pre-delete error:', deleteError);
    return res.status(500).json({ error: 'Failed to claim access.' });
  }

  // Update doctor_id
  const { error: updateError } = await supabase
    .from('patient_doctor_access')
    .update({ doctor_id: req.user.userId })
    .eq('id', existingRow.id);

  if (updateError) {
    console.error('Update error:', updateError);
    return res.status(500).json({ error: 'Failed to claim access.' });
  }

  return res.status(200).json({
    message: 'Access granted successfully.',
    patient_id: existingRow.patient_id,
    expires_at: existingRow.expires_at,
  });
});


router.delete("/revoke/:doctorId", requireRole("patient"), async (req, res) => {
  const { doctorId } = req.params;
  const supabase = getSupabaseClient();



  // Find the active grant for this patient–doctor pair
  const { data: grant, error: fetchError } = await supabase
    .from("patient_doctor_access")
    .select("id")
    .eq("patient_id", req.user.userId)
    .eq("doctor_id", doctorId)
    .is("revoked_at", null)
    .maybeSingle();



  if (fetchError) {
    console.error("Revoke Fetch Error:", fetchError);
    return res.status(400).json({ error: fetchError.message });
  }
  if (!grant) {
    console.warn("Revoke: No active access found for doctorId:", doctorId, "and patient_id:", req.user.userId);
    return res
      .status(404)
      .json({ error: "No active access found for this doctor." });
  }

  const { error: updateError } = await supabase
    .from("patient_doctor_access")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", grant.id);



  if (updateError) {
    console.error("Revoke Update Error:", updateError);
    return res.status(400).json({ error: updateError.message });
  }
  return res.status(200).json({ message: "Access revoked successfully." });
});



router.get("/my-doctors", requireRole("patient"), async (req, res) => {
  const { data, error } = await getSupabaseClient()
    .from('patient_doctor_access')
    .select(`
      id,
      doctor_id,
      granted_at,
      expires_at,
      doctors!patient_doctor_access_doctor_id_fkey (
        specialization,
        medical_degree,
        users (
          full_name
        )
      )
    `)
    .eq('patient_id', req.user.userId)
    .is('revoked_at', null)
    .not('doctor_id', 'is', null)
    .gt('expires_at', new Date().toISOString());



  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
});


router.get("/my-patients", requireRole("doctor"), async (req, res) => {
  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .select(`
      id,
      granted_at,
      expires_at,
      patient_id,
      patients!patient_doctor_access_patient_id_fkey (
        id,
        users (
          full_name,
          date_of_birth,
          gender
        )
      )
    `)
    .eq("doctor_id", req.user.userId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) return res.status(400).json({ error: error.message });
  return res.status(200).json({ data });
});

module.exports = router;
