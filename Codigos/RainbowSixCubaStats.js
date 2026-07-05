/**
 * RainbowSixCubaStats Bot | v0.8.0 Experimental R6 Tracker Worker
 *
 * Separate bot/service for Rainbow Six CUBA competitive stats.
 *
 * Install:
 *   npm install discord.js dotenv puppeteer
 *
 * .env required:
 *   STATS_BOT_TOKEN=your_stats_bot_token
 *   GUILD_ID=your_discord_server_id
 *   STATS_CHANNEL_NAME=📊・panel-de-la-comunidad
 *
 * Optional:
 *   SYNC_INTERVAL_MINUTES=60
 *   HEADLESS=true
 */

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

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

const BOT_VERSION = "v0.8.3";
const DATA_DIR = path.join(__dirname, "data");
const R6_PROFILES_FILE = path.join(DATA_DIR, "r6_profiles.json");
const R6_STATS_FILE = path.join(DATA_DIR, "r6_stats.json");
const R6_LEADERBOARDS_FILE = path.join(DATA_DIR, "r6_leaderboards.json");
const LOG_DIR = path.join(__dirname, "logs", "r6stats");

const TOKEN = process.env.STATS_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CONNECT_CHANNEL_NAME = process.env.CONNECT_CHANNEL_NAME || "🔗・conectar-ubisoft";
const STATS_CHANNEL_NAME = process.env.STATS_CHANNEL_NAME || "📈・r6-stats";
const RANKINGS_CHANNEL_NAME = process.env.RANKINGS_CHANNEL_NAME || "🏅・rankings";
const SYNC_INTERVAL_MINUTES = Number(process.env.SYNC_INTERVAL_MINUTES || 60);
const HEADLESS = String(process.env.HEADLESS || "true").toLowerCase() !== "false";

if (!TOKEN) {
  console.error("Missing STATS_BOT_TOKEN in .env");
  process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(R6_PROFILES_FILE)) fs.writeFileSync(R6_PROFILES_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(R6_STATS_FILE)) fs.writeFileSync(R6_STATS_FILE, JSON.stringify({}, null, 2));
if (!fs.existsSync(R6_LEADERBOARDS_FILE)) fs.writeFileSync(R6_LEADERBOARDS_FILE, JSON.stringify({}, null, 2));

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(path.join(LOG_DIR, "r6stats.log"), line + "\n", "utf8");
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

const PROFILE_STATUS = {
  ACTIVE: "ACTIVE",
  STALE: "STALE",
  DISABLED: "DISABLED"
};

const R6_RANK_ROLE_NAMES = {
  UNRANKED: "⚫ Unranked",
  COPPER: "🟤 Copper",
  BRONZE: "🟫 Bronze",
  SILVER: "⚪ Silver",
  GOLD: "🟡 Gold",
  PLATINUM: "🔵 Platinum",
  EMERALD: "🟢 Emerald",
  DIAMOND: "💎 Diamond",
  CHAMPION: "💗 Champion"
};

function normalizeRankName(rank) {
  const value = String(rank || "UNRANKED").trim().toUpperCase();
  if (value.includes("CHAMPION")) return "CHAMPION";
  if (value.includes("DIAMOND")) return "DIAMOND";
  if (value.includes("EMERALD")) return "EMERALD";
  if (value.includes("PLATINUM")) return "PLATINUM";
  if (value.includes("GOLD")) return "GOLD";
  if (value.includes("SILVER")) return "SILVER";
  if (value.includes("BRONZE")) return "BRONZE";
  if (value.includes("COPPER")) return "COPPER";
  return "UNRANKED";
}

async function assignRankRole(guild, discordId, rank) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;

  const targetRankKey = normalizeRankName(rank);
  const targetRoleName = R6_RANK_ROLE_NAMES[targetRankKey];
  const allRankNames = Object.values(R6_RANK_ROLE_NAMES).map(name => name.toLowerCase());

  const rolesToRemove = member.roles.cache.filter(role => allRankNames.includes(role.name.toLowerCase()));
  for (const role of rolesToRemove.values()) {
    if (role.name !== targetRoleName) {
      await member.roles.remove(role).catch(error => {
        log(`Remove rank role error | User=${discordId} | Role=${role.name} | ${error.message}`);
      });
    }
  }

  const targetRole = guild.roles.cache.find(role => role.name.toLowerCase() === targetRoleName.toLowerCase());
  if (!targetRole) {
    log(`Rank role not found: ${targetRoleName}. Main bot must create rank roles.`);
    return false;
  }

  if (!member.roles.cache.has(targetRole.id)) {
    await member.roles.add(targetRole).catch(error => {
      log(`Assign rank role error | User=${discordId} | Role=${targetRoleName} | ${error.message}`);
    });
  }

  return true;
}

