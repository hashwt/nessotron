// House designer page: sends the form to /api/design, shows progress, and renders each plan in 3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildHouse } from './house3d.js';

const $ = (id) => document.getElementById(id);
const view = $('view');

// --- Scene -------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
view.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.domElement.style.position = 'absolute';
labels.domElement.style.inset = '0';
labels.domElement.style.pointerEvents = 'none';
view.appendChild(labels.domElement);

const scene = new THREE.Scene();

// Sky: a vertical gradient behind everything, with matching haze toward the horizon.
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 2;
skyCanvas.height = 512;
const sky = skyCanvas.getContext('2d');
const grad = sky.createLinearGradient(0, 0, 0, 512);
grad.addColorStop(0, '#6f9fd1');
grad.addColorStop(0.55, '#b7d0e6');
grad.addColorStop(1, '#e9eef0');
sky.fillStyle = grad;
sky.fillRect(0, 0, 2, 512);
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
scene.fog = new THREE.Fog('#dfe6ea', 70, 260);

// Soft image-based lighting for realistic reflections on glass and metal.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 600);
camera.position.set(-18, 9, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 4;
controls.maxDistance = 150;

scene.add(new THREE.HemisphereLight('#dbe8ff', '#6b7a55', 0.35));
const sun = new THREE.DirectionalLight('#fff4e3', 2.6);
sun.position.set(-25, 35, 28);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
scene.add(sun);

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

// --- Showing a plan ----------------------------------------------------------
let current = null;
let framed = false;

function clearHouse() {
  if (!current) return;
  scene.remove(current.root);
  current.root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.element) o.element.remove(); // CSS2D labels
  });
  current = null;
}

function showPlan(plan, req) {
  clearHouse();
  current = buildHouse(plan, req);
  scene.add(current.root);
  applyToggles();
  $('empty').hidden = true;
  $('exportBtn').disabled = false;
  if (!framed) {
    // Street-side three-quarter view, like an architectural render.
    const { center, size } = current;
    const dist = Math.max(16, size * 1.9);
    controls.target.copy(center);
    camera.position.set(center.x - dist * 0.55, center.y + dist * 0.28, center.z + dist * 0.85);
    framed = true;
  }
}

// Room labels only show for the level you can actually see into:
// roof off + upper floors off → ground-floor labels; roof off + upper floors on → upper labels.
function applyToggles() {
  if (!current) return;
  const roof = $('showRoof').checked;
  const upper = $('showUpper').checked;
  current.roofGroup.visible = roof && (upper || !hasUpper());
  current.upperGroup.visible = upper;
  current.root.traverse((o) => {
    if (!o.isCSS2DObject) return;
    let inUpper = false;
    for (let p = o.parent; p; p = p.parent) if (p === current.upperGroup) inUpper = true;
    o.visible = !roof && (inUpper ? upper : !upper || !hasUpper());
  });
}
const hasUpper = () => current && current.upperGroup.children.length > 0;

$('showRoof').addEventListener('change', applyToggles);
$('showUpper').addEventListener('change', applyToggles);

$('exportBtn').addEventListener('click', () => {
  if (!current) return;
  new GLTFExporter().parse(
    current.root,
    (glb) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
      a.download = 'house.glb';
      a.click();
      URL.revokeObjectURL(a.href);
    },
    (err) => alert('Export failed: ' + err.message),
    { binary: true }
  );
});

// --- Talking to the agent ----------------------------------------------------
const log = $('log');
const money = (n) => '$' + Math.round(n).toLocaleString();

function addLog(text, cls = '', details = []) {
  const li = document.createElement('li');
  li.className = cls;
  li.textContent = text;
  if (details.length) {
    const ul = document.createElement('ul');
    for (const d of details) {
      const item = document.createElement('li');
      item.textContent = d;
      ul.appendChild(item);
    }
    li.appendChild(ul);
  }
  log.appendChild(li);
  return li;
}

function readForm() {
  const f = new FormData($('form'));
  return {
    bedrooms: Number(f.get('bedrooms')),
    bathrooms: Number(f.get('bathrooms')),
    style: f.get('style'),
    budget: Number(f.get('budget')),
    lotWidth: Number(f.get('lotWidth')),
    lotDepth: Number(f.get('lotDepth')),
    setback: Number(f.get('setback')),
    maxFloors: Number(f.get('maxFloors')),
    garage: f.get('garage') === 'on',
    notes: f.get('notes') || '',
  };
}

