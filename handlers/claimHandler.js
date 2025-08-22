const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { isStaff } = require('../utils/isStaff');
const {
  setClaimer,
  getClaimer,
  clearClaimer,
  updateTicketUI
} = require('../utils/ticketUtils');
const { safeReply } = require('../utils/safeInteraction');

async function handleClaim(interaction, ticketId) {
  const channel = interaction.channel;

  if (!isStaff(interaction.member)) {
    return await safeReply(interaction, {
      content: '❌ คุณไม่มีสิทธิ์ Claim',
      ephemeral: true
    });
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

  await updateTicketUI(channel, 'claimed');
  await safeReply(interaction, {
    content: `✅ คุณได้ Claim ticket นี้แล้ว`,
    ephemeral: true
  });
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

  clearClaimer(channel.id);
  await channel.setName(`ticket-${ticketId}`);
  await channel.setTopic(null);

  await updateTicketUI(channel, 'open');
  await safeReply(interaction, {
    content: `🔓 คุณได้ Unclaim ticket นี้แล้ว`,
    ephemeral: true
  });
}

module.exports = {
  handleClaim,
  handleUnclaim
};
