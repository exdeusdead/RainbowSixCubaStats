function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function avg(numbers) {
  const valid = numbers.filter(n => typeof n === "number" && Number.isFinite(n));
  if (!valid.length) return null;
  return Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2));
}

function getOverview(profile) {
  return safeObject(profile?.snapshots?.overview?.parsed || profile?.parsedStats);
}

function getOperators(profile) {
  return safeArray(profile?.snapshots?.operators?.parsed);
}

function getMaps(profile) {
  return safeArray(profile?.snapshots?.maps?.parsed);
}

function getMatches(profile) {
  return safeArray(profile?.snapshots?.matches?.parsed);
}

function getTopOperators(profile, limit = 5) {
  return getOperators(profile)
    .filter(op => op.rounds >= 20)
    .sort((a, b) => b.rounds - a.rounds)
    .slice(0, limit);
}

function getBestOperators(profile, limit = 5) {
  return getOperators(profile)
    .filter(op => op.rounds >= 20)
    .sort((a, b) => {
      const aScore = (a.kd || 0) * 40 + (a.winRate || 0) + Math.min(a.rounds || 0, 200) / 10;
      const bScore = (b.kd || 0) * 40 + (b.winRate || 0) + Math.min(b.rounds || 0, 200) / 10;
      return bScore - aScore;
    })
    .slice(0, limit);
}

function getBestMaps(profile, limit = 5) {
  return getMaps(profile)
    .filter(map => map.matches >= 10)
    .sort((a, b) => {
      const aScore = (a.winRate || 0) + (a.kd || 0) * 20 + Math.min(a.matches || 0, 50) / 5;
      const bScore = (b.winRate || 0) + (b.kd || 0) * 20 + Math.min(b.matches || 0, 50) / 5;
      return bScore - aScore;
    })
    .slice(0, limit);
}

function getWorstMaps(profile, limit = 5) {
  return getMaps(profile)
    .filter(map => map.matches >= 10)
    .sort((a, b) => {
      const aScore = (a.winRate || 0) + (a.kd || 0) * 20;
      const bScore = (b.winRate || 0) + (b.kd || 0) * 20;
      return aScore - bScore;
    })
    .slice(0, limit);
}

function getRecentForm(profile, limit = 20) {
  const matches = getMatches(profile).slice(0, limit);

  const wins = matches.filter(m => {
    if (!m.score) return false;
    const [a, b] = m.score.split("-").map(Number);
    return a > b;
  }).length;

  const losses = matches.filter(m => {
    if (!m.score) return false;
    const [a, b] = m.score.split("-").map(Number);
    return a < b;
  }).length;

  const kills = matches.reduce((sum, m) => sum + (m.kills || 0), 0);
  const deaths = matches.reduce((sum, m) => sum + (m.deaths || 0), 0);
  const assists = matches.reduce((sum, m) => sum + (m.assists || 0), 0);
  const rpDelta = matches.reduce((sum, m) => sum + (m.rpDelta || 0), 0);

  return {
    matches: matches.length,
    wins,
    losses,
    winRate: matches.length ? Number(((wins / matches.length) * 100).toFixed(1)) : null,
    kills,
    deaths,
    assists,
    kd: deaths > 0 ? Number((kills / deaths).toFixed(2)) : kills || null,
    avgKills: matches.length ? Number((kills / matches.length).toFixed(2)) : null,
    avgDeaths: matches.length ? Number((deaths / matches.length).toFixed(2)) : null,
    avgHeadshotRate: avg(matches.map(m => m.headshotRate)),
    rpDelta
  };
}

function getPlayerProfile(profile) {
  const overview = getOverview(profile);

  return {
    discordId: profile.discordId,
    discordTag: profile.discordTag,
    ubisoftName: profile.ubisoftName,
    role: profile.role || null,
    region: profile.region || null,

    rank: {
      currentRank: overview.currentRank || profile.currentRank || null,
      currentRp: overview.currentRp || profile.currentRp || null,
      seasonKd: overview.seasonKd || profile.seasonKd || null,
      seasonWinRate: overview.seasonWinRate || profile.seasonWinRate || null,
      seasonRankedMatches: overview.seasonRankedMatches || profile.seasonRankedMatches || null,
      lifetimeLevel: overview.lifetimeLevel || profile.lifetimeLevel || null
    },

    recentForm: getRecentForm(profile, 20),
    topOperators: getTopOperators(profile, 5),
    bestOperators: getBestOperators(profile, 5),
    bestMaps: getBestMaps(profile, 5),
    worstMaps: getWorstMaps(profile, 5),

    metadata: {
      lastSyncedAt: profile.lastSyncedAt || null,
      snapshotsAvailable: Object.keys(profile.snapshots || {})
    }
  };
}

function formatPlayerProfile(profile) {
  const p = getPlayerProfile(profile);

  const topOps = p.topOperators.map(op =>
    `• ${op.name} — ${op.rounds} rounds | ${op.kd} KD | ${op.winRate}% WR`
  ).join("\n") || "No operator data.";

  const bestMaps = p.bestMaps.map(map =>
    `• ${map.map} — ${map.matches} matches | ${map.kd} KD | ${map.winRate}% WR`
  ).join("\n") || "No map data.";

  const recent = p.recentForm;

  return [
    `🎮 **${p.ubisoftName || p.discordTag || "Unknown Player"}**`,
    ``,
    `🏅 Rank: **${p.rank.currentRank || "N/A"}**`,
    `📈 RP: **${p.rank.currentRp || "N/A"}**`,
    `⚔️ Season KD: **${p.rank.seasonKd || "N/A"}**`,
    `🏆 Season WR: **${p.rank.seasonWinRate || "N/A"}%**`,
    `🎯 Ranked Matches: **${p.rank.seasonRankedMatches || "N/A"}**`,
    ``,
    `🔥 Recent Form`,
    `• ${recent.wins}W - ${recent.losses}L`,
    `• KD: ${recent.kd || "N/A"}`,
    `• RP Delta: ${recent.rpDelta}`,
    ``,
    `🧩 Main Operators`,
    topOps,
    ``,
    `🗺️ Best Maps`,
    bestMaps
  ].join("\n");
}

module.exports = {
  getOverview,
  getOperators,
  getMaps,
  getMatches,
  getTopOperators,
  getBestOperators,
  getBestMaps,
  getWorstMaps,
  getRecentForm,
  getPlayerProfile,
  formatPlayerProfile
};