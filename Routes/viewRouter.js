const express = require("express");
const cloudinary = require("../config/cloudinary");
const getSupabaseClient = require("../config/supabaseClient");
const requireAuth = require("../middleware/requireAuth");
const { isAccessActive } = require("../helpers/accessHelper");

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Derive the Cloudinary format string and resource_type from a MIME type.
 */
function cloudinaryFormat(mimeType) {
  switch (mimeType) {
    case "image/jpeg": return { format: "jpg",  resource_type: "image" };
    case "image/png":  return { format: "png",  resource_type: "image" };
    case "image/webp": return { format: "webp", resource_type: "image" };
    case "application/pdf": return { format: "pdf", resource_type: "raw" };
    default:           return { format: "jpg",  resource_type: "image" };
  }
}

/**
 * Generate a short-lived (60 s) Cloudinary signed URL for an
 * authenticated asset.
 */
function generateSignedUrl(public_id, mimeType) {
  const { format, resource_type } = cloudinaryFormat(mimeType);
  const seconds = mimeType === "application/pdf" ? 300 : 60;
  return cloudinary.utils.private_download_url(public_id, format, {
    resource_type,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + seconds,
    attachment: false,
  });
}

/**
 * Check that the caller is allowed to access a row that belongs to
 * a given patient.
 *   - patient role  → must own the file (patient_id === userId)
 *   - doctor role   → must have active access to that patient
 *
 * Throws an object { status, message } on denial so the route handler
 * can send the right HTTP response without duplicating logic.
 */
async function assertAccess(req, patientId) {
  if (req.user.role === "patient") {
    if (req.user.userId !== patientId) {
      throw { status: 403, message: "Access denied." };
    }
    return;
  }

  if (req.user.role === "doctor") {
    const active = await isAccessActive(patientId, req.user.userId);
    if (!active) {
      throw { status: 403, message: "You do not have active access to this patient." };
    }
    return;
  }

  throw { status: 403, message: "Access denied." };
}

/**
 * Generic factory that builds a view handler for a given Supabase table.
 * Keeps both routes DRY — the only difference is the table name.
 */
function viewHandler(table) {
  return async (req, res) => {
    const { id } = req.params;

    // ── 1. Fetch the file row ────────────────────────────────────
    let row;
    try {
      const { data, error } = await getSupabaseClient()
        .from(table)
        .select("id, patient_id, public_id, mime_type, file_name")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      row = data;
    } catch (_) {
      return res.status(500).json({ error: "Failed to retrieve file." });
    }

    if (!row) return res.status(404).json({ error: "File not found." });

    // ── 2. Permission check ──────────────────────────────────────
    try {
      await assertAccess(req, row.patient_id);
    } catch (err) {
      return res.status(err.status).json({ error: err.message });
    }

    // ── 3. Generate signed URL ───────────────────────────────────
    let signedUrl;
    try {
      signedUrl = generateSignedUrl(row.public_id, row.mime_type);
    } catch (_) {
      return res.status(500).json({ error: "Failed to generate access link." });
    }

    return res.json({
      signedUrl,
      mime_type: row.mime_type,
      file_name: row.file_name,
    });
  };
}

// ─── Routes ──────────────────────────────────────────────────────

// GET /view/patient-files/:id  — patient (own files) or doctor (with active access)
router.get("/patient-files/:id", requireAuth, viewHandler("patient_files"));

// GET /view/lab-tests/:id      — patient (own files) or doctor (with active access)
router.get("/lab-tests/:id",     requireAuth, viewHandler("lab_tests"));

module.exports = router;
