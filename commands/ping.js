// ./commands/ping.js
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder().setName('ping').setDescription('เช็คสถานะบอท'),
  async execute(interaction) {
    await interaction.reply({ content: `🏓 Pong! Latency: ${Date.now() - interaction.createdTimestamp}ms`, ephemeral: true });
  }
};
