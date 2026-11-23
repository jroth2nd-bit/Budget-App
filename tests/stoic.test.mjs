import test from "node:test";
import assert from "node:assert/strict";
import tracker from "../src/tracker/tracker.js";
import { completedStoicEntries, currentStoicStreak, stoicCompletion, stoicCurriculum, validateGeneratedStoicModule } from "../src/tracker/stoic.js";

const gratitude = "What is one thing I am grateful for today?";
const completeEntry = (date, moduleId = "temperance") => ({
  date,
  moduleId,
  morning: ["One", "Two"],
  evening: ["Three", "Four", gratitude]
});

test("curriculum has four short daily modules with the required gratitude prompt", () => {
  assert.equal(stoicCurriculum.length, 4);
  for (const module of stoicCurriculum) {
    assert.equal(module.days, 30);
    assert.equal(module.morning.length, 2);
    assert.equal(module.evening.length, 3);
    assert.equal(module.evening[2], gratitude);
    for (const question of [...module.morning, ...module.evening]) {
      assert.ok(question.trim().split(/\s+/).length < 10, question);
    }
  }
  assert.equal(stoicCurriculum[0].quote.text, "You are not tossed about by events, but by your view of them.");
  assert.equal(stoicCurriculum[0].quote.attribution, "Epictetus");
});

test("legacy trackers migrate and version 18 round-trips Stoic history", () => {
  const old = tracker.emptyState();
  old.version = 16;
  delete old.stoic;
  const migrated = tracker.validateState(old);
  assert.equal(migrated.version, 19);
  assert.deepEqual(migrated.stoic, { entries: [], activeModuleId: "temperance", generated: [] });

  migrated.stoic.entries.push(completeEntry("2026-04-02", "wisdom"));
  const restored = tracker.validateState(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(restored.stoic, migrated.stoic);
  const legacy = { ...old, version: 17, stoic: { entries: [completeEntry("2026-04-02", "wisdom")] } };
  assert.equal(tracker.validateState(legacy).stoic.activeModuleId, "wisdom");
  legacy.stoic.entries = Array.from({ length: 30 }, (_, i) => completeEntry(`2026-04-${String(i + 1).padStart(2, "0")}`));
  assert.equal(tracker.validateState(legacy).stoic.activeModuleId, "wisdom");
});

test("Daily Stoic validation rejects invalid dates, duplicate dates, and malformed answers", () => {
  const state = tracker.emptyState();
  state.stoic.entries = [completeEntry("2026-02-28")];
  assert.deepEqual(tracker.validateState(state).stoic, state.stoic);
  for (const date of ["2026-02-29", "2026-2-02", "2026-13-01"]) {
    assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, entries: [completeEntry(date)] } }), /Daily Stoic/);
  }
  assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, entries: [completeEntry("2026-02-28"), completeEntry("2026-02-28", "wisdom")] } }), /duplicate/);
  assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, entries: [completeEntry("2026-02-28", "unknown")] } }), /Daily Stoic/);
  assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, entries: [{ ...completeEntry("2026-02-28"), morning: ["Only one"] }] } }), /Morning answers/);
  assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, entries: [{ ...completeEntry("2026-02-28"), evening: ["", "", "x".repeat(4001)] }] } }), /Evening answers/);
});

test("section completion requires every answer and streaks require full days", () => {
  const partial = { ...completeEntry("2026-04-01"), evening: ["Three", "", gratitude] };
  assert.deepEqual(stoicCompletion(partial), { morningDone: true, eveningDone: false, dayDone: false });
  assert.equal(currentStoicStreak([
    completeEntry("2026-04-01"),
    partial,
    completeEntry("2026-04-03")
  ], "2026-04-03"), 1);
  assert.equal(currentStoicStreak([completeEntry("2026-04-01")], "2026-04-02"), 1);
  assert.equal(currentStoicStreak([completeEntry("2026-04-01")], "2026-04-03"), 0);
});

test("generated modules validate and survive tracker backups without inventing historical quotations", () => {
  const input = {
    virtue: "Patience", focus: "Steady effort",
    quote: { text: "Meet the moment with patience.", attribution: "AI-generated reflection" },
    morning: ["What deserves my patience today?", "How can I act calmly?"],
    evening: ["When did I practice patience?", "Where could I slow down?", gratitude]
  };
  const module = validateGeneratedStoicModule(input, 5, "generated-example");
  const state = tracker.emptyState();
  state.stoic.generated = [module];
  state.stoic.activeModuleId = module.id;
  state.stoic.entries = [completeEntry("2026-04-01", module.id)];
  assert.deepEqual(tracker.validateState(JSON.parse(JSON.stringify(state))).stoic, state.stoic);
  assert.throws(() => validateGeneratedStoicModule({ ...input, quote: { ...input.quote, attribution: "Seneca" } }, 5, module.id), /labeled/);
  assert.throws(() => validateGeneratedStoicModule({ ...input, evening: ["One?", "Two?", "No?"] }, 5, module.id), /gratitude/);
  assert.throws(() => tracker.validateState({ ...state, stoic: { ...state.stoic, generated: [{ ...module, month: 6 }] } }), /order/);
  assert.equal(completedStoicEntries([completeEntry("2026-04-01"), { ...completeEntry("2026-04-02"), evening: ["", "", ""] }], "temperance"), 1);
});
