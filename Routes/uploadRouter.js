const path = require("path");
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const cloudinary = require("../config/cloudinary");
const getSupabaseClient = require("../config/supabaseClient");
const requireAuth = require("../middleware/requireAuth");
const { isAccessActive } = require("../helpers/accessHelper");
const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = require("express-rate-limit");
const { isValidRecordType, isValidUUID, sanitizeString } = require("../helpers/validators");

const profilePhotoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many profile photo upload requests. Please wait before trying again.",
  },
});

const documentUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  keyGenerator: (req) => req.user?.userId || ipKeyGenerator(req),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many document upload requests. Please wait before trying again.",
  },
});

const router = express.Router();

// ─── Multer — memory storage, 10 MB limit ────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const PROFILE_PHOTO_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error("Invalid file type."), { status: 400 }));
    }
  },
});

// Multer error handler — converts multer errors into clean JSON responses
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "File exceeds the 10 MB size limit." });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err?.status === 400) {
    return res.status(400).json({ error: err.message });
  }
  return next(err);
}

// ─── Helper: compress image with Sharp ───────────────────────────
async function compressImage(buffer, mimetype) {
  const instance = sharp(buffer).resize({ width: 1920, withoutEnlargement: true });
  if (mimetype === "image/jpeg") return instance.jpeg({ quality: 80 }).toBuffer();
  if (mimetype === "image/png")  return instance.png({ quality: 80 }).toBuffer();
  if (mimetype === "image/webp") return instance.webp({ quality: 80 }).toBuffer();
  return buffer;
}

// ─── Helper: resize and compress profile photo with Sharp ────────
async function resizeProfilePhoto(buffer, mimetype) {
  const instance = sharp(buffer).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true });
  if (mimetype === "image/jpeg") return instance.jpeg({ quality: 80 }).toBuffer();
  if (mimetype === "image/png")  return instance.png({ quality: 80 }).toBuffer();
  if (mimetype === "image/webp") return instance.webp({ quality: 80 }).toBuffer();
  return buffer;
}

// ─── Helper: stream buffer to Cloudinary ─────────────────────────
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

// ─── Helper: process and upload a file, return cloudinary result ─
async function processAndUpload(file, public_id) {
  const isImage = file.mimetype !== "application/pdf";
  const buffer = isImage
    ? await compressImage(file.buffer, file.mimetype)
    : file.buffer;

  return uploadToCloudinary(buffer, {
    public_id,
    type: "authenticated",
    resource_type: isImage ? "image" : "raw",
    overwrite: true,
  });
}

// ─── Helper: clean up Cloudinary on Supabase failure ─────────────
async function cleanupCloudinary(public_id, mimetype) {
  try {
    await cloudinary.uploader.destroy(public_id, {
      type: "authenticated",
      resource_type: mimetype !== "application/pdf" ? "image" : "raw",
    });
  } catch (_) {
    console.error("Cloudinary cleanup failed for:", public_id);
  }
}

// ─────────────────────────────────────────────────────────────────
// POST /upload/patient-files  (patient or doctor)
// Handles all file types: lab_test, prescription, report, imaging
// ─────────────────────────────────────────────────────────────────
router.post(
  "/patient-files",
  requireAuth,
  documentUploadLimiter,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    const { file } = req;
    if (!file) return res.status(400).json({ error: "A file is required." });

    let { file_name, record_type, patientId } = req.body;
    if (!file_name)   return res.status(400).json({ error: "file_name is required." });
    if (!record_type) return res.status(400).json({ error: "record_type is required." });
    file_name = sanitizeString(file_name, 255);
    if (!isValidRecordType(record_type)) {
      return res.status(400).json({ error: "Invalid record type. Allowed: prescription, report, imaging, lab_test." });
    }
    if (patientId && !isValidUUID(patientId)) {
      return res.status(400).json({ error: "Invalid patient ID format." });
    }

    const isDoctor = req.user.role === "doctor";

    if (isDoctor) {
      if (!patientId) {
        return res.status(400).json({ error: "patientId is required for doctor uploads." });
      }
      let active;
      try {
        active = await isAccessActive(patientId, req.user.userId);
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
      if (!active) {
        return res.status(403).json({ error: "You do not have active access to this patient." });
      }
    }

    const patient_id = isDoctor ? patientId : req.user.userId;
    const created_by = req.user.userId;
    const doctor_id  = isDoctor ? req.user.userId : null;

    // Strip extension — Cloudinary appends its own, so including it causes doubles
    const nameWithoutExt = path.parse(file_name).name;
    const safeFileName   = nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, "_");
    const public_id      = `patient_files/${patient_id}/${safeFileName}`;

    let cloudResult;
    try {
      cloudResult = await processAndUpload(file, public_id);
    } catch (_) {
      return res.status(500).json({ error: "File upload failed." });
    }

    const { data: row, error: dbError } = await getSupabaseClient()
      .from("patient_files")
      .insert({
        patient_id,
        created_by,
        doctor_id,
        file_name,
        mime_type:       file.mimetype,
        file_size_bytes: file.size,
        record_type,
        storage_path:    cloudResult.public_id,
        public_id:       cloudResult.public_id,
      })
      .select("id")
      .single();

    if (dbError) {
      await cleanupCloudinary(cloudResult.public_id, file.mimetype);
      return res.status(500).json({ error: "Failed to save file record." });
    }

    return res.status(201).json({ message: "File uploaded successfully.", fileId: row.id });
  }
);

