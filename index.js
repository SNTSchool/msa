// index.js - optimized startup to avoid host timeouts
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const moment = require('moment-timezone');
const { google } = require('googleapis');
const crypto = require('crypto');

// fetcher: use global fetch if available, else dynamic import node-fetch
let fetcher;
if (typeof fetch !== 'undefined') fetcher = fetch;
else fetcher = (...args) => import('node-fetch').then(m => m.default(...args));

const {
  Client,
  GatewayIntentBits,
  Collection,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ActivityType
} = require('discord.js');

const app = express();
app.use(express.json());

/* -------- Config -------- */

const VOICE_CHANNEL_ID = '1407734133962309663';
const VERIFY_PANEL_CHANNEL_ID = '1409549096385122436';
const PANEL_CHANNEL_ID = '1407732551409209460'; 
const TICKET_CATEGORY_ID = '1407732550969069666';
const TICKET_LOG_CHANNEL = '1407732551602409604';
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || ''; 
const SHEET_NAME_TRANSCRIPT = 'Transcript';
const SHEET_NAME_VERIFY = 'VerifyData';
const PORT = process.env.PORT || 10000;
const BASE_URL = (process.env.BASE_URL || '').replace(/\/$/,'');


const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});
client.commands = new Collection();

const CLAIM_COOLDOWN_MS = 10 * 60 * 1000;
const verifyStatus = new Map(); 
const pkceStore = {}; 
const orderTypeStore = new Map(); 
const ticketStore = new Map(); 
const lastClaimAt = new Map(); 


/* Helpers */
function base64url(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return Buffer.from(String(buf)).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function genPkce() {
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/* Lightweight Google Sheets client factory (created on-demand) */
async function getSheetsClient() {
  if (!SPREADSHEET_ID) throw new Error('SPREADSHEET_ID not set');
  const auth = new google.auth.GoogleAuth({
    credentials: {
      project_id: process.env.GOOGLE_PROJECT_ID,
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const clientAuth = await auth.getClient();
  return google.sheets({ version: 'v4', auth: clientAuth });
}

async function getNextTicketId() {
  try {
    const sheets = await getSheetsClient();
    const range = `${SHEET_NAME_TRANSCRIPT}!A:A`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];
    const hasHeader = rows.length > 0 && rows[0][0] && rows[0][0].toString().toLowerCase().includes('ticket');
    const count = hasHeader ? rows.length - 1 : rows.length;
    const next = count + 1;
    return String(next).padStart(3, '0');
  } catch (err) {
    console.error('getNextTicketId error', err);
    const fallback = moment().tz('Asia/Bangkok').format('YYMMDDHHmmss');
    return fallback;
  }
}

async function appendTranscriptRow(ticketId, discordUser, discordUserId, type) {
  try {
    const sheets = await getSheetsClient();
    const timestamp = moment().tz('Asia/Bangkok').format('DD-MM-YYYY HH:mm:ss');
    const row = [
      ticketId,
      discordUser,
      discordUserId,
      'Open',
      'N/A',    
      '',    
      '',    
      '',    
      '',    
      timestamp
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_TRANSCRIPT}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch (err) {
    console.error('appendTranscriptRow error', err);
  }
}

const { STAFF_ROLE_IDS } = require('./config/roles.js');

function isStaff(member) {
  return member.roles.cache.some(role => STAFF_ROLE_IDS.includes(role.id));
}


async function findTranscriptRowIndex(ticketId) {
  try {
    const sheets = await getSheetsClient();
    const range = `${SHEET_NAME_TRANSCRIPT}!A2:A`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === String(ticketId)) return i + 2; 
    }
    return -1;
  } catch (err) {
    console.error('findTranscriptRowIndex error', err);
    return -1;
  }
}

async function updateTranscriptRow(sheetRowIndex, rowValues) {
  try {
    const sheets = await getSheetsClient();
    const endCol = 'J'; 
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_TRANSCRIPT}!A${sheetRowIndex}:${endCol}${sheetRowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowValues] }
    });
  } catch (err) {
    console.error('updateTranscriptRow error', err);
  }
}

