const getSupabaseClient = require("../config/supabaseClient");

const Patient = {
  upsertProfile: async (userId) => {
    const { data, error } = await getSupabaseClient()
      .from("patients")
      .upsert({ id: userId }, { onConflict: "id" })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  createRecord: async (table, userId, record) => {
    const { data, error } = await getSupabaseClient()
      .from(table)
      .insert({ ...record, patient_id: userId })
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

module.exports = Patient;
