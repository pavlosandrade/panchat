import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { refreshNowPlayingMessage, startNowPlayingProgressTimer, validateVoiceControl } from "../music/controls.js";
import type { SlashCommand } from "./types.js";

export const resumeCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Retoma a música pausada"),

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

    if (!player.paused) {
      await interaction.reply({
        content: "A música já está tocando.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await player.resume();
    startNowPlayingProgressTimer(player, interaction.client);
    await refreshNowPlayingMessage(player, interaction.client);
    await interaction.reply({
      content: "Reprodução retomada.",
    });
  },
};
