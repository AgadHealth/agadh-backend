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

const utils = [
  "utils/api",
  "utils/fileUpload",
  "utils/generateQR",
  "utils/sessionTimer",
  "utils/validator"
];

utils.forEach(u => {
  const usages = [];
  const base = path.basename(u);
  allFiles.forEach(filePath => {
    // Skip checking the file itself
    if (filePath.includes(u)) return;
    
    if (filePath.endsWith(".jsx") || filePath.endsWith(".js") || filePath.endsWith(".tsx")) {
      const content = fs.readFileSync(filePath, "utf8");
      // Search for import ... from "path/to/util" or require(...)
      const regex = new RegExp(`from ["'].*${base}["']`, "i");
      if (regex.test(content) || content.includes(`require(`) && content.includes(base)) {
        usages.push(path.relative(appDir, filePath));
      }
    }
  });
  console.log(`Usages of ${u}:`, usages);
});
