// 斜めの3D地図（MapLibre GL JS ＋ OpenFreeMap、3Dの自分キャラは three.js）
//   ・地図は傾けて表示し、建物は立体
//   ・自分のキャラはいつも画面の下寄り中央。歩くと地図がついてくる
//   ・1本指で左右にスワイプすると回転、2本指でズーム
//   ・時間帯で昼と夜の色が変わる
//   ・lite=true のときは「軽い表示」（傾けない・建物なし・3Dキャラなし）

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const PITCH = 66; // 低めのカメラで遠くまで見える
const ZOOM = 18.1;

// ゲームらしい色（オリジナル配色）
const PALETTE = {
  day: {
    bg: '#b3eb78', land: '#aee77a', park: '#7fd76a', water: '#5fd0f5', road: '#fff3c4',
    roadCase: '#8fcf6a', path: '#f4f9d0', building: '#ece7f8', sky: '#5fbfff', horizon: '#f4fcff',
    range: '#ffffff',
  },
  night: {
    bg: '#1f4a5e', land: '#225066', park: '#1c6058', water: '#1a3f86', road: '#7d95c9',
    roadCase: '#2a5a72', path: '#58739a', building: '#46588c', sky: '#081530', horizon: '#2c4a7c',
    range: '#bfe6ff',
  },
};

export function isNight(d = new Date()) {
  const h = d.getHours();
  return h < 6 || h >= 18;
}

function circleFeature(lat, lng, r, n = 64) {
  const coords = [];
  const dLat = r / 111320;
  const dLng = r / (111320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    coords.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} };
}

// 地図の見た目をゲーム用に塗り直す
function applyGameStyle(map, pal, lite) {
  const layers = map.getStyle()?.layers || [];
  for (const layer of layers) {
    const id = layer.id.toLowerCase();
    if (id.startsWith('game-')) continue;
    const setP = (k, v) => { try { map.setPaintProperty(layer.id, k, v); } catch { /* 無視 */ } };
    const hide = () => { try { map.setLayoutProperty(layer.id, 'visibility', 'none'); } catch { /* 無視 */ } };
    switch (layer.type) {
      case 'background':
        setP('background-color', pal.bg);
        break;
      case 'fill':
        if (/water|ocean|river|lake|sea/.test(id)) setP('fill-color', pal.water);
        else if (/building/.test(id)) hide();
        else if (/park|grass|wood|forest|green|garden|pitch|cemetery|scrub|wetland|landcover|golf/.test(id)) setP('fill-color', pal.park);
        else setP('fill-color', pal.land);
        setP('fill-outline-color', 'rgba(0,0,0,0)');
        break;
      case 'line':
        if (/water|river|stream|canal|ditch|drain/.test(id)) setP('line-color', pal.water);
        else if (/boundary|admin|ferry|aerialway/.test(id)) hide();
        else if (/rail|transit/.test(id)) setP('line-color', pal.roadCase);
        else if (/path|foot|cycle|track|steps|pedestrian/.test(id)) {
          setP('line-color', pal.path);
          setP('line-width', ['interpolate', ['exponential', 1.6], ['zoom'], 14, 1, 17, 3, 19, 8]);
        } else if (/casing|outline/.test(id)) {
          setP('line-color', pal.roadCase);
          setP('line-width', ['interpolate', ['exponential', 1.6], ['zoom'], 14, 4, 17, 14, 19, 38]);
        } else {
          // アニメ調の太い道
          setP('line-color', pal.road);
          setP('line-width', ['interpolate', ['exponential', 1.6], ['zoom'], 14, 3, 17, 11, 19, 32]);
          setP('line-opacity', 1);
        }
        break;
      case 'symbol':
        hide(); // 文字やお店のアイコンは消してゲームらしく
        break;
      case 'fill-extrusion':
        setP('fill-extrusion-color', pal.building);
        setP('fill-extrusion-opacity', 0.88);
        if (lite) hide();
        break;
      case 'hillshade':
      case 'raster':
        hide();
        break;
      default:
        break;
    }
  }

  // 建物の立体レイヤーがなければ足す
  const hasExtrusion = layers.some((l) => l.type === 'fill-extrusion');
  if (!hasExtrusion && !lite && map.getSource('openmaptiles') && !map.getLayer('game-buildings')) {
    try {
      map.addLayer({
        id: 'game-buildings',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 15,
        paint: {
          'fill-extrusion-color': pal.building,
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.88,
        },
      });
    } catch { /* 無視 */ }
  }
  if (map.getLayer('game-buildings')) map.setPaintProperty('game-buildings', 'fill-extrusion-color', pal.building);

  try {
    // 空のグラデーションを強めに、遠くは霞ませる
    map.setSky({ 'sky-color': pal.sky, 'horizon-color': pal.horizon, 'sky-horizon-blend': 0.9, 'horizon-fog-blend': 0.85, 'fog-color': pal.horizon, 'fog-ground-blend': 0.55 });
  } catch { /* 古い版では空の設定なし */ }

  if (map.getLayer('game-range-fill')) {
    map.setPaintProperty('game-range-fill', 'fill-color', pal.range);
    map.setPaintProperty('game-range-line', 'line-color', pal.range);
  }
}

