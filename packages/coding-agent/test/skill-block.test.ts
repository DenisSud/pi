import { describe, expect, it } from "vitest";
import { parseSkillBlock } from "../src/core/agent-session.ts";

describe("parseSkillBlock", () => {
	it("parses the description attribute and unescapes attributes", () => {
		const block =
			'<skill name="self-config" location="/skills/self-config/SKILL.md" description="Configure &quot;me&quot;">\nReferences are relative to /skills/self-config.\n\nBody.\n</skill>\n\nSet me up.';
		expect(parseSkillBlock(block)).toEqual({
			name: "self-config",
			location: "/skills/self-config/SKILL.md",
			description: 'Configure "me"',
			content: "References are relative to /skills/self-config.\n\nBody.",
			userMessage: "Set me up.",
		});
	});

	it("still parses blocks without a description", () => {
		const block =
			'<skill name="review" location="/skills/review/SKILL.md">\nReferences are relative to /skills/review.\n\nInspect.\n</skill>';
		expect(parseSkillBlock(block)).toMatchObject({
			name: "review",
			description: undefined,
			userMessage: undefined,
		});
	});

	it("returns null for ordinary text", () => {
		expect(parseSkillBlock("hello")).toBeNull();
	});
});
