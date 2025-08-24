const express = require('express');
const { getPendingByUsername, removePending } = require('../utils/pending');
const { appendVerification } = require('../utils/sheets');
const { getThaiTimestamp } = require('../utils/time');
const  discordToken = process.env.TOKEN;
const guildId = process.env.GUILD_ID;
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
app.use(express.json());

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

app.post('/verify', async (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) return res.status(400).send('Missing data');

  const discordId = getPendingByUsername(username);
  if (!discordId) return res.status(404).send('User not pending');

  try {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordId);
    const discordName = `${member.user.username}#${member.user.discriminator}`;
    const timestamp = getThaiTimestamp();

    await appendVerification(discordName, username, timestamp);
    removePending(discordId);

    console.log(`✅ Verified ${discordName} (${username})`);
    res.status(200).send('Verified!');
  } catch (err) {
    console.error('❌ Verification error:', err);
    res.status(500).send('Internal error');
  }
});

app.get('/', (req, res) => res.send('Roblox verification API is running'));

client.once('ready', () => {
  console.log(`🤖 Discord bot logged in as ${client.user.tag}`);
  app.listen(10000, () => console.log(`🌐 API listening on port ${10000}`));
});

client.login(discordToken);
