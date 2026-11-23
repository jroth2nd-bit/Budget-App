import { validDate } from "./weight.js";

export const stoicCurriculum = [
  {
    id: "temperance",
    month: 1,
    days: 30,
    virtue: "Temperance",
    focus: "Emotional Control",
    quote: { text: "You are not tossed about by events, but by your view of them.", attribution: "Epictetus" },
    morning: ["What might throw me off today?", "How will I stay steady when it happens?"],
    evening: ["When did a wave of emotion hit me today?", "Did I pause, or did it take over?", "What is one thing I am grateful for today?"]
  },
  {
    id: "wisdom",
    month: 2,
    days: 30,
    virtue: "Wisdom",
    focus: "Clear Judgment",
    quote: { text: "We suffer more often in imagination than in reality.", attribution: "Seneca" },
    morning: ["What assumption should I question today?", "What can I learn before deciding?"],
    evening: ["What did I understand more clearly today?", "What belief changed after I looked closer?", "What is one thing I am grateful for today?"]
  },
  {
    id: "courage",
    month: 3,
    days: 30,
    virtue: "Courage",
    focus: "Steady Action",
    quote: { text: "Difficulties strengthen the mind, as labor does the body.", attribution: "Seneca" },
    morning: ["What am I avoiding that matters?", "What small brave step can I take?"],
    evening: ["When did I act despite fear today?", "What challenge helped me grow?", "What is one thing I am grateful for today?"]
  },
  {
    id: "justice",
    month: 4,
    days: 30,
    virtue: "Justice",
    focus: "Fair Dealing",
    quote: { text: "What brings no benefit to the hive brings none to the bee.", attribution: "Marcus Aurelius" },
    morning: ["Who might need my help today?", "How can I be fair in my choices?"],
    evening: ["Whose needs did I consider today?", "Did I treat others with fairness?", "What is one thing I am grateful for today?"]
  }
];

const MAX_ANSWER_LENGTH = 4000;
const GRATITUDE = "What is one thing I am grateful for today?";

export function validateGeneratedStoicModule(value, month, id) {
  const text = (value, label, max) => {
    if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`Invalid generated ${label}.`);
    return value.trim();
  };
  if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isSafeInteger(month) || month < 5 || typeof id !== "string" || !/^generated-[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error("Invalid generated Stoic module.");
  const questions = (items, count) => {
    if (!Array.isArray(items) || items.length !== count) throw new Error("Invalid generated Stoic questions.");
    return items.map(item => {
      const question = text(item, "question", 120);
      if (question.split(/\s+/).length >= 10) throw new Error("Generated questions must have fewer than 10 words.");
      return question;
    });
  };
  const morning = questions(value.morning, 2);
  const evening = questions(value.evening, 3);
  if (evening[2] !== GRATITUDE) throw new Error("Generated Stoic module must include the gratitude question.");
  if (!value.quote || typeof value.quote !== "object" || value.quote.attribution !== "AI-generated reflection") throw new Error("Generated quote must be labeled as an AI-generated reflection.");
  return {
    id, month, days: 30,
    virtue: text(value.virtue, "virtue", 80),
    focus: text(value.focus, "focus", 100),
    quote: { text: text(value.quote.text, "reflection", 240), attribution: "AI-generated reflection" },
    morning, evening
  };
}

export function validateStoicData(value, legacy = false) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.entries)) {
    throw new Error("Invalid Daily Stoic data.");
  }
  const generated = legacy ? [] : value.generated;
  if (!Array.isArray(generated)) throw new Error("Invalid generated Stoic modules.");
  const modules = generated.map((module, index) => {
    if (!module || module.month !== index + 5 || module.days !== 30) throw new Error("Invalid generated Stoic module order.");
    return validateGeneratedStoicModule(module, module.month, module.id);
  });
  const moduleIds = new Set(stoicCurriculum.map(module => module.id));
  for (const module of modules) {
    if (moduleIds.has(module.id)) throw new Error("Duplicate Daily Stoic module.");
    moduleIds.add(module.id);
  }
  const dates = new Set();
  const entries = value.entries.map(entry => {
    if (!entry || typeof entry !== "object" || !validDate(entry.date) || dates.has(entry.date) || !moduleIds.has(entry.moduleId)) {
      throw new Error("Invalid or duplicate Daily Stoic entry.");
    }
    dates.add(entry.date);
    const answers = (value, count, section) => {
      if (!Array.isArray(value) || value.length !== count || value.some(answer => typeof answer !== "string" || answer.length > MAX_ANSWER_LENGTH)) {
        throw new Error(`Invalid Daily Stoic ${section} answers.`);
      }
      return [...value];
    };
    return {
      date: entry.date,
      moduleId: entry.moduleId,
      morning: answers(entry.morning, 2, "Morning"),
      evening: answers(entry.evening, 3, "Evening")
    };
  });
  let activeModuleId = value.activeModuleId;
  if (legacy) {
    activeModuleId = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0]?.moduleId ?? "temperance";
    const index = stoicCurriculum.findIndex(module => module.id === activeModuleId);
    if (completedStoicEntries(entries, activeModuleId) >= 30 && stoicCurriculum[index + 1]) {
      activeModuleId = stoicCurriculum[index + 1].id;
    }
  }
  if (!moduleIds.has(activeModuleId)) throw new Error("Invalid active Daily Stoic module.");
  return { entries, activeModuleId, generated: modules };
}

export function stoicCompletion(entry) {
  const complete = answers => Array.isArray(answers) && answers.length > 0 && answers.every(answer => typeof answer === "string" && answer.trim().length > 0);
  const morningDone = complete(entry?.morning);
  const eveningDone = complete(entry?.evening);
  return { morningDone, eveningDone, dayDone: morningDone && eveningDone };
}

export function currentStoicStreak(entries, today) {
  if (!validDate(today)) throw new Error("Invalid Daily Stoic streak date.");
  const completed = new Set(entries.filter(entry => stoicCompletion(entry).dayDone).map(entry => entry.date));
  const dayNumber = value => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  let cursor = completed.has(today) ? dayNumber(today) : dayNumber(today) - 1;
  let streak = 0;
  while (completed.has(new Date(cursor * 86400000).toISOString().slice(0, 10))) {
    streak++;
    cursor--;
  }
  return streak;
}

export function completedStoicEntries(entries, moduleId) {
  return entries.filter(entry => entry.moduleId === moduleId && stoicCompletion(entry).dayDone).length;
}
