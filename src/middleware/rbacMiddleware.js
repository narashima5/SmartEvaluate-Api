// Middleware to restrict access based on roles
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized. Authentication required." });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden. Access denied for role: ${req.user.role}`,
      });
    }

    next();
  };
};

module.exports = authorizeRoles;
