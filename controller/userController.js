const Patient = require("../model/patient");
const Doctor = require("../model/Doctor");

const userController = {
  login: async (req, res) => {
    try {
      const { PhoneNumber } = req.body;
      let user = await Patient.findOne({ PhoneNumber });

      if (!user) {
        user = await Doctor.findOne({ PhoneNumber });
      }
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      } else {
        res.json({
          success: true,
          message: "Login successful.",
          user,
        });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};


module.exports = userController;