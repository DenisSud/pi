/**
 * Coding-agent harness for one detached session worker.
 *
 * The generic session worker (`session-worker.ts`) owns storage, the control
 * channel, and the lane lifecycle. This module fills the harness it runs with
 * the same coding-agent surface a normal session has: resources (context files,
 * skills, prompt templates), the coding-agent tool set plus extension tools, the
 * assembled system prompt, and the extension event bridge.
 *
 * Headless by design: extensions see `hasUI === false` and the no-op UI context.
 * Extension commands, UI, and `sendMessage`-style session mutations have no
 * server-side equivalent yet and are no-ops here.
 */

import { readFileSync } from "node:fs";
import {
	AgentHarness,
	type AgentHarnessTool,
	type AgentLane,
	type AgentMessage,
	type ExecutionToolContext,
	type JsonlSessionMetadata,
	type Session,
	type ThinkingLevel,
	TODO_CONTEXT,
} from "@earendil-works/pi-agent-core";
import type { NodeExecutionEnv } from "@earendil-works/pi-agent-core/node";
import type { JsonValue } from "@earendil-works/chord";
import { createAgentSessionServices } from "../core/agent-session-services.ts";
import {
	ExtensionRunner,
	type Extension,
	type ExtensionActions,
	type ExtensionContextActions,
	type RegisteredTool,
	type SessionStartEvent,
	type SetModelHandler,
	type ToolDefinition,
	type ToolInfo,
} from "../core/extensions/index.ts";
import { findInitialModel, resolveCliModel } from "../core/model-resolver.ts";
import { ModelRegistry } from "../core/model-registry.ts";
import type { ResourceLoader } from "../core/resource-loader.ts";
import { createSyntheticSourceInfo } from "../core/source-info.ts";
import {
	buildSystemPrompt,
	type NormalizedBuildSystemPromptOptions,
	normalizeBuildSystemPromptOptions,
} from "../core/system-prompt.ts";
import { createAllToolDefinitions } from "../core/tools/index.ts";
import type { SettingsManager } from "../core/settings-manager.ts";
import { createSessionPluginFacetLoader } from "./plugins/bundled.ts";
import type { SessionWorkerRuntime } from "./services/worker.ts";

const DEFAULT_ACTIVE_TOOLS = ["read", "bash", "edit", "write"];

export interface CodingAgentHarnessInput {
	readonly session: Session<JsonlSessionMetadata>;
	readonly executionEnv: NodeExecutionEnv;
	readonly provider?: string;
	readonly model?: string;
	readonly pluginManifestPaths: readonly string[];
}

