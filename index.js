const express = require("express");
const cors = require("cors");
const patientRoutes = require("./Routes/patientRouter");
const doctorRoutes = require("./Routes/doctorRouter");
const userRoutes = require("./Routes/userRouter");
const connectToMongoDB = require("./config/connectToMongoDB");
require("dotenv").config(); // Load environment variables from .env file

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectToMongoDB();

// Middleware
app.use(cors()
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req, res) => {
  res.send("backend is live");
});

// Start server only if this file is run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

