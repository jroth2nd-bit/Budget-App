import test from "node:test";
import assert from "node:assert/strict";
import T from "../src/tracker/tracker.js";

function entry(id, source, rarity, quantity = 1) {
  return { id, createdAt: "2026-01-01T00:00:00.000Z", kind: "shard", source, rarity, quantity };
}

test("mercy starts on the pull after each threshold and caps at 100", () => {
  for (const rarities of Object.values(T.rules)) {
    for (const rule of Object.values(rarities)) {
      assert.equal(T.nextChance(rule, rule.threshold - 1), rule.base);
      assert.equal(T.nextChance(rule, rule.threshold), rule.base + rule.increment);
      assert.equal(T.nextChance(rule, 1000000), 100);
    }
  }
  assert.equal(T.nextChance(T.rules.Sacred.Legendary, 12), 8);
  assert.equal(T.nextChance(T.rules.Ancient.Legendary, 200), 5.5);
  assert.equal(T.nextChance(T.rules.Primal.Mythical, 200), 10.5);
});

test("unknown counters stay unknown until a matching pull, with independent rarity and source counters", () => {
  const state = T.emptyState();
  state.starting.Void.Legendary = 10;
  state.entries = [entry("1", "Ancient", "Rare", 5), entry("2", "Ancient", "Legendary"), entry("3", "Ancient", "Rare", 2)];
  const { counters } = T.calculate(state);
  assert.deepEqual(counters.Ancient.Epic, { known: false, count: 8 });
  assert.deepEqual(counters.Ancient.Legendary, { known: true, count: 2 });
  assert.deepEqual(counters.Void.Legendary, { known: true, count: 10 });
});

test("consecutive matching results reset and other counters increment for every pull", () => {
  const state = T.emptyState();
  state.starting.Primal.Legendary = 4;
  state.starting.Primal.Mythical = 9;
  state.entries = [entry("1", "Primal", "Legendary", 3), entry("2", "Primal", "Mythical")];
  const { counters } = T.calculate(state);
  assert.deepEqual(counters.Primal.Legendary, { known: true, count: 1 });
  assert.deepEqual(counters.Primal.Mythical, { known: true, count: 0 });
});

test("history corrections recalculate in order and Soulstones do not affect shard counters", () => {
  const state = T.emptyState();
  state.starting.Ancient.Legendary = 8;
  state.entries = [entry("1", "Ancient", "Legendary"), entry("2", "Ancient", "Rare", 2), { id: "3", createdAt: "2026-01-01T00:00:00Z", kind: "soul", source: "Mortal", rarity: "Rare", rank: 1, quantity: 10 }];
  assert.equal(T.calculate(state).counters.Ancient.Legendary.count, 2);
  assert.equal(T.calculate(state).souls.Mortal, 10);
  state.entries.splice(0, 1);
  assert.equal(T.calculate(state).counters.Ancient.Legendary.count, 10);
});

test("validates and cleans backups, rejecting invalid results and malformed counts", () => {
  const state = T.emptyState();
  state.entries.push({ id: "soul", createdAt: "2026-01-01T00:00:00Z", kind: "soul", source: "Eternal", rarity: "Legendary", rank: 6, quantity: 1, extra: "ignored" });
  assert.equal(T.validateState(state).entries[0].extra, undefined);
  state.entries[0].rank = 1;
  assert.throws(() => T.validateState(state), /Invalid Soulstone/);
  state.entries[0].rank = 6;
  state.entries.push({ ...state.entries[0] });
  assert.throws(() => T.validateState(state), /duplicate/);
  state.entries.pop();
  state.starting.Void.Epic = -1;
  assert.throws(() => T.validateState(state), /Invalid starting count/);
  delete state.starting.Void.Epic;
  assert.throws(() => T.validateState(state), /Invalid starting count/);
});

test("battle projection multiplies points, energy, and minutes plus seconds", () => {
  const plan = { points: 15, battles: 30, energy: 16, minutes: 1, seconds: 45 };
  assert.deepEqual(T.battleProjection(plan), { points: 450, energy: 480, seconds: 3150 });
  assert.deepEqual(T.battleProjection({ ...plan, battles: 0 }), { points: 0, energy: 0, seconds: 0 });
  assert.throws(() => T.battleProjection({ ...plan, seconds: 60 }), /Seconds/);
  assert.throws(() => T.battleProjection({ ...plan, points: -1 }), /whole numbers/);
  assert.throws(() => T.battleProjection({ ...plan, battles: 1.5 }), /whole numbers/);
});

