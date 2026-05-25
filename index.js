const express = require("express");
const cors = require("cors");
const patientRoutes = require("./Routes/patientRouter");
const doctorRoutes = require("./Routes/doctorRouter");
const userRoutes = require("./Routes/userRouter");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const frontendUrls = process.env.FRONTEND_URLS
  ? process.env.FRONTEND_URLS.split(",").map((url) => url.trim())
  : null;

app.set("trust proxy", 1);
app.use(cors({ origin: frontendUrls || true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/user", userRoutes);

app.get("/", (req, res) => {
  res.send("backend is live");
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error("Unhandled request error:", err.message);
  res.status(500).json({ error: "Unexpected server error." });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
