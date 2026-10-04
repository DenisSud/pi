import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFacetHost, defineFacet } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { fauxAssistantMessage } from "@earendil-works/pi-ai";
import type { Conversation, InboxState, LiveState } from "@earendil-works/pi-durable";
import { describe, expect, test } from "vitest";
import type { Skill } from "../src/core/skills.ts";
import { createSyntheticSourceInfo } from "../src/core/source-info.ts";
import { AgentController } from "../src/experimental/services/agent-controller.ts";
import { createAgentController, expandSkillCommand } from "../src/experimental/services/agent-controller-provider.ts";
import { openFauxConversation, pendingResponse } from "./experimental-durable-support.ts";

describe("AgentController service", () => {
	test("prompts the root conversation through the service catalogue", async () => {
		const { harness, conversation, close } = await openFauxConversation([fauxAssistantMessage("hello back")]);
		const host = await createFacetHost({
			facets: [
				defineFacet({
					id: "test-agent-controller",
					setup(env) {
						env.provide(AgentController, createAgentController(harness, conversation));
					},
				}),
			],
		});
		try {
			expect(host.services.catalogue).toEqual([{ serviceId: AgentController.id, mode: "singleton" }]);
			const response = await host.services.invoke(
				{ serviceId: AgentController.id, member: "prompt", args: [{ message: "hello", images: null }] },
				BACKGROUND_CONTEXT,
			);
			expect(response).toEqual({ accepted: true, operationId: expect.any(String), error: null });
			const operationId = (response as { operationId: string }).operationId;
			await expect(
				host.services.invoke(
					{ serviceId: AgentController.id, member: "waitForPrompt", args: [operationId] },
					BACKGROUND_CONTEXT,
				),
			).resolves.toEqual({ status: "done", text: "hello back", reason: null });
		} finally {
			await host.dispose();
			await close();
		}
	});

	test("rejects a prompt while busy and queues steering and follow-up input", async () => {
		const pending = pendingResponse();
		const { harness, conversation, close } = await openFauxConversation([pending.step]);
		const controller = createAgentController(harness, conversation);
		try {
			const first = await controller.prompt({ message: "first", images: null }, BACKGROUND_CONTEXT);
			expect(first.accepted).toBe(true);
			await pending.reached;

			await expect(controller.prompt({ message: "second", images: null }, BACKGROUND_CONTEXT)).resolves.toEqual({
				accepted: false,
				operationId: null,
				error: { code: "busy", message: expect.stringContaining("busy") },
			});
			const steer = await controller.steer({ message: "steer", images: null }, BACKGROUND_CONTEXT);
			const followUp = await controller.followUp({ message: "later", images: null }, BACKGROUND_CONTEXT);
			expect(steer).toEqual({ accepted: true, entryId: expect.any(String), error: null });
			expect(followUp).toEqual({ accepted: true, entryId: expect.any(String), error: null });
			const inbox = await conversation.viewState(BACKGROUND_CONTEXT);
			try {
				expect((inbox.value.docs["pi.inbox"] as InboxState).items.map((item) => item.mode)).toEqual([
					"steer",
					"followUp",
				]);
			} finally {
				inbox.dispose();
			}

			if (!followUp.accepted) throw new Error("Follow-up was rejected");
			await expect(controller.cancelQueued(followUp.entryId, BACKGROUND_CONTEXT)).resolves.toEqual({
				outcome: "cancelled",
			});
			await expect(controller.cancelQueued(followUp.entryId, BACKGROUND_CONTEXT)).resolves.toEqual({
				outcome: "already_consumed",
			});
			await expect(controller.cancelQueued("999", BACKGROUND_CONTEXT)).resolves.toEqual({ outcome: "not_found" });
			await expect(controller.cancelQueued("not-an-id", BACKGROUND_CONTEXT)).resolves.toEqual({
				outcome: "not_found",
			});

			await controller.abort(BACKGROUND_CONTEXT);
			const view = await conversation.viewState(BACKGROUND_CONTEXT);
			try {
				expect((view.value.docs["pi.live"] as LiveState | undefined)?.run).toBeUndefined();
			} finally {
				view.dispose();
			}
			if (!first.accepted) throw new Error("Prompt was rejected");
			await expect(controller.waitForPrompt(first.operationId, BACKGROUND_CONTEXT)).resolves.toMatchObject({
				status: "unanswered",
				text: null,
			});
		} finally {
			await close();
		}
	});

	test("starts a compaction task", async () => {
		const { harness, conversation, close } = await openFauxConversation();
		const controller = createAgentController(harness, conversation);
		try {
			await expect(controller.compact({ customInstructions: "short" }, BACKGROUND_CONTEXT)).resolves.toEqual({
				accepted: true,
				operationId: expect.any(String),
				error: null,
			});
		} finally {
			await close();
		}
	});
});

