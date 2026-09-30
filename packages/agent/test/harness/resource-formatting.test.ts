import { describe, expect, it } from "vitest";
import { formatPromptTemplateInvocation } from "../../src/harness/prompt-templates.ts";
import { formatSkillInvocation } from "../../src/harness/skills.ts";

describe("resource formatting helpers", () => {
	it("formats skill invocations with additional instructions", () => {
		const skill = {
			name: "inspect",
			description: "Inspect things",
			content: "Use inspection tools.",
			filePath: "/project/.pi/skills/inspect/SKILL.md",
		};

		expect(formatSkillInvocation(skill, "Check errors.")).toBe(
			'<skill name="inspect" location="/project/.pi/skills/inspect/SKILL.md" description="Inspect things">\nReferences are relative to /project/.pi/skills/inspect.\n\nUse inspection tools.\n</skill>\n\nCheck errors.',
		);
	});

	it("escapes attribute values in skill invocations", () => {
		const skill = {
			name: "odd",
			description: 'Uses "quotes" & <tags>',
			content: "Body.",
			filePath: "/skills/odd/SKILL.md",
		};

		expect(formatSkillInvocation(skill)).toBe(
			'<skill name="odd" location="/skills/odd/SKILL.md" description="Uses &quot;quotes&quot; &amp; &lt;tags&gt;">\nReferences are relative to /skills/odd.\n\nBody.\n</skill>',
		);
	});

	it("formats prompt template invocations with positional arguments", () => {
		expect(
			formatPromptTemplateInvocation({ name: "review", content: "Review $1 with $ARGUMENTS" }, ["a.ts", "care"]),
		).toBe("Review a.ts with a.ts care");
	});
});
