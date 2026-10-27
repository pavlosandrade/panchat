import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildQueueEmbedForPlayer } from "../music/controls.js";
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

    await interaction.reply({ embeds: [buildQueueEmbedForPlayer(player)] });
  },
};
