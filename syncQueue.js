const fs = require("fs");
const path = require("path");

const { createProvider } = require("../CGP/platform/providers");
const { getPlatform } = require("./cgp/platform");

const DATA_FILE = path.join(__dirname, "data", "r6_profiles.json");

function loadProfiles() {
  if (!fs.existsSync(DATA_FILE)) return {};
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "{}");
}

function saveProfiles(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getSyncBatch(requestingDiscordId, limit = 20) {
  const profiles = loadProfiles();
  const now = Date.now();

  const list = Object.values(profiles)
    .filter(p => p.ubisoftName || p.ubisoftName)
    .sort((a, b) => {
      const aTime = new Date(a.lastSyncedAt || a.lastSuccessfulSync || 0).getTime();
      const bTime = new Date(b.lastSyncedAt || b.lastSuccessfulSync || 0).getTime();
      return aTime - bTime;
    });

  const own = profiles[requestingDiscordId] ? [profiles[requestingDiscordId]] : [];

  const others = list
    .filter(p => p.discordId !== requestingDiscordId)
    .slice(0, limit);

  const batch = [...own, ...others];

  for (const p of batch) {
    profiles[p.discordId].lastAssignedAt = new Date(now).toISOString();
    profiles[p.discordId].leaseExpiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    profiles[p.discordId].assignedTo = requestingDiscordId;
  }

  saveProfiles(profiles);
  return batch;
}

async function parseSection(section, rawText) {
  const provider = createProvider("r6tracker");

  switch (section) {
    case "overview":
      return (await provider.fetchOverview("unknown", rawText)).overview;

    case "operators":
      return (await provider.fetchOperators("unknown", rawText)).operators;

    case "maps":
      return (await provider.fetchMaps("unknown", rawText)).maps;

    case "matches":
      return (await provider.fetchMatches("unknown", rawText)).matches;

    case "seasons":
      return (await provider.fetchSeasons("unknown", rawText)).seasons;

    default:
      return null;
  }
}

async function saveSnapshot(discordId, stats) {
  const profiles = loadProfiles();

  if (!profiles[discordId]) return false;

  const section = stats.section || "overview";
  const previousSnapshots = profiles[discordId].snapshots || {};
  const parsedSection = await parseSection(section, stats.rawText);

  profiles[discordId] = {
    ...profiles[discordId],

    snapshots: {
      ...previousSnapshots,
      [section]: {
        trackerUrl: stats.trackerUrl,
        capturedAt: stats.capturedAt,
        rawText: stats.rawText,
        parsed: parsedSection
      }
    },

    lastSyncedAt: new Date().toISOString(),
    syncStatus: "active",
    failures: 0,
    assignedTo: null,
    leaseExpiresAt: null
  };

  if (section === "overview" && parsedSection) {
    profiles[discordId] = {
      ...profiles[discordId],
      ubisoftName: stats.ubisoftName || profiles[discordId].ubisoftName,
      trackerUrl: stats.trackerUrl,
      capturedAt: stats.capturedAt,
      rawText: stats.rawText,
      parsedStats: parsedSection,
      currentRank: parsedSection.currentRank,
      currentRp: parsedSection.currentRp,
      seasonKd: parsedSection.seasonKd,
      seasonWinRate: parsedSection.seasonWinRate,
      seasonRankedMatches: parsedSection.seasonRankedMatches,
      lifetimeLevel: parsedSection.lifetimeLevel
    };
  }

  try {
    const platform = await getPlatform();
    const statistics = platform.getService("statistics");

    if (statistics) {
      statistics.saveProfile({
        id: `stats-${discordId}`,
        playerId: discordId,
        provider: "r6tracker",
        providerPlayerId: profiles[discordId].ubisoftName || discordId,

        overview:
          profiles[discordId].snapshots?.overview?.parsed || null,

        operators:
          profiles[discordId].snapshots?.operators?.parsed || [],

        maps:
          profiles[discordId].snapshots?.maps?.parsed || [],

        matches:
          profiles[discordId].snapshots?.matches?.parsed || [],

        seasons:
          profiles[discordId].snapshots?.seasons?.parsed || [],

        syncedAt: new Date().toISOString()
      });
    }

  } catch (err) {
    console.error("[CGP Statistics Sync Failed]", err.message);
  }

  saveProfiles(profiles);
  return true;
}

module.exports = {
  loadProfiles,
  saveProfiles,
  getSyncBatch,
  saveSnapshot
};