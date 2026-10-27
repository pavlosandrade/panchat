import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectTrackPlatform,
  formatDuration,
  formatProgressBar,
  formatQueueLines,
  getPlatformTheme,
  isUrlQuery,
  MAX_PLAYLIST_TRACKS,
  slicePlaylistTracks,
  toQuery,
} from "./resolve.js";

describe("toQuery", () => {
  it("prefixa termos de busca simples com ytsearch:", () => {
    assert.equal(toQuery("never gonna give you up"), "ytsearch:never gonna give you up");
    assert.equal(toQuery("  linkin park numb  "), "ytsearch:linkin park numb");
  });

  it("mantém URLs HTTP e HTTPS intactas", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    assert.equal(toQuery(url), url);
    assert.equal(toQuery(`  ${url} `), url);
    assert.equal(toQuery("http://example.com/audio.mp3"), "http://example.com/audio.mp3");
  });

  it("rejeita string vazia", () => {
    assert.throws(() => toQuery("   "), /não pode ser vazia/);
  });
});

describe("isUrlQuery", () => {
  it("identifica URLs corretamente", () => {
    assert.equal(isUrlQuery("https://youtu.be/dQw4w9WgXcQ"), true);
    assert.equal(isUrlQuery("daft punk one more time"), false);
  });
});

describe("formatDuration", () => {
  it("formata minutos e segundos com zero à esquerda", () => {
    assert.equal(formatDuration(0), "00:00");
    assert.equal(formatDuration(65_000), "01:05");
    assert.equal(formatDuration(214_000), "03:34");
  });

  it("formata horas quando >= 3600s", () => {
    assert.equal(formatDuration(3_661_000), "1:01:01");
  });

  it("exibe indicador de transmissão ao vivo quando isStream=true", () => {
    assert.equal(formatDuration(0, true), "AO VIVO");
  });
});

describe("formatQueueLines", () => {
  it("retorna mensagem padrão quando a fila está vazia", () => {
    assert.equal(formatQueueLines([]), "Nenhuma música na fila.");
  });

  it("lista até o limite e informa o restante", () => {
    const tracks = Array.from({ length: 12 }, (_, i) => ({
      title: `Música ${i + 1}`,
      uri: `https://youtube.com/watch?v=${i + 1}`,
      duration: 180_000,
      requesterId: "123456",
    }));

    const output = formatQueueLines(tracks, 10);
    assert.match(output, /\*\*1\.\*\* \[Música 1\]/);
    assert.match(output, /\*\*10\.\*\* \[Música 10\]/);
    assert.doesNotMatch(output, /Música 11/);
    assert.match(output, /e mais 2 música\(s\) na fila/);
  });

  it("nunca ultrapassa 1024 caracteres mesmo com 50 músicas de títulos e URLs longas", () => {
    const tracks = Array.from({ length: 50 }, (_, i) => ({
      title: `Artista Com Nome Muito Grande - Título da Música Oficial Video Clipe Completo Em HD #${i + 1}`,
      uri: `https://www.youtube.com/watch?v=kPa7bsKwL-${String(i).padStart(2, "0")}`,
      duration: 245_000,
      requesterId: "123456789012345678",
    }));

    const output = formatQueueLines(tracks, 10);
    assert.ok(
      output.length <= 950,
      `Esperado <= 950 caracteres, mas gerou ${output.length}`,
    );
    assert.match(output, /música\(s\) na fila/);
  });
});

describe("slicePlaylistTracks", () => {
  it("limita a playlist em 50 músicas por padrão", () => {
    const allTracks = Array.from({ length: 80 }, (_, i) => ({
      info: { identifier: `id-${i + 1}` },
    }));
    const sliced = slicePlaylistTracks(allTracks);
    assert.equal(sliced.length, MAX_PLAYLIST_TRACKS);
    assert.equal(sliced[0].info.identifier, "id-1");
    assert.equal(sliced[49].info.identifier, "id-50");
  });

  it("inicia a partir de selectedTrackId quando informado", () => {
    const allTracks = Array.from({ length: 80 }, (_, i) => ({
      info: { identifier: `id-${i + 1}` },
    }));
    const sliced = slicePlaylistTracks(allTracks, "id-45");
    assert.equal(sliced.length, 36);
    assert.equal(sliced[0].info.identifier, "id-45");
    assert.equal(sliced[35].info.identifier, "id-80");
  });
});

describe("detectTrackPlatform e getPlatformTheme", () => {
  it("detecta Spotify por sourceName ou URL e retorna verde #1DB954", () => {
    assert.equal(detectTrackPlatform("spotify", undefined), "spotify");
    assert.equal(
      detectTrackPlatform("youtube", "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"),
      "spotify",
    );
    assert.equal(getPlatformTheme("spotify").color, 0x1db954);
  });

  it("detecta YouTube por padrão e retorna vermelho #FF0000", () => {
    assert.equal(detectTrackPlatform("youtube", "https://www.youtube.com/watch?v=123"), "youtube");
    assert.equal(getPlatformTheme("youtube").color, 0xff0000);
  });
});

describe("formatProgressBar", () => {
  it("renderiza no início (0%) com o ponto no começo", () => {
    const bar = formatProgressBar(0, 180_000, false, 10);
    assert.match(bar, /^🔘▬▬▬▬▬▬▬▬▬ `00:00 \/ 03:00`$/);
  });

  it("renderiza no meio (50%) com o ponto no centro", () => {
    const bar = formatProgressBar(90_000, 180_000, false, 10);
    assert.match(bar, /^▬▬▬▬▬🔘▬▬▬▬ `01:30 \/ 03:00`$/);
  });

  it("renderiza no fim (100%) com o ponto no final", () => {
    const bar = formatProgressBar(180_000, 180_000, false, 10);
    assert.match(bar, /^▬▬▬▬▬▬▬▬▬🔘 `03:00 \/ 03:00`$/);
  });

  it("exibe AO VIVO para transmissões", () => {
    const bar = formatProgressBar(10_000, 0, true, 10);
    assert.equal(bar, "▬▬▬▬▬▬▬▬▬▬ AO VIVO");
  });
});
