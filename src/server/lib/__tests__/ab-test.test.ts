import { createDevvitTest } from "@devvit/test/server/vitest";
import { redis } from "@devvit/web/server";
import { expect } from "vitest";

import { readVariantMetrics } from "../ab-test";

const test = createDevvitTest({ userId: "t2_variant", subredditName: "urjo" });

test("reports the directly playable inline funnel without obsolete launcher taps", async () => {
	const date = "2026-07-15";
	await redis.set(`analytics:${date}:variant:A:opens`, "10");
	await redis.set(`analytics:${date}:variant:A:first_actions`, "6");
	await redis.set(`analytics:${date}:variant:A:completions`, "3");

	const [variantA] = await readVariantMetrics(date);

	expect(variantA).toEqual({
		variant: "A",
		opens: 10,
		firstActions: 6,
		completions: 3,
		firstActionRate: 0.6,
		completionRate: 0.5,
	});
});
