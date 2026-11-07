export function mount(root, trackerStorage, T, onBeltChange) {
  const document = { body: root.querySelector('.tracker-surface'), getElementById: id => root.getElementById(id), querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector), createElement: tag => window.document.createElement(tag), get activeElement() { return root.activeElement; } };



const STORAGE_KEY = "mercy-ledger-v1";
const $ = id => document.getElementById(id);
const options = {
  video: { unset: "Unset", liked: "Like it", replace: "Find better" },
  practice: { unset: "Unset", not_yet: "Not yet", learning: "Learning", sometimes: "Sometimes", consistently: "Consistently" },
  live: { unset: "Unset", not_yet: "Not yet", learning: "Learning", sometimes: "Sometimes", consistently: "Consistently" },
  preference: { unset: "Unset", low: "Low", medium: "Medium", high: "High" },
  mastered: { false: "Not mastered", true: "Mastered" }
};
const columns = [
  { key: "name", label: "Skill" }, { key: "type", label: "Type" },
  { key: "description", label: "Description" }, { key: "link", label: "Video link" },
  { key: "video", label: "Video quality" }, { key: "practice", label: "Practice" },
  { key: "live", label: "Live rolls" }, { key: "preference", label: "Preference" },
  { key: "mastered", label: "Mastery" }
];
let state = T.emptyState();
let snapshot = null;
let failed = false;
let editingId = null;
let editingTypeId = null;
let sort = "name";
let direction = "ascending";
const filters = Object.fromEntries(columns.map(column => [column.key, ""]));
const expanded = new Set();
let typeFilterChoices = [];

