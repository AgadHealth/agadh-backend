const fs = require("fs");
const path = require("path");

const appDir = "c:\\Users\\KIIT\\Desktop\\agad\\agad-health-app";

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

const functionsToCheck = ["verifyPhoneCode", "resendPhoneCode", "requestPhoneVerification"];

functionsToCheck.forEach(fn => {
  const usages = [];
  allFiles.forEach(filePath => {
    if (filePath.endsWith(".jsx") || filePath.endsWith(".js") || filePath.endsWith(".tsx")) {
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes(fn)) {
        usages.push(path.relative(appDir, filePath));
      }
    }
  });
  console.log(`Usages of ${fn}:`, usages);
});
