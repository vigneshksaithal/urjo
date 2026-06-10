# Requirements Document

## Introduction

The Difficulty-Weighted Scoring feature reworks how both **coins** (the engagement currency) and **season points** (the skill/competition currency) are calculated so that harder and larger puzzles are rewarded fairly, and so that all scoring derives from a single authored source of truth.

Today, coin rewards read the legacy global 9-level tables (`getCoinBaseForLevel`, `getLevelConfig`) using a per-grid level (1–4). This caps base pay at a small range, leaves the upper half of `COINS_BY_LEVEL` as dead code, and computes the speed-bonus par time from the wrong grid. Separately, season scoring uses its own `PAR_TIME_BY_GRID_SIZE` table and a flat 10/5/10 formula that ignores grid size and difficulty entirely — which makes grinding the fastest, easiest 4×4 puzzles the optimal way to climb the leaderboard.

This feature establishes the principle that Urjo's discrete difficulty space (3 grid sizes × 4 difficulties = 12 buckets) is **hand-authored in one table** (the Candy Crush model), and that only genuinely continuous inputs (solve time, daily solve count) use thin formulas. It fixes the cross-wired bugs, gives bigger/harder puzzles a mild per-minute earning advantage in coins, and makes the season leaderboard reward difficulty and clean/fast play while gently discouraging pure-volume grinding.

This spec deliberately does **not** include the coin sink, the unified cross-grid progression ladder, or a global multiplier-stack cap. Those are tracked separately.

## Glossary

- **Unified_Ladder**: The existing `PER_GRID_LADDER` in `constants.ts`, extended with authored `coinBase` and `seasonWeight` columns, serving as the single source of truth for all per-bucket scoring numbers.
- **Bucket**: A single (gridSize, level) difficulty cell — one of the 12 entries in the Unified_Ladder.
- **Coin_Reward_System**: The economy subsystem (`calculateCoinReward` in `economy.ts`) that computes coins for a completion.
- **Season_Scoring_System**: The subsystem (`calculateSeasonScore` in `seasons.ts`) that computes weekly leaderboard points for a completion.
- **Par_Time**: The reference solve time for a bucket, equal to that bucket's `expectedTime` in the Unified_Ladder.
- **Speed_Factor**: A continuous value in [0, 1] derived from solve time vs Par_Time, used to scale speed bonuses.
- **Result_Tier**: The existing flawless/sharp/solid/scrappy grade from `result-tiers.ts`, used to scale the coin bonus pool.
- **Daily_Solve_Index**: The 1-based count of a player's season-counted solves on the current UTC day.
- **Daily_Decay**: A continuous factor in [floor, 1.0] applied to season points based on Daily_Solve_Index, reducing the marginal season value of repeated solves in one day.
- **Authored_Value**: A hand-tuned constant baked into the Unified_Ladder, free to adjust without code changes.

## Requirements

### Requirement 1: Single Authored Source of Truth for Per-Bucket Scoring

**User Story:** As a game designer, I want every per-bucket reward number to live in one authored table, so that I can tune difficulty payouts without touching scoring logic or chasing duplicated constants.

#### Acceptance Criteria

1. THE Unified_Ladder SHALL define, for each of the 12 buckets, an Authored_Value `coinBase` (the base coin reward for that bucket) and an Authored_Value `seasonWeight` (the season-point difficulty multiplier for that bucket), in addition to the existing `expectedTime`.
2. THE Coin_Reward_System SHALL read the base coin reward from the Unified_Ladder `coinBase` for the completed bucket and SHALL NOT call `getCoinBaseForLevel` or `getLevelConfig`.
3. THE Coin_Reward_System SHALL compute Par_Time from the Unified_Ladder `expectedTime` for the completed bucket.
4. THE Season_Scoring_System SHALL compute Par_Time from the Unified_Ladder `expectedTime` for the completed bucket and SHALL NOT use a separate `PAR_TIME_BY_GRID_SIZE` table.
5. WHERE `getCoinBaseForLevel`, `getLevelConfig`, `COIN_BASE`, `PAR_TIME_MULTIPLIER`, and `PAR_TIME_BY_GRID_SIZE` are no longer referenced by any scoring path, THE codebase SHALL remove them or mark them deprecated if still referenced by out-of-scope code.
6. THE `coinBase` and `seasonWeight` Authored_Values SHALL be documented in the design as seeded from a time-proportional heuristic and free to tune.

### Requirement 2: Difficulty-Weighted Coin Base With Mild Depth Nudge

**User Story:** As a player, I want bigger and harder puzzles to pay meaningfully more, so that taking on a larger board feels worthwhile rather than a worse use of my time.

#### Acceptance Criteria