function numericValue(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace("%", "").replace(",", "").trim());
  return Number.isFinite(n) ? n : null;
}

function getProfileDisplayName(profile, discordId) {
  return profile?.ubisoftName || profile?.discordTag || discordId;
}

function buildLeaderboards() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const stats = loadJson(R6_STATS_FILE);

  const rows = Object.entries(profiles)
    .map(([discordId, profile]) => {
      const item = stats[discordId];
      if (!item || !item.ok || profile.status !== PROFILE_STATUS.ACTIVE) return null;

      return {
        discordId,
        name: getProfileDisplayName(profile, discordId),
        ubisoftName: profile.ubisoftName,
        role: profile.role || null,
        region: profile.region || null,
        rank: item.fields?.rank || null,
        rp: numericValue(item.fields?.rp),
        kd: numericValue(item.fields?.kd),
        winRate: numericValue(item.fields?.winRate),
        level: numericValue(item.fields?.level),
        matches: numericValue(item.fields?.matches),
        lastSync: item.scrapedAt
      };
    })
    .filter(Boolean);

  const topBy = (metric, limit = 100) =>
    rows
      .filter(row => row[metric] !== null && row[metric] !== undefined)
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, limit);

  const now = new Date();
  const period = {
    generatedAt: now.toISOString(),
    week: `${now.getUTCFullYear()}-W${Math.ceil((((now - new Date(Date.UTC(now.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7)}`,
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`
  };

  const leaderboards = {
    period,
    totals: {
      activeProfiles: rows.length,
      linkedProfiles: Object.keys(profiles).length,
      syncedProfiles: Object.values(stats).filter(s => s.ok).length
    },
    allTime: {
      rp: topBy("rp"),
      kd: topBy("kd"),
      winRate: topBy("winRate"),
      level: topBy("level"),
      matches: topBy("matches")
    },
    weekly: {
      rp: topBy("rp"),
      kd: topBy("kd"),
      winRate: topBy("winRate"),
      level: topBy("level"),
      matches: topBy("matches")
    },
    monthly: {
      rp: topBy("rp"),
      kd: topBy("kd"),
      winRate: topBy("winRate"),
      level: topBy("level"),
      matches: topBy("matches")
    },
    recognition: {
      monthlyTopRP: topBy("rp", 1)[0] || null,
      monthlyTopKD: topBy("kd", 1)[0] || null,
      monthlyTopWinRate: topBy("winRate", 1)[0] || null
    }
  };

  saveJson(R6_LEADERBOARDS_FILE, leaderboards);
  return leaderboards;
}

function leaderboardEmbed(metric = "rp", period = "monthly") {
  const leaderboards = loadJson(R6_LEADERBOARDS_FILE);
  const validMetric = ["rp", "kd", "winRate", "level", "matches"].includes(metric) ? metric : "rp";
  const validPeriod = ["weekly", "monthly", "allTime"].includes(period) ? period : "monthly";
  const rows = leaderboards?.[validPeriod]?.[validMetric] || [];

  const labels = {
    rp: "RP",
    kd: "KD",
    winRate: "Win Rate",
    level: "Level",
    matches: "Matches"
  };

  const periodLabels = {
    weekly: "Semanal",
    monthly: "Mensual",
    allTime: "Histórico"
  };

  const text = rows.length
    ? rows.slice(0, 10).map((row, index) => {
        const value = validMetric === "winRate" ? `${row[validMetric]}%` : row[validMetric];
        const rank = row.rank ? ` | ${row.rank}` : "";
        return `**${index + 1}. ${row.name}** — ${value}${rank}`;
      }).join("\n")
    : "Sin datos suficientes para generar este ranking.";

  return new EmbedBuilder()
    .setColor("#FFD700")
    .setTitle(`🏅 Ranking ${periodLabels[validPeriod]} | Top ${labels[validMetric]}`)
    .setDescription(text)
    .addFields(
      {
        name: "🎖️ Reconocimiento mensual",
        value:
          "Los líderes mensuales podrán recibir menciones oficiales, rol temporal destacado, visibilidad en Hall of Fame o reconocimiento comunitario no monetario."
      }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | Generado: ${leaderboards?.period?.generatedAt || "N/A"}` });
}