test("battle plans migrate older backups and remain independent in new backups", () => {
  const old = T.emptyState();
  old.version = 4;
  delete old.battlePlans;
  old.current.shards.Ancient = { Legendary: 123 };
  old.soulInventory.mortalStones = 204;
  const migrated = T.validateState(old);
  assert.equal(migrated.version, 15);
  assert.equal(migrated.battlePlans.event.battles, 0);
  assert.equal(migrated.current.shards.Ancient.Legendary, 123);
  assert.equal(migrated.soulInventory.mortalStones, 204);
  migrated.battlePlans.event.battles = 50;
  migrated.battlePlans.tournament.battles = 20;
  const restored = T.validateState(JSON.parse(JSON.stringify(migrated)));
  assert.equal(restored.battlePlans.event.battles, 50);
  assert.equal(restored.battlePlans.tournament.battles, 20);
  delete restored.battlePlans.event.seconds;
  assert.throws(() => T.validateState(restored), /Seconds/);
});

test("legacy backups migrate without losing history or calculated counters", () => {
  const legacy = T.emptyState();
  legacy.version = 1;
  delete legacy.current;
  legacy.starting.Ancient.Legendary = 200;
  legacy.entries = [entry("old", "Ancient", "Rare", 2), { id: "soul", createdAt: "2026-01-01T00:00:00Z", kind: "soul", source: "Mortal", rarity: "Rare", rank: 1, quantity: 3 }];
  const migrated = T.validateState(legacy);
  assert.equal(migrated.version, 15);
  assert.equal(migrated.entries.length, 2);
  assert.equal(T.calculate(migrated).counters.Ancient.Legendary.count, 202);
  assert.equal(T.calculate(migrated).souls.Mortal, 3);
});

test("soulstone coin projection matches the 204 Mortal example", () => {
  const inventory = { ...T.emptyState().soulInventory, mortalStones: 204, immortalCoins: 825 };
  const result = T.soulCoinProjection(inventory);
  assert.deepEqual(result.immortal, { earned: 4080, total: 4905, purchases: 4, remaining: 905, pulls: 4 });
  assert.deepEqual(result.eternal, { earned: 4000, total: 4000, purchases: 4, remaining: 0, pulls: 4 });
});

test("soulstone projection includes held and purchasable Mortal and Immortal stones", () => {
  const inventory = { mortalStones: 48, mortalCoins: 2500, immortalStones: 32, immortalCoins: 5, eternalStones: 4, eternalCoins: 50 };
  const result = T.soulCoinProjection(inventory);
  assert.deepEqual(result.mortal, { purchases: 2, pulls: 50, remaining: 500 });
  assert.deepEqual(result.immortal, { earned: 1000, total: 1005, purchases: 1, remaining: 5, pulls: 33 });
  assert.deepEqual(result.eternal, { earned: 33000, total: 33050, purchases: 33, remaining: 50, pulls: 37 });
  assert.throws(() => T.soulCoinProjection({ ...inventory, eternalCoins: -1 }), /whole inventory/);
});

test("eternal purchases include existing coins and held stones without requiring immortal pulls", () => {
  const inventory = { ...T.emptyState().soulInventory, eternalCoins: 2500, eternalStones: 2 };
  assert.deepEqual(T.soulCoinProjection(inventory).eternal, { earned: 0, total: 2500, purchases: 2, remaining: 500, pulls: 4 });
});

test("version 2 inventory is not confused with historical Soulstone pull totals", () => {
  const old = T.emptyState();
  old.version = 2;
  delete old.soulInventory;
  old.current.souls.Mortal = 204;
  const migrated = T.validateState(old);
  assert.equal(migrated.current.souls.Mortal, 204);
  assert.equal(migrated.soulInventory.mortalStones, 0);
  assert.throws(() => T.validateState({ ...migrated, soulInventory: {} }), /Invalid Soulstone inventory/);
});

