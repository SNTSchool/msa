const claimerMap = new Map(); 
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');


function setClaimer(channelId, userId) {
  claimerMap.set(channelId, userId);
}

function getClaimer(channelId) {
  return claimerMap.get(channelId);
}

function clearClaimer(channelId) {
  claimerMap.delete(channelId);
}


async function updateTicketUI(channelId, status = 'open', client) {
  const channel = client.channels.cache.get(channelId);
  if (!channel) throw new Error(`Channel ${channelId} not found`);

  const row = new ActionRowBuilder();

  if (status === 'open') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`claim_${channelId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`close_${channelId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );
  } else if (status === 'claimed') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`unclaim_${channelId}`).setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`close_${channelId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );
  }

  const lastMessage = await channel.messages.fetch({ limit: 1 }).then(msgs => msgs.first());
  if (lastMessage) {
    await lastMessage.edit({ components: [row] });
  }
}



module.exports = {
  setClaimer,
  getClaimer,
  clearClaimer,
  updateTicketUI
};
