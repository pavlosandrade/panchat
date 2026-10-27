import { REST, Routes } from "discord.js";
import { pathToFileURL } from "node:url";
import { commands } from "./commands/index.js";
import { type AppConfig, loadConfig } from "./config.js";

export async function registerGuildCommands(
  guildId: string,
  config: AppConfig,
  guildName?: string,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const body = commands.map((cmd) => cmd.data.toJSON());
  const label = guildName ? `"${guildName}" (${guildId})` : guildId;

  await rest.put(Routes.applicationGuildCommands(config.discordClientId, guildId), { body });
  console.log(`[Deploy] ${body.length} comandos registrados no servidor ${label}.`);
}

export async function registerAllGuildsCommands(
  guilds: Array<{ id: string; name?: string }>,
  config: AppConfig,
): Promise<void> {
  for (const guild of guilds) {
    try {
      await registerGuildCommands(guild.id, config, guild.name);
    } catch (err) {
      console.error(`[Deploy] Falha ao registrar comandos no servidor ${guild.id}:`, err);
    }
  }
}

async function runCli(): Promise<void> {
  const config = loadConfig();
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const guilds = (await rest.get(Routes.userGuilds())) as Array<{ id: string; name: string }>;

  if (guilds.length === 0 && config.discordGuildId) {
    await registerGuildCommands(config.discordGuildId, config);
    return;
  }

  await registerAllGuildsCommands(guilds, config);
}

const isMain =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runCli().catch((err) => {
    console.error("[Deploy] Falha ao registrar comandos:", err);
    process.exit(1);
  });
}