export async function createCodingAgentHarness(input: CodingAgentHarnessInput): Promise<SessionWorkerRuntime> {
	const { session, executionEnv } = input;
	const cwd = session.metadata.cwd;
	const services = await createAgentSessionServices({ cwd });
	const { modelRuntime, settingsManager, resourceLoader } = services;
	const extensionsResult = resourceLoader.getExtensions();
	const extensions = extensionsResult.extensions;

	const resolved: Awaited<ReturnType<typeof findInitialModel>> | ReturnType<typeof resolveCliModel> =
		input.model === undefined
			? await findInitialModel({
					scopedModels: [],
					isContinuing: true,
					defaultProvider: settingsManager.getDefaultProvider(),
					defaultModelId: settingsManager.getDefaultModel(),
					defaultThinkingLevel: settingsManager.getDefaultThinkingLevel(),
					modelRuntime,
				})
			: resolveCliModel({ cliProvider: input.provider, cliModel: input.model, modelRuntime });
	const resolvedError = "error" in resolved ? resolved.error : undefined;
	if (resolvedError) throw new Error(`Session worker could not resolve model: ${resolvedError}`);
	if (!resolved.model) throw new Error("Session worker could not resolve a model");

	let currentModel = resolved.model;
	let currentThinkingLevel = resolved.thinkingLevel ?? "off";

	// The runner stores the session manager for `ctx.sessionManager`. Extensions in
	// this deployment do not use it, so a minimal identity shim is enough.
	const sessionManagerShim = {
		getSessionId: () => session.metadata.id,
	} as unknown as ConstructorParameters<typeof ExtensionRunner>[3];
	const runner = new ExtensionRunner(
		extensions,
		extensionsResult.runtime,
		cwd,
		sessionManagerShim,
		new ModelRegistry(modelRuntime),
	);

	const baseToolDefinitions = createAllToolDefinitions(cwd, {
		read: { autoResizeImages: settingsManager.getImageAutoResize() },
		bash: { commandPrefix: settingsManager.getShellCommandPrefix(), shellPath: settingsManager.getShellPath() },
	});

	let registry = buildToolRegistry(baseToolDefinitions, extensions);
	let activeToolNames = initialActiveToolNames(registry, extensions, settingsManager);
	let systemPromptOptions = buildSystemPromptOptions(resourceLoader, registry, activeToolNames, cwd);
	// Per-run options carry handler edits (`forceSystemPrompt`, `selectedTools`); the
	// base options stay handler-free so every run starts from the same prompt.
	let runSystemPromptOptions = systemPromptOptions;

	let harness: SessionWorkerRuntime["harness"] | undefined;
	let lane: AgentLane | undefined;

	const rebuild = (): void => {
		registry = buildToolRegistry(baseToolDefinitions, extensions);
		const known = new Set(registry.keys());
		const next = activeToolNames.filter((name) => known.has(name));
		for (const name of extensionToolNames(extensions)) {
			if (known.has(name) && !next.includes(name)) next.push(name);
		}
		activeToolNames = next;
		systemPromptOptions = buildSystemPromptOptions(resourceLoader, registry, activeToolNames, cwd);
		runSystemPromptOptions = systemPromptOptions;
		if (harness && lane) {
			void harness
				.setTools(wrapHarnessTools(registry, runner), TODO_CONTEXT)
				.then(() => lane?.setActiveTools(activeToolNames, TODO_CONTEXT));
		}
	};

	const setActiveToolNames = (names: string[]): void => {
		const known = new Set(registry.keys());
		activeToolNames = names.filter((name) => known.has(name));
		systemPromptOptions = buildSystemPromptOptions(resourceLoader, registry, activeToolNames, cwd);
		runSystemPromptOptions = systemPromptOptions;
		if (lane) void lane.setActiveTools(activeToolNames, TODO_CONTEXT);
	};

	runner.bindCore(
		createExtensionActions({
			registry: () => registry,
			activeToolNames: () => activeToolNames,
			setActiveToolNames,
			refreshTools: rebuild,
			getThinkingLevel: () => currentThinkingLevel,
			setModel: async (model) => {
				if (!lane) return false;
				await lane.setModel({ provider: model.provider, modelId: model.id }, TODO_CONTEXT);
				currentModel = model;
				return true;
			},
		}),
		createExtensionContextActions({
			getModel: () => currentModel,
			getSystemPrompt: () => buildSystemPrompt(runSystemPromptOptions),
			getSystemPromptOptions: () => runSystemPromptOptions,
		}),
		{
			registerProvider: (name, config) => modelRuntime.registerProvider(name, config),
			registerNativeProvider: (provider) => modelRuntime.registerNativeProvider(provider),
			unregisterProvider: (name) => modelRuntime.unregisterProvider(name),
		},
	);

	const created = await AgentHarness.create(
		{
			session,
			models: modelRuntime,
			model: currentModel,
			thinkingLevel: currentThinkingLevel,
			tools: wrapHarnessTools(registry, runner),
			activeToolNames,
			toolContext: { env: executionEnv },
			systemPrompt: async () => buildSystemPrompt(runSystemPromptOptions),
			resources: {
				skills: loadHarnessSkills(resourceLoader),
				promptTemplates: resourceLoader.getPrompts().prompts,
			},
		},
		TODO_CONTEXT,
	);
	harness = created.harness;
	try {
		lane = await harness.lane("main", TODO_CONTEXT);
		await lane.setActiveTools(activeToolNames, TODO_CONTEXT);

		bridgeExtensionEvents(harness, runner, {
			getBaseOptions: () => systemPromptOptions,
			setRunOptions: (options) => {
				runSystemPromptOptions = options;
			},
			getActiveToolNames: () => activeToolNames,
		});

		// Run session_start handlers before the lane serves any prompt. Extensions may
		// register tools here, so refresh the registry afterwards.
		const sessionStart: SessionStartEvent = { type: "session_start", reason: "startup" };
		await runner.emit(sessionStart);
		rebuild();
		await lane.setActiveTools(activeToolNames, TODO_CONTEXT);
	} catch (error) {
		try {
			await harness.close(TODO_CONTEXT);
		} catch (cleanupError) {
			throw new AggregateError([error, cleanupError], "Session worker harness setup and cleanup failed");
		}
		throw error;
	}

	return {
		harness,
		lane,
		modelRuntime,
		settingsManager,
		facetLoader: createSessionPluginFacetLoader([...input.pluginManifestPaths]),
	};
}

