import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Client } from "@earendil-works/pi-client";
import type { UnixServerRoute } from "@earendil-works/pi-client/unix";
import type { ServerId } from "@earendil-works/pi-protocol";
import { AgentController } from "./agent-controller.ts";
import {
	createServerServiceSource,
	createSessionServiceSource,
	type ServerServiceSource,
	type SessionServiceSource,
} from "./connection.ts";
import { Models } from "./models.ts";
import { PresentationPlugins } from "./plugins.ts";
import { SessionDirectory, SessionManagement } from "./sessions.ts";
import { Transcript } from "./transcript.ts";

// Browser-safe half of the client runtime: activate the built-in service
// facades on an already-connected server. Discovery and transport selection
// stay in client-runtime.ts because they need the filesystem.

export type ClientRuntimeRoute =
	| ({ readonly transport: "unix" } & UnixServerRoute)
	| { readonly transport: "radius"; readonly serverId: ServerId };

export interface ClientRuntimeServer {
	readonly route: ClientRuntimeRoute;
	readonly client: Client;
	readonly server: ServerServiceSource;
	readonly session: SessionServiceSource;
}

export interface ActivatedClientRuntimeServer extends ClientRuntimeServer {
	readonly directory: SessionDirectory;
	readonly management: SessionManagement;
	readonly plugins: PresentationPlugins;
	readonly models: Models;
	readonly agent: AgentController;
	readonly transcript: Transcript;
}

/** Acquire and connect the built-in service facades used by the non-interactive client. */
export async function activateBuiltinClientServices(
	server: ClientRuntimeServer,
): Promise<ActivatedClientRuntimeServer> {
	const serverServices = server.server.open({
		services: [SessionDirectory, SessionManagement, PresentationPlugins],
		assertAccess() {},
		onError() {},
	});
	const sessionServices = server.session.open({
		services: [Models, AgentController, Transcript],
		assertAccess() {},
		onError() {},
	});
	const directory = serverServices.use(SessionDirectory);
	const remoteManagement = serverServices.use(SessionManagement);
	const management: SessionManagement = {
		create: (options, context) => remoteManagement.create(options, context),
		async remove(sessionId, context) {
			const removesCurrentAttachment = server.client.attachment?.sessionId === sessionId;
			await remoteManagement.remove(sessionId, context);
			if (removesCurrentAttachment) await server.session.whenDetached(context);
		},
		async attach(sessionId, context) {
			await remoteManagement.attach(sessionId, context);
			await server.session.whenAttached(sessionId, context);
		},
		async detach(context) {
			await remoteManagement.detach(context);
			await server.session.whenDetached(context);
		},
	};
	const plugins = serverServices.use(PresentationPlugins);
	const models = sessionServices.use(Models);
	const agent = sessionServices.use(AgentController);
	const transcript = sessionServices.use(Transcript);
	await Promise.all([serverServices.ready(BACKGROUND_CONTEXT), sessionServices.ready(BACKGROUND_CONTEXT)]);
	return { ...server, directory, management, plugins, models, agent, transcript };
}
