// ===============================
// CONFIG — paste your Apps Script /exec URL
// GET  /exec?mode=catalog  -> { ok:true, catalog:[{item,toBuy,toSell,weBuy}] }
// POST /exec               -> saves order
// ===============================
const ENDPOINT_URL = "PASTE_YOUR_EXEC_URL_HERE";

// ---------- Demo fallback catalog (remove once your endpoint works) ----------
const DEMO_CATALOG = [
  { item: "Nails (box)", weBuy: 1000, toBuy: 1500 },
  { item: "Planks (bundle)", weBuy: 500, toBuy: 800 },
  { item: "Bandage", weBuy: 150, toBuy: 250 },
  { item: "Tetracycline", weBuy: 300, toBuy: 500 },
  { item: "Armband (color)", weBuy: 0, toBuy: 1000 },
];

const $ = (id) => document.getElementById(id);

let catalog = [];
let filtered = [];
const qtyMap = new Map(); // item -> qty

function money(n){
  const v = Number(n || 0);
  return "$" + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function nowStamp(){ return new Date().toLocaleString(); }

function setMsg(text, good=false){
  const el = $("msg");
  el.textContent = text || "";
  el.style.color = good ? "rgba(34,197,94,.9)" : "rgba(234,240,247,.7)";
}

function online(isOnline){
  $("onlineDot").style.background = isOnline ? "var(--good)" : "var(--bad)";
  $("onlineDot").style.boxShadow = isOnline
    ? "0 0 0 3px rgba(34,197,94,.18)"
    : "0 0 0 3px rgba(239,68,68,.18)";
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, "&quot;"); }

// ---------- Rendering ----------
function render(){
  const rows = $("rows");
  rows.innerHTML = "";

  const q = ($("filter").value || "").trim().toLowerCase();
  filtered = catalog.filter(x => !q || x.item.toLowerCase().includes(q));

  $("catalogPill").textContent = `Catalog loaded: ${catalog.length} items`;

  for(const it of filtered){
    const qty = qtyMap.get(it.item) || 0;
    const line = (Number(it.weBuy||0) * Number(qty||0));

    const tr = document.createElement("div");
    tr.className = "tr";
    tr.dataset.item = it.item;

    tr.innerHTML = `
      <div class="item">${escapeHtml(it.item)}</div>
      <div class="num">${money(it.weBuy)}</div>
      <div class="num">${money(it.toBuy)}</div>
      <div class="num">
        <input class="qty" inputmode="numeric" pattern="[0-9]*"
               value="${qty}" data-item="${escapeAttr(it.item)}" />
      </div>
      <div class="num lineTotal" data-item="${escapeAttr(it.item)}">${money(line)}</div>
    `;

    rows.appendChild(tr);
  }

  hookQtyInputs();     // attaches listeners to the newly created inputs
  recalcTotals();      // updates footer totals
}

function updateRowLineTotal(item){
  const it = catalog.find(x => x.item === item);
  if(!it) return;

  const qty = qtyMap.get(item) || 0;
  const line = Number(it.weBuy||0) * qty;

  const cell = document.querySelector(`.lineTotal[data-item="${CSS.escape(item)}"]`);
  if(cell) cell.textContent = money(line);
}

function hookQtyInputs(){
  document.querySelectorAll(".qty").forEach(inp => {
    // prevent double-binding if render() is called again
    if (inp.dataset.bound === "1") return;
    inp.dataset.bound = "1";

    inp.addEventListener("input", (e) => {
      const item = e.target.getAttribute("data-item");
      const raw = (e.target.value || "").replace(/[^\d]/g,"");
      const qty = raw ? Math.min(parseInt(raw,10), 9999) : 0;
      e.target.value = String(qty);

      qtyMap.set(item, qty);

      updateRowLineTotal(item);
      recalcTotals();
    });
  });
}