/**
 * Extension bridge for the events the harness maps today: per-turn context and
 * tool interception, plus the provider payload hook. Session lifecycle events are
 * emitted by the caller. Agent lifecycle, message, compaction, and navigation
 * events are not mapped yet.
 */
function bridgeExtensionEvents(
	harness: SessionWorkerRuntime["harness"],
	runner: ExtensionRunner,
	prompt: {
		getBaseOptions: () => NormalizedBuildSystemPromptOptions;
		setRunOptions: (options: NormalizedBuildSystemPromptOptions) => void;
		getActiveToolNames: () => string[];
	},
): void {
	harness.hooks.on("before_run", async (event) => {
		const before = prompt.getBaseOptions().selectedTools;
		const result = await runner.emitBeforeAgentStart(promptText(event.prompt), undefined, prompt.getBaseOptions());
		// Handlers may edit the loadout in place; otherwise the live loadout wins.
		const edited =
			result.systemPromptOptions.selectedTools.length !== before.length ||
			result.systemPromptOptions.selectedTools.some((name, index) => name !== before[index]);
		if (!edited) result.systemPromptOptions.selectedTools = prompt.getActiveToolNames();
		prompt.setRunOptions(result.systemPromptOptions);
		return {
			messages: result.messages.map((message) => ({
				role: "custom" as const,
				customType: message.customType,
				content: message.content ?? [],
				display: message.display,
				details: message.details,
				timestamp: Date.now(),
			})),
		};
	});

	harness.hooks.on("transform_context", async (event) => {
		if (!runner.hasHandlers("context")) return undefined;
		return { messages: await runner.emitContext(event.messages) };
	});

	harness.hooks.on("before_tool", async (event) => {
		if (!runner.hasHandlers("tool_call")) return undefined;
		const input = event.args as Record<string, unknown>;
		const result = await runner.emitToolCall({
			type: "tool_call",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			input,
		});
		if (result?.block) {
			return {
				block: {
					reason: result.reason ?? `Blocked by extension: ${event.toolName}`,
					terminate: result.terminate,
				},
			};
		}
		return { args: input as Record<string, JsonValue> };
	});

	harness.hooks.on("after_tool", async (event) => {
		if (!runner.hasHandlers("tool_result")) return undefined;
		const result = await runner.emitToolResult({
			type: "tool_result",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			input: event.args as Record<string, unknown>,
			content: event.content,
			details: event.details,
			isError: event.isError,
			usage: event.usage,
		});
		if (!result) return undefined;
		return {
			content: result.content,
			details: result.details as JsonValue | undefined,
			isError: result.isError,
		};
	});

	harness.hooks.on("before_payload", async (event) => {
		if (!runner.hasHandlers("before_provider_request")) return undefined;
		return { payload: await runner.emitBeforeProviderRequest(event.payload) };
	});
}

function buildToolRegistry(
	baseToolDefinitions: Record<string, ToolDefinition>,
	extensions: readonly Extension[],
): Map<string, RegisteredTool> {
	// Extensions override builtins with the same name, like the stock session.
	const registered = new Map<string, RegisteredTool>();
	for (const [name, definition] of Object.entries(baseToolDefinitions)) {
		registered.set(name, {
			definition,
			sourceInfo: createSyntheticSourceInfo(`<builtin:${name}>`, { source: "builtin" }),
		});
	}
	for (const extension of extensions) {
		for (const [name, tool] of extension.tools) registered.set(name, tool);
	}
	return registered;
}

/** Adapt coding-agent tool definitions to the harness tool contract. */
function wrapHarnessTools(
	registry: Map<string, RegisteredTool>,
	runner: ExtensionRunner,
): AgentHarnessTool<ExecutionToolContext>[] {
	return [...registry.values()].map(({ definition }) => ({
		name: definition.name,
		label: definition.label,
		description: definition.description,
		parameters: definition.parameters,
		constrainedSampling: definition.constrainedSampling,
		prepareArguments: definition.prepareArguments,
		executionMode: definition.executionMode,
		execute: (toolCallId, params, onUpdate, _toolContext, _invocation, context) =>
			definition.execute(toolCallId, params, context.abortSignal, onUpdate, runner.createContext()),
	}));
}

function extensionToolNames(extensions: readonly Extension[]): string[] {
	const names: string[] = [];
	for (const extension of extensions) {
		for (const name of extension.tools.keys()) if (!names.includes(name)) names.push(name);
	}
	return names;
}

