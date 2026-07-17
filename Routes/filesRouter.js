const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireConsent = require("../middleware/requireConsent");
const requireRole = require("../middleware/requireRole");
const getSupabaseClient = require("../config/supabaseClient");
const { isAccessActive } = require("../helpers/accessHelper");
const { isValidUUID } = require("../helpers/validators");

const router = express.Router();

router.use(requireAuth);
router.use(requireConsent);

// GET /api/files/my-files (patient only)
router.get("/my-files", requireRole("patient"), async (req, res) => {
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
router.get("/patient/:patientId", requireRole("doctor"), async (req, res) => {
  const { patientId } = req.params;
  if (!isValidUUID(patientId)) {
    return res.status(400).json({ error: "Invalid patient ID format." });
  }
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

// DELETE /api/files/:id (patient only)
router.delete("/:id", requireRole("patient"), async (req, res) => {
  const { id } = req.params;
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid file ID format." });
  }
  try {
    const supabase = getSupabaseClient();
    
    // Fetch row first to check ownership and get public_id/mime_type
    const { data: row, error: fetchError } = await supabase
      .from("patient_files")
      .select("patient_id, public_id, mime_type")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!row) {
      return res.status(404).json({ error: "File not found." });
    }

    // Only the patient who owns the file can delete it
    if (row.patient_id !== req.user.userId) {
      return res.status(403).json({ error: "Access denied. You can only delete your own files." });
    }

    // Delete from Supabase first
    const { error: deleteError } = await supabase
      .from("patient_files")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // Delete from Cloudinary
    const isImage = row.mime_type !== "application/pdf";
    try {
      const cloudinary = require("../config/cloudinary");
      await cloudinary.uploader.destroy(row.public_id, {
        type: "authenticated",
        resource_type: isImage ? "image" : "raw",
      });
    } catch (cloudinaryErr) {
      console.error("Failed to delete file from Cloudinary:", row.public_id, cloudinaryErr);
    }

    return res.status(200).json({ message: "File deleted successfully." });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
