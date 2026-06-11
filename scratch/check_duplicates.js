const getSupabaseClient = require("../config/supabaseClient");
require("dotenv").config();

async function run() {
  try {
    const supabase = getSupabaseClient();
    console.log("Listing all rows in patient_doctor_access to analyze database state...");
    const { data, error } = await supabase
      .from("patient_doctor_access")
      .select("id, patient_id, doctor_id, access_code, revoked_at, expires_at");

    if (error) {
      console.error("Error fetching rows:", error);
      return;
    }

    console.log(`Total rows: ${data.length}`);
    console.log("Rows data:", JSON.stringify(data, null, 2));

    const codeCounts = {};
    data.forEach((row) => {
      if (row.access_code) {
        codeCounts[row.access_code] = (codeCounts[row.access_code] || 0) + 1;
      }
    });

    const duplicates = Object.entries(codeCounts).filter(([code, count]) => count > 1);
    console.log("\nDuplicates found:", duplicates);
  } catch (err) {
    console.error("Execution failed:", err);
  }
}

run();