function initialActiveToolNames(
	registry: Map<string, RegisteredTool>,
	extensions: readonly Extension[],
	settingsManager: SettingsManager,
): string[] {
	const configured = settingsManager.getDefaultTools() ?? DEFAULT_ACTIVE_TOOLS;
	const names = configured.filter((name) => registry.has(name));
	for (const name of extensionToolNames(extensions)) {
		if (registry.has(name) && !names.includes(name)) names.push(name);
	}
	return names;
}

function buildSystemPromptOptions(
	resourceLoader: ResourceLoader,
	registry: Map<string, RegisteredTool>,
	selectedTools: string[],
	cwd: string,
): NormalizedBuildSystemPromptOptions {
	const toolSnippets: Record<string, string> = {};
	const toolGuidelines: Record<string, string[]> = {};
	for (const { definition } of registry.values()) {
		if (definition.promptSnippet) toolSnippets[definition.name] = definition.promptSnippet;
		if (definition.promptGuidelines && definition.promptGuidelines.length > 0) {
			toolGuidelines[definition.name] = definition.promptGuidelines;
		}
	}
	return normalizeBuildSystemPromptOptions({
		cwd,
		skills: resourceLoader.getSkills().skills,
		contextFiles: resourceLoader.getAgentsFiles().agentsFiles,
		customPrompt: resourceLoader.getSystemPrompt(),
		appendSystemPrompt: resourceLoader.getAppendSystemPrompt().join("\n\n"),
		selectedTools,
		toolSnippets,
		toolGuidelines,
	});
}

/** The harness wants skill content; the coding-agent loader keeps only metadata. */
function loadHarnessSkills(resourceLoader: ResourceLoader) {
	return resourceLoader.getSkills().skills.map((skill) => {
		let content = "";
		try {
			content = readFileSync(skill.filePath, "utf-8");
		} catch {
			// Keep the skill listed; explicit invocation will report the read failure.
		}
		return {
			name: skill.name,
			description: skill.description,
			filePath: skill.filePath,
			content,
			disableModelInvocation: skill.disableModelInvocation,
		};
	});
}

function createExtensionActions(handlers: {
	registry: () => Map<string, RegisteredTool>;
	activeToolNames: () => string[];
	setActiveToolNames: (names: string[]) => void;
	refreshTools: () => void;
	getThinkingLevel: () => ThinkingLevel;
	setModel: SetModelHandler;
}): ExtensionActions {
	return {
		// No server-side equivalent yet: these mutate or drive the live session.
		sendMessage: () => logUnsupported("sendMessage"),
		sendUserMessage: () => logUnsupported("sendUserMessage"),
		appendEntry: () => logUnsupported("appendEntry"),
		setSessionName: () => {},
		getSessionName: () => undefined,
		setLabel: () => {},
		getActiveTools: () => handlers.activeToolNames(),
		getAllTools: () =>
			[...handlers.registry().values()].map(
				({ definition, sourceInfo }): ToolInfo => ({
					name: definition.name,
					description: definition.description,
					parameters: definition.parameters,
					promptGuidelines: definition.promptGuidelines,
					sourceInfo,
				}),
			),
		setActiveTools: handlers.setActiveToolNames,
		refreshTools: handlers.refreshTools,
		getCommands: () => [],
		setModel: handlers.setModel,
		getThinkingLevel: handlers.getThinkingLevel,
		setThinkingLevel: () => {},
	};
}

function createExtensionContextActions(handlers: {
	getModel: ExtensionContextActions["getModel"];
	getSystemPrompt: () => string;
	getSystemPromptOptions: () => NormalizedBuildSystemPromptOptions;
}): ExtensionContextActions {
	return {
		getModel: handlers.getModel,
		getScopedModels: () => [],
		isIdle: () => true,
		isProjectTrusted: () => true,
		getSignal: () => undefined,
		abort: () => {},
		hasPendingMessages: () => false,
		shutdown: () => {},
		getContextUsage: () => undefined,
		compact: () => {},
		getSystemPrompt: handlers.getSystemPrompt,
		getSystemPromptOptions: handlers.getSystemPromptOptions,
	};
}

function logUnsupported(api: string): void {
	process.stderr.write(`extension API ${api} is not supported by the session worker yet\n`);
}

function promptText(messages: AgentMessage[]): string {
	const parts: string[] = [];
	for (const message of messages) {
		if (message.role !== "user") continue;
		if (typeof message.content === "string") parts.push(message.content);
		else {
			for (const part of message.content) {
				if (part.type === "text") parts.push(part.text);
			}
		}
	}
	return parts.join("\n\n");
}
