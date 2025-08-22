const claimerMap = new Map(); // channelId → userId

function setClaimer(channelId, userId) {
  claimerMap.set(channelId, userId);
}

function getClaimer(channelId) {
  return claimerMap.get(channelId);
}

function clearClaimer(channelId) {
  claimerMap.delete(channelId);
}

module.exports = {
  setClaimer,
  getClaimer,
  clearClaimer
};
