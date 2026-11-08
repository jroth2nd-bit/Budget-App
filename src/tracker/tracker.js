import { validateWeightData } from "./weight.js";
import { validateBooks } from "./books.js";

const MercyTracker = (function () {
  "use strict";

  const rules = {
    Ancient: { Epic: { threshold: 20, base: 8, increment: 2 }, Legendary: { threshold: 200, base: 0.5, increment: 5 } },
    Void: { Epic: { threshold: 20, base: 8, increment: 2 }, Legendary: { threshold: 200, base: 0.5, increment: 5 } },
    Sacred: { Legendary: { threshold: 12, base: 6, increment: 2 } },
    Primal: { Legendary: { threshold: 75, base: 1, increment: 1 }, Mythical: { threshold: 200, base: 0.5, increment: 10 } },
    Remnant: { Mythical: { threshold: 24, base: 2.5, increment: 1 } }
  };
  const shardResults = {
    Ancient: ["Rare", "Epic", "Legendary"],
    Void: ["Rare", "Epic", "Legendary"],
    Sacred: ["Epic", "Legendary"],
    Primal: ["Rare", "Epic", "Legendary", "Mythical"]
  };
  const soulResults = {
    Mortal: { rarities: ["Rare", "Epic", "Legendary", "Mythical"], ranks: [1, 2, 3, 4, 5, 6] },
    Immortal: { rarities: ["Rare", "Epic", "Legendary", "Mythical"], ranks: [3, 4, 5, 6] },
    Eternal: { rarities: ["Epic", "Legendary", "Mythical"], ranks: [5, 6] }
  };
  const summonTypes = {
    shard: ["Mystery", "Ancient", "Void", "Sacred", "Primal", "Prism", "Remnant"],
    soul: ["Mortal", "Immortal", "Eternal", "Prism"]
  };
  const clanDifficulties = { ultra: "Ultra-Nightmare", nightmare: "Nightmare", brutal: "Brutal", hard: "Hard" };
  const clanRewards = { books: "Legendary books", epicBooks: "Epic books", sacred: "Sacred shards", void: "Void shards", ancient: "Ancient shards" };
  const buildFields = { blessing: "Blessing", books: "Books", masteries: "Masteries", gear: "Gear", glyphs: "Glyphs", relic: "Relic" };
  const buildStatuses = ["needed", "progress", "complete"];
  const legacyBuildStatuses = ["unset", "complete", "needed", "na"];
  const bjjBelts = ["White", "Blue", "Purple", "Brown", "Black"];
  const bjjTypes = ["Position", "Submission", "Escape", "Sweep", "Takedown", "Pass", "Guard", "Transition", "Defense", "Other"];
  const bjjPositions = ["Closed guard", "Open guard", "Half guard", "Side control", "Mount", "Back control", "North-south", "Knee on belly", "Turtle", "Standing"];

  function emptyState() {
    const starting = {};
    for (const [source, rarities] of Object.entries(rules)) {
      starting[source] = {};
      for (const rarity of Object.keys(rarities)) starting[source][rarity] = null;
    }
    const emptyBattle = () => ({ points: 0, battles: 0, energy: 0, minutes: 0, seconds: 0 });
    const summonPlans = Object.fromEntries(Object.entries(summonTypes).map(([kind, types]) => [kind, Object.fromEntries(types.map(type => [type, { pulls: 0, points: 0 }]))]));
    return { version: 16, starting, entries: [], current: { shards: {}, souls: {} }, soulInventory: { mortalStones: 0, mortalCoins: 0, immortalStones: 0, immortalCoins: 0, eternalStones: 0, eternalCoins: 0 }, battlePlans: { event: emptyBattle(), tournament: emptyBattle() }, summonPlans, clanBoss: [], champions: [], bjj: { belt: "Blue", stripes: 1, skills: [] }, weight: { plans: [], weighIns: [] }, books: [] };
  }

  function validateState(data) {
    if (!data || typeof data !== "object" || ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(data.version) || !data.starting || !Array.isArray(data.entries)) throw new Error("Not a valid Mercy Ledger backup (version 1 through 16 required).");
    const clean = emptyState();
    for (const [source, rarities] of Object.entries(rules)) {
      if (source === "Remnant" && data.version < 4) continue;
      if (!data.starting[source] || typeof data.starting[source] !== "object") throw new Error("A starting-count section is missing.");
      for (const rarity of Object.keys(rarities)) {
        const value = data.starting[source][rarity];
        if (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1000000)) throw new Error(`Invalid starting count for ${source} ${rarity}.`);
        clean.starting[source][rarity] = value;
      }
    }
    const ids = new Set();
    clean.entries = data.entries.map(entry => {
      if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) || typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt))) throw new Error("Invalid or duplicate history entry.");
      ids.add(entry.id);
      if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > 10000) throw new Error("A pull quantity must be between 1 and 10,000.");
      if (entry.kind === "shard") {
        if (!Object.hasOwn(shardResults, entry.source) || !shardResults[entry.source].includes(entry.rarity)) throw new Error("Invalid shard result.");
        return { id: entry.id, createdAt: entry.createdAt, kind: entry.kind, source: entry.source, rarity: entry.rarity, quantity: entry.quantity };
      }
      if (entry.kind === "soul") {
        if (!Object.hasOwn(soulResults, entry.source) || !soulResults[entry.source].rarities.includes(entry.rarity) || !soulResults[entry.source].ranks.includes(entry.rank)) throw new Error("Invalid Soulstone result.");
        return { id: entry.id, createdAt: entry.createdAt, kind: entry.kind, source: entry.source, rarity: entry.rarity, rank: entry.rank, quantity: entry.quantity };
      }
      throw new Error("Invalid summon type.");
    });
    if (data.version >= 2) {
      if (!data.current || typeof data.current !== "object" || !data.current.shards || typeof data.current.shards !== "object" || !data.current.souls || typeof data.current.souls !== "object") throw new Error("Missing current counters.");
      for (const [source, rarities] of Object.entries(data.current.shards)) {
        if (!Object.hasOwn(rules, source) || !rarities || typeof rarities !== "object" || Array.isArray(rarities)) throw new Error("Invalid shard counter.");
        clean.current.shards[source] = {};
        for (const [rarity, value] of Object.entries(rarities)) {
          if (!Object.hasOwn(rules[source], rarity) || (value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1000000))) throw new Error("Invalid shard counter.");
          clean.current.shards[source][rarity] = value;
        }
      }
      for (const [source, value] of Object.entries(data.current.souls)) {
        if (!Object.hasOwn(soulResults, source) || !Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new Error("Invalid Soulstone total.");
        clean.current.souls[source] = value;
      }
    }
    if (data.version >= 3) {
      if (!data.soulInventory || typeof data.soulInventory !== "object") throw new Error("Missing Soulstone inventory.");
      for (const key of Object.keys(clean.soulInventory)) {
        const value = data.soulInventory[key];
        if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new Error("Invalid Soulstone inventory value.");
        clean.soulInventory[key] = value;
      }
      if (data.version >= 5) {
        if (!data.battlePlans || typeof data.battlePlans !== "object") throw new Error("Missing battle plans.");
        for (const kind of Object.keys(clean.battlePlans)) {
          const plan = data.battlePlans[kind];
          if (!plan || typeof plan !== "object") throw new Error(`Missing ${kind} battle plan.`);
          battleProjection(plan);
          for (const key of Object.keys(clean.battlePlans[kind])) clean.battlePlans[kind][key] = plan[key];
        }
      }
      if (data.version >= 6) {
        if (!data.summonPlans || typeof data.summonPlans !== "object") throw new Error("Missing summon plans.");
        for (const [kind, types] of Object.entries(summonTypes)) {
          const plan = data.summonPlans[kind];
          if (!plan || typeof plan !== "object") throw new Error(`Missing ${kind} summon plan.`);
          for (const type of types) {
            const row = plan[type];
            if (!row || typeof row !== "object") throw new Error(`Missing ${type} summon row.`);
            summonRowPoints(row);
            clean.summonPlans[kind][type] = { pulls: row.pulls, points: row.points };
          }
        }
      }
    }
    if (data.version >= 7) {
      if (!Array.isArray(data.clanBoss)) throw new Error("Missing Demon Lord records.");
      const dates = new Set();
      clean.clanBoss = data.clanBoss.map(record => {
        const valid = validateClanRecord(record, data.version < 10);
        if (dates.has(valid.date)) throw new Error("Duplicate Demon Lord reward date.");
        dates.add(valid.date);
        return valid;
      });
    }
    if (data.version >= 8) {
      if (!Array.isArray(data.champions)) throw new Error("Missing champion builds.");
      const championIds = new Set();
      clean.champions = data.champions.map(champion => {
        const valid = validateChampion(champion, data.version === 8);
        if (championIds.has(valid.id)) throw new Error("Duplicate champion build ID.");
        championIds.add(valid.id);
        return valid;
      });
    }
    if (data.version >= 11) {
      if (!data.bjj || !bjjBelts.includes(data.bjj.belt) || !Number.isInteger(data.bjj.stripes) || data.bjj.stripes < 0 || data.bjj.stripes > 4 || !Array.isArray(data.bjj.skills)) throw new Error("Invalid BJJ belt or skills.");
      const skillIds = new Set();
      clean.bjj = { belt: data.bjj.belt, stripes: data.bjj.stripes, skills: data.bjj.skills.map(skill => {
        const valid = validateBjjSkill(data.version < 13 ? { ...skill, positions: [] } : skill, data.version === 11, data.version >= 14);
        if (skillIds.has(valid.id)) throw new Error("Duplicate BJJ skill ID.");
        skillIds.add(valid.id);
        return valid;
      }) };
    }
    if (data.version >= 15) clean.weight = validateWeightData(data.weight);
    if (data.version >= 16) clean.books = validateBooks(data.books);
    return clean;
  }

  function validateBjjSkill(skill, legacy = false, workOnNextRequired = false) {
    if (!skill || typeof skill !== "object" || typeof skill.id !== "string" || !skill.id.trim() || skill.id.length > 100) throw new Error("Invalid BJJ skill ID.");
    if (typeof skill.name !== "string" || !skill.name.trim() || skill.name.length > 100) throw new Error("Skill name must be between 1 and 100 characters.");
    if (typeof skill.type !== "string" || !skill.type.trim() || skill.type.length > 100) throw new Error("Skill type must be between 1 and 100 characters.");
    if (!Array.isArray(skill.positions) || skill.positions.length > 30 || skill.positions.some(position => typeof position !== "string" || !position.trim() || position.trim().length > 100)) throw new Error("Starting positions must contain at most 30 names of 1 to 100 characters.");
    const positions = skill.positions.map(position => position.trim());
    if (new Set(positions.map(position => position.toLocaleLowerCase())).size !== positions.length) throw new Error("Starting positions must not contain duplicates.");
    if (typeof skill.description !== "string" || skill.description.length > 4000) throw new Error("Skill description must be 4,000 characters or fewer.");
    if (typeof skill.link !== "string" || skill.link.length > 2048) throw new Error("Invalid video link.");
    if (skill.link) {
      let url;
      try { url = new URL(skill.link); } catch { throw new Error("Enter a valid YouTube or Instagram HTTPS link."); }
      const hosts = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "instagram.com", "www.instagram.com", "m.instagram.com"];
      if (url.protocol !== "https:" || !hosts.includes(url.hostname.toLowerCase()) || url.username || url.password) throw new Error("Enter a valid YouTube or Instagram HTTPS link.");
    }
    const levels = legacy ? ["unset", "yes", "no", "inconsistent"] : ["unset", "not_yet", "learning", "sometimes", "consistently"];
    if (!levels.includes(skill.practice) || !levels.includes(skill.live)) throw new Error("Invalid skill consistency.");
    if (!["unset", "low", "medium", "high"].includes(skill.preference) || typeof skill.mastered !== "boolean") throw new Error("Invalid skill preference or mastery.");
    if ((workOnNextRequired && typeof skill.workOnNext !== "boolean") || (skill.workOnNext !== undefined && typeof skill.workOnNext !== "boolean")) throw new Error("Focus must be checked or unchecked.");
    const migratedLevels = { unset: "unset", yes: "consistently", no: "not_yet", inconsistent: "sometimes" };
    return { id: skill.id, name: skill.name.trim(), type: skill.type.trim(), positions, description: skill.description, link: skill.link, practice: legacy ? migratedLevels[skill.practice] : skill.practice, live: legacy ? migratedLevels[skill.live] : skill.live, preference: skill.preference, mastered: skill.mastered, workOnNext: skill.workOnNext ?? false };
  }

  function bjjConfidence(skill) {
    const scores = { not_yet: 0, learning: 40, sometimes: 75, consistently: 100 };
    if (skill.practice === "unset" || skill.live === "unset") return null;
    if (!Object.hasOwn(scores, skill.practice) || !Object.hasOwn(scores, skill.live)) throw new Error("Invalid skill consistency.");
    return Math.round((scores[skill.practice] * 40 + scores[skill.live] * 60) / 100);
  }

  function bjjLearningPriorities(skills) {
    return skills.map(skill => ({ skill, confidence: bjjConfidence(skill) }))
      .filter(row => row.skill.workOnNext || (row.confidence !== null && row.confidence < 100))
      .sort((a, b) => Number(b.skill.workOnNext) - Number(a.skill.workOnNext) || (b.confidence ?? -1) - (a.confidence ?? -1) || a.skill.name.localeCompare(b.skill.name))
      .slice(0, 3);
  }

  function validateChampion(champion, legacy = false) {
    if (!champion || typeof champion !== "object" || typeof champion.id !== "string" || !champion.id.trim() || champion.id.length > 100) throw new Error("Invalid champion build ID.");
    if (typeof champion.name !== "string" || !champion.name.trim() || champion.name.length > 100) throw new Error("Champion name is required and must be 100 characters or fewer.");
    if (typeof champion.notes !== "string" || champion.notes.length > 2000) throw new Error("Champion notes must be 2,000 characters or fewer.");
    if (!champion.statuses || typeof champion.statuses !== "object" || Array.isArray(champion.statuses)) throw new Error("Missing champion build statuses.");
    const statuses = {};
    for (const key of Object.keys(buildFields)) {
      const value = champion.statuses[key];
      if (legacy) {
        if (!legacyBuildStatuses.includes(value)) throw new Error(`Invalid ${buildFields[key]} status.`);
        statuses[key] = key === "blessing" ? null : value === "complete" ? "complete" : "needed";
      } else if (key === "blessing") {
        if (value !== null && (!Number.isInteger(value) || value < 0 || value > 6)) throw new Error("Blessing level must be unknown or a whole number from 0 to 6.");
        statuses[key] = value;
      } else {
        if (!buildStatuses.includes(value)) throw new Error(`Invalid ${buildFields[key]} status.`);
        statuses[key] = value;
      }
    }
    return { id: champion.id, name: champion.name.trim(), statuses, notes: champion.notes };
  }

  function buildCompletion(statuses) {
    if (!statuses || (statuses.blessing !== null && (!Number.isInteger(statuses.blessing) || statuses.blessing < 0 || statuses.blessing > 6))) throw new Error("Invalid Blessing level.");
    const values = Object.keys(buildFields).filter(key => key !== "blessing").map(key => {
      if (!buildStatuses.includes(statuses[key])) throw new Error(`Invalid ${buildFields[key]} status.`);
      return statuses[key];
    });
    const applicable = 6;
    const complete = values.filter(value => value === "complete").length + (statuses.blessing === 6 ? 1 : 0);
    return { complete, applicable, percentage: complete / applicable * 100 };
  }

  function validCalendarDate(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const time = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date;
  }

  function validateClanRecord(record, legacy = false) {
    if (!record || !validCalendarDate(record.date) || !record.difficulties || typeof record.difficulties !== "object" || Array.isArray(record.difficulties)) throw new Error("Invalid Demon Lord record.");
    const difficulties = {};
    for (const [difficulty, row] of Object.entries(record.difficulties)) {
      if (!Object.hasOwn(clanDifficulties, difficulty) || !row || typeof row !== "object" || !Number.isSafeInteger(row.chests) || row.chests < 1 || row.chests > 2) throw new Error("Each recorded difficulty needs 1 or 2 claimed chests.");
      const clean = { chests: row.chests };
      for (const reward of Object.keys(clanRewards)) {
        const value = reward === "epicBooks" && legacy ? null : row[reward];
        if (reward === "epicBooks" && value === null) {
          clean[reward] = null;
          continue;
        }
        if (!Number.isSafeInteger(value) || value < 0 || value > 1000) throw new Error("Demon Lord reward counts must be whole numbers from 0 to 1,000.");
        clean[reward] = value;
      }
      difficulties[difficulty] = clean;
    }
    if (Object.keys(difficulties).length === 0) throw new Error("Select at least one recorded difficulty.");
    return { date: record.date, difficulties };
  }

  function clanSummary(records, today, days, difficulty = "all") {
    if (!validCalendarDate(today) || ![7, 30, 0].includes(days) || (difficulty !== "all" && !Object.hasOwn(clanDifficulties, difficulty))) throw new Error("Invalid Demon Lord summary selection.");
    const end = Date.parse(`${today}T00:00:00Z`);
    const start = days ? end - (days - 1) * 86400000 : -Infinity;
    const totals = Object.fromEntries(Object.keys(clanRewards).map(key => [key, 0]));
    let recordedDays = 0, partialDays = 0, chests = 0;
    let epicRecordedDays = 0, epicAverageTotal = 0, epicKnownRows = 0;
    for (const record of records) {
      const timestamp = Date.parse(`${record.date}T00:00:00Z`);
      if (timestamp < start || timestamp > end) continue;
      const rows = difficulty === "all" ? Object.values(record.difficulties) : [record.difficulties[difficulty]].filter(Boolean);
      if (!rows.length) continue;
      recordedDays++;
      if (difficulty === "all" && (rows.length !== 4 || rows.some(row => row.chests !== 2))) partialDays++;
      if (difficulty !== "all" && rows[0].chests !== 2) partialDays++;
      if (rows.every(row => row.epicBooks !== null)) {
        epicRecordedDays++;
        epicAverageTotal += rows.reduce((sum, row) => sum + row.epicBooks, 0);
      }
      for (const row of rows) {
        chests += row.chests;
        if (row.epicBooks !== null) epicKnownRows++;
        for (const key of Object.keys(totals)) if (row[key] !== null) totals[key] += row[key];
      }
    }
    const averages = Object.fromEntries(Object.entries(totals).map(([key, total]) => {
      const count = key === "epicBooks" ? epicRecordedDays : recordedDays;
      const day = count ? (key === "epicBooks" ? epicAverageTotal : total) / count : null;
      return [key, day === null ? null : { day, week: day * 7, month: day * 30 }];
    }));
    return { totals, averages, recordedDays, epicRecordedDays, epicKnownRows, partialDays, chests };
  }

  function calculate(state) {
    const counters = {};
    for (const [source, rarities] of Object.entries(rules)) {
      counters[source] = {};
      for (const rarity of Object.keys(rarities)) {
        const initial = state.starting[source][rarity];
        counters[source][rarity] = { known: initial !== null, count: initial === null ? 0 : initial };
      }
    }
    const souls = Object.fromEntries(Object.keys(soulResults).map(source => [source, 0]));
    for (const entry of state.entries) {
      if (entry.kind === "soul") {
        souls[entry.source] += entry.quantity;
        continue;
      }
      for (const [rarity, counter] of Object.entries(counters[entry.source])) {
        if (entry.rarity === rarity) {
          counter.known = true;
          counter.count = 0;
        } else {
          counter.count += entry.quantity;
        }
      }
    }
    for (const [source, rarities] of Object.entries(state.current.shards)) {
      for (const [rarity, value] of Object.entries(rarities)) {
        counters[source][rarity] = { known: value !== null, count: value === null ? 0 : value };
      }
    }
    for (const [source, value] of Object.entries(state.current.souls)) souls[source] = value;
    return { counters, souls };
  }

  function nextChance(rule, count) {
    return Math.min(100, rule.base + Math.max(0, count - rule.threshold + 1) * rule.increment);
  }

  function mercyActive(rule, counter) {
    return counter.count >= rule.threshold;
  }

  function battleProjection(plan) {
    for (const key of ["points", "battles", "energy", "minutes", "seconds"]) {
      const max = key === "seconds" ? 59 : 1000000;
      if (!Number.isSafeInteger(plan[key]) || plan[key] < 0 || plan[key] > max) throw new Error(key === "seconds" ? "Seconds must be a whole number from 0 to 59." : "Battle inputs must be whole numbers from 0 to 1,000,000.");
    }
    return { points: plan.points * plan.battles, energy: plan.energy * plan.battles, seconds: (plan.minutes * 60 + plan.seconds) * plan.battles };
  }

  function summonRowPoints(row) {
    for (const field of ["pulls", "points"]) {
      if (!Number.isSafeInteger(row[field]) || row[field] < 0 || row[field] > 1000000) throw new Error("Summon inputs must be whole numbers from 0 to 1,000,000.");
    }
    return row.pulls * row.points;
  }

  function summonProjection(plan, kind) {
    if (!Object.hasOwn(summonTypes, kind)) throw new Error("Invalid summon calculator.");
    return summonTypes[kind].reduce((total, type) => total + summonRowPoints(plan[type]), 0);
  }

  function soulCoinProjection(inventory) {
    for (const key of ["mortalStones", "mortalCoins", "immortalStones", "immortalCoins", "eternalStones", "eternalCoins"]) {
      if (!Number.isSafeInteger(inventory[key]) || inventory[key] < 0 || inventory[key] > 1000000) throw new Error("Enter whole inventory amounts between 0 and 1,000,000.");
    }
    const convert = (coins, stones, rate) => {
      const earned = stones * rate;
      const total = coins + earned;
      const remaining = total % 1000;
      return { coins, stones, earned, total, purchases: Math.floor(total / 1000), remaining, additionalNeeded: Math.ceil((1000 - remaining) / rate) };
    };
    return {
      immortal: convert(inventory.immortalCoins, inventory.mortalStones, 20),
      eternal: convert(inventory.eternalCoins, inventory.immortalStones, 30)
    };
  }

  return { rules, shardResults, soulResults, summonTypes, clanDifficulties, clanRewards, buildFields, buildStatuses, bjjBelts, bjjTypes, bjjPositions, emptyState, validateState, validateBjjSkill, bjjConfidence, bjjLearningPriorities, validateChampion, buildCompletion, validateClanRecord, clanSummary, calculate, nextChance, mercyActive, battleProjection, summonRowPoints, summonProjection, soulCoinProjection };
})();

export default MercyTracker;
