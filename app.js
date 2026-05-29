/* ================================================
   Constants
================================================ */
const PIN_TYPES = [
  { id: 'facility',    label: '시설물 파손', icon: '🔧', color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'cleanliness', label: '청결/위생',   icon: '🧹', color: '#10B981', bg: '#ECFDF5' },
  { id: 'safety',      label: '안전 위험',   icon: '⚠️', color: '#EF4444', bg: '#FEF2F2' },
  { id: 'noise',       label: '소음/진동',   icon: '🔊', color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'landscape',   label: '조경/시설',   icon: '🌿', color: '#22C55E', bg: '#F0FDF4' },
  { id: 'parking',     label: '주차/차량',   icon: '🚗', color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'other',       label: '기타',        icon: '📌', color: '#64748B', bg: '#F8FAFC' },
];
const SEVERITIES = [
  { id: 'low',    label: '낮음', color: '#6B7280', bg: '#F3F4F6' },
  { id: 'medium', label: '보통', color: '#4B5563', bg: '#E5E7EB' },
  { id: 'high',   label: '높음', color: '#374151', bg: '#D1D5DB' },
  { id: 'urgent', label: '긴급', color: '#1F2937', bg: '#9CA3AF' },
];
const STATUSES = [
  { id: 'pending',    label: '접수 대기', cls: 'status-pending'    },
  { id: 'processing', label: '처리 중',   cls: 'status-processing' },
  { id: 'done',       label: '처리 완료', cls: 'status-done'       },
];
/* 지도 마커에 쓰는 24×24 좌표 기반 line 아이콘 (stroke-only, fill=none) */
const TYPE_ICONS = {
  facility:    // 시설물 파손: hard hat
    `<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/>` +
    `<path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/>` +
    `<path d="M4 15v-3a8 8 0 0 1 16 0v3"/>`,

  cleanliness: // 청결/위생: water drop
    `<path d="M12 3C12 3 5 11 5 16a7 7 0 0 0 14 0c0-5-7-13-7-13z"/>`,

  safety:      // 안전 위험: alert triangle + !
    `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>` +
    `<line x1="12" y1="9" x2="12" y2="13"/>` +
    `<line x1="12" y1="17" x2="12.01" y2="17"/>`,

  noise:       // 소음/진동: speaker + waves
    `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>` +
    `<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>` +
    `<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>`,

  landscape:   // 조경/시설: layered tree
    `<line x1="12" y1="22" x2="12" y2="14"/>` +
    `<path d="M3 14l9-8 9 8"/>` +
    `<path d="M5 18l7-5 7 5"/>`,

  parking:     // 주차/차량: car silhouette
    `<path d="M7 5h10l3 5H4l3-5z"/>` +
    `<rect x="2" y="10" width="20" height="5" rx="1"/>` +
    `<circle cx="8" cy="17.5" r="2"/>` +
    `<circle cx="16" cy="17.5" r="2"/>`,

  other:       // 기타: map pin
    `<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>` +
    `<circle cx="12" cy="10" r="3"/>`,
};

const COMPLEX = {
  searchQuery:    '래미안 원베일리 아파트',
  fallbackCenter: { lat: 37.5090, lng: 126.9928 },
  halfExtent:     { lat: 0.0034,  lng: 0.0040   },
  initLevel: 3, minLevel: 1, maxLevel: 4,
};

/* ================================================
   Data version reset
================================================ */
const DATA_VERSION = 'wonbailey-v1';
if (localStorage.getItem('danziVersion') !== DATA_VERSION) {
  localStorage.removeItem('danziPins');
  localStorage.setItem('danziVersion', DATA_VERSION);
}

/* ================================================
   State
================================================ */
let map = null, geocoder = null, places = null;
let complexCenter = null, complexBoundary = null, boundaryOverlay = null;
let tempOverlay   = null;   // 말풍선 임시 오버레이
let pendingLatLng = null;
let selectedType  = null, selectedSev = null, photoData = null;
let currentDetailId   = null;
let clusterViewPins   = null; // 클러스터 클릭 후 표시할 핀 목록 (null = 전체 뷰)
let clusterer         = null; // kakao.maps.MarkerClusterer
let markerPinMap      = new Map(); // Marker → pin 매핑
let filters           = { types: [], severities: [], statuses: [] };
let lastMarkerClick   = 0;   // 마커 탭 후 지도 click 이벤트 중복 방지
let _t1 = null, _t2 = null, _dragBoundListener = null; // 경계 타이머·리스너 (중복 방지)
let pins = loadPins() || [];