function r6StatsPanelEmbed() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const stats = loadJson(R6_STATS_FILE);
  const leaderboards = loadJson(R6_LEADERBOARDS_FILE);

  const active = Object.values(profiles).filter(p => p.status === PROFILE_STATUS.ACTIVE).length;
  const stale = Object.values(profiles).filter(p => p.status === PROFILE_STATUS.STALE).length;
  const disabled = Object.values(profiles).filter(p => p.status === PROFILE_STATUS.DISABLED).length;
  const synced = Object.values(stats).filter(s => s.ok).length;

  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("📈 R6 Stats | Rainbow Six CUBA")
    .setDescription(
      "Panel interactivo del sistema competitivo. Vincula tu perfil, revisa tu información y accede a rankings sin escribir comandos manualmente."
    )
    .addFields(
      { name: "Perfiles activos", value: String(active), inline: true },
      { name: "Sincronizados", value: String(synced), inline: true },
      { name: "Stale / Disabled", value: `${stale} / ${disabled}`, inline: true },
      { name: "Último ranking", value: leaderboards?.period?.generatedAt || "Pendiente", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | Sync cada ${SYNC_INTERVAL_MINUTES} min` });
}

function r6StatsPanelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("r6_panel_my_profile").setLabel("Mi Perfil").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("r6_panel_resync").setLabel("Re-Sync").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("r6_panel_top_rp").setLabel("Top RP").setEmoji("🏅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("r6_panel_top_kd").setLabel("Top KD").setEmoji("⚔️").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("r6_panel_top_wr").setLabel("Top WR").setEmoji("📈").setStyle(ButtonStyle.Success)
    )
  ];
}

function ubisoftConnectEmbed() {
  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("🔗 Conectar Ubisoft | Rainbow Six CUBA")
    .setDescription(
      "Conecta tu Ubisoft ID para habilitar funciones competitivas dentro de Rainbow Six CUBA.\n\n" +
      "El bot hará una validación en vivo contra R6 Tracker. Si el perfil no devuelve estadísticas válidas, no será guardado y podrás intentar nuevamente."
    )
    .addFields(
      {
        name: "⚠️ Importante",
        value:
          "El usuario que escribas debe ser el mismo que usas en tu cuenta de Ubisoft para Rainbow Six Siege.\n\n" +
          "Si no completas esta conexión, no tendrás limitaciones dentro de la comunidad general, pero no podrás participar en eventos competitivos, rankings o funciones que dependan de estadísticas verificadas."
      },
      {
        name: "✅ Qué se valida",
        value:
          "• Perfil público de R6 Tracker.\n" +
          "• Rank / RP / KD / Win Rate cuando estén disponibles.\n" +
          "• Que el perfil pueda sincronizarse correctamente.\n" +
          "• Rol visual de rango según R6 Tracker. Estos roles no dan privilegios."
      }
    )
    .setFooter({ text: "RainbowSixCubaStats | Ubisoft Connect • Live Test • R6 Tracker" });
}

function ubisoftConnectRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("r6_connect_start")
        .setLabel("Conectar Ubisoft")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("r6_panel_my_profile")
        .setLabel("Ver mi perfil")
        .setEmoji("🎮")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("r6_panel_resync")
        .setLabel("Re-Sync")
        .setEmoji("🔄")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function ubisoftConnectModal() {
  const modal = new ModalBuilder()
    .setCustomId("r6_connect_modal")
    .setTitle("Conectar Ubisoft");

  const username = new TextInputBuilder()
    .setCustomId("ubisoft")
    .setLabel("Ubisoft username o R6 Tracker URL")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ejemplo: exdeusdead")
    .setRequired(true)
    .setMaxLength(200);

  const region = new TextInputBuilder()
    .setCustomId("region")
    .setLabel("Región principal")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ejemplo: NA, LATAM, EU")
    .setRequired(false)
    .setMaxLength(40);

  const role = new TextInputBuilder()
    .setCustomId("role")
    .setLabel("Rol principal")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Ejemplo: Entry, Support, Flex, IGL")
    .setRequired(false)
    .setMaxLength(80);

  modal.addComponents(
    new ActionRowBuilder().addComponents(username),
    new ActionRowBuilder().addComponents(region),
    new ActionRowBuilder().addComponents(role)
  );

  return modal;
}

async function assignUbisoftConnectedRole(guild, discordId) {
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return false;

  const role = guild.roles.cache.find(r => r.name.toLowerCase().includes("ubisoft conectado"));
  if (!role) {
    log("Ubisoft connected role not found. Main bot must create role: 🔗 Ubisoft Conectado");
    return false;
  }

  await member.roles.add(role).catch(error => {
    log(`Assign Ubisoft connected role error: ${error.stack || error.message}`);
  });

  return true;
}

async function publishConnectPanel(client) {
  const guild = GUILD_ID ? await client.guilds.fetch(GUILD_ID).catch(() => null) : client.guilds.cache.first();
  if (!guild) return;

  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return;

  const channel = channels.find(c => c && c.name === CONNECT_CHANNEL_NAME);
  if (!channel || !channel.isTextBased()) {
    log(`Connect channel not found: ${CONNECT_CHANNEL_NAME}`);
    return;
  }

  await channel.send({ embeds: [ubisoftConnectEmbed()], components: ubisoftConnectRows() }).catch(error => {
    log(`Publish connect panel error: ${error.stack || error.message}`);
  });
}





function normalizeTrackerUrl(input) {
  const value = String(input || "").trim();

  if (!value) return null;

  if (value.startsWith("https://r6.tracker.network/r6siege/profile/")) {
    return value;
  }

  if (/^[a-zA-Z0-9_.-]{3,32}$/.test(value)) {
    return `https://r6.tracker.network/r6siege/profile/ubi/${encodeURIComponent(value)}/overview`;
  }

  return null;
}

