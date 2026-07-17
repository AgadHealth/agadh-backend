const Doctor = require("../model/Doctor");
const getSupabaseClient = require("../config/supabaseClient");
const { isValidDate, isValidPhone, sanitizeString } = require("../helpers/validators");

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

    const yoe = Number(yearsOfExperience);
    if (isNaN(yoe) || !Number.isInteger(yoe) || yoe < 0 || yoe > 80) {
      return res.status(400).json({ error: "Years of experience must be a whole number between 0 and 80." });
    }

    // Sanitize string lengths
    req.body.medicalDegree = sanitizeString(medicalDegree, 100);
    req.body.specialization = sanitizeString(specialization, 100);
    req.body.clinicName = sanitizeString(clinicName, 150);
    req.body.clinicLocation = sanitizeString(clinicLocation, 300);

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

  getProfile: async (req, res) => {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Doctor authorization required." });
    }

    try {
      const { data, error } = await getSupabaseClient()
        .from("users")
        .select("*, doctors(*)")
        .eq("id", req.user.userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Doctor profile not found." });

      const doctorData = Array.isArray(data.doctors)
        ? (data.doctors.length > 0 ? data.doctors[0] : null)
        : data.doctors;

      const profile = {
        id: data.id,
        email: data.email,
        full_name: data.full_name,
        gender: data.gender,
        phone_number: data.phone_number,
        date_of_birth: data.date_of_birth,
        address: data.address,
        specialization: doctorData?.specialization || null,
        clinic_name: doctorData?.clinic_name || null,
        clinic_location: doctorData?.clinic_location || null,
        license_number: doctorData?.license_number || null,
      };

      return res.json({ success: true, user: profile });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  updateProfile: async (req, res) => {
    if (req.user.role !== "doctor") {
      return res.status(403).json({ error: "Doctor authorization required." });
    }

    const {
      date_of_birth,
      phone_number,
      address,
      specialization,
      clinic_name,
      clinic_location,
      license_number,
    } = req.body;

    if (!date_of_birth) {
      return res.status(400).json({ error: "Date of birth is required." });
    }
    if (!isValidDate(date_of_birth)) {
      return res.status(400).json({ error: "Invalid date of birth. Use YYYY-MM-DD format, must not be in the future." });
    }
    if (!phone_number) {
      return res.status(400).json({ error: "Phone number is required." });
    }
    if (!isValidPhone(phone_number)) {
      return res.status(400).json({ error: "Invalid phone number format. Use 7-15 digits, optionally prefixed with +." });
    }

    try {
      const supabase = getSupabaseClient();

      // Check if license_number is already set in database
      const { data: currentDoctor, error: fetchError } = await supabase
        .from("doctors")
        .select("license_number")
        .eq("id", req.user.userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const isLicenseAlreadySet = currentDoctor && currentDoctor.license_number && currentDoctor.license_number.trim() !== "";
      
      // Update users table
      const { data: userData, error: userError } = await supabase
        .from("users")
        .update({
          date_of_birth,
          phone_number: phone_number.replace(/[\s-]/g, ""),
          address: address ? sanitizeString(address, 500) : null,
        })
        .eq("id", req.user.userId)
        .select()
        .single();

      if (userError) {
        if (userError.code === "23505" || userError.message.includes("unique")) {
          return res.status(409).json({ error: "Phone number is already registered to another account." });
        }
        throw userError;
      }

      // Prepare doctor updates
      const doctorUpdates = {
        specialization: specialization ? sanitizeString(specialization, 100) : null,
        clinic_name: clinic_name ? sanitizeString(clinic_name, 150) : null,
        clinic_location: clinic_location ? sanitizeString(clinic_location, 300) : null,
      };

      // Only allow setting license_number if it is not already set in the DB
      if (!isLicenseAlreadySet && license_number && license_number.trim() !== "") {
        doctorUpdates.license_number = license_number.trim();
      }

      // Update doctors table
      const { data: doctorData, error: doctorError } = await supabase
        .from("doctors")
        .update(doctorUpdates)
        .eq("id", req.user.userId)
        .select()
        .single();

      if (doctorError) {
        return res.status(500).json({ error: `Failed to update professional details: ${doctorError.message}` });
      }

      // Return combined data
      const combinedUser = {
        id: userData.id,
        email: userData.email,
        full_name: userData.full_name,
        gender: userData.gender,
        phone_number: userData.phone_number,
        date_of_birth: userData.date_of_birth,
        address: userData.address,
        specialization: doctorData.specialization,
        clinic_name: doctorData.clinic_name,
        clinic_location: doctorData.clinic_location,
        license_number: doctorData.license_number,
      };

      return res.json({ success: true, user: combinedUser });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = doctorController;
