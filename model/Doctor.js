const getSupabaseClient = require("../config/supabaseClient");

const Doctor = {
  upsertProfile: async (userId, doctor) => {
    const { data, error } = await getSupabaseClient()
      .from("doctors")
      .upsert(
        {
          id: userId,
          medical_degree: doctor.medicalDegree,
          specialization: doctor.specialization,
          years_of_experience: Number(doctor.yearsOfExperience),
          clinic_name: doctor.clinicName,
          clinic_location: doctor.clinicLocation,
        },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  findByUserId: async (userId) => {
    const { data, error } = await getSupabaseClient()
      .from("doctors")
      .select("*, users(*)")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },
};

module.exports = Doctor;
