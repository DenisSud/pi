import type { AgentLane } from "@earendil-works/pi-agent-core";
import { describe, expect, test, vi } from "vitest";
import { SettingsManager } from "../src/core/settings-manager.ts";
import { createModelsService } from "../src/experimental/services/models-provider.ts";

function createState() {
	const value = {
		catalog: { revision: 0, availableModels: [] as Array<Record<string, unknown>> },
		configuration: { model: null, thinkingLevel: "off" },
		refresh: { status: "idle" },
	};
	return {
		change: (_context: unknown, fn: (draft: typeof value) => void) => fn(value),
	};
}

describe("Models service admin clamp", () => {
	test("only the service model can be selected when the admin layer enforces one", async () => {
		const settingsManager = SettingsManager.inMemory(
			{},
			{ adminSettings: { defaultProvider: "opencode-go", defaultModel: "deepseek-v4.1-flash" } },
		);
		const setModel = vi.fn(async () => undefined);
		const lane = {
			getModel: async () => ({ provider: "opencode-go", id: "deepseek-v4.1-flash" }),
			getThinkingLevel: async () => "off",
			setModel,
		} as unknown as AgentLane;
		const modelRuntime = {
			getModel: (provider: string, id: string) => ({ provider, id, name: id, reasoning: false }),
		};
		const models = createModelsService(lane, modelRuntime as never, settingsManager, createState as never).service;

		await expect(
			models.select({ provider: "anthropic", modelId: "claude-sonnet-4" }, undefined as never),
		).rejects.toThrow(/managed by the service/);
		expect(setModel).not.toHaveBeenCalled();

		await expect(
			models.select({ provider: "opencode-go", modelId: "deepseek-v4.1-flash" }, undefined as never),
		).resolves.toBeUndefined();
		expect(setModel).toHaveBeenCalledWith({ provider: "opencode-go", modelId: "deepseek-v4.1-flash" }, undefined);
	});

	test("without an admin layer the picker stays free", async () => {
		const setModel = vi.fn(async () => undefined);
		const lane = {
			getModel: async () => ({ provider: "openai", id: "gpt-5" }),
			getThinkingLevel: async () => "off",
			setModel,
		} as unknown as AgentLane;
		const modelRuntime = {
			getModel: (provider: string, id: string) => ({ provider, id, name: id, reasoning: false }),
		};
		const models = createModelsService(
			lane,
			modelRuntime as never,
			SettingsManager.inMemory(),
			createState as never,
		).service;

		await expect(
			models.select({ provider: "anthropic", modelId: "claude-sonnet-4" }, undefined as never),
		).resolves.toBeUndefined();
		expect(setModel).toHaveBeenCalled();
	});
});
