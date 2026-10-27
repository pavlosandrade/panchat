import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Track } from "lavalink-client";
import {
  buildNowPlayingControls,
  buildNowPlayingEmbed,
  saveNowPlayingMessage,
} from "../music/controls.js";
import type { SlashCommand } from "./types.js";

export const nowplayingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Mostra a música atual e a barra de progresso"),

  async execute(interaction, lavalink) {
    if (!interaction.guildId) {
      return;
    }

    const player = lavalink.getPlayer(interaction.guildId);
    const currentTrack = player?.queue.current;
    if (!player || !currentTrack) {
      await interaction.reply({
        content: "Não há nada tocando no momento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    player.textChannelId = interaction.channelId;

    const sent = await interaction.reply({
      embeds: [buildNowPlayingEmbed(currentTrack as Track, player)],
      components: buildNowPlayingControls(player, false),
      fetchReply: true,
    });

    saveNowPlayingMessage(player, interaction.channelId, sent.id, currentTrack.info.identifier);
  },
};
