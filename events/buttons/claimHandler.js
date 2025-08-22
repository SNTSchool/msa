const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { STAFF_ROLE_IDS } = require('../../config/roles');
const { setClaimer, getClaimer, clearClaimer } = require('../utils/ticketUtils');


function isStaff(member) {
  return STAFF_ROLE_IDS.some(roleId => member.roles.cache.has(roleId));
}

async function handleClaimButton(interaction) {
  const [action, ticketId] = interaction.customId.split('_');
  const channel = interaction.channel;

  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ Claim', ephemeral: true });
  }

  if (action === 'claim') {
    await channel.setName(`claimed-${ticketId}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`unclaim_${ticketId}`).setLabel('🔓 Unclaim').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );
   const { safeUpdate } = require('../utils/safeInteraction');

  await safeUpdate(interaction, {
    components: [row],
  });
  }

  if (action === 'unclaim') {
    console.log('Bug')
    await channel.setName(`order-${ticketId}`);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`claim_${ticketId}`).setLabel('🎯 Claim').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`close_${ticketId}`).setLabel('❌ Close').setStyle(ButtonStyle.Danger)
    );
    const { safeUpdate } = require('../utils/safeInteraction');

  await safeUpdate(interaction, {
    components: [row],
  });
    clearClaimer(channel.id);
  }
}

module.exports = handleClaimButton;
