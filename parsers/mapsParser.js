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

function parseMaps(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const maps = [];

  const headerIndex = lines.findIndex((line, i) =>
    line === "Map" &&
    lines[i + 1] === "Matches" &&
    lines[i + 2] === "Win %" &&
    lines[i + 3] === "Wins"
  );

  if (headerIndex === -1) return maps;

  let i = headerIndex + 10;

  while (i < lines.length - 9) {
    const mapName = lines[i];

    if (
      !mapName ||
      mapName.includes("Premium users") ||
      mapName.includes("Upgrade for") ||
      mapName.includes("© Tracker")
    ) {
      break;
    }

    const row = {
      map: mapName,
      matches: cleanNumber(lines[i + 1]),
      winRate: cleanNumber(lines[i + 2]),
      wins: cleanNumber(lines[i + 3]),
      losses: cleanNumber(lines[i + 4]),
      kd: cleanNumber(lines[i + 5]),
      attackWinRate: cleanNumber(lines[i + 6]),
      defenseWinRate: cleanNumber(lines[i + 7]),
      headshotRate: cleanNumber(lines[i + 8]),
      esr: cleanNumber(lines[i + 9])
    };

    if (
      !row.map ||
      row.matches === null ||
      row.winRate === null
    ) {
      i++;
      continue;
    }

    maps.push(row);
    i += 10;
  }

  return maps;
}

module.exports = {
  parseMaps
};