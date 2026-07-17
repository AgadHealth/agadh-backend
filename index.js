require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const patientRoutes = require("./Routes/patientRouter");
const doctorRoutes = require("./Routes/doctorRouter");
const userRoutes = require("./Routes/userRouter");
const accessRoutes = require("./Routes/accessRouter");
const uploadRoutes = require("./Routes/uploadRouter");
const viewRoutes = require("./Routes/viewRouter");
const filesRoutes = require("./Routes/filesRouter");
const patientsRoutes = require("./Routes/patientsRouter");
const vitalsRoutes = require("./Routes/vitalsRouter");
const authRoutes = require("./Routes/authRouter");
const consentRoutes = require("./Routes/consentRouter");

const app = express();
const PORT = process.env.PORT || 5000;
const allowedOrigins = (process.env.FRONTEND_URLS || '')
  .split(',')
  .map(url => url.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  throw new Error('FRONTEND_URLS is not configured. Refusing to start with open CORS.');
}

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/user", userRoutes);
app.use("/api/access", accessRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/view",   viewRoutes);
app.use("/api/files",  filesRoutes);
app.use("/api/patients", patientsRoutes);
app.use("/api/vitals", vitalsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/consent", consentRoutes);

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
