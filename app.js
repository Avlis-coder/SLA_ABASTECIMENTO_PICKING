"use strict";

const data = globalThis.PICKING_DATA;
const view = document.querySelector("#view");
if (!data) {
  view.innerHTML = '<p class="notice" role="alert">A base do painel não pôde ser carregada.</p>';
  throw new Error("Dados do painel indisponíveis");
}

const { maps, items, meta } = data;
const mapById = new Map(maps.map(map => [map.id, map]));
const categoryNames = new Map(items.map(item => [item.categoryId, item.category]));
const labelCount = new Map();
for (const name of categoryNames.values()) labelCount.set(name, (labelCount.get(name) ?? 0) + 1);
const categoryName = id => {
  const name = categoryNames.get(id) ?? "Sem categoria";
  return labelCount.get(name) > 1 ? `${name} (${id})` : name;
};
const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
const integer = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 2 });
const count = n => integer.format(n);
const percent = (a, b) => b ? percentage.format(a / b) : "—";
const monthName = (key, style = "long") => {
  const date = new Date(`${key}-01T12:00:00Z`);
  const label = new Intl.DateTimeFormat("pt-BR", { month: style, year: "numeric", timeZone: "UTC" }).format(date);
  return label[0].toUpperCase() + label.slice(1);
};
const day = value => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const timestamp = value => value ? `${day(value)} ${value.slice(11, 19)}` : "—";
const monthKeys = [...new Set(maps.map(map => map.created.slice(0, 7)))].sort();
const types = { automatic: "Automático", picking: "Picking individual", other: "Outro tipo" };
const typeName = type => types[type] ?? "Sem tipo";
const itemLabels = { stocked: "Estocado", notFound: "Não encontrado", pending: "Pendente" };
const slaLabels = {
  onTime: "Concluído no prazo",
  late: "Concluído com atraso",
  openOnTime: "Pendente no prazo",
  openLate: "Pendente vencido",
  canceled: "Cancelado",
  unmeasurable: "Sem medição",
};
const slaOrder = Object.keys(slaLabels);
const slaKey = map => map?.status === "canceled" ? "canceled" : map?.sla ?? "unmeasurable";
const linkedMap = item => mapById.get(item.mapId);
const filters = Object.fromEntries(["month", "type", "category", "operator"].map(key => [key, document.querySelector(`#${key}`)]));
const state = { view: "overview", status: "", query: "", mapId: "", sku: "", itemMode: "lines", page: 1, rank: "total" };
const pageSize = 25;
const html = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const folded = value => String(value ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const opNames = [...new Set(maps.map(map => map.operator).filter(Boolean))].sort(collator.compare);
const mapTypes = [...new Set(maps.map(map => map.type).filter(Boolean))];
const categories = [...categoryNames.keys()].map(key => [key, categoryName(key)]).sort((a, b) => collator.compare(a[1], b[1]));
const filterNames = { month: "Mês de criação", type: "Tipo de mapa", category: "Categoria", operator: "Operador" };
const detailPages = {
  maps: { slug: "mapas", label: "Mapas" },
  items: { slug: "itens", label: "Itens" },
  categories: { slug: "categorias", label: "Categorias" },
  months: { slug: "mensal", label: "Por mês" },
  operators: { slug: "operadores", label: "Operadores" },
  types: { slug: "tipos", label: "Tipos de mapa" },
};

function optionList(element, values) {
  for (const [id, label] of values) element.add(new Option(label, id));
}

optionList(filters.month, monthKeys.map(key => [key, monthName(key)]));
optionList(filters.type, mapTypes.map(key => [key, typeName(key)]));
optionList(filters.category, categories);
optionList(filters.operator, opNames.map(name => [name, name]));
document.querySelector("#base-period").textContent = `${day(meta.from)} a ${day(meta.to)}`;
document.querySelector("#cutoff").textContent = `${meta.location} · Depósito ${meta.warehouse} · Corte em ${timestamp(meta.asOf)}`;

const box = "M12 3 4 7.5v9l8 4.5 8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9";
const icons = {
  sla: "M12 3 4.5 6v5c0 4.1 2.6 7.8 7.5 10 4.9-2.2 7.5-5.9 7.5-10V6L12 3Zm-3.2 8.9 2.1 2.1 4.3-4.4",
  maps: "M7 5h10l3 3v12H4V5h3Zm2 4h6m-6 4h6m-6 4h4",
  requests: box,
  stocked: "M4 12l5 5L20 6",
  notFound: "M12 8v5m0 3v.01M10.3 4.8 3.5 17a1.4 1.4 0 0 0 1.2 2h14.6a1.4 1.4 0 0 0 1.2-2L13.7 4.8a2 2 0 0 0-3.4 0Z",
  average: "M4 19h16M7 15v-4m5 4V6m5 9V9",
};

const activeFilters = document.querySelector("#active-filters");
const categoryPicker = document.createElement("div");
categoryPicker.className = "category-picker";
categoryPicker.innerHTML = `
  <button type="button" class="button category-trigger" aria-labelledby="category-label category-value" aria-expanded="false" aria-controls="category-popover">
    <span id="category-value">Todas as categorias</span><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </button>
  <div class="category-popover" id="category-popover" hidden>
    <label for="category-search">Buscar categoria</label>
    <input id="category-search" type="search" placeholder="Nome ou código" autocomplete="off">
    <p class="category-results-count" role="status"></p>
    <div class="category-options" role="group" aria-label="Categorias disponíveis"></div>
  </div>`;
filters.category.after(categoryPicker);
filters.category.hidden = true;
const categoryTrigger = categoryPicker.querySelector(".category-trigger");
const categoryPopover = categoryPicker.querySelector(".category-popover");
const categorySearch = categoryPicker.querySelector("#category-search");
const categoryResults = categoryPicker.querySelector(".category-options");

function renderCategoryOptions() {
  const query = folded(categorySearch.value.trim());
  const matches = categories.filter(([key, label]) => !query || folded(label).includes(query) || key.includes(query));
  const options = query ? matches : [["", "Todas as categorias"], ...matches];
  categoryPicker.querySelector(".category-results-count").textContent =
    matches.length === 1 ? "1 categoria" : `${count(matches.length)} categorias`;
  categoryResults.innerHTML = options.map(([key, label]) =>
    `<button type="button" class="category-option" data-category-option="${html(key)}" aria-pressed="${filters.category.value === key}">${html(label)}</button>`
  ).join("") || '<p class="empty">Nenhuma categoria encontrada.</p>';
  categoryResults.scrollTop = 0;
}

function toggleCategoryPicker(open, restoreFocus = false) {
  categoryPopover.hidden = !open;
  categoryTrigger.setAttribute("aria-expanded", String(open));
  if (open) {
    categorySearch.value = "";
    renderCategoryOptions();
    categorySearch.focus();
  } else if (restoreFocus) categoryTrigger.focus();
}

function refreshFilters() {
  filterNames.month = state.view === "productivity" ? "Mês de finalização" : "Mês de criação";
  document.querySelector("#month-label").textContent = filterNames.month;
  categoryPicker.querySelector("#category-value").textContent = filters.category.selectedOptions[0].textContent;
  const applied = Object.entries(filters).filter(([, input]) => input.value);
  activeFilters.innerHTML = applied.map(([key, input]) => {
    const label = input.selectedOptions[0].textContent;
    return `<button type="button" class="filter-chip" data-remove-filter="${key}" aria-label="${html(`Remover filtro ${filterNames[key]} ${label}`)}"><span>${filterNames[key]} · ${html(label)}</span><span aria-hidden="true">×</span></button>`;
  }).join("") || '<span class="filter-empty">Todos os dados do período</span>';
}

categoryTrigger.addEventListener("click", () => toggleCategoryPicker(categoryPopover.hidden));
categorySearch.addEventListener("input", renderCategoryOptions);
categoryResults.addEventListener("click", event => {
  const option = event.target.closest("[data-category-option]");
  if (!option) return;
  filters.category.value = option.dataset.categoryOption;
  toggleCategoryPicker(false, true);
  filters.category.dispatchEvent(new Event("change"));
});
categoryPicker.addEventListener("keydown", event => {
  if (categoryPopover.hidden) return;
  if (event.key === "Escape") {
    event.preventDefault();
    toggleCategoryPicker(false, true);
  }
  const options = [...categoryResults.querySelectorAll(".category-option")];
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const current = options.indexOf(event.target);
    const next = event.key === "ArrowDown" ? options[current + 1] : options[current - 1] ?? categorySearch;
    next?.focus();
  }
  if (event.key === "Enter" && event.target === categorySearch && categorySearch.value.trim() && options.length === 1) {
    event.preventDefault();
    options[0].click();
  }
});
document.addEventListener("pointerdown", event => {
  if (!categoryPopover.hidden && !categoryPicker.contains(event.target)) toggleCategoryPicker(false);
});
document.addEventListener("focusin", event => {
  if (!categoryPopover.hidden && !categoryPicker.contains(event.target)) toggleCategoryPicker(false);
});
activeFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-remove-filter]");
  if (!button) return;
  const key = button.dataset.removeFilter;
  filters[key].value = "";
  filters[key].dispatchEvent(new Event("change"));
  (key === "category" ? categoryTrigger : filters[key]).focus();
});

