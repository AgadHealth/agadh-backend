const getSupabaseClient = require("../config/supabaseClient");

/**
 * Lightweight auth middleware: verifies the JWT with Supabase Auth and attaches
 * `req.authUser`. Does NOT require a row in the `users` table yet — use this
 * for routes that create/upsert that row (e.g. the profile upsert endpoint).
 */
const requireJwt = async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const supabase = getSupabaseClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({ error: "Invalid or expired session." });
    }

    req.authUser = authData.user;
    req.accessToken = token;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Unable to verify authentication." });
  }
};

module.exports = requireJwt;
