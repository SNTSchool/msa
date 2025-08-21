const { REST, Routes } = require('discord.js');
const fs = require('fs');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const commands = [];
    const commandFiles = fs.readdirSync('./commands');

    for (const file of commandFiles) {
      const command = require(`../commands/${file}`);
      commands.push(command.data.toJSON());
    }

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

    try {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('✅ Slash commands auto-deployed!');
    } catch (error) {
      console.error('❌ Auto-deploy failed:', error);
    }
  },
};
