import { nowplayingCommand } from "./nowplaying.js";
import { pauseCommand } from "./pause.js";
import { playCommand } from "./play.js";
import { queueCommand } from "./queue.js";
import { resumeCommand } from "./resume.js";
import { skipCommand } from "./skip.js";
import { stopCommand } from "./stop.js";
import type { SlashCommand } from "./types.js";

export const commands: SlashCommand[] = [
  playCommand,
  nowplayingCommand,
  skipCommand,
  pauseCommand,
  resumeCommand,
  stopCommand,
  queueCommand,
];

export const commandMap = new Map<string, SlashCommand>(
  commands.map((cmd) => [cmd.data.name, cmd]),
);