// ---------- 3Dの自分キャラ（オリジナルデザイン・頭大きめのデフォルメ） ----------
function buildAvatar(THREE) {
  const g = new THREE.Group();
  const mat = (color) => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const skin = mat(0xffd9b3);
  const jacket = mat(0x1fb5a5);
  const pants = mat(0x2b3a67);
  const shoes = mat(0xffffff);
  const capM = mat(0xf2b705);
  const black = mat(0x222222);
  const white = mat(0xffffff);

  // くっきりした影
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  g.add(shadow);

  // 足元で広がる光の輪（2重）
  const rings = [0, 1].map(() => {
    const r = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.0, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.02;
    g.add(r);
    return r;
  });

  const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.42, 10);
  legGeo.translate(0, -0.21, 0);
  const footGeo = new THREE.SphereGeometry(0.1, 10, 8);
  footGeo.scale(1, 0.6, 1.4);
  footGeo.translate(0, -0.42, 0.03);
  const mkLeg = (x) => {
    const leg = new THREE.Group();
    leg.add(new THREE.Mesh(legGeo, pants), new THREE.Mesh(footGeo, shoes));
    leg.position.set(x, 0.46, 0);
    g.add(leg);
    return leg;
  };
  const legL = mkLeg(-0.11);
  const legR = mkLeg(0.11);

  const torso = new THREE.Group();
  g.add(torso);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.48, 18), jacket);
  body.position.y = 0.7;
  torso.add(body);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.02), white);
  zip.position.set(0, 0.7, 0.25);
  torso.add(zip);

  const armGeo = new THREE.CylinderGeometry(0.065, 0.06, 0.42, 10);
  armGeo.translate(0, -0.21, 0);
  const handGeo = new THREE.SphereGeometry(0.07, 10, 8);
  handGeo.translate(0, -0.44, 0);
  const mkArm = (x) => {
    const arm = new THREE.Group();
    arm.add(new THREE.Mesh(armGeo, jacket), new THREE.Mesh(handGeo, skin));
    arm.position.set(x, 0.9, 0);
    arm.rotation.z = x > 0 ? 0.12 : -0.12;
    torso.add(arm);
    return arm;
  };
  const armL = mkArm(-0.3);
  const armR = mkArm(0.3);

  // 頭（大きめ）。帽子・目と一緒に回して周りを見回す
  const headG = new THREE.Group();
  headG.position.y = 1.27;
  torso.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18), skin);
  headG.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.375, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), capM);
  cap.position.y = 0.05;
  headG.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.035, 18, 1, false, -Math.PI / 2, Math.PI), capM);
  brim.position.set(0, 0.07, 0.27);
  headG.add(brim);
  const eyeGeo = new THREE.SphereGeometry(0.05, 10, 10);
  eyeGeo.scale(0.8, 1.2, 0.6);
  const hiGeo = new THREE.SphereGeometry(0.015, 6, 6);
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(eyeGeo, black);
    eye.position.set(x, -0.03, 0.33);
    const hi = new THREE.Mesh(hiGeo, white);
    hi.position.set(x + 0.015, 0.0, 0.36);
    headG.add(eye, hi);
  }
  const cheekGeo = new THREE.SphereGeometry(0.045, 8, 8);
  cheekGeo.scale(1, 0.6, 0.4);
  const cheekM = new THREE.MeshLambertMaterial({ color: 0xff9e9e, transparent: true, opacity: 0.7 });
  for (const x of [-0.2, 0.2]) {
    const c = new THREE.Mesh(cheekGeo, cheekM);
    c.position.set(x, -0.11, 0.29);
    headG.add(c);
  }

  g.userData = { legL, legR, armL, armR, torso, headG, rings };
  return g;
}

