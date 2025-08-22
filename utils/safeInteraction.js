async function safeReply(interaction, reply) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  } catch (err) {
    console.error('❌ Failed to reply safely:', err);
  }
}

async function safeUpdate(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.update(payload);
    }
  } catch (err) {
    console.error('Interaction update failed:', err);
    try {
      await interaction.followUp({ content: 'เกิดข้อผิดพลาดในการ unclaim', ephemeral: true });
    } catch (followErr) {
      console.error('FollowUp also failed:', followErr);
    }
  }
}

module.exports = {
  safeReply,
  safeUpdate
};
