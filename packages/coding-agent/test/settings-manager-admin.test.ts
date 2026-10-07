import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AdminSettings, SettingsManager } from "../src/core/settings-manager.ts";

describe("SettingsManager admin layer", () => {
	const testDir = join(process.cwd(), "test-settings-admin-tmp");
	const agentDir = join(testDir, "agent");
	const projectDir = join(testDir, "project");
	const adminPath = join(testDir, "admin.json");

	const admin: AdminSettings = {
		defaultProvider: "opencode-go",
		defaultModel: "deepseek-v4.1-flash",
		packages: ["/srv/pi-bots"],
		defaultTools: ["read", "write", "edit", "bash"],
	};

	beforeEach(() => {
		if (existsSync(testDir)) rmSync(testDir, { recursive: true });
		mkdirSync(join(projectDir, ".pi"), { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(
			join(agentDir, "settings.json"),
			JSON.stringify({
				defaultProvider: "openai",
				defaultModel: "gpt-5",
				theme: "dark",
				packages: ["/agent/pkg"],
				defaultTools: ["read", "browser"],
			}),
		);
		writeFileSync(adminPath, JSON.stringify(admin));
	});

	afterEach(() => {
		if (existsSync(testDir)) rmSync(testDir, { recursive: true });
	});

	it("merges the admin file after global and project settings", () => {
		const manager = SettingsManager.create(projectDir, agentDir, { adminSettingsPath: adminPath });
		expect(manager.getDefaultProvider()).toBe("opencode-go");
		expect(manager.getDefaultModel()).toBe("deepseek-v4.1-flash");
		expect(manager.getPackages()).toEqual(["/srv/pi-bots", "/agent/pkg"]);
		expect(manager.getDefaultTools()).toEqual(["read", "browser", "write", "edit", "bash"]);
		// Unmanaged keys stay agent/project-controlled.
		expect(manager.getTheme()).toBe("dark");
		expect(manager.getAdminSettings()).toEqual(admin);
	});

	it("re-reads and re-applies the admin file on reload", async () => {
		const manager = SettingsManager.create(projectDir, agentDir, { adminSettingsPath: adminPath });
		writeFileSync(adminPath, JSON.stringify({ ...admin, defaultModel: "glm-5.2" }));
		await manager.reload();
		expect(manager.getDefaultModel()).toBe("glm-5.2");

		// The raw file stays the agent's: global settings are untouched.
		const global = manager.getGlobalSettings();
		expect(global.defaultModel).toBe("gpt-5");
	});

	it("never persists admin values into the agent's settings file", async () => {
		const manager = SettingsManager.create(projectDir, agentDir, { adminSettingsPath: adminPath });
		// A caller asks for another model; the write lands, the admin layer still wins.
		manager.setDefaultModelAndProvider("anthropic", "claude-sonnet-4");
		await manager.flush();

		const saved = JSON.parse(readFileSync(join(agentDir, "settings.json"), "utf-8")) as Record<string, unknown>;
		expect(saved.defaultProvider).toBe("anthropic");
		expect(saved.defaultModel).toBe("claude-sonnet-4");
		expect(saved.packages).toEqual(["/agent/pkg"]);
		expect(manager.getDefaultModel()).toBe("deepseek-v4.1-flash");
		expect(manager.getPackages()).toEqual(["/srv/pi-bots", "/agent/pkg"]);
	});

	it("keeps no admin layer when the file is missing or malformed", () => {
		const missing = SettingsManager.create(projectDir, agentDir, { adminSettingsPath: join(testDir, "nope.json") });
		expect(missing.getDefaultModel()).toBe("gpt-5");
		expect(missing.getAdminSettings()).toBeUndefined();

		writeFileSync(adminPath, "not json");
		const malformed = SettingsManager.create(projectDir, agentDir, { adminSettingsPath: adminPath });
		expect(malformed.getDefaultModel()).toBe("gpt-5");
		expect(malformed.getAdminSettings()).toBeUndefined();
	});

	it("prefers explicit admin settings over the file", () => {
		const manager = SettingsManager.create(projectDir, agentDir, {
			adminSettingsPath: adminPath,
			adminSettings: { defaultModel: "explicit-model" },
		});
		expect(manager.getDefaultModel()).toBe("explicit-model");
		// The explicit layer replaces, not merges with, the file.
		expect(manager.getDefaultTools()).toEqual(["read", "browser"]);
	});
});
