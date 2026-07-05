const path = require("path");

const platform = require(
  path.join(process.env.HOME, "CGP/platform/core/platformCore")
);

let initialized = false;

async function getPlatform() {
  if (!initialized) {
    await platform.initialize({ logger: console, runtime: "stats" });
    initialized = true;
  }

  return platform;
}

module.exports = {
  getPlatform
};
