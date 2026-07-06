/**
 * RainbowSixCubaStats Bot | v1.0.0 Extension/API Stats Worker
 *
 * Separate bot/service for Rainbow Six CUBA competitive stats.
 * This version is designed to stay separate from the main community bot.
 *
 * Main idea:
 *   Chrome Extension / Browser capture -> this API -> local JSON data -> Discord commands/panels/roles
 *
 * Install:
 *   npm install discord.js dotenv express cors
 *
 * .env required:
 *   STATS_BOT_TOKEN=your_stats_bot_token
 *   GUILD_ID=your_discord_server_id
 *
 * Optional:
 *   STATS_API_PORT=3007
 *   STATS_API_KEY=change_me
 *   CONNECT_CHANNEL_NAME=🔗・conectar-ubisoft
 *   STATS_CHANNEL_NAME=📈・r6-stats
 *   RANKINGS_CHANNEL_NAME=🏅・tabla-de-rangos
 *   OPERATOR_TOP_CHANNEL_NAME=🎯・top-operadores
 *   COMPETITIVE_DATA_CHANNEL_NAME=📊・datos-competitivos
 *   PRESTIGE_DATA_CHANNEL_NAME=🎉・datos-de-prestigio
 *   MIN_OPERATOR_ROUNDS=20
 *   MIN_MAP_MATCHES=20
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { requireCgpUser } = require("./services/cgpAuth");

const {
  getMembership,
  createMembership,
  updateMembership
} = require("./services/r6Membership");

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags
} = require("discord.js");

const BOT_VERSION = "v1.0.0-extension-api";
const DATA_DIR = path.join(__dirname, "data");
const LOG_DIR = path.join(__dirname, "logs", "r6stats");
const SNAPSHOT_DIR = path.join(LOG_DIR, "snapshots");
const R6_PROFILES_FILE = path.join(DATA_DIR, "r6_profiles.json");
const R6_LEADERBOARDS_FILE = path.join(DATA_DIR, "r6_leaderboards.json");
const PENDING_SYNCS_FILE = path.join(DATA_DIR, "pending_syncs.json");

const TOKEN = process.env.STATS_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const API_PORT = Number(process.env.STATS_API_PORT || 3007);
const API_KEY = process.env.STATS_API_KEY || "";

const CONNECT_CHANNEL_NAME = process.env.CONNECT_CHANNEL_NAME || "🔗・conectar-ubisoft";
const STATS_CHANNEL_NAME = process.env.STATS_CHANNEL_NAME || "📈・r6-stats";
const RANKINGS_CHANNEL_NAME = process.env.RANKINGS_CHANNEL_NAME || "🏅・tabla-de-rangos";
const OPERATOR_TOP_CHANNEL_NAME = process.env.OPERATOR_TOP_CHANNEL_NAME || "🎯・top-operadores";
const COMPETITIVE_DATA_CHANNEL_NAME = process.env.COMPETITIVE_DATA_CHANNEL_NAME || "📊・datos-competitivos";
const PRESTIGE_DATA_CHANNEL_NAME = process.env.PRESTIGE_DATA_CHANNEL_NAME || "🎉・datos-de-prestigio";

const MIN_OPERATOR_ROUNDS = Number(process.env.MIN_OPERATOR_ROUNDS || 20);
const MIN_MAP_MATCHES = Number(process.env.MIN_MAP_MATCHES || 20);

if (!TOKEN) {
  console.error("Missing STATS_BOT_TOKEN in .env");
  process.exit(1);
}

for (const dir of [DATA_DIR, LOG_DIR, SNAPSHOT_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
if (!fs.existsSync(R6_PROFILES_FILE)) fs.writeFileSync(R6_PROFILES_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(R6_LEADERBOARDS_FILE)) fs.writeFileSync(R6_LEADERBOARDS_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(PENDING_SYNCS_FILE)) fs.writeFileSync(PENDING_SYNCS_FILE, JSON.stringify({}, null, 2));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const PROFILE_STATUS = {
  ACTIVE: "ACTIVE",
  STALE: "STALE",
  DISABLED: "DISABLED"
};

const RANK_ROLES = [
  "Champion",
  "Diamond",
  "Emerald",
  "Platinum",
  "Gold",
  "Silver",
  "Bronze",
  "Copper",
  "Unranked"
];

const RANK_ORDER = {
  CHAMPION: 8,
  DIAMOND: 7,
  EMERALD: 6,
  PLATINUM: 5,
  GOLD: 4,
  SILVER: 3,
  BRONZE: 2,
  COPPER: 1,
  UNRANKED: 0
};

const SYNC_ROLES = {
  PENDING: "Pendiente Ubisoft Sync",
  VERIFIED: "Ubisoft Verified User"
};

const EXTENSION_LINKS = {
  chromium: process.env.EXTENSION_CHROMIUM_URL || "https://discord.com/channels/@me",
  edge: process.env.EXTENSION_EDGE_URL || "https://discord.com/channels/@me",
  firefox: process.env.EXTENSION_FIREFOX_URL || "https://discord.com/channels/@me"
};

const TRACKER_SECTIONS = ["overview", "matches", "seasons", "operators", "maps"];

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, "r6stats.log"), line + "\n", "utf8");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function round2(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function percentText(value) {
  return value === null || value === undefined ? "N/A" : `${value}%`;
}

function loadJson(file) {
  try {
    const content = fs.readFileSync(file, "utf8").trim();
    return content ? JSON.parse(content) : {};
  } catch (error) {
    log(`JSON load failed | File=${file} | ${error.message}`);
    return {};
  }
}

function saveJson(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function safeFileName(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 90);
}

function saveRawSnapshot(discordId, section, rawText) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(SNAPSHOT_DIR, `${safeFileName(discordId)}_${safeFileName(section)}_${stamp}.txt`);
  fs.writeFileSync(file, String(rawText || ""), "utf8");
  return file;
}

function extractUbisoftNameFromUrl(url) {
  const match = String(url || "").match(/\/profile\/[^/]+\/([^/?#]+)/i);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function buildTrackerUrl(ubisoftName, platform = "ubi", section = "overview") {
  const base = `https://r6.tracker.network/r6siege/profile/${platform}/${encodeURIComponent(ubisoftName)}`;
  if (section === "overview") return `${base}/overview`;
  if (section === "matches") return `${base}/matches`;
  return `${base}/${section}?gamemode=pvp_ranked`;
}

function buildTrackerBaseUrl(ubisoftName, platform = "ubi") {
  return `https://r6.tracker.network/r6siege/profile/${platform}/${encodeURIComponent(ubisoftName)}`;
}

function buildExtensionSyncUrl(discordId, ubisoftName, platform = "ubi") {
  const url = new URL(`${buildTrackerBaseUrl(ubisoftName, platform)}/overview`);
  url.searchParams.set("r6cubaSync", String(discordId));
  return url.toString();
}

function isValidOverviewRawText(rawText, expectedUbisoftName) {
  const text = String(rawText || "");
  const normalizedText = normalize(text);
  const expected = normalize(expectedUbisoftName || "");

  if (text.length < 500) return false;
  if (expected && !normalizedText.includes(expected)) return false;

  return /LIFETIME OVERALL/i.test(text) ||
    /CURRENT SEASON/i.test(text) ||
    /Y\d+S\d+ OVERVIEW/i.test(text);
}

function markPendingSync(discordId, ubisoftName, requestedByTag = null) {
  const pending = loadJson(PENDING_SYNCS_FILE);
  pending[String(discordId)] = {
    discordId: String(discordId),
    ubisoftName,
    trackerUrl: buildTrackerUrl(ubisoftName, "ubi", "overview"),
    syncUrl: buildExtensionSyncUrl(discordId, ubisoftName, "ubi"),
    status: "PENDING",
    requestedByTag,
    requestedAt: new Date().toISOString(),
    completedAt: null,
    lastError: null
  };
  saveJson(PENDING_SYNCS_FILE, pending);
  return pending[String(discordId)];
}

function completePendingSync(discordId, ok = true, error = null) {
  const pending = loadJson(PENDING_SYNCS_FILE);
  if (!pending[String(discordId)]) return;
  pending[String(discordId)].status = ok ? "COMPLETED" : "FAILED";
  pending[String(discordId)].completedAt = new Date().toISOString();
  pending[String(discordId)].lastError = error || null;
  saveJson(PENDING_SYNCS_FILE, pending);
}

function syncLinkRow(syncUrl) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Abrir R6 Tracker y sincronizar")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Link)
      .setURL(syncUrl)
  );
}

function splitLines(rawText) {
  return String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);
}

function findValueAfter(lines, label, start = 0, maxLookahead = 4) {
  const target = normalize(label);
  for (let i = start; i < lines.length; i++) {
    if (normalize(lines[i]) === target) {
      for (let j = i + 1; j <= Math.min(i + maxLookahead, lines.length - 1); j++) {
        if (lines[j] !== "") return lines[j];
      }
    }
  }
  return null;
}

function normalizeRankName(rank) {
  const text = String(rank || "").toUpperCase();
  if (text.includes("CHAMPION")) return "CHAMPION";
  if (text.includes("DIAMOND")) return "DIAMOND";
  if (text.includes("EMERALD")) return "EMERALD";
  if (text.includes("PLATINUM")) return "PLATINUM";
  if (text.includes("GOLD")) return "GOLD";
  if (text.includes("SILVER")) return "SILVER";
  if (text.includes("BRONZE")) return "BRONZE";
  if (text.includes("COPPER")) return "COPPER";
  return "UNRANKED";
}

function rankRoleName(rank) {
  const normalized = normalizeRankName(rank);
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function getRankSortValue(rank) {
  return RANK_ORDER[normalizeRankName(rank)] ?? 0;
}

function parseOverview(rawText) {
  const lines = splitLines(rawText);
  const joined = lines.join("\n");

  const rankMatch = joined.match(/All Seasons\nY\d+S\d+\nCURRENT SEASON\n([A-Z ]+ [IVX]+)\n([\d,]+)\nRP/i);
  const seasonOverviewMatch = joined.match(
    /Y\d+S\d+ OVERVIEW[\s\S]*?Ranked\n([\d,]+)[\s\S]*?([A-Z ]+ [IVX]+)\n([\d,]+)RP[\s\S]*?K\/D\n([\d.]+)[\s\S]*?Win Rate\n([\d.]+%)[\s\S]*?Matches\n([\d,]+)/i
  );
  const lifetimeLevelMatch = joined.match(/LIFETIME OVERALL\nLevel\n([\d,]+)/i);
  const lifetimeOverallMatch = joined.match(
    /LIFETIME OVERALL[\s\S]*?Win %\n([\d.]+%)[\s\S]*?K\/D\n([\d.]+)[\s\S]*?Headshot %\n([\d.]+%)/i
  );
  const lifetimeRankedMatch = joined.match(
    /LIFETIME RANKED[\s\S]*?Matches\n([\d,]+)[\s\S]*?Win %\n([\d.]+%)[\s\S]*?K\/D\n([\d.]+)/i
  );

  return {
    currentRank: rankMatch?.[1] || seasonOverviewMatch?.[2] || null,
    currentRp: cleanNumber(rankMatch?.[2] || seasonOverviewMatch?.[3]),
    lifetimeLevel: cleanNumber(lifetimeLevelMatch?.[1]),
    lifetimeOverallWinRate: cleanNumber(lifetimeOverallMatch?.[1]),
    lifetimeOverallKd: cleanNumber(lifetimeOverallMatch?.[2]),
    lifetimeOverallHeadshotRate: cleanNumber(lifetimeOverallMatch?.[3]),
    lifetimeRankedMatches: cleanNumber(lifetimeRankedMatch?.[1]),
    lifetimeRankedWinRate: cleanNumber(lifetimeRankedMatch?.[2]),
    lifetimeRankedKd: cleanNumber(lifetimeRankedMatch?.[3]),
    seasonRankedMatches: cleanNumber(seasonOverviewMatch?.[1] || seasonOverviewMatch?.[6]),
    seasonKd: cleanNumber(seasonOverviewMatch?.[4]),
    seasonWinRate: cleanNumber(seasonOverviewMatch?.[5]),
    parsedAt: new Date().toISOString()
  };
}

function parseOperators(rawText) {
  const lines = splitLines(rawText);
  const start = lines.findIndex(x => normalize(x) === "operator");
  if (start < 0) return [];

  const operators = [];
  for (let i = start + 1; i < lines.length; i++) {
    const name = lines[i];
    if (!name || /^premium users/i.test(name) || /^202\d/i.test(name)) break;

    const rounds = cleanNumber(lines[i + 1]);
    const winRate = cleanNumber(lines[i + 2]);
    const kd = cleanNumber(lines[i + 3]);
    const headshotRate = cleanNumber(lines[i + 4]);
    const wins = cleanNumber(lines[i + 5]);
    const losses = cleanNumber(lines[i + 6]);
    const kills = cleanNumber(lines[i + 7]);
    const deaths = cleanNumber(lines[i + 8]);
    const assists = cleanNumber(lines[i + 9]);
    const aces = cleanNumber(lines[i + 10]);
    const teamKills = cleanNumber(lines[i + 11]);

    if (rounds === null || winRate === null || kd === null) continue;

    operators.push({
      name,
      rounds,
      winRate,
      kd,
      headshotRate,
      wins,
      losses,
      kills,
      deaths,
      assists,
      aces,
      teamKills
    });

    i += 11;
  }

  return operators;
}

function parseMaps(rawText) {
  const lines = splitLines(rawText);
  const start = lines.findIndex(x => normalize(x) === "map");
  if (start < 0) return [];

  const maps = [];
  for (let i = start + 1; i < lines.length; i++) {
    const map = lines[i];
    if (!map || /^premium users/i.test(map) || /^202\d/i.test(map)) break;

    const matches = cleanNumber(lines[i + 1]);
    const winRate = cleanNumber(lines[i + 2]);
    const wins = cleanNumber(lines[i + 3]);
    const losses = cleanNumber(lines[i + 4]);
    const kd = cleanNumber(lines[i + 5]);
    const attackWinRate = cleanNumber(lines[i + 6]);
    const defenseWinRate = cleanNumber(lines[i + 7]);
    const headshotRate = cleanNumber(lines[i + 8]);
    const esr = cleanNumber(lines[i + 9]);

    if (matches === null || winRate === null || kd === null) continue;

    maps.push({
      map,
      matches,
      winRate,
      wins,
      losses,
      kd,
      attackWinRate,
      defenseWinRate,
      headshotRate,
      esr
    });

    i += 9;
  }

  return maps;
}

function isSeasonName(text) {
  return /^Y\d+\s/.test(String(text || ""));
}

function parseSeasons(rawText) {
  const lines = splitLines(rawText);
  const seasons = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isSeasonName(lines[i])) continue;

    const season = {
      season: lines[i],
      latestRank: null,
      maxRank: null,
      kd: null,
      winRate: null,
      matches: null,
      wins: null,
      losses: null,
      avgKills: null,
      kills: null,
      deaths: null,
      abandons: null
    };

    const window = lines.slice(i + 1, i + 45);
    const numericValues = window.map(x => cleanNumber(x)).filter(x => x !== null);

    if (numericValues.length >= 10) {
      season.latestRank = numericValues[0];
      season.maxRank = numericValues[1];
      season.kd = numericValues[2];
      season.winRate = numericValues[3];
      season.matches = numericValues[4];
      season.wins = numericValues[5];
      season.losses = numericValues[6];
      season.avgKills = numericValues[7];
      season.kills = numericValues[8];
      season.deaths = numericValues[9];
      season.abandons = numericValues.length >= 11 ? numericValues[10] : null;
    }

    seasons.push(season);
  }

  return seasons;
}

function parseMatches(rawText) {
  const lines = splitLines(rawText);
  const matches = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/ago/i.test(line)) continue;

    const map = line.replace(/^\d+d ago/i, "").replace(/^\d+h ago/i, "").trim();
    if (!map) continue;

    let rp = null;
    let rpDelta = null;
    let kd = null;
    let kills = null;
    let deaths = null;
    let assists = null;
    let headshotRate = null;
    let score = null;
    let won = null;

    for (let j = i; j < Math.min(i + 35, lines.length); j++) {
      if (lines[j] === "Score" && lines[j + 1] && lines[j + 2] === ":" && lines[j + 3]) {
        score = `${lines[j + 1]}-${lines[j + 3]}`;
        const a = cleanNumber(lines[j + 1]);
        const b = cleanNumber(lines[j + 3]);
        if (a !== null && b !== null) won = a > b;
      }
      if (lines[j] === "RP") {
        rp = cleanNumber(lines[j + 1]);
        rpDelta = cleanNumber(lines[j + 2]);
      }
      if (lines[j] === "K/D") kd = cleanNumber(lines[j + 1]);
      if (lines[j] === "K/D/A") {
        kills = cleanNumber(lines[j + 1]);
        deaths = cleanNumber(lines[j + 2]);
        assists = cleanNumber(lines[j + 3]);
      }
      if (lines[j] === "HS %") headshotRate = cleanNumber(lines[j + 1]);
    }

    matches.push({ map, score, won, rp, rpDelta, kd, kills, deaths, assists, headshotRate });
  }

  return matches;
}

function parseSection(section, rawText) {
  if (section === "overview") return parseOverview(rawText);
  if (section === "operators") return parseOperators(rawText);
  if (section === "maps") return parseMaps(rawText);
  if (section === "seasons") return parseSeasons(rawText);
  if (section === "matches") return parseMatches(rawText);
  return null;
}

function summarizeRecentForm(matches, limit = 20) {
  const list = Array.isArray(matches) ? matches.slice(0, limit) : [];
  if (!list.length) return null;

  const wins = list.filter(m => m.won === true).length;
  const losses = list.filter(m => m.won === false).length;
  const kills = list.reduce((sum, m) => sum + (m.kills || 0), 0);
  const deaths = list.reduce((sum, m) => sum + (m.deaths || 0), 0);
  const assists = list.reduce((sum, m) => sum + (m.assists || 0), 0);
  const rpDelta = list.reduce((sum, m) => sum + (m.rpDelta || 0), 0);
  const hsValues = list.map(m => m.headshotRate).filter(x => x !== null && x !== undefined);

  return {
    matches: list.length,
    wins,
    losses,
    winRate: list.length ? round2((wins / list.length) * 100) : null,
    kills,
    deaths,
    assists,
    kd: deaths > 0 ? round2(kills / deaths) : kills || null,
    avgKills: list.length ? round2(kills / list.length) : null,
    avgDeaths: list.length ? round2(deaths / list.length) : null,
    avgHeadshotRate: hsValues.length ? round2(hsValues.reduce((a, b) => a + b, 0) / hsValues.length) : null,
    rpDelta
  };
}

function getProfileView(profile) {
  if (!profile) return null;
  const snapshots = profile.snapshots || {};
  const parsedStats = profile.parsedStats || snapshots.overview?.parsed || {};
  const operators = snapshots.operators?.parsed || [];
  const maps = snapshots.maps?.parsed || [];
  const matches = snapshots.matches?.parsed || [];

  const topOperators = operators
    .slice()
    .sort((a, b) => (b.rounds || 0) - (a.rounds || 0))
    .slice(0, 5);

  const bestOperators = operators
    .filter(op => (op.rounds || 0) >= MIN_OPERATOR_ROUNDS)
    .slice()
    .sort((a, b) => {
      if ((b.winRate || 0) !== (a.winRate || 0)) return (b.winRate || 0) - (a.winRate || 0);
      return (b.kd || 0) - (a.kd || 0);
    })
    .slice(0, 5);

  const bestMaps = maps
    .filter(m => (m.matches || 0) >= MIN_MAP_MATCHES)
    .slice()
    .sort((a, b) => {
      if ((b.winRate || 0) !== (a.winRate || 0)) return (b.winRate || 0) - (a.winRate || 0);
      return (b.kd || 0) - (a.kd || 0);
    })
    .slice(0, 5);

  const worstMaps = maps
    .filter(m => (m.matches || 0) >= MIN_MAP_MATCHES)
    .slice()
    .sort((a, b) => {
      if ((a.winRate || 0) !== (b.winRate || 0)) return (a.winRate || 0) - (b.winRate || 0);
      return (a.kd || 0) - (b.kd || 0);
    })
    .slice(0, 5);

  return {
    userId: profile.userId || null,
    providers: profile.providers || null,
    discordId: profile.discordId,
    discordTag: profile.discordTag,
    ubisoftName: profile.ubisoftName,
    role: profile.role || "N/A",
    region: profile.region || "N/A",
    rank: {
      currentRank: profile.currentRank || parsedStats.currentRank || null,
      currentRp: profile.currentRp ?? parsedStats.currentRp ?? null,
      seasonKd: profile.seasonKd ?? parsedStats.seasonKd ?? null,
      seasonWinRate: profile.seasonWinRate ?? parsedStats.seasonWinRate ?? null,
      seasonRankedMatches: profile.seasonRankedMatches ?? parsedStats.seasonRankedMatches ?? null,
      lifetimeLevel: profile.lifetimeLevel ?? parsedStats.lifetimeLevel ?? null,
      headshotRate: profile.headshotRate ?? parsedStats.lifetimeOverallHeadshotRate ?? parsedStats.headshotRate ?? null,
      lifetimeKd: profile.lifetimeOverallKd ?? parsedStats.lifetimeOverallKd ?? null,
      lifetimeWinRate: profile.lifetimeOverallWinRate ?? parsedStats.lifetimeOverallWinRate ?? null,
      lifetimeRankedMatches: profile.lifetimeRankedMatches ?? parsedStats.lifetimeRankedMatches ?? null
    },
    recentForm: summarizeRecentForm(matches, 20),
    topOperators,
    bestOperators,
    bestMaps,
    worstMaps,
    metadata: {
      lastSyncedAt: profile.lastSyncedAt || profile.lastSuccessfulSync || null,
      snapshotsAvailable: Object.keys(snapshots)
    }
  };
}

function formatProfile(profile) {
  const view = getProfileView(profile);
  if (!view) return "❌ Perfil no encontrado.";

  const lines = [];
  lines.push(`🎮 **${view.ubisoftName || view.discordTag || view.discordId}**`);
  lines.push("");
  lines.push(`🏅 Rank: **${view.rank.currentRank || "N/A"}**`);
  lines.push(`📈 RP: **${view.rank.currentRp ?? "N/A"}**`);
  lines.push(`⚔️ Season KD: **${view.rank.seasonKd ?? "N/A"}**`);
  lines.push(`🏆 Season WR: **${percentText(view.rank.seasonWinRate)}**`);
  lines.push(`🎯 Ranked Matches: **${view.rank.seasonRankedMatches ?? "N/A"}**`);

  if (view.recentForm) {
    lines.push("");
    lines.push("🔥 **Recent Form**");
    lines.push(`• ${view.recentForm.wins}W - ${view.recentForm.losses}L`);
    lines.push(`• KD: ${view.recentForm.kd ?? "N/A"}`);
    lines.push(`• RP Delta: ${view.recentForm.rpDelta ?? "N/A"}`);
  }

  if (view.topOperators.length) {
    lines.push("");
    lines.push("🧩 **Main Operators**");
    for (const op of view.topOperators) {
      lines.push(`• ${op.name} — ${op.rounds} rounds | ${op.kd} KD | ${percentText(op.winRate)} WR`);
    }
  }

  if (view.bestMaps.length) {
    lines.push("");
    lines.push("🗺️ **Best Maps**");
    for (const map of view.bestMaps) {
      lines.push(`• ${map.map} — ${map.matches} matches | ${map.kd} KD | ${percentText(map.winRate)} WR`);
    }
  }

  return lines.join("\n").slice(0, 1900);
}

function profileEmbed(profile) {
  const view = getProfileView(profile);
  if (!view) {
    return new EmbedBuilder().setColor("#FF0000").setTitle("Perfil no encontrado");
  }

  const mainOps = view.topOperators.length
    ? view.topOperators.map(op => `• **${op.name}** — ${op.rounds} rounds | ${op.kd} KD | ${percentText(op.winRate)} WR`).join("\n")
    : "Sin datos de operadores.";

  const maps = view.bestMaps.length
    ? view.bestMaps.map(m => `• **${m.map}** — ${m.matches} matches | ${m.kd} KD | ${percentText(m.winRate)} WR`).join("\n")
    : "Sin datos de mapas.";

  const recent = view.recentForm
    ? `${view.recentForm.wins}W - ${view.recentForm.losses}L | KD ${view.recentForm.kd ?? "N/A"} | RPΔ ${view.recentForm.rpDelta ?? "N/A"}`
    : "Sin datos recientes.";

  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle(`🎮 ${view.ubisoftName || view.discordTag || view.discordId}`)
    .setDescription(`Rol: **${view.role}** | Región: **${view.region}**`)
    .addFields(
      {
        name: "🏅 Rank",
        value:
          `Rank: **${view.rank.currentRank || "N/A"}**\n` +
          `RP: **${view.rank.currentRp ?? "N/A"}**\n` +
          `KD: **${view.rank.seasonKd ?? "N/A"}**\n` +
          `WR: **${percentText(view.rank.seasonWinRate)}**\n` +
          `Matches: **${view.rank.seasonRankedMatches ?? "N/A"}**`,
        inline: true
      },
      { name: "🔥 Recent Form", value: recent, inline: true },
      { name: "🧩 Main Operators", value: mainOps.slice(0, 1024), inline: false },
      { name: "🗺️ Best Maps", value: maps.slice(0, 1024), inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | Last sync: ${view.metadata.lastSyncedAt || "N/A"}` });
}

function updateComputedProfileFields(profile) {
  const overview = profile.snapshots?.overview?.parsed || profile.parsedStats || {};

  profile.parsedStats = overview;
  profile.currentRank = overview.currentRank || profile.currentRank || null;
  profile.currentRp = overview.currentRp ?? profile.currentRp ?? null;
  profile.seasonKd = overview.seasonKd ?? profile.seasonKd ?? null;
  profile.seasonWinRate = overview.seasonWinRate ?? profile.seasonWinRate ?? null;
  profile.seasonRankedMatches = overview.seasonRankedMatches ?? profile.seasonRankedMatches ?? null;
  profile.lifetimeLevel = overview.lifetimeLevel ?? profile.lifetimeLevel ?? null;
  profile.headshotRate = overview.lifetimeOverallHeadshotRate ?? overview.headshotRate ?? profile.headshotRate ?? null;
  profile.lifetimeOverallKd = overview.lifetimeOverallKd ?? profile.lifetimeOverallKd ?? null;
  profile.lifetimeOverallWinRate = overview.lifetimeOverallWinRate ?? profile.lifetimeOverallWinRate ?? null;
  profile.lifetimeRankedMatches = overview.lifetimeRankedMatches ?? profile.lifetimeRankedMatches ?? null;
  profile.syncStatus = "active";
  profile.status = PROFILE_STATUS.ACTIVE;
  profile.syncFailures = 0;
  profile.lastSyncError = null;
  profile.lastSuccessfulSync = new Date().toISOString();
  profile.lastSyncedAt = profile.lastSuccessfulSync;
  profile.assignedTo = null;
  profile.leaseExpiresAt = null;

  return profile;
}

function saveSectionSnapshot(discordId, section, payload) {
  const profiles = loadJson(R6_PROFILES_FILE);
  const now = new Date().toISOString();

  if (!profiles[discordId]) {
    profiles[discordId] = {
      discordId,
      discordTag: payload.discordTag || null,
      ubisoftName: payload.ubisoftName || extractUbisoftNameFromUrl(payload.trackerUrl) || null,
      trackerUrl: payload.trackerUrl || null,
      platform: payload.platform || "ubi",
      region: payload.region || "NA",
      role: payload.role || "Flex",
      status: PROFILE_STATUS.ACTIVE,
      linkedAt: now,
      syncFailures: 0,
      snapshots: {}
    };
  }

  const profile = profiles[discordId];
  const rawText = payload.rawText || payload.bodyText || "";
  const parsed = parseSection(section, rawText);
  const snapshotFile = rawText ? saveRawSnapshot(discordId, section, rawText) : null;

  profile.discordTag = payload.discordTag || profile.discordTag || null;
  profile.ubisoftName = payload.ubisoftName || profile.ubisoftName || extractUbisoftNameFromUrl(payload.trackerUrl) || null;
  profile.trackerUrl = payload.trackerUrl || profile.trackerUrl || (profile.ubisoftName ? buildTrackerUrl(profile.ubisoftName, profile.platform || "ubi", "overview") : null);
  profile.platform = payload.platform || profile.platform || "ubi";
  profile.region = payload.region || profile.region || "NA";
  profile.role = payload.role || profile.role || "Flex";
  profile.snapshots = profile.snapshots || {};
  profile.snapshots[section] = {
    trackerUrl: payload.trackerUrl || profile.trackerUrl,
    capturedAt: payload.capturedAt || now,
    rawText,
    parsed,
    snapshotFile
  };

  updateComputedProfileFields(profile);
  profiles[discordId] = profile;
  saveJson(R6_PROFILES_FILE, profiles);
  buildLeaderboards();

  return { ok: true, profile, parsed };
}

function saveFullProfilePayload(payload) {
  const discordId = String(payload.discordId || "").trim();
  if (!discordId) return { ok: false, error: "discordId is required" };

  const sections = payload.sections || {};
  const aliases = {
    overview: payload.overview,
    matches: payload.matches,
    seasons: payload.seasons,
    operators: payload.operators,
    maps: payload.maps
  };

  const merged = { ...sections };
  for (const [section, value] of Object.entries(aliases)) {
    if (value) merged[section] = value;
  }

  const overviewItem = merged.overview;
  if (!overviewItem) {
    completePendingSync(discordId, false, "Missing overview section");
    return { ok: false, error: "No se recibió la sección overview. Abre el link generado por Discord y deja que la extensión sincronice el perfil completo." };
  }

  const overviewRaw = typeof overviewItem === "string" ? overviewItem : (overviewItem.rawText || overviewItem.bodyText || "");
  const expectedName = payload.ubisoftName || extractUbisoftNameFromUrl(payload.trackerUrl);
  if (!isValidOverviewRawText(overviewRaw, expectedName)) {
    completePendingSync(discordId, false, "Invalid R6 Tracker profile or Ubisoft name");
    return {
      ok: false,
      error: "No pudimos validar ese Ubisoft Name en R6 Tracker. Verifica que el perfil exista, que la página haya cargado correctamente y vuelve a intentar."
    };
  }

  let last = null;
  const savedSections = [];
  for (const section of TRACKER_SECTIONS) {
    const item = merged[section];
    if (!item) continue;

    const sectionPayload = typeof item === "string" ? { rawText: item } : { ...item };
    last = saveSectionSnapshot(discordId, section, {
      ...payload,
      ...sectionPayload,
      section,
      trackerUrl: sectionPayload.trackerUrl || payload.trackerUrl || (payload.ubisoftName ? buildTrackerUrl(payload.ubisoftName, payload.platform || "ubi", section) : null)
    });
    savedSections.push(section);
  }

  if (!last) {
    return { ok: false, error: "No valid sections found. Send sections.overview/operators/maps/matches/seasons with rawText." };
  }

  completePendingSync(discordId, true, null);

  const profiles = loadJson(R6_PROFILES_FILE);
  return {
    ok: true,
    savedSections,
    profile: getProfileView(profiles[discordId])
  };
}

function getSyncBatch(requestingDiscordId, limit = 20) {
  const profiles = loadJson(R6_PROFILES_FILE);
  const now = Date.now();

  const list = Object.values(profiles)
    .filter(p => p.ubisoftName || p.trackerUrl)
    .sort((a, b) => {
      const aTime = new Date(a.lastSyncedAt || a.lastSuccessfulSync || 0).getTime();
      const bTime = new Date(b.lastSyncedAt || b.lastSuccessfulSync || 0).getTime();
      return aTime - bTime;
    });

  const own = profiles[requestingDiscordId] ? [profiles[requestingDiscordId]] : [];
  const others = list.filter(p => p.discordId !== requestingDiscordId).slice(0, limit);
  const batch = [...own, ...others];

  for (const p of batch) {
    profiles[p.discordId].lastAssignedAt = new Date(now).toISOString();
    profiles[p.discordId].leaseExpiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    profiles[p.discordId].assignedTo = requestingDiscordId;
  }

  saveJson(R6_PROFILES_FILE, profiles);
  return batch.map(p => ({
    discordId: p.discordId,
    discordTag: p.discordTag,
    ubisoftName: p.ubisoftName,
    trackerUrl: p.trackerUrl || buildTrackerUrl(p.ubisoftName, p.platform || "ubi", "overview"),
    platform: p.platform || "ubi",
    region: p.region || "NA",
    role: p.role || "Flex",
    status: p.status || PROFILE_STATUS.ACTIVE,
    linkedAt: p.linkedAt,
    lastSuccessfulSync: p.lastSuccessfulSync,
    lastSyncError: p.lastSyncError,
    lastAssignedAt: p.lastAssignedAt,
    leaseExpiresAt: p.leaseExpiresAt,
    assignedTo: p.assignedTo
  }));
}

function buildLeaderboards() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const rows = Object.values(profiles)
    .map(profile => {
      const view = getProfileView(profile);
      if (!view) return null;
      return {
        discordId: view.discordId,
        name: view.ubisoftName || view.discordTag || view.discordId,
        rank: view.rank.currentRank,
        rankSort: getRankSortValue(view.rank.currentRank),
        rp: view.rank.currentRp,
        kd: view.rank.seasonKd,
        winRate: view.rank.seasonWinRate,
        level: view.rank.lifetimeLevel,
        matches: view.rank.seasonRankedMatches,
        hs: view.rank.headshotRate,
        recentKd: view.recentForm?.kd ?? null,
        recentRpDelta: view.recentForm?.rpDelta ?? null
      };
    })
    .filter(row => row && (row.rp !== null || row.kd !== null || row.winRate !== null));

  const sorters = {
    rp: (a, b) => (b.rp || 0) - (a.rp || 0),
    kd: (a, b) => (b.kd || 0) - (a.kd || 0),
    winRate: (a, b) => (b.winRate || 0) - (a.winRate || 0),
    hs: (a, b) => (b.hs || 0) - (a.hs || 0),
    level: (a, b) => (b.level || 0) - (a.level || 0),
    matches: (a, b) => (b.matches || 0) - (a.matches || 0)
  };

  const leaderboards = {
    period: { generatedAt: new Date().toISOString(), source: "r6_profiles.json" },
    allTime: {},
    monthly: {},
    weekly: {}
  };

  for (const metric of Object.keys(sorters)) {
    const sorted = rows.slice().sort(sorters[metric]).slice(0, 25);
    leaderboards.allTime[metric] = sorted;
    leaderboards.monthly[metric] = sorted;
    leaderboards.weekly[metric] = sorted;
  }

  saveJson(R6_LEADERBOARDS_FILE, leaderboards);
  return leaderboards;
}

async function syncVerificationState(guild, discordId, verified = false) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { ok: false, error: "Member not found" };

  const pendingRole = guild.roles.cache.find(r => normalize(r.name) === normalize(SYNC_ROLES.PENDING));
  const verifiedRole = guild.roles.cache.find(r => normalize(r.name) === normalize(SYNC_ROLES.VERIFIED));

  if (verified) {
    if (pendingRole && member.roles.cache.has(pendingRole.id)) {
      await member.roles.remove(pendingRole).catch(error => log(`Pending role remove failed | User=${discordId} | ${error.message}`));
    }
    if (verifiedRole && !member.roles.cache.has(verifiedRole.id)) {
      await member.roles.add(verifiedRole).catch(error => log(`Verified role add failed | User=${discordId} | ${error.message}`));
    }
  } else {
    if (verifiedRole && member.roles.cache.has(verifiedRole.id)) {
      await member.roles.remove(verifiedRole).catch(error => log(`Verified role remove failed | User=${discordId} | ${error.message}`));
    }
    if (pendingRole && !member.roles.cache.has(pendingRole.id)) {
      await member.roles.add(pendingRole).catch(error => log(`Pending role add failed | User=${discordId} | ${error.message}`));
    }
  }

  return { ok: true };
}

async function trySetUbisoftNickname(guild, discordId, ubisoftName) {
  if (!ubisoftName) return false;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;

  const safeName = String(ubisoftName).trim().slice(0, 32);
  if (!safeName) return false;
  if (member.nickname === safeName || member.user.username === safeName) return true;

  await member.setNickname(safeName).catch(error => {
    log(`Nickname update skipped | User=${discordId} | Ubisoft=${safeName} | ${error.message}`);
  });

  return true;
}

async function assignRankRole(guild, discordId, rank) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return { ok: false, error: "Member not found" };

  const wanted = rankRoleName(rank);
  const rolesToRemove = [];

  for (const name of RANK_ROLES) {
    const role = guild.roles.cache.find(r => normalize(r.name) === normalize(name));
    if (role && role.name !== wanted && member.roles.cache.has(role.id)) rolesToRemove.push(role);
  }

  for (const role of rolesToRemove) {
    await member.roles.remove(role).catch(error => log(`Rank role remove failed | User=${discordId} | Role=${role.name} | ${error.message}`));
  }

  const wantedRole = guild.roles.cache.find(r => normalize(r.name) === normalize(wanted));
  if (wantedRole && !member.roles.cache.has(wantedRole.id)) {
    await member.roles.add(wantedRole).catch(error => log(`Rank role add failed | User=${discordId} | Role=${wantedRole.name} | ${error.message}`));
  }

  await syncVerificationState(guild, discordId, true).catch(() => {});

  const profiles = loadJson(R6_PROFILES_FILE);
  const profile = profiles[discordId];
  if (profile?.ubisoftName) await trySetUbisoftNickname(guild, discordId, profile.ubisoftName).catch(() => {});

  return { ok: true, rankRole: wanted };
}

async function refreshMemberRoles(discordId) {
  const guild = globalThis.__r6StatsGuild;
  if (!guild) return;
  const profiles = loadJson(R6_PROFILES_FILE);
  const profile = profiles[discordId];
  if (!profile) return;
  await assignRankRole(guild, discordId, profile.currentRank || profile.parsedStats?.currentRank);
}

function shortMetric(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "N/A";
  return `${value}${suffix}`;
}

function getRankingRows(metric = "rp", limit = 10) {
  const profiles = loadJson(R6_PROFILES_FILE);
  const rows = Object.values(profiles)
    .map(p => getProfileView(p))
    .filter(Boolean)
    .map(view => ({
      name: view.ubisoftName || view.discordTag || view.discordId,
      rank: view.rank.currentRank,
      rp: view.rank.currentRp,
      kd: view.rank.seasonKd,
      winRate: view.rank.seasonWinRate,
      hs: view.rank.headshotRate,
      matches: view.rank.seasonRankedMatches,
      level: view.rank.lifetimeLevel,
      recentKd: view.recentForm?.kd ?? null,
      recentWinRate: view.recentForm?.winRate ?? null
    }))
    .filter(row => row[metric] !== null && row[metric] !== undefined);

  rows.sort((a, b) => {
    if (metric === "rank") {
      const rankDiff = getRankSortValue(b.rank) - getRankSortValue(a.rank);
      if (rankDiff !== 0) return rankDiff;
      return (b.rp || 0) - (a.rp || 0);
    }
    return (b[metric] || 0) - (a[metric] || 0);
  });

  return rows.slice(0, limit);
}

function connectPanelEmbed() {
  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("🔗 Conectar Ubisoft | Rainbow Six CUBA")
    .setDescription(
      "Conectar Ubisoft es **opcional** y solo es necesario si quieres mostrar tus estadísticas, rango, KD, WR y participar en tablas/rankings del servidor.\n\n" +
      "Para completar el proceso necesitas instalar la extensión oficial de Rainbow Six CUBA y abrir tu enlace público de R6 Tracker. No se solicitan contraseñas, correos ni acceso a Ubisoft."
    )
    .addFields(
      { name: "Estados visibles", value: `• **${SYNC_ROLES.PENDING}** — registraste Ubisoft, falta una captura válida.\n• **${SYNC_ROLES.VERIFIED}** — tu perfil fue sincronizado correctamente.`, inline: false },
      { name: "Después de verificar", value: "El sistema intentará cambiar tu nickname del servidor a tu Ubisoft Name. Si Discord no lo permite por permisos, no pasa nada; el rol verificado será suficiente.", inline: false },
      { name: "Privacidad", value: "Solo se procesa información pública visible en R6 Tracker. La extensión no lee contraseñas, mensajes privados ni páginas fuera del flujo autorizado.", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function connectRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_link_button").setLabel("Conectar Ubisoft").setEmoji("🔗").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setURL(EXTENSION_LINKS.chromium).setLabel("Extensión Chrome / Brave / Opera GX").setEmoji("🧩").setStyle(ButtonStyle.Link),
      new ButtonBuilder().setURL(EXTENSION_LINKS.edge).setLabel("Extensión Edge").setEmoji("🔵").setStyle(ButtonStyle.Link),
      new ButtonBuilder().setURL(EXTENSION_LINKS.firefox).setLabel("Extensión Firefox").setEmoji("🟠").setStyle(ButtonStyle.Link)
    )
  ];
}

function statsSummaryEmbed() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const list = Object.values(profiles);
  const linked = list.length;
  const synced = list.filter(p => p.lastSuccessfulSync || p.parsedStats).length;
  const pending = list.filter(p => !(p.lastSuccessfulSync || p.parsedStats)).length;

  const rankCounts = {};
  for (const profile of list) {
    const rank = normalizeRankName(profile.currentRank || profile.parsedStats?.currentRank || "UNRANKED");
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  }

  const rankText = Object.entries(rankCounts)
    .sort((a, b) => (RANK_ORDER[b[0]] || 0) - (RANK_ORDER[a[0]] || 0))
    .map(([rank, count]) => `• ${rank}: **${count}**`)
    .join("\n") || "Sin rangos sincronizados.";

  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("📈 R6 Stats | Rainbow Six CUBA")
    .setDescription(
      "Panel rápido para revisar tu perfil R6 y mantener tus datos actualizados.\n\n" +
      "Para que la información fluya y se mantenga lo más cercana posible a la realidad, es necesario resincronizar ocasionalmente. Solo tienes que abrir tu enlace de R6 Tracker con la extensión instalada; no tienes que iniciar sesión ni navegar manualmente por la página."
    )
    .addFields(
      { name: "Perfiles vinculados", value: String(linked), inline: true },
      { name: "Sincronizados", value: String(synced), inline: true },
      { name: "Pendientes", value: String(pending), inline: true },
      { name: "Distribución de rangos", value: rankText, inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function statsRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_profile_button").setLabel("Mi Perfil").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_resync_button").setLabel("Re-Sync").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_status_button").setLabel("Estado de conexión").setEmoji("✅").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function leaderboardEmbed(metric = "rp", period = "monthly") {
  buildLeaderboards();
  const leaderboards = loadJson(R6_LEADERBOARDS_FILE);
  const validMetric = ["rp", "kd", "winRate", "hs", "level", "matches"].includes(metric) ? metric : "rp";
  const rows = getRankingRows(validMetric === "hs" ? "hs" : validMetric, 10);

  const labels = { rp: "RP", kd: "KD", winRate: "Win Rate", hs: "Headshot %", level: "Level", matches: "Matches" };
  const suffix = ["winRate", "hs"].includes(validMetric) ? "%" : "";

  const text = rows.length
    ? rows.map((row, index) => {
        const rank = row.rank ? ` | ${row.rank}` : "";
        return `**${index + 1}. ${row.name}** — ${shortMetric(row[validMetric], suffix)}${rank}`;
      }).join("\n")
    : "Sin datos suficientes para generar este ranking.";

  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🏆 Rankings | Top ${labels[validMetric]}`)
    .setDescription(text)
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | ${leaderboards?.period?.generatedAt || "N/A"}` });
}

function rankTableEmbed(metric = "rp") {
  const validMetric = ["rp", "rank", "kd", "winRate", "hs", "matches", "level"].includes(metric) ? metric : "rp";
  const labels = { rp: "RP", rank: "Rango", kd: "KD", winRate: "Win Rate", hs: "Headshot %", matches: "Matches", level: "Level" };
  const sortMetric = validMetric === "rank" ? "rank" : validMetric;
  const rows = getRankingRows(sortMetric, 25);

  const text = rows.length
    ? rows.map((p, i) => {
        const value = validMetric === "rank"
          ? `${p.rank || "N/A"} | ${p.rp ?? "N/A"} RP`
          : `${shortMetric(p[validMetric], ["winRate", "hs"].includes(validMetric) ? "%" : "")}`;
        return `**${i + 1}. ${p.name}** — ${value} | KD ${p.kd ?? "N/A"} | WR ${percentText(p.winRate)}`;
      }).join("\n")
    : "Sin datos suficientes todavía.";

  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🏅 Tabla de Rangos | Vista por ${labels[validMetric]}`)
    .setDescription(text.slice(0, 4000))
    .setFooter({ text: "Tabla comparativa del servidor. No es una tabla global de Tracker.gg." });
}

function rankTableRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_table_rp_button").setLabel("RP").setEmoji("🏅").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_table_rank_button").setLabel("Rango").setEmoji("🎖️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_table_kd_button").setLabel("KD").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_table_wr_button").setLabel("WR").setEmoji("📈").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_table_refresh_button").setLabel("Actualizar").setEmoji("🔄").setStyle(ButtonStyle.Success)
    )
  ];
}

function rankingsPanelEmbed() {
  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle("🏆 Rankings | Rainbow Six CUBA")
    .setDescription(
      "Vitrina de Top 10 por categoría rankeable dentro del servidor.\n\n" +
      "Aquí no se muestra la tabla completa; para comparación general usa **Tabla de Rangos**. Este canal resume quién lidera cada métrica relevante."
    )
    .addFields(
      { name: "Categorías iniciales", value: "Top RP, Top KD, Top WR, Top HS%, Top Level y Top Matches.", inline: false },
      { name: "Futuro", value: "Top por operador, mapa, rol y periodo cuando el dataset tenga suficiente muestra.", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function rankingsRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_rank_top_rp_button").setLabel("Top RP").setEmoji("🏅").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_rank_top_kd_button").setLabel("Top KD").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_rank_top_wr_button").setLabel("Top WR").setEmoji("📈").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_rank_top_hs_button").setLabel("Top HS%").setEmoji("🎯").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_rank_top_level_button").setLabel("Top Level").setEmoji("⭐").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function operatorTopEmbed(operatorName = null, mode = "wr") {
  const profiles = loadJson(R6_PROFILES_FILE);
  const rows = [];
  const target = operatorName ? normalize(operatorName) : null;

  for (const profile of Object.values(profiles)) {
    const operators = profile.snapshots?.operators?.parsed || [];
    for (const op of operators) {
      if (target && normalize(op.name) !== target) continue;
      if (!op || (op.rounds || 0) < MIN_OPERATOR_ROUNDS) continue;
      rows.push({
        name: profile.ubisoftName || profile.discordTag || profile.discordId,
        operator: op.name,
        rounds: op.rounds,
        winRate: op.winRate,
        kd: op.kd
      });
    }
  }

  rows.sort((a, b) => {
    if (mode === "kd" && (b.kd || 0) !== (a.kd || 0)) return (b.kd || 0) - (a.kd || 0);
    if (mode === "usage" && (b.rounds || 0) !== (a.rounds || 0)) return (b.rounds || 0) - (a.rounds || 0);
    if ((b.winRate || 0) !== (a.winRate || 0)) return (b.winRate || 0) - (a.winRate || 0);
    if ((b.kd || 0) !== (a.kd || 0)) return (b.kd || 0) - (a.kd || 0);
    return (b.rounds || 0) - (a.rounds || 0);
  });

  const text = rows.length
    ? rows.slice(0, 10).map((row, i) => `**${i + 1}. ${row.name}** — ${row.operator} | ${percentText(row.winRate)} WR | ${row.kd ?? "N/A"} KD | ${row.rounds} rounds`).join("\n")
    : `Sin datos suficientes. Mínimo: ${MIN_OPERATOR_ROUNDS} rounds.`;

  const title = operatorName ? `🎯 Top Operadores | ${operatorName}` : "🎯 Top Operadores | Servidor";
  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle(title)
    .setDescription(text)
    .setFooter({ text: `Prioridad: ${mode.toUpperCase()} | RainbowSixCubaStats ${BOT_VERSION}` });
}

function operatorPanelEmbed() {
  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("🎯 Top Operadores | Rainbow Six CUBA")
    .setDescription("Análisis de operadores basado únicamente en jugadores del servidor con datos sincronizados y muestra mínima.")
    .addFields(
      { name: "Criterio", value: `Mínimo actual: **${MIN_OPERATOR_ROUNDS} rounds**. Orden recomendado: WR → KD → rounds.`, inline: false },
      { name: "Uso", value: "Útil para scouting, coaches, análisis de roles y selección de jugadores por especialidad.", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function operatorRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_ops_best_wr_button").setLabel("Mejor WR").setEmoji("🏆").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_ops_best_kd_button").setLabel("Mejor KD").setEmoji("⚔️").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_ops_usage_button").setLabel("Más usados").setEmoji("📊").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function competitivePanelEmbed(type = "overview") {
  const profiles = loadJson(R6_PROFILES_FILE);
  const views = Object.values(profiles).map(p => getProfileView(p)).filter(Boolean);
  const withRecent = views.filter(v => v.recentForm);

  if (type === "recent") {
    const rows = withRecent
      .slice()
      .sort((a, b) => (b.recentForm?.kd || 0) - (a.recentForm?.kd || 0))
      .slice(0, 10);
    const text = rows.length ? rows.map((v, i) => `**${i + 1}. ${v.ubisoftName || v.discordTag}** — ${v.recentForm.wins}W-${v.recentForm.losses}L | KD ${v.recentForm.kd ?? "N/A"} | RPΔ ${v.recentForm.rpDelta ?? "N/A"}`).join("\n") : "Sin recent form suficiente.";
    return new EmbedBuilder().setColor("#5865F2").setTitle("📊 Datos Competitivos | Forma Reciente").setDescription(text).setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
  }

  if (type === "maps") {
    const rows = [];
    for (const v of views) for (const map of v.bestMaps || []) rows.push({ player: v.ubisoftName || v.discordTag, ...map });
    rows.sort((a, b) => (b.winRate || 0) - (a.winRate || 0));
    const text = rows.length ? rows.slice(0, 10).map((m, i) => `**${i + 1}. ${m.player}** — ${m.map} | ${percentText(m.winRate)} WR | ${m.kd ?? "N/A"} KD | ${m.matches} matches`).join("\n") : "Sin datos de mapas suficientes.";
    return new EmbedBuilder().setColor("#5865F2").setTitle("📊 Datos Competitivos | Mapas").setDescription(text).setFooter({ text: `Mínimo ${MIN_MAP_MATCHES} matches | RainbowSixCubaStats ${BOT_VERSION}` });
  }

  return new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle("📊 Datos Competitivos | Rainbow Six CUBA")
    .setDescription("Panel destinado a scouting y lectura competitiva. No reemplaza rankings ni tabla de rangos.")
    .addFields(
      { name: "Incluye", value: "• Forma reciente\n• Mapas fuertes/débiles\n• Resumen scout\n• Comparación básica jugador vs servidor", inline: false },
      { name: "Futuro", value: "Estos datos serán consumidos por otro bot/app visual para tablas, gráficos y módulos tipo web.", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function competitiveRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_comp_overview_button").setLabel("Resumen").setEmoji("📊").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_comp_recent_button").setLabel("Forma Reciente").setEmoji("🔥").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_comp_maps_button").setLabel("Mapas").setEmoji("🗺️").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function prestigePanelEmbed(type = "overview") {
  const profiles = loadJson(R6_PROFILES_FILE);
  const views = Object.values(profiles).map(p => getProfileView(p)).filter(Boolean);

  if (type === "level") {
    const rows = getRankingRows("level", 10);
    const text = rows.length ? rows.map((r, i) => `**${i + 1}. ${r.name}** — Level ${r.level ?? "N/A"} | ${r.rank || "N/A"}`).join("\n") : "Sin datos de level.";
    return new EmbedBuilder().setColor("#9C27B0").setTitle("🎉 Datos de Prestigio | Level").setDescription(text).setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
  }

  return new EmbedBuilder()
    .setColor("#9C27B0")
    .setTitle("🎉 Datos de Prestigio | Rainbow Six CUBA")
    .setDescription("Datos históricos o visuales que aportan contexto y trayectoria, pero no sustituyen la lectura competitiva actual.")
    .addFields(
      { name: "Incluye", value: "• Level\n• Matches\n• Lifetime KD/WR cuando esté disponible\n• HS%\n• Peaks y consistencia histórica", inline: false },
      { name: "Uso", value: "Reconocimiento, engagement y contexto de experiencia del jugador.", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION}` });
}

function prestigeRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_prestige_level_button").setLabel("Top Level").setEmoji("⭐").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_prestige_matches_button").setLabel("Top Matches").setEmoji("🎮").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_prestige_hs_button").setLabel("Top HS%").setEmoji("🎯").setStyle(ButtonStyle.Secondary)
    )
  ];
}

function dataCatalogEmbed() {
  return competitivePanelEmbed("overview");
}

async function upsertChannelMessage(channel, key, embed, components = []) {
  const file = path.join(DATA_DIR, "stats_messageIds.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({}, null, 2));
  const ids = loadJson(file);
  const oldId = ids[key];

  if (oldId) {
    const oldMessage = await channel.messages.fetch(oldId).catch(() => null);
    if (oldMessage) {
      await oldMessage.edit({ embeds: [embed], components }).catch(() => null);
      return oldMessage;
    }
  }

  const msg = await channel.send({ embeds: [embed], components });
  ids[key] = msg.id;
  saveJson(file, ids);
  return msg;
}

async function publishPanels(guild) {
  const connect = guild.channels.cache.find(c => c.name === CONNECT_CHANNEL_NAME);
  if (connect) await upsertChannelMessage(connect, "connect_panel", connectPanelEmbed(), connectRows()).catch(error => log(`Panel publish failed | connect | ${error.message}`));

  const stats = guild.channels.cache.find(c => c.name === STATS_CHANNEL_NAME);
  if (stats) await upsertChannelMessage(stats, "stats_summary", statsSummaryEmbed(), statsRows()).catch(error => log(`Panel publish failed | stats | ${error.message}`));

  const rankings = guild.channels.cache.find(c => c.name === RANKINGS_CHANNEL_NAME);
  if (rankings) await upsertChannelMessage(rankings, "rank_table", rankTableEmbed("rp"), rankTableRows()).catch(error => log(`Panel publish failed | rankings | ${error.message}`));

  const operators = guild.channels.cache.find(c => c.name === OPERATOR_TOP_CHANNEL_NAME);
  if (operators) await upsertChannelMessage(operators, "operator_top", operatorPanelEmbed(), operatorRows()).catch(error => log(`Panel publish failed | operators | ${error.message}`));

  const competitive = guild.channels.cache.find(c => c.name === COMPETITIVE_DATA_CHANNEL_NAME);
  if (competitive) await upsertChannelMessage(competitive, "competitive_data", competitivePanelEmbed(), competitiveRows()).catch(error => log(`Panel publish failed | competitive | ${error.message}`));

  const prestige = guild.channels.cache.find(c => c.name === PRESTIGE_DATA_CHANNEL_NAME);
  if (prestige) await upsertChannelMessage(prestige, "prestige_data", prestigePanelEmbed(), prestigeRows()).catch(error => log(`Panel publish failed | prestige | ${error.message}`));
}

function linkModal() {
  const modal = new ModalBuilder()
    .setCustomId("r6_link_modal")
    .setTitle("Conectar Ubisoft");

  const ubisoftName = new TextInputBuilder()
    .setCustomId("ubisoftName")
    .setLabel("Ubisoft Username")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ejemplo: exdeusdead")
    .setRequired(true)
    .setMaxLength(80);

  const role = new TextInputBuilder()
    .setCustomId("role")
    .setLabel("Rol dentro del juego")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Entry, Support, Flex, IGL, Coach, etc.")
    .setRequired(false)
    .setMaxLength(40);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ubisoftName),
    new ActionRowBuilder().addComponents(role)
  );

  return modal;
}

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder()
      .setName("r6link")
      .setDescription("Conecta tu Ubisoft ID al sistema de Rainbow Six CUBA.")
      .addStringOption(option => option.setName("ubisoft").setDescription("Tu Ubisoft username").setRequired(true))
      .addStringOption(option => option.setName("rol").setDescription("Tu rol: Flex, Entry, Support, IGL, Coach...").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6profile")
      .setDescription("Muestra tu perfil competitivo de Rainbow Six CUBA.")
      .addUserOption(option => option.setName("usuario").setDescription("Usuario a consultar.").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6sync")
      .setDescription("Genera un link para sincronizar tu perfil completo con la extensión."),

    new SlashCommandBuilder()
      .setName("r6summary")
      .setDescription("Muestra resumen de perfiles R6 vinculados."),

    new SlashCommandBuilder()
      .setName("r6leaderboard")
      .setDescription("Muestra ranking R6.")
      .addStringOption(option => option.setName("metric").setDescription("Métrica").setRequired(true).addChoices(
        { name: "RP", value: "rp" },
        { name: "KD", value: "kd" },
        { name: "Win Rate", value: "winRate" },
        { name: "Headshot %", value: "hs" },
        { name: "Level", value: "level" },
        { name: "Matches", value: "matches" }
      ))
      .addStringOption(option => option.setName("period").setDescription("Periodo").setRequired(false).addChoices(
        { name: "Semanal", value: "weekly" },
        { name: "Mensual", value: "monthly" },
        { name: "Histórico", value: "allTime" }
      )),

    new SlashCommandBuilder()
      .setName("r6rankcheck")
      .setDescription("Revisa el rol de rango R6 asignado.")
      .addUserOption(option => option.setName("usuario").setDescription("Usuario a revisar.").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6ranktable")
      .setDescription("Muestra la Tabla de Rangos comunitaria."),

    new SlashCommandBuilder()
      .setName("r6operatortop")
      .setDescription("Muestra el Top 10 comunitario por operador.")
      .addStringOption(option => option.setName("operador").setDescription("Ejemplo: Ash, Ace, Smoke, Mute").setRequired(true)),

    new SlashCommandBuilder()
      .setName("r6datacatalog")
      .setDescription("Muestra qué datos son competitivos y cuáles son visuales."),

    new SlashCommandBuilder()
      .setName("r6publishpanels")
      .setDescription("Staff: republica los paneles del bot de Stats.")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ];

  await guild.commands.set(commands.map(c => c.toJSON()));
  log("Slash commands registered for RainbowSixCubaStats");
}

client.once("clientReady", async () => {
  log(`${client.user.tag} ONLINE | ${BOT_VERSION}`);

  const guild = GUILD_ID ? await client.guilds.fetch(GUILD_ID).catch(() => null) : client.guilds.cache.first();
  if (!guild) {
    log("No guild found.");
    return;
  }

  globalThis.__r6StatsGuild = guild;
  buildLeaderboards();
  await registerCommands(guild);
  await publishPanels(guild);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "r6_link_button") {
        return interaction.showModal(linkModal());
      }

      if (interaction.customId === "r6_profile_button") {
        const profiles = loadJson(R6_PROFILES_FILE);
        const profile = profiles[interaction.user.id];
        if (!profile) return interaction.reply({ content: "❌ No tienes perfil R6 conectado. Usa **Conectar Ubisoft** primero.", flags: MessageFlags.Ephemeral });
        return interaction.reply({ embeds: [profileEmbed(profile)], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === "r6_status_button") {
        const profiles = loadJson(R6_PROFILES_FILE);
        const profile = profiles[interaction.user.id];
        if (!profile) return interaction.reply({ content: `Estado: **${SYNC_ROLES.PENDING}**\n\nUsa **Conectar Ubisoft** para registrar tu usuario.`, flags: MessageFlags.Ephemeral });
        const verified = Boolean(profile.lastSuccessfulSync || profile.parsedStats);
        return interaction.reply({
          content:
            `Estado: **${verified ? SYNC_ROLES.VERIFIED : SYNC_ROLES.PENDING}**\n` +
            `Ubisoft: **${profile.ubisoftName || "N/A"}**\n` +
            `Último Sync: **${profile.lastSyncedAt || profile.lastSuccessfulSync || "N/A"}**`,
          flags: MessageFlags.Ephemeral
        });
      }

      if (interaction.customId === "r6_resync_button" || interaction.customId === "r6_table_refresh_button") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const profiles = loadJson(R6_PROFILES_FILE);
        const profile = profiles[interaction.user.id];

        if (!profile || !profile.ubisoftName) {
          return interaction.editReply({ content: "❌ Primero conecta tu Ubisoft Name con **Conectar Ubisoft**." });
        }

        const pending = markPendingSync(interaction.user.id, profile.ubisoftName, interaction.user.tag);
        return interaction.editReply({
          content:
            `🔄 Sync solicitado para **${profile.ubisoftName}**.\n\n` +
            "Abre el enlace de R6 Tracker. Si tienes la extensión instalada, la captura se enviará automáticamente. No necesitas iniciar sesión ni navegar manualmente.",
          components: [syncLinkRow(pending.syncUrl)]
        });
      }

      const buttonEmbedMap = {
        r6_table_rp_button: () => rankTableEmbed("rp"),
        r6_table_rank_button: () => rankTableEmbed("rank"),
        r6_table_kd_button: () => rankTableEmbed("kd"),
        r6_table_wr_button: () => rankTableEmbed("winRate"),
        r6_rank_top_rp_button: () => leaderboardEmbed("rp", "monthly"),
        r6_rank_top_kd_button: () => leaderboardEmbed("kd", "monthly"),
        r6_rank_top_wr_button: () => leaderboardEmbed("winRate", "monthly"),
        r6_rank_top_hs_button: () => leaderboardEmbed("hs", "monthly"),
        r6_rank_top_level_button: () => leaderboardEmbed("level", "monthly"),
        r6_ops_best_wr_button: () => operatorTopEmbed(null, "wr"),
        r6_ops_best_kd_button: () => operatorTopEmbed(null, "kd"),
        r6_ops_usage_button: () => operatorTopEmbed(null, "usage"),
        r6_comp_overview_button: () => competitivePanelEmbed("overview"),
        r6_comp_recent_button: () => competitivePanelEmbed("recent"),
        r6_comp_maps_button: () => competitivePanelEmbed("maps"),
        r6_prestige_level_button: () => prestigePanelEmbed("level"),
        r6_prestige_matches_button: () => leaderboardEmbed("matches", "allTime"),
        r6_prestige_hs_button: () => leaderboardEmbed("hs", "allTime")
      };

      if (buttonEmbedMap[interaction.customId]) {
        return interaction.reply({ embeds: [buttonEmbedMap[interaction.customId]()], flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === "r6_link_modal") {
      const ubisoftName = interaction.fields.getTextInputValue("ubisoftName").trim();
      const role = interaction.fields.getTextInputValue("role").trim() || "Flex";
      const profiles = loadJson(R6_PROFILES_FILE);

      profiles[interaction.user.id] = {
        ...(profiles[interaction.user.id] || {}),
        discordId: interaction.user.id,
        discordTag: interaction.user.tag,
        ubisoftName,
        trackerUrl: buildTrackerUrl(ubisoftName, "ubi", "overview"),
        platform: "ubi",
        region: "NA",
        role,
        status: PROFILE_STATUS.ACTIVE,
        syncStatus: "pending_ubisoft_sync",
        linkedAt: profiles[interaction.user.id]?.linkedAt || new Date().toISOString(),
        syncFailures: 0,
        snapshots: profiles[interaction.user.id]?.snapshots || {}
      };

      saveJson(R6_PROFILES_FILE, profiles);
      if (interaction.guild) await syncVerificationState(interaction.guild, interaction.user.id, false).catch(() => {});

      const pending = markPendingSync(interaction.user.id, ubisoftName, interaction.user.tag);
      return interaction.reply({
        content:
          `✅ Ubisoft registrado: **${ubisoftName}**\n\n` +
          `Estado: **${SYNC_ROLES.PENDING}**\n\n` +
          "Ahora instala la extensión si no la tienes y abre tu enlace de R6 Tracker para completar la primera sincronización.",
        components: [syncLinkRow(pending.syncUrl)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "r6link") {
      const ubisoftName = interaction.options.getString("ubisoft", true).trim();
      const role = interaction.options.getString("rol") || "Flex";
      const profiles = loadJson(R6_PROFILES_FILE);

      profiles[interaction.user.id] = {
        ...(profiles[interaction.user.id] || {}),
        discordId: interaction.user.id,
        discordTag: interaction.user.tag,
        ubisoftName,
        trackerUrl: buildTrackerUrl(ubisoftName, "ubi", "overview"),
        platform: "ubi",
        region: "NA",
        role,
        status: PROFILE_STATUS.ACTIVE,
        syncStatus: "pending_ubisoft_sync",
        linkedAt: profiles[interaction.user.id]?.linkedAt || new Date().toISOString(),
        syncFailures: 0,
        snapshots: profiles[interaction.user.id]?.snapshots || {}
      };

      saveJson(R6_PROFILES_FILE, profiles);
      if (interaction.guild) await syncVerificationState(interaction.guild, interaction.user.id, false).catch(() => {});

      const pending = markPendingSync(interaction.user.id, ubisoftName, interaction.user.tag);
      return interaction.reply({
        content:
          `✅ Ubisoft registrado: **${ubisoftName}**\n\n` +
          `Estado: **${SYNC_ROLES.PENDING}**\n\n` +
          "Abre el enlace de R6 Tracker con la extensión instalada para completar la sincronización.",
        components: [syncLinkRow(pending.syncUrl)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.commandName === "r6sync") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const profiles = loadJson(R6_PROFILES_FILE);
      const profile = profiles[interaction.user.id];
      if (!profile || !profile.ubisoftName) {
        return interaction.editReply({ content: "❌ Primero conecta tu Ubisoft Name con `/r6link ubisoft:TU_USUARIO` o usa el botón **Conectar Ubisoft**." });
      }

      const pending = markPendingSync(interaction.user.id, profile.ubisoftName, interaction.user.tag);
      return interaction.editReply({
        content:
          `🔄 Sync solicitado para **${profile.ubisoftName}**.\n\n` +
          "Abre el enlace de R6 Tracker. La extensión capturará overview, matches, seasons, operators y maps en una sola sincronización.",
        components: [syncLinkRow(pending.syncUrl)]
      });
    }

    if (interaction.commandName === "r6profile") {
      const target = interaction.options.getUser("usuario") || interaction.user;
      const profiles = loadJson(R6_PROFILES_FILE);
      const profile = profiles[target.id];
      if (!profile) return interaction.reply({ content: `❌ No encontré perfil R6 conectado para <@${target.id}>.`, flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [profileEmbed(profile)], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6summary") {
      return interaction.reply({ embeds: [statsSummaryEmbed()], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6leaderboard") {
      const metric = interaction.options.getString("metric", true);
      const period = interaction.options.getString("period") || "monthly";
      return interaction.reply({ embeds: [leaderboardEmbed(metric, period)], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6rankcheck") {
      const target = interaction.options.getUser("usuario") || interaction.user;
      const profiles = loadJson(R6_PROFILES_FILE);
      const profile = profiles[target.id];
      if (!profile) return interaction.reply({ content: `❌ <@${target.id}> no tiene perfil conectado.`, flags: MessageFlags.Ephemeral });
      await refreshMemberRoles(target.id);
      return interaction.reply({ content: `✅ Rango detectado para <@${target.id}>: **${profile.currentRank || profile.parsedStats?.currentRank || "N/A"}**`, flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6ranktable") {
      return interaction.reply({ embeds: [rankTableEmbed("rp")], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6operatortop") {
      const operator = interaction.options.getString("operador", true);
      return interaction.reply({ embeds: [operatorTopEmbed(operator)], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6datacatalog") {
      return interaction.reply({ embeds: [dataCatalogEmbed()], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6publishpanels") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: "❌ No tienes permisos para usar este comando.", flags: MessageFlags.Ephemeral });
      }
      await publishPanels(interaction.guild);
      return interaction.reply({ content: "✅ Paneles de RainbowSixCubaStats republicados.", flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    log(`INTERACTION_ERROR | ${error.stack || error.message}`);
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: "❌ Error procesando la interacción.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return interaction.reply({ content: "❌ Error procesando la interacción.", flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const provided = req.headers["x-api-key"] || req.query.apiKey || req.body?.apiKey;
  if (provided !== API_KEY) return res.status(401).json({ ok: false, error: "Unauthorized" });
  return next();
}

function startApiServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "RainbowSixCubaStats", version: BOT_VERSION, time: new Date().toISOString() });
  });

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "RainbowSixCubaStats", version: BOT_VERSION, time: new Date().toISOString() });
  });

  app.get("/api/sync-batch/:discordId", requireApiKey, (req, res) => {
    const limit = cleanNumber(req.query.limit) || 20;
    const batch = getSyncBatch(req.params.discordId, limit);
    res.json({ ok: true, batch });
  });

  app.get("/api/pending-sync/:discordId", requireApiKey, (req, res) => {
    const pending = loadJson(PENDING_SYNCS_FILE);
    const item = pending[String(req.params.discordId)] || null;
    res.json({ ok: true, pending: item });
  });

  app.post("/api/request-sync", requireApiKey, (req, res) => {
    const { discordId, ubisoftName } = req.body || {};
    if (!discordId || !ubisoftName) return res.status(400).json({ ok: false, error: "discordId and ubisoftName are required" });
    const pending = markPendingSync(discordId, ubisoftName, req.body.requestedByTag || "API");
    res.json({ ok: true, pending });
  });

  app.post("/api/snapshot", requireApiKey, async (req, res) => {
    const { discordId, section } = req.body || {};
    if (!discordId) return res.status(400).json({ ok: false, error: "discordId is required" });
    if (!section) return res.status(400).json({ ok: false, error: "section is required" });
    if (!TRACKER_SECTIONS.includes(section)) return res.status(400).json({ ok: false, error: `Invalid section. Use: ${TRACKER_SECTIONS.join(", ")}` });

    const result = saveSectionSnapshot(String(discordId), section, req.body);
    await refreshMemberRoles(String(discordId)).catch(() => {});
    if (globalThis.__r6StatsGuild) await publishPanels(globalThis.__r6StatsGuild).catch(() => {});

    res.json({ ok: true, section, parsed: result.parsed });
  });

  // Combined sync endpoint used by the Chrome extension.
  // It accepts all captured sections in one request:
  // { discordId, ubisoftName, sections: { overview, matches, seasons, operators, maps } }
  app.post("/api/snapshot-bundle", requireApiKey, requireCgpUser, async (req, res) => {
    const payload = {
      ...(req.body || {}),
      userId: req.cgpUser.id,
      discordId: req.cgpUser.identities?.discord?.id,
      providers: {
        discord: req.cgpUser.identities?.discord || null,
        ubisoft: req.cgpUser.identities?.ubisoft || null
      }
    };

    const result = saveFullProfilePayload(payload);
    if (!result.ok) return res.status(400).json(result);

    await refreshMemberRoles(String(payload.discordId)).catch(() => {});
    if (globalThis.__r6StatsGuild) await publishPanels(globalThis.__r6StatsGuild).catch(() => {});

    res.json(result);
  });

  app.post("/api/profile-sync", requireApiKey, async (req, res) => {
    const result = saveFullProfilePayload(req.body || {});
    if (!result.ok) return res.status(400).json(result);

    await refreshMemberRoles(String(req.body.discordId)).catch(() => {});
    if (globalThis.__r6StatsGuild) await publishPanels(globalThis.__r6StatsGuild).catch(() => {});

    res.json(result);
  });

  app.get("/api/me", requireCgpUser, (req, res) => {
    const profiles = loadJson(R6_PROFILES_FILE);
    const discordId = req.cgpUser.identities?.discord?.id;
    const profile = profiles[discordId];

    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: "Profile not found"
      });
    }

    res.json({
      ok: true,
      userId: req.cgpUser.id,
      profile: getProfileView(profile)
    });
  });

  app.get("/api/me", requireCgpUser, (req, res) => {
    const profiles = loadJson(R6_PROFILES_FILE);

    const discordId =
      req.cgpUser.identities?.discord?.id;

    const profile =
      profiles[discordId];

    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: "Profile not found"
      });
    }

    res.json({
      ok: true,
      userId: req.cgpUser.id,
      profile: getProfileView(profile)
    });
  });



  app.get("/api/r6/membership/me", requireCgpUser, (req, res) => {
    const membership = getMembership(req.cgpUser.id);

    res.json({
      ok: true,
      membership
    });
  });


  app.post("/api/r6/membership/join", requireCgpUser, (req, res) => {
    const membership = createMembership(req.cgpUser);

    res.json({
      ok: true,
      membership
    });
  });



  app.post("/api/internal/r6/membership/:userId/discord", requireApiKey, (req, res) => {

    const membership = updateMembership(
      req.params.userId,
      {
        requirements: {
          discordGuildMember: true
        }
      }
    );


    if (!membership) {
      return res.status(404).json({
        ok: false,
        error: "MEMBERSHIP_NOT_FOUND"
      });
    }


    res.json({
      ok: true,
      membership
    });

  });


  app.get("/api/profile/:discordId", requireApiKey, (req, res) => {
    const profiles = loadJson(R6_PROFILES_FILE);
    const profile = profiles[req.params.discordId];

    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: "Profile not found"
      });
    }

    res.json({
      ok: true,
      profile: getProfileView(profile)
    });
  });

  app.listen(API_PORT, "0.0.0.0", () => {
    log(`Stats API listening on 0.0.0.0:${API_PORT}`);
  });
}

process.on("unhandledRejection", error => log(`UNHANDLED_REJECTION | ${error.stack || error.message}`));
process.on("uncaughtException", error => log(`UNCAUGHT_EXCEPTION | ${error.stack || error.message}`));

startApiServer();
client.login(TOKEN);
