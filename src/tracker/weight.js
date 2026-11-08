const DAY = 86400000;

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateNumber(value) {
  return Date.parse(`${value}T00:00:00Z`) / DAY;
}

export function dateString(value) {
  return new Date(value * DAY).toISOString().slice(0, 10);
}

export function addMonths(start, count) {
  const [year, month, day] = start.split("-").map(Number);
  const first = new Date(Date.UTC(year, month - 1 + count, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

export function monthsBetween(start, end) {
  if (end < start) return -monthsBetween(end, start);
  const a = start.split("-").map(Number);
  const b = end.split("-").map(Number);
  let whole = (b[0] - a[0]) * 12 + b[1] - a[1];
  if (addMonths(start, whole) > end) whole--;
  const left = dateNumber(addMonths(start, whole));
  const right = dateNumber(addMonths(start, whole + 1));
  return whole + (dateNumber(end) - left) / (right - left);
}

export function completionDate(start, months) {
  const whole = Math.floor(months);
  const left = dateNumber(addMonths(start, whole));
  const right = dateNumber(addMonths(start, whole + 1));
  return dateString(Math.ceil(left + (right - left) * (months - whole) - 1e-9));
}

export function expectedWeight(plan, date) {
  const total = monthsBetween(plan.startDate, plan.plannedEndDate);
  const elapsed = Math.max(0, Math.min(total, monthsBetween(plan.startDate, date)));
  return plan.startWeight + (plan.targetWeight - plan.startWeight) * elapsed / total;
}

export function trackStatus(difference) {
  const distance = Math.abs(difference);
  return distance <= 1 ? "On Track" : distance <= 3 ? "Slightly Off" : "Off Track";
}

export function makePlan({ id, type, startDate, startWeight, targetWeight, targetDate }) {
  if (!id || !["bulk", "cut"].includes(type) || !validDate(startDate) || !Number.isFinite(startWeight) || startWeight <= 0) throw new Error("Enter a valid plan and starting weight.");
  const sign = type === "bulk" ? 1 : -1;
  const rate = type === "bulk" ? 2 : 5;
  const hasWeight = targetWeight !== null;
  const hasDate = targetDate !== null;
  if (!hasWeight && !hasDate) throw new Error("Enter a target weight, a target date, or both.");
  if (hasWeight && (!Number.isFinite(targetWeight) || targetWeight <= 0 || sign * (targetWeight - startWeight) <= 0)) throw new Error(`Target weight must be ${type === "bulk" ? "above" : "below"} the starting weight and greater than zero.`);
  if (hasDate && (!validDate(targetDate) || targetDate <= startDate)) throw new Error("Target date must be after the start date.");
  const earliest = hasWeight ? completionDate(startDate, Math.abs(targetWeight - startWeight) / rate) : null;
  if (hasDate && earliest && targetDate < earliest) throw new Error(`This goal exceeds ${rate} lb per month. Earliest achievable date: ${earliest}.`);
  const end = targetDate || earliest;
  const target = hasWeight ? targetWeight : startWeight + sign * rate * monthsBetween(startDate, end);
  if (target <= 0) throw new Error("This date would result in a weight of zero or less. Choose an earlier date.");
  return { id, type, status: "active", startDate, startWeight, targetWeight: target, plannedEndDate: end, actualEndDate: null };
}

export function projection(plan, entries, today) {
  const relevant = entries.filter(entry => entry.planId === plan.id).sort((a, b) => a.date.localeCompare(b.date));
  if (relevant.length < 2) return null;
  const latest = relevant[relevant.length - 1];
  const recent = relevant.filter(entry => entry.date <= today && dateNumber(today) - dateNumber(entry.date) <= 30);
  if (recent.length < 2) return null;
  const xs = recent.map(entry => dateNumber(entry.date));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = recent.reduce((sum, entry) => sum + entry.weight, 0) / recent.length;
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (!denominator) return null;
  const slope = recent.reduce((sum, entry, index) => sum + (xs[index] - meanX) * (entry.weight - meanY), 0) / denominator;
  const fittedLatest = meanY + slope * (dateNumber(latest.date) - meanX);
  const currentMonthlyRate = slope * (dateNumber(addMonths(latest.date, 1)) - dateNumber(latest.date));
  const targetMonthlyRate = (plan.targetWeight - plan.startWeight) / monthsBetween(plan.startDate, plan.plannedEndDate);
  const remaining = plan.targetWeight - fittedLatest;
  let completion = null;
  if ((plan.type === "bulk" ? remaining <= 0 : remaining >= 0)) completion = latest.date;
  else if (slope * remaining > 0) {
    const days = Math.ceil(remaining / slope);
    if (Number.isFinite(days) && days <= 365250) completion = dateString(dateNumber(latest.date) + days);
  }
  return { completion, endWeight: fittedLatest + slope * (dateNumber(plan.plannedEndDate) - dateNumber(latest.date)), currentMonthlyRate, targetMonthlyRate, differenceRate: currentMonthlyRate - targetMonthlyRate };
}

export function validateWeightData(data) {
  if (!data || !Array.isArray(data.plans) || !Array.isArray(data.weighIns)) throw new Error("Invalid weight tracker data.");
  const ids = new Set();
  let active = 0;
  const plans = data.plans.map(plan => {
    if (!plan || typeof plan.id !== "string" || !plan.id || ids.has(plan.id) || !["active", "completed", "cancelled"].includes(plan.status)) throw new Error("Invalid or duplicate weight plan.");
    ids.add(plan.id);
    const validated = makePlan({ ...plan, targetDate: plan.plannedEndDate });
    if (plan.status === "active") active++;
    if ((plan.status === "active" && plan.actualEndDate !== null) || (plan.status !== "active" && (!validDate(plan.actualEndDate) || plan.actualEndDate < plan.startDate))) throw new Error("Invalid weight plan end date.");
    return { ...validated, status: plan.status, actualEndDate: plan.actualEndDate };
  });
  if (active > 1) throw new Error("Only one weight plan can be active.");
  for (let i = 1; i < plans.length; i++) {
    if (!plans[i - 1].actualEndDate || plans[i].startDate < plans[i - 1].actualEndDate) throw new Error("Weight plan dates overlap or are out of order.");
  }
  const dates = new Set();
  const entryIds = new Set();
  const weighIns = data.weighIns.map(entry => {
    const plan = plans.find(item => item.id === entry?.planId);
    if (!entry || typeof entry.id !== "string" || !entry.id || entryIds.has(entry.id) || !validDate(entry.date) || dates.has(entry.date) || !plan || entry.date < plan.startDate || (plan.actualEndDate && entry.date > plan.actualEndDate) || entry.planType !== plan.type || !Number.isFinite(entry.weight) || entry.weight <= 0 || typeof entry.notes !== "string" || entry.notes.length > 4000 || !Number.isFinite(entry.expectedWeight) || !Number.isFinite(entry.difference) || Math.abs(entry.expectedWeight - expectedWeight(plan, entry.date)) > 1e-6 || Math.abs(entry.difference - (entry.weight - entry.expectedWeight)) > 1e-6) throw new Error("Invalid or duplicate weigh-in.");
    entryIds.add(entry.id);
    dates.add(entry.date);
    return { id: entry.id, date: entry.date, weight: entry.weight, notes: entry.notes, planId: entry.planId, planType: entry.planType, expectedWeight: entry.expectedWeight, difference: entry.difference };
  });
  return { plans, weighIns };
}