function recalcTotals(){
  let totalItems = 0;
  let totalOwed = 0;
  let totalBuy = 0;

  for(const it of catalog){
    const qty = qtyMap.get(it.item) || 0;
    if(qty <= 0) continue;

    totalItems += qty;
    totalOwed += Number(it.weBuy||0) * qty;
    totalBuy  += Number(it.toBuy||0) * qty;
  }

  $("totalItems").textContent = String(totalItems);
  $("totalOwed").textContent  = money(totalOwed);

  const pct = totalBuy > 0 ? (totalOwed / totalBuy) * 100 : 0;
  $("pctBuy").textContent = pct.toFixed(1) + "%";
}

// ---------- Data ----------
async function loadCatalog(){
  setMsg("Loading catalog…");
  try{
    const res = await fetch(`${ENDPOINT_URL}?mode=catalog`, { method:"GET" });
    const data = await res.json();
    if(!data?.ok || !Array.isArray(data.catalog)) throw new Error("Bad catalog response");

    // Keep fields we use
    catalog = data.catalog
      .filter(x => x?.item)
      .map(x => ({
        item: String(x.item),
        weBuy: Number(x.weBuy || 0),
        toBuy: Number(x.toBuy || 0)
      }));

    $("statusSub").textContent = `Last updated: ${nowStamp()}`;
    online(true);
    setMsg("Catalog loaded.", true);
  }catch(e){
    catalog = DEMO_CATALOG;
    $("statusSub").textContent = `Last updated: ${nowStamp()} (demo catalog)`;
    online(true);
    setMsg("Couldn’t load catalog from endpoint. Showing demo items until you paste your /exec URL.", false);
  }

  render();
}

function clearQty(){
  qtyMap.clear();
  // reset visible inputs + totals without a full rebuild
  document.querySelectorAll(".qty").forEach(i => i.value = "0");
  document.querySelectorAll(".lineTotal").forEach(c => c.textContent = "$0");
  recalcTotals();
  setMsg("Quantities cleared.", true);
}

async function submitOrder(){
  const playerName = ($("playerName").value || "").trim();
  const server = ($("server").value || "").trim();
  const discord = ($("discord").value || "").trim();

  if(!playerName) return setMsg("Player name is required.");
  if(!server) return setMsg("Server is required.");

  const items = [];
  let total = 0;

  for(const it of catalog){
    const qty = qtyMap.get(it.item) || 0;
    if(qty <= 0) continue;

    const lineTotal = Number(it.weBuy||0) * qty;
    total += lineTotal;
    items.push({ item: it.item, qty, weBuy: Number(it.weBuy||0), lineTotal });
  }

  if(items.length === 0) return setMsg("Add at least one item quantity.");

  const payload = new URLSearchParams();
  payload.append("playerName", playerName);
  payload.append("server", server);
  payload.append("discord", discord);
  payload.append("items_json", JSON.stringify(items));
  payload.append("items_text", items.map(i => `${i.qty}x ${i.item} @ ${i.weBuy} = ${i.lineTotal}`).join("\n"));
  payload.append("total", String(total));
  payload.append("source", "github-pages");
  payload.append("website", ""); // honeypot field

  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting…";
  setMsg("Submitting order…");

  try{
    const res = await fetch(ENDPOINT_URL, {
      method:"POST",
      headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });

    const text = await res.text();
    let data = null;
    try{ data = JSON.parse(text); }catch{}

    if(!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,200)}`);
    if(data && data.ok === false) throw new Error(data.message || "Order rejected");

    const orderId = data?.orderId || data?.id || "";
    setMsg(orderId ? `Order submitted! ID: ${orderId}` : "Order submitted!", true);
    clearQty();
  }catch(e){
    setMsg(`Submit failed: ${String(e.message || e)}`);
  }finally{
    btn.disabled = false;
    btn.textContent = "Submit Order";
  }
}

// Wire up UI
$("filter").addEventListener("input", render);
$("clearQtyBtn").addEventListener("click", clearQty);
$("submitBtn").addEventListener("click", submitOrder);
$("refreshStatusBtn").addEventListener("click", loadCatalog);

// Start
$("statusSub").textContent = "Last updated: —";
online(true);
loadCatalog();
