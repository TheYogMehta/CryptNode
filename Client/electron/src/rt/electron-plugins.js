const path = require("path");

const pluginRelativePath = path.posix.join(
  "..",
  "..",
  "..",
  "node_modules",
  "@capacitor-community",
  "sqlite",
  "electron",
  "dist",
  "plugin.js",
);

const CapacitorCommunitySqlite = require(pluginRelativePath);

module.exports = {
  CapacitorCommunitySqlite: CapacitorCommunitySqlite.default,
};
