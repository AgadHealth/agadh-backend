const Doctor = require("../model/Doctor");
const getSupabaseClient = require("../config/supabaseClient");

const doctorController = {
  registerDoctor: async (req, res) => {
    const {
      medicalDegree,
      specialization,
      yearsOfExperience,
      clinicName,
      clinicLocation,
    } = req.body;

    if (
      !medicalDegree ||
      !specialization ||
      yearsOfExperience === undefined ||
      !clinicName ||
      !clinicLocation
    ) {
      return res.status(400).json({ error: "Complete doctor onboarding fields are required." });
    }

    try {
      const { data: user, error } = await getSupabaseClient()
        .from("users")
        .select("role")
        .eq("id", req.authUser.id)
        .single();
      if (error) throw error;
      // Temporarily skip phone_verified until phone OTP/SMS delivery is enabled.
      if (user.role !== "doctor") {
        return res.status(403).json({ error: "Doctor profile required." });
      }
      const doctor = await Doctor.upsertProfile(req.authUser.id, req.body);
      return res.json({ success: true, doctor });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = doctorController;