async function updateTranscriptByTicketId(ticketId, updates = {}) {
  try {
    const sheets = await getSheetsClient();
    const range = `${SHEET_NAME_TRANSCRIPT}!A2:J`;
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
    const rows = res.data.values || [];
    const idx = rows.findIndex(r => r[0] === String(ticketId));
    if (idx === -1) return;
    const sheetRowIndex = idx + 2;
    const row = rows[idx];
    while (row.length < 10) row.push('');
    if (updates.status !== undefined) row[3] = updates.status;
    if (updates.claimedByName !== undefined) {
  row[4] = updates.claimedByName && updates.claimedByName.trim() !== "" 
    ? updates.claimedByName 
    : "N/A";
};
    if (updates.transcript !== undefined) row[5] = updates.transcript;
    if (updates.satisfaction !== undefined) row[6] = updates.satisfaction;
    if (updates.comment !== undefined) row[7] = updates.comment;
    if (updates.closeReason !== undefined) row[8] = updates.closeReason;
    await updateTranscriptRow(sheetRowIndex, row);
  } catch (err) {
    console.error('updateTranscriptByTicketId error', err);
  }
}

async function appendVerifyRow(discordUserId, robloxUsername, viaMethod='OAuth') {
  try {
    const sheets = await getSheetsClient();
    const timestamp = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
    let discordTag = discordUserId || 'WEB-OAUTH';
    try {
      if (discordUserId) {
        const u = await client.users.fetch(discordUserId).catch(()=>null);
        if (u) discordTag = u.tag;
      }
    } catch {}
    const robloxUserId = await (async function getRobloxUserId(username){
      try {
        const r = await fetcher('https://users.roblox.com/v1/usernames/users', {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({usernames:[username], excludeBannedUsers:true})
        });
        const d = await r.json();
        if (d && d.data && d.data.length>0) return d.data[0].id.toString();
        return '';
      } catch(e){ return ''; }
    })(robloxUsername);
    const row = [timestamp, discordTag, discordUserId || '', robloxUsername, robloxUserId, 'Verified', viaMethod];
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME_VERIFY}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] }
    });
  } catch (err) {
    console.error('appendVerifyRow error', err.message || err);
  }
}

/* Schedule expiry for game verify entries (10 minutes default) */
function scheduleGameExpiry(discordId, minutes=10) {
  const entry = verifyStatus.get(discordId);
  if (!entry) return;
  if (entry.expiryTimeout) clearTimeout(entry.expiryTimeout);
  entry.expiryTimeout = setTimeout(() => {
    const cur = verifyStatus.get(discordId);
    if (cur && !cur.enteredGame) {
      verifyStatus.delete(discordId);
      console.log(`Expired verify entry for ${discordId}`);
    }
  }, minutes * 60 * 1000);
  verifyStatus.set(discordId, entry);
}

/* ---- Routes: discord oauth, roblox oauth, callback ---- */

/* Discord OAuth: redirect user to Discord oauth (identify) */
app.get('/discord-login', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirect = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirect) return res.status(500).send('Discord OAuth not configured');
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirect);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  return res.redirect(url.toString());
});

/* Discord callback: exchange code, fetch user, redirect to /login?discordId=... */
app.get('/discord-callback', async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send('Missing code');
    const params = new URLSearchParams();
    params.set('client_id', process.env.DISCORD_CLIENT_ID);
    params.set('client_secret', process.env.DISCORD_CLIENT_SECRET);
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', process.env.DISCORD_REDIRECT_URI);
    const tokenResp = await fetcher('https://discord.com/api/oauth2/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: params });
    const token = await tokenResp.json();
    const userResp = await fetcher('https://discord.com/api/users/@me', { headers:{ Authorization: `Bearer ${token.access_token}` } });
    const user = await userResp.json();
    const discordId = user && user.id ? user.id : null;
    if (!discordId) return res.status(500).send('Failed to get Discord id');
    return res.redirect(`${BASE_URL}/login?discordId=${encodeURIComponent(discordId)}`);
  } catch (err) {
    console.error('discord-callback error', err.message || err);
    return res.status(500).send('Discord callback failed');
  }
});

