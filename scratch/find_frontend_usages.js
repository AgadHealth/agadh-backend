const fs = require("fs");
const path = require("path");

const appDir = "c:\\Users\\KIIT\\Desktop\\agad\\agad-health-app";

// All files in app directory
function getFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".expo" && file !== ".git") {
        getFiles(fullPath, fileList);
      }
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = getFiles(appDir);
console.log(`Found ${allFiles.length} files in total.`);

// We want to find references to screen basenames (excluding style files)
const screens = [
  "AppointmentDetailsScreen",
  "BookConsultationScreen",
  "ConfirmationScreen",
  "PaymentScreen",
  "PatientDashboard",
  "QRAccessandSession",
  "RecordsScreen",
  "VitalsScreen",
  "DoctorDashboard",
  "DoctorOnboarding",
  "PatientRecordsScreen",
  "QRScannerScreen",
  "UploadPatientFileScreen",
  "CreatePassword",
  "EmailOTP",
  "HomeScreen",
  "LoginScreen",
  "PhoneOTP",
  "RegisterScreen",
  "RoleSelectScreen",
  "SplashScreen"
];

const references = {};
screens.forEach(s => references[s] = []);

allFiles.forEach(filePath => {
  if (filePath.endsWith(".jsx") || filePath.endsWith(".js") || filePath.endsWith(".tsx")) {
    const content = fs.readFileSync(filePath, "utf8");
    const relative = path.relative(appDir, filePath);
    screens.forEach(s => {
      // Avoid matching self
      const base = path.basename(filePath, path.extname(filePath));
      if (base === s) return;
      
      if (content.includes(s)) {
        references[s].push(relative);
      }
    });
  }
});

console.log("\n--- SCREEN REFERENCES ---");
Object.entries(references).forEach(([screen, refs]) => {
  console.log(`${screen}: ${refs.length} references [${refs.join(", ")}]`);
});
