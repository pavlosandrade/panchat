import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from "discord.js";
import type { LavalinkManager, Player, Track, UnresolvedTrack } from "lavalink-client";
import { formatDuration } from "./resolve.js";

export const MUSIC_BUTTON_IDS = {
  TOGGLE: "music:toggle",
  SKIP: "music:skip",
  STOP: "music:stop",
} as const;

const NOW_PLAYING_DATA_KEY = "nowPlayingMessage";

interface StoredNowPlayingMessage {
  channelId: string;
  messageId: string;
}

export interface RequesterInfo {
  id: string;
  username: string;
}

export function getRequesterId(track: Track | UnresolvedTrack | null | undefined): string | undefined {
  if (!track || !track.requester || typeof track.requester !== "object") {
    return undefined;
  }
  const req = track.requester as Partial<RequesterInfo>;
  return typeof req.id === "string" ? req.id : undefined;
}

export function getMemberVoiceChannelId(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
): string | null {
  const fromVoiceState = interaction.guild?.voiceStates.cache.get(interaction.user.id)?.channelId;
  if (fromVoiceState) {
    return fromVoiceState;
  }
  const member = interaction.member;
  if (!member || !("voice" in member)) {
    return null;
  }
  return (member as GuildMember).voice.channelId;
}

/**
 * Valida se o usuário pode controlar o player atual (precisa estar na mesma call que o bot).
 * Retorna uma string de erro caso inválido, ou null se estiver tudo certo.
 */
export function validateVoiceControl(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  player: Player | undefined,
): string | null {
  const userChannelId = getMemberVoiceChannelId(interaction);
  if (!userChannelId) {
    return "Você precisa estar em um canal de voz para usar este controle.";
  }
  if (!player || !player.voiceChannelId) {
    return "Não há nada tocando no momento.";
  }
  if (player.voiceChannelId !== userChannelId) {
    return `Você precisa estar na mesma call que o bot (<#${player.voiceChannelId}>) para usar este controle.`;
  }
  return null;
}

export function buildNowPlayingEmbed(track: Track, paused = false): EmbedBuilder {
  const duration = formatDuration(track.info.duration, track.info.isStream);
  const requesterId = getRequesterId(track);
  const statusPrefix = paused ? "⏸️ Pausado" : "▶️ Tocando agora";

  const embed = new EmbedBuilder()
    .setColor(paused ? 0xf59e0b : 0x22c55e)
    .setTitle(statusPrefix)
    .setDescription(
      track.info.uri ? `**[${track.info.title}](${track.info.uri})**` : `**${track.info.title}**`,
    )
    .addFields(
      { name: "Canal / Autor", value: track.info.author || "Desconhecido", inline: true },
      { name: "Duração", value: `\`${duration}\``, inline: true },
    );

  if (requesterId) {
    embed.addFields({ name: "Pedido por", value: `<@${requesterId}>`, inline: true });
  }

  if (track.info.artworkUrl) {
    embed.setThumbnail(track.info.artworkUrl);
  }

  return embed;
}

export function buildNowPlayingControls(
  paused: boolean,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.TOGGLE)
      .setEmoji("⏯️")
      .setLabel(paused ? "Retomar" : "Pausar")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.SKIP)
      .setEmoji("⏭️")
      .setLabel("Pular")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.STOP)
      .setEmoji("⏹️")
      .setLabel("Parar")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

/**
 * Desativa os botões da mensagem "Tocando agora" anterior, se existir.
 */
export async function disablePreviousNowPlayingMessage(
  player: Player,
  client: Client,
): Promise<void> {
  const previous = player.getData<StoredNowPlayingMessage | undefined>(NOW_PLAYING_DATA_KEY);
  if (!previous) {
    return;
  }
  player.deleteData(NOW_PLAYING_DATA_KEY);

  try {
    const channel = await client.channels.fetch(previous.channelId);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      return;
    }
    const message = await channel.messages.fetch(previous.messageId);
    await message.edit({
      components: [buildNowPlayingControls(player.paused, true)],
    });
  } catch {
    // Mensagem ou canal pode ter sido apagado; ignoramos com segurança.
  }
}

export function saveNowPlayingMessage(
  player: Player,
  channelId: string,
  messageId: string,
): void {
  player.setData(NOW_PLAYING_DATA_KEY, { channelId, messageId } satisfies StoredNowPlayingMessage);
}

/**
 * Atualiza o embed e o rótulo do botão Pausar/Retomar na mensagem "Tocando agora" ativa.
 */
export async function refreshNowPlayingMessage(
  player: Player,
  client: Client,
): Promise<void> {
  const stored = player.getData<StoredNowPlayingMessage | undefined>(NOW_PLAYING_DATA_KEY);
  const currentTrack = player.queue.current;
  if (!stored || !currentTrack) {
    return;
  }

  try {
    const channel = await client.channels.fetch(stored.channelId);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      return;
    }
    const message = await channel.messages.fetch(stored.messageId);
    await message.edit({
      embeds: [buildNowPlayingEmbed(currentTrack, player.paused)],
      components: [buildNowPlayingControls(player.paused, false)],
    });
  } catch {
    // Ignora se a mensagem não existir mais.
  }
}

export async function handleMusicButton(
  interaction: ButtonInteraction,
  lavalink: LavalinkManager,
): Promise<void> {
  if (!interaction.guildId) {
    return;
  }

  const player = lavalink.getPlayer(interaction.guildId);
  const validationError = validateVoiceControl(interaction, player);
  if (validationError || !player) {
    await interaction.reply({
      content: validationError ?? "Não há nada tocando no momento.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const currentTrack = player.queue.current;

  switch (interaction.customId) {
    case MUSIC_BUTTON_IDS.TOGGLE: {
      if (player.paused) {
        await player.resume();
      } else {
        await player.pause();
      }

      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player.paused)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: [buildNowPlayingControls(player.paused, false)],
      });
      return;
    }

    case MUSIC_BUTTON_IDS.SKIP: {
      const skippedTitle = currentTrack?.info.title ?? "a música atual";
      if (player.queue.tracks.length === 0) {
        await player.stopPlaying(true, false);
      } else {
        await player.skip();
      }
      await interaction.reply({
        content: `⏭️ <@${interaction.user.id}> pulou **${skippedTitle}**.`,
      });
      return;
    }

    case MUSIC_BUTTON_IDS.STOP: {
      await disablePreviousNowPlayingMessage(player, interaction.client);
      await player.destroy("Parado pelo botão");
      await interaction.reply({
        content: `⏹️ <@${interaction.user.id}> parou a reprodução e limpou a fila.`,
      });
      return;
    }
  }
}
