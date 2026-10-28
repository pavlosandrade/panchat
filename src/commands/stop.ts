import { MessageFlags, SlashCommandBuilder } from "discord.js";
import {
  disablePreviousNowPlayingMessage,
  stopNowPlayingProgressTimer,
  validateVoiceControl,
} from "../music/controls.js";
import type { SlashCommand } from "./types.js";

export const stopCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Para a música, limpa a fila e desconecta o bot da call"),

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

    stopNowPlayingProgressTimer(player);
    await disablePreviousNowPlayingMessage(player, interaction.client);
    await player.destroy("Parado por /stop");
    await interaction.reply({
      content: "Reprodução encerrada e fila limpa.",
    });
  },
};
