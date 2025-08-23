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

  await safeReply(interaction, {
    content: `✅ กำลัง Claim ticket นี้...`,
    ephemeral: true
  });

  try {
    setClaimer(channel.id, interaction.user.id);
    await channel.setName(`claimed-${ticketId}`);
    await channel.setTopic(`Claimed by ${interaction.user.tag}`);
    await updateTicketUI(channel, 'claimed');

    await interaction.followUp({
      content: `🎯 คุณได้ Claim ticket นี้เรียบร้อยแล้ว`,
      ephemeral: true
    });
  } catch (err) {
    console.error('Claim error:', err);
    await interaction.followUp({
      content: `⚠️ เกิดข้อผิดพลาดขณะ Claim ticket`,
      ephemeral: true
    });
  }
}

// ------------------------
async function handleUnclaim(interaction, ticketId) {
  const channel = interaction.channel;
  const currentClaimer = getClaimer(channel.id);

  if (currentClaimer !== interaction.user.id) {
    return await safeReply(interaction, {
      content: `❌ คุณไม่ได้ Claim ticket นี้`,
      ephemeral: true
    });
  }

  await safeReply(interaction, {
    content: `✅ กำลัง Unclaim ticket นี้...`,
    ephemeral: true
  });

  try {
    
    const cleanId = typeof ticketId === 'string' ? ticketId.trim() : String(ticketId);
    const newName = `order-${cleanId}`;
   

    const hasPermission = channel.permissionsFor(channel.guild.members.me)?.has('ManageChannels');
    if (!hasPermission) {
      console.warn(`⚠️ Bot ไม่มีสิทธิ์เปลี่ยนชื่อ channel ${channel.name}`);
      return await interaction.followUp({
        content: `⚠️ Bot ไม่มีสิทธิ์เปลี่ยนชื่อช่อง กรุณาให้สิทธิ์ Manage Channels`,
        ephemeral: true
      });
    }
    console.log('c')

    await channel.setName(newName);
   // if (channel.name !== newName) {
    //  await channel.setName(newName);
     // console.log(`✅ เปลี่ยนชื่อ channel เป็น ${newName}`);
    //} else {
    //  console.log(`ℹ️ ชื่อ channel เป็น ${newName} อยู่แล้ว ไม่ต้องเปลี่ยน`);
   // }
    console.log('d')
    await channel.setTopic(`Unclaimed`);
    await updateTicketUI(channel, 'open');
    clearClaimer(channel.id);

    await interaction.followUp({
      content: `🔓 คุณได้ Unclaim ticket นี้เรียบร้อยแล้ว`,
      ephemeral: true
    });
  } catch (err) {
    console.error('❌ Unclaim error:', err);
    await interaction.followUp({
      content: `⚠️ เกิดข้อผิดพลาดขณะ Unclaim ticket`,
      ephemeral: true
    });
  }
}


module.exports = {
  handleClaim,
  handleUnclaim
};