function selection(byCompletion = false) {
  const month = filters.month.value;
  const type = filters.type.value;
  const category = filters.category.value;
  const operator = filters.operator.value;
  const mapScope = maps.filter(map => (!byCompletion || (map.status === "stocked" && map.finished)) &&
    (!month || (byCompletion ? map.finished : map.created).startsWith(month)) &&
    (!type || map.type === type) && (!operator || map.operator === operator));
  const ids = new Set(mapScope.map(map => map.id));
  const includeOrphans = !byCompletion && !month && !type && !operator;
  const selectedItems = items.filter(item => (!category || item.categoryId === category) && (ids.has(item.mapId) || (includeOrphans && !linkedMap(item))));
  const itemMapIds = new Set(selectedItems.map(item => item.mapId));
  return { maps: category ? mapScope.filter(map => itemMapIds.has(map.id)) : mapScope, items: selectedItems };
}

function summarize(scope) {
  const sla = Object.fromEntries(slaOrder.map(key => [key, 0]));
  const itemCounts = { stocked: 0, notFound: 0, pending: 0 };
  let linked = 0;
  for (const map of scope.maps) sla[slaKey(map)]++;
  for (const item of scope.items) {
    itemCounts[item.status]++;
    if (linkedMap(item)) linked++;
  }
  return { ...itemCounts, ...sla, linked, total: scope.items.length, maps: scope.maps.length, measured: sla.onTime + sla.late };
}

