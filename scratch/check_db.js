const getSupabaseClient = require("../config/supabaseClient");
require("dotenv").config();

async function run() {
  try {
    const supabase = getSupabaseClient();
    const testCode = "5A340A5593";
    const doctorId = "e3c35634-d073-43d3-b904-18efe30538bb";

    console.log("1. Finding code:", testCode);
    const { data: existingRow, error: findError } = await supabase
      .from('patient_doctor_access')
      .select('id, doctor_id, expires_at, revoked_at, patient_id')
      .eq('access_code', testCode)
      .maybeSingle();

    if (findError) {
      console.error("Select error:", findError);
      return;
    }
    console.log("Select result:", existingRow);

    if (!existingRow) {
      console.error("Code not found in DB!");
      return;
    }

    console.log("2. Deleting old conflicting rows for patient/doctor pair...");
    const { error: deleteError } = await supabase
      .from('patient_doctor_access')
      .delete()
      .eq('patient_id', existingRow.patient_id)
      .eq('doctor_id', doctorId);

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return;
    }
    console.log("Old rows deleted successfully.");

    console.log("3. Updating doctor_id to:", doctorId);
    const { data: updatedData, error: updateError } = await supabase
      .from('patient_doctor_access')
      .update({ doctor_id: doctorId })
      .eq('id', existingRow.id)
      .select();

    if (updateError) {
      console.error("Update error:", updateError);
    } else {
      console.log("Update success! Row after update:");
      console.log(JSON.stringify(updatedData, null, 2));
    }
  } catch (err) {
    console.error("Execution failed:", err);
  }
}

run();
