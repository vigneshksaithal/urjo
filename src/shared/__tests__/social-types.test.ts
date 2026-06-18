import { describe, it, expect } from "vitest";
import {
	validatePersonalChallengeData,
	type PersonalChallengeData,
} from "../social-types";

describe("validatePersonalChallengeData", () => {
	it("returns invalid for null input", () => {
		const result = validatePersonalChallengeData(null);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("No share data");
	});

	it("returns invalid for undefined input", () => {
		const result = validatePersonalChallengeData(undefined);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("No share data");
	});

	it("returns invalid for empty string", () => {
		const result = validatePersonalChallengeData("");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("No share data");
	});

	it("returns invalid for invalid JSON", () => {
		const result = validatePersonalChallengeData("not json");
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid JSON");
	});

	it("returns invalid for non-object JSON", () => {
		const result = validatePersonalChallengeData('"string"');
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid payload structure");
	});

	it("returns invalid for wrong type discriminator", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({ type: "other" }),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Not a personal challenge");
	});

	it("returns invalid for missing postId", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				time: 30,
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid postId");
	});

	it("returns invalid for postId not starting with t3_", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "invalid_id",
				time: 30,
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid postId");
	});

	it("returns invalid for missing time", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid time");
	});

	it("returns invalid for zero time", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 0,
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid time");
	});

	it("returns invalid for negative time", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: -10,
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid time");
	});

	it("returns invalid for time exceeding 1 hour", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 3601,
				username: "testuser",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid time");
	});

	it("returns invalid for missing username", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid username");
	});

	it("returns invalid for empty username", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "",
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid username");
	});

	it("returns invalid for username exceeding 50 characters", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "a".repeat(51),
				gridSize: 4,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid username");
	});

	it("returns invalid for missing gridSize", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "testuser",
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid gridSize");
	});

	it("returns invalid for gridSize not 4, 6, or 8", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "testuser",
				gridSize: 5,
				createdAt: new Date().toISOString(),
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid gridSize");
	});

	it("returns invalid for missing createdAt", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "testuser",
				gridSize: 4,
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid createdAt");
	});

	it("returns invalid for invalid createdAt date", () => {
		const result = validatePersonalChallengeData(
			JSON.stringify({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "testuser",
				gridSize: 4,
				createdAt: "not-a-date",
			}),
		);
		expect(result.valid).toBe(false);
		expect(result.error).toBe("Invalid createdAt date");
	});

	it("returns valid for correct payload with gridSize 4", () => {
		const data: PersonalChallengeData = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 30,
			username: "testuser",
			gridSize: 4,
			createdAt: new Date().toISOString(),
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data).toEqual(data);
		}
	});

	it("returns valid for correct payload with gridSize 6", () => {
		const data: PersonalChallengeData = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 60,
			username: "testuser",
			gridSize: 6,
			createdAt: new Date().toISOString(),
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data.gridSize).toBe(6);
		}
	});

	it("returns valid for correct payload with gridSize 8", () => {
		const data: PersonalChallengeData = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 120,
			username: "testuser",
			gridSize: 8,
			createdAt: new Date().toISOString(),
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data.gridSize).toBe(8);
		}
	});

	it("returns valid for time at boundary (1 hour)", () => {
		const data: PersonalChallengeData = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 3600,
			username: "testuser",
			gridSize: 4,
			createdAt: new Date().toISOString(),
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
	});

	it("returns valid for username at max length (50)", () => {
		const data: PersonalChallengeData = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 30,
			username: "a".repeat(50),
			gridSize: 4,
			createdAt: new Date().toISOString(),
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
	});

	it("handles extra fields gracefully (ignores them)", () => {
		const data = {
			type: "personal-challenge",
			postId: "t3_abc123",
			time: 30,
			username: "testuser",
			gridSize: 4,
			createdAt: new Date().toISOString(),
			extraField: "should be ignored",
			anotherExtra: 123,
		};
		const result = validatePersonalChallengeData(JSON.stringify(data));
		expect(result.valid).toBe(true);
		if (result.valid) {
			expect(result.data).toEqual({
				type: "personal-challenge",
				postId: "t3_abc123",
				time: 30,
				username: "testuser",
				gridSize: 4,
				createdAt: data.createdAt,
			});
		}
	});
});
