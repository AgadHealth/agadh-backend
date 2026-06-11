const getSupabaseClient = require("../config/supabaseClient");
require("dotenv").config();

async function run() {
  const supabase = getSupabaseClient();
  const patientId = "6dba5937-f558-4e96-9a5d-e480ad074135";
  const doctorId = "e3c35634-d073-43d3-b904-18efe30538bb";
  const testCode = "SIMULATE99";

  console.log("--- START SIMULATION ---");
  
  // 1. Clean up any existing rows with the testCode
  console.log("Cleaning up old test codes...");
  await supabase.from("patient_doctor_access").delete().eq("access_code", testCode);

  // 2. Generate/insert access code (Patient side)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
  console.log("Inserting new access code row (Patient generates code)...");
  const { data: insertedRow, error: insertError } = await supabase
    .from("patient_doctor_access")
    .insert({
      patient_id: patientId,
      access_code: testCode,
      access_duration_hours: 15,
      granted_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      revoked_at: null,
    })
    .select()
    .single();

  if (insertError) {
    console.error("Generate error:", insertError);
    return;
  }
  console.log("Generated Row:", insertedRow);

  // 3. Claim access code (Doctor side)
  console.log("\nSimulating Doctor claiming the code...");
  const claimCode = testCode;

  // Find the row
  const { data: existingRow, error: findError } = await supabase
    .from('patient_doctor_access')
    .select('id, doctor_id, expires_at, revoked_at, patient_id')
    .eq('access_code', claimCode)
    .maybeSingle();

  if (findError || !existingRow) {
    console.error("Find error or not found:", findError, existingRow);
    return;
  }
  console.log("Found existing row to claim:", existingRow);

  // Pre-delete old matching records for this patient/doctor pair to prevent unique constraint violation
  console.log("Executing pre-delete for patient/doctor pair...");
  const { error: deleteError } = await supabase
    .from('patient_doctor_access')
    .delete()
    .eq('patient_id', existingRow.patient_id)
    .eq('doctor_id', doctorId);

  if (deleteError) {
    console.error("Pre-delete error:", deleteError);
    return;
  }
  console.log("Pre-delete completed successfully.");

  // Update doctor_id
  console.log("Updating doctor_id...");
  const { data: updatedRow, error: updateError } = await supabase
    .from('patient_doctor_access')
    .update({ doctor_id: doctorId })
    .eq('id', existingRow.id)
    .select();

  if (updateError) {
    console.error("Update error:", updateError);
    return;
  }
  console.log("Update completed successfully! Claimed row details:", updatedRow);
  console.log("--- SIMULATION SUCCESSFUL ---");
}

run();
