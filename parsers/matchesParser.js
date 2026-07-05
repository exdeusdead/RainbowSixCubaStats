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

function parseMatches(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const matches = [];

  for (let i = 0; i < lines.length; i++) {

    if (!/^\d+d ago/i.test(lines[i])) continue;

    const map = lines[i].replace(/^\d+d ago/i, "").trim();

    let end = lines.length;

    for (let k = i + 1; k < lines.length; k++) {
      if (/^\d+d ago/i.test(lines[k])) {
        end = k;
        break;
      }
    }

    const block = lines.slice(i, end);

    const match = {
      map,
      score: null,
      rp: null,
      rpDelta: null,
      kd: null,
      kills: null,
      deaths: null,
      assists: null,
      headshotRate: null
    };

    for (let j = 0; j < block.length; j++) {

      if (
        block[j] === "Score" &&
        block[j + 1] &&
        block[j + 2] === ":" &&
        block[j + 3]
      ) {
        match.score = `${block[j + 1]}-${block[j + 3]}`;
      }

      if (block[j] === "RP") {
        match.rp = cleanNumber(block[j + 1]);
        match.rpDelta = cleanNumber(block[j + 2]);
      }

      if (block[j] === "K/D") {
        match.kd = cleanNumber(block[j + 1]);
      }

      if (block[j] === "K/D/A") {
        match.kills = cleanNumber(block[j + 1]);
        match.deaths = cleanNumber(block[j + 2]);
        match.assists = cleanNumber(block[j + 3]);
      }

      if (block[j] === "HS %") {
        match.headshotRate = cleanNumber(block[j + 1]);
      }
    }

    matches.push(match);
  }

  return matches;
}

module.exports = {
  parseMatches
};