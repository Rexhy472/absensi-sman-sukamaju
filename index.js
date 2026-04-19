const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ===== KONFIGURASI (AMBIL DARI ENV RAILWAY) =====
const TOKEN = process.env.TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

// Path Database (Railway Volume di /app/data)
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
  fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2));
}

// ===== BOT READY =====
client.on('ready', () => {
  console.log(`✅ Bot Absensi Aktif: ${client.user.tag}`);
  
  // Kirim Panel Otomatis saat restart (opsional)
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('hadir')
        .setLabel('Hadir')
        .setStyle(ButtonStyle.Success)
    );
    channel.send({
      content: '📋 **Absensi Hari Ini**\nSilahkan klik tombol di bawah untuk mencatat kehadiran.',
      components: [row]
    });
  }
});

// ===== LOGIKA TOMBOL ABSEN =====
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    const member = interaction.member;
    const userId = interaction.user.id;

    // Tentukan Role & Warna
    let kelas = 'Umum/Lainnya';
    let warnaEmbed = 0x95a5a6; // Abu-abu
    let emojiKelas = '👤';

    if (member.roles.cache.some(r => r.name.includes('IPA'))) {
      kelas = 'Kelas 12 IPA';
      warnaEmbed = 0x3498db; // Biru
      emojiKelas = '🧪';
    } else if (member.roles.cache.some(r => r.name.includes('IPS'))) {
      kelas = 'Kelas 12 IPS';
      warnaEmbed = 0xe67e22; // Orange
      emojiKelas = '📊';
    } else if (member.roles.cache.some(r => r.name.includes('Bahasa'))) {
      kelas = 'Kelas 12 Bahasa';
      warnaEmbed = 0xf1c40f; // Kuning
      emojiKelas = '📒';
    }

    // Cek Duplikasi
    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(userId)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    // Simpan ke DB
    absensi[tanggal].push(userId);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][userId] = (absensi.bulanan[bulanKey][userId] || 0) + 1;
    saveDB();

    // Kirim Log Embed
    const logChannel = interaction.client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(warnaEmbed)
        .setTitle('📋 Absensi Masuk')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '👤 Nama Siswa', value: `${interaction.user.username}`, inline: true },
          { name: `${emojiKelas} Kelas`, value: `${kelas}`, inline: true },
          { name: '⏰ Waktu Hadir', value: `${jam} WIB`, inline: false }
        )
        .setFooter({ text: `User ID: ${userId}` })
        .setTimestamp();

      logChannel.send({ embeds: [logEmbed] });
    }

    interaction.reply({ content: `✅ Berhasil! Kamu tercatat di **${kelas}**.`, ephemeral: true });
  }
});

// ===== COMMANDS (!topbulan & !recap) =====
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // 1. Leaderboard Bulanan
  if (msg.content === '!topbulan') {
    const now = new Date();
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const data = absensi.bulanan?.[bulanKey];

    if (!data) return msg.reply('Belum ada data bulan ini.');

    const sorted = Object.entries(data).sort((a,b) => b[1] - a[1]).slice(0, 10);
    const list = sorted.map((u, i) => `**${i+1}.** <@${u[0]}> — ${u[1]} Hari`).join('\n');

    const lbEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`🏆 Leaderboard Absensi - ${bulanKey}`)
      .setDescription(list || 'Belum ada data.');

    msg.channel.send({ embeds: [lbEmbed] });
  }

  // 2. Test Recap
  if (msg.content === '!recap') {
    if (!msg.member.permissions.has('Administrator')) {
      return msg.reply('Hanya Admin yang bisa rekap! ❌');
    }

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    const dataHarian = absensi[today] || [];

    const ipa = [], ips = [], bahasa = [], umum = [];

    for (const id of dataHarian) {
      const target = await msg.guild.members.fetch(id).catch(() => null);
      if (!target) continue;

      if (target.roles.cache.some(r => r.name.includes('IPA'))) ipa.push(id);
      else if (target.roles.cache.some(r => r.name.includes('IPS'))) ips.push(id);
      else if (target.roles.cache.some(r => r.name.includes('Bahasa'))) bahasa.push(id);
      else umum.push(id);
    }

    const format = (arr) => arr.length === 0 ? '_Kosong_' : arr.map(id => `• <@${id}>`).join('\n');

    const recapEmbed = new EmbedBuilder()
      .setColor(0x34495e)
      .setTitle(`📊 Rekap Absensi: ${today}`)
      .addFields(
        { name: '🧪 IPA', value: format(ipa), inline: true },
        { name: '📊 IPS', value: format(ips), inline: true },
        { name: '📒 Bahasa', value: format(bahasa), inline: true },
        { name: '👤 Umum', value: format(umum), inline: false }
      )
      .setFooter({ text: `Total: ${dataHarian.length} Siswa` });

    msg.channel.send({ embeds: [recapEmbed] });
  }
});

client.login(TOKEN);