function animateAvatar(g, t, moving) {
  const { legL, legR, armL, armR, torso, headG, rings } = g.userData;
  const swing = moving ? Math.sin(t * 9) * 0.65 : 0;
  legL.rotation.x = swing;
  legR.rotation.x = -swing;
  armL.rotation.x = -swing * 0.9;
  armR.rotation.x = swing * 0.9;
  torso.position.y = moving ? Math.abs(Math.sin(t * 9)) * 0.05 : Math.sin(t * 2) * 0.012;

  // 止まっているときは、ときどき左右を見回す
  if (moving) {
    headG.rotation.y *= 0.85;
  } else {
    const cycle = t % 7;
    const target = cycle < 2.5 ? 0 : cycle < 4 ? 0.7 : cycle < 5.5 ? -0.7 : 0;
    headG.rotation.y += (target - headG.rotation.y) * 0.06;
  }

  // 光の輪：広がりながら消えるのをくり返す
  rings.forEach((r, i) => {
    const p = ((t / 2.4) + i * 0.5) % 1;
    const sc = 0.5 + p * 1.6;
    r.scale.set(sc, sc, sc);
    r.material.opacity = 0.55 * (1 - p);
  });
}

function createAvatarLayer(THREE, getState) {
  return {
    id: 'game-avatar',
    type: 'custom',
    renderingMode: '3d',
    onAdd(map, gl) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.8);
      sun.position.set(1, 2.5, 1.5);
      this.scene.add(sun);
      this.avatar = buildAvatar(THREE);
      this.scene.add(this.avatar);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
      this.t0 = performance.now();
    },
    render(gl, matrix) {
      const st = getState();
      if (!st.pos) return;
      const mc = maplibregl.MercatorCoordinate.fromLngLat([st.pos.lng, st.pos.lat], 0);
      // 画面上でだいたい同じ大きさ（約110px）に見えるように、ズームに合わせて大きさを変える
      const mpp = (40075016.686 * Math.cos((st.pos.lat * Math.PI) / 180)) / (512 * 2 ** this.map.getZoom());
      const meters = (115 * mpp) / 1.65; // 画面上で約115pxの背の高さ
      const s = mc.meterInMercatorCoordinateUnits() * meters;
      const l = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(this.rotX);
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(l);
      this.avatar.rotation.y = (st.heading * Math.PI) / 180; // 0=北向き、90=東向き
      animateAvatar(this.avatar, (performance.now() - this.t0) / 1000, st.moving);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}

