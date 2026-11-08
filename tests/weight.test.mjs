import test from 'node:test';
import assert from 'node:assert/strict';
import tracker from '../src/tracker/tracker.js';
import { addMonths, monthsBetween, makePlan, expectedWeight, projection, trackStatus } from '../src/tracker/weight.js';

const plan = overrides => makePlan({ id: 'plan', type: 'bulk', startDate: '2024-01-31', startWeight: 180, targetWeight: 184, targetDate: null, ...overrides });
const entry = (p, date, weight) => {
  const expected = expectedWeight(p, date);
  return { id: date, date, weight, notes: '', planId: p.id, planType: p.type, expectedWeight: expected, difference: weight - expected };
};

test('calendar month arithmetic uses clamped anniversaries and prorates partial months', () => {
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2024-01-31', 2), '2024-03-31');
  assert.equal(monthsBetween('2024-01-31', '2024-02-29'), 1);
  assert.equal(monthsBetween('2024-01-31', '2024-03-15'), 1 + 15 / 31);
  assert.equal(plan().plannedEndDate, '2024-03-31');
  assert.equal(expectedWeight(plan(), '2024-02-29'), 182);
});

test('plans calculate either target and reject impossible or invalid goals', () => {
  assert.equal(plan({ targetWeight: null, targetDate: '2024-02-29' }).targetWeight, 182);
  assert.equal(plan({ type: 'cut', targetWeight: null, targetDate: '2024-02-29' }).targetWeight, 175);
  assert.equal(plan({ targetWeight: 182, targetDate: '2024-03-31' }).plannedEndDate, '2024-03-31');
  assert.equal(expectedWeight(plan({ targetWeight: 182, targetDate: '2024-03-31' }), '2024-02-29'), 181);
  assert.throws(() => plan({ targetWeight: 184, targetDate: '2024-02-29' }), /Earliest achievable date: 2024-03-31/);
  assert.throws(() => plan({ type: 'cut', targetWeight: 181 }), /below/);
  assert.throws(() => plan({ targetWeight: null, targetDate: null }), /target weight/);
  assert.throws(() => plan({ startWeight: 1, type: 'cut', targetWeight: null, targetDate: '2024-02-29' }), /zero or less/);
});

test('projections use recent observations and do not invent a completion for an opposite trend', () => {
  const p = plan();
  const history = [entry(p, '2024-02-01', 180), entry(p, '2024-02-11', 181), entry(p, '2024-02-21', 182)];
  const result = projection(p, history, '2024-02-21');
  assert.ok(result.currentMonthlyRate > 0);
  assert.equal(result.completion, '2024-03-12');
  assert.equal(projection(p, history, '2024-04-01'), null);
  const backwards = projection(p, [entry(p, '2024-02-01', 180), entry(p, '2024-02-11', 179)], '2024-02-11');
  assert.equal(backwards.completion, null);
  assert.ok(backwards.endWeight < 179);
});

test('track status respects both sides of the one- and three-pound boundaries', () => {
  for (const sign of [-1, 1]) {
    assert.equal(trackStatus(sign * 1), 'On Track');
    assert.equal(trackStatus(sign * 1.001), 'Slightly Off');
    assert.equal(trackStatus(sign * 3), 'Slightly Off');
    assert.equal(trackStatus(sign * 3.001), 'Off Track');
  }
});

test('weight backup migration, validation, and round trip protect history', () => {
  const old = tracker.emptyState();
  old.version = 14;
  delete old.weight;
  assert.deepEqual(tracker.validateState(old).weight, { plans: [], weighIns: [] });
  const state = tracker.emptyState();
  const p = plan();
  state.weight = { plans: [p], weighIns: [entry(p, '2024-02-29', 182)] };
  assert.deepEqual(tracker.validateState(JSON.parse(JSON.stringify(state))).weight, state.weight);
  state.weight.weighIns.push({ ...state.weight.weighIns[0], id: 'duplicate' });
  assert.throws(() => tracker.validateState(state), /duplicate weigh-in/);
  state.weight.weighIns.pop();
  state.weight.weighIns[0].difference = 100;
  assert.throws(() => tracker.validateState(state), /weigh-in/);
  state.weight.weighIns = [];
  state.weight.plans.push({ ...p, id: 'other' });
  assert.throws(() => tracker.validateState(state), /one weight plan/);
});