function group(rows, key) {
  const buckets = new Map();
  for (const row of rows) {
    const id = key(row);
    if (!buckets.has(id)) buckets.set(id, []);
    buckets.get(id).push(row);
  }
  return buckets;
}

function metric(key, name, value, note) {
  return `<article class="metric ${key}"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="${icons[key]}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>${name}</div><strong>${value}</strong><small>${note}</small></article>`;
}

function pill(key, labels) {
  return `<span class="pill ${key}">${labels[key] ?? "Sem informação"}</span>`;
}

function section(title, caption = "") {
  return `<div class="section-heading"><h2>${title}</h2><p>${caption}</p></div>`;
}

function cell(value, classes = "") {
  return `<td class="${classes}">${value}</td>`;
}

function row(cells) {
  return `<tr>${cells.join("")}</tr>`;
}

function num(value) {
  return cell(count(value), "num");
}

function table(columns, rows, empty = "Nenhum registro para os filtros selecionados.") {
  const headers = columns.map(([label, isNumeric]) => `<th scope="col" class="${isNumeric ? "num" : ""}">${label}</th>`).join("");
  const body = rows.join("") || `<tr><td colspan="${columns.length}"><p class="empty">${empty}</p></td></tr>`;
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Tabela de resultados"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function action(text, name, value, label = text) {
  return `<button type="button" class="text-button" data-${name}="${html(value)}" aria-label="${html(label)}">${html(text)}</button>`;
}

function scopeByMonth(scope) {
  const groupedMaps = group(scope.maps, map => map.created.slice(0, 7));
  const groupedItems = group(scope.items.filter(linkedMap), item => linkedMap(item).created.slice(0, 7));
  return monthKeys.filter(key => !filters.month.value || key === filters.month.value).map(key => ({
    key,
    ...summarize({ maps: groupedMaps.get(key) ?? [], items: groupedItems.get(key) ?? [] }),
  }));
}

function monthlyChart(scope) {
  const stats = scopeByMonth(scope);
  if (!stats.some(stat => stat.measured)) return '<p class="empty">Sem mapas concluídos no recorte.</p>';
  const y = share => 159 - share * 126;
  const x = index => 54 + (index + .5) * 480 / stats.length;
  const grid = [0, .25, .5, .75, 1].map(share => {
    const pos = y(share);
    return `<line x1="54" y1="${pos}" x2="534" y2="${pos}"/><text x="46" y="${pos + 4}" text-anchor="end">${share * 100}%</text>`;
  }).join("");
  const trend = stats.map((stat, index) => stat.measured
    ? `${stats[index - 1]?.measured ? "L" : "M"}${x(index)} ${y(stat.onTime / stat.measured)}` : "").join(" ");
  const fill = stats.length > 1 && stats.every(stat => stat.measured)
    ? `<path class="chart-area" fill="url(#sla-fill)" d="${trend} L${x(stats.length - 1)} 159 L${x(0)} 159 Z"/>` : "";
  const points = stats.map((stat, index) => {
    const label = monthName(stat.key, "short").replace(" de ", "/").replace(".", "");
    const pos = y(stat.onTime / stat.measured);
    const point = stat.measured ? `<circle class="chart-point" cx="${x(index)}" cy="${pos}" r="5"><title>${html(label)} · ${count(stat.onTime)} de ${count(stat.measured)} no prazo</title></circle><text class="chart-value" x="${x(index)}" y="${pos - 12}" text-anchor="middle">${percent(stat.onTime, stat.measured)}</text>` : "";
    return `${point}<text x="${x(index)}" y="183" text-anchor="middle">${html(label)}</text>`;
  }).join("");
  const alt = stats.map(stat => `${monthName(stat.key)}, ${stat.measured ? `${percent(stat.onTime, stat.measured)} no prazo` : "sem mapas concluídos"}`).join(". ");
  return `<div class="chart-wrap"><svg viewBox="0 0 550 194" class="chart" role="img" aria-label="${html(alt)}"><defs><linearGradient id="sla-fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity=".02"/></linearGradient></defs>${grid}${fill}<path class="chart-trend" d="${trend}"/>${points}</svg></div>`;
}