function showResult(data) {
  const box = $('result');
  box.hidden = false;
  box.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = data.plan.name || 'Design';
  const cost = document.createElement('p');
  cost.className = 'cost';
  cost.textContent = 'Estimated ' + money(data.cost);
  const summary = document.createElement('p');
  summary.textContent = data.summary || data.plan.summary || '';
  box.append(h, cost, summary);
  if (data.problems.length) {
    const warn = document.createElement('p');
    warn.style.color = 'var(--bad)';
    warn.textContent = 'This plan still has problems: ' + data.problems.join(' ');
    box.appendChild(warn);
  }
}

let status = null;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const req = readForm();
  $('go').disabled = true;
  $('progress').hidden = false;
  $('result').hidden = true;
  log.innerHTML = '';
  framed = false;
  pendingRounds = [];

  try {
    const res = await fetch('/api/design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) handleEvent(JSON.parse(line), req);
    }
  } catch (err) {
    addLog('Request failed: ' + err.message, 'bad');
  } finally {
    if (status) status.remove();
    status = null;
    $('go').disabled = false;
  }
});

// house.html?demo shows a sample plan without calling the API (handy for testing the 3D view).
// house.html?demo=farmhouse (or modern, minimalist, traditional) picks the style; &roof=flat|gable|hip.
const params = new URLSearchParams(location.search);
if (params.has('demo')) {
  const DEMO_LOOK = {
    modern: { wallColor: '#f1f0ec', roofColor: '#3a3d40', trimColor: '#2e3135', roof: 'flat' },
    minimalist: { wallColor: '#c9c7c2', roofColor: '#3a3a3a', trimColor: '#1f2124', roof: 'flat' },
    farmhouse: { wallColor: '#f4f2ed', roofColor: '#2f3236', trimColor: '#f7f5f0', roof: 'gable' },
    traditional: { wallColor: '#a5583f', roofColor: '#4a4643', trimColor: '#f4f2ec', roof: 'hip' },
  };
  const style = DEMO_LOOK[params.get('demo')] ? params.get('demo') : 'farmhouse';
  const look = { ...DEMO_LOOK[style] };
  if (params.get('roof')) look.roof = params.get('roof');
  const demoReq = { lotWidth: 15, lotDepth: 30, setback: 2 };
  const demoPlan = {
    name: `Demo ${style}`, style, ...look,
    floors: [
      { level: 0, rooms: [
        { id: 'living', name: 'Living Room', type: 'living', x: 2, y: 4, w: 7.5, d: 6 },
        { id: 'garage', name: 'Garage', type: 'garage', x: 9.5, y: 2, w: 3.8, d: 6 },
        { id: 'laundry', name: 'Laundry', type: 'laundry', x: 9.5, y: 8, w: 3.8, d: 2 },
        { id: 'kitchen', name: 'Kitchen', type: 'kitchen', x: 2, y: 10, w: 5, d: 4 },
        { id: 'stairs0', name: 'Stairs', type: 'stairs', x: 7, y: 10, w: 2.5, d: 4 },
        { id: 'bath0', name: 'Bathroom', type: 'bathroom', x: 9.5, y: 10, w: 3.8, d: 4 },
      ] },
      { level: 1, rooms: [
        { id: 'bed1', name: 'Main Bedroom', type: 'bedroom', x: 2, y: 4, w: 5, d: 5 },
        { id: 'bed2', name: 'Bedroom 2', type: 'bedroom', x: 2, y: 9, w: 5, d: 5 },
        { id: 'hall1', name: 'Landing', type: 'hallway', x: 7, y: 4, w: 2.5, d: 6 },
        { id: 'stairs1', name: 'Stairs', type: 'stairs', x: 7, y: 10, w: 2.5, d: 4 },
      ] },
    ],
  };
  if (params.has('noroof')) $('showRoof').checked = false;
  showPlan(demoPlan, demoReq);
  if (params.get('view') === 'left') camera.position.set(current.center.x - 30, current.center.y + 6, current.center.z + 4);
  if (params.get('view') === 'top') camera.position.set(current.center.x, current.center.y + 40, current.center.z + 0.1);
}

let pendingRounds = [];

