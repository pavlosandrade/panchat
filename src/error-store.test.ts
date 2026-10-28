import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getLastError, recordBotError } from "./error-store.js";

describe("error-store", () => {
  it("armazena e recupera o último erro registrado", () => {
    recordBotError({
      type: "interaction",
      command: "play",
      message: "Falha de teste",
      stack: "Error: Falha de teste\n at test.js:1:1",
    });

    const error = getLastError();
    assert.ok(error);
    assert.equal(error.type, "interaction");
    assert.equal(error.command, "play");
    assert.equal(error.message, "Falha de teste");
    assert.ok(error.time);
  });
});