function categoryStats(scope) {
  return [...group(scope.items, item => item.categoryId)].map(([key, rows]) => ({ key, ...summarize({ maps: [], items: rows }) }));
}

function orderedCategories(stats, key) {
  return [...stats].sort((a, b) => b[key] - a[key] || b.total - a.total || collator.compare(categoryName(a.key), categoryName(b.key)));
}

function categoryComparison(stats) {
  const top = orderedCategories(stats, "total").slice(0, 5);
  const bars = top.map(stat => {
    const name = categoryName(stat.key);
    const label = `${name}. ${count(stat.total)} itens, ${count(stat.stocked)} abastecidos. Ver itens.`;
    const series = [["requests", stat.total], ["stocked", stat.stocked]].map(([tone, value]) =>
      `<span class="compare-series"><span class="bar-track ${tone}"><span style="width:${value / top[0].total * 100}%"></span></span><strong>${count(value)}</strong></span>`
    ).join("");
    return `<button type="button" class="compare-row" data-category-choice="${html(stat.key)}" aria-label="${html(label)}"><span class="rank-name">${html(name)}</span><span class="compare-bars" aria-hidden="true">${series}</span><span class="compare-action">Ver itens</span></button>`;
  }).join("");
  return `<article class="card">
    <div class="comparison-head"><div><h3>Categorias mais solicitadas</h3><p class="description">Cinco categorias com maior volume de itens.</p></div><button type="button" class="button" data-more-categories="yes">Ver mais categorias</button></div>
    ${bars ? `<div class="chart-legend"><span><i class="dot requests"></i>Quantidade de itens</span><span><i class="dot stocked"></i>Itens abastecidos</span></div><div class="comparison-rows">${bars}</div>` : '<p class="empty">Sem dados para este recorte.</p>'}
  </article>`;
}

function typeTable(scope) {
  const groupedMaps = group(scope.maps, map => map.type);
  const groupedItems = group(scope.items.filter(linkedMap), item => linkedMap(item).type);
  const rows = [...groupedMaps].map(([key, rows]) => {
    const stat = summarize({ maps: rows, items: groupedItems.get(key) ?? [] });
    return row([cell(action(typeName(key), "type-choice", key), "emph"), num(stat.maps), num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.onTime), num(stat.late), cell(percent(stat.onTime, stat.measured), "num emph")]);
  });
  return `${section("Tipos de mapa", "Tipo identificado pela descrição do mapa")}
    <article class="card table-card"><div class="table-head"><div><h3>Volumes e SLA por tipo</h3><p class="description">Selecione um tipo para abrir os mapas correspondentes.</p></div></div>${table([["Tipo"], ["Mapas", 1], ["Qtd. de itens", 1], ["Itens abastecidos", 1], ["Itens não encontrados", 1], ["Mapas no prazo", 1], ["Mapas com atraso", 1], ["% no prazo", 1]], rows)}</article>`;
}

function overview(scope) {
  const stat = summarize(scope);
  const statusRows = slaOrder.filter(key => key !== "unmeasurable" || stat[key]).map(key => `<button type="button" class="sla-line" data-sla-choice="${key}"><i class="dot ${key}"></i><span>${slaLabels[key]}</span><strong>${count(stat[key])}</strong></button>`).join("");
  const average = stat.maps ? decimal.format(stat.linked / stat.maps) : "—";
  return `${section("Indicadores de abastecimento", "SLA de 24 horas corridas")}
    <div class="kpis">
      ${metric("sla", "Cumprimento do SLA", percent(stat.onTime, stat.measured), `${count(stat.onTime)} de ${count(stat.measured)} mapas no prazo`)}
      ${metric("maps", "Mapas de abastecimento", count(stat.maps), `${count(stat.measured)} concluídos com medição`)}
      ${metric("requests", "Quantidade de itens", count(stat.total), `${count(stat.pending)} itens pendentes`)}
      ${metric("stocked", "Quantidade de itens abastecidos", count(stat.stocked), `${percent(stat.stocked, stat.total)} do total de itens`)}
      ${metric("notFound", "Quantidade de itens não encontrados", count(stat.notFound), `${percent(stat.notFound, stat.total)} do total de itens`)}
      ${metric("average", "Média de itens por mapa", average, `${count(stat.linked)} itens vinculados a mapas`)}
    </div>
    <div class="grid overview-grid">
      <article class="card">
        <h3>Situação dos mapas</h3><p class="description">Selecione uma situação para ver os mapas.</p>
        <div class="sla-lines">${statusRows}</div>
      </article>
      <article class="card"><div class="comparison-head"><div><h3>Cumprimento do SLA por mês</h3><p class="description">% de mapas concluídos no prazo, pelo mês de criação</p></div><button type="button" class="button" data-detail-view="months">Ver mês a mês</button></div>${monthlyChart(scope)}</article>
    </div>
    <div class="overview-insights">${categoryComparison(categoryStats(scope))}</div>`;
}