test("direct counters override historical calculations without deleting history", () => {
  const state = T.emptyState();
  state.starting.Ancient.Legendary = 100;
  state.entries = [entry("old", "Ancient", "Rare", 2), { id: "soul", createdAt: "2026-01-01T00:00:00Z", kind: "soul", source: "Mortal", rarity: "Rare", rank: 1, quantity: 3 }];
  state.current.shards.Ancient = { Legendary: 200, Epic: null };
  state.current.souls.Mortal = 8;
  const restored = T.validateState(JSON.parse(JSON.stringify(state)));
  const result = T.calculate(restored);
  assert.deepEqual(result.counters.Ancient.Legendary, { known: true, count: 200 });
  assert.deepEqual(result.counters.Ancient.Epic, { known: false, count: 0 });
  assert.equal(result.souls.Mortal, 8);
  assert.equal(restored.entries.length, 2);
  restored.current.shards.Ancient.Legendary = -1;
  assert.throws(() => T.validateState(restored), /Invalid shard counter/);
  restored.current.shards.Ancient.Legendary = 0;
  restored.current.souls.Mortal = null;
  assert.throws(() => T.validateState(restored), /Invalid Soulstone total/);
});

test("mercy indicators activate at each threshold, including known minimum counts", () => {
  for (const rarities of Object.values(T.rules)) {
    for (const rule of Object.values(rarities)) {
      assert.equal(T.mercyActive(rule, { known: true, count: rule.threshold - 1 }), false);
      assert.equal(T.mercyActive(rule, { known: true, count: rule.threshold }), true);
      assert.equal(T.mercyActive(rule, { known: false, count: rule.threshold }), true);
      assert.equal(T.mercyActive(rule, { known: false, count: rule.threshold - 1 }), false);
    }
  }
});

test("Remnant Mythical mercy begins on pull 25 and old backups gain an unknown counter", () => {
  const rule = T.rules.Remnant.Mythical;
  assert.equal(T.nextChance(rule, 23), 2.5);
  assert.equal(T.nextChance(rule, 24), 3.5);
  assert.equal(T.nextChance(rule, 25), 4.5);
  const old = T.emptyState();
  old.version = 3;
  delete old.starting.Remnant;
  old.current.shards.Ancient = { Legendary: 123 };
  const restored = T.validateState(old);
  assert.deepEqual(T.calculate(restored).counters.Remnant.Mythical, { known: false, count: 0 });
  assert.equal(T.calculate(restored).counters.Ancient.Legendary.count, 123);
  restored.current.shards.Remnant = { Mythical: 24 };
  assert.equal(T.calculate(T.validateState(restored)).counters.Remnant.Mythical.count, 24);
});

test("summon plans calculate each row and independent totals", () => {
  const state = T.emptyState();
  state.summonPlans.shard.Ancient = { pulls: 10, points: 20 };
  state.summonPlans.shard.Sacred = { pulls: 3, points: 500 };
  state.summonPlans.soul.Mortal = { pulls: 40, points: 5 };
  assert.equal(T.summonRowPoints(state.summonPlans.shard.Sacred), 1500);
  assert.equal(T.summonProjection(state.summonPlans.shard, "shard"), 1700);
  assert.equal(T.summonProjection(state.summonPlans.soul, "soul"), 200);
  assert.throws(() => T.summonRowPoints({ pulls: -1, points: 5 }), /whole numbers/);
  assert.throws(() => T.summonRowPoints({ pulls: 1, points: 2.5 }), /whole numbers/);
});

test("version 5 migrates without losing plans and version 6 validates summon rows", () => {
  const old = T.emptyState();
  old.version = 5;
  delete old.summonPlans;
  old.battlePlans.event.battles = 31;
  old.current.shards.Remnant = { Mythical: 24 };
  const state = T.validateState(old);
  assert.equal(state.battlePlans.event.battles, 31);
  assert.equal(state.current.shards.Remnant.Mythical, 24);
  assert.equal(state.summonPlans.shard.Ancient.pulls, 0);
  state.summonPlans.soul.Prism = { pulls: 4, points: 123 };
  assert.deepEqual(T.validateState(state).summonPlans.soul.Prism, { pulls: 4, points: 123 });
  delete state.summonPlans.soul.Prism;
  assert.throws(() => T.validateState(state), /Missing Prism summon row/);
});

function clanRow(chests = 2, books = 0, sacred = 0, voidShards = 0, ancient = 0, epicBooks = 0) {
  return { chests, books, epicBooks, sacred, void: voidShards, ancient };
}