/* Login: requires discordId (redirect to /discord-login if missing) */
app.get('/login', (req, res) => {
  const discordId = req.query.discordId;
  if (!discordId) return res.redirect('/discord-login');
  const { verifier, challenge } = genPkce();
  const state = base64url(crypto.randomBytes(24));
  pkceStore[state] = { verifier, createdAt: Date.now(), discordId };
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id', process.env.ROBLOX_CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.ROBLOX_REDIRECT_URI);
  url.searchParams.set('scope','openid profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method','S256');
  const authUrl = url.toString();
  return res.send(`<!doctype html><html><head><meta charset="utf-8"><title>Login Roblox</title></head><body>
    <h2>Login with Roblox</h2>
    <p>Discord ID: ${discordId}</p>
    <a href="${authUrl}">Login with Roblox</a>
  </body></html>`);
});

/* Roblox callback: exchange code, get userinfo, store verification + append to sheet */
app.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) return res.status(400).send('Missing code/state');
    const store = pkceStore[state];
    if (!store) return res.status(400).send('Invalid state');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.ROBLOX_CLIENT_ID,
      client_secret: process.env.ROBLOX_CLIENT_SECRET || '',
      redirect_uri: process.env.ROBLOX_REDIRECT_URI,
      code: String(code),
      code_verifier: store.verifier
    });
    const tokenResp = await fetcher('https://apis.roblox.com/oauth/v1/token', { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      console.error('roblox token failed', t);
      return res.status(500).send('Token exchange failed');
    }
    const tokens = await tokenResp.json();
    delete pkceStore[state];
    const userinfoResp = await fetcher('https://apis.roblox.com/oauth/v1/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const userinfo = await userinfoResp.json();
    const robloxName = userinfo.preferred_username || userinfo.username || userinfo.display_name || '';
    const discordId = store.discordId || '';
    // store verify entry and immediately append to sheet
    verifyStatus.set(discordId, { method:'oauth', robloxUsername: robloxName, verified: true, enteredGame: false, createdAt: Date.now() });
    try { await appendVerifyRow(discordId, robloxName, 'OAuth'); } catch(e){ console.warn('append failed', e); }
    return res.send(`<html><body><h2>Verified</h2><p>Roblox: ${robloxName}</p><p>Discord: ${discordId}</p></body></html>`);
  } catch (err) {
    console.error('callback error', err.message || err);
    return res.status(500).send('OAuth callback failed');
  }
});

/* Game verify endpoints for Roblox server */
app.get('/game-verify', (req, res) => {
  const robloxUsername = req.query.robloxUsername;
  if (!robloxUsername) return res.status(400).json({ error: 'Missing robloxUsername' });
  const normalized = robloxUsername.trim().toLowerCase();
  const candidates = [];
  for (const [discordId, data] of verifyStatus.entries()) {
    if (data.robloxUsername && data.robloxUsername.trim().toLowerCase() === normalized && data.verified && !data.enteredGame) {
      candidates.push({ discordId, method: data.method, createdAt: data.createdAt || null });
    }
  }
  return res.json({ candidates });
});

