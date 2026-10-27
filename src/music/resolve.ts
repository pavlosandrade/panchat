export interface SimpleTrackSummary {
  title: string;
  uri?: string;
  author?: string;
  duration?: number;
  isStream?: boolean;
  requesterId?: string;
}

/**
 * Converte a entrada do usuário em uma query para o Lavalink.
 * Se começar com http:// ou https://, retorna a URL direta;
 * caso contrário, prefixa com "ytsearch:" para buscar no YouTube.
 */
export function toQuery(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("A busca não pode ser vazia.");
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : `ytsearch:${trimmed}`;
}

/**
 * Verifica se a entrada é uma URL direta.
 */
export function isUrlQuery(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

/**
 * Formata milissegundos em mm:ss ou hh:mm:ss.
 */
export function formatDuration(ms?: number, isStream?: boolean): string {
  if (isStream) {
    return "🔴 AO VIVO";
  }
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) {
    return "00:00";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number): string => String(n).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

function truncateTitle(title: string, maxLength = 55): string {
  const clean = title.trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Formata a lista das próximas músicas na fila (até `limit` itens),
 * garantindo que o resultado nunca ultrapasse o limite de 1024 caracteres
 * de um campo de Embed do Discord.
 */
export function formatQueueLines(
  tracks: SimpleTrackSummary[],
  limit = 10,
  maxChars = 950,
): string {
  if (tracks.length === 0) {
    return "Nenhuma música na fila.";
  }

  const slice = tracks.slice(0, limit);
  const lines: string[] = [];
  let currentLength = 0;
  const footerReserve = 45;

  for (let idx = 0; idx < slice.length; idx++) {
    const track = slice[idx];
    const duration = formatDuration(track.duration, track.isStream);
    const shortTitle = truncateTitle(track.title, 55);
    const titleLink = track.uri ? `[${shortTitle}](${track.uri})` : shortTitle;
    const requester = track.requesterId ? ` • <@${track.requesterId}>` : "";
    const line = `**${idx + 1}.** ${titleLink} \`[${duration}]\`${requester}`;

    if (lines.length > 0 && currentLength + line.length + 1 > maxChars - footerReserve) {
      break;
    }

    lines.push(line);
    currentLength += line.length + 1;
  }

  const remaining = tracks.length - lines.length;
  if (remaining > 0) {
    lines.push(`\n*...e mais ${remaining} música(s) na fila.*`);
  }

  return lines.join("\n");
}

export const MAX_PLAYLIST_TRACKS = 50;

/**
 * Seleciona até `maxTracks` (padrão 50) faixas de uma playlist.
 * Se houver uma faixa selecionada (`selectedTrackId`), inicia a fatia a partir dela.
 */
export function slicePlaylistTracks<T extends { info: { identifier?: string } }>(
  tracks: T[],
  selectedTrackId?: string | null,
  maxTracks = MAX_PLAYLIST_TRACKS,
): T[] {
  if (tracks.length === 0) {
    return [];
  }
  let startIdx = 0;
  if (selectedTrackId) {
    const foundIdx = tracks.findIndex((t) => t.info.identifier === selectedTrackId);
    if (foundIdx >= 0) {
      startIdx = foundIdx;
    }
  }
  return tracks.slice(startIdx, startIdx + maxTracks);
}