/* ================================================
   DOM Refs
================================================ */
const $id = id => document.getElementById(id);
const el = {
  map:              $id('map'),
  tapHint:          $id('tapHint'),
  myLocBtn:         $id('myLocationBtn'),
  bottomSheet:      $id('bottomSheet'),
  sheetDragArea:    $id('sheetDragArea'),
  pinCount:         $id('pinCount'),
  pinList:          $id('pinList'),
  filterBtn:        $id('filterBtn'),
  filterBadge:      $id('filterBadge'),
  registerModal:    $id('registerModal'),
  registerBackdrop: $id('registerBackdrop'),
  registerClose:    $id('registerClose'),
  locationText:     $id('locationText'),
  typeChips:        $id('typeChips'),
  severityChips:    $id('severityChips'),
  descInput:        $id('descInput'),
  photoUpload:      $id('photoUpload'),
  photoInput:       $id('photoInput'),
  photoPreviewWrap: $id('photoPreviewWrap'),
  photoPreviewImg:  $id('photoPreviewImg'),
  photoDel:         $id('photoDel'),
  submitBtn:        $id('submitBtn'),
  detailModal:      $id('detailModal'),
  detailBackdrop:   $id('detailBackdrop'),
  detailClose:      $id('detailClose'),
  detailTitle:      $id('detailTitle'),
  detailBody:       $id('detailBody'),
  detailShare:      $id('detailShare'),
  detailGo:         $id('detailGo'),
  filterModal:      $id('filterModal'),
  filterBackdrop:   $id('filterBackdrop'),
  filterClose:      $id('filterClose'),
  filterTypeChips:     $id('filterTypeChips'),
  filterSeverityChips: $id('filterSeverityChips'),
  filterStatusChips:   $id('filterStatusChips'),
  filterReset:      $id('filterReset'),
  filterApply:      $id('filterApply'),
  toast:            $id('toast'),
  sheetTitle:       $id('sheetTitle'),
  sheetBackBtn:     $id('sheetBackBtn'),
};

/* ================================================
   Init
================================================ */
window.addEventListener('load', () => {
  initMap();
  buildChips();
  buildFilterChips();
  bindEvents();
  renderList();
});

/* ================================================
   KakaoMap
================================================ */
function initMap() {
  const fb = COMPLEX.fallbackCenter;
  map = new kakao.maps.Map(el.map, {
    center: new kakao.maps.LatLng(fb.lat, fb.lng),
    level:  COMPLEX.initLevel,
  });
  geocoder = new kakao.maps.services.Geocoder();
  places   = new kakao.maps.services.Places();
  map.setMinLevel(COMPLEX.minLevel);
  kakao.maps.event.addListener(map, 'click', onMapClick);
  kakao.maps.event.addListener(map, 'zoom_changed', () => {
    if (clusterViewPins) clearClusterView();
  });

  // ── 즉시 fallback 좌표로 경계·뷰 초기화 (keyword search 대기 없음) ──
  initClusterer();
  setupComplexBoundary(fb);
  if (pins.length === 0) placeDemoPins(fb.lat, fb.lng);
  renderAllOverlays();
  renderList();
  setTimeout(() => el.tapHint && el.tapHint.classList.add('hidden'), 3000);

  // ── keyword search: 정확한 좌표가 fallback과 다를 때만 경계 재설정 ──
  places.keywordSearch(COMPLEX.searchQuery, (data, status) => {
    if (status !== kakao.maps.services.Status.OK || !data.length) return;
    const c = { lat: parseFloat(data[0].y), lng: parseFloat(data[0].x) };
    if (Math.abs(c.lat - fb.lat) + Math.abs(c.lng - fb.lng) < 0.0005) return;
    // 데모 핀을 정확한 좌표 기준으로 재배치
    if (pins.some(p => p.id.startsWith('demo'))) {
      pins = pins.filter(p => !p.id.startsWith('demo'));
      placeDemoPins(c.lat, c.lng);
    }
    setupComplexBoundary(c);
    renderAllOverlays();
    renderList();
  });
}

