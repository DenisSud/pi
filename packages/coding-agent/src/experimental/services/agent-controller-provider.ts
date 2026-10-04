import { readFileSync } from "node:fs";
import type { Context } from "@earendil-works/chord";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";
import {
	AgentDoc,
	type Conversation,
	ConversationBusy,
	type Harness,
	type SubmissionId,
	type UserInput,
} from "@earendil-works/pi-durable";
import type { Skill } from "../../core/skills.ts";
import { stripFrontmatter } from "../../utils/frontmatter.ts";
import type {
	AgentController as AgentControllerService,
	AgentOperationError,
	AgentPromptRequest,
	AgentPromptResult,
	AgentQueueResponse,
} from "./agent-controller.ts";

export interface AgentControllerOptions {
	/**
	 * Skills a `/skill:name args` prompt may invoke, resolved per working directory — the durable
	 * counterpart of `AgentSession`'s skill expansion (see `_expandSkillCommand`). When omitted, skill
	 * commands pass through as literal text.
	 */
	readonly skillsFor?: (cwd: string) => readonly Skill[];
}

/** Expand `/skill:name args` to the skill's invocation block, mirroring `AgentSession._expandSkillCommand`. */
export function expandSkillCommand(text: string, skills: readonly Skill[]): string {
	if (!text.startsWith("/skill:")) return text;
	const spaceIndex = text.indexOf(" ");
	const skillName = spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
	const args = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
	const skill = skills.find((candidate) => candidate.name === skillName);
	if (!skill) return text; // Unknown skill, pass through
	try {
		const content = readFileSync(skill.filePath, "utf-8");
		const body = stripFrontmatter(content).trim();
		const skillBlock = `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
		return args ? `${skillBlock}\n\n${args}` : skillBlock;
	} catch (error) {
		console.error(`skill_expansion: ${skill.filePath}: ${error instanceof Error ? error.message : String(error)}`);
		return text;
	}
}

export function createAgentController(
	harness: Harness,
	conversation: Conversation,
	options: AgentControllerOptions = {},
): AgentControllerService {
	/** The content a prompt submits as: `/skill:name` prompts expand like the stock session, others pass through. */
	const toSubmittedInput = async (request: AgentPromptRequest, context: Context): Promise<UserInput> => {
		if (options.skillsFor === undefined || !request.message.startsWith("/skill:")) return toInput(request);
		const agent = await harness.documentState(AgentDoc, conversation.id, context);
		if (agent === undefined) return toInput(request);
		try {
			const cwd = agent.value?.cwd ?? "";
			return toInput({ ...request, message: expandSkillCommand(request.message, options.skillsFor(cwd)) });
		} finally {
			agent.dispose();
		}
	};

	const queue = async (
		whenBusy: "steer" | "followUp",
		request: AgentPromptRequest,
		context: Context,
	): Promise<AgentQueueResponse> => {
		try {
			const submission = await conversation.submit(
				{ type: "input", content: await toSubmittedInput(request, context), whenBusy },
				context,
			);
			return { accepted: true, entryId: String(submission.id), error: null };
		} catch (error) {
			return { accepted: false, entryId: null, error: toAgentError(error) };
		}
	};

	return {
		async prompt(request, context) {
			try {
				const submission = await conversation.submit(
					{ type: "input", content: await toSubmittedInput(request, context), whenBusy: "reject" },
					context,
				);
				return { accepted: true, operationId: String(submission.id), error: null };
			} catch (error) {
				return { accepted: false, operationId: null, error: toAgentError(error) };
			}
		},
		steer: (request, context) => queue("steer", request, context),
		followUp: (request, context) => queue("followUp", request, context),
		async cancelQueued(entryId, context) {
			const id = parseSubmissionId(entryId);
			if (id === undefined) return { outcome: "not_found" };
			const result = await harness.abortSubmission(id, context, conversation.id);
			return {
				outcome: result === "aborted" ? "cancelled" : result === "not_found" ? "not_found" : "already_consumed",
			};
		},
		abort: (context) => conversation.abort(context),
		async compact(request, context) {
			try {
				const id = await conversation.compact(request.customInstructions ?? undefined, context);
				return { accepted: true, operationId: String(id), error: null };
			} catch (error) {
				return { accepted: false, operationId: null, error: toAgentError(error) };
			}
		},
		async waitForPrompt(operationId, context): Promise<AgentPromptResult> {
			const id = parseSubmissionId(operationId);
			const submission = id === undefined ? undefined : await harness.submission(id, context);
			if (submission === undefined) throw new Error(`Unknown prompt: ${operationId}`);
			const settled = await submission.wait(context);
			if (settled.status === "unanswered") return { status: "unanswered", text: null, reason: settled.reason };
			const answer = settled.type === "input" ? settled.answer : undefined;
			const message =
				answer === undefined ? undefined : (await harness.commit((tx) => tx.entry(answer), context))?.model?.[0];
			const text =
				message?.role === "assistant"
					? message.content.flatMap((content) => (content.type === "text" ? [content.text] : [])).join("")
					: "";
			return { status: "done", text, reason: null };
		},
	};
}

function parseSubmissionId(value: string): SubmissionId | undefined {
	const id = Number(value);
	return /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(id) ? (id as SubmissionId) : undefined;
}

function toInput(request: AgentPromptRequest): UserInput {
	if (request.images === null || request.images.length === 0) return request.message;
	const content: (TextContent | ImageContent)[] = [{ type: "text", text: request.message }, ...request.images];
	return content;
}

function toAgentError(error: unknown): AgentOperationError {
	if (error instanceof ConversationBusy) return { code: "busy", message: error.message };
	return { code: "operation_failed", message: error instanceof Error ? error.message : String(error) };
}
