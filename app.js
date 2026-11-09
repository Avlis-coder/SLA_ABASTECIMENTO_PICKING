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

function optionList(element, values) {
  for (const [id, label] of values) element.add(new Option(label, id));
}

optionList(filters.month, monthKeys.map(key => [key, monthName(key)]));
optionList(filters.type, mapTypes.map(key => [key, typeName(key)]));
optionList(filters.category, [...categoryNames.keys()].map(key => [key, categoryName(key)]).sort((a, b) => collator.compare(a[1], b[1])));
optionList(filters.operator, opNames.map(name => [name, name]));
document.querySelector("#base-period").textContent = `${day(meta.from)} a ${day(meta.to)}`;
document.querySelector("#cutoff").textContent = `${meta.location} · Depósito ${meta.warehouse} · Corte em ${timestamp(meta.asOf)}`;

const box = "M12 3 4 7.5v9l8 4.5 8-4.5v-9L12 3ZM4 7.5 12 12l8-4.5M12 12v9";
const icons = {
  maps: "M7 5h10l3 3v12H4V5h3Zm2 4h6m-6 4h6m-6 4h4",
  requests: box,
  stocked: "M4 12l5 5L20 6",
  notFound: "M12 8v5m0 3v.01M10.3 4.8 3.5 17a1.4 1.4 0 0 0 1.2 2h14.6a1.4 1.4 0 0 0 1.2-2L13.7 4.8a2 2 0 0 0-3.4 0Z",
  average: "M4 19h16M7 15v-4m5 4V6m5 9V9",
};

function selection() {
  const month = filters.month.value;
  const type = filters.type.value;
  const category = filters.category.value;
  const operator = filters.operator.value;
  const mapScope = maps.filter(map => (!month || map.created.startsWith(month)) && (!type || map.type === type) && (!operator || map.operator === operator));
  const ids = new Set(mapScope.map(map => map.id));
  const includeOrphans = !month && !type && !operator;
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
  const max = Math.max(0, ...stats.map(stat => stat.measured));
  if (!max) return '<p class="empty">Sem mapas concluídos no recorte.</p>';
  const step = max >= 200 ? 100 : max >= 50 ? 20 : max >= 10 ? 5 : 1;
  const ceiling = Math.ceil(max / (step * 3)) * step * 3;
  const y = n => 164 - n / ceiling * 139;
  const bands = [0, 1, 2, 3].map(n => {
    const amount = ceiling * n / 3;
    return `<line x1="45" y1="${y(amount)}" x2="542" y2="${y(amount)}"/><text x="37" y="${y(amount) + 4}" text-anchor="end">${count(amount)}</text>`;
  }).join("");
  const bars = stats.map((stat, index) => {
    const x = 45 + (index + .5) * 497 / stats.length;
    const label = monthName(stat.key, "short").replace(" de ", "/").replace(".", "");
    const segments = [["onTime", stat.onTime, 0], ["late", stat.late, stat.onTime]].filter(([, amount]) => amount).map(([key, amount, base]) =>
      `<rect class="${key}" x="${x - 27}" y="${y(base + amount)}" width="54" height="${y(base) - y(base + amount)}"><title>${html(label)} · ${slaLabels[key]} · ${count(amount)}</title></rect>`
    ).join("");
    return `${segments}<text class="chart-value" x="${x}" y="${y(stat.measured) - 6}" text-anchor="middle">${count(stat.measured)}</text><text x="${x}" y="185" text-anchor="middle">${html(label)}</text>`;
  }).join("");
  const alt = stats.map(stat => `${monthName(stat.key)}: ${count(stat.onTime)} no prazo e ${count(stat.late)} com atraso`).join(". ");
  return `<div class="chart-wrap"><svg viewBox="0 0 550 194" class="chart" role="img" aria-label="${html(alt)}">${bands}${bars}</svg><div class="chart-legend"><span><i class="dot onTime"></i>No prazo</span><span><i class="dot late"></i>Com atraso</span></div></div>`;
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
    const label = `${name}. ${count(stat.total)} linhas solicitadas, ${count(stat.stocked)} abastecidas. Ver itens.`;
    const series = [["requests", stat.total], ["stocked", stat.stocked]].map(([tone, value]) =>
      `<span class="compare-series"><span class="bar-track ${tone}"><span style="width:${value / top[0].total * 100}%"></span></span><strong>${count(value)}</strong></span>`
    ).join("");
    return `<button type="button" class="compare-row" data-category-choice="${html(stat.key)}" aria-label="${html(label)}"><span class="rank-name">${html(name)}</span><span class="compare-bars" aria-hidden="true">${series}</span><span class="compare-action">Ver itens</span></button>`;
  }).join("");
  return `<article class="card">
    <div class="comparison-head"><div><h3>Categorias mais solicitadas</h3><p class="description">Comparação de solicitações e abastecimentos em linhas de itens.</p></div><button type="button" class="button" data-more-categories="yes">Ver mais categorias</button></div>
    ${bars ? `<div class="chart-legend"><span><i class="dot requests"></i>Solicitadas</span><span><i class="dot stocked"></i>Abastecidas</span></div><div class="comparison-rows">${bars}</div>` : '<p class="empty">Sem dados para este recorte.</p>'}
  </article>`;
}

