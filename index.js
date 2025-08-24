require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment-timezone');
const { Client, GatewayIntentBits, Collection, ActivityType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');

const app = express();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

client.commands = new Collection();
client.distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [new SpotifyPlugin()]
});

const VOICE_CHANNEL_ID = '1407734133962309663';
let customOverride = null;

//
// 🔧 Express API
//
app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'Bot is running' }));

app.get('/verify', (req, res) => {
  res.json({ message: '✅ Verification endpoint is active' });
});


async function logToGoogleSheet(username, userId) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'VerifyData!A1',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[username, userId, new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })]]
    }
  });
}


app.post('/verify', (req, res) => {
  const { username, userId } = req.body;
  if (!username || !userId) {
    return res.status(400).json({ success: false, message: 'Missing username or userId' });
  }

  // 🔐 ตรงนี้สามารถเชื่อมกับ Google Sheets หรือระบบยืนยันได้
  console.log(`✅ Verification received: ${username} (${userId})`);
  res.json({ success: true, message: 'Verified!' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('🌐 Express server is running');
});

//
// ⚙️ โหลดคำสั่งและ events
//
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.warn(`⚠️ คำสั่ง ${file} ไม่มี data หรือ execute`);
  }
}

const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

//
// 🟣 ตั้งสถานะ Streaming และเริ่ม cron job
//
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity('ช่วยงานสุดหล่อ', {
    type: ActivityType.Streaming,
    url: 'https://www.twitch.tv/idleaccountdun'
  });

  await registerAllCommands();
  scheduleShopStatus();
});

async function registerAllCommands() {
  const commands = [];

  for (const [name, command] of client.commands) {
    commands.push(command.data.toJSON());
  }

  commands.push(
    new SlashCommandBuilder().setName('openshop').setDescription('เปิดร้านแบบ override').toJSON(),
    new SlashCommandBuilder().setName('closeshop').setDescription('ปิดร้านแบบ override').toJSON()
  );

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('✅ Registered all commands');
}

function getScheduledStatus() {
  const now = moment().tz('Asia/Bangkok');
  const day = now.day();
  const hour = now.hour();
  const minute = now.minute();
  const time = hour + minute / 60;

  if (customOverride) return customOverride;

  if (day >= 1 && day <= 5) {
    return time >= 17 && time < 21 ? 'open' : 'closed';
  } else if (day === 6) {
    return time >= 13 && time < 20 ? 'open' : 'closed';
  } else if (day === 0) {
    return time >= 8.5 && time < 20 ? 'open' : 'closed';
  }
  return 'closed';
}

async function updateVoiceChannelStatus() {
  const status = getScheduledStatus();
  const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
  if (!channel) return;

  const newName = `︰สถานะร้าน-${status === 'open' ? 'เปิด' : 'ปิด'}`;
  if (channel.name !== newName) {
    await channel.setName(newName);
    console.log(`🔄 เปลี่ยนชื่อช่องเป็น ${newName}`);
  }
}

function scheduleShopStatus() {
  cron.schedule('*/5 * * * *', updateVoiceChannelStatus);
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (interaction.commandName === 'openshop') {
    customOverride = 'open';
    await updateVoiceChannelStatus();
    return interaction.reply({ content: '✅ ร้านถูกเปิดแบบ override แล้ว', ephemeral: true });
  }

  if (interaction.commandName === 'closeshop') {
    customOverride = 'closed';
    await updateVoiceChannelStatus();
    return interaction.reply({ content: '✅ ร้านถูกปิดแบบ override แล้ว', ephemeral: true });
  }

  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    await interaction.reply({ content: '❌ มีข้อผิดพลาดในการรันคำสั่งนี้', ephemeral: true });
  }
});

client.login(process.env.TOKEN);
