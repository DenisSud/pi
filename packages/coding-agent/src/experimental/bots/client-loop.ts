import type { ClientCommand } from "../../cli/experimental/commands/client.ts";
import { runClientTui } from "../client-tui.ts";

/**
 * Run the client TUI, reopening the runtime against a new server when /bot or
 * /new asks for it. Each iteration stops the TUI and disposes the runtime the
 * same way a normal quit does, so there is no process chain and no leaked
 * attachment.
 */
export async function runBotsClientTui(command: ClientCommand): Promise<void> {
	let current = command;
	for (;;) {
		const next = await runClientTui(current);
		if (next === undefined) return;
		current = {
			command: "client",
			connect: { transport: "unix", path: next.socketPath },
			sessionId: next.sessionId,
		};
	}
}
