const CONFIG = {
  appName: "silvan-tiles",
  sourceReport: "LOCATION_STOCK1",
  fields: {
    item: ["ITEM_NAME", "Item", "Item_Name", "ITEM", "Product", "Product_Name", "SKU"],
    sku: ["SKU", "Item_Code", "ITEM_CODE", "Code"],
    warehouse: ["Warehouse", "Warehouse_Name", "WAREHOUSE", "Godown", "Godown_Name"],
    location: ["Location", "Location_Name", "LOCATION", "Bin", "Rack"],
    batch: ["BATCH_NO", "Batch", "Batch_No", "Batch_Number", "BATCH", "Batch_Name"],
    expiry: ["Expiry_Date", "Expiry", "EXPIRY_DATE"],
    available: ["Available_Stock", "Available_Qty", "Stock", "Quantity", "Qty", "QTY"],
    reserved: ["Reserved_Stock", "Reserved_Qty", "Reserved"],
    uom: ["UOM", "Unit", "Units"],
  },
};

const state = {
  allRows: [],
  loaded: false,
};

const el = {
  form: document.querySelector("#searchForm"),
  search: document.querySelector("#itemSearch"),
  itemResults: document.querySelector("#itemResults"),
  fetchedStatus: document.querySelector("#fetchedStatus"),
  fetchedRecordList: document.querySelector("#fetchedRecordList"),
  stockList: document.querySelector("#stockList"),
  status: document.querySelector("#status"),
  totalAvailable: document.querySelector("#totalAvailable"),
  warehouseCount: document.querySelector("#warehouseCount"),
  locationCount: document.querySelector("#locationCount"),
  batchCount: document.querySelector("#batchCount"),
};

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchRows(el.search.value.trim());
});

el.search.addEventListener("input", debounce(() => {
  searchRows(el.search.value.trim());
}, 350));

setStatus("Loading stock data from LOCATION_STOCK1...");
loadSourceData();

function debounce(fn, wait) {
  let timer;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

async function loadSourceData() {
  try {
    await ZOHO.CREATOR.init();
    state.allRows = await getAllRecords({
      report_name: CONFIG.sourceReport,
      field_config: "all",
      max_records: 1000,
    });
    state.loaded = true;
    resetView("Enter ITEM_NAME to search stock.");
    setStatus("Stock data loaded. Enter ITEM_NAME to view warehouse stock.");
  } catch (error) {
    showError(error, "Unable to load LOCATION_STOCK1 data.");
  }
}

function searchRows(term) {
  resetView("Loading stock rows...");

  if (!state.loaded) {
    setStatus("Loading stock data from LOCATION_STOCK1...");
    return;
  }

  if (!term) {
    resetView("Enter ITEM_NAME to search stock.");
    setStatus("Enter ITEM_NAME to view warehouse, location, and batch stock.");
    return;
  }

  const rows = state.allRows.filter((row) => rowMatchesSearch(row, term));
  renderFetchedRecords(rows, term);
  renderSearchSummary(rows, term);
  renderStock(groupRows(rows));
}

function rowMatchesSearch(row, term) {
  const searchText = term.toLowerCase();
  const itemText = [
    displayByCandidates(row, CONFIG.fields.item, ""),
    displayByCandidates(row, CONFIG.fields.sku, ""),
  ].join(" ").toLowerCase();
  return itemText.includes(searchText);
}

function renderSearchSummary(rows, term) {
  el.itemResults.innerHTML = "";
  const uniqueItems = new Map();

  rows.forEach((row) => {
    const item = displayByCandidates(row, CONFIG.fields.item, "Unnamed item");
    const sku = displayByCandidates(row, CONFIG.fields.sku, "");
    const key = `${item}::${sku}`;
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, { item, sku });
    }
  });

  Array.from(uniqueItems.values()).slice(0, 12).forEach(({ item, sku }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "item-button";
    button.innerHTML = `<span>${escapeHtml(item)}</span><span class="item-code">${escapeHtml(sku)}</span>`;
    button.addEventListener("click", () => {
      el.search.value = sku || item;
      searchRows(sku || item);
    });
    el.itemResults.appendChild(button);
  });

  setStatus(rows.length ? `Showing ${rows.length} Location_Stock rows where ITEM_NAME matches "${term}".` : `No stock rows found for "${term}".`);
}

