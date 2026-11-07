export function mount(root, trackerStorage, T) {
  const document = { body: root.querySelector('.tracker-surface'), getElementById: id => root.getElementById(id), querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector), createElement: tag => window.document.createElement(tag), get activeElement() { return root.activeElement; } };



const STORAGE_KEY = "mercy-ledger-v1";
const $ = id => document.getElementById(id);
const statusLabels = { needed: "Needed", progress: "In Progress", complete: "Complete" };
const blessingLabels = { unknown: "Unknown", 0: "0", 1: "1", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6" };
const columns = [
  { key: "rank", label: "Rank", filter: "number" },
  { key: "name", label: "Champion", filter: "text" },
  { key: "completion", label: "Complete", filter: "score" },
  ...Object.entries(T.buildFields).map(([key, label]) => ({ key, label, filter: key === "blessing" ? "blessing" : "status" })),
  { key: "notes", label: "Notes", filter: "notes" }
];
let state = T.emptyState();
let storedSnapshot = null;
let loadFailed = false;
let notesId = null;
let sortColumn = "completion";
let sortDirection = "descending";
const filters = Object.fromEntries(columns.map(column => [column.key, ""]));
const expanded = new Set();

function notify(message, error = false) {
  $("build-status").classList.toggle("status-error", error);
  $("build-status-text").textContent = error ? "NEEDS ATTENTION" : "SAVED TO CACHE";
  $("build-notice").textContent = error ? message : "";
  $("build-notice").hidden = !error;
}

function save(next, errorTarget = null) {
  try {
    const validated = T.validateState(next);
    if (trackerStorage.getItem(STORAGE_KEY) !== storedSnapshot) throw new Error("Data changed in another page. Reload this page before saving.");
    const serialized = JSON.stringify(validated);
    trackerStorage.setItem(STORAGE_KEY, serialized);
    storedSnapshot = serialized;
    state = validated;
    render();
    notify("Saved locally.");
    return true;
  } catch (error) {
    notify(`Could not save your data: ${error.message}`, true);
    if (errorTarget) $(errorTarget).textContent = `Could not save: ${error.message}`;
    return false;
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addOptions(select, options) {
  for (const [value, text] of Object.entries(options)) {
    const option = element("option", "", text);
    option.value = value;
    select.append(option);
  }
}

function updateChampion(champion, changes, errorTarget = null) {
  const updated = { ...champion, ...changes };
  return save({ ...state, champions: state.champions.map(item => item.id === champion.id ? updated : item) }, errorTarget);
}

function fieldControl(champion, key) {
  const control = element(key === "name" ? "input" : "select", "build-cell-control");
  control.dataset.championId = champion.id;
  control.dataset.championField = key;
  control.setAttribute("aria-label", `${T.buildFields[key] || "Name"} for ${champion.name}`);
  if (key === "name") {
    control.type = "text";
    control.maxLength = 100;
    control.required = true;
    control.value = champion.name;
  } else {
    const options = key === "blessing" ? blessingLabels : statusLabels;
    addOptions(control, options);
    control.value = key === "blessing" && champion.statuses.blessing === null ? "unknown" : String(champion.statuses[key]);
    control.dataset.buildColor = key === "blessing" ? `blessing-${control.value}` : `status-${control.value}`;
  }
  control.addEventListener("change", () => {
    const oldValue = key === "name" ? champion.name : champion.statuses[key];
    const value = key === "name" ? control.value : key === "blessing" ? control.value === "unknown" ? null : Number(control.value) : control.value;
    if (value === oldValue) return;
    const changes = key === "name" ? { name: value } : { statuses: { ...champion.statuses, [key]: value } };
    const focused = document.activeElement === control;
    if (updateChampion(champion, changes)) {
      if (focused) {
        const view = control.closest(".build-mobile-list") ? $("build-mobile-list") : $("build-list");
        const replacement = [...view.querySelectorAll("[data-champion-field]")].find(node => node.dataset.championId === champion.id && node.dataset.championField === key);
        if (replacement) replacement.focus();
      }
    } else if (key !== "name") {
      control.value = oldValue === null ? "unknown" : String(oldValue);
    }
  });
  return control;
}

function notesButton(champion) {
  const button = element("button", "build-notes-button", champion.notes.trim() || "Add notes");
  button.type = "button";
  button.title = champion.notes.trim() || "Add notes";
  button.setAttribute("aria-label", `${champion.notes.trim() ? "Edit" : "Add"} notes for ${champion.name}`);
  button.addEventListener("click", () => {
    notesId = champion.id;
    $("build-notes-title").textContent = `Notes for ${champion.name}`;
    $("build-notes-content").value = champion.notes;
    $("build-notes-error").textContent = "";
    $("build-notes-dialog").showModal();
  });
  return button;
}

function deleteButton(champion) {
  const button = element("button", "button button-quiet build-delete", "Delete");
  button.type = "button";
  button.setAttribute("aria-label", `Delete ${champion.name}`);
  button.addEventListener("click", () => {
    if (window.confirm(`Delete the build for ${champion.name}?`)) {
      if (save({ ...state, champions: state.champions.filter(item => item.id !== champion.id) })) expanded.delete(champion.id);
    }
  });
  return button;
}

function render() {
  const list = $("build-list");
  const mobile = $("build-mobile-list");
  list.replaceChildren();
  mobile.replaceChildren();
  const champions = state.champions.map(champion => ({ champion, score: T.buildCompletion(champion.statuses) }));
  const ranked = [...champions].sort((a, b) => b.score.percentage - a.score.percentage);
  ranked.forEach((item, index) => {
    item.rank = index > 0 && item.score.percentage === ranked[index - 1].score.percentage ? ranked[index - 1].rank : index + 1;
  });
  const visible = champions.filter(({ champion, score, rank }) => {
    if (filters.name && !champion.name.toLocaleLowerCase().includes(filters.name)) return false;
    if (filters.rank && String(rank) !== filters.rank) return false;
    if (filters.completion && String(score.complete) !== filters.completion) return false;
    if (filters.notes && (champion.notes.trim() ? "yes" : "no") !== filters.notes) return false;
    return Object.keys(T.buildFields).every(key => {
      const current = key === "blessing" && champion.statuses[key] === null ? "unknown" : String(champion.statuses[key]);
      return !filters[key] || filters[key] === current;
    });
  });
  const value = item => {
    if (sortColumn === "rank") return item.rank;
    if (sortColumn === "completion") return item.score.percentage;
    if (sortColumn === "name") return item.champion.name;
    if (sortColumn === "notes") return item.champion.notes.trim() ? "Yes" : "No";
    if (sortColumn === "blessing") return item.champion.statuses.blessing;
    return statusLabels[item.champion.statuses[sortColumn]];
  };
  visible.sort((a, b) => {
    const first = value(a), second = value(b);
    if (first === null || second === null) {
      if (first !== second) return first === null ? 1 : -1;
    } else {
      const comparison = typeof first === "number" ? first - second : first.localeCompare(second, undefined, { sensitivity: "base" });
      if (comparison) return sortDirection === "ascending" ? comparison : -comparison;
    }
    return a.champion.name.localeCompare(b.champion.name) || a.champion.id.localeCompare(b.champion.id);
  });
  $("build-count").textContent = `Showing ${visible.length} of ${champions.length} champions.`;
  for (const header of document.querySelectorAll("[data-sort-column]")) {
    const active = header.dataset.sortColumn === sortColumn;
    header.closest("th").setAttribute("aria-sort", active ? sortDirection : "none");
    header.querySelector(".sort-indicator").textContent = active ? (sortDirection === "ascending" ? " ↑" : " ↓") : "";
  }
  $("mobile-sort").value = sortColumn;
  $("mobile-direction").value = sortDirection;
  if (!visible.length) {
    const message = champions.length ? "No champions match these filters." : "No champions yet. Add one to start tracking their build.";
    const row = element("tr");
    const cell = element("td", "build-empty", message);
    cell.colSpan = columns.length + 1;
    row.append(cell);
    list.append(row);
    mobile.append(element("p", "build-empty", message));
  }
  for (const { champion, score, rank } of visible) {
    const row = element("tr");
    row.append(element("td", "build-rank", `#${rank}`));
    const name = element("th", "build-name-cell");
    name.scope = "row";
    name.append(fieldControl(champion, "name"));
    row.append(name);
    const completion = element("td");
    const scoreLabel = element("span", `build-completion build-score-${score.complete}`, `${Math.round(score.percentage)}%`);
    scoreLabel.append(element("small", "", `${score.complete}/${score.applicable}`));
    completion.append(scoreLabel);
    row.append(completion);
    for (const key of Object.keys(T.buildFields)) {
      const cell = element("td");
      cell.append(fieldControl(champion, key));
      row.append(cell);
    }
    const notes = element("td");
    notes.append(notesButton(champion));
    row.append(notes);
    const actions = element("td");
    actions.append(deleteButton(champion));
    row.append(actions);
    list.append(row);

    const card = element("details", "build-mobile-card");
    card.open = expanded.has(champion.id);
    card.addEventListener("toggle", () => {
      if (card.open) expanded.add(champion.id);
      else expanded.delete(champion.id);
    });
    const summary = element("summary");
    summary.append(element("span", "", champion.name), element("strong", `build-completion build-score-${score.complete}`, `${Math.round(score.percentage)}%`));
    card.append(summary);
    const body = element("div", "build-mobile-body");
    for (const key of ["name", ...Object.keys(T.buildFields)]) {
      const label = element("label", "", key === "name" ? "Champion name" : T.buildFields[key]);
      label.append(fieldControl(champion, key));
      body.append(label);
    }
    const notesLabel = element("div", "build-mobile-notes");
    notesLabel.append(element("span", "", "Notes"), notesButton(champion));
    body.append(notesLabel, deleteButton(champion));
    card.append(body);
    mobile.append(card);
  }
}

function makeFilter(column) {
  let input;
  if (["status", "blessing", "notes", "score"].includes(column.filter)) {
    input = element("select");
    addOptions(input, { "": "All" });
    if (column.filter === "score") {
      const total = Object.keys(T.buildFields).length;
      for (let count = 0; count <= total; count++) {
        const option = element("option", "", `${count}/${total}`);
        option.value = String(count);
        input.append(option);
      }
    } else {
      const options = column.filter === "status" ? statusLabels : column.filter === "blessing" ? blessingLabels : { yes: "Has notes", no: "No notes" };
      addOptions(input, options);
    }
    input.value = "";
  } else {
    input = element("input");
    input.type = "text";
    input.placeholder = column.filter === "text" ? "Search" : "Exact rank";
  }
  input.dataset.buildFilter = column.key;
  input.setAttribute("aria-label", `Filter ${column.label}`);
  input.addEventListener("input", () => {
    filters[column.key] = input.value.trim().toLocaleLowerCase();
    for (const other of document.querySelectorAll("[data-build-filter]")) {
      if (other !== input && other.dataset.buildFilter === column.key) other.value = input.value;
    }
    render();
  });
  return input;
}

function createTableHead() {
  const headings = element("tr");
  const filterRow = element("tr", "build-filter-row");
  for (const column of columns) {
    const th = element("th");
    th.scope = "col";
    const button = element("button", "build-sort-button", column.label);
    button.type = "button";
    button.dataset.sortColumn = column.key;
    button.append(element("span", "sort-indicator"));
    button.addEventListener("click", () => {
      if (sortColumn === column.key) sortDirection = sortDirection === "ascending" ? "descending" : "ascending";
      else { sortColumn = column.key; sortDirection = "ascending"; }
      render();
    });
    th.append(button);
    headings.append(th);
    const cell = element("td");
    cell.append(makeFilter(column));
    filterRow.append(cell);
    const label = element("label", "", column.label);
    label.append(makeFilter(column));
    $("mobile-filters").append(label);
    const option = element("option", "", column.label);
    option.value = column.key;
    $("mobile-sort").append(option);
  }
  const actions = element("th", "", "Actions");
  actions.scope = "col";
  headings.append(actions);
  filterRow.append(element("td"));
  $("build-table-head").append(headings, filterRow);
}

function openForm() {
  $("build-name").value = "";
  $("build-notes").value = "";
  $("build-form-error").textContent = "";
  for (const select of $("build-fields").querySelectorAll("select")) select.value = select.name === "blessing" ? "0" : "needed";
  $("build-dialog").showModal();
  $("build-name").focus();
}

for (const [key, labelText] of Object.entries(T.buildFields)) {
  const wrapper = element("div");
  const label = element("label", "", labelText.toUpperCase());
  label.htmlFor = `build-${key}`;
  const select = element("select");
  select.id = label.htmlFor;
  select.name = key;
  addOptions(select, key === "blessing" ? blessingLabels : statusLabels);
  wrapper.append(label, select);
  $("build-fields").append(wrapper);
}
$("build-add").addEventListener("click", openForm);
$("build-close").addEventListener("click", () => $("build-dialog").close());
$("build-cancel").addEventListener("click", () => $("build-dialog").close());
$("build-notes-close").addEventListener("click", () => $("build-notes-dialog").close());
$("build-notes-cancel").addEventListener("click", () => $("build-notes-dialog").close());
$("build-notes-form").addEventListener("submit", event => {
  event.preventDefault();
  const champion = state.champions.find(item => item.id === notesId);
  if (!champion) {
    $("build-notes-error").textContent = "This champion is no longer available. Reload the page.";
    return;
  }
  if (updateChampion(champion, { notes: $("build-notes-content").value }, "build-notes-error")) $("build-notes-dialog").close();
});
$("build-clear-filters").addEventListener("click", () => {
  for (const key of Object.keys(filters)) filters[key] = "";
  for (const input of document.querySelectorAll("[data-build-filter]")) input.value = "";
  render();
});
$("mobile-sort").addEventListener("change", event => { sortColumn = event.target.value; render(); });
$("mobile-direction").addEventListener("change", event => { sortDirection = event.target.value; render(); });
$("build-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const statuses = Object.fromEntries([...$("build-fields").querySelectorAll("select")].map(select => [select.name, select.name === "blessing" ? select.value === "unknown" ? null : Number(select.value) : select.value]));
    const champion = T.validateChampion({ id: crypto.randomUUID(), name: $("build-name").value, statuses, notes: $("build-notes").value });
    if (save({ ...state, champions: [...state.champions, champion] }, "build-form-error")) $("build-dialog").close();
  } catch (error) {
    $("build-form-error").textContent = error.message;
  }
});

try {
  storedSnapshot = trackerStorage.getItem(STORAGE_KEY);
  if (storedSnapshot !== null) state = T.validateState(JSON.parse(storedSnapshot));
} catch (error) {
  loadFailed = true;
  notify(`Could not load saved data: ${error.message}. Your data has not been overwritten. Import a backup in Administration.`, true);
}
createTableHead();
render();
if (loadFailed) $("build-add").disabled = true;

}
