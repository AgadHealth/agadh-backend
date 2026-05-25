const getSupabaseClient = require("../config/supabaseClient");

const normalizeRole = (role) =>
  role === "doctor" || role === "patient" ? role : null;

const userController = {
  upsertProfile: async (req, res) => {
    const { fullName, phoneNumber, dateOfBirth, gender, role } = req.body;
    const userRole = normalizeRole(role);

    if (!fullName || !phoneNumber || !dateOfBirth || !gender || !userRole) {
      return res.status(400).json({ error: "Complete profile information is required." });
    }

    try {
      const supabase = getSupabaseClient();
      const { data: existing, error: lookupError } = await supabase
        .from("users")
        .select("role")
        .eq("id", req.authUser.id)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (existing && existing.role !== userRole) {
        return res.status(409).json({ error: "Account role cannot be changed after registration." });
      }

      const { data, error } = await supabase
        .from("users")
        .upsert(
          {
            id: req.authUser.id,
            email: req.authUser.email,
            phone_number: phoneNumber,
            full_name: fullName,
            date_of_birth: dateOfBirth,
            gender: gender.toLowerCase(),
            role: userRole,
            email_verified: Boolean(req.authUser.email_confirmed_at),
            phone_verified: Boolean(req.authUser.phone_confirmed_at),
          },
          { onConflict: "id" }
        )
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, user: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },

  me: async (req, res) => {
    try {
      const { data, error } = await getSupabaseClient()
        .from("users")
        .select("*, patients(*), doctors(*)")
        .eq("id", req.authUser.id)
        .maybeSingle();

      if (error) throw error;
      return res.json({ success: true, user: data });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  },
};

module.exports = userController;