function renderFetchedRecords(rows, term) {
  el.fetchedRecordList.innerHTML = "";

  if (!rows.length) {
    el.fetchedRecordList.innerHTML = `<tr><td colspan="6" class="matrix-empty">No Location_Stock records found for "${escapeHtml(term)}".</td></tr>`;
    el.fetchedStatus.textContent = `Fetched 0 records for ITEM_NAME "${term}".`;
    return;
  }

  rows.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(displayByCandidates(row, CONFIG.fields.item, "-"))}</td>
      <td>${escapeHtml(displayByCandidates(row, CONFIG.fields.warehouse, "-"))}</td>
      <td>${escapeHtml(displayByCandidates(row, CONFIG.fields.location, "-"))}</td>
      <td>${escapeHtml(displayByCandidates(row, CONFIG.fields.batch, "-"))}</td>
      <td><strong class="stock-number">${numberText(valueByCandidates(row, CONFIG.fields.available))} ${escapeHtml(displayByCandidates(row, CONFIG.fields.uom, ""))}</strong></td>
    `;
    el.fetchedRecordList.appendChild(tr);
  });

  el.fetchedStatus.textContent = `Fetched ${rows.length} Location_Stock record${rows.length === 1 ? "" : "s"} for ITEM_NAME "${term}".`;
}

function groupRows(rows) {
  const warehouses = new Map();

  rows.forEach((row) => {
    const warehouse = displayByCandidates(row, CONFIG.fields.warehouse, "Warehouse not set");
    if (!warehouses.has(warehouse)) {
      warehouses.set(warehouse, { warehouse, rows: [], locations: new Map() });
    }

    const group = warehouses.get(warehouse);
    group.rows.push(row);

    const location = displayByCandidates(row, CONFIG.fields.location, "Location not set");
    const batch = displayByCandidates(row, CONFIG.fields.batch, "Batch not set");
    const expiry = displayByCandidates(row, CONFIG.fields.expiry, "-");
    const available = toNumber(valueByCandidates(row, CONFIG.fields.available));

    if (!group.locations.has(location)) {
      group.locations.set(location, { location, available: 0, batches: new Map() });
    }

    const locationGroup = group.locations.get(location);
    locationGroup.available += available;
    upsertQuantity(locationGroup.batches, `${batch}::${expiry}`, { location, batch, expiry, available });
  });

  return Array.from(warehouses.values());
}

function upsertQuantity(map, key, next) {
  const current = map.get(key);
  if (!current) {
    map.set(key, next);
    return;
  }
  current.available += next.available || 0;
}

async function getAllRecords(config) {
  if (!window.ZOHO?.CREATOR?.DATA?.getRecords) {
    throw new Error("Zoho Creator widget SDK is not available.");
  }

  const rows = [];
  let cursor = "";

  do {
    const request = { ...config };
    if (CONFIG.appName) {
      request.app_name = CONFIG.appName;
    }
    if (cursor) {
      request.record_cursor = cursor;
    }

    const response = await ZOHO.CREATOR.DATA.getRecords(request);
    if (response.code !== 3000) {
      throw new Error(response.message || `Creator API returned code ${response.code}`);
    }

    rows.push(...(response.data || []));
    cursor = response.record_cursor || "";
  } while (cursor);

  return rows;
}

function renderStock(groups) {
  el.stockList.innerHTML = "";

  if (!groups.length) {
    el.stockList.innerHTML = `<tr><td colspan="6" class="matrix-empty">No stock rows found.</td></tr>`;
    updateSummary([]);
    return;
  }

  groups.forEach((group) => {
    const warehouseTotal = sumRows(group.rows, CONFIG.fields.available);
    const uom = displayByCandidates(group.rows[0], CONFIG.fields.uom, "");
    const locationRows = Array.from(group.locations.values());
    const tableRows = buildGroupedTableRows(group, locationRows, warehouseTotal, uom);
    tableRows.forEach((row) => el.stockList.appendChild(row));
  });

  el.stockList.appendChild(renderGrandTotalRow(groups));
  updateSummary(groups);
}

function buildGroupedTableRows(group, locations, warehouseTotal, uom) {
  const rowCount = locations.reduce((count, location) => {
    return count + Math.max(Array.from(location.batches.values()).length, 1);
  }, 0);
  let isFirstWarehouseRow = true;
  const rows = [];

  locations.forEach((location) => {
    const batches = Array.from(location.batches.values());
    const locationRowspan = Math.max(batches.length, 1);
    let isFirstLocationRow = true;

    (batches.length ? batches : [{ batch: "-", available: 0 }]).forEach((batch) => {
      rows.push(renderStockDetailRow({
        warehouse: group.warehouse,
        warehouseTotal,
        warehouseRowspan: rowCount,
        showWarehouse: isFirstWarehouseRow,
        location: location.location,
        locationTotal: location.available,
        locationRowspan,
        showLocation: isFirstLocationRow,
        batch: batch.batch,
        batchTotal: batch.available,
        uom,
      }));
      isFirstWarehouseRow = false;
      isFirstLocationRow = false;
    });
  });

  return rows;
}

function renderStockDetailRow(detail) {
  const row = document.createElement("tr");
  const warehouseCells = detail.showWarehouse ? `
    <td rowspan="${detail.warehouseRowspan}" class="group-cell">
      <strong class="warehouse-title">${escapeHtml(detail.warehouse)}</strong>
    </td>
    <td rowspan="${detail.warehouseRowspan}" class="group-cell">
      <strong class="stock-number">${numberText(detail.warehouseTotal)} ${escapeHtml(detail.uom)}</strong>
    </td>
  ` : "";
  const locationCells = detail.showLocation ? `
    <td rowspan="${detail.locationRowspan}">
      ${escapeHtml(detail.location)}
    </td>
    <td rowspan="${detail.locationRowspan}">
      <strong class="stock-number">${numberText(detail.locationTotal)} ${escapeHtml(detail.uom)}</strong>
    </td>
  ` : "";

  row.innerHTML = `
    ${warehouseCells}
    ${locationCells}
    <td>${escapeHtml(detail.batch)}</td>
    <td><strong class="stock-number">${numberText(detail.batchTotal)} ${escapeHtml(detail.uom)}</strong></td>
  `;
  return row;
}

function renderLocationTable(rows, uom) {
  if (!rows.length) {
    return `<p class="empty">No location stock found.</p>`;
  }

  return `
    <table class="mini-table">
      <thead><tr><th>Location</th><th>Actual Stock</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${escapeHtml(row.location)}</td><td>${numberText(row.available)} ${escapeHtml(uom)}</td></tr>`).join("")}
        <tr class="mini-total"><td>Total</td><td>${numberText(sumValues(rows, "available"))} ${escapeHtml(uom)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderBatchTable(rows, uom) {
  if (!rows.length) {
    return `<p class="empty">No batch stock found.</p>`;
  }

  return `
    <table class="mini-table">
      <thead><tr><th>Location</th><th>Batch</th><th>Batch Stock</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${escapeHtml(row.location)}</td><td>${escapeHtml(row.batch)}</td><td>${numberText(row.available)} ${escapeHtml(uom)}</td></tr>`).join("")}
        <tr class="mini-total"><td colspan="2">Total</td><td>${numberText(sumValues(rows, "available"))} ${escapeHtml(uom)}</td></tr>
      </tbody>
    </table>
  `;
}

