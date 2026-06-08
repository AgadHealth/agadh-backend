const getSupabaseClient = require("../config/supabaseClient");

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    req.authUser = data.user;
    req.user = data.user;
    req.accessToken = token;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Unable to verify authentication." });
  }
};

module.exports = requireAuth;
