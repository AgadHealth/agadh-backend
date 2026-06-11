const fs = require("fs");
const path = require("path");

const backendDir = path.resolve(__dirname, "..");

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== "node_modules" && file !== ".git" && file !== "scratch") {
        scanDir(fullPath);
      }
    } else if (file.endsWith(".js")) {
      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        if (line.includes("console.log")) {
          console.log(`${path.relative(backendDir, fullPath)}:${idx + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

console.log("Scanning backend for console.log statements...");
scanDir(backendDir);
