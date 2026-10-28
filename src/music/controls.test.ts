import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "discord.js";
import type { Player } from "lavalink-client";
import { startNowPlayingProgressTimer, stopNowPlayingProgressTimer } from "./controls.js";

describe("progressTimer", () => {
  it("inicia e para o timer sem erros", () => {
    const mockPlayer = {
      guildId: "mock-guild-123",
      playing: true,
      paused: false,
      queue: { current: null },
    } as unknown as Player;

    const mockClient = {} as unknown as Client;

    // Iniciar timer
    startNowPlayingProgressTimer(mockPlayer, mockClient);

    // Parar timer
    stopNowPlayingProgressTimer(mockPlayer);

    // Parar novamente não deve quebrar
    stopNowPlayingProgressTimer(mockPlayer);
    assert.ok(true);
  });
});
