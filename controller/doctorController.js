const Doctor = require("../model/Doctor");

const doctorController = { 
  registerDoctor: async (req, res) => {
    try {
      const {
        FirstName,
        LastName,
        Email,
        PhoneNumber,
        DOB,
        Address,
        hospitalAffiliation,
        practiceType
      } = req.body;

      const newDoctor = new Doctor({
        FirstName,
        LastName,
        Email,
        PhoneNumber,
        DOB,
        Address,
        hospitalAffiliation,
        practiceType
      });

      await newDoctor.save();

      res.json({
        success: true,
        message: "Doctor registered successfully.",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
};

module.exports = doctorController;