// ---------- 地図をつくる ----------
export async function createGameMap({ container, center, lite = false, onMapClick = null }) {
  const night = isNight();
  let pal = night ? PALETTE.night : PALETTE.day;

  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [center.lng, center.lat],
    zoom: ZOOM,
    pitch: lite ? 0 : PITCH,
    bearing: 0,
    minZoom: 15.5,
    maxZoom: 19.5,
    maxPitch: 70,
    dragPan: false,
    dragRotate: false,
    keyboard: false,
    doubleClickZoom: false,
    touchPitch: false,
    attributionControl: { compact: true },
  });
  map.touchZoomRotate.enable({ around: 'center' });
  map.scrollZoom.enable({ around: 'center' });
  document.body.classList.toggle('night', night);

  const state = {
    target: { ...center },   // GPSの位置
    pos: { ...center },      // 表示している位置（なめらかに追いかける）
    heading: 0,
    moving: false,
    movingUntil: 0,
    headingMode: false,
  };
  let rangeRadius = 50;
  let htmlAvatar = null;
  let threeReady = false;

  // 画面の下寄りに自分が来るように余白をとる
  const setPad = () => map.setPadding({ top: lite ? 0 : Math.round(window.innerHeight * 0.32), bottom: 0, left: 0, right: 0 });
  setPad();
  window.addEventListener('resize', setPad);

  // スタイルの読み込み（失敗してもゲームは続ける）
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once('load', finish);
    map.on('error', (e) => console.warn('地図のエラー', e?.error?.message || e));
    setTimeout(finish, 10000);
  });

  const addRange = () => {
    if (map.getSource('game-range')) return;
    map.addSource('game-range', { type: 'geojson', data: circleFeature(state.pos.lat, state.pos.lng, rangeRadius) });
    map.addLayer({ id: 'game-range-fill', type: 'fill', source: 'game-range', paint: { 'fill-color': pal.range, 'fill-opacity': 0.12 } });
    map.addLayer({ id: 'game-range-line', type: 'line', source: 'game-range', paint: { 'line-color': pal.range, 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [2, 2] } });
  };
  try {
    applyGameStyle(map, pal, lite);
    addRange();
  } catch (e) { console.warn(e); }

  // 3Dの自分キャラ（軽い表示のときや読み込みに失敗したときはふつうのアイコン）
  const useHtmlAvatar = () => {
    if (htmlAvatar) return;
    const el = document.createElement('div');
    el.className = 'avatar-2d';
    el.innerHTML = '<div class="avatar-2d-body"></div>';
    htmlAvatar = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([state.pos.lng, state.pos.lat]).addTo(map);
  };
  if (lite) {
    useHtmlAvatar();
  } else {
    try {
      const THREE = await import(THREE_URL);
      map.addLayer(createAvatarLayer(THREE, () => state));
      threeReady = true;
    } catch (e) {
      console.warn('3Dキャラを読み込めませんでした', e);
      useHtmlAvatar();
    }
  }

  // 1本指の左右スワイプで回転（ポケモンGOと同じ操作）
  const canvas = map.getCanvas();
  const pointers = new Map();
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, e);
    drag = pointers.size === 1 && !lite ? { x: e.clientX, y: e.clientY, b: map.getBearing(), moved: false } : null;
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, e);
    if (!drag || pointers.size !== 1) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) drag.moved = true;
    if (drag.moved) {
      // 自分より上側をなでたときは逆向きに回る
      const above = e.clientY < canvas.getBoundingClientRect().top + window.innerHeight * 0.66;
      map.setBearing(drag.b + dx * 0.35 * (above ? -1 : 1));
      state.headingMode = false;
    }
  });
  const end = (e) => { pointers.delete(e.pointerId); if (pointers.size === 0) drag = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  if (onMapClick) map.on('click', (e) => { if (!drag || !drag.moved) onMapClick(e.lngLat.lat, e.lngLat.lng); });

  // 毎フレーム：表示位置をなめらかに追いかけ、カメラを合わせる
  let rangeTick = 0;
  const frame = () => {
    const p = state.pos;
    const t = state.target;
    const dLat = t.lat - p.lat;
    const dLng = t.lng - p.lng;
    if (Math.abs(dLat) > 1e-8 || Math.abs(dLng) > 1e-8) {
      p.lat += dLat * 0.08;
      p.lng += dLng * 0.08;
      if (Math.abs(dLat) < 2e-7 && Math.abs(dLng) < 2e-7) { p.lat = t.lat; p.lng = t.lng; }
      map.jumpTo({ center: [p.lng, p.lat] });
      if (htmlAvatar) htmlAvatar.setLngLat([p.lng, p.lat]);
      if (++rangeTick % 3 === 0) map.getSource('game-range')?.setData(circleFeature(p.lat, p.lng, rangeRadius));
    }
    state.moving = performance.now() < state.movingUntil;
    if (state.headingMode) {
      const cur = map.getBearing();
      let diff = ((state.heading - cur + 540) % 360) - 180;
      if (Math.abs(diff) > 0.5) map.setBearing(cur + diff * 0.08);
    }
    if (htmlAvatar) htmlAvatar.getElement().classList.toggle('walking', state.moving);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // 昼と夜の切り替え（10分ごとに確認）
  setInterval(() => {
    const n = isNight();
    const next = n ? PALETTE.night : PALETTE.day;
    if (next !== pal) {
      pal = next;
      document.body.classList.toggle('night', n);
      applyGameStyle(map, pal, lite);
    }
  }, 600000);

  return {
    map,
    is3D: threeReady,
    // 自分の位置を更新
    setPlayer({ lat, lng }, { heading = null, teleport = false } = {}) {
      const moved = Math.hypot(lat - state.target.lat, lng - state.target.lng) > 1e-6;
      state.target = { lat, lng };
      if (heading != null) state.heading = heading;
      if (teleport) {
        state.pos = { lat, lng };
        map.jumpTo({ center: [lng, lat] });
        if (htmlAvatar) htmlAvatar.setLngLat([lng, lat]);
        map.getSource('game-range')?.setData(circleFeature(lat, lng, rangeRadius));
      } else if (moved) {
        state.movingUntil = performance.now() + 2000;
      }
    },
    setRangeRadius(r) { rangeRadius = r; },
    // 地図の上に置く目印（キャラ・スポット）
    addMarker({ el, lat, lng }) {
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
    },
    getBearing: () => map.getBearing(),
    onRotate(fn) { map.on('rotate', () => fn(map.getBearing())); },
    // コンパス：北を上 → 進む方向を上 → 北を上…
    toggleCompass() {
      if (state.headingMode) {
        state.headingMode = false;
        map.easeTo({ bearing: 0, duration: 500 });
        return 'north';
      }
      if (Math.abs(map.getBearing()) > 1) {
        map.easeTo({ bearing: 0, duration: 500 });
        return 'north';
      }
      state.headingMode = true;
      return 'heading';
    },
  };
}

// ---------- スポット管理などで使う、ゲームと同じ見た目の地図 ----------
// ゲーム画面と違い、1本指で地図を動かせる（スポットを置く場所を探しやすいように）
export async function createEditMap({ container, center, zoom = 17.5, pitch = 50 }) {
  const night = isNight();
  const pal = night ? PALETTE.night : PALETTE.day;
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: [center.lng, center.lat],
    zoom,
    pitch,
    bearing: 0,
    maxPitch: 70,
    attributionControl: { compact: true },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
  await new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    map.once('load', finish);
    map.on('error', (e) => console.warn('地図のエラー', e?.error?.message || e));
    setTimeout(finish, 10000);
  });
  try { applyGameStyle(map, pal, false); } catch (e) { console.warn(e); }
  document.body.classList.toggle('night', night);
  return map;
}

// スポットの見た目（ゲーム画面と同じ浮かぶ結晶）
export function createSpotElement() {
  const el = document.createElement('div');
  el.className = 'spot-pin';
  el.innerHTML = `<div class="spot-crystal"><div class="spot-gem"><b></b><b></b></div></div>
    <div class="spot-sparkle"><i></i><i></i><i></i></div><div class="spot-base"></div>`;
  return el;
}
