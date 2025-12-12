// run-sync-and-patch.js
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

try {
  execSync("tsc && vite build", { stdio: "inherit", cwd: process.cwd() });
  execSync("npx cap sync", { stdio: "inherit", cwd: process.cwd() });
  execSync("npx cap sync electron", { stdio: "inherit", cwd: process.cwd() });

  const filePath = path.join(
    process.cwd(),
    "electron/src/rt/electron-plugins.js"
  );

  let content = fs.readFileSync(filePath, "utf8");

  // only replace the plugin entry, nothing else
  const regex = /\bCapacitorCommunitySqlite,\s*/;
  const replacement =
    "CapacitorCommunitySqlite: CapacitorCommunitySqlite.default,\n";

  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(filePath, content, "utf8");
    console.log("Updated CapacitorCommunitySqlite export.");
  } else {
    console.log("Already patched or entry not found.");
  }
} catch (err) {
  console.error("Error:", err);
}
