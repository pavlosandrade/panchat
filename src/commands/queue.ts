import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getRequesterId } from "../music/controls.js";
import { formatDuration, formatQueueLines } from "../music/resolve.js";
import type { SlashCommand } from "./types.js";

export const queueCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Mostra a música atual e as próximas da fila"),

  async execute(interaction, lavalink) {
    if (!interaction.guildId) {
      return;
    }

    const player = lavalink.getPlayer(interaction.guildId);
    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      await interaction.reply({
        content: "A fila está vazia no momento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const current = player.queue.current;
    const currentLine = current
      ? `**[${current.info.title}](${current.info.uri})** \`[${formatDuration(current.info.duration, current.info.isStream)}]\`${
          getRequesterId(current) ? ` • <@${getRequesterId(current)}>` : ""
        }`
      : "Nenhuma música tocando agora.";

    const upcomingSummaries = player.queue.tracks.map((t) => ({
      title: t.info.title,
      uri: t.info.uri,
      author: t.info.author,
      duration: t.info.duration,
      isStream: t.info.isStream,
      requesterId: getRequesterId(t),
    }));

    const embed = new EmbedBuilder()
      .setColor(0x3b82f6)
      .setTitle("🎶 Fila de reprodução")
      .addFields(
        {
          name: player.paused ? "⏸️ Pausado agora" : "▶️ Tocando agora",
          value: currentLine,
        },
        {
          name: `Próximas na fila (${player.queue.tracks.length})`,
          value: formatQueueLines(upcomingSummaries, 10),
        },
      );

    await interaction.reply({ embeds: [embed] });
  },
};
