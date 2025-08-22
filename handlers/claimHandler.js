const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { isStaff } = require('../utils/isStaff');
const { setClaimer, getClaimer, clearClaimer } = require('../utils/ticketUtils');
const { safeReply, safeUpdate } = require('../utils/safeInteraction');

async function handleClaim(interaction, ticketId) {
  const channel = interaction.channel;

  if (!isStaff(interaction.member)) {
    return await safeReply(interaction, { content: '❌ คุณไม่มีสิทธิ์ Claim', ephemeral: true });
  }

  const currentClaimer = getClaimer(channel.id);
  if (currentClaimer && currentClaimer !== interaction.user.id) {
    return await safeReply(interaction, {
      content: `❌ Ticket นี้ถูก Claim โดย <@${currentClaimer}> แล้ว`,
      ephemeral: true
    });
  }

  setClaimer(channel.id, interaction.user.id);
  await channel.setName(`claimed-${ticketId}`);
  await channel.setTopic(`Claimed by ${interaction.user.tag}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`unclaim_${ticketId}`).setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
  );

  await safeUpdate(interaction, { components: [row] });
}

async function handleUnclaim(interaction, ticketId) {
  const channel = interaction.channel;
  const currentClaimer = getClaimer(channel.id);

  if (currentClaimer !== interaction.user.id) {
    return await safeReply(interaction, {
      content: `❌ คุณไม่ได้ Claim ticket นี้`,
      ephemeral: true
    });
  }

  
  await channel.setName(`order-${ticketId}`);
  await channel.setTopic(null);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`claim_${ticketId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
  );
 
  const { safeUpdate } = require('../utils/safeInteraction');

  await safeUpdate(interaction, {
    components: [updatedRow],
  });
   clearClaimer(channel.id);
}

module.exports = {
  handleClaim,
  handleUnclaim
};
                                                                  