/* ================================================
   단지 경계 폴리곤
================================================ */
function setupComplexBoundary(center) {
  complexCenter = center;
  const { lat, lng } = center;
  const { halfExtent } = COMPLEX;

  complexBoundary = [
    { lat: lat + halfExtent.lat, lng: lng - halfExtent.lng },
    { lat: lat + halfExtent.lat, lng: lng + halfExtent.lng },
    { lat: lat - halfExtent.lat, lng: lng + halfExtent.lng },
    { lat: lat - halfExtent.lat, lng: lng - halfExtent.lng },
  ];

  // setBounds 샘플 방식: LatLngBounds + extend() 로 단지 4개 꼭짓점 범위 구성
  const bounds = new kakao.maps.LatLngBounds();
  complexBoundary.forEach(p => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));

  // 이전 호출 타이머·리스너 취소 (중복 방지)
  clearTimeout(_t1); clearTimeout(_t2);
  if (_dragBoundListener) {
    kakao.maps.event.removeListener(map, 'dragend', _dragBoundListener);
    _dragBoundListener = null;
  }

  // 즉시 대략 포커스 (높이 조정 전, 패딩 0)
  map.setBounds(bounds, 0, 0, 0, 0);

  // 1단계(250ms): 단지 종횡비로 지도 높이 조정 → relayout → setBounds(패딩 0)
  // → 단지 좌표 범위만 페이지 안에 렌더링
  _t1 = setTimeout(() => {
    const complexWm = halfExtent.lng * 2 * Math.cos(lat * Math.PI / 180) * 111320;
    const complexHm = halfExtent.lat * 2 * 111320;
    const newMapH   = Math.round(el.map.offsetWidth * complexHm / complexWm);
    document.documentElement.style.setProperty('--map-h', newMapH + 'px');
    map.relayout();
    map.setBounds(bounds, 0, 0, 0, 0); // 패딩 0: 단지 좌표 범위만 뷰포트에 딱 맞춤

    // 2단계(+200ms): setBounds 안착 후 줌 고정 + 드래그 제한
    _t2 = setTimeout(() => {
      map.setMaxLevel(map.getLevel());
      _dragBoundListener = () => {
        const c    = map.getCenter();
        const lvl  = map.getLevel();
        const vLat = (lvl <= 1 ? 0.0005 : lvl <= 2 ? 0.001 : lvl <= 3 ? 0.002 : 0.003);
        const vLng = vLat * 1.4;
        const cLat = Math.max(lat - halfExtent.lat + vLat, Math.min(lat + halfExtent.lat - vLat, c.getLat()));
        const cLng = Math.max(lng - halfExtent.lng + vLng, Math.min(lng + halfExtent.lng - vLng, c.getLng()));
        if (Math.abs(cLat - c.getLat()) > 1e-9 || Math.abs(cLng - c.getLng()) > 1e-9) {
          map.setCenter(new kakao.maps.LatLng(cLat, cLng));
        }
      };
      kakao.maps.event.addListener(map, 'dragend', _dragBoundListener);
    }, 200);
  }, 250);

  // 단지 라벨
  const labelEl = document.createElement('div');
  Object.assign(labelEl.style, {
    background: 'rgba(59,130,246,.9)', color: '#fff', fontSize: '11px',
    fontWeight: '700', padding: '4px 10px', borderRadius: '99px',
    whiteSpace: 'nowrap', pointerEvents: 'none',
    fontFamily: "-apple-system,'Apple SD Gothic Neo',sans-serif",
  });
  labelEl.textContent = '원베일리 아파트 단지';
  new kakao.maps.CustomOverlay({
    map, content: labelEl, yAnchor: 1, zIndex: 2,
    position: new kakao.maps.LatLng(lat + halfExtent.lat - 0.0004, lng),
  });
}

