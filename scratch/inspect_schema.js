const getSupabaseClient = require("../config/supabaseClient");
require("dotenv").config();

async function run() {
  try {
    const supabase = getSupabaseClient();
    console.log("Fetching detailed columns for patient_doctor_access...");
    
    // We can query the information_schema using supabase.rpc or direct query if we have an RPC,
    // or we can select a new dummy row, or we can use supabase's postgres query if available.
    // Since supabase client doesn't support raw sql query directly unless we have an RPC function,
    // let's check if we can call a general query or if we can read table schema by inspecting metadata or just querying all columns.
    
    const { data, error } = await supabase
      .from("patient_doctor_access")
      .select("*")
      .limit(1);

    if (error) {
      console.error("Error:", error);
    } else {
      console.log("Columns present in patient_doctor_access row:", Object.keys(data[0] || {}));
    }
  } catch (err) {
    console.error("Execution failed:", err);
  }
}

run();