function monthsView(scope) {
  const stats = scopeByMonth(scope);
  const rows = stats.map(stat => row([
    cell(action(monthName(stat.key), "month-choice", stat.key), "emph nowrap"),
    num(stat.maps), num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending),
    cell(stat.maps ? decimal.format(stat.linked / stat.maps) : "—", "num"),
    num(stat.onTime), num(stat.late), num(stat.openOnTime), num(stat.openLate), num(stat.canceled),
    cell(percent(stat.onTime, stat.measured), "num emph"),
  ]));
  return `${section("Resultados por mês", "Mês de criação do mapa")}
    <p class="notice">Agosto e novembro têm cobertura parcial. As ${count(meta.quality.orphanItems)} linhas sem mapa na base ficam no total geral de itens, com mês desconhecido.</p>
    <article class="card table-card"><div class="table-head"><div><h3>Volumes e SLA por mês</h3><p class="description">Selecione um mês na tabela para ver o recorte em todo o painel.</p></div></div>
    ${table([["Mês"], ["Mapas", 1], ["Qtd. de itens", 1], ["Itens abastecidos", 1], ["Itens não encontrados", 1], ["Itens pendentes", 1], ["Itens por mapa", 1], ["Concl. no prazo", 1], ["Concl. com atraso", 1], ["Pend. no prazo", 1], ["Pend. vencidos", 1], ["Cancelados", 1], ["% no prazo", 1]], rows)}</article>`;
}

function operatorsView(scope) {
  const byMap = group(scope.maps, map => map.operator);
  const byItem = group(scope.items.filter(linkedMap), item => linkedMap(item).operator);
  const stats = [...byMap].map(([name, rows]) => ({ name, ...summarize({ maps: rows, items: byItem.get(name) ?? [] }) })).sort((a, b) => b.total - a.total);
  const rows = stats.map(stat => row([
    cell(action(stat.name || "Sem operador informado", "operator-choice", stat.name), "emph"),
    num(stat.maps), num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending),
    cell(stat.maps ? decimal.format(stat.total / stat.maps) : "—", "num"),
    num(stat.onTime), num(stat.late), num(stat.openOnTime), num(stat.openLate), num(stat.canceled),
    cell(percent(stat.onTime, stat.measured), "num emph"),
  ]));
  const orphan = scope.items.length - scope.items.filter(linkedMap).length;
  return `${section("Resultados por operador", "Operador registrado no campo Estoquista do mapa")}
    ${orphan ? `<p class="notice">${count(orphan)} linhas sem mapa na base ficam sem atribuição a operador.</p>` : ""}
    <article class="card table-card"><div class="table-head"><div><h3>Itens atribuídos e abastecidos</h3><p class="description">Itens atribuídos contam as linhas de todos os mapas do operador no recorte.</p></div></div>
    ${table([["Operador"], ["Mapas", 1], ["Itens atribuídos", 1], ["Itens abastecidos", 1], ["Itens não encontrados", 1], ["Itens pendentes", 1], ["Itens por mapa", 1], ["Concl. no prazo", 1], ["Concl. com atraso", 1], ["Pend. no prazo", 1], ["Pend. vencidos", 1], ["Cancelados", 1], ["% no prazo", 1]], rows)}</article>`;
}

function searchControl(label, placeholder) {
  return `<label><span>${label}</span><input id="detail-query" type="search" value="${html(state.query)}" placeholder="${placeholder}"></label>`;
}

function selectControl(id, label, options, selected) {
  return `<label><span>${label}</span><select id="${id}">${Object.entries(options).map(([key, text]) => `<option value="${key}"${selected === key ? " selected" : ""}>${text}</option>`).join("")}</select></label>`;
}

function pageTable(columns, records, build) {
  const pages = Math.max(1, Math.ceil(records.length / pageSize));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * pageSize;
  const rows = records.slice(start, start + pageSize).map(build);
  return `${table(columns, rows)}
    <div class="pagination"><span role="status">${records.length ? `${count(start + 1)}–${count(start + rows.length)} de ${count(records.length)}` : "0 registros"}</span>
    <div><button class="button" type="button" data-page="-1"${state.page === 1 ? " disabled" : ""}>Anterior</button><button class="button" type="button" data-page="1"${state.page === pages ? " disabled" : ""}>Próxima</button></div></div>`;
}

