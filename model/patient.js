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

  findByUserId: async (userId) => {
    const { data, error } = await getSupabaseClient()
      .from("patients")
      .select("*, users(*)")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  listRecords: async (table, userId) => {
    const { data, error } = await getSupabaseClient()
      .from(table)
      .select("*")
      .eq("patient_id", userId)
      .order("created_at", { ascending: false });

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
