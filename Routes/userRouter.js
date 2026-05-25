const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const userController = require("../controller/userController");

const router = express.Router();

router.use(requireAuth);
router.get("/me", userController.me);
router.put("/profile", userController.upsertProfile);
router.post("/profile", userController.upsertProfile);

module.exports = router;
