require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.commands = new Collection();

// 🎵 Distube setup
client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  leaveOnFinish: true,
  leaveOnStop: true,
  plugins: [
    new YtDlpPlugin(),
    new SpotifyPlugin(),
    new SoundCloudPlugin()
  ]
});

// 📂 โหลด commands จาก /commands
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`⚠️ Command ${file} ไม่มี data หรือ execute`);
  }
}

// ✅ เมื่อ bot พร้อม
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// 🎤 Interaction handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ เกิดข้อผิดพลาด!', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ เกิดข้อผิดพลาด!', ephemeral: true });
    }
  }
});

// 🎶 Distube events
client.distube
  .on('playSong', (queue, song) =>
    queue.textChannel?.send(`▶️ กำลังเล่น: **${song.name}** (${song.formattedDuration})`)
  )
  .on('addSong', (queue, song) =>
    queue.textChannel?.send(`➕ เพิ่มเพลง: **${song.name}** (${song.formattedDuration})`)
  )
  .on('error', (channel, error) => {
    console.error('Distube Error:', error);
    channel?.send('❌ มีข้อผิดพลาดในการเล่นเพลง!');
  });

// 🚪 Login bot
client.login(process.env.TOKEN);