app.post('/game-verify/accept', async (req, res) => {
  try {
    const { discordId, robloxUsername } = req.body;
    if (!discordId || !robloxUsername) return res.status(400).json({ error: 'Missing fields' });
    const entry = verifyStatus.get(discordId);
    if (!entry || entry.robloxUsername?.trim().toLowerCase() !== robloxUsername.trim().toLowerCase()) return res.status(404).json({ error: 'Not found' });
    entry.enteredGame = true;
    verifyStatus.set(discordId, entry);
    await appendVerifyRow(discordId, robloxUsername, 'Game-Accepted');
    return res.json({ success: true });
  } catch (err) {
    console.error('accept error', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

app.post('/game-verify/reject', (req, res) => {
  try {
    const { discordId } = req.body;
    if (!discordId) return res.status(400).json({ error: 'Missing discordId' });
    verifyStatus.delete(discordId);
    return res.json({ success: true });
  } catch (err) {
    console.error('reject error', err);
    return res.status(500).json({ error: 'Failed' });
  }
});

/* Minimal privacy/terms pages for user display */
const PAGE_CSS = `<style>body{font-family:Arial,Helvetica,sans-serif;padding:20px}a{color:blue}</style>`;
app.get('/privacy-policy', (req, res) => res.send(`<!doctype html><html><head>${PAGE_CSS}</head><body><h1>Privacy</h1><p>We store Discord ID and Roblox username in a Google Sheet.</p></body></html>`));
app.get('/terms-of-service', (req, res) => res.send(`<!doctype html><html><head>${PAGE_CSS}</head><body><h1>Terms</h1><p>Use responsibly.</p></body></html>`));

/* Health */
app.get('/.well-known/health', (req, res) => res.status(200).send('OK'));

/* Start Express first (fast) */
app.listen(PORT, () => console.log(`Express listening on ${PORT}`));

/* Load commands lazily and register after ready */
async function loadCommandsAndRegister() {
  try {
    const commandsDir = path.join(__dirname, 'commands');
    const payload = [];
    if (fs.existsSync(commandsDir)) {
      const files = fs.readdirSync(commandsDir).filter(f=>f.endsWith('.js'));
      for (const f of files) {
        try {
          const cmd = require(path.join(commandsDir, f));
          if (cmd && cmd.data && cmd.execute) {
            client.commands.set(cmd.data.name, cmd);
            payload.push(cmd.data.toJSON ? cmd.data.toJSON() : cmd.data);
          }
        } catch (e) { console.warn('cmd load fail', f, e.message || e); }
      }
    }
    if (payload.length && process.env.CLIENT_ID) {
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      if (process.env.GUILD_ID) {
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: payload });
        console.log('Registered guild commands');
      } else {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: payload });
        console.log('Registered global commands');
      }
    }
  } catch (err) { console.error('loadCommandsAndRegister error', err.message || err); }
}

async function collectTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const arr = Array.from(messages.values()).reverse();
    const text = arr.map(m => `[${moment(m.createdAt).tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm')}] ${m.author.tag}: ${m.content}`).join('\n');
    return text;
  } catch (err) {
    console.error('collectTranscript error', err);
    return '';
  }
}

