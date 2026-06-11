const getSupabaseClient = require("../config/supabaseClient");
require("dotenv").config();

async function run() {
  const supabase = getSupabaseClient();
  const patientId = "6dba5937-f558-4e96-9a5d-e480ad074135";
  const doctorId = "e3c35634-d073-43d3-b904-18efe30538bb";

  console.log("--- START REVOKE SIMULATION ---");

  // Find the active grant for this patient–doctor pair
  const { data: grant, error: fetchError } = await supabase
    .from("patient_doctor_access")
    .select("id, doctor_id, patient_id, revoked_at")
    .eq("patient_id", patientId)
    .eq("doctor_id", doctorId)
    .is("revoked_at", null);

  if (fetchError) {
    console.error("Fetch error:", fetchError);
    return;
  }

  console.log("All matching non-revoked rows for this pair:", grant);

  // Now run the maybeSingle query
  const { data: singleGrant, error: singleError } = await supabase
    .from("patient_doctor_access")
    .select("id")
    .eq("patient_id", patientId)
    .eq("doctor_id", doctorId)
    .is("revoked_at", null)
    .maybeSingle();

  if (singleError) {
    console.error("maybeSingle error:", singleError);
  } else {
    console.log("maybeSingle result:", singleGrant);
  }

  if (singleGrant) {
    console.log("Updating revoked_at for row id:", singleGrant.id);
    const { data: updated, error: updateError } = await supabase
      .from("patient_doctor_access")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", singleGrant.id)
      .select();

    if (updateError) {
      console.error("Update error:", updateError);
    } else {
      console.log("Update success:", updated);
    }
  }

  console.log("--- END REVOKE SIMULATION ---");
}

run();
