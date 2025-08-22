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


async function updateTicketUI(channel, status = 'open') {
  const row = new ActionRowBuilder();

  if (status === 'open') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`claim_${channel.id}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`close_${channel.id}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );
  } else if (status === 'claimed') {
    row.addComponents(
      new ButtonBuilder().setCustomId(`unclaim_${channel.id}`).setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`close_${channel.id}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
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