function pointInPolygon(lat, lng) {
  if (!complexBoundary) return true;
  let inside = false;
  const poly = complexBoundary;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lat, yi = poly[i].lng;
    const xj = poly[j].lat, yj = poly[j].lng;
    if (((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

/* ================================================
   지도 탭 → 말풍선 표시 (모달 바로 열지 않음)
================================================ */
function onMapClick(e) {
  if (Date.now() - lastMarkerClick < 400) return;
  // 등록 모달이 열려 있으면 무시
  if (!el.registerModal.hidden) return;

  const lat = e.latLng.getLat();
  const lng = e.latLng.getLng();

  if (!pointInPolygon(lat, lng)) {
    showToast('단지 내부에만 핀을 등록할 수 있습니다 🏢');
    removeTempMarker();
    return;
  }

  pendingLatLng = e.latLng;
  showTempMarker(lat, lng);
  collapseSheet();
}

/* ================================================
   임시 말풍선 마커
================================================ */
function showTempMarker(lat, lng) {
  removeTempMarker();
  // 생성 시점의 좌표를 클로저로 캡처 (나중에 pendingLatLng가 바뀌어도 안전)
  const captured = new kakao.maps.LatLng(lat, lng);

  const wrap = document.createElement('div');
  wrap.className = 'temp-marker';
  wrap.innerHTML = `
    <div class="temp-balloon">
      <button class="temp-reg-btn">📌 여기에 등록</button>
      <button class="temp-close-btn">✕</button>
    </div>
    <div class="temp-tail"></div>
    <div class="temp-dot"></div>`;

  const regBtn   = wrap.querySelector('.temp-reg-btn');
  const closeBtn = wrap.querySelector('.temp-close-btn');

  // touchstart/touchend 가 KakaoMap 맵 클릭으로 전파되지 않도록 차단
  [regBtn, closeBtn].forEach(btn => {
    btn.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
    btn.addEventListener('touchend',   e => e.stopPropagation(), { passive: true });
  });

  regBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeTempMarker();
    openRegisterModal(captured);
  });
  closeBtn.addEventListener('click', e => {
    e.stopPropagation();
    removeTempMarker();
    pendingLatLng = null;
  });

  tempOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(lat, lng),
    content:  wrap,
    yAnchor:  1.05,
    zIndex:   10,
  });
  tempOverlay.setMap(map);
}

function removeTempMarker() {
  if (tempOverlay) { tempOverlay.setMap(null); tempOverlay = null; }
}

/* ================================================
   Register Modal
================================================ */
function openRegisterModal(latlng) {
  selectedType = null; selectedSev = null; photoData = null;
  el.descInput.value = '';
  el.photoInput.value = '';
  el.photoPreviewWrap.hidden = true;
  el.photoUpload.style.display = '';
  el.typeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  el.severityChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  updateSubmitBtn();
  el.locationText.value = '';
  el.registerModal.hidden = false;
}

function closeRegisterModal() {
  el.registerModal.hidden = true;
  pendingLatLng = null;
}

function updateSubmitBtn() {
  el.submitBtn.disabled = !(selectedType && selectedSev);
}

function submitPin() {
  if (!selectedType || !selectedSev || !pendingLatLng) return;
  const t = PIN_TYPES.find(x => x.id === selectedType);
  const s = SEVERITIES.find(x => x.id === selectedSev);
  const pin = {
    id: Date.now().toString(),
    lat: pendingLatLng.getLat(), lng: pendingLatLng.getLng(),
    type: t.id, typeName: t.label, typeIcon: t.icon, typeColor: t.color, typeBg: t.bg,
    severity: s.id, severityName: s.label, severityColor: s.color,
    description: el.descInput.value.trim(), photo: photoData,
    location: el.locationText.value.trim() || '위치 미입력',
    status: 'pending', createdAt: Date.now(), reporter: '입주민',
  };
  pins.unshift(pin);
  savePins();
  closeRegisterModal();
  _clearClusterState();
  renderAllOverlays();
  renderList();
  map.panTo(new kakao.maps.LatLng(pin.lat, pin.lng));
  showToast('민원이 등록되었습니다 ✅');
}

