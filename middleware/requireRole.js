/**
 * requireRole(role)
 * Usage: router.use(requireRole('patient')) or requireRole('doctor')
 * Must be placed AFTER requireAuth so req.user.role is already set.
 */
const requireRole = (role) => (req, res, next) => {
  if (!req.user || req.user.role !== role) {
    return res.status(403).json({
      error: `Access denied. This route requires the '${role}' role.`,
    });
  }
  return next();
};

module.exports = requireRole;