function tableFrame(title, subtitle, tools = "") {
  return `<article class="card table-card"><div class="table-head"><div><h3>${title}</h3><p class="description">${subtitle}</p></div><div class="table-tools">${tools}</div></div><div id="detail-results"></div></article>`;
}

function itemModeControl() {
  return `<div class="mode-control" role="group" aria-label="Visualização dos itens">
    <button type="button" class="button" data-item-mode="products" aria-pressed="${state.itemMode === "products"}">Por produto</button>
    <button type="button" class="button" data-item-mode="lines" aria-pressed="${state.itemMode === "lines"}">Por registro</button>
  </div>`;
}

function matches(terms, query) {
  return !query || terms.some(term => folded(term).includes(query));
}

function duration(hours) {
  if (hours == null) return "—";
  const seconds = Math.round(hours * 3600);
  const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${Math.floor(seconds / 3600)}h ${minutes}m ${remainder}s`;
}

function detailResults(scope) {
  const target = document.querySelector("#detail-results");
  const query = folded(state.query.trim());
  if (state.view === "categories") {
    const records = orderedCategories(categoryStats(scope), state.rank).filter(stat => matches([stat.key, categoryName(stat.key)], query));
    target.innerHTML = pageTable([["Categoria"], ["Cód. analítico"], ["Qtd. de itens", 1], ["Itens abastecidos", 1], ["Itens não encontrados", 1], ["Itens pendentes", 1], ["% abastecidos", 1], ["Itens"]], records, stat => row([
      cell(html(categoryName(stat.key)), "emph"), cell(html(stat.key), "nowrap"),
      num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending), cell(percent(stat.stocked, stat.total), "num"),
      cell(action("Ver itens", "category-choice", stat.key, `Ver itens de ${categoryName(stat.key)}`), "nowrap"),
    ]));
  }
  if (state.view === "maps") {
    const byMap = group(scope.items, item => item.mapId);
    const records = scope.maps.filter(map => (!state.status || slaKey(map) === state.status) && matches([map.id, map.operator], query)).sort((a, b) => b.created.localeCompare(a.created));
    target.innerHTML = pageTable([["Mapa"], ["Tipo"], ["Operador"], ["Criação"], ["Finalização"], ["Tempo corrido"], ["SLA de 24 h"], ["Qtd. de itens", 1]], records, map => row([
      cell(action(map.id, "map-choice", map.id), "emph"), cell(html(typeName(map.type))), cell(html(map.operator || "—")),
      cell(timestamp(map.created), "nowrap"), cell(timestamp(map.finished), "nowrap"), cell(duration(map.hours), "nowrap"),
      cell(pill(slaKey(map), slaLabels)), num(byMap.get(map.id)?.length ?? 0),
    ]));
  }
  if (state.view === "items") {
    const scopedItems = scope.items.filter(item => (!state.mapId || String(item.mapId) === state.mapId) && (!state.sku || item.sku === state.sku));
    if (state.itemMode === "products") {
      const products = [...group(scopedItems, item => item.sku)].map(([sku, rows]) => {
        const descriptions = [...group(rows, item => item.product)].filter(([name]) => name)
          .sort((a, b) => b[1].length - a[1].length).map(([name]) => name);
        return { sku, descriptions, ...summarize({ maps: [], items: rows }) };
      }).filter(stat => matches([stat.sku, ...stat.descriptions], query))
        .sort((a, b) => b.total - a.total || b.stocked - a.stocked || collator.compare(a.sku, b.sku));
      target.innerHTML = pageTable([["Cód. MDLog"], ["Produto"], ["Qtd. de itens", 1], ["Itens abastecidos", 1], ["Itens não encontrados", 1], ["Itens pendentes", 1], ["% abastecidos", 1], ["Registros"]], products, stat => row([
        cell(html(stat.sku), "nowrap"), cell(html(stat.descriptions[0] || "—") +
          (stat.descriptions.length > 1 ? '<div class="description">Há variações de descrição nos registros.</div>' : ""), "emph"),
        num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending), cell(percent(stat.stocked, stat.total), "num"),
        cell(action("Ver registros", "product-choice", stat.sku, `Ver registros do produto ${stat.sku}`), "nowrap"),
      ]));
      return;
    }
    const records = scopedItems.filter(item => (!state.status || item.status === state.status) &&
      matches([item.mapId, item.sku, item.product, categoryName(item.categoryId), linkedMap(item)?.operator], query));
    target.innerHTML = pageTable([["Mapa"], ["Cód. MDLog"], ["Produto"], ["Categoria"], ["Operador"], ["Mês do mapa"], ["Situação do item"]], records, item => {
      const map = linkedMap(item);
      return row([
        cell(map ? action(map.id, "show-map", map.id) : html(item.mapId), "emph nowrap"), cell(html(item.sku), "nowrap"),
        cell(html(item.product || "—")), cell(html(categoryName(item.categoryId))), cell(html(map?.operator ?? "Sem mapa na base")),
        cell(map ? html(monthName(map.created.slice(0, 7), "short")) : "Desconhecido", "nowrap"), cell(pill(item.status, itemLabels)),
      ]);
    });
  }
}

const productivity = createProductivityView({ meta, opNames, count, decimal, day, html, table, row, cell, num });

function detailNavigation(tab) {
  const buttons = Object.entries(detailPages).map(([key, page]) =>
    `<button type="button" data-detail-view="${key}"${key === tab ? ' aria-current="page"' : ""}>${page.label}</button>`
  ).join("");
  return `<div class="detail-heading"><p class="eyebrow">CONSULTA OPERACIONAL</p><h2>Detalhamento</h2></div><nav class="detail-tabs" aria-label="Seções do detalhamento">${buttons}</nav>`;
}

function render() {
  refreshFilters();
  const tab = state.view;
  const scope = selection(tab === "productivity");
  let content = "";
  if (tab === "overview") content = overview(scope);
  if (tab === "productivity") content = productivity.render(scope, Object.fromEntries(Object.entries(filters).map(([key, input]) => [key, input.value])));
  if (tab === "months") content = monthsView(scope);
  if (tab === "operators") content = operatorsView(scope);
  if (tab === "types") content = typeTable(scope);
  if (tab === "categories") content = section("Resultados por categoria", "Categorias analíticas da base mercadológica") +
    tableFrame("Volume de itens e abastecimento", "Use Ver itens para comparar os produtos de uma categoria.", searchControl("Buscar categoria", "Nome ou código") +
      selectControl("detail-rank", "Ordenar por", { total: "Maior quantidade de itens", stocked: "Mais itens abastecidos", notFound: "Mais itens não encontrados" }, state.rank));
  if (tab === "maps") content = section("Mapas de abastecimento", "Prazo em horas corridas") +
    tableFrame("Registros de mapas", "Selecione um mapa para ver seus itens.", searchControl("Buscar mapa", "Nº do mapa ou operador") +
      selectControl("detail-status", "Situação no SLA", { "": "Todas as situações", ...slaLabels }, state.status));
  if (tab === "items") {
    const byProduct = state.itemMode === "products";
    const context = filters.category.value ? `Categoria ${html(categoryName(filters.category.value))}` : "Itens do recorte selecionado";
    content = section("Detalhamento dos itens", context) +
      (state.mapId ? `<p class="notice">Exibindo itens do mapa ${html(state.mapId)}. ${action("Mostrar todos os mapas", "clear-map", "yes")}</p>` : "") +
      (state.sku ? `<p class="notice">Exibindo registros do produto ${html(state.sku)}. ${action("Voltar aos produtos", "item-mode", "products")}</p>` : "") +
      itemModeControl() +
      (byProduct
        ? tableFrame("Comparação por produto", "Quantidade de itens e abastecimentos por código MDLog.", searchControl("Buscar produto", "Nome ou código"))
        : tableFrame("Registros de itens", "Uma linha por item na aba Itens da planilha.", searchControl("Buscar item", "Produto, código, mapa ou operador") +
          selectControl("detail-status", "Situação do item", { "": "Todas as situações", ...itemLabels }, state.status)));
  }
  const inDetails = Object.hasOwn(detailPages, tab);
  view.innerHTML = inDetails ? `<section class="details-shell">${detailNavigation(tab)}<div class="detail-body">${content}</div></section>` : content;
  if (["categories", "maps", "items"].includes(tab)) detailResults(scope);
  const mainTab = inDetails ? "details" : tab;
  for (const button of document.querySelectorAll(".tabs [data-view]")) {
    if (button.dataset.view === mainTab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function tabFromLocation() {
  const hash = location.hash;
  if (!hash || hash === "#indicadores") return "overview";
  if (hash === "#produtividade") return "productivity";
  if (hash === "#detalhamento") return "maps";
  return Object.keys(detailPages).find(key => hash === `#detalhamento/${detailPages[key].slug}`);
}