1. THE Unified_Ladder `coinBase` values SHALL be strictly increasing along the unified difficulty order (4×4 L1→L4, then 6×6 L1→L4, then 8×8 L1→L4).
2. THE Unified_Ladder `coinBase` for 4×4 level 1 SHALL remain approximately equal to the current base (10 coins) to preserve the entry-level feel.
3. THE `coinBase` values SHALL be authored such that the hardest, largest bucket (8×8 diabolical) earns at least as many coins per minute (coinBase ÷ expectedTime) as the easiest bucket (4×4 easy), providing a mild per-minute advantage to depth.
4. THE Coin_Reward_System SHALL compute the final total as `round(coinBase + scaledBonusPool)`, where the bonus pool continues to include streak, daily, speed, perfect, and login bonuses as in the current system.
5. THE Coin_Reward_System SHALL retain the `gridSizeMultiplier` field in the `CoinReward` response for display continuity, populated with the grid's display factor, even though the base is now authored as an absolute value.

### Requirement 3: Graduated Speed Bonus

**User Story:** As a player, I want faster solves to earn progressively more, so that there is always a reason to push for a better time instead of a single all-or-nothing threshold.

#### Acceptance Criteria

1. THE scoring system SHALL compute Speed_Factor as `clamp((parTime − timeTaken) / parTime, 0, 1)`.
2. WHEN `timeTaken` is greater than or equal to Par_Time, THE Speed_Factor SHALL be 0.
3. WHEN `timeTaken` approaches 0, THE Speed_Factor SHALL approach 1.
4. THE Coin_Reward_System SHALL compute the speed bonus as `round(MAX_SPEED_COIN_BONUS × Speed_Factor)` before applying the Result_Tier multiplier.
5. THE Season_Scoring_System SHALL compute its speed component as `round(SEASON_SPEED_BONUS × Speed_Factor)`.
6. THE Speed_Factor SHALL be implemented as a single shared pure function used by both the Coin_Reward_System and the Season_Scoring_System.

### Requirement 4: Difficulty-Weighted Season Points

**User Story:** As a competitive player, I want the season leaderboard to reward solving harder puzzles well, so that the ranking reflects skill rather than how many easy puzzles I had time to grind.

#### Acceptance Criteria

1. THE Season_Scoring_System SHALL compute a pre-decay score as `(SEASON_BASE_POINTS + graduatedSpeedComponent + perfectComponent) × seasonWeight`, where `seasonWeight` is the Authored_Value for the completed bucket.
2. THE `perfectComponent` SHALL equal `SEASON_PERFECT_BONUS` when `mistakes === 0` and 0 otherwise.
3. THE `seasonWeight` Authored_Values SHALL be strictly increasing along the unified difficulty order and SHALL equal 1.0 for 4×4 level 1.
4. THE `seasonWeight` for any bucket SHALL be authored to be sub-proportional to that bucket's `expectedTime` relative to 4×4 easy (i.e., compressed), so that difficulty is rewarded without letting a single long solve dominate the leaderboard.
5. THE final recorded season score SHALL be `round(preDecayScore × Daily_Decay)`.

### Requirement 5: Soft Daily Diminishing Returns on Season Points

**User Story:** As a player, I want to keep earning season points the more I play, but I do not want mindless grinding of easy puzzles to be the dominant way to top the leaderboard.

#### Acceptance Criteria

1. THE Season_Scoring_System SHALL track the Daily_Solve_Index per user per UTC day in Redis under the key `user:{userId}:seasonSolves:{date}` with a TTL of at least 48 hours.
2. THE Daily_Decay SHALL be computed as `max(DAILY_DECAY_FLOOR, 1 − DAILY_DECAY_STEP × (dailySolveIndex − 1))`.
3. WHEN Daily_Solve_Index is 1, THE Daily_Decay SHALL be 1.0 (the first solve of the day counts at full value).
4. THE Daily_Decay SHALL never fall below `DAILY_DECAY_FLOOR` and SHALL never exceed 1.0.
5. THE Daily_Decay SHALL be a continuous formula, NOT a hard per-day cap; additional solves SHALL always award a positive (floored) number of season points.
6. THE Daily_Solve_Index increment SHALL be applied once per counted completion and SHALL be resilient to the season being inactive (no increment when no season is active).

### Requirement 6: Backward Compatibility and No Regression to Engagement Loop

**User Story:** As a player, I want the existing reward feel — streaks, daily bonus, weekend boost, session-run, variable rewards — to keep working, so that the scoring rework does not quietly remove rewards I rely on.

#### Acceptance Criteria

1. THE Coin_Reward_System SHALL continue to apply the Result_Tier multiplier to the bonus pool (streak, speed, perfect, login) exactly as in the current system, with the daily bonus remaining unscaled.
2. THE existing session-run multiplier, weekend-event multiplier, and variable-reward roll SHALL continue to apply to the coin total downstream of `calculateCoinReward`, unchanged.
3. THE `CoinReward` response shape SHALL remain compatible with the existing client; any new fields SHALL be optional.
4. THE season top-reward payouts (`SEASON_TOP_REWARDS`) and season boundary logic SHALL remain unchanged.
5. WHEN a completion is reported by a logged-out user, THE scoring SHALL behave as today (no season tracking, no persisted state) with no errors introduced by the new Daily_Solve_Index logic.
