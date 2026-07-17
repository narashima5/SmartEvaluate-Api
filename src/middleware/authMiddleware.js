const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET || "smart-evaluate-super-secret-key-2026";

const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access denied. No token provided." });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ error: "Invalid or expired token." });
      }

      try {
        const user = await User.findById(decoded.userId).populate("school");
        if (!user) {
          return res.status(404).json({ error: "User not found." });
        }

        // Enforce admin approval. Allow unapproved users to hit /me to fetch their status.
        if (!user.isApproved && req.path !== "/me" && req.path !== "/auth/me") {
          return res.status(403).json({ error: "Your account is pending admin approval." });
        }

        req.user = user;
        next();
      } catch (callbackErr) {
        console.error("Auth Middleware Callback Error:", callbackErr);
        res.status(500).json({ error: "Internal authentication callback error" });
      }
    });
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ error: "Internal authentication error" });
  }
};

module.exports = authenticateToken;
