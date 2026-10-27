import type { Client, VoiceBasedChannel, VoiceState } from "discord.js";
import { LavalinkManager, type Player, type Track } from "lavalink-client";
import type { AppConfig } from "../config.js";
import {
  buildNowPlayingControls,
  buildNowPlayingEmbed,
  disablePreviousNowPlayingMessage,
  saveNowPlayingMessage,
  type RequesterInfo,
} from "./controls.js";

const EMPTY_CHANNEL_TIMER_KEY = "emptyChannelTimer";

async function sendToPlayerTextChannel(
  client: Client,
  player: Player,
  payload: Parameters<import("discord.js").TextChannel["send"]>[0],
) {
  if (!player.textChannelId) {
    return null;
  }
  try {
    const channel = await client.channels.fetch(player.textChannelId);
    if (!channel || !channel.isTextBased() || !("send" in channel)) {
      return null;
    }
    return await channel.send(payload);
  } catch (err) {
    console.error("[Music] Falha ao enviar mensagem no canal de texto:", err);
    return null;
  }
}

function clearEmptyChannelTimer(player: Player): void {
  const existing = player.getData<NodeJS.Timeout | undefined>(EMPTY_CHANNEL_TIMER_KEY);
  if (existing) {
    clearTimeout(existing);
    player.deleteData(EMPTY_CHANNEL_TIMER_KEY);
  }
}

function countHumanMembers(channel: VoiceBasedChannel): number {
  return channel.members.filter((member) => !member.user.bot).size;
}

export function handleVoiceStateUpdate(
  oldState: VoiceState,
  newState: VoiceState,
  lavalink: LavalinkManager,
  config: AppConfig,
): void {
  const guildId = newState.guild.id || oldState.guild.id;
  const player = lavalink.getPlayer(guildId);
  if (!player || !player.voiceChannelId) {
    return;
  }

  const guild = newState.guild ?? oldState.guild;
  const voiceChannel = guild.channels.cache.get(player.voiceChannelId);
  if (!voiceChannel || !voiceChannel.isVoiceBased()) {
    return;
  }

  const humans = countHumanMembers(voiceChannel);
  if (humans === 0) {
    const existingTimer = player.getData<NodeJS.Timeout | undefined>(EMPTY_CHANNEL_TIMER_KEY);
    if (!existingTimer) {
      const timer = setTimeout(async () => {
        const currentPlayer = lavalink.getPlayer(guildId);
        if (!currentPlayer) {
          return;
        }
        await disablePreviousNowPlayingMessage(currentPlayer, oldState.client);
        await sendToPlayerTextChannel(
          oldState.client,
          currentPlayer,
          `👋 Saí da call após ${config.idleTimeoutMin} minutos sem ninguém por lá.`,
        );
        await currentPlayer.destroy("Call vazia por tempo limite");
      }, config.idleTimeoutMs);

      player.setData(EMPTY_CHANNEL_TIMER_KEY, timer);
    }
  } else {
    clearEmptyChannelTimer(player);
  }
}

export function createMusicManager(client: Client, config: AppConfig): LavalinkManager {
  const lavalink = new LavalinkManager({
    nodes: [
      {
        id: "main-node",
        host: config.lavalinkHost,
        port: config.lavalinkPort,
        authorization: config.lavalinkPassword,
        secure: false,
        retryAmount: 10,
        retryDelay: 5_000,
      },
    ],
    sendToShard: (guildId, payload) => {
      client.guilds.cache.get(guildId)?.shard?.send(payload);
    },
    autoSkip: true,
    client: {
      id: config.discordClientId,
      username: "panchat",
    },
    playerOptions: {
      defaultSearchPlatform: "ytmsearch",
      onDisconnect: {
        autoReconnect: true,
        destroyPlayer: false,
      },
      onEmptyQueue: {
        destroyAfterMs: config.idleTimeoutMs,
      },
      requesterTransformer: (requester: unknown): RequesterInfo => {
        if (requester && typeof requester === "object" && "id" in requester) {
          const r = requester as { id: string; username?: string };
          return { id: r.id, username: r.username ?? "Usuário" };
        }
        return { id: String(requester ?? ""), username: "Usuário" };
      },
    },
  });

  lavalink.nodeManager.on("connect", (node) => {
    console.log(`[Lavalink] Conectado ao nó "${node.id}" (${node.options.host}:${node.options.port})`);
  });

  lavalink.nodeManager.on("error", (node, error) => {
    console.error(`[Lavalink] Erro no nó "${node.id}":`, error.message);
  });

  lavalink.on("trackStart", async (player, track) => {
    if (!track) {
      return;
    }
    await disablePreviousNowPlayingMessage(player, client);
    const sent = await sendToPlayerTextChannel(client, player, {
      embeds: [buildNowPlayingEmbed(track as Track, player.paused)],
      components: [buildNowPlayingControls(player.paused, false)],
    });
    if (sent && player.textChannelId) {
      saveNowPlayingMessage(player, player.textChannelId, sent.id);
    }
  });

  lavalink.on("trackError", async (player, track, payload) => {
    const title = track?.info?.title ?? "faixa desconhecida";
    const reason = payload.exception?.message ?? "erro desconhecido ao reproduzir";
    console.error(`[Music] Erro na faixa "${title}":`, reason);
    await sendToPlayerTextChannel(
      client,
      player,
      `⚠️ Não foi possível reproduzir **${title}** (${reason}). Pulando para a próxima...`,
    );
  });

  lavalink.on("trackStuck", async (player, track) => {
    const title = track?.info?.title ?? "faixa desconhecida";
    console.warn(`[Music] Faixa travou: "${title}"`);
    await sendToPlayerTextChannel(
      client,
      player,
      `⚠️ A reprodução de **${title}** travou. Pulando para a próxima...`,
    );
    if (player.queue.tracks.length > 0) {
      await player.skip();
    } else {
      await player.stopPlaying(true, false);
    }
  });

  lavalink.on("queueEnd", async (player) => {
    await disablePreviousNowPlayingMessage(player, client);
    await sendToPlayerTextChannel(
      client,
      player,
      `✅ A fila terminou! Se ninguém adicionar mais músicas em ${config.idleTimeoutMin} minutos, sairei da call.`,
    );
  });

  lavalink.on("playerQueueEmptyEnd", async (player) => {
    await sendToPlayerTextChannel(
      client,
      player,
      `👋 Saí da call após ${config.idleTimeoutMin} minutos de inatividade.`,
    );
  });

  lavalink.on("playerDestroy", async (player) => {
    clearEmptyChannelTimer(player);
    await disablePreviousNowPlayingMessage(player, client);
  });

  return lavalink;
}
