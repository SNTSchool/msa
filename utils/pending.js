const pendingVerifications = new Map(); 

module.exports = {
  addPending(discordId, robloxUsername) {
    pendingVerifications.set(discordId, robloxUsername);
  },
  getPendingByUsername(username) {
    for (const [discordId, robloxUsername] of pendingVerifications.entries()) {
      if (robloxUsername.toLowerCase() === username.toLowerCase()) {
        return discordId;
      }
    }
    return null;
  },
  removePending(discordId) {
    pendingVerifications.delete(discordId);
  }
};