function openView(tab, options = {}, pushRoute = true) {
  Object.assign(state, { view: tab, status: "", query: "", mapId: "", sku: "", itemMode: "lines", page: 1 }, options);
  const hash = tab === "overview" ? "#indicadores" : tab === "productivity" ? "#produtividade" : `#detalhamento/${detailPages[tab].slug}`;
  if (pushRoute && hash !== location.hash) history.pushState(null, "", hash);
  render();
  view.focus({ preventScroll: true });
  if (view.getBoundingClientRect().top < 0) view.scrollIntoView({ block: "start" });
}

document.querySelector("#filters").addEventListener("submit", event => event.preventDefault());
for (const input of Object.values(filters)) input.addEventListener("change", () => {
  state.page = 1;
  state.mapId = "";
  state.sku = "";
  render();
});
document.querySelector("#reset").addEventListener("click", () => {
  for (const input of Object.values(filters)) input.value = "";
  Object.assign(state, { status: "", query: "", mapId: "", sku: "", page: 1, rank: "total" });
  render();
});
document.querySelector(".tabs").addEventListener("click", event => {
  const button = event.target.closest("button[data-view]");
  if (!button) return;
  openView(button.dataset.view === "details" ? "maps" : button.dataset.view);
});
window.addEventListener("popstate", () => {
  const tab = tabFromLocation();
  if (tab && tab !== state.view) openView(tab, {}, false);
});
view.addEventListener("submit", event => {
  if (event.target.id !== "productivity-schedule") return;
  event.preventDefault();
  if (productivity.apply(event.target)) {
    render();
    view.querySelector("#productivity-schedule button[type=submit]")?.focus({ preventScroll: true });
  }
});
view.addEventListener("input", event => {
  if (event.target.id !== "detail-query") return;
  state.query = event.target.value;
  state.page = 1;
  detailResults(selection());
});
view.addEventListener("change", event => {
  if (event.target.id === "detail-status") state.status = event.target.value;
  else if (event.target.id === "detail-rank") state.rank = event.target.value;
  else return;
  state.page = 1;
  detailResults(selection());
});
view.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const target = button.dataset;
  if (target.detailView) openView(target.detailView);
  if (target.slaChoice) openView("maps", { status: target.slaChoice });
  if (target.moreCategories) openView("categories", { rank: "total" });
  if (target.categoryChoice) {
    filters.category.value = target.categoryChoice;
    openView("items", { itemMode: "products" });
  }
  if (target.itemMode) openView("items", { mapId: state.mapId, itemMode: target.itemMode });
  if (target.productChoice) openView("items", { mapId: state.mapId, sku: target.productChoice });
  if (target.operatorChoice) {
    filters.operator.value = target.operatorChoice;
    openView("maps");
  }
  if (target.typeChoice) {
    filters.type.value = target.typeChoice;
    openView("maps");
  }
  if (target.monthChoice) {
    filters.month.value = target.monthChoice;
    openView("overview");
  }
  if (target.mapChoice) openView("items", { mapId: target.mapChoice });
  if (target.showMap) openView("maps", { query: target.showMap });
  if (target.clearMap) openView("items", { itemMode: state.itemMode });
  if (target.page) {
    state.page += Number(target.page);
    detailResults(selection());
    const replacement = view.querySelector(`[data-page="${target.page}"]:not(:disabled)`) ?? view.querySelector("[data-page]:not(:disabled)");
    replacement?.focus({ preventScroll: true });
  }
});

