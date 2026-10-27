import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import type { LavalinkManager } from "lavalink-client";

export interface SlashCommand {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction, lavalink: LavalinkManager) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction, lavalink: LavalinkManager) => Promise<void>;
}
