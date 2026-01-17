const mongoose = require("mongoose");

const patientSchema = new mongoose.Schema({
  FirstName: { type: String, required: true },
  LastName: { type: String, required: true },
  Email: { type: String, required: true },
  PhoneNumber: { type: String, required: true },
  DOB: { type: Date, required: true }, 
  Address: { type: String, required: true },
  user: { type: String, default: "patient" },

  vitals: {
    blood_pressure: {
      systolic: { type: Number },
      diastolic: { type: Number },
      date: { type: Date, default: Date.now }
    },

    blood_sugar: {
      level: { type: Number },
      date: { type: Date, default: Date.now }
    },

    weight: {
      value: { type: Number },
      date: { type: Date, default: Date.now }
    }
  },
  uploadFiles: [
    {
      filename: { type: String },
    },
  ],
});

module.exports = mongoose.model("Patient", patientSchema);
