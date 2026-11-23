function validDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
}

function validId(id) {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 100;
}

function validateEntries(entries, roll) {
  if (!Array.isArray(entries)) throw new Error(`Missing BJJ ${roll ? "roll" : "class"} notes.`);
  const ids = new Set();
  return entries.map(entry => {
    if (!entry || !validId(entry.id) || ids.has(entry.id) || !validDate(entry.date)) throw new Error("Invalid or duplicate BJJ note.");
    ids.add(entry.id);
    if (typeof entry.notes !== "string" || entry.notes.length > 8000) throw new Error("BJJ notes must be 8,000 characters or fewer.");
    if (roll && (typeof entry.partner !== "string" || !entry.partner.trim() || entry.partner.trim().length > 100)) throw new Error("Roll partner must be between 1 and 100 characters.");
    if (roll && (typeof entry.strategy !== "string" || entry.strategy.length > 4000)) throw new Error("Roll strategy must be 4,000 characters or fewer.");
    if (!Array.isArray(entry.moves)) throw new Error("Missing BJJ note moves.");
    const moveIds = new Set();
    const moves = entry.moves.map(move => {
      if (!move || !validId(move.skillId) || moveIds.has(move.skillId) || typeof move.name !== "string" || !move.name.trim() || move.name.length > 100) throw new Error("Invalid or duplicate move in BJJ notes.");
      if (roll && !["attempted", "landed"].includes(move.result)) throw new Error("Invalid roll move result.");
      moveIds.add(move.skillId);
      return roll ? { skillId: move.skillId, name: move.name.trim(), result: move.result } : { skillId: move.skillId, name: move.name.trim() };
    });
    const base = { id: entry.id, date: entry.date, notes: entry.notes, moves };
    return roll ? { ...base, partner: entry.partner.trim(), strategy: entry.strategy } : base;
  });
}

export function validateBjjJournal(bjj, skillIds) {
  if (!Array.isArray(bjj.trackedSkillIds) || bjj.trackedSkillIds.some(id => !validId(id) || !skillIds.has(id)) || new Set(bjj.trackedSkillIds).size !== bjj.trackedSkillIds.length) throw new Error("Invalid tracked BJJ skills.");
  return {
    trackedSkillIds: [...bjj.trackedSkillIds],
    classNotes: validateEntries(bjj.classNotes, false),
    rollNotes: validateEntries(bjj.rollNotes, true)
  };
}

export function bjjMoveHistory(bjj, skillId) {
  let practiced = null, attempted = null, landed = null;
  for (const entry of bjj.classNotes) {
    if (entry.moves.some(move => move.skillId === skillId) && (!practiced || entry.date > practiced)) practiced = entry.date;
  }
  for (const entry of bjj.rollNotes) {
    const move = entry.moves.find(item => item.skillId === skillId);
    if (!move) continue;
    if (!attempted || entry.date > attempted) attempted = entry.date;
    if (move.result === "landed" && (!landed || entry.date > landed)) landed = entry.date;
  }
  return { practiced, attempted, landed, lastActivity: [practiced, attempted].filter(Boolean).sort().at(-1) ?? null };
}

export function isBjjPositionOnly(skill) {
  const name = skill.name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return ["guard", "closed guard", "open guard", "half guard", "butterfly guard", "side control", "north/south", "north-south", "mount", "high mount", "back mount", "back control", "knee on belly", "turtle", "standing", "stand-up"].includes(name);
}
