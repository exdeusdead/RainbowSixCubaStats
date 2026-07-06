const fs = require("fs");
const path = require("path");

const profilesFile = path.join(__dirname, "..", "data", "r6_profiles.json");

const profiles = JSON.parse(fs.readFileSync(profilesFile, "utf8"));

const now = new Date().toISOString();

let migrated = 0;

for (const [discordId, profile] of Object.entries(profiles)) {
  if (!profile) continue;

  const username =
    profile.discordTag ||
    profile.ubisoftName ||
    discordId;

  const safeUsername = String(username)
    .toLowerCase()
    .replace(/#[0-9]+$/, "")
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  profile.userId =
    profile.userId ||
    (safeUsername ? `user-${safeUsername}` : `user-discord-${discordId}`);

  profile.providers = {
    ...(profile.providers || {}),
    discord: {
      id: profile.discordId || discordId,
      username: profile.discordTag || null
    },
    ubisoft: {
      username: profile.ubisoftName || null,
      platform: profile.platform || "ubi",
      trackerUrl: profile.trackerUrl || null
    }
  };

  profile.migrations = {
    ...(profile.migrations || {}),
    M035_CGP_USER_ID: {
      migratedAt: now,
      previousPrimaryKey: discordId
    }
  };

  migrated++;
}

fs.writeFileSync(profilesFile, JSON.stringify(profiles, null, 2));

console.log(`M-035 migration complete. Profiles migrated: ${migrated}`);
