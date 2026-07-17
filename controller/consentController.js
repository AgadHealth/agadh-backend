const getSupabaseClient = require("../config/supabaseClient");
const { isValidUUID } = require("../helpers/validators");

const consentController = {
  getActiveConsent: async (req, res) => {
    const { role } = req.query;
    if (!role || (role !== "patient" && role !== "doctor")) {
      return res.status(400).json({ error: "Valid role is required (patient or doctor)." });
    }

    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("consent_versions")
        .select("id, role, version_label, full_text, content_hash, is_active")
        .eq("role", role)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return res.status(404).json({ error: `No active consent version found for role: ${role}.` });
      }

      return res.status(200).json({
        consent_version_id: data.id,
        role: data.role,
        version_label: data.version_label,
        full_text: data.full_text,
        content_hash: data.content_hash,
      });
    } catch (error) {
      console.error("Error fetching active consent:", error.message);
      return res.status(500).json({ error: "Failed to fetch active consent version." });
    }
  },

  submitConsent: async (req, res) => {
    const { consent_version_id, role } = req.body;

    if (!consent_version_id || !role) {
      return res.status(400).json({ error: "consent_version_id and role are required." });
    }
    if (!isValidUUID(consent_version_id)) {
      return res.status(400).json({ error: "Invalid consent version ID format." });
    }

    if (role !== "patient" && role !== "doctor") {
      return res.status(400).json({ error: "Invalid role. Must be 'patient' or 'doctor'." });
    }

    try {
      const supabase = getSupabaseClient();

      // 1. Re-fetch consent version and check active & role matches
      const { data: version, error: versionError } = await supabase
        .from("consent_versions")
        .select("id, role, content_hash, is_active")
        .eq("id", consent_version_id)
        .maybeSingle();

      if (versionError) throw versionError;

      if (!version) {
        return res.status(400).json({ error: "Consent version not found." });
      }

      if (!version.is_active) {
        return res.status(400).json({ error: "This consent version is no longer active." });
      }

      if (version.role !== role) {
        return res.status(400).json({ error: "Consent version role mismatch." });
      }

      // 2. Fetch authenticated user's role from users table to confirm matches
      const { data: userRow, error: userError } = await supabase
        .from("users")
        .select("role")
        .eq("id", req.authUser.id)
        .maybeSingle();

      if (userError) throw userError;

      if (!userRow) {
        return res.status(403).json({ error: "User profile not found." });
      }

      if (userRow.role !== role) {
        return res.status(403).json({ error: "Role mismatch. Cannot consent for another role." });
      }

      // 3. Resolve device_id from current session's device
      let deviceDbId = null;
      if (req.accessToken) {
        try {
          const payload = JSON.parse(
            Buffer.from(req.accessToken.split(".")[1], "base64").toString()
          );
          const sessionId = payload.session_id ?? null;

          if (sessionId) {
            const { data: deviceRow, error: deviceError } = await supabase
              .from("user_devices")
              .select("id")
              .eq("user_id", req.authUser.id)
              .eq("session_id", sessionId)
              .maybeSingle();

            if (!deviceError && deviceRow) {
              deviceDbId = deviceRow.id;
            }
          }
        } catch (e) {
          console.warn("Failed to resolve device_id during consent submission:", e.message);
        }
      }

      // 4. Write row to consent_records
      const { error: insertError } = await supabase
        .from("consent_records")
        .insert({
          user_id: req.authUser.id,
          consent_version_id: version.id,
          role: version.role,
          content_hash_at_consent: version.content_hash,
          device_id: deviceDbId,
          consented_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      return res.status(200).json({ success: true, message: "Consent recorded successfully." });
    } catch (error) {
      console.error("Error submitting consent:", error.message);
      return res.status(500).json({ error: "Failed to record consent submission." });
    }
  },
};

module.exports = consentController;
