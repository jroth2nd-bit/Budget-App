import { bjjMoveHistory, compareBjjMoveActivity, isBjjPositionOnly } from "./bjjJournalData.js";
import { bjjMoveList } from "./bjjMoveList.js";

export function mountBjjJournal(document, node, T, getBjj, save) {
  const $ = id => document.getElementById(id);
  let editingKind = "class";
  let editingId = null;
  let choices = [];
  let preservedMoves = [];
  const expandedPartners = new Set();

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function sortedEntries(entries) {
    return entries.map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.index - a.index)
      .map(item => item.entry);
  }

  function moveSkills() {
    return getBjj().skills.filter(skill => !isBjjPositionOnly(skill));
  }

  function partnerKey(partner) {
    return partner.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function entryCard(entry, kind) {
    const roll = kind === "roll";
    const row = node("div", "bjj-journal-row");
    const card = node("details", "bjj-journal-entry");
    const summary = node("summary", "", entry.date);
    const content = node("div", "bjj-journal-entry-content");
    if (entry.notes.trim()) content.append(node("p", "bjj-journal-text", entry.notes));
    if (roll && entry.strategy.trim()) {
      content.append(node("strong", "", "Strategy for next time"), node("p", "bjj-journal-text", entry.strategy));
    }
    if (entry.moves.length) {
      content.append(node("p", "footnote", entry.moves.map(move => roll ? `${move.name} (${move.result})` : move.name).join(" · ")));
    }
    const actions = node("div", "bjj-journal-actions");
    const edit = node("button", "button button-quiet", "Edit");
    edit.type = "button";
    edit.setAttribute("aria-label", `Edit ${kind} note ${entry.date}${roll ? ` for ${entry.partner}` : ""}`);
    edit.addEventListener("click", () => openEntry(kind, entry.id));
    const remove = node("button", "button button-quiet", "Delete");
    remove.type = "button";
    remove.setAttribute("aria-label", `Delete ${kind} note ${entry.date}${roll ? ` for ${entry.partner}` : ""}`);
    remove.addEventListener("click", () => {
      if (!window.confirm(`Delete this ${kind} note from ${entry.date}?`)) return;
      const key = roll ? "rollNotes" : "classNotes";
      const current = getBjj();
      save({ ...current, [key]: current[key].filter(item => item.id !== entry.id) });
    });
    actions.append(edit);
    content.append(actions);
    card.append(summary, content);
    row.append(card, remove);
    return row;
  }

  function renderEntries(kind) {
    const bjj = getBjj();
    const roll = kind === "roll";
    const entries = sortedEntries(roll ? bjj.rollNotes : bjj.classNotes);
    const container = $(roll ? "bjj-roll-list" : "bjj-class-list");
    container.replaceChildren();
    if (!entries.length) {
      container.append(node("p", "footnote", `No ${kind} notes yet.`));
      return;
    }
    const list = node("div", "bjj-journal-list");
    if (!roll) {
      for (const entry of entries) list.append(entryCard(entry, kind));
    } else {
      const partners = new Map();
      for (const entry of entries) {
        const key = partnerKey(entry.partner);
        if (!partners.has(key)) partners.set(key, { name: entry.partner, entries: [] });
        partners.get(key).entries.push(entry);
      }
      for (const [key, partner] of [...partners.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
        const group = node("details", "bjj-partner-group");
        group.open = expandedPartners.has(key);
        group.addEventListener("toggle", () => {
          if (!group.isConnected) return;
          if (group.open) expandedPartners.add(key); else expandedPartners.delete(key);
        });
        group.append(node("summary", "", `${partner.name} · ${partner.entries.length} ${partner.entries.length === 1 ? "roll" : "rolls"}`));
        const content = node("div", "bjj-partner-content");
        const add = node("button", "button button-quiet", "Add roll note");
        add.type = "button";
        add.setAttribute("aria-label", `Add roll note for ${partner.name}`);
        add.addEventListener("click", () => openEntry("roll", null, partner.name));
        content.append(add);
        for (const entry of partner.entries) content.append(entryCard(entry, kind));
        group.append(content);
        list.append(group);
      }
    }
    container.append(list);
  }

  function filterHistory() {
    const search = $("bjj-history-search").value.trim().toLocaleLowerCase();
    for (const item of $("bjj-move-history").querySelectorAll(".bjj-history-item")) item.hidden = !item.dataset.name.includes(search);
  }

  function renderHistory() {
    const bjj = getBjj();
    const container = $("bjj-move-history");
    container.replaceChildren();
    const blackLotus = new Set(bjj.blackLotusSkillIds);
    const skills = moveSkills().map(skill => ({ skill, history: bjjMoveHistory(bjj, skill.id) }));
    skills.sort((a, b) => compareBjjMoveActivity(a.history.lastActivity, blackLotus.has(a.skill.id), b.history.lastActivity, blackLotus.has(b.skill.id)) || a.skill.name.localeCompare(b.skill.name));
    if (!skills.length) {
      container.append(node("p", "footnote", "No non-Position skills in the library yet."));
      return;
    }
    const list = node("div", "bjj-history-list");
    for (const { skill, history } of skills) {
      const card = node("div", "bjj-history-item");
      card.dataset.name = skill.name.toLocaleLowerCase();
      card.append(node("strong", "", skill.name));
      if (bjj.blackLotusSkillIds.includes(skill.id)) card.append(node("span", "bjj-lesson-tag", "Black Lotus lesson plan"));
      if (skill.positions.length) card.append(node("span", "footnote", skill.positions.join(", ")));
      card.append(node("p", "footnote", `Practiced: ${history.practiced ?? "Never"} · Tried: ${history.attempted ?? "Never"} · Landed: ${history.landed ?? "Never"}`));
      card.append(node("p", "footnote", `Class sessions: ${history.practiceCount} · Roll sessions: ${history.attemptCount} · Landed: ${history.landedCount}`));
      list.append(card);
    }
    container.append(list);
    filterHistory();
  }

  function render() {
    renderEntries("class");
    renderEntries("roll");
    renderHistory();
  }

  function previousStrategy() {
    if (editingKind !== "roll") return;
    const partner = partnerKey($("bjj-journal-partner").value);
    const date = $("bjj-journal-date").value;
    const previous = sortedEntries(getBjj().rollNotes).find(entry => entry.id !== editingId && entry.date <= date && partnerKey(entry.partner) === partner && entry.strategy.trim());
    $("bjj-previous-strategy").textContent = previous ? `Previous strategy (${previous.date}): ${previous.strategy}` : "";
  }

  function openEntry(kind, id = null, partner = "") {
    editingKind = kind;
    editingId = id;
    const roll = kind === "roll";
    const bjj = getBjj();
    const entry = id ? (roll ? bjj.rollNotes : bjj.classNotes).find(item => item.id === id) : null;
    if (id && !entry) {
      $("bjj-notice").textContent = "The note no longer exists. Reload the page.";
      $("bjj-notice").hidden = false;
      return;
    }
    $("bjj-journal-title").textContent = `${entry ? "Edit" : "Add"} ${kind} note`;
    $("bjj-journal-date").max = today();
    $("bjj-journal-date").value = entry?.date ?? today();
    $("bjj-journal-partner-wrap").hidden = !roll;
    $("bjj-journal-strategy-wrap").hidden = !roll;
    $("bjj-journal-partner").required = roll;
    $("bjj-journal-partner").value = entry?.partner ?? partner;
    $("bjj-journal-notes").value = entry?.notes ?? "";
    $("bjj-journal-strategy").value = entry?.strategy ?? "";
    $("bjj-journal-error").textContent = "";
    $("bjj-journal-search").value = "";
    $("bjj-journal-moves-label").textContent = roll ? "Moves in this roll" : "Moves practiced in class";
    const moves = entry?.moves ?? [];
    choices = moveSkills().map(skill => ({ skillId: skill.id, name: skill.name }));
    preservedMoves = moves.filter(move => !choices.some(choice => choice.skillId === move.skillId));
    $("bjj-journal-preserved").textContent = preservedMoves.length ? `Previously recorded moves no longer available in the library or now marked Position will be preserved: ${preservedMoves.map(move => move.name).join(", ")}.` : "";
    for (const choice of choices) choice.history = bjjMoveHistory(bjj, choice.skillId);
    const blackLotus = new Set(bjj.blackLotusSkillIds);
    choices.sort((a, b) => compareBjjMoveActivity(a.history.lastActivity, blackLotus.has(a.skillId), b.history.lastActivity, blackLotus.has(b.skillId)) || a.name.localeCompare(b.name) || a.skillId.localeCompare(b.skillId));
    const container = $("bjj-journal-moves");
    container.replaceChildren();
    if (!choices.length) container.append(node("p", "footnote", "No non-Position skills in the library yet. You can still save this note."));
    for (const choice of choices) {
      const existing = moves.find(move => move.skillId === choice.skillId);
      const label = node("label", "bjj-journal-move");
      label.dataset.name = choice.name.toLocaleLowerCase();
      const name = node("span", "bjj-journal-move-info");
      name.append(node("strong", "", choice.name));
      if (bjj.blackLotusSkillIds.includes(choice.skillId)) name.append(node("span", "bjj-lesson-tag", "Black Lotus lesson plan"));
      name.append(node("span", "footnote", `Practiced: ${choice.history.practiced ?? "Never"} · Tried: ${choice.history.attempted ?? "Never"} · Landed: ${choice.history.landed ?? "Never"}`));
      const input = node(roll ? "select" : "input");
      input.setAttribute("aria-label", roll ? `${choice.name} in this roll` : `Practiced ${choice.name}`);
      if (roll) {
        for (const [value, text] of [["", "Not recorded"], ["attempted", "Tried"], ["landed", "Landed"]]) {
          const option = node("option", "", text);
          option.value = value;
          input.append(option);
        }
        input.value = existing?.result ?? "";
      } else {
        input.type = "checkbox";
        input.checked = !!existing;
      }
      choice.input = input;
      label.append(name, input);
      container.append(label);
    }
    previousStrategy();
    $("bjj-journal-dialog").showModal();
  }

  $("bjj-class-add").addEventListener("click", () => openEntry("class"));
  $("bjj-roll-add").addEventListener("click", () => openEntry("roll"));
  $("bjj-journal-close").addEventListener("click", () => $("bjj-journal-dialog").close());
  $("bjj-journal-partner").addEventListener("input", previousStrategy);
  $("bjj-journal-date").addEventListener("change", previousStrategy);
  $("bjj-history-search").addEventListener("input", filterHistory);
  $("bjj-journal-search").addEventListener("input", () => {
    const search = $("bjj-journal-search").value.trim().toLocaleLowerCase();
    for (const item of $("bjj-journal-moves").querySelectorAll(".bjj-journal-move")) item.hidden = !item.dataset.name.includes(search);
  });
  $("bjj-journal-form").addEventListener("submit", event => {
    event.preventDefault();
    const roll = editingKind === "roll";
    const moves = [...preservedMoves, ...choices.flatMap(choice => {
      if (roll) return choice.input.value ? [{ skillId: choice.skillId, name: choice.name, result: choice.input.value }] : [];
      return choice.input.checked ? [{ skillId: choice.skillId, name: choice.name }] : [];
    })];
    const entry = { id: editingId ?? crypto.randomUUID(), date: $("bjj-journal-date").value, notes: $("bjj-journal-notes").value, moves };
    if (roll) {
      entry.partner = $("bjj-journal-partner").value;
      entry.strategy = $("bjj-journal-strategy").value;
    }
    const key = roll ? "rollNotes" : "classNotes";
    const bjj = getBjj();
    if (editingId && !bjj[key].some(item => item.id === editingId)) {
      $("bjj-journal-error").textContent = "The note no longer exists. Reload the page.";
      return;
    }
    const entries = editingId ? bjj[key].map(item => item.id === editingId ? entry : item) : [...bjj[key], entry];
    if (save({ ...bjj, [key]: entries }, "bjj-journal-error")) $("bjj-journal-dialog").close();
  });

  function reviewActions() {
    const index = Number($("bjj-review-move").value);
    const selected = $("bjj-review-move").value !== "" ? bjjMoveList[index] : null;
    const action = $("bjj-review-action");
    action.replaceChildren();
    const blank = node("option", "", "Choose an existing skill or add a new one");
    blank.value = "";
    action.append(blank);
    $("bjj-review-group").textContent = selected ? `Listed under: ${selected[1]}` : "";
    if (!selected) return;
    const create = node("option", "", `Add new: ${selected[0]}`);
    create.value = "new";
    action.append(create);
    const skills = getBjj().skills.filter(skill => !isBjjPositionOnly(skill));
    skills.sort((a, b) => Number(b.name.toLocaleLowerCase() === selected[0].toLocaleLowerCase()) - Number(a.name.toLocaleLowerCase() === selected[0].toLocaleLowerCase()) || a.name.localeCompare(b.name));
    for (const skill of skills) {
      const positions = skill.positions.length ? ` · ${skill.positions.join(", ")}` : "";
      const tagged = getBjj().blackLotusSkillIds.includes(skill.id) ? " · Black Lotus" : "";
      const option = node("option", "", `${skill.name}${positions}${tagged}`);
      option.value = `skill:${skill.id}`;
      action.append(option);
    }
    $("bjj-review-error").textContent = "";
    $("bjj-review-status").textContent = "";
  }

  $("bjj-review-open").addEventListener("click", () => {
    const select = $("bjj-review-move");
    select.replaceChildren();
    const blank = node("option", "", "Choose a listed technique");
    blank.value = "";
    select.append(blank);
    bjjMoveList.forEach(([name], index) => {
      const option = node("option", "", name);
      option.value = String(index);
      select.append(option);
    });
    reviewActions();
    $("bjj-review-dialog").showModal();
  });
  $("bjj-review-move").addEventListener("change", reviewActions);
  $("bjj-review-close").addEventListener("click", () => $("bjj-review-dialog").close());
  $("bjj-review-form").addEventListener("submit", event => {
    event.preventDefault();
    const selected = bjjMoveList[Number($("bjj-review-move").value)];
    const action = $("bjj-review-action").value;
    if (!selected || !action) {
      $("bjj-review-error").textContent = "Choose a listed technique and an action.";
      return;
    }
    const bjj = getBjj();
    let skill;
    if (action === "new") {
      if (bjj.skills.some(item => item.name.toLocaleLowerCase() === selected[0].toLocaleLowerCase())) {
        $("bjj-review-error").textContent = "A skill with this name already exists. Choose the existing skill instead.";
        return;
      }
      skill = T.validateBjjSkill({ id: crypto.randomUUID(), name: selected[0], type: "Other", positions: [], description: "", link: "", practice: "not_yet", live: "not_yet", preference: "low", mastered: false, workOnNext: false });
    } else {
      skill = bjj.skills.find(item => `skill:${item.id}` === action && !isBjjPositionOnly(item));
      if (!skill) {
        $("bjj-review-error").textContent = "The selected skill is no longer available. Reload the page.";
        return;
      }
      if (bjj.blackLotusSkillIds.includes(skill.id)) {
        $("bjj-review-status").textContent = `${skill.name} is already tagged Black Lotus.`;
        return;
      }
    }
    const skills = action === "new" ? [...bjj.skills, skill] : bjj.skills;
    if (save({ ...bjj, skills, blackLotusSkillIds: [...bjj.blackLotusSkillIds, skill.id] }, "bjj-review-error")) {
      reviewActions();
      $("bjj-review-status").textContent = `${skill.name} is tagged Black Lotus.`;
    }
  });

  return { render };
}