function renderGrandTotalRow(groups) {
  const total = groups.reduce((sum, group) => sum + sumRows(group.rows, CONFIG.fields.available), 0);
  const firstRow = groups.find((group) => group.rows.length)?.rows[0];
  const uom = firstRow ? displayByCandidates(firstRow, CONFIG.fields.uom, "") : "";
  const locationTotal = groups.reduce((sum, group) => sum + group.locations.size, 0);
  const batchTotal = groups.reduce((sum, group) => sum + Array.from(group.locations.values()).reduce((locationSum, location) => locationSum + location.batches.size, 0), 0);
  const row = document.createElement("tr");
  row.className = "grand-total-row";
  row.innerHTML = `
    <td>Grand Total</td>
    <td>${numberText(total)} ${escapeHtml(uom)}</td>
    <td>${locationTotal} location${locationTotal === 1 ? "" : "s"}</td>
    <td>${numberText(total)} ${escapeHtml(uom)}</td>
    <td>${batchTotal} batch${batchTotal === 1 ? "" : "es"}</td>
    <td>${numberText(total)} ${escapeHtml(uom)}</td>
  `;
  return row;
}

function updateSummary(groups) {
  const total = groups.reduce((sum, group) => sum + sumRows(group.rows, CONFIG.fields.available), 0);
  const locationTotal = groups.reduce((sum, group) => sum + group.locations.size, 0);
  const batchTotal = groups.reduce((sum, group) => sum + Array.from(group.locations.values()).reduce((locationSum, location) => locationSum + location.batches.size, 0), 0);

  el.totalAvailable.textContent = numberText(total);
  el.warehouseCount.textContent = groups.length;
  el.locationCount.textContent = locationTotal;
  el.batchCount.textContent = batchTotal;
}