function handleEvent(ev, req) {
  if (ev.type === 'status') {
    if (status) status.remove();
    status = addLog(ev.message);
  } else if (ev.type === 'check') {
    if (status) status.remove();
    status = null;
    const round = { round: ev.round, ok: ev.ok, cost: ev.cost, problems: ev.problems, plan: ev.plan };
    pendingRounds.push(round);
    showPlan(ev.plan, req);
    addRoundLog(round, req);
  } else if (ev.type === 'done') {
    showPlan(ev.plan, req);
    showResult(ev);
    saveToHistory({ req, plan: ev.plan, cost: ev.cost, problems: ev.problems, summary: ev.summary, rounds: pendingRounds });
  } else if (ev.type === 'error') {
    addLog('Error: ' + ev.message, 'bad');
  }
}

// A round in the Progress list. Click it to view that draft in 3D.
function addRoundLog(round, req) {
  const text = round.ok
    ? `Round ${round.round}: plan passes all checks (${money(round.cost)}).`
    : `Round ${round.round}: ${round.problems.length} problem(s) found, fixing…`;
  const li = addLog(text, round.ok ? 'ok' : 'bad', round.ok ? [] : round.problems);
  li.classList.add('round');
  li.title = 'Click to view this draft';
  li.addEventListener('click', () => {
    showPlan(round.plan, req);
    for (const other of log.querySelectorAll('li.round')) other.classList.toggle('active', other === li);
  });
}

// --- Design history (saved in this browser) ----------------------------------
const HISTORY_KEY = 'houseDesigner.history.v1';
const HISTORY_MAX = 30;
let history = loadHistory();
let historyIndex = -1;

function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Storage full or blocked: keep only final plans (drop drafts) and try once more.
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.map((h) => ({ ...h, rounds: [] }))));
    } catch {
      /* history still works for this session */
    }
  }
}

function saveToHistory(entry) {
  history.unshift({ id: Date.now().toString(36), createdAt: new Date().toISOString(), ...entry });
  history = history.slice(0, HISTORY_MAX);
  persistHistory();
  historyIndex = 0;
  renderHistory();
}

function openHistory(index) {
  const entry = history[index];
  if (!entry) return;
  historyIndex = index;
  framed = false;
  showPlan(entry.plan, entry.req);
  showResult(entry);
  fillForm(entry.req);
  // Rebuild the Progress list from the saved drafts.
  log.innerHTML = '';
  $('progress').hidden = !entry.rounds || !entry.rounds.length;
  for (const round of entry.rounds || []) addRoundLog(round, entry.req);
  renderHistory();
}

function deleteHistory(index) {
  history.splice(index, 1);
  persistHistory();
  if (historyIndex === index) historyIndex = -1;
  else if (historyIndex > index) historyIndex--;
  renderHistory();
}

function fillForm(req) {
  const form = $('form');
  for (const [name, value] of Object.entries(req)) {
    const field = form.elements[name];
    if (!field) continue;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value;
  }
}

function renderHistory() {
  const list = $('historyList');
  list.innerHTML = '';
  $('historySection').hidden = history.length === 0;
  history.forEach((h, i) => {
    const li = document.createElement('li');
    li.className = i === historyIndex ? 'active' : '';
    const info = document.createElement('button');
    info.type = 'button';
    info.className = 'hist-open';
    const title = document.createElement('strong');
    title.textContent = h.plan.name || 'Design';
    const meta = document.createElement('span');
    const when = new Date(h.createdAt);
    meta.textContent = `${h.plan.style} · ${h.req.bedrooms} bed · ${h.req.bathrooms} bath · ${money(h.cost)} · ${when.toLocaleDateString()} ${when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    info.append(title, meta);
    info.addEventListener('click', () => openHistory(i));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'hist-del';
    del.textContent = '×';
    del.title = 'Delete this design';
    del.addEventListener('click', () => deleteHistory(i));
    li.append(info, del);
    list.appendChild(li);
  });
  // Back/forward in the toolbar: ◀ goes to older designs, ▶ to newer ones.
  $('histPos').textContent = history.length ? `${historyIndex >= 0 ? historyIndex + 1 : '–'} / ${history.length}` : '';
  $('histOlder').disabled = historyIndex >= history.length - 1 || !history.length;
  $('histNewer').disabled = historyIndex <= 0;
}

$('histOlder').addEventListener('click', () => openHistory(historyIndex < 0 ? 0 : historyIndex + 1));
$('histNewer').addEventListener('click', () => openHistory(historyIndex - 1));
$('histClear').addEventListener('click', () => {
  if (!confirm('Delete all saved designs?')) return;
  history = [];
  historyIndex = -1;
  persistHistory();
  renderHistory();
});
renderHistory();
// Reopen the most recent design after a page reload.
if (!params.has('demo') && history.length) openHistory(0);
