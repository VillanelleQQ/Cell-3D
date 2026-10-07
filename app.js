import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { GLTFExporter } from './vendor/GLTFExporter.js';

const $ = (id) => document.getElementById(id);
const descriptions = {
  wall: ['细胞壁', '#4b9a58', '植物细胞外侧的坚固结构，提供支撑并维持细胞形态。'],
  membrane: ['细胞膜', '#88b59a', '界定细胞边界，选择性调节物质进出，并参与细胞信号传递。'],
  cytoplasm: ['细胞质', '#d4cf99', '细胞膜内、细胞核外的区域，容纳细胞器及多种代谢活动。'],
  nucleus: ['细胞核', '#8c6ab5', '包含大部分遗传信息。剖面中展示核膜、核内区域和核仁。'],
  nucleolus: ['核仁', '#5c3e8d', '细胞核内部的结构，参与核糖体 RNA 的合成与核糖体亚基的组装。'],
  vacuole: ['中央液泡', '#73d4d6', '植物细胞中的大型液泡，储存物质并参与维持膨压。'],
  chloroplast: ['叶绿体', '#328257', '植物细胞中进行光合作用的细胞器；内部叠片示意类囊体结构。'],
  mitochondria: ['线粒体', '#e6815b', '参与细胞呼吸与能量转化；内部褶皱示意线粒体嵴。'],
  roughER: ['粗面内质网', '#a68bc9', '表面附有核糖体，参与部分蛋白质的合成与加工。'],
  smoothER: ['光面内质网', '#dabf6b', '参与脂质代谢、钙离子储存及其他细胞活动。'],
  golgi: ['高尔基体', '#e2a252', '由堆叠的膜囊组成，参与蛋白质和脂质的加工、分选与运输。'],
  ribosomes: ['核糖体', '#727585', '合成蛋白质的结构，可游离于细胞质或附着于粗面内质网。'],
  vesicles: ['小囊泡', '#d78aa0', '教学示意的小型膜性结构，代表细胞内运输与储存相关囊泡。'],
  lysosome: ['溶酶体', '#7dbdc0', '含有水解酶的膜性细胞器，参与物质降解与回收。'],
  centrosome: ['中心体', '#bf9873', '动物细胞中的微管组织中心；此处以一对中心粒作简化示意。'],
};
const viewport = $('viewport');
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
catch (error) { $('loading').hidden = true; $('error').hidden = false; $('error').textContent = '无法创建 WebGL 三维视图，请使用支持 WebGL 的浏览器。'; throw error; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor('#edf3f0');
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
viewport.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, .1, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = .08;
controls.minDistance = 4; controls.maxDistance = 50; controls.maxPolarAngle = Math.PI * .8;
scene.add(new THREE.HemisphereLight('#ffffff', '#7d9382', 2.3));
const key = new THREE.DirectionalLight('#fff7eb', 3.2); key.position.set(-4, 10, 6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -14; key.shadow.camera.right = 14;
key.shadow.camera.top = 12; key.shadow.camera.bottom = -12; key.shadow.normalBias = .04;
scene.add(key);
const fill = new THREE.DirectionalLight('#e4f7ff', 1.4); fill.position.set(6, 4, -5); scene.add(fill);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ color: '#edf3f0', roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.position.y = -1.05; floor.receiveShadow = true; scene.add(floor);
const models = new THREE.Group(); models.name = '植物细胞与动物细胞'; scene.add(models);
const sphereGeo = new THREE.SphereGeometry(1, 32, 24);
const groups = new Map();
const shellMaterials = [];
function material(color, opts = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: 0, ...opts }); }
function mesh(parent, geometry, mat, pos = [0, 0, 0], scale = [1, 1, 1]) {
  const object = new THREE.Mesh(geometry, mat); object.position.set(...pos); object.scale.set(...scale);
  object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
function ellipsoid(parent, color, pos, scale, opts = {}) { return mesh(parent, sphereGeo, material(color, opts), pos, scale); }
function tube(parent, points, radius, color, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed);
  return mesh(parent, new THREE.TubeGeometry(curve, 48, radius, 8, closed), material(color));
}
function part(cell, type, pos = [0, 0, 0]) {
  const group = new THREE.Group(); group.name = `${cell.userData.label} · ${descriptions[type][0]}`;
  group.userData = { type, cell: cell.userData.id, description: descriptions[type][2] };
  group.position.set(...pos); cell.add(group); groups.set(`${cell.userData.id}:${type}`, group); return group;
}
function roundedShape(width, height, radius) {
  const x = -width / 2, y = -height / 2, s = new THREE.Shape();
  s.moveTo(x + radius, y); s.lineTo(x + width - radius, y); s.quadraticCurveTo(x + width, y, x + width, y + radius);
  s.lineTo(x + width, y + height - radius); s.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  s.lineTo(x + radius, y + height); s.quadraticCurveTo(x, y + height, x, y + height - radius);
  s.lineTo(x, y + radius); s.quadraticCurveTo(x, y, x + radius, y); return s;
}
function extrude(parent, shape, depth, color, y, opts = {}) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .06, bevelThickness: .06, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2); return mesh(parent, geo, material(color, opts), [0, y, 0]);
}
function nucleus(cell, pos, color) {
  const group = part(cell, 'nucleus', pos);
  const cutSphere = new THREE.SphereGeometry(.77, 48, 32, 0, Math.PI * 2, .67, Math.PI - .67);
  mesh(group, cutSphere, material(color, { side: THREE.DoubleSide }), [0, 0, 0]);
  ellipsoid(group, '#baa0d2', [0, -.13, 0], [.66, .5, .66]);
  const nucleolus = part(cell, 'nucleolus', [pos[0] + .05, pos[1] + .28, pos[2] + .08]);
  ellipsoid(nucleolus, '#593d8d', [0, 0, 0], [.24, .23, .24]);
  const rimPoints = Array.from({ length: 48 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2;
    return [.77 * Math.sin(.67) * Math.cos(angle), .77 * Math.cos(.67), .77 * Math.sin(.67) * Math.sin(angle)];
  });
  tube(group, rimPoints, .027, '#d8c9eb', true);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1; tube(group, [[Math.cos(a) * .32, .16, Math.sin(a) * .32], [Math.cos(a + .8) * .48, .12, Math.sin(a + .8) * .48], [Math.cos(a + 1.5) * .25, .2, Math.sin(a + 1.5) * .25]], .013, '#9061b2');
  }
}
function mitochondria(cell, positions) {
  const group = part(cell, 'mitochondria');
  positions.forEach(([x, y, z, rotation]) => {
    const organelle = new THREE.Group(); organelle.position.set(x, y, z); organelle.rotation.y = rotation; group.add(organelle);
    ellipsoid(organelle, '#e9845e', [0, 0, 0], [.48, .18, .22]);
    const p = [];
    for (let i = 0; i < 12; i++) p.push([-.34 + i * .061, .157, (i % 2 ? .09 : -.09)]);
    tube(organelle, p, .022, '#fbd4a0');
  });
}
function er(cell, type, pos, color) {
  const group = part(cell, type, pos);
  for (let j = 0; j < 4; j++) {
    const points = [];
    for (let i = 0; i < 18; i++) {
      const angle = -.65 + i / 17 * 2.55;
      const r = .93 + j * .12; points.push([Math.cos(angle) * r, j * .075, Math.sin(angle) * r]);
    }
    tube(group, points, .064, color);
    if (type === 'roughER') {
      for (let i = 1; i < points.length; i += 3) ellipsoid(group, '#655376', [points[i][0], points[i][1] + .077, points[i][2]], [.029, .029, .029]);
    }
  }
}
function golgi(cell, pos) {
  const group = part(cell, 'golgi', pos);
  for (let j = 0; j < 5; j++) {
    const points = Array.from({ length: 15 }, (_, i) => { const x = -.6 + i / 14 * 1.2; return [x, j * .095, .12 * Math.cos(x * 3) + j * .065]; });
    tube(group, points, .062, j % 2 ? '#edb45f' : '#d99a44');
  }
  [-.72, .73].forEach((x, i) => ellipsoid(group, '#edbf79', [x, .25, i * .25], [.1, .1, .1]));
}
function ribosomes(cell, positions) {
  const group = part(cell, 'ribosomes');
  positions.forEach(p => ellipsoid(group, '#6a6c83', p, [.034, .034, .034]));
}
function buildPlant() {
  const cell = new THREE.Group(); cell.name = '植物细胞'; cell.userData = { id: 'plant', label: '植物细胞' }; cell.position.x = -3.6; models.add(cell);
  const wall = part(cell, 'wall');
  const shape = roundedShape(5.1, 4.05, .65); shape.holes.push(new THREE.Path(roundedShape(4.77, 3.72, .55).getPoints(32)));
  const wallMesh = extrude(wall, shape, .85, '#4e965c', -.88, { transparent: true, opacity: .65, side: THREE.DoubleSide }); shellMaterials.push(wallMesh.material);
  extrude(wall, roundedShape(5.05, 4, .62), .16, '#508d54', -.94);
  const membrane = part(cell, 'membrane');
  const ring = roundedShape(4.76, 3.71, .53); ring.holes.push(new THREE.Path(roundedShape(4.66, 3.61, .48).getPoints(32)));
  const membraneMesh = extrude(membrane, ring, .66, '#92c690', -.7, { transparent: true, opacity: .65, side: THREE.DoubleSide }); shellMaterials.push(membraneMesh.material);
  const cytoplasm = part(cell, 'cytoplasm'); extrude(cytoplasm, roundedShape(4.64, 3.59, .49), .14, '#b7d7a0', -.73);
  const vacuole = part(cell, 'vacuole', [-.78, .04, .12]); ellipsoid(vacuole, '#77d9dc', [0, 0, 0], [.89, .67, 1.36], { transparent: true, opacity: .88, roughness: .2 });
  nucleus(cell, [.89, .48, .38], '#9b72ba');
  er(cell, 'roughER', [.75, .28, .12], '#b494c9');
  er(cell, 'smoothER', [-1.25, -.35, -.8], '#dcbb62');
  const chloros = part(cell, 'chloroplast');
  [[-1.73, -.12, -1.22, -.35], [-1.88, -.17, 1.17, .3], [.25, -.25, -1.32, .8], [1.74, -.19, 1.23, -.4]].forEach(([x, y, z, angle]) => {
    const ch = new THREE.Group(); ch.position.set(x, y, z); ch.rotation.y = angle; chloros.add(ch);
    ellipsoid(ch, '#3f9160', [0, 0, 0], [.46, .23, .28]);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) mesh(ch, new THREE.CylinderGeometry(.075, .075, .025, 12), material('#b4d087'), [-.22 + i * .145, .17 + k * .02, 0]);
  });
  mitochondria(cell, [[-1.64, -.13, -.45, .5], [.82, -.24, -1.3, -.3], [1.74, -.18, -.45, 1.2]]);
  golgi(cell, [-.78, -.18, -1.28]);
  ribosomes(cell, [[-1.84, -.4, .48], [-1.48, -.38, .83], [.14, -.34, 1.4], [.58, -.31, 1.34], [1.88, -.3, .45], [-.25, -.3, -1.48], [1.65, -.3, -1.03]]);
  return cell;
}
function buildAnimal() {
  const cell = new THREE.Group(); cell.name = '动物细胞'; cell.userData = { id: 'animal', label: '动物细胞' }; cell.position.x = 3.6; models.add(cell);
  const membrane = part(cell, 'membrane');
  const bowl = new THREE.SphereGeometry(2.48, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); bowl.scale(1, .34, .9);
  const outer = mesh(membrane, bowl, material('#df9d85', { side: THREE.DoubleSide, transparent: true, opacity: .65 })); shellMaterials.push(outer.material);
  const rim = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return [2.48 * Math.cos(a), 0, 2.23 * Math.sin(a)]; });
  tube(membrane, rim, .047, '#e4b49c', true);
  const cytoplasm = part(cell, 'cytoplasm');
  const inner = new THREE.SphereGeometry(2.37, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); inner.scale(1, .31, .9);
  mesh(cytoplasm, inner, material('#e4dca9', { side: THREE.DoubleSide }));
  nucleus(cell, [-.46, .18, .1], '#719ec9');
  er(cell, 'roughER', [-.7, -.02, .15], '#b398c3');
  er(cell, 'smoothER', [.15, -.27, -.57], '#e5c66c');
  mitochondria(cell, [[1.45, -.11, -.85, -.45], [-1.57, -.05, -.73, .75], [.91, -.16, 1.16, .1], [-1.35, -.06, 1.14, -.3]]);
  golgi(cell, [.49, -.15, 1.29]);
  const vesicles = part(cell, 'vesicles');
  [[1.9, -.13, .08], [-1.9, -.09, .35], [.06, -.04, -1.77]].forEach(p => ellipsoid(vesicles, '#d7a1bb', p, [.18, .19, .18]));
  const lysosome = part(cell, 'lysosome');
  [[1.41, -.2, .71], [-.74, -.1, -1.56]].forEach(p => ellipsoid(lysosome, '#7dbfc2', p, [.22, .2, .22]));
  const centrosome = part(cell, 'centrosome', [1.43, -.12, -1.35]);
  for (let k = 0; k < 2; k++) {
    const c = new THREE.Group(); c.rotation.z = k ? Math.PI / 2 : 0; c.position.x = k * .25; centrosome.add(c);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; mesh(c, new THREE.CylinderGeometry(.024, .024, .3, 8), material('#b88862'), [.08 * Math.cos(a), .12, .08 * Math.sin(a)]); }
  }
  ribosomes(cell, [[-1.7, -.17, -.03], [1.8, -.24, -.38], [.28, -.32, 1.65], [-.7, -.32, 1.5], [1.39, -.21, .26], [-.2, -.14, -1.8], [-1.3, -.14, -1.32], [1.58, -.16, 1.21]]);
  return cell;
}
const plant = buildPlant(), animal = buildAnimal();
shellMaterials.forEach(m => { m.depthWrite = false; });
for (const cell of [plant, animal]) {
  cell.userData.home = cell.position.toArray();
  cell.children.forEach((g, i) => {
    g.userData.home = g.position.toArray();
    const a = i * 2.39996;
    g.userData.explode = ['wall', 'membrane', 'cytoplasm'].includes(g.userData.type) ? [0, 0, 0] : [Math.cos(a) * .85, .7 + i * .12, Math.sin(a) * .85];
  });
}
let view = 'both', mode = 'orbit', selected = null, dragged = null, dragMoved = false;
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), dragPlane = new THREE.Plane(), dragOffset = new THREE.Vector3();
let pointerStart = new THREE.Vector2();
function frameView() {
  const target = view === 'both' ? new THREE.Vector3(0, .1, 0) : (view === 'plant' ? plant : animal).position.clone().add(new THREE.Vector3(0, .1, 0));
  const width = view === 'both' ? 13 : 6.1;
  const vertical = Math.max(5.4, width / camera.aspect);
  const distance = vertical / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.12;
  camera.position.copy(target).add(new THREE.Vector3(.25, .8, 1).normalize().multiplyScalar(distance));
  camera.lookAt(target); controls.target.copy(target); controls.update();
}
function resize() { const { width, height } = viewport.getBoundingClientRect(); renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); frameView(); }
new ResizeObserver(resize).observe(viewport);
function rebuildList() {
  $('parts').replaceChildren();
  for (const cell of [plant, animal]) {
    if (!cell.visible) continue;
    const heading = document.createElement('div'); heading.className = 'parts-heading'; heading.textContent = cell.name; $('parts').append(heading);
    for (const group of cell.children) {
      const row = document.createElement('div'); row.className = 'part-row'; row.dataset.key = `${cell.userData.id}:${group.userData.type}`;
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = group.visible; checkbox.setAttribute('aria-label', `${group.name} 显隐`);
      checkbox.addEventListener('change', () => { group.visible = checkbox.checked; if (selected === group && !group.visible) select(null); });
      const button = document.createElement('button'); button.title = group.name;
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundColor = descriptions[group.userData.type][1];
      button.append(swatch, document.createTextNode(descriptions[group.userData.type][0])); button.addEventListener('click', () => select(group));
      row.append(checkbox, button); $('parts').append(row);
    }
  }
  highlightRows();
}
function highlightRows() {
  document.querySelectorAll('.part-row').forEach(row => { const active = selected && row.dataset.key === `${selected.userData.cell}:${selected.userData.type}`; row.classList.toggle('selected', Boolean(active)); row.querySelector('button').setAttribute('aria-pressed', String(Boolean(active))); });
}
function select(group) {
  if (selected) selected.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(0); });
  selected = group;
  if (selected) {
    selected.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(0x172b17); });
    $('detail-name').textContent = selected.name; $('detail-description').textContent = selected.userData.description;
    $('selection-status').textContent = selected.name;
  } else {
    $('detail-name').textContent = '植物细胞与动物细胞'; $('detail-description').textContent = '真核细胞具有细胞膜、细胞质和细胞核。植物细胞还具有细胞壁、叶绿体和中央液泡。'; $('selection-status').textContent = '未选择部件';
  }
  highlightRows();
}
function setView(next) {
  view = next; plant.visible = view !== 'animal'; animal.visible = view !== 'plant'; select(null);
  document.querySelectorAll('[data-view]').forEach(b => { b.classList.toggle('active', b.dataset.view === view); b.setAttribute('aria-pressed', String(b.dataset.view === view)); });
  $('view-name').textContent = view === 'both' ? '植物细胞与动物细胞' : view === 'plant' ? '植物细胞' : '动物细胞'; rebuildList(); frameView();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
function setMode(next) {
  mode = next; controls.enabled = mode === 'orbit'; controls.autoRotate = false; $('auto').setAttribute('aria-pressed', 'false'); $('auto').classList.remove('active');
  for (const id of ['orbit', 'move']) { $(id).classList.toggle('active', id === mode); $(id).setAttribute('aria-pressed', String(id === mode)); }
  renderer.domElement.style.cursor = mode === 'move' ? 'grab' : 'default';
}
$('orbit').onclick = () => setMode('orbit'); $('move').onclick = () => setMode('move');
function explode(value) {
  for (const group of groups.values()) group.position.fromArray(group.userData.home).add(new THREE.Vector3(...group.userData.explode).multiplyScalar(value * 2.3));
}
$('explode').oninput = e => { $('explode-value').value = `${e.target.value}%`; explode(Number(e.target.value) / 100); };
$('opacity').oninput = e => { $('opacity-value').value = `${e.target.value}%`; shellMaterials.forEach(m => { m.opacity = Number(e.target.value) / 100; m.depthWrite = m.opacity >= .95; }); };
$('show-all').onclick = () => { groups.forEach(g => { g.visible = true; }); rebuildList(); };
$('reset').onclick = () => {
  [plant, animal].forEach(cell => { cell.position.fromArray(cell.userData.home); });
  $('explode').value = 0; $('explode-value').value = '0%'; explode(0); select(null); setMode('orbit'); frameView();
};
$('auto').onclick = () => { const enabled = !controls.autoRotate; setMode('orbit'); controls.autoRotate = enabled; controls.autoRotateSpeed = .8; $('auto').classList.toggle('active', enabled); $('auto').setAttribute('aria-pressed', String(enabled)); };
$('reference').onclick = () => $('reference-dialog').showModal(); $('close-reference').onclick = () => $('reference-dialog').close();
$('reference-dialog').addEventListener('click', e => { if (e.target === $('reference-dialog')) { const r = e.target.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close(); } });
function hit(event) {
  const rect = renderer.domElement.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([plant, animal], true).filter(h => { let o = h.object; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
  if (!hits.length) return null;
  let group = hits[0].object; while (group && !group.userData.type) group = group.parent;
  return group ? { group, point: hits[0].point } : null;
}
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  pointerStart.set(e.clientX, e.clientY); dragMoved = false;
  if (mode !== 'move') return;
  const result = hit(e); if (!result) return;
  const group = result.group;
  dragged = selected === group && !['wall', 'membrane', 'cytoplasm'].includes(group.userData.type) ? group : group.parent;
  dragPlane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), result.point);
  const world = dragged.getWorldPosition(new THREE.Vector3()); dragOffset.copy(world).sub(result.point);
  renderer.domElement.setPointerCapture(e.pointerId); renderer.domElement.style.cursor = 'grabbing';
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragged) return;
  hit(e); const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(dragPlane, point)) {
    point.add(dragOffset); dragged.parent.worldToLocal(point);
    point.x = THREE.MathUtils.clamp(point.x, -12, 12); point.y = THREE.MathUtils.clamp(point.y, -.6, 8); point.z = THREE.MathUtils.clamp(point.z, -8, 8);
    dragged.position.copy(point); dragMoved = pointerStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4;
  }
});
function endPointer(e) {
  const click = !dragMoved && pointerStart.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) < 5;
  if (click && e.type === 'pointerup') select(hit(e)?.group || null);
  dragged = null; renderer.domElement.style.cursor = mode === 'move' ? 'grab' : 'default';
  if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
}
renderer.domElement.addEventListener('pointerup', endPointer); renderer.domElement.addEventListener('pointercancel', endPointer);
async function exportGLB(which = view) {
  const exported = new THREE.Group(); exported.name = 'Cell Teaching Models';
  for (const cell of [plant, animal]) if (which === 'both' || which === cell.userData.id) {
    const clone = cell.clone(true); clone.visible = true;
    if (which !== 'both') clone.position.x = 0;
    clone.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive?.setHex(0); } });
    exported.add(clone);
  }
  exported.updateMatrixWorld(true);
  return new GLTFExporter().parseAsync(exported, { binary: true, onlyVisible: true });
}
$('export').onclick = async () => {
  $('export').disabled = true;
  try {
    const buffer = await exportGLB(); const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
    const link = document.createElement('a'); link.href = url; link.download = `${view}-cells.glb`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) { $('selection-status').textContent = `导出失败：${e.message}`; }
  finally { $('export').disabled = false; }
};
// Expose scene state for repeatable render and interaction verification.
window.cellViewer = { scene, camera, renderer, controls, models, plant, animal, groups, setView, setMode, select, exportGLB, frameView, get view() { return view; }, get selected() { return selected; } };
setView('both'); resize(); $('loading').hidden = true;
window.addEventListener('load', () => { window.lucide?.createIcons(); });
let previous = performance.now();
function animate(now) { const delta = Math.min((now - previous) / 1000, .1); previous = now; controls.update(delta); renderer.render(scene, camera); requestAnimationFrame(animate); }
requestAnimationFrame(animate);
