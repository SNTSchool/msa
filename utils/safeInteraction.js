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
    if (interaction.isRepliable() && !interaction.replied) {
      await interaction.update(payload);
    } else {
      await interaction.followUp({ ...payload, ephemeral: true });
    }
  } catch (err) {
    console.error('❌ Failed to update interaction:', err);
  }
}

module.exports = {
  safeReply,
  safeUpdate
};