function node(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

function addOptions(select, values) {
  for (const [value, label] of Object.entries(values)) {
    const option = node("option", "", label);
    option.value = value;
    select.append(option);
  }
}

function typePicker(value, label, onChange) {
  const picker = node("details", "bjj-type-picker");
  const summary = node("summary");
  const selected = node("span", "", value || "Choose a type");
  summary.append(selected);
  summary.title = value;
  summary.setAttribute("aria-label", `${label}: ${value || "Choose a type"}`);
  const list = node("div", "bjj-type-options");
  const types = [...T.bjjTypes];
  if (value && !types.includes(value)) types.push(value);
  for (const choice of [...types.map(type => ({ type, custom: false })), { type: "", custom: true }]) {
    const text = choice.custom ? "Custom type…" : choice.type;
    const button = node("button", "", text);
    button.type = "button";
    button.title = text;
    button.addEventListener("click", () => {
      picker.open = false;
      onChange(choice, picker);
      if (picker.isConnected && !$("bjj-type-dialog").open) summary.focus();
    });
    list.append(button);
  }
  picker.append(summary, list);
  picker.addEventListener("keydown", event => {
    if (event.key === "Escape" && picker.open) {
      event.preventDefault();
      event.stopPropagation();
      picker.open = false;
      summary.focus();
    }
  });
  picker.addEventListener("focusout", event => {
    if (!picker.contains(event.relatedTarget)) picker.open = false;
  });
  return picker;
}

function notify(message, error = false) {
  $("bjj-status").classList.toggle("status-error", error);
  $("bjj-status-text").textContent = error ? "NEEDS ATTENTION" : "SAVED TO CACHE";
  $("bjj-notice").textContent = error ? message : "";
  $("bjj-notice").hidden = !error;
}

function save(bjj, errorTarget) {
  try {
    if (failed) throw new Error("Saved data could not be loaded. Import a backup in Administration.");
    const next = T.validateState({ ...state, bjj });
    if (trackerStorage.getItem(STORAGE_KEY) !== snapshot) throw new Error("Data changed in another page. Reload this page before saving.");
    const serialized = JSON.stringify(next);
    trackerStorage.setItem(STORAGE_KEY, serialized);
    snapshot = serialized;
    state = next;
    render();
    notify("Saved locally.");
    return true;
  } catch (error) {
    notify(`Could not save your data: ${error.message}`, true);
    if (errorTarget) $(errorTarget).textContent = error.message;
    return false;
  }
}

function update(skill, patch, errorTarget) {
  return save({ ...state.bjj, skills: state.bjj.skills.map(item => item.id === skill.id ? { ...item, ...patch } : item) }, errorTarget);
}

function textControl(skill, key) {
  const input = node("input", "bjj-inline-control");
  input.type = key === "link" ? "url" : "text";
  input.value = skill[key];
  input.maxLength = key === "link" ? 2048 : 100;
  input.setAttribute("aria-label", `${columns.find(column => column.key === key).label} for ${skill.name}`);
  input.addEventListener("change", () => {
    if (input.value === skill[key]) return;
    if (!update(skill, { [key]: input.value.trim() })) input.value = skill[key];
  });
  return input;
}

function typeControl(skill) {
  return typePicker(skill.type, `Type for ${skill.name}`, choice => {
    if (choice.custom) {
      editingTypeId = skill.id;
      $("bjj-type-title").textContent = `Custom type: ${skill.name}`;
      $("bjj-type-custom").value = T.bjjTypes.includes(skill.type) ? "" : skill.type;
      $("bjj-type-error").textContent = "";
      $("bjj-type-dialog").showModal();
      $("bjj-type-custom").focus();
    } else if (choice.type !== skill.type) update(skill, { type: choice.type });
  });
}

function selectControl(skill, key) {
  const select = node("select", "bjj-inline-control");
  addOptions(select, options[key]);
  select.value = skill[key];
  select.setAttribute("aria-label", `${columns.find(column => column.key === key).label} for ${skill.name}`);
  select.addEventListener("change", () => {
    if (!update(skill, { [key]: select.value })) select.value = skill[key];
  });
  return select;
}

function descriptionControl(skill) {
  const button = node("button", "bjj-cell-button bjj-edit-text", skill.description || "Add description");
  button.type = "button";
  button.title = skill.description || "Add description";
  button.setAttribute("aria-label", `Edit description for ${skill.name}`);
  button.addEventListener("click", () => {
    editingId = skill.id;
    $("bjj-text-title").textContent = `Description: ${skill.name}`;
    $("bjj-text").value = skill.description;
    $("bjj-text-error").textContent = "";
    $("bjj-text-dialog").showModal();
  });
  return button;
}

function masteryControl(skill) {
  const wrapper = node("div");
  const button = node("button", "bjj-mastery bjj-edit-text", skill.mastered ? "Mastered" : "Not mastered");
  button.type = "button";
  button.dataset.skillId = skill.id;
  button.setAttribute("aria-label", `Mastered: ${skill.name}`);
  button.setAttribute("aria-pressed", String(skill.mastered));
  button.addEventListener("click", () => {
    const view = button.closest(".bjj-cards") ? $("bjj-cards") : $("bjj-list");
    const focused = document.activeElement === button;
    if (update(skill, { mastered: !skill.mastered }) && focused) {
      const replacement = [...view.querySelectorAll(".bjj-mastery")].find(item => item.dataset.skillId === skill.id);
      if (replacement) replacement.focus();
    }
  });
  wrapper.append(button);
  if (!skill.mastered && skill.practice === "consistently" && skill.live === "consistently") wrapper.append(node("span", "bjj-suggest", "Ready to consider"));
  return wrapper;
}

function control(skill, key) {
  if (key === "name") return textControl(skill, key);
  if (key === "type") return typeControl(skill);
  if (key === "description") return descriptionControl(skill);
  if (key === "mastered") return masteryControl(skill);
  if (key === "link") {
    const wrapper = node("div");
    const input = textControl(skill, key);
    input.placeholder = "HTTPS video link";
    wrapper.append(input);
    if (skill.link) {
      const link = node("a", "bjj-link", "Open video ↗");
      link.href = skill.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      wrapper.append(link);
    }
    return wrapper;
  }
  return selectControl(skill, key);
}

function deleteControl(skill) {
  const button = node("button", "button button-quiet build-delete", "Delete");
  button.type = "button";
  button.setAttribute("aria-label", `Delete ${skill.name}`);
  button.addEventListener("click", () => {
    if (window.confirm(`Delete the skill "${skill.name}"?`)) {
      if (save({ ...state.bjj, skills: state.bjj.skills.filter(item => item.id !== skill.id) })) expanded.delete(skill.id);
    }
  });
  return button;
}

function render() {
  document.body.dataset.belt = state.bjj.belt.toLowerCase();
  onBeltChange(document.body.dataset.belt);
  const typeFilter = document.querySelector('[data-bjj-filter="type"]');
  if (typeFilter) {
    const types = [...T.bjjTypes];
    for (const skill of state.bjj.skills) {
      if (!types.includes(skill.type)) types.push(skill.type);
    }
    if (filters.type && !types.includes(filters.type)) types.push(filters.type);
    if (types.length !== typeFilterChoices.length || types.some((type, index) => type !== typeFilterChoices[index])) {
      typeFilter.replaceChildren();
      addOptions(typeFilter, { "": "All" });
      for (const type of types) {
        const option = node("option", "", type);
        option.value = type;
        typeFilter.append(option);
      }
      typeFilter.value = filters.type;
      typeFilterChoices = types;
    }
  }
  $("bjj-belt").value = state.bjj.belt;
  $("bjj-stripes").value = String(state.bjj.stripes);
  const belt = $("bjj-belt-display");
  belt.replaceChildren();
  for (let i = 0; i < state.bjj.stripes; i++) belt.append(node("span"));
  belt.setAttribute("aria-label", `${state.bjj.belt} belt, ${state.bjj.stripes} white ${state.bjj.stripes === 1 ? "stripe" : "stripes"}`);
  const nextBelt = T.bjjBelts[T.bjjBelts.indexOf(state.bjj.belt) + 1];
  $("bjj-next").textContent = state.bjj.stripes < 4 ? `Next: ${state.bjj.stripes + 1} ${state.bjj.stripes === 0 ? "stripe" : "stripes"}` : nextBelt ? `Next: ${nextBelt} belt` : "Four stripes recorded; no next belt in this tracker.";
  const values = skill => columns.map(column => [column.key, column.key === "mastered" ? String(skill.mastered) : skill[column.key]]);
  const visible = state.bjj.skills.filter(skill => values(skill).every(([key, value]) => {
    const filter = filters[key];
    if (!filter) return true;
    return key === "type" || options[key] ? String(value) === filter : value.toLocaleLowerCase().includes(filter);
  }));
  visible.sort((a, b) => {
    const label = skill => options[sort] ? options[sort][String(skill[sort])] : skill[sort];
    const order = ["practice", "live", "preference"].includes(sort)
      ? Object.keys(options[sort]).indexOf(a[sort]) - Object.keys(options[sort]).indexOf(b[sort])
      : label(a).localeCompare(label(b), undefined, { sensitivity: "base" });
    return (direction === "ascending" ? order : -order) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  $("bjj-count").textContent = `Showing ${visible.length} of ${state.bjj.skills.length} skills.`;
  for (const button of document.querySelectorAll("[data-bjj-sort]")) {
    const active = button.dataset.bjjSort === sort;
    const heading = button.closest("th");
    if (heading) heading.setAttribute("aria-sort", active ? direction : "none");
    else {
      button.setAttribute("aria-pressed", String(active));
      button.setAttribute("aria-label", `${columns.find(column => column.key === button.dataset.bjjSort).label}${active ? `, sorted ${direction}` : ""}`);
    }
    button.querySelector("span").textContent = active ? (direction === "ascending" ? " ↑" : " ↓") : "";
  }
  const list = $("bjj-list"), cards = $("bjj-cards");
  list.replaceChildren();
  cards.replaceChildren();
  if (!visible.length) {
    const message = state.bjj.skills.length ? "No skills match these filters." : "No skills yet. Add one to get started.";
    const row = node("tr"), cell = node("td", "build-empty", message);
    cell.colSpan = columns.length + 1;
    row.append(cell);
    list.append(row);
    cards.append(node("p", "build-empty", message));
  }
  for (const skill of visible) {
    const row = node("tr", skill.mastered ? "bjj-mastered" : "");
    for (const column of columns) {
      const cell = node("td");
      cell.append(control(skill, column.key));
      row.append(cell);
    }
    const actions = node("td");
    actions.append(deleteControl(skill));
    row.append(actions);
    list.append(row);
    const card = node("details", skill.mastered ? "bjj-card bjj-mastered" : "bjj-card");
    card.open = expanded.has(skill.id);
    card.addEventListener("toggle", () => { if (card.open) expanded.add(skill.id); else expanded.delete(skill.id); });
    const summary = node("summary");
    summary.append(node("strong", "", skill.name), node("span", "", skill.mastered ? "Mastered" : skill.type));
    const body = node("div", "bjj-card-body");
    for (const column of columns) {
      const wrapper = node("div");
      wrapper.append(node("label", "", column.label.toUpperCase()), control(skill, column.key));
      body.append(wrapper);
    }
    body.append(deleteControl(skill));
    card.append(summary, body);
    cards.append(card);
  }
}

function initControls() {
  addOptions($("bjj-belt"), Object.fromEntries(T.bjjBelts.map(belt => [belt, belt])));
  addOptions($("bjj-stripes"), Object.fromEntries([0, 1, 2, 3, 4].map(count => [count, String(count)])));
  for (const key of ["video", "practice", "live", "preference", "mastered"]) addOptions($(`bjj-add-${key}`), options[key]);
  const row = node("tr");
  for (const column of columns) {
    const th = node("th");
    th.scope = "col";
    th.append(sortButton(column, "build-sort-button"));
    row.append(th);
    $("bjj-card-sort").append(sortButton(column, ""));
    const label = node("label", "", column.label.toUpperCase());
    const input = node(column.key === "type" || options[column.key] ? "select" : "input");
    if (options[column.key]) addOptions(input, { "": "All", ...options[column.key] });
    else if (column.key !== "type") { input.type = "text"; input.placeholder = "Search"; }
    input.setAttribute("aria-label", `Filter ${column.label}`);
    input.dataset.bjjFilter = column.key;
    input.addEventListener("input", () => {
      filters[column.key] = column.key === "type" || options[column.key] ? input.value : input.value.trim().toLocaleLowerCase();
      render();
    });
    label.append(input);
    $("bjj-filters").append(label);
  }
  const actions = node("th", "", "Actions");
  actions.scope = "col";
  row.append(actions);
  $("bjj-head").append(row);
}

function sortButton(column, className) {
  const button = node("button", className, column.label);
  button.type = "button";
  button.dataset.bjjSort = column.key;
  button.append(node("span"));
  button.addEventListener("click", () => {
    if (sort === column.key) direction = direction === "ascending" ? "descending" : "ascending";
    else { sort = column.key; direction = "ascending"; }
    render();
  });
  return button;
}

let addType = "";
let addCustomType = false;
function resetAddType() {
  addType = "";
  addCustomType = false;
  const picker = typePicker("", "Type", (choice, current) => {
    addType = choice.type;
    addCustomType = choice.custom;
    current.querySelector("summary span").textContent = choice.custom ? "Custom type…" : choice.type;
    current.querySelector("summary").setAttribute("aria-label", `Type: ${choice.custom ? "Custom type" : choice.type}`);
    current.querySelector("summary").title = choice.custom ? "Custom type" : choice.type;
    $("bjj-custom-wrap").hidden = !choice.custom;
    $("bjj-custom-type").required = choice.custom;
    $("bjj-add-error").textContent = "";
  });
  $("bjj-type-container").replaceChildren(picker);
}

$("bjj-belt").addEventListener("change", event => { if (!save({ ...state.bjj, belt: event.target.value })) event.target.value = state.bjj.belt; });
$("bjj-stripes").addEventListener("change", event => { if (!save({ ...state.bjj, stripes: Number(event.target.value) })) event.target.value = String(state.bjj.stripes); });
$("bjj-clear").addEventListener("click", () => {
  for (const key of Object.keys(filters)) filters[key] = "";
  for (const input of document.querySelectorAll("[data-bjj-filter]")) input.value = "";
  render();
});
$("bjj-add").addEventListener("click", () => {
  $("bjj-add-form").reset();
  for (const [key, value] of Object.entries({ video: "unset", practice: "not_yet", live: "not_yet", preference: "low", mastered: "false" })) $(`bjj-add-${key}`).value = value;
  resetAddType();
  $("bjj-custom-wrap").hidden = true;
  $("bjj-custom-type").required = false;
  $("bjj-add-error").textContent = "";
  $("bjj-add-dialog").showModal();
  $("bjj-name").focus();
});
$("bjj-add-close").addEventListener("click", () => $("bjj-add-dialog").close());
$("bjj-add-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    if (!addType && !addCustomType) {
      $("bjj-add-error").textContent = "Choose a skill type.";
      $("bjj-type-container").querySelector("summary").focus();
      return;
    }
    const type = addCustomType ? $("bjj-custom-type").value : addType;
    const skill = T.validateBjjSkill({ id: crypto.randomUUID(), name: $("bjj-name").value, type, description: $("bjj-add-description").value, link: $("bjj-add-link").value.trim(), video: $("bjj-add-video").value, practice: $("bjj-add-practice").value, live: $("bjj-add-live").value, preference: $("bjj-add-preference").value, mastered: $("bjj-add-mastered").value === "true" });
    if (save({ ...state.bjj, skills: [...state.bjj.skills, skill] }, "bjj-add-error")) $("bjj-add-dialog").close();
  } catch (error) { $("bjj-add-error").textContent = error.message; }
});
$("bjj-type-close").addEventListener("click", () => $("bjj-type-dialog").close());
$("bjj-type-form").addEventListener("submit", event => {
  event.preventDefault();
  const skill = state.bjj.skills.find(item => item.id === editingTypeId);
  if (!skill) { $("bjj-type-error").textContent = "Skill not found. Reload the page."; return; }
  if (update(skill, { type: $("bjj-type-custom").value }, "bjj-type-error")) $("bjj-type-dialog").close();
});
$("bjj-text-close").addEventListener("click", () => $("bjj-text-dialog").close());
$("bjj-text-form").addEventListener("submit", event => {
  event.preventDefault();
  const skill = state.bjj.skills.find(item => item.id === editingId);
  if (!skill) { $("bjj-text-error").textContent = "Skill not found. Reload the page."; return; }
  if (update(skill, { description: $("bjj-text").value }, "bjj-text-error")) $("bjj-text-dialog").close();
});
try {
  snapshot = trackerStorage.getItem(STORAGE_KEY);
  if (snapshot !== null) state = T.validateState(JSON.parse(snapshot));
} catch (error) {
  failed = true;
  notify(`Could not load saved data: ${error.message}. Your data has not been overwritten; import a backup in Administration.`, true);
}
initControls();
render();
if (failed) {
  $("bjj-add").disabled = true;
  $("bjj-belt").disabled = true;
  $("bjj-stripes").disabled = true;
}

}