const method = document.querySelector("#metodologia");
document.querySelector(".top-link").addEventListener("click", () => { method.open = true; });
document.querySelector("#method-content").innerHTML = `
  <p><strong>Prazo de 24 horas corridas.</strong> O prazo começa em <em>Criado em</em> e termina em <em>Finalizado em</em>. Até 24 horas, inclusive, conta como no prazo. A taxa divide os concluídos no prazo pelos concluídos com medição. Mapas pendentes são avaliados até ${timestamp(meta.asOf)} (horário de Fortaleza), usando a data de modificação registrada no arquivo. Os cancelados são exibidos separadamente.</p>
  <p><strong>Período e escopo.</strong> Indicadores e Detalhamento usam o mês de criação do mapa. Produtividade usa o mês de finalização. A base cobre ${html(meta.location)}, depósito ${html(meta.warehouse)}, e inclui mapas automáticos e de picking individual. Ao filtrar por categoria, entram os mapas que contêm aquela categoria e o prazo continua sendo o do mapa inteiro.</p>
  <p><strong>Contagem de itens.</strong> A quantidade de itens conta as linhas da aba Itens. “Estocado” indica abastecimento realizado. A média divide as linhas vinculadas pelo número de mapas do recorte. A atribuição por operador vem do campo Estoquista. A exportação não traz a quantidade final estocada e ${count(meta.quality.extremeInputQtyRows)} valores de Qtd. entrada excedem um trilhão. Por isso, os volumes são medidos em linhas de itens.</p>
  <p><strong>Vínculos.</strong> A categoria analítica é cruzada pelo código MDLog. ${count(meta.quality.orphanItems)} linhas não encontradas têm mapa ausente da aba Mapas. Elas entram nos totais de itens e categorias e ficam sem mês, operador ou prazo.</p>
  <p><strong>Detalhamento dos produtos.</strong> A comparação por produto agrupa pelo código MDLog e mostra a descrição mais frequente no recorte. A lista de itens exibe a descrição de cada registro.</p>
  <p><strong>Arquivos de origem.</strong> ${meta.sources.map(html).join(" e ")}.</p>`;

state.view = tabFromLocation() ?? "overview";
render();