/* ================================================
   Overlays (Permanent Markers)
================================================ */
/* 핀 1개 → 24×24 line 아이콘 기반 커스텀 MarkerImage */
function createMarkerImage(pin) {
  const urgent = pin.severity === 'urgent';
  const w      = urgent ? 44 : 38;
  const h      = urgent ? 58 : 50;
  const cx     = w / 2;
  const r      = cx - 2;

  // 24px 기준 아이콘을 원 안에 배치 (원 지름의 약 53%)
  const iconPx = Math.round(r * 1.05);
  const scale  = iconPx / 24;
  const off    = Math.round(cx - iconPx / 2);
  const sw     = (2.2 / scale).toFixed(1); // 시각 stroke-width 2.2px 고정

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <circle cx="${cx}" cy="${cx}" r="${r}" fill="${pin.typeColor}" stroke="#fff" stroke-width="2.5"/>
    <g transform="translate(${off},${off}) scale(${scale.toFixed(4)})"
       stroke="#fff" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none">
      ${TYPE_ICONS[pin.type] || TYPE_ICONS.other}
    </g>
    <polygon points="${cx - 6},${w - 3} ${cx + 6},${w - 3} ${cx},${h}" fill="${pin.typeColor}"/>
  </svg>`;

  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return new kakao.maps.MarkerImage(
    url, new kakao.maps.Size(w, h), { offset: new kakao.maps.Point(cx, h) }
  );
}

function createMarker(pin) {
  const marker = new kakao.maps.Marker({
    position: new kakao.maps.LatLng(pin.lat, pin.lng),
    image: createMarkerImage(pin),
    title: pin.typeName,
  });
  kakao.maps.event.addListener(marker, 'click', () => {
    lastMarkerClick = Date.now();
    removeTempMarker();
    openDetailModal(pin.id);
  });
  return marker;
}

function renderAllOverlays() {
  if (clusterer) clusterer.clear();
  markerPinMap = new Map();

  const filtered = getFiltered();
  const markers  = filtered.map(p => {
    const m = createMarker(p);
    markerPinMap.set(m, p);
    return m;
  });
  if (clusterer) clusterer.addMarkers(markers);
}

/* ================================================
   MarkerClusterer 초기화 (공식 KakaoMap API)
================================================ */
function initClusterer() {
  clusterer = new kakao.maps.MarkerClusterer({
    map,
    averageCenter:    true,
    minLevel:         3,       // 레벨 3 이상에서 클러스터링
    disableClickZoom: true,    // 클러스터 클릭 시 자동 줌 방지
    calculator:       [3, 6],  // 2개~: 소형, 3~5개: 중형, 6개~: 대형
    styles: [
      /* 소형 (2개) */
      {
        width: '44px', height: '44px',
        background: 'rgba(59,130,246,.92)',
        borderRadius: '50%',
        border: '3px solid #fff',
        boxShadow: '0 3px 14px rgba(59,130,246,.45)',
        color: '#fff', textAlign: 'center',
        lineHeight: '38px', fontSize: '13px', fontWeight: '800',
      },
      /* 중형 (3~5개) */
      {
        width: '52px', height: '52px',
        background: 'rgba(245,158,11,.92)',
        borderRadius: '50%',
        border: '3px solid #fff',
        boxShadow: '0 3px 14px rgba(245,158,11,.45)',
        color: '#fff', textAlign: 'center',
        lineHeight: '46px', fontSize: '14px', fontWeight: '800',
      },
      /* 대형 (6개+) */
      {
        width: '60px', height: '60px',
        background: 'rgba(239,68,68,.92)',
        borderRadius: '50%',
        border: '3px solid #fff',
        boxShadow: '0 3px 16px rgba(239,68,68,.45)',
        color: '#fff', textAlign: 'center',
        lineHeight: '54px', fontSize: '15px', fontWeight: '800',
      },
    ],
  });

  /* 클러스터 클릭 → 포함된 핀 소팅 후 시트 표시 */
  kakao.maps.event.addListener(clusterer, 'clusterclick', cluster => {
    lastMarkerClick = Date.now();
    removeTempMarker();
    const clusterPins = cluster.getMarkers()
      .map(m => markerPinMap.get(m))
      .filter(Boolean);
    showClusterList(clusterPins);
  });
}

// 클러스터 뷰: 소팅 순서 = 긴급>높음>보통>낮음, 접수대기>처리중>완료, 최신순
function showClusterList(clusterPins) {
  const sevOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const stOrder  = { pending: 0, processing: 1, done: 2 };
  clusterViewPins = [...clusterPins].sort((a, b) => {
    const ds = sevOrder[a.severity] - sevOrder[b.severity];
    if (ds !== 0) return ds;
    const dt = stOrder[a.status] - stOrder[b.status];
    if (dt !== 0) return dt;
    return b.createdAt - a.createdAt;
  });
  renderList();
}

// 상태만 초기화 (renderList 호출 없음)
function _clearClusterState() {
  clusterViewPins = null;
}

// 클러스터 뷰 닫기 + 리스트 갱신
function clearClusterView() {
  _clearClusterState();
  renderList();
}

/* ================================================
   Pin List
================================================ */
function renderList() {
  const list = clusterViewPins || getFiltered();
  el.pinCount.textContent = `${list.length}건`;
  if (!list.length) {
    const hasF = !clusterViewPins && Object.values(filters).some(f => f.length > 0);
    el.pinList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${hasF ? '🔍' : '📍'}</div>
        <p>${hasF ? '조건에 맞는 민원이 없습니다' : '아직 등록된 민원이 없습니다'}</p>
        <p class="sub">${hasF ? '필터를 변경해보세요' : '지도를 탭하여 첫 민원을 등록해보세요'}</p>
      </div>`;
    return;
  }
  el.pinList.innerHTML = list.map(p => {
    const st = STATUSES.find(s => s.id === p.status);
    return `
      <div class="pin-item" data-id="${p.id}">
        <div class="pin-type-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${TYPE_ICONS[p.type] || TYPE_ICONS.other}</svg></div>
        <div class="pin-info">
          <div class="pin-info-top">
            <span class="pin-type-name">${p.typeName}</span>
            <span class="badge" style="background:${p.severityColor}">${p.severityName}</span>
            <span class="status-badge ${st.cls}">${st.label}</span>
          </div>
          ${p.description ? `<div class="pin-desc">${esc(p.description)}</div>` : ''}
          <div class="pin-meta">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span class="pin-meta-loc">${esc(p.location || '위치 없음')}</span>
            <span class="pin-meta-time">${timeAgo(p.createdAt)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  el.pinList.querySelectorAll('.pin-item').forEach(item => {
    item.addEventListener('click', () => {
      const p = pins.find(x => x.id === item.dataset.id);
      if (!p) return;
      openDetailModal(p.id);
      map.panTo(new kakao.maps.LatLng(p.lat, p.lng));
      collapseSheet();
    });
  });
}

/* ================================================
   Detail Modal
================================================ */
function openDetailModal(id) {
  const p = pins.find(x => x.id === id);
  if (!p) return;
  currentDetailId = id;
  const st = STATUSES.find(s => s.id === p.status);
  el.detailTitle.textContent = p.typeName;
  el.detailBody.innerHTML = `
    <div class="detail-hero">
      <div class="detail-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${TYPE_ICONS[p.type] || TYPE_ICONS.other}</svg></div>
      <div class="detail-title-group">
        <div class="detail-type">${p.typeName}</div>
        <div class="detail-badges">
          <span class="badge" style="background:${p.severityColor}">${p.severityName}</span>
          <span class="status-badge ${st.cls}">${st.label}</span>
        </div>
      </div>
    </div>
    ${p.photo ? `<div class="detail-photo"><img src="${p.photo}" alt="민원 사진"></div>` : ''}
    ${p.description ? `<div class="detail-field"><div class="detail-field-label">상세 내용</div><div class="detail-field-val">${esc(p.description)}</div></div>` : ''}
    <div class="detail-field">
      <div class="detail-field-label">위치</div>
      <div class="detail-field-val">${esc(p.location || '위치 정보 없음')}</div>
    </div>
    <div class="detail-divider"></div>
    <div class="detail-row">
      <div class="detail-field">
        <div class="detail-field-label">등록 일시</div>
        <div class="detail-field-val" style="font-size:13px">${fmtDate(p.createdAt)}</div>
      </div>
      <div class="detail-field">
        <div class="detail-field-label">등록자</div>
        <div class="detail-field-val" style="font-size:13px">${p.reporter}</div>
      </div>
    </div>`;
  el.detailModal.hidden = false;
}
function closeDetailModal() { el.detailModal.hidden = true; currentDetailId = null; }

function shareCurrentPin() {
  const p = pins.find(x => x.id === currentDetailId);
  if (!p) return;
  const text = `[원베일리 민원] ${p.typeName} · ${p.severityName}\n📍 ${p.location}\n${p.description ? '💬 ' + p.description + '\n' : ''}🕐 ${fmtDate(p.createdAt)}`;
  if (navigator.share) navigator.share({ title: '원베일리 민원 공유', text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => showToast('클립보드에 복사되었습니다'));
}
function goToCurrentPin() {
  const p = pins.find(x => x.id === currentDetailId);
  if (!p) return;
  closeDetailModal();
  map.setCenter(new kakao.maps.LatLng(p.lat, p.lng));
  map.setLevel(2);
}

/* ================================================
   Filter Modal
================================================ */
function openFilterModal() {
  el.filterTypeChips.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('selected', filters.types.includes(c.dataset.type)));
  el.filterSeverityChips.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('selected', filters.severities.includes(c.dataset.severity)));
  el.filterStatusChips.querySelectorAll('.chip').forEach(c =>
    c.classList.toggle('selected', filters.statuses.includes(c.dataset.status)));
  el.filterModal.hidden = false;
}
function closeFilterModal() { el.filterModal.hidden = true; }
function applyFilter() {
  filters.types      = [...el.filterTypeChips.querySelectorAll('.chip.selected')].map(c => c.dataset.type);
  filters.severities = [...el.filterSeverityChips.querySelectorAll('.chip.selected')].map(c => c.dataset.severity);
  filters.statuses   = [...el.filterStatusChips.querySelectorAll('.chip.selected')].map(c => c.dataset.status);
  const total = filters.types.length + filters.severities.length + filters.statuses.length;
  el.filterBadge.classList.toggle('visible', total > 0);
  if (total > 0) el.filterBadge.textContent = total;
  _clearClusterState();
  renderAllOverlays();
  renderList();
  closeFilterModal();
}
function resetFilter() {
  el.filterTypeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  el.filterSeverityChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  el.filterStatusChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  filters = { types: [], severities: [], statuses: [] };
  el.filterBadge.classList.remove('visible');
  _clearClusterState();
  renderAllOverlays();
  renderList();
  closeFilterModal();
}
function getFiltered() {
  return pins.filter(p => {
    if (filters.types.length      && !filters.types.includes(p.type))         return false;
    if (filters.severities.length && !filters.severities.includes(p.severity)) return false;
    if (filters.statuses.length   && !filters.statuses.includes(p.status))     return false;
    return true;
  });
}

/* ================================================
   Bottom Sheet
   — CSS bottom 속성으로 제어, inline style 조작 없음
================================================ */
function expandSheet()  { el.bottomSheet.classList.add('expanded'); }
function collapseSheet(){ el.bottomSheet.classList.remove('expanded'); }
function toggleSheet()  { el.bottomSheet.classList.toggle('expanded'); }

/* ================================================
   Event Bindings
================================================ */
function bindEvents() {
  // 내 위치
  el.myLocBtn.addEventListener('click', () => {
    if (!navigator.geolocation) return showToast('위치 정보를 사용할 수 없습니다');
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (complexCenter && pointInPolygon(lat, lng)) {
        map.setCenter(new kakao.maps.LatLng(lat, lng));
        map.setLevel(2);
      } else {
        if (complexCenter) map.setCenter(new kakao.maps.LatLng(complexCenter.lat, complexCenter.lng));
        showToast('단지 외부입니다. 단지 중심으로 이동합니다.');
      }
    }, () => showToast('위치 정보 접근에 실패했습니다'));
  });


  // 클러스터 뷰 뒤로가기
  el.sheetBackBtn.addEventListener('click', clearClusterView);

  // ── Bottom Sheet Drag ──────────────────────────────────────
  // inline style 없음 — 순수 클래스 토글만 사용
  let dragStartY = 0;
  let lastTouchEnd = 0;

  el.sheetDragArea.addEventListener('touchstart', e => {
    dragStartY = e.touches[0].clientY;
  }, { passive: true });

  el.sheetDragArea.addEventListener('touchend', e => {
    const now = Date.now();
    const dy = e.changedTouches[0].clientY - dragStartY;

    if (Math.abs(dy) < 10 && now - lastTouchEnd < 300) {
      // 더블탭 방지 — 무시
    } else if (Math.abs(dy) < 10) {
      // 탭: 토글
      toggleSheet();
    } else if (dy > 40) {
      // 스와이프 다운: collapse
      collapseSheet();
    } else if (dy < -40) {
      // 스와이프 업: expand
      expandSheet();
    }
    lastTouchEnd = now;
  }, { passive: true });

  // ── Register Modal ──────────────────────────────────────────
  el.registerBackdrop.addEventListener('click', closeRegisterModal);
  el.registerClose.addEventListener('click',    closeRegisterModal);
  el.submitBtn.addEventListener('click',        submitPin);

  el.typeChips.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    el.typeChips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
    selectedType = c.dataset.type;
    updateSubmitBtn();
  });
  el.severityChips.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    el.severityChips.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
    selectedSev = c.dataset.severity;
    updateSubmitBtn();
  });

  el.photoUpload.addEventListener('click', () => el.photoInput.click());
  el.photoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      photoData = ev.target.result;
      el.photoPreviewImg.src = photoData;
      el.photoUpload.style.display = 'none';
      el.photoPreviewWrap.hidden = false;
    };
    reader.readAsDataURL(file);
  });
  el.photoDel.addEventListener('click', () => {
    photoData = null; el.photoInput.value = '';
    el.photoPreviewWrap.hidden = true; el.photoUpload.style.display = '';
  });

  // ── Detail Modal ────────────────────────────────────────────
  el.detailBackdrop.addEventListener('click', closeDetailModal);
  el.detailClose.addEventListener('click',    closeDetailModal);
  el.detailShare.addEventListener('click',    shareCurrentPin);
  el.detailGo.addEventListener('click',       goToCurrentPin);

  // ── Filter Modal ────────────────────────────────────────────
  el.filterBtn.addEventListener('click',      openFilterModal);
  el.filterBackdrop.addEventListener('click', closeFilterModal);
  el.filterClose.addEventListener('click',    closeFilterModal);
  el.filterApply.addEventListener('click',    applyFilter);
  el.filterReset.addEventListener('click',    resetFilter);
  [el.filterTypeChips, el.filterSeverityChips, el.filterStatusChips].forEach(g => {
    g.addEventListener('click', e => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('selected'); });
  });
}

/* ================================================
   Chip Builders
================================================ */
function buildChips() {
  el.typeChips.innerHTML = PIN_TYPES.map(t =>
    `<button class="chip" data-type="${t.id}" style="--c:${t.color};--cbg:${t.bg}">${t.label}</button>`).join('');
  el.severityChips.innerHTML = SEVERITIES.map(s =>
    `<button class="chip" data-severity="${s.id}" style="--c:${s.color};--cbg:${s.bg}">${s.label}</button>`).join('');
}
function buildFilterChips() {
  el.filterTypeChips.innerHTML = PIN_TYPES.map(t =>
    `<button class="chip" data-type="${t.id}" style="--c:${t.color};--cbg:${t.bg}">${t.label}</button>`).join('');
  el.filterSeverityChips.innerHTML = SEVERITIES.map(s =>
    `<button class="chip" data-severity="${s.id}" style="--c:${s.color};--cbg:${s.bg}">
       ${s.label}</button>`).join('');
  el.filterStatusChips.innerHTML = STATUSES.map(st =>
    `<button class="chip" data-status="${st.id}">${st.label}</button>`).join('');
}

/* ================================================
   Toast
================================================ */
let toastTimer;
function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 2600);
}

/* ================================================
   Storage
================================================ */
function loadPins() {
  try { const r = localStorage.getItem('danziPins'); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
function savePins() {
  try { localStorage.setItem('danziPins', JSON.stringify(pins)); } catch {}
}

/* ================================================
   Demo Pins
================================================ */
function placeDemoPins(baseLat, baseLng) {
  const demos = [
    { type:'facility',    sev:'high',   status:'processing', o:[0.0010, 0.0008],
      desc:'지하주차장 입구 조명 파손 – 야간 시야 불량', loc:'원베일리 지하 주차장 A동 입구', rpt:'101동 입주민' },
    { type:'cleanliness', sev:'medium', status:'pending',    o:[-0.0012, 0.0010],
      desc:'분리수거장 무단투기 및 악취 발생', loc:'단지 내 분리수거장 (B동 옆)', rpt:'305동 입주민' },
    { type:'safety',      sev:'urgent', status:'processing', o:[0.0015, -0.0012],
      desc:'놀이터 미끄럼틀 손잡이 파손 – 아이 부상 위험', loc:'단지 내 어린이 놀이터', rpt:'203동 입주민' },
    { type:'noise',       sev:'medium', status:'pending',    o:[-0.0008, -0.0015],
      desc:'야간 11시 이후 반복적인 소음', loc:'102동 엘리베이터 홀 앞', rpt:'102동 입주민' },
    { type:'parking',     sev:'low',    status:'done',       o:[0.0020, 0.0018],
      desc:'방문자 주차구역 장기 주차 차량 (3일 이상)', loc:'방문자 주차장 23번 구역', rpt:'401동 입주민' },
  ];
  const now = Date.now();
  demos.forEach((d, i) => {
    const t = PIN_TYPES.find(x => x.id === d.type);
    const s = SEVERITIES.find(x => x.id === d.sev);
    pins.push({
      id: `demo${i}`, lat: baseLat + d.o[0], lng: baseLng + d.o[1],
      type: t.id, typeName: t.label, typeIcon: t.icon, typeColor: t.color, typeBg: t.bg,
      severity: s.id, severityName: s.label, severityColor: s.color,
      description: d.desc, photo: null, location: d.loc, status: d.status,
      createdAt: now - (i + 1) * 3600000 * 5, reporter: d.rpt,
    });
  });
  savePins();
}

/* ================================================
   Utils
================================================ */
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function timeAgo(ts) {
  const d = Date.now() - ts, m = Math.floor(d/60000), h = Math.floor(d/3600000), day = Math.floor(d/86400000);
  if (m < 1) return '방금 전'; if (m < 60) return `${m}분 전`;
  if (h < 24) return `${h}시간 전`; if (day < 7) return `${day}일 전`;
  return fmtDate(ts);
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