test("Demon Lord records validate dates, chests, counts, and unique days", () => {
  const record = { date: "2024-02-29", difficulties: { ultra: clanRow(2, 1, 2, 0, 3) } };
  assert.deepEqual(T.validateClanRecord(record), record);
  for (const date of ["2023-02-29", "2024-02-30", "2024-13-01", "2024-2-01", ""]) {
    assert.throws(() => T.validateClanRecord({ ...record, date }), /Invalid Demon Lord/);
  }
  assert.throws(() => T.validateClanRecord({ ...record, difficulties: {} }), /at least one/);
  assert.throws(() => T.validateClanRecord({ ...record, difficulties: { unknown: clanRow() } }), /difficulty/);
  for (const chests of [0, 3, 1.5]) assert.throws(() => T.validateClanRecord({ ...record, difficulties: { ultra: clanRow(chests) } }), /chests/);
  for (const books of [-1, 1.5, 1001, null]) assert.throws(() => T.validateClanRecord({ ...record, difficulties: { ultra: clanRow(2, books) } }), /whole numbers/);
  const state = T.emptyState();
  state.clanBoss = [record, record];
  assert.throws(() => T.validateState(state), /Duplicate/);
  delete state.clanBoss;
  assert.throws(() => T.validateState(state), /Missing Demon Lord/);
});

test("version 6 backups migrate without losing existing data and version 7 round trips rewards", () => {
  const old = T.emptyState();
  old.version = 6;
  delete old.clanBoss;
  old.current.shards.Void = { Legendary: 123 };
  old.summonPlans.shard.Ancient = { pulls: 10, points: 20 };
  const state = T.validateState(old);
  assert.equal(state.version, 15);
  assert.deepEqual(state.clanBoss, []);
  assert.equal(state.current.shards.Void.Legendary, 123);
  assert.deepEqual(state.summonPlans.shard.Ancient, { pulls: 10, points: 20 });
  state.clanBoss.push({ date: "2026-03-01", difficulties: { ultra: clanRow(), hard: clanRow(1, 1) } });
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(state))), state);
});

test("Demon Lord summaries use inclusive calendar windows, exclude missing days and flag partial entries", () => {
  const all = { ultra: clanRow(2, 2, 1, 0, 3), nightmare: clanRow(), brutal: clanRow(), hard: clanRow() };
  const records = [
    { date: "2026-03-10", difficulties: all },
    { date: "2026-03-04", difficulties: { ultra: clanRow(1, 0, 1, 2, 0) } },
    { date: "2026-03-03", difficulties: { nightmare: clanRow(2, 4) } },
    { date: "2026-02-09", difficulties: { ultra: clanRow(2, 5) } },
    { date: "2026-02-08", difficulties: { ultra: clanRow(2, 6) } },
    { date: "2026-03-11", difficulties: { ultra: clanRow(2, 9) } }
  ];
  const week = T.clanSummary(records, "2026-03-10", 7);
  assert.deepEqual(week.totals, { books: 2, epicBooks: 0, sacred: 2, void: 2, ancient: 3 });
  assert.equal(week.recordedDays, 2);
  assert.equal(week.partialDays, 1);
  assert.equal(week.chests, 9);
  assert.deepEqual(week.averages.books, { day: 1, week: 7, month: 30 });
  const month = T.clanSummary(records, "2026-03-10", 30);
  assert.equal(month.recordedDays, 4);
  assert.equal(month.totals.books, 11);
  assert.equal(month.partialDays, 3);
  const nightmare = T.clanSummary(records, "2026-03-10", 7, "nightmare");
  assert.equal(nightmare.recordedDays, 1);
  assert.equal(nightmare.partialDays, 0);
  assert.deepEqual(nightmare.averages.books, { day: 0, week: 0, month: 0 });
  const empty = T.clanSummary([], "2026-03-10", 0);
  assert.equal(empty.recordedDays, 0);
  assert.equal(empty.averages.books, null);
  assert.equal(T.clanSummary(records, "2026-03-10", 0).recordedDays, 5);
  assert.throws(() => T.clanSummary(records, "2026-03-10", 8), /Invalid/);
});