// ─────────────────────────────────────────────────────────────────
// POST /api/upload/profile-photo
// Handles profile photo upload: resizes, uploads to public folder, updates user
// ─────────────────────────────────────────────────────────────────
router.post(
  "/profile-photo",
  requireAuth,
  profilePhotoLimiter,
  upload.single("file"),
  handleMulterError,
  async (req, res) => {
    const { file } = req;
    if (!file) return res.status(400).json({ error: "A file is required." });
    if (!PROFILE_PHOTO_MIME.has(file.mimetype)) {
      return res.status(400).json({ error: "Profile photos must be JPEG, PNG, or WebP images." });
    }

    const supabase = getSupabaseClient();

    try {
      // 1. Look up user's current profile_photo_public_id to delete if exists
      const { data: user, error: fetchError } = await supabase
        .from("users")
        .select("profile_photo_public_id")
        .eq("id", req.user.userId)
        .single();

      if (fetchError) {
        return res.status(500).json({ error: "Failed to fetch user record." });
      }

      if (user && user.profile_photo_public_id) {
        try {
          await cloudinary.uploader.destroy(user.profile_photo_public_id, {
            type: "upload",
            resource_type: "image",
          });
        } catch (err) {
          console.error("Failed to destroy old profile photo on Cloudinary:", err);
        }
      }

      // 2. Resize buffer using Sharp helper to max 512x512
      let processedBuffer;
      try {
        processedBuffer = await resizeProfilePhoto(file.buffer, file.mimetype);
      } catch (err) {
        return res.status(400).json({ error: "Failed to process image file." });
      }

      // 3. Upload new photo to Cloudinary in public folder
      const public_id = `profile_photos/${req.user.userId}_${Date.now()}`;
      const cloudResult = await uploadToCloudinary(processedBuffer, {
        public_id,
        type: "upload", // unsigned/public delivery
        resource_type: "image",
        overwrite: true,
      });

      // 4. Update secure_url and public_id in database
      const { error: dbError } = await supabase
        .from("users")
        .update({
          profile_photo_url: cloudResult.secure_url,
          profile_photo_public_id: cloudResult.public_id,
        })
        .eq("id", req.user.userId);

      if (dbError) {
        // Clean up newly uploaded image on DB error
        try {
          await cloudinary.uploader.destroy(cloudResult.public_id, {
            type: "upload",
            resource_type: "image",
          });
        } catch (_) {}
        return res.status(500).json({ error: "Failed to save profile photo URL to database." });
      }

      return res.status(200).json({
        success: true,
        message: "Profile photo updated successfully.",
        profile_photo_url: cloudResult.secure_url,
      });
    } catch (err) {
      console.error("Profile photo upload error:", err);
      return res.status(500).json({ error: "Unexpected error during upload." });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// DELETE /api/upload/profile-photo
// Removes profile photo: destroys on Cloudinary, nulls columns
// ─────────────────────────────────────────────────────────────────
router.delete(
  "/profile-photo",
  requireAuth,
  async (req, res) => {
    try {
      const supabase = getSupabaseClient();
      const { data: user, error: fetchError } = await supabase
        .from("users")
        .select("profile_photo_public_id")
        .eq("id", req.user.userId)
        .single();

      if (fetchError) {
        return res.status(500).json({ error: "Failed to fetch user record." });
      }

      if (user && user.profile_photo_public_id) {
        try {
          await cloudinary.uploader.destroy(user.profile_photo_public_id, {
            type: "upload",
            resource_type: "image",
          });
        } catch (err) {
          console.error("Failed to destroy profile photo on Cloudinary:", err);
        }
      }

      const { error: dbError } = await supabase
        .from("users")
        .update({
          profile_photo_url: null,
          profile_photo_public_id: null,
        })
        .eq("id", req.user.userId);

      if (dbError) {
        return res.status(500).json({ error: "Failed to update profile columns in database." });
      }

      return res.status(200).json({
        success: true,
        message: "Profile photo removed successfully.",
      });
    } catch (err) {
      console.error("Profile photo delete error:", err);
      return res.status(500).json({ error: "Unexpected error during deletion." });
    }
  }
);

module.exports = router;
