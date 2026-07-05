function getPeakRp(seasons = []) {
  let peak = 0;

  for (const season of seasons) {
    if ((season.maxRank || 0) > peak) {
      peak = season.maxRank;
    }
  }

  return peak;
}

function getBestOperator(operators = []) {
  if (!operators.length) return null;

  return [...operators]
    .sort((a, b) => b.rounds - a.rounds)[0];
}

function getBestMap(maps = []) {
  if (!maps.length) return null;

  return [...maps]
    .sort((a, b) => b.winRate - a.winRate)[0];
}

function getMostPlayedMap(maps = []) {
  if (!maps.length) return null;

  return [...maps]
    .sort((a, b) => b.matches - a.matches)[0];
}

module.exports = {
  getPeakRp,
  getBestOperator,
  getBestMap,
  getMostPlayedMap
};