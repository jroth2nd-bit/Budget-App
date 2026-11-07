export function mount(root, trackerStorage, T) {
  const document = { body: root.querySelector('.tracker-surface'), getElementById: id => root.getElementById(id), querySelector: selector => root.querySelector(selector), querySelectorAll: selector => root.querySelectorAll(selector), createElement: tag => window.document.createElement(tag), get activeElement() { return root.activeElement; } };



const STORAGE_KEY = "mercy-ledger-v1";
const $ = id => document.getElementById(id);
let state = T.emptyState();
let loadFailed = false;
let storedSnapshot = null;

function notify(message, error = false) {
  const notice = $("notice");
  $("save-status").classList.toggle("status-error", error);
  $("save-status-text").textContent = error ? "NEEDS ATTENTION" : "SAVED TO CACHE";
  notice.textContent = error ? message : "";
  notice.hidden = !error;
}

function save(next, message) {
  try {
    const validated = T.validateState(next);
    if (trackerStorage.getItem(STORAGE_KEY) !== storedSnapshot) throw new Error("Data changed in another page. Reload this page before saving.");
    const serialized = JSON.stringify(validated);
    trackerStorage.setItem(STORAGE_KEY, serialized);
    storedSnapshot = serialized;
    state = validated;
    render();
    if (message) notify(message);
    return true;
  } catch (error) {
    notify(`Could not save your data: ${error.message}`, true);
    render();
    return false;
  }
}

function render() {
  const result = T.calculate(state);
  $("mercy-cards").innerHTML = Object.entries(T.rules).map(([source, rarities]) => {
    const activeRarities = Object.entries(rarities).filter(([rarity, rule]) => T.mercyActive(rule, result.counters[source][rarity])).map(([rarity]) => rarity);
    const cardMercy = activeRarities.includes("Mythical") ? "card-mercy-mythical" : activeRarities.includes("Legendary") ? "card-mercy-legendary" : "";
    const rows = Object.entries(rarities).map(([rarity, rule]) => {
      const { known, count } = result.counters[source][rarity];
      const chance = known ? `${T.nextChance(rule, count).toFixed(1).replace(/\.0$/, "")}%` : "Unknown";
      const progress = Math.min(100, count / rule.threshold * 100);
      const active = T.mercyActive(rule, { known, count });
      const detail = active ? `${rarity} mercy active · next pull` : known ? `${rule.threshold - count} until mercy` : (count ? `At least ${count} observed; total unknown` : "Count unknown");
      const id = `count-${source}-${rarity}`;
      return `<div class="rarity-row${active ? ` active-mercy active-mercy-${rarity.toLowerCase()}` : ""}"><div class="row-title"><label for="${id}">${rarity}</label><span>Next pull <strong>${chance}</strong></span></div><div class="counter-line"><input id="${id}" class="counter-input" data-shard="${source}" data-rarity="${rarity}" type="number" min="0" max="1000000" step="1" placeholder="Unknown" value="${known ? count : ""}" aria-label="${source} pulls since ${rarity}"><span>pulls since ${rarity}</span></div><div class="progress"><span style="width:${progress}%"></span></div><div class="row-detail"${active ? ' role="status"' : ""}>${detail}</div></div>`;
    }).join("");
    const remnantInfo = source === "Remnant" ? '<p class="remnant-info">Standard rates: 82.5% Epic · 15% Void Epic · 2.5% Mythical</p>' : "";
    return `<article class="mercy-card shard-${source.toLowerCase()} ${cardMercy}"><div class="card-top"><div class="card-name"><div class="shard-icon">◆</div><div><h3>${source}</h3><span class="card-tag">${source === "Remnant" ? "SUMMON" : "SHARD"}</span></div></div><span class="card-number">${String(Object.keys(T.rules).indexOf(source) + 1).padStart(2, "0")}</span></div>${rows}${remnantInfo}</article>`;
  }).join("");
  for (const input of document.querySelectorAll("[data-inventory]")) input.value = state.soulInventory[input.dataset.inventory];
  renderSoulProjection();
  for (const section of $("battle-plans").querySelectorAll("[data-plan]")) {
    const plan = state.battlePlans[section.dataset.plan];
    for (const input of section.querySelectorAll("[data-field]")) input.value = plan[input.dataset.field];
    renderBattle(section);
  }
  for (const [kind, types] of Object.entries(T.summonTypes)) {
    $(`${kind}-summon-rows`).innerHTML = types.map(type => {
      const row = state.summonPlans[kind][type];
      return `<div class="summon-row" data-summon-type="${type}"><strong>${type}</strong><input data-summon-field="pulls" type="number" min="0" max="1000000" step="1" value="${row.pulls}" aria-label="${kind} ${type} pulls"><input data-summon-field="points" type="number" min="0" max="1000000" step="1" value="${row.points}" aria-label="${kind} ${type} points per pull"><output>${T.summonRowPoints(row).toLocaleString()}</output></div>`;
    }).join("");
    $(`${kind}-summon-total`).textContent = T.summonProjection(state.summonPlans[kind], kind).toLocaleString();
  }
  renderClan();
  if (loadFailed) disableAfterLoadFailure();
}

function disableAfterLoadFailure() {
  document.querySelectorAll("button, input, select").forEach(element => { element.disabled = true; });
}

function updateCounter(input) {
  if (!input.validity.valid) {
    notify("Enter a whole count between 0 and 1,000,000, or leave it blank if unknown.", true);
    render();
    return;
  }
  const current = structuredClone(state.current);
  const { shard, rarity } = input.dataset;
  if (!current.shards[shard]) current.shards[shard] = {};
  current.shards[shard][rarity] = input.value === "" ? null : Number(input.value);
  save({ ...state, current }, "Count saved on this device.");
}

$("mercy-cards").addEventListener("change", event => {
  if (event.target.matches("[data-shard]")) updateCounter(event.target);
});

function renderSoulProjection() {
  const projection = T.soulCoinProjection(state.soulInventory);
  const number = value => value.toLocaleString();
  const { mortal, immortal } = projection;
  $("soul-projection").innerHTML = `<div class="soul-projection-row"><span><strong>Mortal</strong><small>${number(mortal.purchases)} purchasable · ${number(mortal.pulls)} total to pull</small></span><span>${number(mortal.remaining)} coins left</span></div>
    <div class="soul-projection-row"><span><strong>Immortal</strong><small>+${number(immortal.earned)} from Mortal pulls · ${number(immortal.total)} coins total</small><small>${number(immortal.pulls)} total Immortal stones</small></span><span><b>${number(immortal.purchases)}</b> purchasable<small>${number(immortal.remaining)} coins left</small></span></div>`;
}

function activatePointsTab(tab, focus = false) {
  for (const button of document.querySelectorAll(".points-tabs [role=tab]")) {
    const active = button === tab;
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
    $(button.getAttribute("aria-controls")).hidden = !active;
  }
  const isSummon = tab.id === "tab-shard" || tab.id === "tab-soul";
  $("points-battle-note").hidden = isSummon;
  $("points-summon-note").hidden = !isSummon;
  if (focus) tab.focus();
}

document.querySelector(".points-tabs").addEventListener("click", event => {
  const tab = event.target.closest("[role=tab]");
  if (tab) activatePointsTab(tab);
});
document.querySelector(".points-tabs").addEventListener("keydown", event => {
  const tabs = Array.from(document.querySelectorAll(".points-tabs [role=tab]"));
  const index = tabs.indexOf(event.target);
  if (index < 0) return;
  let next;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  activatePointsTab(tabs[next], true);
});

document.querySelector(".soul-inventory").addEventListener("change", event => {
  const input = event.target;
  if (!input.matches("[data-inventory]")) return;
  if (!input.validity.valid) {
    notify("Enter a whole inventory amount between 0 and 1,000,000.", true);
    render();
    return;
  }
  const soulInventory = { ...state.soulInventory, [input.dataset.inventory]: input.value === "" ? 0 : Number(input.value) };
  save({ ...state, soulInventory }, "Soulstone inventory saved on this device.");
});

function renderBattle(section) {
  const result = $(`${section.dataset.plan}-result`);
  try {
    const plan = {};
    for (const input of section.querySelectorAll("[data-field]")) {
      if (!input.validity.valid) throw new Error(input.dataset.field === "seconds" ? "Seconds must be a whole number from 0 to 59." : "Enter whole numbers from 0 to 1,000,000.");
      plan[input.dataset.field] = input.value === "" ? 0 : Number(input.value);
    }
    const totals = T.battleProjection(plan);
    const hours = Math.floor(totals.seconds / 3600);
    const minutes = Math.floor(totals.seconds % 3600 / 60);
    const seconds = totals.seconds % 60;
    result.innerHTML = `<div><span>POINTS</span><strong>${totals.points.toLocaleString()}</strong></div><div><span>ENERGY</span><strong>${totals.energy.toLocaleString()}</strong></div><div><span>TOTAL TIME</span><strong>${hours.toLocaleString()}h ${minutes}m ${seconds}s</strong></div>`;
  } catch (error) {
    result.textContent = error.message;
    result.classList.add("battle-error");
    return;
  }
  result.classList.remove("battle-error");
}

$("battle-plans").addEventListener("input", event => {
  const section = event.target.closest("[data-plan]");
  if (section) renderBattle(section);
});
$("battle-plans").addEventListener("change", event => {
  const input = event.target;
  const section = input.closest("[data-plan]");
  if (!section || !input.matches("[data-field]")) return;
  if (!input.validity.valid) {
    notify(input.dataset.field === "seconds" ? "Seconds must be a whole number from 0 to 59." : "Enter whole numbers from 0 to 1,000,000.", true);
    render();
    return;
  }
  const kind = section.dataset.plan;
  const battlePlans = structuredClone(state.battlePlans);
  battlePlans[kind][input.dataset.field] = input.value === "" ? 0 : Number(input.value);
  save({ ...state, battlePlans }, `${kind === "event" ? "Event" : "Tournament"} plan saved on this device.`);
});

$("battle-plans").addEventListener("input", event => {
  const section = event.target.closest("[data-summon-plan]");
  if (!section || !event.target.matches("[data-summon-field]")) return;
  let total = 0;
  let valid = true;
  for (const row of section.querySelectorAll("[data-summon-type]")) {
    const inputs = row.querySelectorAll("input");
    const rowValid = Array.from(inputs).every(input => input.validity.valid);
    if (!rowValid) {
      row.querySelector("output").textContent = "Invalid";
      valid = false;
      continue;
    }
    const value = T.summonRowPoints({ pulls: Number(inputs[0].value || 0), points: Number(inputs[1].value || 0) });
    row.querySelector("output").textContent = value.toLocaleString();
    total += value;
  }
  $(`${section.dataset.summonPlan}-summon-total`).textContent = valid ? total.toLocaleString() : "Invalid input";
});
$("battle-plans").addEventListener("change", event => {
  const input = event.target;
  const section = input.closest("[data-summon-plan]");
  if (!section || !input.matches("[data-summon-field]")) return;
  if (!input.validity.valid) {
    notify("Summon inputs must be whole numbers from 0 to 1,000,000.", true);
    render();
    return;
  }
  const summonPlans = structuredClone(state.summonPlans);
  const type = input.closest("[data-summon-type]").dataset.summonType;
  summonPlans[section.dataset.summonPlan][type][input.dataset.summonField] = input.value === "" ? 0 : Number(input.value);
  save({ ...state, summonPlans }, "Summon plan saved on this device.");
});

try {
  storedSnapshot = trackerStorage.getItem(STORAGE_KEY);
  if (storedSnapshot !== null) state = T.validateState(JSON.parse(storedSnapshot));
} catch (error) {
  loadFailed = true;
  notify(`Could not load saved data: ${error.message}. Your saved data has not been overwritten; import a backup in Administration or resolve the storage issue before making changes.`, true);
}
initClan();
render();



function clanToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderClan() {
  const summary = T.clanSummary(state.clanBoss, clanToday(), Number($("clan-period").value), $("clan-difficulty").value);
  const format = number => number.toLocaleString(undefined, { maximumFractionDigits: 2 });
  const metrics = Object.entries(T.clanRewards).map(([key, label]) => {
    const total = summary.totals[key];
    const average = summary.averages[key];
    const coverage = key === "epicBooks" ? `<small>Known total · ${summary.epicRecordedDays} of ${summary.recordedDays} days have complete Epic book data</small>` : "";
    const display = key === "epicBooks" && !summary.epicKnownRows ? "—" : format(total);
    return `<div class="clan-metric"><span>${label}</span><strong>${display}</strong><small>${average === null ? "No recorded days" : `${format(average.day)} / day · ${format(average.week)} / 7 days · ${format(average.month)} / 30 days`}</small>${coverage}</div>`;
  }).join("");
  const incomplete = summary.partialDays ? ` · ${summary.partialDays} incomplete ${summary.partialDays === 1 ? "day" : "days"} included` : "";
  $("clan-summary").innerHTML = `<p class="clan-count">${summary.recordedDays} recorded ${summary.recordedDays === 1 ? "day" : "days"} · ${summary.chests} chests${incomplete}</p><div class="clan-metrics">${metrics}</div>`;
  const records = [...state.clanBoss].sort((a, b) => b.date.localeCompare(a.date));
  $("clan-history").innerHTML = records.length ? records.map(record => {
    const rows = Object.entries(record.difficulties);
    const partial = rows.length !== 4 || rows.some(([, row]) => row.chests !== 2);
    const details = rows.map(([key, row]) => `${T.clanDifficulties[key]} (${row.chests} ${row.chests === 1 ? "chest" : "chests"}): ${row.books} legendary books, ${row.epicBooks === null ? "unknown" : row.epicBooks} epic books, ${row.sacred} sacred, ${row.void} void, ${row.ancient} ancient`).join(" · ");
    return `<div class="clan-history-row"><div><strong>${record.date}${partial ? " · Incomplete" : ""}</strong><p>${details}</p></div><div class="clan-history-actions"><button type="button" class="button button-quiet" data-clan-edit="${record.date}">Edit</button><button type="button" class="button button-quiet" data-clan-delete="${record.date}">Delete</button></div></div>`;
  }).join("") : '<p class="section-copy">No reward days recorded yet.</p>';
}

function populateClanForm() {
  const date = $("clan-date").value;
  const record = state.clanBoss.find(item => item.date === date);
  $("clan-form-note").textContent = record
    ? "Editing the saved entry for this date. Unchecked difficulties remain unrecorded."
    : "Two chests per difficulty are preselected; check your actual rewards before saving.";
  $("clan-form-error").textContent = "";
  $("clan-rows").innerHTML = Object.entries(T.clanDifficulties).map(([key, name]) => {
    const row = record ? record.difficulties[key] : { chests: 2, books: 0, epicBooks: 0, sacred: 0, void: 0, ancient: 0 };
    const fields = ["chests", ...Object.keys(T.clanRewards)].map(field => {
      const label = field === "chests" ? "chests" : T.clanRewards[field];
      const value = row ? row[field] : field === "chests" ? 2 : 0;
      return `<td><input type="number" data-clan-field="${field}" aria-label="${name} ${label}" min="${field === "chests" ? 1 : 0}" max="${field === "chests" ? 2 : 1000}" step="1" value="${value === null ? "" : value}"${field === "epicBooks" ? ' placeholder="Unknown"' : " required"}${row ? "" : " disabled"}></td>`;
    }).join("");
    return `<tr data-clan-row="${key}"><td><input type="checkbox" data-clan-include aria-label="Record ${name}"${row ? " checked" : ""}></td><th scope="row">${name}</th>${fields}</tr>`;
  }).join("");
}

function openClanForm(date) {
  $("clan-date").max = clanToday();
  $("clan-date").value = date;
  populateClanForm();
  $("clan-dialog").showModal();
}

function initClan() {
$("clan-new").addEventListener("click", () => openClanForm(clanToday()));
$("clan-close").addEventListener("click", () => $("clan-dialog").close());
$("clan-cancel").addEventListener("click", () => $("clan-dialog").close());
$("clan-date").addEventListener("change", populateClanForm);
for (const id of ["clan-period", "clan-difficulty"]) $(id).addEventListener("change", renderClan);
$("clan-rows").addEventListener("change", event => {
  if (!event.target.matches("[data-clan-include]")) return;
  for (const input of event.target.closest("tr").querySelectorAll("[data-clan-field]")) input.disabled = !event.target.checked;
});
$("clan-form").addEventListener("submit", event => {
  event.preventDefault();
  try {
    const date = $("clan-date").value;
    if (date > clanToday()) throw new Error("The reward date cannot be in the future.");
    const difficulties = {};
    for (const row of $("clan-rows").querySelectorAll("[data-clan-row]")) {
      if (!row.querySelector("[data-clan-include]").checked) continue;
      difficulties[row.dataset.clanRow] = Object.fromEntries([...row.querySelectorAll("[data-clan-field]")].map(input => [input.dataset.clanField, input.dataset.clanField === "epicBooks" && input.value === "" ? null : Number(input.value)]));
    }
    const record = T.validateClanRecord({ date, difficulties });
    const clanBoss = state.clanBoss.filter(item => item.date !== date);
    clanBoss.push(record);
    if (save({ ...state, clanBoss }, "Demon Lord rewards saved.")) $("clan-dialog").close();
    else $("clan-form-error").textContent = "Could not save your rewards. Check the storage error in the header after closing this dialog.";
  } catch (error) {
    $("clan-form-error").textContent = error.message;
  }
});
$("clan-history").addEventListener("click", event => {
  const edit = event.target.closest("[data-clan-edit]");
  const remove = event.target.closest("[data-clan-delete]");
  if (edit) openClanForm(edit.dataset.clanEdit);
  if (remove && window.confirm(`Delete all recorded Demon Lord rewards for ${remove.dataset.clanDelete}?`)) {
    save({ ...state, clanBoss: state.clanBoss.filter(record => record.date !== remove.dataset.clanDelete) }, "Reward day deleted.");
  }
});
}

}
