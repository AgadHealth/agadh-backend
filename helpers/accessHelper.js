const getSupabaseClient = require("../config/supabaseClient");

/**
 * isAccessActive(patient_id, doctor_id)
 * Returns true only if an active (non-revoked, non-expired) grant exists
 * for this patient–doctor pair.
 * Reused in upload and view routes in later phases.
 */
const isAccessActive = async (patient_id, doctor_id) => {
  const { data, error } = await getSupabaseClient()
    .from("patient_doctor_access")
    .select("id, revoked_at, expires_at")
    .eq("patient_id", patient_id)
    .eq("doctor_id", doctor_id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

module.exports = { isAccessActive };
