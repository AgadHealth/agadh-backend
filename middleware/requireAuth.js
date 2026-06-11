const getSupabaseClient = require("../config/supabaseClient");

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const supabase = getSupabaseClient();

    // Step 1: Verify JWT with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    // Step 2: Fetch role from the users table
    const { data: userRow, error: dbError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (dbError) {
      return res.status(500).json({ error: "Unable to verify authentication." });
    }

    // Step 3: 403 if the user has no profile in the users table yet
    if (!userRow) {
      return res.status(403).json({ error: "User profile not found." });
    }

    // Step 4: Attach clean { userId, role } — plus keep authUser for existing controllers
    req.user = { ...authData.user, userId: userRow.id, role: userRow.role };
    req.authUser = authData.user;
    req.accessToken = token;

    return next();
  } catch (error) {
    return res.status(500).json({ error: "Unable to verify authentication." });
  }
};

module.exports = requireAuth;