describe("expandSkillCommand", () => {
	const writeSkill = (dir: string, name: string, body: string): Skill => {
		const skillDir = join(dir, name);
		mkdirSync(skillDir, { recursive: true });
		writeFileSync(join(skillDir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} skill\n---\n${body}`);
		return {
			name,
			description: `${name} skill`,
			filePath: join(skillDir, "SKILL.md"),
			baseDir: skillDir,
			sourceInfo: createSyntheticSourceInfo(join(skillDir, "SKILL.md"), { source: "test" }),
			disableModelInvocation: false,
		};
	};

	test("formats the invocation block, with args when given", () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-skills-"));
		const skills = [writeSkill(dir, "demo", "Demo instructions.")];
		expect(expandSkillCommand("/skill:demo set me up", skills)).toBe(
			`<skill name="demo" location="${skills[0]!.filePath}">\nReferences are relative to ${skills[0]!.baseDir}.\n\nDemo instructions.\n</skill>\n\nset me up`,
		);
		expect(expandSkillCommand("/skill:demo", skills)).toBe(
			`<skill name="demo" location="${skills[0]!.filePath}">\nReferences are relative to ${skills[0]!.baseDir}.\n\nDemo instructions.\n</skill>`,
		);
	});

	test("passes unknown skills and non-commands through", () => {
		expect(expandSkillCommand("/skill:missing hi", [])).toBe("/skill:missing hi");
		expect(
			expandSkillCommand("plain prompt", [writeSkill(mkdtempSync(join(tmpdir(), "pi-skills-")), "demo", "x")]),
		).toBe("plain prompt");
	});

	test("passes through when the skill file is unreadable", () => {
		const skill: Skill = {
			name: "gone",
			description: "gone skill",
			filePath: "/nonexistent/gone/SKILL.md",
			baseDir: "/nonexistent/gone",
			sourceInfo: createSyntheticSourceInfo("/nonexistent/gone/SKILL.md", { source: "test" }),
			disableModelInvocation: false,
		};
		expect(expandSkillCommand("/skill:gone hi", [skill])).toBe("/skill:gone hi");
	});
});

describe("AgentController skill expansion", () => {
	const skillOf = (dir: string): Skill => ({
		name: "demo",
		description: "demo skill",
		filePath: join(dir, "demo", "SKILL.md"),
		baseDir: join(dir, "demo"),
		sourceInfo: createSyntheticSourceInfo(join(dir, "demo", "SKILL.md"), { source: "test" }),
		disableModelInvocation: false,
	});

	const userTexts = async (conversation: Conversation) => {
		const view = await conversation.viewState(BACKGROUND_CONTEXT);
		try {
			return view.value.entries
				.flatMap((entry) => (entry as { model?: { role: string; content: unknown }[] }).model ?? [])
				.filter((message) => message.role === "user")
				.map((message) =>
					typeof message.content === "string" ? message.content : JSON.stringify(message.content),
				);
		} finally {
			view.dispose();
		}
	};

	test("submits the expanded skill block for /skill: prompts", async () => {
		const { harness, conversation, close } = await openFauxConversation([fauxAssistantMessage("done")]);
		const dir = mkdtempSync(join(tmpdir(), "pi-skills-"));
		mkdirSync(join(dir, "demo"), { recursive: true });
		writeFileSync(join(dir, "demo", "SKILL.md"), "---\nname: demo\ndescription: demo skill\n---\nDemo instructions.");
		const controller = createAgentController(harness, conversation, { skillsFor: () => [skillOf(dir)] });
		try {
			const response = await controller.prompt(
				{ message: "/skill:demo set me up", images: null },
				BACKGROUND_CONTEXT,
			);
			expect(response).toEqual({ accepted: true, operationId: expect.any(String), error: null });
			const texts = await userTexts(conversation);
			expect(
				texts.some(
					(text) => text.startsWith('<skill name="demo" location="') && text.includes("Demo instructions."),
				),
			).toBe(true);
		} finally {
			await close();
		}
	});

	test("submits unknown /skill: prompts literally", async () => {
		const { harness, conversation, close } = await openFauxConversation([fauxAssistantMessage("done")]);
		const controller = createAgentController(harness, conversation, { skillsFor: () => [] });
		try {
			await controller.prompt({ message: "/skill:missing hi", images: null }, BACKGROUND_CONTEXT);
			const texts = await userTexts(conversation);
			expect(texts).toContain("/skill:missing hi");
		} finally {
			await close();
		}
	});
});