async function createTicketChannelFor(interactionOrGuild, type = 'qna', opts = {}) {
  const guild = interactionOrGuild.guild ? interactionOrGuild.guild : interactionOrGuild;
  const ownerId = opts.ownerId || (interactionOrGuild.user ? interactionOrGuild.user.id : null);
  const ticketId = await getNextTicketId();
  const name = `${type}-${ticketId}`;

  const overwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
  ];
  if (ownerId) overwrites.push({ id: ownerId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] });
  STAFF_ROLE_IDS.forEach(roleId => {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageMessages
      ]
    });
  });
  const ch = await guild.channels.create({
    name,
    type: 0,
    parent: TICKET_CATEGORY_ID || undefined,
    permissionOverwrites: overwrites
  });

  const createdAt = moment().tz('Asia/Bangkok').format('YYYY-MM-DD HH:mm:ss');
  const info = { ticketId, channelId: ch.id, type, ownerId, status: 'Open', claimedBy: null, createdAt };
  ticketStore.set(ticketId, info);

  const discordUser = ownerId ? await client.users.fetch(ownerId).catch(() => null) : null;
  const discordUsername = discordUser ? discordUser.tag : (opts.ownerName || 'Unknown');
  await appendTranscriptRow(ticketId, discordUsername, ownerId || '', type);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_claim_${ticketId}`).setLabel('Claim').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket_unclaim_${ticketId}`).setLabel('Unclaim').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`ticket_close_${ticketId}`).setLabel('Close').setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket ${ticketId}`)
    .setDescription(opts.initialMessage || `ประเภท: **${type}**\nเจ้าของ: <@${ownerId}>`)
    .setColor(0x2ecc71)
    .setFooter({ text: `Ticket ID: ${ticketId}` });

  await ch.send({ content: ownerId ? `<@${ownerId}>` : '', embeds: [embed], components: [buttons] });
  return { ch, info };
}

function findTicketInfoByChannel(channelId) {
  for (const info of ticketStore.values()) if (info.channelId === channelId) return info;
  return null;
}

client.once('ready', async () => {
  console.log('Discord ready', client.user.tag);
  loadCommandsAndRegister().catch(e=>console.warn('register fail', e.message || e));


 client.user.setActivity('ช่วยงานสุดหล่อ', { type: ActivityType.Streaming, url: 'https://www.twitch.tv/idleaccountdun' });

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commands = [
    new SlashCommandBuilder().setName('openshop').setDescription('เปิดร้าน').toJSON(),
    new SlashCommandBuilder().setName('closeshop').setDescription('ปิดร้าน').toJSON()
  ];
  try { await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands }); }
  catch (err) { console.error('register commands error', err); }
});




client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      const name = interaction.commandName;
      if (name === 'setuppanel') {
        const embed = new EmbedBuilder().setTitle('🎫 Ticket Panel').setDescription('กดปุ่มเพื่อสร้าง Ticket').setColor(0x5865F2);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket_btn_order').setLabel('🛒 Order').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ticket_btn_report').setLabel('🚨 Report').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ticket_btn_qna').setLabel('❓ Q&A').setStyle(ButtonStyle.Success)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Ticket panel sent to this channel', ephemeral: true });
      }
      if (name === 'openshop') {
        customOverride = 'open';
        await updateVoiceChannelStatus();
        return interaction.reply({ content: '✅ ร้านถูกเปิดแบบ override', ephemeral: true });
      }
      if (name === 'closeshop') {
        customOverride = 'closed';
        await updateVoiceChannelStatus();
        return interaction.reply({ content: '✅ ร้านถูกปิดแบบ override', ephemeral: true });
      }
      const cmd = client.commands.get(name);
      if (cmd) {
        try { await cmd.execute(interaction, client); } catch (err) { console.error('command execute error', err); interaction.reply({ content: 'Command error', ephemeral: true }); }
      }
      return;
    }

    if (interaction.isButton()) {
      // verification buttons
      if (interaction.customId === 'verify_game_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_game_modal').setTitle('Verify via Game');
        const input = new TextInputBuilder().setCustomId('vg_username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      if (interaction.customId === 'verify_desc_modal_btn') {
        const modal = new ModalBuilder().setCustomId('verify_desc_modal').setTitle('Verify via Profile Description');
        const input = new TextInputBuilder().setCustomId('vd_username').setLabel('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
      }
      // ticket panel
      if (interaction.customId === 'ticket_btn_order') {
        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('order_type_select').setPlaceholder('เลือกประเภทการสั่งซื้อ').addOptions([
            { label: 'สั่งทำ (Custom Order)', value: 'custom' },
            { label: 'ซื้อผลิตภัณฑ์ (Buy Product)', value: 'product' }
          ])
        );
        return interaction.reply({ content: 'โปรดเลือกประเภทการสั่งซื้อ', components: [row], ephemeral: true });
      }
      if (interaction.customId === 'ticket_btn_report') {
        const modal = new ModalBuilder().setCustomId('modal_report').setTitle('Report');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_discord').setLabel('Discord name (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_roblox').setLabel('Roblox name (optional)').setStyle(TextInputStyle.Short).setRequired(false)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('report_group').setLabel('Group name (optional)').setStyle(TextInputStyle.Short).setRequired(false))
        );
        return interaction.showModal(modal);
      }
      if (interaction.customId === 'ticket_btn_qna') {
        const modal = new ModalBuilder().setCustomId('modal_qna').setTitle('Q&A');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qna_question').setLabel('Your question').setStyle(TextInputStyle.Paragraph).setRequired(true)));
        return interaction.showModal(modal);
      }

      // ticket claim/unclaim/close flows
      if (interaction.customId.startsWith('ticket_claim_')) {
        const ticketId = interaction.customId.replace('ticket_claim_', '');
        const info = ticketStore.get(ticketId);
        if (!info) return interaction.reply({ content: 'Ticket not found', ephemeral: true });
        if (!isStaff(interaction.member)) return interaction.reply({ content: 'ต้องเป็น Staff เท่านั้น', ephemeral: true });
        if (info.status === 'Claimed') return interaction.reply({ content: 'Ticket ถูก claim แล้ว', ephemeral: true });

        info.status = 'Claimed';
        info.claimedBy = interaction.user.id;
        ticketStore.set(ticketId, info);
        lastClaimAt.set(info.channelId, Date.now());
        const ch = interaction.channel;
        await ch.setName(`claimed-${info.type}-${ticketId}`).catch(()=>{});
        await updateTranscriptByTicketId(ticketId, { status: 'Claimed', claimedByName: interaction.user.tag });
        return interaction.reply({ content: `✅ Claimed by <@${interaction.user.id}>`, ephemeral: false });
      }
      if (interaction.customId.startsWith('ticket_unclaim_')) {
        const ticketId = interaction.customId.replace('ticket_unclaim_', '');
        const info = ticketStore.get(ticketId);
        if (!info) return interaction.reply({ content: 'Ticket not found', ephemeral: true });
        if (info.status !== 'Claimed') return interaction.reply({ content: 'Ticket ยังไม่ได้ถูก claim', ephemeral: true });
        const chId = info.channelId;
        const last = lastClaimAt.get(chId) || 0;
        const CLAIM_COOLDOWN_MS = Number(process.env.CLAIM_COOLDOWN_MS) || (10 * 60 * 1000);
        if (Date.now() - last < CLAIM_COOLDOWN_MS) {
          const left = Math.ceil((CLAIM_COOLDOWN_MS - (Date.now() - last)) / 60000);
          return interaction.reply({ content: `ต้องรออีก ${left} นาทีถึงจะ unclaim ได้`, ephemeral: true });
        }
        if (info.claimedBy && info.claimedBy !== interaction.user.id && !isStaff(interaction.member)) {
          return interaction.reply({ content: '❌ Ticket นี้ถูก claim โดยคนอื่นแล้ว', ephemeral: true });
        }

        info.status = 'Open';
        info.claimedBy = null;
        ticketStore.set(ticketId, info);
        await interaction.channel.setName(`${info.type}-${ticketId}`).catch(()=>{});
        await updateTranscriptByTicketId(ticketId, { status: 'Open', claimedByName: '' });
        return interaction.reply({ content: `🔓 Unclaimed by <@${interaction.user.id}>`, ephemeral: false });
      }
      if (interaction.customId.startsWith('ticket_close_')) {
        const ticketId = interaction.customId.replace('ticket_close_', '');
        const info = ticketStore.get(ticketId);
        if (!info) return interaction.reply({ content: 'Ticket not found', ephemeral: true });

        const row1 = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('close_select_satisfaction').setPlaceholder('คะแนนความพึงพอใจ').addOptions([
            { label: '1', value: '1' },{ label: '2', value: '2' },{ label: '3', value: '3' },{ label: '4', value: '4' },{ label: '5', value: '5' }
          ])
        );
        const row2 = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder().setCustomId('close_select_reason').setPlaceholder('เหตุผลการปิด').addOptions([
            { label: 'เสร็จสิ้นงาน/บริการแล้ว', value: 'done' },
            { label: 'ยกเลิกคำขอ', value: 'cancel' },
            { label: 'ไม่สามารถดำเนินการได้', value: 'not_possible' },
            { label: 'อื่นๆ', value: 'other' }
          ])
        );
        lastClaimAt.set(interaction.channelId, lastClaimAt.get(interaction.channelId) || 0);
        interaction.client._closeFlow = interaction.client._closeFlow || new Map();
        interaction.client._closeFlow.set(interaction.channelId, { ticketId });
        return interaction.reply({ content: 'โปรดเลือกคะแนนและเหตุผล (ephemeral)', components: [row1, row2], ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'order_type_select') {
        const val = interaction.values?.[0];
        if (!val) return interaction.reply({ content: 'กรุณาเลือก', ephemeral: true });
        orderTypeStore.set(interaction.user.id, val);
        const modal = new ModalBuilder().setCustomId('order_modal').setTitle('Order');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('order_product').setLabel('ชื่อสินค้า').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('order_details').setLabel('รายละเอียด (สำหรับสั่งทำ)').setStyle(TextInputStyle.Paragraph).setRequired(val === 'custom'))
        );
        return interaction.showModal(modal);
      }

      if (interaction.customId === 'close_select_satisfaction') {
        const val = interaction.values?.[0];
        const map = interaction.client._closeFlow || new Map();
        const item = map.get(interaction.channelId) || {};
        item.satisfaction = val;
        map.set(interaction.channelId, item);
        interaction.client._closeFlow = map;
        return interaction.reply({ content: `เลือกคะแนน: ${val}. ต่อไปเลือกเหตุผล`, ephemeral: true });
      }
      if (interaction.customId === 'close_select_reason') {
        const val = interaction.values?.[0];
        const map = interaction.client._closeFlow || new Map();
        const item = map.get(interaction.channelId) || {};
        item.reason = val;
        map.set(interaction.channelId, item);
        interaction.client._closeFlow = map;
        const modal = new ModalBuilder().setCustomId('close_comment_modal').setTitle('Close - comment (optional)');
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('close_comment').setLabel('ความคิดเห็นเพิ่มเติม').setStyle(TextInputStyle.Paragraph).setRequired(false)));
        return interaction.showModal(modal);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_game_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vg_username');
        verifyStatus.set(interaction.user.id, { method:'game', robloxUsername, verified:true, enteredGame:false, createdAt: Date.now() });
        scheduleGameExpiry(interaction.user.id, 10);
        await interaction.reply({ content: `🎮 กรุณาเข้าเกมภายใน 10 นาที: ${robloxUsername}\nhttps://www.roblox.com/games/111377180902550/MSA-Verify-Center`, ephemeral: true });
        return;
      }
      if (interaction.customId === 'verify_desc_modal') {
        const robloxUsername = interaction.fields.getTextInputValue('vd_username');
        const phrase = (function generateVerificationPhrase(){
          const subjects = ["I","We","They","Someone","A friend","My cat"];
          const verbs = ["enjoy","like","love","prefer","sometimes eat","dream about"];
          const objects = ["apples","dancing in the rain","purple cats","flying cars","building sandcastles","watching the stars"];
          const extras = ["every morning","at night","when it rains","on Sundays","while coding"];
          return `${subjects[Math.floor(Math.random()*subjects.length)]} ${verbs[Math.floor(Math.random()*verbs.length)]} ${objects[Math.floor(Math.random()*objects.length)]} ${extras[Math.floor(Math.random()*extras.length)]}.`;
        })();
        verifyStatus.set(interaction.user.id, { method:'description', robloxUsername, phrase, verified:true, enteredGame:false, createdAt: Date.now() });
        await interaction.reply({ content: `📝 โปรดตั้ง Profile Description ของคุณเป็น:\n\`\`\`${phrase}\`\`\`\nแล้วระบบจะตรวจสอบอีกครั้ง`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'order_modal') {
        const product = interaction.fields.getTextInputValue('order_product');
        const details = interaction.fields.getTextInputValue('order_details') || '';
        const type = orderTypeStore.get(interaction.user.id) || 'product';
        orderTypeStore.delete(interaction.user.id);
        const initialMessage = `Order type: **${type}**\nProduct: **${product}**\nDetails: ${details}`;
        const { ch, info } = await createTicketChannelFor(interaction, 'order', { ownerId: interaction.user.id, initialMessage });
        await interaction.reply({ content: `✅ สร้าง ticket: <#${ch.id}>`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'modal_report') {
        const discordName = interaction.fields.getTextInputValue('report_discord') || '';
        const robloxName = interaction.fields.getTextInputValue('report_roblox') || '';
        const groupName = interaction.fields.getTextInputValue('report_group') || '';
        const initialMessage = `Report\nDiscord: ${discordName}\nRoblox: ${robloxName}\nGroup: ${groupName}`;
        const { ch, info } = await createTicketChannelFor(interaction, 'report', { ownerId: interaction.user.id, initialMessage });
        await interaction.reply({ content: `✅ รายงานถูกสร้าง: <#${ch.id}>`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'modal_qna') {
        const question = interaction.fields.getTextInputValue('qna_question');
        const initialMessage = `Q&A\nQuestion: ${question}`;
        const { ch, info } = await createTicketChannelFor(interaction, 'qna', { ownerId: interaction.user.id, initialMessage });
        await interaction.reply({ content: `✅ Ticket Q&A created: <#${ch.id}>`, ephemeral: true });
        return;
      }

      if (interaction.customId === 'close_comment_modal') {
        const comment = interaction.fields.getTextInputValue('close_comment') || '';
        const flowMap = interaction.client._closeFlow || new Map();
        const flow = flowMap.get(interaction.channelId);
        if (!flow) return interaction.reply({ content: 'Flow data missing', ephemeral: true });
        const { ticketId, satisfaction, reason } = flow;
        const info = ticketStore.get(ticketId) || findTicketInfoByChannel(interaction.channelId);
        if (!info) return interaction.reply({ content: 'Ticket not found', ephemeral: true });

        const transcript = await collectTranscript(interaction.channel);
        await updateTranscriptByTicketId(ticketId, {
          transcript,
          satisfaction: satisfaction || '',
          comment: comment || '',
          closeReason: reason || '',
          status: 'Closed'
        });

        try {
          await interaction.channel.permissionOverwrites.set([
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }
          ]);
          await interaction.channel.setName(`closed-${info.type}-${ticketId}`).catch(()=>{});
        } catch (err) { console.error('close channel error', err); }

        if (process.env.TICKET_LOG_CHANNEL) {
          const logCh = await client.channels.fetch(process.env.TICKET_LOG_CHANNEL).catch(()=>null);
          if (logCh) {
            await logCh.send(`📁 Ticket closed: ${ticketId}\nBy: ${interaction.user.tag}\nReason: ${reason}\nSatisfaction: ${satisfaction}\nComment: ${comment}`);
          }
        }

        info.status = 'Closed';
        ticketStore.set(ticketId, info);
        flowMap.delete(interaction.channelId);
        interaction.client._closeFlow = flowMap;
        return interaction.reply({ content: '✅ Ticket closed and logged', ephemeral: true });
      }
    }

  } catch (err) {
    console.error('interaction handler error', err);
    try { if (!interaction.replied) await interaction.reply({ content: 'เกิดข้อผิดพลาด', ephemeral: true }); } catch {}
  }
});

/* Start Discord client */
client.login(process.env.TOKEN).then(()=> console.log('Discord login ok')).catch(e=>console.error('discord login err', e.message || e));
