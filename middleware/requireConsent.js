const getSupabaseClient = require("../config/supabaseClient");

const requireConsent = async (req, res, next) => {
  const supabase = getSupabaseClient();
  const userId = req.user?.id || req.authUser?.id;
  let role = req.user?.role;

  if (!userId) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    // 1. If role is not attached, fetch it from users table
    if (!role) {
      const { data: userRow, error: dbError } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (dbError) {
        return res.status(500).json({ error: "Unable to verify authentication." });
      }

      if (!userRow) {
        return res.status(403).json({ error: "User profile not found." });
      }
      role = userRow.role;
    }

    // 2. Fetch the currently active consent version for the role
    const { data: activeVersion, error: versionError } = await supabase
      .from("consent_versions")
      .select("id")
      .eq("role", role)
      .eq("is_active", true)
      .maybeSingle();

    if (versionError) {
      return res.status(500).json({ error: "Unable to verify consent status." });
    }

    // If there is no active version defined for the role, bypass check
    if (!activeVersion) {
      return next();
    }

    // 3. Fetch user's most recent consent record
    const { data: recentRecord, error: recordError } = await supabase
      .from("consent_records")
      .select("consent_version_id")
      .eq("user_id", userId)
      .order("consented_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recordError) {
      return res.status(500).json({ error: "Unable to verify consent status." });
    }

    // 4. Block access if no record or version mismatch
    if (!recentRecord || recentRecord.consent_version_id !== activeVersion.id) {
      return res.status(403).json({ error: "consent_required" });
    }

    // Otherwise, they are allowed access
    return next();
  } catch (error) {
    console.error("Error in requireConsent middleware:", error.message);
    return res.status(500).json({ error: "Unable to verify consent status." });
  }
};

module.exports = requireConsent;