test("Epic book counts migrate as unknown, validate and round trip without losing existing data", () => {
  const old = T.emptyState();
  old.version = 9;
  const legacyRow = clanRow(2, 2, 1, 0, 3);
  delete legacyRow.epicBooks;
  old.clanBoss = [{ date: "2026-03-10", difficulties: { ultra: legacyRow } }];
  old.current.shards.Void = { Legendary: 123 };
  const migrated = T.validateState(old);
  assert.equal(migrated.clanBoss[0].difficulties.ultra.epicBooks, null);
  assert.equal(migrated.clanBoss[0].difficulties.ultra.books, 2);
  assert.equal(migrated.current.shards.Void.Legendary, 123);
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(migrated))), migrated);
  for (const value of [-1, 1.5, 1001, "1", undefined]) {
    const invalid = structuredClone(migrated);
    invalid.clanBoss[0].difficulties.ultra.epicBooks = value;
    assert.throws(() => T.validateState(invalid), /whole numbers/);
  }
  migrated.clanBoss[0].difficulties.ultra.epicBooks = 0;
  assert.equal(T.validateState(migrated).clanBoss[0].difficulties.ultra.epicBooks, 0);
});

test("Epic book summary counts known totals and uses only fully known days for averages", () => {
  const records = [
    { date: "2026-03-10", difficulties: { ultra: clanRow(2, 0, 0, 0, 0, 2), nightmare: clanRow(2, 0, 0, 0, 0, 1) } },
    { date: "2026-03-09", difficulties: { ultra: clanRow(2, 0, 0, 0, 0, 4), nightmare: clanRow(2, 0, 0, 0, 0, null) } },
    { date: "2026-03-08", difficulties: { ultra: clanRow(2, 0, 0, 0, 0, 0) } },
    { date: "2026-03-03", difficulties: { ultra: clanRow(2, 0, 0, 0, 0, 99) } }
  ];
  const all = T.clanSummary(records, "2026-03-10", 7);
  assert.equal(all.totals.epicBooks, 7);
  assert.equal(all.epicKnownRows, 4);
  assert.equal(all.epicRecordedDays, 2);
  assert.deepEqual(all.averages.epicBooks, { day: 1.5, week: 10.5, month: 45 });
  const ultra = T.clanSummary(records, "2026-03-10", 7, "ultra");
  assert.equal(ultra.epicRecordedDays, 3);
  assert.equal(ultra.averages.epicBooks.day, 2);
  const unknown = T.clanSummary([{ date: "2026-03-10", difficulties: { ultra: clanRow(2, 0, 0, 0, 0, null) } }], "2026-03-10", 7);
  assert.equal(unknown.epicKnownRows, 0);
  assert.equal(unknown.averages.epicBooks, null);
});

test("champion completion uses six equal fields and only blessing level six", () => {
  const statuses = { blessing: 0, books: "complete", masteries: "needed", gear: "progress", glyphs: "complete", relic: "needed" };
  assert.deepEqual(T.buildCompletion(statuses), { complete: 2, applicable: 6, percentage: 2 / 6 * 100 });
  for (const blessing of [null, 0, 1, 2, 3, 4, 5]) assert.equal(T.buildCompletion({ ...statuses, blessing }).complete, 2);
  assert.equal(T.buildCompletion({ ...statuses, blessing: 6 }).complete, 3);
  assert.equal(T.buildCompletion({ blessing: 6, books: "complete", masteries: "complete", gear: "complete", glyphs: "complete", relic: "complete" }).percentage, 100);
  assert.throws(() => T.buildCompletion({ ...statuses, gear: "unknown" }), /Invalid Gear/);
  assert.throws(() => T.buildCompletion({ ...statuses, blessing: 7 }), /Blessing/);
});

