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

function parseOperators(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const operators = [];

  const headerIndex = lines.findIndex((line, i) =>
    line === "Operator" &&
    lines[i + 1] === "Rounds Played" &&
    lines[i + 2] === "Win %" &&
    lines[i + 3] === "K/D"
  );

  if (headerIndex === -1) return operators;

  let i = headerIndex + 11;

  while (i < lines.length - 11) {
    const name = lines[i];

    if (
      !name ||
      name.includes("Premium users") ||
      name.includes("Upgrade for") ||
      name.includes("© Tracker")
    ) {
      break;
    }

    const row = {
      name,
      rounds: cleanNumber(lines[i + 1]),
      winRate: cleanNumber(lines[i + 2]),
      kd: cleanNumber(lines[i + 3]),
      headshotRate: cleanNumber(lines[i + 4]),
      wins: cleanNumber(lines[i + 5]),
      losses: cleanNumber(lines[i + 6]),
      kills: cleanNumber(lines[i + 7]),
      deaths: cleanNumber(lines[i + 8]),
      assists: cleanNumber(lines[i + 9]),
      aces: cleanNumber(lines[i + 10]),
      teamKills: cleanNumber(lines[i + 11])
    };

    if (!row.name || row.rounds === null || row.winRate === null || row.kd === null) {
      i++;
      continue;
    }

    operators.push(row);
    i += 12;
  }

  return operators;
}

module.exports = {
  parseOperators
};