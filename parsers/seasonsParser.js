function cleanNumber(value) {
  if (value === null || value === undefined) return null;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace("%", "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isSeasonName(text) {
  return /^Y\d+\s/.test(text);
}

function parseSeasons(rawText) {

  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const seasons = [];

  for (let i = 0; i < lines.length; i++) {

    if (!isSeasonName(lines[i])) continue;

    const seasonName = lines[i];

    let end = lines.length;

    for (let k = i + 1; k < lines.length; k++) {
      if (isSeasonName(lines[k])) {
        end = k;
        break;
      }
    }

    const block = lines.slice(i, end);

    const season = {
      season: seasonName,
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

    const values = [];

    for (const line of block) {

      if (
        line.includes("Top") ||
        line.includes("Bottom") ||
        line.startsWith("#")
      ) {
        continue;
      }

      const n = cleanNumber(line);

      if (n !== null) {
        values.push(n);
      }
    }

    if (values.length >= 11) {
      season.latestRank = values[0];
      season.maxRank = values[1];
      season.kd = values[2];
      season.winRate = values[3];
      season.matches = values[4];
      season.wins = values[5];
      season.losses = values[6];
      season.avgKills = values[7];
      season.kills = values[8];
      season.deaths = values[9];
      season.abandons = values[10];
    }

    seasons.push(season);
  }

  return seasons;
}

module.exports = {
  parseSeasons
};