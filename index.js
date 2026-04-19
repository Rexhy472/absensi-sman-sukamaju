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
const path = require('path');
const cron = require('node-cron'); // Library untuk jadwal otomatis

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// --- KONFIGURASI ENV ---
const TOKEN = process.env.TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const RECAP_CHANNEL_ID = process.env.RECAP_CHANNEL_ID; // ID Channel untuk Rekap Otomatis Malam

const DATA_DIR = '/app/data';
const DATA_PATH = path.join(DATA_DIR, 'absensi.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let absensi = {};
if (fs.existsSync(DATA_PATH)) {
  absensi = JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2));
  } catch (err) {
    console.error("Gagal simpan database:", err);
  }
}

// --- BOT START ---
client.on('ready', () => {
  console.log(`✅ Bot Absensi Aktif sebagai ${client.user.tag}`);
  
  // 1. Kirim Panel Tombol (Jika belum ada)
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hadir').setLabel('Hadir').setStyle(ButtonStyle.Success)
    );
    channel.send({
      content: '📋 **Absensi Hari Ini**\nSilahkan klik tombol di bawah untuk mencatat kehadiran.',
      components: [row]
    }).catch(() => null);
  }

  // 2. JADWAL REKAP OTOMATIS JAM 23:59 WIB
  cron.schedule('59 23 * * *', async () => {
    console.log("Menjalankan Rekap Otomatis Malam...");
    const recapChan = client.channels.cache.get(RECAP_CHANNEL_ID);
    if (!recapChan) return;

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    const dataHarian = absensi[today] || [];
    
    const ipa = [], ips = [], bahasa = [], umum = [];
    for (const id of dataHarian) {
      const target = await recapChan.guild.members.fetch(id).catch(() => null);
      const name = target ? target.displayName : `ID: ${id}`;
      
      if (target && target.roles.cache.some(r => r.name.toUpperCase().includes('IPA'))) ipa.push(name);
      else if (target && target.roles.cache.some(r => r.name.toUpperCase().includes('IPS'))) ips.push(name);
      else if (target && target.roles.cache.some(r => r.name.toUpperCase().includes('BAHASA'))) bahasa.push(name);
      else umum.push(name);
    }

    const fmt = (arr) => arr.length === 0 ? '_Kosong_' : arr.map(n => `• ${n}`).join('\n');
    const em = new EmbedBuilder()
      .setColor(0x34495e).setTitle(`📊 REKAP OTOMATIS: ${today}`)
      .addFields(
        { name: '🧪 IPA', value: fmt(ipa), inline: true },
        { name: '📊 IPS', value: fmt(ips), inline: true },
        { name: '📒 Bahasa', value: fmt(bahasa), inline: true },
        { name: '👤 Umum', value: fmt(umum), inline: false }
      ).setFooter({ text: `Total Hadir: ${dataHarian.length} Siswa` }).setTimestamp();

    recapChan.send({ content: '@everyone Laporan Absensi Hari Ini:', embeds: [em] });
  }, { scheduled: true, timezone: "Asia/Jakarta" });
});

// --- LOGIKA TOMBOL ---
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let kelas = 'Umum/Lainnya';
    let warna = 0x95a5a6; let emoji = '👤';

    const check = (n) => member.roles.cache.some(r => r.name.toUpperCase().includes(n.toUpperCase()));
    if (check('IPA')) { kelas = 'Kelas 12 IPA'; warna = 0x3498db; emoji = '🧪'; }
    else if (check('IPS')) { kelas = 'Kelas 12 IPS'; warna = 0xe67e22; emoji = '📊'; }
    else if (check('BAHASA')) { kelas = 'Kelas 12 Bahasa'; warna = 0xf1c40f; emoji = '📒'; }

    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(interaction.user.id)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    absensi[tanggal].push(interaction.user.id);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][interaction.user.id] = (absensi.bulanan[bulanKey][interaction.user.id] || 0) + 1;
    saveDB();

    const logChan = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChan) {
      const logEm = new EmbedBuilder().setColor(warna).setTitle('📋 Absensi Masuk')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '👤 Nama', value: `${member.displayName}`, inline: true },
          { name: `${emoji} Kelas`, value: `${kelas}`, inline: true },
          { name: '⏰ Jam', value: `${jam} WIB`, inline: false }
        ).setTimestamp();
      logChan.send({ embeds: [logEm] });
    }
    interaction.reply({ content: `✅ Berhasil absen sebagai **${member.displayName}**!`, ephemeral: true });
  }
});

// --- COMMANDS ---
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (msg.content === '!recap' || msg.content === '!reset' || msg.content === '!topbulan') {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');

    if (msg.content === '!recap') {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      // Logika rekap manual sama dengan otomatis di atas...
      msg.reply("Sedang menarik data rekap..."); 
      // (Bisa gunakan logika yang sama dengan cron di atas)
    }

    if (msg.content === '!reset') {
      if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      delete absensi[today]; saveDB();
      msg.reply(`✅ Absensi hari ini (**${today}**) telah direset.`);
    }

    if (msg.content === '!topbulan') {
      const now = new Date();
      const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const data = absensi.bulanan?.[bulanKey];
      if (!data) return msg.reply('Belum ada data.');
      const sorted = Object.entries(data).sort((a,b) => b[1] - a[1]).slice(0, 10);
      const list = sorted.map((u, i) => `**${i+1}.** <@${u[0]}> — ${u[1]} Hari`).join('\n');
      msg.channel.send({ embeds: [new EmbedBuilder().setTitle(`🏆 Top Bulan Ini`).setDescription(list).setColor(0x2ecc71)] });
    }
  }
});

client.login(TOKEN);