function typeTable(scope) {
  const groupedMaps = group(scope.maps, map => map.type);
  const groupedItems = group(scope.items.filter(linkedMap), item => linkedMap(item).type);
  const rows = [...groupedMaps].map(([key, rows]) => {
    const stat = summarize({ maps: rows, items: groupedItems.get(key) ?? [] });
    return row([cell(action(typeName(key), "type-choice", key), "emph"), num(stat.maps), num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.onTime), num(stat.late), cell(percent(stat.onTime, stat.measured), "num emph")]);
  });
  return `<article class="card table-card"><div class="table-head"><div><h3>SLA por tipo de mapa</h3><p class="description">Tipo identificado pela descrição do mapa.</p></div></div>${table([["Tipo"], ["Mapas", 1], ["Solicitações", 1], ["Estocadas", 1], ["Não encontradas", 1], ["No prazo", 1], ["Com atraso", 1], ["% no prazo", 1]], rows)}</article>`;
}

function overview(scope) {
  const stat = summarize(scope);
  const categories = categoryStats(scope);
  const statusRows = slaOrder.filter(key => key !== "unmeasurable" || stat[key]).map(key => `<button type="button" class="sla-line" data-sla-choice="${key}"><i class="dot ${key}"></i><span>${slaLabels[key]}</span><strong>${count(stat[key])}</strong></button>`).join("");
  const average = stat.maps ? decimal.format(stat.linked / stat.maps) : "—";
  const share = stat.measured ? stat.onTime / stat.measured * 100 : 0;
  return `${section("Visão geral", "Indicadores do recorte selecionado")}
    <div class="kpis">
      ${metric("maps", "Mapas", count(stat.maps), `${count(stat.measured)} concluídos com medição`)}
      ${metric("requests", "Solicitações", count(stat.total), `${count(stat.pending)} linhas pendentes`)}
      ${metric("stocked", "Abastecidos", count(stat.stocked), `${percent(stat.stocked, stat.total)} das linhas solicitadas`)}
      ${metric("notFound", "Não encontrados", count(stat.notFound), `${percent(stat.notFound, stat.total)} das linhas solicitadas`)}
      ${metric("average", "Itens por mapa", average, `${count(stat.linked)} linhas vinculadas`)}
    </div>
    <div class="grid">
      <article class="card">
        <h3>SLA de 24 horas</h3><p class="description">Da criação à finalização do mapa</p>
        <div class="sla-center">
          <div class="donut ${stat.measured ? "" : "none"}" style="--portion:${share}%"><div class="donut-inner"><strong>${percent(stat.onTime, stat.measured)}</strong><span>no prazo</span></div></div>
          <div class="sla-lines">${statusRows}</div>
        </div>
        <p class="sla-foot">Taxa sobre ${count(stat.measured)} mapas concluídos com medição. Pendentes e cancelados são exibidos à parte.</p>
      </article>
      <article class="card"><h3>Mapas concluídos por mês</h3><p class="description">Distribuição do SLA pelo mês de criação do mapa</p>${monthlyChart(scope)}</article>
    </div>
    ${categoryComparison(categories)}
    <div class="stack">${typeTable(scope)}</div>`;
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
    ${table([["Mês"], ["Mapas", 1], ["Solicitações", 1], ["Estocadas", 1], ["Não encontradas", 1], ["Itens pendentes", 1], ["Itens por mapa", 1], ["Concl. no prazo", 1], ["Concl. com atraso", 1], ["Pend. no prazo", 1], ["Pend. vencidos", 1], ["Cancelados", 1], ["% no prazo", 1]], rows)}</article>`;
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
    ${table([["Operador"], ["Mapas", 1], ["Itens atribuídos", 1], ["Estocados", 1], ["Não encontrados", 1], ["Itens pendentes", 1], ["Itens por mapa", 1], ["Concl. no prazo", 1], ["Concl. com atraso", 1], ["Pend. no prazo", 1], ["Pend. vencidos", 1], ["Cancelados", 1], ["% no prazo", 1]], rows)}</article>`;
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
    <button type="button" class="button" data-item-mode="lines" aria-pressed="${state.itemMode === "lines"}">Por solicitação</button>
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
    target.innerHTML = pageTable([["Categoria"], ["Cód. analítico"], ["Solicitadas", 1], ["Abastecidas", 1], ["Não encontradas", 1], ["Pendentes", 1], ["% abastecidas", 1], ["Itens"]], records, stat => row([
      cell(html(categoryName(stat.key)), "emph"), cell(html(stat.key), "nowrap"),
      num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending), cell(percent(stat.stocked, stat.total), "num"),
      cell(action("Ver itens", "category-choice", stat.key, `Ver itens de ${categoryName(stat.key)}`), "nowrap"),
    ]));
  }
  if (state.view === "maps") {
    const byMap = group(scope.items, item => item.mapId);
    const records = scope.maps.filter(map => (!state.status || slaKey(map) === state.status) && matches([map.id, map.operator], query)).sort((a, b) => b.created.localeCompare(a.created));
    target.innerHTML = pageTable([["Mapa"], ["Tipo"], ["Operador"], ["Criação"], ["Finalização"], ["Tempo corrido"], ["SLA de 24 h"], ["Linhas", 1]], records, map => row([
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
      target.innerHTML = pageTable([["Cód. MDLog"], ["Produto"], ["Solicitadas", 1], ["Abastecidas", 1], ["Não encontradas", 1], ["Pendentes", 1], ["% abastecidas", 1], ["Solicitações"]], products, stat => row([
        cell(html(stat.sku), "nowrap"), cell(html(stat.descriptions[0] || "—") +
          (stat.descriptions.length > 1 ? '<div class="description">Há variações de descrição nas solicitações.</div>' : ""), "emph"),
        num(stat.total), num(stat.stocked), num(stat.notFound), num(stat.pending), cell(percent(stat.stocked, stat.total), "num"),
        cell(action("Ver solicitações", "product-choice", stat.sku, `Ver solicitações do produto ${stat.sku}`), "nowrap"),
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

function render() {
  const scope = selection();
  const tab = state.view;
  if (tab === "overview") view.innerHTML = overview(scope);
  if (tab === "months") view.innerHTML = monthsView(scope);
  if (tab === "operators") view.innerHTML = operatorsView(scope);
  if (tab === "categories") view.innerHTML = section("Resultados por categoria", "Categorias analíticas da base mercadológica") +
    tableFrame("Solicitações e abastecimentos", "Use Ver itens para comparar os produtos de uma categoria.", searchControl("Buscar categoria", "Nome ou código") +
      selectControl("detail-rank", "Ordenar por", { total: "Mais solicitações", stocked: "Mais abastecidos", notFound: "Mais não encontrados" }, state.rank));
  if (tab === "maps") view.innerHTML = section("Detalhamento dos mapas", "Prazo em horas corridas") +
    tableFrame("Mapas de abastecimento", "Selecione um mapa para ver seus itens.", searchControl("Buscar mapa", "Nº do mapa ou operador") +
      selectControl("detail-status", "Situação no SLA", { "": "Todas as situações", ...slaLabels }, state.status));
  if (tab === "items") {
    const byProduct = state.itemMode === "products";
    const context = filters.category.value ? `Categoria ${html(categoryName(filters.category.value))}` : "Itens do recorte selecionado";
    view.innerHTML = section("Detalhamento dos itens", context) +
      (state.mapId ? `<p class="notice">Exibindo itens do mapa ${html(state.mapId)}. ${action("Mostrar todos os mapas", "clear-map", "yes")}</p>` : "") +
      (state.sku ? `<p class="notice">Exibindo solicitações do produto ${html(state.sku)}. ${action("Voltar aos produtos", "item-mode", "products")}</p>` : "") +
      itemModeControl() +
      (byProduct
        ? tableFrame("Comparação por produto", "Linhas solicitadas e abastecidas por código MDLog.", searchControl("Buscar produto", "Nome ou código"))
        : tableFrame("Itens solicitados", "Uma linha por solicitação. A situação vem da aba Itens.", searchControl("Buscar item", "Produto, código, mapa ou operador") +
          selectControl("detail-status", "Situação do item", { "": "Todas as situações", ...itemLabels }, state.status)));
  }
  if (["categories", "maps", "items"].includes(tab)) detailResults(scope);
  for (const button of document.querySelectorAll(".tabs button")) {
    if (button.dataset.view === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
}

function openView(tab, options = {}) {
  Object.assign(state, { view: tab, status: "", query: "", mapId: "", sku: "", itemMode: "lines", page: 1 }, options);
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
  if (button) openView(button.dataset.view);
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
  <p><strong>Período e escopo.</strong> Os meses usam a criação do mapa. A base cobre ${html(meta.location)}, depósito ${html(meta.warehouse)}, e inclui mapas automáticos e de picking individual. Ao filtrar por categoria, entram os mapas que contêm aquela categoria e o prazo continua sendo o do mapa inteiro.</p>
  <p><strong>Contagem de itens.</strong> Cada linha da aba Itens conta como uma solicitação. “Estocado” indica abastecimento realizado. A média divide as linhas vinculadas pelo número de mapas do recorte. A atribuição por operador vem do campo Estoquista. A exportação não traz a quantidade final estocada e ${count(meta.quality.extremeInputQtyRows)} valores de Qtd. entrada excedem um trilhão. Por isso, os volumes são medidos em linhas de itens.</p>
  <p><strong>Vínculos.</strong> A categoria analítica é cruzada pelo código MDLog. ${count(meta.quality.orphanItems)} linhas não encontradas têm mapa ausente da aba Mapas. Elas entram nos totais de itens e categorias e ficam sem mês, operador ou prazo.</p>
  <p><strong>Detalhamento dos produtos.</strong> A comparação por produto agrupa pelo código MDLog e mostra a descrição mais frequente no recorte. A lista de solicitações exibe a descrição de cada registro.</p>
  <p><strong>Arquivos de origem.</strong> ${meta.sources.map(html).join(" e ")}.</p>`;

render();
