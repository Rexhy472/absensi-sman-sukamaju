const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');
const cron = require('node-cron');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- KONFIGURASI ---
const TOKEN = process.env.TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const RECAP_CHANNEL_ID = process.env.RECAP_CHANNEL_ID;

const DATA_DIR = '/app/data';
const DATA_PATH = path.join(DATA_DIR, 'absensi.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let absensi = {};
if (fs.existsSync(DATA_PATH)) {
  absensi = JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveDB() {
  try { fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2)); } catch (err) {}
}

// --- BOT START ---
client.on('ready', () => {
  console.log(`✅ Bot Absensi Aktif: ${client.user.tag}`);
  
  // Panel Otomatis
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hadir').setLabel('Hadir').setStyle(ButtonStyle.Success)
    );
    channel.send({ content: '📋 **Absensi Hari Ini**\nSilahkan klik tombol di bawah!', components: [row] }).catch(() => null);
  }

  // JADWAL REKAP OTOMATIS (23:59 WIB)
  cron.schedule('59 23 * * *', async () => {
    const recapChan = client.channels.cache.get(RECAP_CHANNEL_ID);
    if (!recapChan) return;

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    const dataHarian = absensi[today] || [];
    const ipa = [], ips = [], bahasa = [], umum = [];

    for (const id of dataHarian) {
      let target = recapChan.guild.members.cache.get(id) || await recapChan.guild.members.fetch(id).catch(() => null);
      const name = target ? target.displayName : `User ${id}`;
      const r = target ? target.roles.cache : null;

      if (r && r.some(x => x.name.toUpperCase().includes('IPA'))) ipa.push(name);
      else if (r && r.some(x => x.name.toUpperCase().includes('IPS'))) ips.push(name);
      else if (r && r.some(x => x.name.toUpperCase().includes('BAHASA'))) bahasa.push(name);
      else umum.push(name);
    }

    const fmt = (arr) => arr.length === 0 ? '_Kosong_' : arr.map(n => `• ${n}`).join('\n');
    const em = new EmbedBuilder().setColor(0x34495e).setTitle(`📊 REKAP OTOMATIS: ${today}`)
      .addFields({ name: '🧪 IPA', value: fmt(ipa), inline: true }, { name: '📊 IPS', value: fmt(ips), inline: true }, { name: '📒 Bahasa', value: fmt(bahasa), inline: true }, { name: '👤 Umum', value: fmt(umum), inline: false })
      .setFooter({ text: `Total: ${dataHarian.length}` }).setTimestamp();

    recapChan.send({ content: '@everyone Laporan Malam:', embeds: [em] });
  }, { scheduled: true, timezone: "Asia/Jakarta" });
});

// --- TOMBOL ABSEN ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(interaction.user.id)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    const member = interaction.member;
    let kelas = 'Umum/Lainnya', warna = 0x95a5a6, emoji = '👤';
    const check = (n) => member.roles.cache.some(r => r.name.toUpperCase().includes(n.toUpperCase()));

    if (check('IPA')) { kelas = 'Kelas 12 IPA'; warna = 0x3498db; emoji = '🧪'; }
    else if (check('IPS')) { kelas = 'Kelas 12 IPS'; warna = 0xe67e22; emoji = '📊'; }
    else if (check('BAHASA')) { kelas = 'Kelas 12 Bahasa'; warna = 0xf1c40f; emoji = '📒'; }

    absensi[tanggal].push(interaction.user.id);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][interaction.user.id] = (absensi.bulanan[bulanKey][interaction.user.id] || 0) + 1;
    saveDB();

    // ===== KIRIM KE VERCEL =====
await fetch(process.env.API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: interaction.user.id,
    nama: interaction.user.username,
    kelas: kelas,
    jam: jam
  })
});

    const logChan = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChan) {
      const em = new EmbedBuilder().setColor(warna).setTitle('📋 Absensi Masuk').setThumbnail(interaction.user.displayAvatarURL())
        .addFields({ name: '👤 Nama', value: `${member.displayName}`, inline: true }, { name: `${emoji} Kelas`, value: `${kelas}`, inline: true }, { name: '⏰ Jam', value: `${jam} WIB`, inline: false }).setTimestamp();
      logChan.send({ embeds: [em] });
    }
    interaction.reply({ content: `✅ Berhasil absen, **${member.displayName}**!`, ephemeral: true });
  }
});

// --- PERINTAH CHAT ---
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');

  if (msg.content === '!recap') {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const dataHarian = absensi[today] || [];
    const ipa = [], ips = [], bahasa = [], umum = [];

    for (const id of dataHarian) {
      let target = msg.guild.members.cache.get(id) || await msg.guild.members.fetch(id).catch(() => null);
      const name = target ? target.displayName : `User ${id}`;
      const r = target ? target.roles.cache : null;
      if (r && r.some(x => x.name.toUpperCase().includes('IPA'))) ipa.push(name);
      else if (r && r.some(x => x.name.toUpperCase().includes('IPS'))) ips.push(name);
      else if (r && r.some(x => x.name.toUpperCase().includes('BAHASA'))) bahasa.push(name);
      else umum.push(name);
    }

    const fmt = (arr) => arr.length === 0 ? '_Kosong_' : arr.map(n => `• ${n}`).join('\n');
    const em = new EmbedBuilder().setColor(0x34495e).setTitle(`📊 Rekap Absensi: ${today}`)
      .addFields({ name: '🧪 IPA', value: fmt(ipa), inline: true }, { name: '📊 IPS', value: fmt(ips), inline: true }, { name: '📒 Bahasa', value: fmt(bahasa), inline: true }, { name: '👤 Umum', value: fmt(umum), inline: false })
      .setFooter({ text: `Total Hadir: ${dataHarian.length}` });
    msg.channel.send({ embeds: [em] });
  }

  if (msg.content === '!topbulan') {
    const now = new Date();
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = absensi.bulanan?.[bulanKey];
    if (!data) return msg.reply('Belum ada data.');
    const sorted = Object.entries(data).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const list = sorted.map((u, i) => {
        const t = msg.guild.members.cache.get(u[0]);
        return `**${i+1}.** ${t ? t.displayName : `<@${u[0]}>`} — ${u[1]} Hari`;
    }).join('\n');
    msg.channel.send({ embeds: [new EmbedBuilder().setTitle(`🏆 Top Absensi ${bulanKey}`).setDescription(list).setColor(0x2ecc71)] });
  }

  if (msg.content === '!reset') {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    delete absensi[today]; saveDB();
    msg.reply(`✅ Absensi hari ini (**${today}**) telah direset.`);
  }
});

client.login(TOKEN);
