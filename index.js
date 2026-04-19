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

const TOKEN = process.env.TOKEN;
const PANEL_CHANNEL_ID = process.env.PANEL_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const DATA_DIR = '/app/data';
const DATA_PATH = path.join(DATA_DIR, 'absensi.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

let absensi = {};
if (fs.existsSync(DATA_PATH)) {
  absensi = JSON.parse(fs.readFileSync(DATA_PATH));
}

function saveDB() {
  fs.writeFileSync(DATA_PATH, JSON.stringify(absensi, null, 2));
}

client.on('ready', () => {
  console.log(`✅ Bot Absensi Aktif: ${client.user.tag}`);
  const channel = client.channels.cache.get(PANEL_CHANNEL_ID);
  if (channel) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hadir').setLabel('Hadir').setStyle(ButtonStyle.Success)
    );
    channel.send({ content: '📋 **Absensi Hari Ini**\nKlik tombol di bawah!', components: [row] });
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  if (interaction.customId === 'hadir') {
    // FETCH MEMBER AGAR ROLE TERBACA AKURAT
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);
    
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
    const tanggal = now.toLocaleDateString('id-ID');
    const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const userId = interaction.user.id;

    let kelas = 'Umum/Lainnya';
    let warnaEmbed = 0x95a5a6; 
    let emojiKelas = '👤';

    const checkRole = (txt) => member.roles.cache.some(r => r.name.toUpperCase().includes(txt.toUpperCase()));

    if (checkRole('IPA')) {
      kelas = 'Kelas 12 IPA'; warnaEmbed = 0x3498db; emojiKelas = '🧪';
    } else if (checkRole('IPS')) {
      kelas = 'Kelas 12 IPS'; warnaEmbed = 0xe67e22; emojiKelas = '📊';
    } else if (checkRole('Bahasa')) {
      kelas = 'Kelas 12 Bahasa'; warnaEmbed = 0xf1c40f; emojiKelas = '📒';
    }

    if (!absensi[tanggal]) absensi[tanggal] = [];
    if (absensi[tanggal].includes(userId)) {
      return interaction.reply({ content: 'Kamu sudah absen hari ini! ✅', ephemeral: true });
    }

    absensi[tanggal].push(userId);
    const bulanKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!absensi.bulanan) absensi.bulanan = {};
    if (!absensi.bulanan[bulanKey]) absensi.bulanan[bulanKey] = {};
    absensi.bulanan[bulanKey][userId] = (absensi.bulanan[bulanKey][userId] || 0) + 1;
    saveDB();

    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor(warnaEmbed)
        .setTitle('📋 Absensi Masuk')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '👤 Nama', value: `${interaction.user.username}`, inline: true },
          { name: `${emojiKelas} Kelas`, value: `${kelas}`, inline: true },
          { name: '⏰ Waktu', value: `${jam} WIB`, inline: false }
        ).setTimestamp();
      logChannel.send({ embeds: [logEmbed] });
    }

    interaction.reply({ content: `✅ Berhasil! Tercatat di **${kelas}**.`, ephemeral: true });
  }
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  if (msg.content === '!recap') {
    if (!msg.member.permissions.has('Administrator')) return msg.reply('Hanya Admin! ❌');
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
    const em = new EmbedBuilder().setColor(0x34495e).setTitle(`📊 Rekap: ${today}`)
      .addFields({ name: '🧪 IPA', value: format(ipa), inline: true }, { name: '📊 IPS', value: format(ips), inline: true }, { name: '📒 Bahasa', value: format(bahasa), inline: true }, { name: '👤 Umum', value: format(umum), inline: false });
    msg.channel.send({ embeds: [em] });
  }

  if (msg.content === '!reset') {
    if (!msg.member.permissions.has('Administrator')) return msg.reply('Hanya Admin! ❌');
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' })).toLocaleDateString('id-ID');
    delete absensi[today];
    saveDB();
    msg.reply(`✅ Absensi hari ini (**${today}**) telah direset.`);
  }
});

client.login(TOKEN);
