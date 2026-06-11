const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const requireJwt = require("../middleware/requireJwt");
const userController = require("../controller/userController");

const router = express.Router();

// /me requires a fully-formed profile row in the users table
router.get("/me", requireAuth, userController.me);

// Profile upsert: only validate the JWT — the users row doesn't exist yet
// for brand-new registrations, so we must NOT use requireAuth here.
router.put("/profile", requireJwt, userController.upsertProfile);

module.exports = router;
