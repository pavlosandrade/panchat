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
import type { LavalinkManager, Player, RepeatMode, Track, UnresolvedTrack } from "lavalink-client";
import { formatDuration, formatQueueLines } from "./resolve.js";

export const MUSIC_BUTTON_IDS = {
  TOGGLE: "music:toggle",
  SKIP: "music:skip",
  STOP: "music:stop",
  LOOP: "music:loop",
  SHUFFLE: "music:shuffle",
  VOL_DOWN: "music:voldown",
  VOL_UP: "music:volup",
  QUEUE: "music:queue",
  HELP: "music:help",
} as const;

const NOW_PLAYING_DATA_KEY = "nowPlayingMessage";
const INITIAL_PLAY_TRACK_KEY = "initialPlayTrackId";

interface StoredNowPlayingMessage {
  channelId: string;
  messageId: string;
  trackId?: string;
}

export function markInitialPlayTrack(player: Player, trackId: string | undefined): void {
  if (trackId) {
    player.setData(INITIAL_PLAY_TRACK_KEY, trackId);
  }
}

export function consumeInitialPlayTrack(player: Player, trackId: string | undefined): boolean {
  const stored = player.getData<string | undefined>(INITIAL_PLAY_TRACK_KEY);
  if (stored && trackId && stored === trackId) {
    player.deleteData(INITIAL_PLAY_TRACK_KEY);
    return true;
  }
  return false;
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

function formatRepeatModeLabel(mode: RepeatMode | undefined): string {
  switch (mode) {
    case "track":
      return "🔂 Música";
    case "queue":
      return "🔁 Fila";
    default:
      return "Desativado";
  }
}

function getNextRepeatMode(mode: RepeatMode | undefined): RepeatMode {
  switch (mode) {
    case "off":
    case undefined:
      return "track";
    case "track":
      return "queue";
    case "queue":
      return "off";
  }
}

export function getTrackBannerUrl(track: Track | UnresolvedTrack): string | null {
  const id = track.info.identifier;
  if (id && /^[\w-]{11}$/.test(id)) {
    return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  }
  return track.info.artworkUrl ?? null;
}

export function buildNowPlayingEmbed(track: Track, player?: Player): EmbedBuilder {
  const paused = player?.paused ?? false;
  const volume = player?.volume ?? 100;
  const repeatMode = player?.repeatMode ?? "off";
  const queueTracks = player?.queue.tracks ?? [];
  const nextTrack = queueTracks[0];

  const duration = formatDuration(track.info.duration, track.info.isStream);
  const requesterId = getRequesterId(track);
  const statusPrefix = paused ? "⏸️ Reprodução Pausada" : "▶️ Tocando Agora";

  const nextUpValue = nextTrack
    ? `${
        nextTrack.info.uri
          ? `**[${nextTrack.info.title}](${nextTrack.info.uri})**`
          : `**${nextTrack.info.title}**`
      } \`[${formatDuration(nextTrack.info.duration, nextTrack.info.isStream)}]\`${
        queueTracks.length > 1 ? ` *(+${queueTracks.length - 1} na fila)*` : ""
      }`
    : "_Nenhuma música na fila — use `/play` para adicionar!_";

  const commandsGuide = [
    "`/play <música>` Adicionar música • `/queue` Ver fila",
    "`/skip` Pular • `/pause` Pausar • `/resume` Retomar • `/stop` Sair",
  ].join("\n");

  const embed = new EmbedBuilder()
    .setAuthor({ name: "🎧 Panchat Music Player" })
    .setColor(paused ? 0xf59e0b : 0x22c55e)
    .setTitle(statusPrefix)
    .setDescription(
      track.info.uri ? `### [${track.info.title}](${track.info.uri})` : `### ${track.info.title}`,
    )
    .addFields(
      { name: "👤 Canal / Artista", value: track.info.author || "Desconhecido", inline: true },
      { name: "⏱️ Duração", value: `\`${duration}\``, inline: true },
      {
        name: "🙋 Pedido por",
        value: requesterId ? `<@${requesterId}>` : "Desconhecido",
        inline: true,
      },
      { name: "🔊 Volume", value: `\`${volume}%\``, inline: true },
      { name: "🔁 Repetição", value: `\`${formatRepeatModeLabel(repeatMode)}\``, inline: true },
      { name: "📜 Na Fila", value: `\`${queueTracks.length} música(s)\``, inline: true },
      { name: "⏭️ Próxima a tocar", value: nextUpValue, inline: false },
      { name: "⌨️ Comandos na Tela", value: commandsGuide, inline: false },
    )
    .setFooter({ text: "Use os botões abaixo ou digite / para controlar o player" });

  const bannerUrl = getTrackBannerUrl(track);
  if (bannerUrl) {
    embed.setImage(bannerUrl);
  }

  return embed;
}

export function buildQueuedTrackEmbed(
  track: Track | UnresolvedTrack,
  position: number,
  requesterId: string,
): EmbedBuilder {
  const duration = formatDuration(track.info.duration, track.info.isStream);
  const embed = new EmbedBuilder()
    .setColor(0x3b82f6)
    .setAuthor({ name: "➕ Adicionado à Fila" })
    .setDescription(
      track.info.uri ? `**[${track.info.title}](${track.info.uri})**` : `**${track.info.title}**`,
    )
    .addFields(
      { name: "👤 Canal / Artista", value: track.info.author || "Desconhecido", inline: true },
      { name: "⏱️ Duração", value: `\`${duration}\``, inline: true },
      { name: "📌 Posição na Fila", value: `\`#${position}\``, inline: true },
      { name: "🙋 Pedido por", value: `<@${requesterId}>`, inline: true },
    );

  const thumb = track.info.artworkUrl ?? getTrackBannerUrl(track);
  if (thumb) {
    embed.setThumbnail(thumb);
  }

  return embed;
}

export function buildPlaylistLoadedEmbed(options: {
  playlistTitle: string;
  playlistUri?: string;
  tracksAdded: (Track | UnresolvedTrack)[];
  totalPlaylistTracks: number;
  requesterId: string;
  thumbnailUrl?: string | null;
}): EmbedBuilder {
  const { playlistTitle, playlistUri, tracksAdded, totalPlaylistTracks, requesterId, thumbnailUrl } =
    options;

  const totalDurationMs = tracksAdded.reduce((acc, t) => acc + (t.info.duration ?? 0), 0);
  const formattedTotalDuration = formatDuration(totalDurationMs, false);
  const wasCapped = totalPlaylistTracks > tracksAdded.length;

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setAuthor({ name: "📚 Playlist Adicionada à Fila" })
    .setDescription(
      playlistUri ? `**[${playlistTitle}](${playlistUri})**` : `**${playlistTitle}**`,
    )
    .addFields(
      {
        name: "🎵 Músicas Adicionadas",
        value: wasCapped
          ? `\`${tracksAdded.length}\` *(limite máx. de ${tracksAdded.length} de ${totalPlaylistTracks})*`
          : `\`${tracksAdded.length} música(s)\``,
        inline: true,
      },
      { name: "⏱️ Duração Somada", value: `\`${formattedTotalDuration}\``, inline: true },
      { name: "🙋 Pedido por", value: `<@${requesterId}>`, inline: true },
    );

  const thumb =
    thumbnailUrl ??
    (tracksAdded[0] ? (tracksAdded[0].info.artworkUrl ?? getTrackBannerUrl(tracksAdded[0])) : null);
  if (thumb) {
    embed.setThumbnail(thumb);
  }

  return embed;
}

export function buildNowPlayingControls(
  player?: Player,
  disabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const paused = player?.paused ?? false;
  const repeatMode = player?.repeatMode ?? "off";
  const volume = player?.volume ?? 100;
  const queueLength = player?.queue.tracks.length ?? 0;
  const currentUri = player?.queue.current?.info.uri;

  const loopLabel =
    repeatMode === "track"
      ? "Loop: Música"
      : repeatMode === "queue"
        ? "Loop: Fila"
        : "Loop: Off";

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.TOGGLE)
      .setEmoji(paused ? "▶️" : "⏯️")
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
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.LOOP)
      .setEmoji(repeatMode === "track" ? "🔂" : "🔁")
      .setLabel(loopLabel)
      .setStyle(repeatMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.SHUFFLE)
      .setEmoji("🔀")
      .setLabel("Shuffle")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || queueLength < 2),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.VOL_DOWN)
      .setEmoji("🔉")
      .setLabel("-20%")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || volume <= 20),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.VOL_UP)
      .setEmoji("🔊")
      .setLabel("+20%")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || volume >= 150),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.QUEUE)
      .setEmoji("📜")
      .setLabel(`Fila (${queueLength})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(MUSIC_BUTTON_IDS.HELP)
      .setEmoji("❓")
      .setLabel("Comandos")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );

  if (currentUri && /^https?:\/\//i.test(currentUri)) {
    row2.addComponents(
      new ButtonBuilder()
        .setLabel("YouTube")
        .setEmoji("🔗")
        .setStyle(ButtonStyle.Link)
        .setURL(currentUri),
    );
  }

  return [row1, row2];
}

export function getStoredNowPlayingMessage(player: Player): StoredNowPlayingMessage | undefined {
  return player.getData<StoredNowPlayingMessage | undefined>(NOW_PLAYING_DATA_KEY);
}

/**
 * Desativa os botões da mensagem "Tocando agora" anterior, se existir.
 */
export async function disablePreviousNowPlayingMessage(
  player: Player,
  client: Client,
): Promise<void> {
  const previous = getStoredNowPlayingMessage(player);
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
      components: buildNowPlayingControls(player, true),
    });
  } catch {
    // Mensagem ou canal pode ter sido apagado; ignoramos com segurança.
  }
}

export function saveNowPlayingMessage(
  player: Player,
  channelId: string,
  messageId: string,
  trackId?: string,
): void {
  player.setData(NOW_PLAYING_DATA_KEY, {
    channelId,
    messageId,
    trackId,
  } satisfies StoredNowPlayingMessage);
}

/**
 * Atualiza o embed e os botões na mensagem "Tocando agora" ativa.
 */
export async function refreshNowPlayingMessage(
  player: Player,
  client: Client,
): Promise<void> {
  const stored = getStoredNowPlayingMessage(player);
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
      embeds: [buildNowPlayingEmbed(currentTrack, player)],
      components: buildNowPlayingControls(player, false),
    });
  } catch {
    // Ignora se a mensagem não existir mais.
  }
}

function buildQueueEmbedForPlayer(player: Player): EmbedBuilder {
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

  return new EmbedBuilder()
    .setColor(0x3b82f6)
    .setTitle("🎶 Fila de Reprodução")
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
}

function buildCommandsHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("❓ Guia de Comandos e Controles — Panchat")
    .setDescription("Você pode controlar o bot pelos **botões abaixo do player** ou digitando os comandos `/`:")
    .addFields(
      {
        name: "🎵 Comandos de Barra (`/`)",
        value: [
          "• `/play musica:<nome ou link>` — Toca ou adiciona uma música do YouTube à fila",
          "• `/queue` — Mostra a música atual e as próximas 10 da fila",
          "• `/skip` — Pula para a próxima música",
          "• `/pause` — Pausa a reprodução atual",
          "• `/resume` — Retoma a música pausada",
          "• `/stop` — Para a música, limpa a fila e desconecta da call",
        ].join("\n"),
      },
      {
        name: "🎛️ Botões do Painel",
        value: [
          "• **⏯️ Pausar / Retomar:** Pausa ou continua a música na hora",
          "• **⏭️ Pular / ⏹️ Parar:** Avança de faixa ou encerra a sessão",
          "• **🔁 Loop:** Alterna entre *Desativado*, *Repetir Música* e *Repetir Fila*",
          "• **🔀 Shuffle:** Embaralha a ordem das músicas na fila",
          "• **🔉 -20% / 🔊 +20%:** Ajusta o volume da reprodução (20% a 150%)",
          "• **📜 Fila:** Exibe a fila atual sem precisar digitar `/queue`",
        ].join("\n"),
      },
    );
}

export async function handleMusicButton(
  interaction: ButtonInteraction,
  lavalink: LavalinkManager,
): Promise<void> {
  if (!interaction.guildId) {
    return;
  }

  // O botão de ajuda funciona mesmo sem player ou fora da call
  if (interaction.customId === MUSIC_BUTTON_IDS.HELP) {
    await interaction.reply({
      embeds: [buildCommandsHelpEmbed()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const player = lavalink.getPlayer(interaction.guildId);

  // O botão de ver a fila pode ser consultado por qualquer membro
  if (interaction.customId === MUSIC_BUTTON_IDS.QUEUE) {
    if (!player || (!player.queue.current && player.queue.tracks.length === 0)) {
      await interaction.reply({
        content: "A fila está vazia no momento.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      embeds: [buildQueueEmbedForPlayer(player)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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

      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: buildNowPlayingControls(player, false),
      });
      return;
    }

    case MUSIC_BUTTON_IDS.LOOP: {
      const nextMode = getNextRepeatMode(player.repeatMode);
      await player.setRepeatMode(nextMode);

      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: buildNowPlayingControls(player, false),
      });
      return;
    }

    case MUSIC_BUTTON_IDS.SHUFFLE: {
      if (player.queue.tracks.length >= 2) {
        await player.queue.shuffle();
      }
      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: buildNowPlayingControls(player, false),
      });
      return;
    }

    case MUSIC_BUTTON_IDS.VOL_DOWN: {
      const newVol = Math.max(20, (player.volume ?? 100) - 20);
      await player.setVolume(newVol);
      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: buildNowPlayingControls(player, false),
      });
      return;
    }

    case MUSIC_BUTTON_IDS.VOL_UP: {
      const newVol = Math.min(150, (player.volume ?? 100) + 20);
      await player.setVolume(newVol);
      const embeds = currentTrack ? [buildNowPlayingEmbed(currentTrack, player)] : undefined;
      await interaction.update({
        ...(embeds ? { embeds } : {}),
        components: buildNowPlayingControls(player, false),
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
