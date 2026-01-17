const express = require("express");
const router = express.Router();
const usercontroller = require("../controller/userController");



router.post("/login", usercontroller.login);

module.exports = router;
