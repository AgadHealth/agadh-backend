const mongoose = require("mongoose");

const doctorSchema = new mongoose.Schema({
  FirstName: { type: String, required: true },
  LastName: { type: String, required: true },
  Email: { type: String, required: true },
  PhoneNumber: { type: String, required: true },
  DOB: { type: Date, required: true }, 
  Address: { type: String, required: true },
  user: { type: String, default: "Doctor" },
  hospitalAffiliation: { type: String, required: true },
  specialization: { type: String, required: true },
  practiceType: { type: String, required: true  }
});


module.exports = mongoose.model("Doctor", doctorSchema);