test("champion builds migrate version 7, validate and round trip alongside existing data", () => {
  const old = T.emptyState();
  old.version = 7;
  delete old.champions;
  old.clanBoss = [{ date: "2026-03-01", difficulties: { ultra: clanRow(2, 1) } }];
  old.current.shards.Void = { Legendary: 123 };
  const state = T.validateState(old);
  assert.equal(state.version, 15);
  assert.deepEqual(state.champions, []);
  assert.equal(state.clanBoss[0].difficulties.ultra.books, 1);
  assert.equal(state.current.shards.Void.Legendary, 123);
  const statuses = { blessing: 0, books: "needed", masteries: "progress", gear: "complete", glyphs: "needed", relic: "needed" };
  const champion = { id: "one", name: "Arbiter", statuses, notes: "Build later\n<test>" };
  state.champions = [champion, { ...champion, id: "two" }];
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(state))), state);
  assert.equal(T.validateChampion({ ...champion, name: "  Arbiter  " }).name, "Arbiter");
  assert.throws(() => T.validateChampion({ ...champion, name: "  " }), /name/);
  assert.throws(() => T.validateChampion({ ...champion, notes: "x".repeat(2001) }), /notes/);
  assert.throws(() => T.validateChampion({ ...champion, statuses: { ...statuses, relic: "invalid" } }), /Relic/);
  const missing = { ...statuses };
  delete missing.gear;
  assert.throws(() => T.validateChampion({ ...champion, statuses: missing }), /Gear/);
  state.champions[1].id = "one";
  assert.throws(() => T.validateState(state), /Duplicate champion/);
  delete state.champions;
  assert.throws(() => T.validateState(state), /Missing champion/);
});

test("version 8 champions migrate without guessing blessing levels or losing other data", () => {
  const old = T.emptyState();
  old.version = 8;
  const statuses = { blessing: "complete", books: "complete", masteries: "needed", gear: "unset", glyphs: "na", relic: "complete" };
  old.champions = [{ id: "one", name: "Arbiter", statuses, notes: "Keep me" }];
  old.current.shards.Void = { Legendary: 123 };
  old.clanBoss = [{ date: "2026-03-01", difficulties: { ultra: clanRow(2, 1) } }];
  const migrated = T.validateState(old);
  assert.deepEqual(migrated.champions[0].statuses, { blessing: null, books: "complete", masteries: "needed", gear: "needed", glyphs: "needed", relic: "complete" });
  assert.equal(migrated.champions[0].notes, "Keep me");
  assert.equal(migrated.current.shards.Void.Legendary, 123);
  assert.equal(migrated.clanBoss[0].difficulties.ultra.books, 1);
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(migrated))), migrated);
  for (const blessing of ["needed", "unset", "na", "complete"]) {
    old.champions[0].statuses.blessing = blessing;
    assert.equal(T.validateState(old).champions[0].statuses.blessing, null);
  }
  old.champions[0].statuses.gear = "invalid";
  assert.throws(() => T.validateState(old), /Invalid Gear/);
  for (const blessing of [-1, 7, 1.5, "6", undefined]) {
    const invalid = structuredClone(migrated);
    invalid.champions[0].statuses.blessing = blessing;
    assert.throws(() => T.validateState(invalid), /Blessing/);
  }
});

test("BJJ data migrates old backups, validates skills and preserves other trackers", () => {
  const old = T.emptyState();
  old.version = 10;
  delete old.bjj;
  old.current.shards.Void = { Legendary: 123 };
  old.clanBoss = [{ date: "2026-03-01", difficulties: { ultra: clanRow(2, 1, 0, 0, 0, 2) } }];
  const state = T.validateState(old);
  assert.deepEqual(state.bjj, { belt: "Blue", stripes: 1, skills: [] });
  assert.equal(state.current.shards.Void.Legendary, 123);
  assert.equal(state.clanBoss[0].difficulties.ultra.epicBooks, 2);
  const skill = { id: "1", name: "Armbar", type: "Custom type", positions: [], description: "Details", link: "https://youtu.be/abc", video: "liked", practice: "consistently", live: "consistently", preference: "high", mastered: false, workOnNext: true };
  state.bjj.skills.push(T.validateBjjSkill(skill));
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(state))), state);
  assert.equal(T.validateState(state).bjj.skills[0].mastered, false);
  assert.equal(T.validateState(state).bjj.skills[0].workOnNext, true);
  assert.equal("video" in T.validateState(state).bjj.skills[0], false);
  assert.throws(() => T.validateState({ ...state, bjj: { ...state.bjj, skills: [{ ...skill, workOnNext: undefined }] } }), /Work on next/);
  state.bjj.skills.push({ ...skill });
  assert.throws(() => T.validateState(state), /Duplicate BJJ/);
  state.bjj.skills.pop();
  for (const link of ["javascript:alert(1)", "https://youtube.com.evil.example/a", "https://user@youtube.com/a", "http://youtube.com/a", "invalid"]) {
    assert.throws(() => T.validateBjjSkill({ ...skill, link }), /link/);
  }
  for (const link of ["", "https://www.youtube.com/watch?v=abc", "https://www.instagram.com/reel/abc"]) assert.equal(T.validateBjjSkill({ ...skill, link }).link, link);
  for (const stripes of [-1, 5, 1.5]) assert.throws(() => T.validateState({ ...state, bjj: { ...state.bjj, stripes } }), /BJJ belt/);
  assert.throws(() => T.validateState({ ...state, bjj: { ...state.bjj, belt: "Red" } }), /BJJ belt/);
  assert.throws(() => T.validateBjjSkill({ ...skill, practice: "maybe" }), /consistency/);
  assert.throws(() => T.validateBjjSkill({ ...skill, mastered: "yes" }), /mastery/);
  assert.throws(() => T.validateBjjSkill({ ...skill, workOnNext: "yes" }), /Work on next/);
});

