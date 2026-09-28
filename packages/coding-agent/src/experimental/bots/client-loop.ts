import { dirname, join } from "node:path";
import type { ClientCommand } from "../../cli/experimental/commands/client.ts";
import { runClientTui } from "../client-tui.ts";

/**
 * Run the client TUI, reopening the runtime against a new server when /bot or
 * /new asks for it. Each iteration stops the TUI and disposes the runtime the
 * same way a normal quit does, so there is no process chain and no leaked
 * attachment. The bot environment is rewritten so the new TUI reads the right
 * agent dir, settings, and theme.
 */
export async function runBotsClientTui(command: ClientCommand): Promise<void> {
	let current = command;
	for (;;) {
		const next = await runClientTui(current);
		if (next === undefined) return;
		process.env.PI_BOT_NAME = next.bot;
		process.env.PI_CODING_AGENT_DIR = next.dir;
		process.env.PI_MEMORY_DIR = join(next.dir, "memory");
		process.env.PI_SERVER_DIR = dirname(next.socketPath);
		current = {
			command: "client",
			connect: { transport: "unix", path: next.socketPath },
			sessionId: next.sessionId,
		};
	}
}
