import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { getMemberVoiceChannelId } from "../music/controls.js";
import { formatDuration, isUrlQuery, toQuery } from "../music/resolve.js";
import type { SlashCommand } from "./types.js";

export const playCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Toca uma música do YouTube por nome ou link")
    .addStringOption((opt) =>
      opt
        .setName("musica")
        .setDescription("Nome da música ou link do YouTube")
        .setRequired(true),
    ),

  async execute(interaction, lavalink) {
    if (!interaction.guildId || !interaction.guild) {
      await interaction.reply({
        content:
          "⚠️ O bot ainda não foi adicionado como membro (`bot`) neste servidor. Use o link de convite com escopo `bot`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const userVoiceId = getMemberVoiceChannelId(interaction);
    if (!userVoiceId) {
      await interaction.reply({
        content: "Você precisa entrar em um canal de voz antes de usar `/play`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existingPlayer = lavalink.getPlayer(interaction.guildId);
    if (existingPlayer?.voiceChannelId && existingPlayer.voiceChannelId !== userVoiceId) {
      await interaction.reply({
        content: `Já estou tocando em <#${existingPlayer.voiceChannelId}>. Entre lá para adicionar músicas!`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!lavalink.useable) {
      await interaction.reply({
        content: "⏳ O servidor de áudio (Lavalink) ainda está iniciando. Tente novamente em alguns segundos.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply();

    const rawInput = interaction.options.getString("musica", true);
    const query = toQuery(rawInput);

    const player =
      existingPlayer ??
      lavalink.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: userVoiceId,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        selfMute: false,
        volume: 100,
      });

    player.textChannelId = interaction.channelId;

    if (!player.connected) {
      await player.connect();
    }

    const requester = { id: interaction.user.id, username: interaction.user.username };
    let result = await player.search(
      isUrlQuery(rawInput) ? { query } : { query: rawInput.trim(), source: "ytmsearch" },
      requester,
    );

    if (
      !isUrlQuery(rawInput) &&
      (!result || result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0)
    ) {
      result = await player.search({ query: rawInput.trim(), source: "ytsearch" }, requester);
    }

    if (!result || result.loadType === "empty" || result.loadType === "error" || result.tracks.length === 0) {
      if (!player.playing && !player.paused && player.queue.tracks.length === 0) {
        await player.destroy("Nenhum resultado encontrado");
      }
      await interaction.editReply({
        content: `❌ Não encontrei nenhum resultado para **${rawInput}**.`,
      });
      return;
    }

    const track = result.tracks[0];
    await player.queue.add(track);

    const duration = formatDuration(track.info.duration, track.info.isStream);
    const position = player.queue.tracks.length;

    if (!player.playing && !player.paused) {
      await player.play();
      await interaction.editReply({
        content: `🔎 Selecionado: **${track.info.title}** \`[${duration}]\``,
      });
    } else {
      await interaction.editReply({
        content: `➕ Adicionado à fila (#${position}): **${track.info.title}** \`[${duration}]\``,
      });
    }
  },
};