test("version 11 BJJ progression migrates without guessing unset values", () => {
  const old = T.emptyState();
  old.version = 11;
  const skill = { id: "one", name: "Guard", type: "Custom", description: "Keep", link: "", video: "unset", practice: "yes", live: "inconsistent", preference: "unset", mastered: true };
  old.bjj.skills = [skill, { ...skill, id: "two", practice: "no", live: "unset" }];
  old.current.shards.Void = { Legendary: 123 };
  const state = T.validateState(old);
  assert.equal(state.version, 15);
  assert.deepEqual(state.bjj.skills.map(({ practice, live }) => [practice, live]), [["consistently", "sometimes"], ["not_yet", "unset"]]);
  assert.equal(state.bjj.skills[0].mastered, true);
  assert.equal(state.bjj.skills[0].preference, "unset");
  assert.equal(state.current.shards.Void.Legendary, 123);
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(state))), state);
  old.bjj.skills[0].practice = "learning";
  assert.throws(() => T.validateState(old), /consistency/);
  for (const level of ["unset", "not_yet", "learning", "sometimes", "consistently"]) {
    assert.equal(T.validateBjjSkill({ ...state.bjj.skills[0], practice: level }).practice, level);
  }
});

test("BJJ confidence uses weighted consistency and requires both answers", () => {
  const scores = { not_yet: 0, learning: 40, sometimes: 75, consistently: 100 };
  for (const [practice, practiceScore] of Object.entries(scores)) {
    for (const [live, liveScore] of Object.entries(scores)) {
      assert.equal(T.bjjConfidence({ practice, live }), Math.round(practiceScore * 0.4 + liveScore * 0.6));
    }
  }
  assert.equal(T.bjjConfidence({ practice: "consistently", live: "sometimes" }), 85);
  assert.equal(T.bjjConfidence({ practice: "unset", live: "consistently" }), null);
  assert.equal(T.bjjConfidence({ practice: "learning", live: "unset" }), null);
  assert.throws(() => T.bjjConfidence({ practice: "invalid", live: "learning" }), /consistency/);
});

test("version 12 skills migrate without positions and version 13 defaults work-on-next while preserving positions", () => {
  const old = T.emptyState();
  old.version = 12;
  old.bjj.skills = [{ id: "1", name: "Armbar", type: "Submission", description: "", link: "", video: "unset", practice: "learning", live: "sometimes", preference: "low", mastered: false }];
  old.current.shards.Void = { Legendary: 123 };
  const migrated = T.validateState(old);
  assert.equal(migrated.version, 15);
  assert.deepEqual(migrated.bjj.skills[0].positions, []);
  assert.equal(migrated.bjj.skills[0].workOnNext, false);
  assert.equal(migrated.current.shards.Void.Legendary, 123);
  migrated.bjj.skills[0].positions = ["Closed guard", "Custom <position>"];
  migrated.bjj.skills[0].workOnNext = true;
  assert.deepEqual(T.validateState(JSON.parse(JSON.stringify(migrated))), migrated);
  for (const positions of [null, ["", "Mount"], ["Mount", " mount "], ["x".repeat(101)], Array(31).fill("a")]) {
    assert.throws(() => T.validateState({ ...migrated, bjj: { ...migrated.bjj, skills: [{ ...migrated.bjj.skills[0], positions }] } }), /positions/);
  }
  const missing = { ...migrated.bjj.skills[0] };
  delete missing.positions;
  assert.throws(() => T.validateState({ ...migrated, bjj: { ...migrated.bjj, skills: [missing] } }), /positions/);
});
