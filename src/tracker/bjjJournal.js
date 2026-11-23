import { bjjMoveHistory, isBjjPositionOnly } from "./bjjJournalData.js";
import { bjjMoveList } from "./bjjMoveList.js";

export function mountBjjJournal(document, node, T, getBjj, save) {
  const $ = id => document.getElementById(id);
  let editingKind = "class";
  let editingId = null;
  let choices = [];

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function sortedEntries(entries) {
    return entries.map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.index - a.index)
      .map(item => item.entry);
  }

  function trackedSkills() {
    const bjj = getBjj();
    return bjj.skills.filter(skill => bjj.trackedSkillIds.includes(skill.id) && !isBjjPositionOnly(skill));
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
    for (const entry of entries) {
      const card = node("details", "bjj-journal-entry");
      const summary = node("summary", "", roll ? `${entry.date} · ${entry.partner}` : entry.date);
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
      actions.append(edit, remove);
      content.append(actions);
      card.append(summary, content);
      list.append(card);
    }
    container.append(list);
  }

  function renderHistory() {
    const bjj = getBjj();
    const container = $("bjj-move-history");
    container.replaceChildren();
    const skills = trackedSkills().map(skill => ({ skill, history: bjjMoveHistory(bjj, skill.id) }));
    skills.sort((a, b) => (a.history.lastActivity ?? "").localeCompare(b.history.lastActivity ?? "") || a.skill.name.localeCompare(b.skill.name));
    if (!skills.length) {
      container.append(node("p", "footnote", "No tracked techniques yet. Flag a skill in its details or review the move list."));
      return;
    }
    const list = node("div", "bjj-history-list");
    for (const { skill, history } of skills) {
      const card = node("div", "bjj-history-item");
      card.append(node("strong", "", skill.name));
      if (skill.positions.length) card.append(node("span", "footnote", skill.positions.join(", ")));
      card.append(node("p", "footnote", `Practiced: ${history.practiced ?? "Never"} · Tried: ${history.attempted ?? "Never"} · Landed: ${history.landed ?? "Never"}`));
      list.append(card);
    }
    container.append(list);
  }

  function render() {
    renderEntries("class");
    renderEntries("roll");
    renderHistory();
  }

  function previousStrategy() {
    if (editingKind !== "roll") return;
    const partner = $("bjj-journal-partner").value.trim().toLocaleLowerCase();
    const date = $("bjj-journal-date").value;
    const previous = sortedEntries(getBjj().rollNotes).find(entry => entry.id !== editingId && entry.date <= date && entry.partner.toLocaleLowerCase() === partner && entry.strategy.trim());
    $("bjj-previous-strategy").textContent = previous ? `Previous strategy (${previous.date}): ${previous.strategy}` : "";
  }

  function openEntry(kind, id = null) {
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
    $("bjj-journal-partner").value = entry?.partner ?? "";
    $("bjj-journal-notes").value = entry?.notes ?? "";
    $("bjj-journal-strategy").value = entry?.strategy ?? "";
    $("bjj-journal-error").textContent = "";
    $("bjj-journal-moves-label").textContent = roll ? "Moves in this roll" : "Moves practiced in class";
    const moves = entry?.moves ?? [];
    choices = trackedSkills().map(skill => ({ skillId: skill.id, name: skill.name }));
    for (const move of moves) {
      if (!choices.some(choice => choice.skillId === move.skillId)) choices.push({ skillId: move.skillId, name: move.name });
    }
    for (const choice of choices) choice.history = bjjMoveHistory(bjj, choice.skillId);
    choices.sort((a, b) => (a.history.lastActivity ?? "").localeCompare(b.history.lastActivity ?? "") || a.name.localeCompare(b.name) || a.skillId.localeCompare(b.skillId));
    const container = $("bjj-journal-moves");
    container.replaceChildren();
    if (!choices.length) container.append(node("p", "footnote", "No tracked techniques yet. You can still save this note."));
    for (const choice of choices) {
      const existing = moves.find(move => move.skillId === choice.skillId);
      const label = node("label", "bjj-journal-move");
      const name = node("span", "bjj-journal-move-info");
      name.append(node("strong", "", choice.name), node("span", "footnote", `Practiced: ${choice.history.practiced ?? "Never"} · Tried: ${choice.history.attempted ?? "Never"} · Landed: ${choice.history.landed ?? "Never"}`));
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
  $("bjj-journal-form").addEventListener("submit", event => {
    event.preventDefault();
    const roll = editingKind === "roll";
    const moves = choices.flatMap(choice => {
      if (roll) return choice.input.value ? [{ skillId: choice.skillId, name: choice.name, result: choice.input.value }] : [];
      return choice.input.checked ? [{ skillId: choice.skillId, name: choice.name }] : [];
    });
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
      const tracked = getBjj().trackedSkillIds.includes(skill.id) ? " · already tracked" : "";
      const option = node("option", "", `${skill.name}${positions}${tracked}`);
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
      if (bjj.trackedSkillIds.includes(skill.id)) {
        $("bjj-review-status").textContent = `${skill.name} is already tracked.`;
        return;
      }
    }
    const skills = action === "new" ? [...bjj.skills, skill] : bjj.skills;
    if (save({ ...bjj, skills, trackedSkillIds: [...bjj.trackedSkillIds, skill.id] }, "bjj-review-error")) {
      reviewActions();
      $("bjj-review-status").textContent = `${skill.name} is now tracked.`;
    }
  });

  return { render };
}
