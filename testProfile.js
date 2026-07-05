const fs = require("fs");
const { formatPlayerProfile, getPlayerProfile } = require("./services/profileEngine");

const profiles = JSON.parse(fs.readFileSync("./data/r6_profiles.json", "utf8"));

const discordId = "330551605827207169";
const profile = profiles[discordId];

console.log("===== FORMATTED PROFILE =====");
console.log(formatPlayerProfile(profile));

console.log("\n===== RAW PROFILE OBJECT =====");
console.log(JSON.stringify(getPlayerProfile(profile), null, 2));