function extractUbisoftNameFromUrl(url) {
  const match = String(url).match(/\/profile\/ubi\/([^/]+)\//i);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  return member.roles.cache.some(role => {
    const name = role.name.toLowerCase();
    return name.includes("manager") || name.includes("moderador") || name.includes("organizador");
  });
}

async function scrapeR6TrackerProfile(profileUrl) {
  let browser;

  const result = {
    ok: false,
    profileUrl,
    scrapedAt: new Date().toISOString(),
    source: "r6.tracker.network",
    rawTextSample: null,
    fields: {
      ubisoftName: extractUbisoftNameFromUrl(profileUrl),
      rank: null,
      rp: null,
      kd: null,
      winRate: null,
      matches: null,
      level: null,
      topOperators: []
    },
    error: null
  };

  try {
    browser = await puppeteer.launch({
      headless: HEADLESS ? "new" : false,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1366,768"
      ]
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    );

    await page.goto(profileUrl, { waitUntil: "networkidle2", timeout: 90000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    const pageData = await page.evaluate(() => {
      const bodyText = document.body ? document.body.innerText : "";
      const title = document.title;

      const meta = {};
      for (const m of document.querySelectorAll("meta")) {
        const key = m.getAttribute("name") || m.getAttribute("property");
        const value = m.getAttribute("content");
        if (key && value) meta[key] = value;
      }

      const candidateStats = [];
      const textBlocks = Array.from(document.querySelectorAll("body *"))
        .map(el => (el.innerText || "").trim())
        .filter(Boolean)
        .filter(t => t.length < 300);

      for (const text of textBlocks) {
        if (/rank|rating|rp|kd|k\/d|win|matches|level|operator|champion|diamond|emerald|platinum|gold|silver|bronze|copper/i.test(text)) {
          candidateStats.push(text);
        }
      }

      return {
        title,
        meta,
        bodyText: bodyText.slice(0, 15000),
        candidateStats: Array.from(new Set(candidateStats)).slice(0, 200)
      };
    });

    result.rawTextSample = pageData.bodyText.slice(0, 2000);

    const text = `${pageData.title}\n${Object.values(pageData.meta).join("\n")}\n${pageData.bodyText}\n${pageData.candidateStats.join("\n")}`;

    const rankMatch = text.match(/\b(Champion|Diamond|Emerald|Platinum|Gold|Silver|Bronze|Copper)\b/i);
    if (rankMatch) result.fields.rank = rankMatch[1];

    const rpMatch = text.match(/\b(?:RP|Rating)\s*[:\n ]+\s*([0-9,]{3,5})\b/i);
    if (rpMatch) result.fields.rp = rpMatch[1].replace(",", "");

    const kdMatch =
      text.match(/\b(?:KD|K\/D|K-D)\s*[:\n ]+\s*([0-9]+(?:\.[0-9]+)?)\b/i) ||
      text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*(?:KD|K\/D)\b/i);
    if (kdMatch) result.fields.kd = kdMatch[1];

    const wrMatch =
      text.match(/\b(?:Win Rate|Winrate|W\/L)\s*[:\n ]+\s*([0-9]+(?:\.[0-9]+)?%?)\b/i) ||
      text.match(/\b([0-9]+(?:\.[0-9]+)?%)\s*(?:Win Rate|Winrate)\b/i);
    if (wrMatch) result.fields.winRate = wrMatch[1];

    const levelMatch = text.match(/\b(?:Level)\s*[:\n ]+\s*([0-9]{1,4})\b/i);
    if (levelMatch) result.fields.level = levelMatch[1];

    const matchesMatch = text.match(/\b(?:Matches)\s*[:\n ]+\s*([0-9,]{1,6})\b/i);
    if (matchesMatch) result.fields.matches = matchesMatch[1].replace(",", "");

    result.ok = Boolean(result.fields.rank || result.fields.rp || result.fields.kd || result.fields.winRate || result.fields.level || result.fields.matches);

    if (!result.ok) {
      result.error = "No recognizable stats found. Page may be protected, changed, or fully client-rendered.";
    }

    return result;
  } catch (error) {
    result.error = error.stack || error.message;
    return result;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

function r6ProfileEmbed(profile, stats) {
  const fields = stats?.fields || {};

  return new EmbedBuilder()
    .setColor(stats?.ok ? "#00BFFF" : "#FFA500")
    .setTitle(`🎮 R6 Profile | ${profile.ubisoftName || fields.ubisoftName || "Unknown"}`)
    .setDescription(
      stats?.ok
        ? "Perfil competitivo sincronizado desde R6 Tracker."
        : "Perfil vinculado. La sincronización automática todavía no obtuvo estadísticas confiables."
    )
    .addFields(
      { name: "Ubisoft", value: profile.ubisoftName || fields.ubisoftName || "N/A", inline: true },
      { name: "Platform", value: profile.platform || "ubi", inline: true },
      { name: "Region", value: profile.region || "N/A", inline: true },
      { name: "Rank", value: fields.rank || "Pendiente", inline: true },
      { name: "RP", value: String(fields.rp || "Pendiente"), inline: true },
      { name: "KD", value: String(fields.kd || "Pendiente"), inline: true },
      { name: "Win Rate", value: String(fields.winRate || "Pendiente"), inline: true },
      { name: "Level", value: String(fields.level || "Pendiente"), inline: true },
      { name: "Matches", value: String(fields.matches || "Pendiente"), inline: true },
      { name: "R6 Tracker", value: profile.trackerUrl || stats?.profileUrl || "N/A", inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | Last Sync: ${stats?.scrapedAt || "Never"}` });
}

function communityR6SummaryEmbed() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const stats = loadJson(R6_STATS_FILE);

  const linked = Object.keys(profiles).length;
  const synced = Object.values(stats).filter(s => s.ok).length;
  const failed = Object.values(stats).filter(s => !s.ok).length;

  const rankCounts = {};
  for (const item of Object.values(stats)) {
    const rank = item?.fields?.rank;
    if (!rank) continue;
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  }

  const rankText = Object.entries(rankCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([rank, count]) => `• ${rank}: ${count}`)
    .join("\n") || "Sin rangos sincronizados todavía.";

  return new EmbedBuilder()
    .setColor("#00BFFF")
    .setTitle("📊 R6 Stats | Rainbow Six CUBA")
    .setDescription("Resumen experimental de perfiles vinculados y estadísticas obtenidas desde R6 Tracker.")
    .addFields(
      { name: "Perfiles vinculados", value: String(linked), inline: true },
      { name: "Sincronizados", value: String(synced), inline: true },
      { name: "Fallidos", value: String(failed), inline: true },
      { name: "Distribución de rangos", value: rankText, inline: false }
    )
    .setFooter({ text: `RainbowSixCubaStats ${BOT_VERSION} | Sync cada ${SYNC_INTERVAL_MINUTES} min` });
}

async function syncOneProfile(discordId) {
  const profiles = loadJson(R6_PROFILES_FILE);
  const stats = loadJson(R6_STATS_FILE);
  const profile = profiles[discordId];

  if (!profile) return { ok: false, error: "Profile not found." };

  log(`Sync started | User=${discordId} | URL=${profile.trackerUrl}`);

  const result = await scrapeR6TrackerProfile(profile.trackerUrl);
  stats[discordId] = result;

  if (result.ok) {
    profiles[discordId].status = PROFILE_STATUS.ACTIVE;
    profiles[discordId].syncFailures = 0;
    profiles[discordId].lastSuccessfulSync = result.scrapedAt;
    profiles[discordId].lastSyncError = null;

    // Visual rank role only. No privileges are attached to rank roles.
    // Requires RainbowSixCubaStats bot role to be above rank roles.
    if (globalThis.__r6StatsGuild) {
      await assignRankRole(globalThis.__r6StatsGuild, discordId, result.fields?.rank);
    }
  } else {
    profiles[discordId].syncFailures = Number(profile.syncFailures || 0) + 1;
    profiles[discordId].lastSyncError = result.error || "Unknown sync error";

    if (profiles[discordId].syncFailures >= 10) profiles[discordId].status = PROFILE_STATUS.DISABLED;
    else if (profiles[discordId].syncFailures >= 3) profiles[discordId].status = PROFILE_STATUS.STALE;
  }

  saveJson(R6_STATS_FILE, stats);
  saveJson(R6_PROFILES_FILE, profiles);

  log(`Sync finished | User=${discordId} | OK=${result.ok} | Status=${profiles[discordId].status} | Failures=${profiles[discordId].syncFailures || 0} | Error=${result.error || "none"}`);

  return result;
}

async function syncAllProfiles() {
  const profiles = loadJson(R6_PROFILES_FILE);
  const ids = Object.keys(profiles).filter(id => profiles[id].status !== PROFILE_STATUS.DISABLED);

  log(`Full sync started | Profiles=${ids.length}`);

  for (const discordId of ids) {
    await syncOneProfile(discordId);
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  buildLeaderboards();
  log("Full sync completed | Leaderboards rebuilt");
}

async function publishStatsSummary(client) {
  const guild = GUILD_ID ? await client.guilds.fetch(GUILD_ID).catch(() => null) : client.guilds.cache.first();
  if (!guild) return;

  const channels = await guild.channels.fetch().catch(() => null);
  if (!channels) return;

  const statsChannel = channels.find(c => c && c.name === STATS_CHANNEL_NAME);
  if (statsChannel && statsChannel.isTextBased()) {
    await statsChannel.send({ embeds: [r6StatsPanelEmbed()], components: r6StatsPanelRows() }).catch(error => {
      log(`Publish stats panel error: ${error.stack || error.message}`);
    });
  }

  const rankingsChannel = channels.find(c => c && c.name === RANKINGS_CHANNEL_NAME);
  if (rankingsChannel && rankingsChannel.isTextBased()) {
    await rankingsChannel.send({
      embeds: [
        leaderboardEmbed("rp", "weekly"),
        leaderboardEmbed("rp", "monthly"),
        leaderboardEmbed("kd", "monthly"),
        leaderboardEmbed("winRate", "monthly")
      ]
    }).catch(error => {
      log(`Publish rankings error: ${error.stack || error.message}`);
    });
  }
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder()
      .setName("r6link")
      .setDescription("Vincula un perfil público de R6 Tracker.")
      .addStringOption(option => option.setName("ubisoft").setDescription("Ubisoft username o URL pública de R6 Tracker.").setRequired(true))
      .addStringOption(option => option.setName("region").setDescription("Región principal: NA, LATAM, EU, etc.").setRequired(false))
      .addStringOption(option => option.setName("role").setDescription("Rol principal: Entry, Support, Flex, IGL, etc.").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6profile")
      .setDescription("Muestra tu perfil competitivo vinculado.")
      .addUserOption(option => option.setName("usuario").setDescription("Usuario a revisar.").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6sync")
      .setDescription("Staff: sincroniza perfiles R6 Tracker.")
      .addUserOption(option => option.setName("usuario").setDescription("Sincronizar un usuario específico.").setRequired(false)),

    new SlashCommandBuilder()
      .setName("r6summary")
      .setDescription("Muestra resumen experimental de perfiles R6 vinculados."),

    new SlashCommandBuilder()
      .setName("r6leaderboard")
      .setDescription("Muestra un ranking R6 precalculado.")
      .addStringOption(option =>
        option
          .setName("metric")
          .setDescription("Métrica del ranking.")
          .setRequired(true)
          .addChoices(
            { name: "RP", value: "rp" },
            { name: "KD", value: "kd" },
            { name: "Win Rate", value: "winRate" },
            { name: "Level", value: "level" },
            { name: "Matches", value: "matches" }
          )
      )
      .addStringOption(option =>
        option
          .setName("period")
          .setDescription("Periodo del ranking.")
          .setRequired(false)
          .addChoices(
            { name: "Semanal", value: "weekly" },
            { name: "Mensual", value: "monthly" },
            { name: "Histórico", value: "allTime" }
          )
      ),

    new SlashCommandBuilder()
      .setName("r6resync")
      .setDescription("Re-sincroniza tu perfil R6 vinculado.")
  ];

  await guild.commands.set(commands.map(c => c.toJSON()));
  log("Slash commands registered: /r6link /r6profile /r6sync /r6summary /r6leaderboard /r6resync");
}

client.once("clientReady", async () => {
  log(`${client.user.tag} ONLINE | ${BOT_VERSION}`);

  const guild = GUILD_ID ? await client.guilds.fetch(GUILD_ID).catch(() => null) : client.guilds.cache.first();

  if (!guild) {
    log("No guild found.");
    return;
  }

  globalThis.__r6StatsGuild = guild;
  await registerCommands(guild);

  setInterval(async () => {
    await syncAllProfiles();
    await publishStatsSummary(client);
  }, SYNC_INTERVAL_MINUTES * 60 * 1000);

  buildLeaderboards();
  await publishConnectPanel(client);
  await publishStatsSummary(client);
  log(`Auto sync interval set to ${SYNC_INTERVAL_MINUTES} minutes`);
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === "r6_connect_start") {
        return interaction.showModal(ubisoftConnectModal());
      }

      if (interaction.customId === "r6_panel_my_profile") {
        const profiles = loadJson(R6_PROFILES_FILE);
        const stats = loadJson(R6_STATS_FILE);
        const profile = profiles[interaction.user.id];

        if (!profile) {
          return interaction.reply({ content: "❌ No tienes perfil R6 vinculado. Usa /r6link primero.", flags: MessageFlags.Ephemeral });
        }

        return interaction.reply({ embeds: [r6ProfileEmbed(profile, stats[interaction.user.id])], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === "r6_panel_resync") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const profiles = loadJson(R6_PROFILES_FILE);
        if (!profiles[interaction.user.id]) {
          return interaction.editReply("❌ No tienes perfil R6 vinculado. Usa /r6link primero.");
        }

        const result = await syncOneProfile(interaction.user.id);
        buildLeaderboards();

        return interaction.editReply(
          result.ok
            ? `✅ Perfil re-sincronizado. Rank: **${result.fields.rank || "N/A"}** | RP: **${result.fields.rp || "N/A"}** | KD: **${result.fields.kd || "N/A"}**`
            : `⚠️ No pude re-sincronizar ahora. Intentaremos nuevamente en el próximo ciclo.\n\n${result.error || "Sin detalles."}`
        );
      }

      if (interaction.customId === "r6_panel_top_rp") {
        buildLeaderboards();
        return interaction.reply({ embeds: [leaderboardEmbed("rp", "monthly")], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === "r6_panel_top_kd") {
        buildLeaderboards();
        return interaction.reply({ embeds: [leaderboardEmbed("kd", "monthly")], flags: MessageFlags.Ephemeral });
      }

      if (interaction.customId === "r6_panel_top_wr") {
        buildLeaderboards();
        return interaction.reply({ embeds: [leaderboardEmbed("winRate", "monthly")], flags: MessageFlags.Ephemeral });
      }
    }


    if (interaction.isModalSubmit() && interaction.customId === "r6_connect_modal") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const input = interaction.fields.getTextInputValue("ubisoft");
      const region = interaction.fields.getTextInputValue("region") || null;
      const role = interaction.fields.getTextInputValue("role") || null;
      const trackerUrl = normalizeTrackerUrl(input);

      if (!trackerUrl) {
        return interaction.editReply("❌ Usuario o URL inválido. Escribe tu Ubisoft username o una URL pública de R6 Tracker.");
      }

      const ubisoftName = extractUbisoftNameFromUrl(trackerUrl) || input;
      const liveTest = await scrapeR6TrackerProfile(trackerUrl);

      if (!liveTest.ok) {
        return interaction.editReply(
          `❌ No pude validar este perfil en vivo.\n\n` +
          `Ubisoft/URL: **${ubisoftName}**\n` +
          `Motivo: ${liveTest.error || "No se encontraron estadísticas reconocibles."}\n\n` +
          `El perfil no fue guardado. Puedes corregir el usuario/URL e intentarlo nuevamente.`
        );
      }

      const profiles = loadJson(R6_PROFILES_FILE);
      const stats = loadJson(R6_STATS_FILE);

      profiles[interaction.user.id] = {
        discordId: interaction.user.id,
        discordTag: interaction.user.tag,
        ubisoftName,
        trackerUrl,
        platform: "ubi",
        region,
        role,
        status: PROFILE_STATUS.ACTIVE,
        syncFailures: 0,
        linkedAt: new Date().toISOString(),
        lastSuccessfulSync: liveTest.scrapedAt,
        lastSyncError: null
      };

      stats[interaction.user.id] = liveTest;

      saveJson(R6_PROFILES_FILE, profiles);
      saveJson(R6_STATS_FILE, stats);
      buildLeaderboards();

      await assignUbisoftConnectedRole(interaction.guild, interaction.user.id);
      await assignRankRole(interaction.guild, interaction.user.id, liveTest.fields?.rank);

      return interaction.editReply(
        `✅ Ubisoft conectado y validado en vivo.\n\n` +
        `Ubisoft: **${ubisoftName}**\n` +
        `Rank: **${liveTest.fields.rank || "N/A"}**\n` +
        `RP: **${liveTest.fields.rp || "N/A"}**\n` +
        `KD: **${liveTest.fields.kd || "N/A"}**\n` +
        `Win Rate: **${liveTest.fields.winRate || "N/A"}**\n\n` +
        `Ya puedes aparecer en rankings y participar en funciones competitivas que requieran estadísticas verificadas.`
      );
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "r6link") {
      const input = interaction.options.getString("ubisoft", true);
      const region = interaction.options.getString("region") || null;
      const role = interaction.options.getString("role") || null;
      const trackerUrl = normalizeTrackerUrl(input);

      if (!trackerUrl) {
        return interaction.reply({
          content: "❌ URL o Ubisoft username inválido. Usa tu nickname Ubisoft o una URL pública de R6 Tracker.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const ubisoftName = extractUbisoftNameFromUrl(trackerUrl) || input;

      const liveTest = await scrapeR6TrackerProfile(trackerUrl);

      if (!liveTest.ok) {
        return interaction.editReply({
          content:
            `❌ No pude validar este perfil en vivo.\n\n` +
            `Ubisoft/URL: **${ubisoftName}**\n` +
            `Motivo: ${liveTest.error || "No se encontraron estadísticas reconocibles."}\n\n` +
            `Puedes revisar el nombre/URL e intentar nuevamente. El perfil no fue guardado.`
        });
      }

      const profiles = loadJson(R6_PROFILES_FILE);
      const stats = loadJson(R6_STATS_FILE);

      profiles[interaction.user.id] = {
        discordId: interaction.user.id,
        discordTag: interaction.user.tag,
        ubisoftName,
        trackerUrl,
        platform: "ubi",
        region,
        role,
        status: PROFILE_STATUS.ACTIVE,
        syncFailures: 0,
        linkedAt: new Date().toISOString(),
        lastSuccessfulSync: liveTest.scrapedAt,
        lastSyncError: null
      };

      stats[interaction.user.id] = liveTest;

      saveJson(R6_PROFILES_FILE, profiles);
      saveJson(R6_STATS_FILE, stats);
      buildLeaderboards();
      await assignUbisoftConnectedRole(interaction.guild, interaction.user.id);
      await assignRankRole(interaction.guild, interaction.user.id, liveTest.fields?.rank);

      return interaction.editReply({
        content:
          `✅ Perfil R6 vinculado y validado en vivo.\n\n` +
          `Ubisoft: **${ubisoftName}**\n` +
          `Rank: **${liveTest.fields.rank || "N/A"}**\n` +
          `RP: **${liveTest.fields.rp || "N/A"}**\n` +
          `KD: **${liveTest.fields.kd || "N/A"}**\n` +
          `Win Rate: **${liveTest.fields.winRate || "N/A"}**\n\n` +
          `Este perfil ya entra al sistema de sincronización y rankings.`
      });
    }

    if (interaction.commandName === "r6profile") {
      const target = interaction.options.getUser("usuario") || interaction.user;
      const profiles = loadJson(R6_PROFILES_FILE);
      const stats = loadJson(R6_STATS_FILE);
      const profile = profiles[target.id];

      if (!profile) {
        return interaction.reply({ content: "❌ Este usuario no tiene perfil R6 vinculado.", flags: MessageFlags.Ephemeral });
      }

      return interaction.reply({ embeds: [r6ProfileEmbed(profile, stats[target.id])], flags: MessageFlags.Ephemeral });
    }

    if (interaction.commandName === "r6sync") {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: "❌ Solo Staff puede usar este comando.", flags: MessageFlags.Ephemeral });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const target = interaction.options.getUser("usuario");

      if (target) {
        const result = await syncOneProfile(target.id);
        return interaction.editReply({
          content: result.ok
            ? `✅ Sincronización completada para ${target.tag}.`
            : `⚠️ Sincronización falló o no encontró datos claros para ${target.tag}.\n\n${result.error || "Sin detalles."}`
        });
      }

      await syncAllProfiles();
      await publishStatsSummary(client);
      return interaction.editReply({ content: "✅ Sincronización general completada. Rankings y paneles actualizados." });
    }

    if (interaction.commandName === "r6leaderboard") {
      const metric = interaction.options.getString("metric", true);
      const period = interaction.options.getString("period") || "monthly";
      buildLeaderboards();

      return interaction.reply({
        embeds: [leaderboardEmbed(metric, period)],
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.commandName === "r6resync") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const profiles = loadJson(R6_PROFILES_FILE);
      if (!profiles[interaction.user.id]) {
        return interaction.editReply("❌ No tienes perfil R6 vinculado. Usa /r6link primero.");
      }

      const result = await syncOneProfile(interaction.user.id);
      buildLeaderboards();

      return interaction.editReply(
        result.ok
          ? `✅ Perfil re-sincronizado. Rank: **${result.fields.rank || "N/A"}** | RP: **${result.fields.rp || "N/A"}** | KD: **${result.fields.kd || "N/A"}**`
          : `⚠️ No pude re-sincronizar ahora. Tu perfil no fue eliminado. Intentaremos nuevamente en el próximo ciclo.\n\n${result.error || "Sin detalles."}`
      );
    }

    if (interaction.commandName === "r6summary") {
      return interaction.reply({ embeds: [communityR6SummaryEmbed()], flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    log(`Interaction error: ${error.stack || error.message}`);

    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("❌ Error procesando la interacción. Revisa logs/r6stats/r6stats.log");
    }

    return interaction.reply({
      content: "❌ Error procesando la interacción. Revisa logs/r6stats/r6stats.log",
      flags: MessageFlags.Ephemeral
    });
  }
});

client.login(TOKEN);
