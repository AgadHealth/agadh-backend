require("dotenv").config(); // Add this line at the top

const mongoose = require("mongoose");
const process = require("process");
const MONGO_URI = process.env.MONGO_URI;

const connectToMongoDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables.");
    }
    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected!!");
  } catch (error) {
    console.log("Failed to connect to MongoDB", error);
  }
};

module.exports = connectToMongoDB;
