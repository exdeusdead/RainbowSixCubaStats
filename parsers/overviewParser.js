function cleanNumber(value) {
  if (value === null || value === undefined) return null;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace("%", "")
    .trim();

  const n = Number(cleaned);

  return Number.isFinite(n) ? n : null;
}

function parseOverview(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);

  const joined = lines.join("\n");

  const rankMatch = joined.match(
    /CURRENT SEASON\n([A-Z ]+ [IVX]+)\n([\d,]+)\nRP/i
  );

  const lifetimeLevelMatch = joined.match(
    /LIFETIME OVERALL\nLevel\n([\d,]+)/i
  );

  const lifetimeOverallMatch = joined.match(
    /LIFETIME OVERALL[\s\S]*?Win %\n([\d.]+%)[\s\S]*?K\/D\n([\d.]+)[\s\S]*?Headshot %\n([\d.]+%)/i
  );

  const lifetimeRankedMatch = joined.match(
    /LIFETIME RANKED[\s\S]*?Matches\n([\d,]+)[\s\S]*?Win %\n([\d.]+%)[\s\S]*?K\/D\n([\d.]+)/i
  );

  const seasonOverviewMatch = joined.match(
    /Y\d+S\d+ OVERVIEW[\s\S]*?Ranked\n([\d,]+)[\s\S]*?([A-Z ]+ [IVX]+)\n([\d,]+)RP[\s\S]*?K\/D\n([\d.]+)[\s\S]*?Win Rate\n([\d.]+%)[\s\S]*?Matches\n([\d,]+)/i
  );

  return {
    currentRank:
      rankMatch?.[1] ||
      seasonOverviewMatch?.[2] ||
      null,

    currentRp: cleanNumber(
      rankMatch?.[2] ||
      seasonOverviewMatch?.[3]
    ),

    lifetimeLevel: cleanNumber(
      lifetimeLevelMatch?.[1]
    ),

    lifetimeOverallWinRate: cleanNumber(
      lifetimeOverallMatch?.[1]
    ),

    lifetimeOverallKd: cleanNumber(
      lifetimeOverallMatch?.[2]
    ),

    lifetimeOverallHeadshotRate: cleanNumber(
      lifetimeOverallMatch?.[3]
    ),

    lifetimeRankedMatches: cleanNumber(
      lifetimeRankedMatch?.[1]
    ),

    lifetimeRankedWinRate: cleanNumber(
      lifetimeRankedMatch?.[2]
    ),

    lifetimeRankedKd: cleanNumber(
      lifetimeRankedMatch?.[3]
    ),

    seasonRankedMatches: cleanNumber(
      seasonOverviewMatch?.[1] ||
      seasonOverviewMatch?.[6]
    ),

    seasonKd: cleanNumber(
      seasonOverviewMatch?.[4]
    ),

    seasonWinRate: cleanNumber(
      seasonOverviewMatch?.[5]
    ),

    parsedAt: new Date().toISOString()
  };
}

module.exports = {
  parseOverview
};