function resetView(message = "Loading stock rows...") {
  el.stockList.innerHTML = `<tr><td colspan="6" class="matrix-empty">${escapeHtml(message)}</td></tr>`;
  el.fetchedRecordList.innerHTML = `<tr><td colspan="6" class="matrix-empty">No records fetched yet.</td></tr>`;
  el.fetchedStatus.textContent = "Search an item to view fetched Location_Stock records.";
  updateSummary([]);
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle("error", isError);
}

function showError(error, fallback) {
  console.error(error);
  setStatus(`${fallback} ${error.message || ""}`.trim(), true);
}

function sumRows(rows, candidates) {
  return rows.reduce((sum, row) => sum + toNumber(valueByCandidates(row, candidates)), 0);
}

function sumValues(rows, field) {
  return rows.reduce((sum, row) => sum + toNumber(row[field]), 0);
}

function valueByCandidates(record, candidates) {
  const key = candidates.find((candidate) => Object.prototype.hasOwnProperty.call(record, candidate));
  return key ? record[key] : "";
}

function displayByCandidates(record, candidates, fallback) {
  const raw = valueByCandidates(record, candidates);
  const display = normalizeDisplay(raw);
  return display || fallback;
}

function normalizeDisplay(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return "";
  }
  if (typeof raw === "object") {
    if (Array.isArray(raw)) {
      return raw.map(normalizeDisplay).filter(Boolean).join(", ");
    }
    const directValue = raw.zc_display_value || raw.display_value || raw.name;
    if (directValue) {
      return String(directValue);
    }
    const nestedValue = Object.entries(raw).find(([key, value]) => key !== "ID" && value !== null && value !== undefined && value !== "" && typeof value !== "object");
    return nestedValue ? String(nestedValue[1]) : raw.ID || "";
  }
  return String(raw);
}

function toNumber(raw) {
  const normalized = normalizeDisplay(raw);
  const number = Number(String(normalized || 0).replace(/,/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function numberText(raw) {
  return toNumber(raw).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
