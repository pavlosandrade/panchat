import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { validateVoiceControl } from "../music/controls.js";
import type { SlashCommand } from "./types.js";

export const skipCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Pula para a próxima música da fila"),

  async execute(interaction, lavalink) {
    if (!interaction.guildId) {
      return;
    }

    const player = lavalink.getPlayer(interaction.guildId);
    const error = validateVoiceControl(interaction, player);
    if (error || !player) {
      await interaction.reply({
        content: error ?? "Não há nada tocando no momento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const currentTitle = player.queue.current?.info.title ?? "a música atual";
    if (player.queue.tracks.length === 0) {
      await player.stopPlaying(true, false);
    } else {
      await player.skip();
    }

    await interaction.reply({
      content: `⏭️ **${currentTitle}** foi pulada.`,
    });
  },
};
