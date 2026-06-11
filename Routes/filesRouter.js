const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");

const router = express.Router();

// GET /api/files/my-files (patient only)
router.get("/my-files", requireAuth, requireRole("patient"), async (req, res) => {
  try {
    const { data, error } = await getSupabaseClient()
      .from("patient_files")
      .select("id, file_name, mime_type, record_type, created_at, created_by")
      .eq("patient_id", req.user.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let records = data || [];
    if (records.length > 0) {
      const createdByIds = [...new Set(records.map((r) => r.created_by).filter(Boolean))];
      if (createdByIds.length > 0) {
        const { data: usersData, error: usersError } = await getSupabaseClient()
          .from("users")
          .select("id, full_name")
          .in("id", createdByIds);

        if (!usersError && usersData) {
          const userMap = {};
          usersData.forEach((u) => {
            userMap[u.id] = u.full_name;
          });
          records = records.map((r) => ({
            ...r,
            creator_name: userMap[r.created_by] || null,
          }));
        }
      }
    }

    return res.status(200).json({ records });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/files/patient/:patientId (doctor only)
router.get("/patient/:patientId", requireAuth, requireRole("doctor"), async (req, res) => {
  const { patientId } = req.params;
  try {
    const active = await isAccessActive(patientId, req.user.userId);
    if (!active) {
      return res.status(403).json({ error: "Access denied. You do not have active access to this patient." });
    }

    const { data, error } = await getSupabaseClient()
      .from("patient_files")
      .select("id, file_name, mime_type, record_type, created_at, created_by")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let records = data || [];
    if (records.length > 0) {
      const createdByIds = [...new Set(records.map((r) => r.created_by).filter(Boolean))];
      if (createdByIds.length > 0) {
        const { data: usersData, error: usersError } = await getSupabaseClient()
          .from("users")
          .select("id, full_name")
          .in("id", createdByIds);

        if (!usersError && usersData) {
          const userMap = {};
          usersData.forEach((u) => {
            userMap[u.id] = u.full_name;
          });
          records = records.map((r) => ({
            ...r,
            creator_name: userMap[r.created_by] || null,
          }));
        }
      }
    }

    return res.status(200).json({ records });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
