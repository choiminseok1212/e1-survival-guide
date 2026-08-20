/* 이등병 생존 가이드 — 소대원 계급 · 근무 · 부재 일정 오프라인 관리
 * 저장소: localStorage (기기 밖으로 나가지 않음), 빌드 도구 없음.
 */
(function () {
  'use strict';

  /* ==================== 상수 ==================== */

  var STORE_KEY = 'e1sg.state.v1';

  var RANKS = [
    { id: 'pvt', short: '이', name: '이병', tier: 1, cls: 'r1' },
    { id: 'pfc', short: '일', name: '일병', tier: 2, cls: 'r2' },
    { id: 'cpl', short: '상', name: '상병', tier: 3, cls: 'r3' },
    { id: 'sgt', short: '병', name: '병장', tier: 4, cls: 'r4' },
    { id: 'ssg', short: '하', name: '하사', tier: 5, cls: 'r5' },
    { id: 'sfc', short: '중', name: '중사', tier: 6, cls: 'r5' },
    { id: 'msg', short: '상', name: '상사', tier: 7, cls: 'r5' },
    { id: 'lt2', short: '소', name: '소위', tier: 8, cls: 'r6' },
    { id: 'lt1', short: '중', name: '중위', tier: 9, cls: 'r6' },
    { id: 'cpt', short: '대', name: '대위', tier: 10, cls: 'r6' }
  ];

  /* 부재 종류. '파견'은 인원보고에서 휴가와 따로 집계한다. */
  var LEAVE_TYPES = ['휴가', '외박', '외출', '병가', '파견', '기타'];
  var DISPATCH_TYPE = '파견';

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  /* 생활관 사로표: 2열 × 6행. 왼쪽 1~5사로, 오른쪽 6~11사로.
   * (왼쪽 열의 마지막 칸은 비워 둔다 — null)
   */
  var SARO_ROWS = 6;
  var SARO_LEFT = [1, 2, 3, 4, 5];
  var SARO_RIGHT = [6, 7, 8, 9, 10, 11];
  var SARO_MAX = 11;

  /* 열 우선(grid-auto-flow: column)으로 채울 칸 순서 */
  function saroCells() {
    var left = SARO_LEFT.slice();
    while (left.length < SARO_ROWS) left.push(null);
    var right = SARO_RIGHT.slice();
    while (right.length < SARO_ROWS) right.push(null);
    return left.concat(right);
  }

  /* 병사 상태 — 이 다섯 가지로만 표시한다 */
  var STATES = {
    duty: { label: '근무', tag: 'tag-duty', bar: 'st-duty' },
    leave: { label: '휴가', tag: 'tag-leave', bar: 'st-leave' },
    dispatch: { label: '파견', tag: 'tag-disp', bar: 'st-disp' },
    off: { label: '휴무', tag: 'tag-off', bar: 'st-off' },
    work: { label: '일과', tag: 'tag-work', bar: 'st-work' },
    rest: { label: '휴식', tag: 'tag-rest', bar: 'st-rest' }
  };

  /* 휴무 종류 */
  var OFF_KINDS = {
    full: { key: 'full', label: '휴무', hint: '일과 전체' },
    half: { key: 'half', label: '반투휴무', hint: '점심 이후 일과' }
  };

  var MEALS = [
    { id: 'b', name: '아침', label: '아침식사집합' },
    { id: 'l', name: '점심', label: '점심식사집합' },
    { id: 'd', name: '저녁', label: '저녁식사집합' }
  ];

  function defaultServing() {
    return {
      count: 4,                                      // 총 배식 수
      step: 10,                                      // 배식 간격(분)
      autoRotate: true,                              // 주마다 순번 회전
      anchor: todayKey(),                            // 회전 기준 주
      order: { b: 4, l: 4, d: 4 },                   // 기준 주의 우리 배식 순번
      base: { b: '08:00', l: '11:30', d: '17:30' }   // 1배식 시각
    };
  }

  function defaultTimes() {
    return {
      morningRoll: '07:30',   // 아침점호
      roomReport: '20:30',    // 생활관 인원보고
      eveningRoll: '21:00',   // 저녁점호집합
      nightWatch: '23:00',    // 불침번 보고
      wakeLead: 10,           // 기상 예고 (분)
      workStart: '08:30',     // 일과 시작
      workEnd: '17:30',       // 일과 종료 (이후는 휴식, 주말은 종일 휴식)
      halfOffFrom: '13:00'    // 반투휴무가 일과에 합류하는 시각
    };
  }

  function defaultDuties() {
    return [
      {
        id: 'd_bul', name: '불침번', kind: 'slots', report: true,
        slots: [
          { id: 'b1', label: '1번초', start: '22:00', end: '23:30', need: 2 },
          { id: 'b2', label: '2번초', start: '23:30', end: '01:00', need: 2 },
          { id: 'b3', label: '3번초', start: '01:00', end: '02:30', need: 2 },
          { id: 'b4', label: '4번초', start: '02:30', end: '04:00', need: 2 },
          { id: 'b5', label: '5번초', start: '04:00', end: '05:30', need: 2 }
        ]
      },
      {
        /* A → B → C → D 가 30분씩 돌아 2시간에 한 바퀴.
         * roll 은 저녁점호 예외: D조는 미리 나가서 없는 것으로,
         * A조는 곧 복귀하므로 있는 것으로 친다.
         */
        id: 'd_cctv', name: 'CCTV', kind: 'slots', report: true,
        slots: [
          { id: 'ca', label: 'A조', rep: { every: 120, offset: 0, dur: 30 }, need: 1, roll: 'present' },
          { id: 'cb', label: 'B조', rep: { every: 120, offset: 30, dur: 30 }, need: 1, roll: '' },
          { id: 'cc', label: 'C조', rep: { every: 120, offset: 60, dur: 30 }, need: 1, roll: '' },
          { id: 'cd', label: 'D조', rep: { every: 120, offset: 90, dur: 30 }, need: 1, roll: 'absent' }
        ]
      },
      {
        id: 'd_gate', name: '위병소', kind: 'slots', report: true,
        slots: [
          { id: 'g1', label: '1교대', start: '08:00', end: '12:00', need: 2 },
          { id: 'g2', label: '2교대', start: '12:00', end: '16:00', need: 2 },
          { id: 'g3', label: '3교대', start: '16:00', end: '20:00', need: 2 },
          { id: 'g4', label: '4교대', start: '20:00', end: '00:00', need: 2 },
          { id: 'g5', label: '5교대', start: '00:00', end: '04:00', need: 2 },
          { id: 'g6', label: '6교대', start: '04:00', end: '08:00', need: 2 }
        ]
      },
      {
        id: 'd_flash', name: '번개조', kind: 'day', report: false,
        slots: [{ id: 'f1', label: '대기', start: '', end: '', need: 3 }]
      },
      {
        id: 'd_duty', name: '당직', kind: 'day', report: true,
        slots: [
          { id: 't1', label: '당직사관', start: '', end: '', need: 1 },
          { id: 't2', label: '당직병', start: '', end: '', need: 1 }
        ]
      }
    ];
  }

  /* ==================== 상태 ==================== */

  var S = load();
  var UI = {
    tab: 'today', date: todayKey(), month: monthKey(new Date()),
    todayOffset: 0,       // 오늘(0) · D-1(1) · D-2(2) 중 보고 있는 화면
    rosterMode: 'list',   // 명단 | 사로표
    scopeRoom: null       // 한장 요약에서 선택한 생활관 (null = 소대 전체)
  };

  function blankState() {
    return {
      v: 1, unit: '', meId: null,
      members: [], rooms: [], duties: defaultDuties(),
      assign: {}, leaves: [], daily: {},
      serving: defaultServing(), times: defaultTimes()
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return blankState();
      var s = JSON.parse(raw);
      var base = blankState();
      base.v = 1;
      base.unit = s.unit || '';
      base.meId = s.meId || null;
      base.members = Array.isArray(s.members) ? s.members : [];
      base.rooms = Array.isArray(s.rooms) ? s.rooms : [];
      base.duties = Array.isArray(s.duties) && s.duties.length ? s.duties : defaultDuties();
      base.assign = s.assign && typeof s.assign === 'object' ? s.assign : {};
      base.leaves = Array.isArray(s.leaves) ? s.leaves : [];
      base.daily = s.daily && typeof s.daily === 'object' ? s.daily : {};
      /* 이전 버전에서 올라온 데이터에 새 설정 채우기 */
      base.serving = merge(defaultServing(), s.serving);
      base.serving.order = merge(defaultServing().order, s.serving && s.serving.order);
      base.serving.base = merge(defaultServing().base, s.serving && s.serving.base);
      base.times = merge(defaultTimes(), s.times);
      base.duties.forEach(function (d) {
        if (typeof d.report !== 'boolean') d.report = true;
        d.slots.forEach(function (sl) {
          if (typeof sl.roll !== 'string') sl.roll = '';
        });
      });
      /* 손대지 않은 옛 CCTV(4시간 6교대)만 A~D조 반복 근무로 바꾼다 */
      var old = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];
      base.duties.forEach(function (d) {
        if (d.id !== 'd_cctv') return;
        var untouched = d.slots.length === 6 && d.slots.every(function (sl) {
          return old.indexOf(sl.id) >= 0 && !sl.rep;
        });
        if (!untouched) return;
        defaultDuties().forEach(function (def) {
          if (def.id === 'd_cctv') d.slots = def.slots;
        });
        Object.keys(base.assign).forEach(function (dk) {
          if (base.assign[dk].d_cctv) delete base.assign[dk].d_cctv;
        });
      });
      return base;
    } catch (e) {
      return blankState();
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(S));
    } catch (e) {
      toast('저장 실패: 기기 저장공간을 확인하세요');
    }
  }

  /* ==================== 유틸 ==================== */

  /** 기본값 위에 저장된 값을 얹는다 (없는 키는 기본값 유지). */
  function merge(def, over) {
    var out = {};
    Object.keys(def).forEach(function (k) { out[k] = def[k]; });
    if (over && typeof over === 'object') {
      Object.keys(over).forEach(function (k) {
        if (over[k] !== null && over[k] !== undefined && k in def) out[k] = over[k];
      });
    }
    return out;
  }

  function uid(p) {
    return (p || 'x') + '_' + Math.random().toString(36).slice(2, 9);
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function toKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromKey(k) {
    var p = String(k).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function todayKey() {
    return toKey(new Date());
  }

  function monthKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function addDays(k, n) {
    var d = fromKey(k);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  function fmtDate(k) {
    var d = fromKey(k);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DOW[d.getDay()] + ')';
  }

  function fmtDateLong(k) {
    var d = fromKey(k);
    return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DOW[d.getDay()] + '요일';
  }

  function rank(id) {
    for (var i = 0; i < RANKS.length; i++) if (RANKS[i].id === id) return RANKS[i];
    return RANKS[0];
  }

  function member(id) {
    for (var i = 0; i < S.members.length; i++) if (S.members[i].id === id) return S.members[i];
    return null;
  }

  function duty(id) {
    for (var i = 0; i < S.duties.length; i++) if (S.duties[i].id === id) return S.duties[i];
    return null;
  }

  /** 선임 순서: 계급 높은 순 → 입대일 이른 순 → 이름 */
  function bySeniority(a, b) {
    var ta = rank(a.rankId).tier, tb = rank(b.rankId).tier;
    if (ta !== tb) return tb - ta;
    var ea = a.enlist || '9999-99-99', eb = b.enlist || '9999-99-99';
    if (ea !== eb) return ea < eb ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'ko');
  }

  function roster() {
    return S.members.slice().sort(bySeniority);
  }

  function daysUntil(dateKey) {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((fromKey(dateKey) - t) / 86400000);
  }

  function ddayText(m) {
    if (!m.discharge) return '';
    var n = daysUntil(m.discharge);
    if (n > 0) return '전역 D-' + n;
    if (n === 0) return '전역일';
    return '전역';
  }

  /* ----- 배정 접근 ----- */

  function assignedIds(dateKey, dutyId, slotId) {
    var a = S.assign[dateKey];
    if (!a || !a[dutyId] || !a[dutyId][slotId]) return [];
    return a[dutyId][slotId].filter(function (id) { return !!member(id); });
  }

  function setAssigned(dateKey, dutyId, slotId, ids) {
    if (!S.assign[dateKey]) S.assign[dateKey] = {};
    if (!S.assign[dateKey][dutyId]) S.assign[dateKey][dutyId] = {};
    if (ids.length) S.assign[dateKey][dutyId][slotId] = ids;
    else delete S.assign[dateKey][dutyId][slotId];
    if (!Object.keys(S.assign[dateKey][dutyId]).length) delete S.assign[dateKey][dutyId];
    if (!Object.keys(S.assign[dateKey]).length) delete S.assign[dateKey];
    save();
  }

  function dayHasDuty(dateKey) {
    var a = S.assign[dateKey];
    if (!a) return false;
    var dk = Object.keys(a);
    for (var i = 0; i < dk.length; i++) {
      var sk = Object.keys(a[dk[i]]);
      for (var j = 0; j < sk.length; j++) if (a[dk[i]][sk[j]].length) return true;
    }
    return false;
  }

  /** 해당 날짜에 이 사람이 맡은 근무 목록 */
  function dutiesOf(memberId, dateKey) {
    var out = [];
    S.duties.forEach(function (d) {
      d.slots.forEach(function (sl) {
        if (assignedIds(dateKey, d.id, sl.id).indexOf(memberId) >= 0) {
          out.push({ dateKey: dateKey, duty: d, slot: sl });
        }
      });
    });
    return out;
  }

  function dutyCount(memberId, days) {
    var n = 0;
    for (var i = 0; i < days; i++) n += dutiesOf(memberId, addDays(todayKey(), -i)).length;
    return n;
  }

  /* ----- 부재(휴가/외박/외출) ----- */

  function leaveOn(memberId, dateKey) {
    for (var i = 0; i < S.leaves.length; i++) {
      var lv = S.leaves[i];
      if (lv.memberId === memberId && dateKey >= lv.start && dateKey <= lv.end) return lv;
    }
    return null;
  }

  function leavesOn(dateKey) {
    return S.leaves.filter(function (lv) {
      return dateKey >= lv.start && dateKey <= lv.end && member(lv.memberId);
    });
  }

  /* ----- 시간대 ----- */

  /* 보통 슬롯은 start~end 한 구간이다. rep 가 붙으면 하루에 여러 번 도는
   * 반복 근무다. 예) CCTV A조 = 2시간(every 120)마다 0분에 30분씩.
   */
  function slotWindows(dateKey, slot) {
    var out = [];
    if (slot.rep && slot.rep.dur) {
      var every = Math.max(1, +slot.rep.every || 120);
      var off = ((+slot.rep.offset || 0) % every + every) % every;
      var dur = Math.max(1, +slot.rep.dur);
      for (var m = off; m < 1440; m += every) {
        var rs = fromKey(dateKey), re = fromKey(dateKey);
        rs.setMinutes(m);
        re.setMinutes(m + dur);
        out.push([rs, re]);
      }
      return out;
    }
    if (!slot.start || !slot.end) return out;
    var s = fromKey(dateKey), e = fromKey(dateKey);
    var sp = slot.start.split(':'), ep = slot.end.split(':');
    s.setHours(+sp[0], +sp[1], 0, 0);
    e.setHours(+ep[0], +ep[1], 0, 0);
    if (e <= s) e.setDate(e.getDate() + 1);
    out.push([s, e]);
    return out;
  }

  /** 첫 구간만 필요한 곳을 위한 짧은 이름 */
  function slotWindow(dateKey, slot) {
    var ws = slotWindows(dateKey, slot);
    return ws.length ? ws[0] : null;
  }

  function repText(rep) {
    var every = Math.max(1, +rep.every || 120);
    var off = ((+rep.offset || 0) % every + every) % every;
    var dur = Math.max(1, +rep.dur || 30);
    var hh = Math.floor(off / 60), mm = off % 60;
    if (every === 120) {
      return (hh % 2 === 0 ? '짝수시' : '홀수시') + ' ' + (mm === 0 ? '정각' : mm + '분') + ' · ' + dur + '분';
    }
    if (every === 60) return '매시 ' + mm + '분 · ' + dur + '분';
    return minToHm(off) + '부터 ' + every + '분마다 · ' + dur + '분';
  }

  function slotTimeText(slot) {
    if (slot.rep && slot.rep.dur) return repText(slot.rep);
    if (!slot.start || !slot.end) return '';
    return slot.start + ' – ' + slot.end;
  }

  function isLive(dateKey, slot, now) {
    return slotWindows(dateKey, slot).some(function (w) {
      return now >= w[0] && now < w[1];
    });
  }

  /** 지금 진행 중인 근무 (어제 날짜의 야간 근무 포함) */
  function liveDuties(now) {
    var out = [];
    [addDays(todayKey(), -1), todayKey()].forEach(function (dk) {
      S.duties.forEach(function (d) {
        d.slots.forEach(function (sl) {
          if (!isLive(dk, sl, now)) return;
          var ids = assignedIds(dk, d.id, sl.id);
          if (ids.length) out.push({ dateKey: dk, duty: d, slot: sl, ids: ids });
        });
      });
    });
    return out;
  }

  function nextDutyOf(memberId, now) {
    for (var i = 0; i < 21; i++) {
      var dk = addDays(todayKey(), i);
      var best = null;
      dutiesOf(memberId, dk).forEach(function (it) {
        var ws = slotWindows(dk, it.slot);
        if (!ws.length) {
          /* 일 단위 근무는 그날이 지나지 않았으면 예정으로 본다 */
          var dayStart = fromKey(dk), dayEnd = fromKey(dk);
          dayEnd.setDate(dayEnd.getDate() + 1);
          if (dayEnd > now && (!best || dayStart < best.at)) best = { at: dayStart, it: it };
          return;
        }
        ws.forEach(function (w) {
          if (w[1] <= now) return;
          if (!best || w[0] < best.at) best = { at: w[0], it: it };
        });
      });
      if (best) return best.it;
    }
    return null;
  }

  /* ==================== 생활관 · 사로 ==================== */

  function room(id) {
    for (var i = 0; i < S.rooms.length; i++) if (S.rooms[i].id === id) return S.rooms[i];
    return null;
  }

  function roomName(id) {
    var r = room(id);
    return r ? r.name : '생활관 미지정';
  }

  function membersInRoom(id) {
    return roster().filter(function (m) { return (m.roomId || null) === id; });
  }

  /** roomId 가 null 이면 소대 전체 */
  function scopeList(roomId) {
    return roomId ? membersInRoom(roomId) : roster();
  }

  function saroOccupant(roomId, n) {
    var list = membersInRoom(roomId);
    for (var i = 0; i < list.length; i++) if (+list[i].saro === n) return list[i];
    return null;
  }

  /** 사로 배정. 이미 누가 있으면 그 사람의 사로를 비운다. */
  function setSaro(memberId, roomId, n) {
    var m = member(memberId);
    if (!m) return;
    if (n) {
      var prev = saroOccupant(roomId, n);
      if (prev && prev.id !== memberId) prev.saro = null;
    }
    m.roomId = roomId || null;
    m.saro = n || null;
    save();
  }

  /* ==================== 시각 유틸 ==================== */

  function hmToMin(hm) {
    var p = String(hm || '00:00').split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }

  function minToHm(min) {
    min = ((min % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  function addMin(hm, n) {
    return minToHm(hmToMin(hm) + n);
  }

  function atTime(dateKey, hm) {
    var d = fromKey(dateKey);
    d.setMinutes(hmToMin(hm));
    return d;
  }

  function fmtHm(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ==================== 배식 순번 ==================== */

  /** 월요일 시작 주의 첫날 */
  function weekStartKey(k) {
    var d = fromKey(k);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toKey(d);
  }

  /** 주마다 한 칸씩 밀린다 (설정에서 끌 수 있음) */
  function servingNo(mealId, dateKey) {
    var cfg = S.serving;
    var cnt = Math.max(1, +cfg.count || 1);
    var base = Math.min(cnt, Math.max(1, +cfg.order[mealId] || 1));
    if (!cfg.autoRotate) return base;
    var weeks = Math.round(
      (fromKey(weekStartKey(dateKey)) - fromKey(weekStartKey(cfg.anchor || dateKey))) / (7 * 86400000)
    );
    return ((base - 1 + weeks) % cnt + cnt) % cnt + 1;
  }

  function servingTime(mealId, dateKey) {
    return addMin(S.serving.base[mealId], (servingNo(mealId, dateKey) - 1) * (+S.serving.step || 10));
  }

  /* ==================== 그날의 수동 입력 ==================== */

  function dailyBlank() {
    return { seonsik: [], chuimin: [], yeondeung: [], off: {}, temp: {}, notes: {}, status: '' };
  }

  /** 읽기 전용 (저장소를 건드리지 않음) */
  function dailyGet(dateKey) {
    return merge(dailyBlank(), S.daily[dateKey]);
  }

  /** 수정용 (없으면 만든다. 호출한 쪽에서 save()) */
  function dailyEdit(dateKey) {
    if (!S.daily[dateKey]) S.daily[dateKey] = dailyBlank();
    var d = S.daily[dateKey];
    if (!Array.isArray(d.seonsik)) d.seonsik = [];
    if (!Array.isArray(d.chuimin)) d.chuimin = [];
    if (!Array.isArray(d.yeondeung)) d.yeondeung = [];
    if (!d.off || typeof d.off !== 'object') d.off = {};
    if (!d.temp) d.temp = {};
    if (!d.notes) d.notes = {};
    if (typeof d.status !== 'string') d.status = '';
    return d;
  }

  /* ==================== 병사 상태 ==================== */

  /** 그 시각에 실제로 근무 중인지 (자정을 넘는 근무와 일 단위 근무 포함) */
  function onDutyAt(memberId, dateKey, when) {
    var hit = null;
    [addDays(dateKey, -1), dateKey].forEach(function (dk) {
      S.duties.forEach(function (d) {
        d.slots.forEach(function (sl) {
          if (hit) return;
          if (assignedIds(dk, d.id, sl.id).indexOf(memberId) < 0) return;
          var ws = slotWindows(dk, sl);
          var on = ws.length
            ? ws.some(function (w) { return when >= w[0] && when < w[1]; })
            : (dk === dateKey);
          if (on) hit = { duty: d, slot: sl, dateKey: dk };
        });
      });
    });
    return hit;
  }

  /** 그날 휴무 종류 ('full' | 'half' | null) */
  function offKindOf(memberId, dateKey) {
    var o = dailyGet(dateKey).off || {};
    return o[memberId] === 'full' || o[memberId] === 'half' ? o[memberId] : null;
  }

  /** 그 시각에 휴무 중인가 (반투휴무는 점심 전까지) */
  function isOffAt(memberId, dateKey, when) {
    var kind = offKindOf(memberId, dateKey);
    if (!kind) return false;
    if (kind === 'full') return true;
    return (when.getHours() * 60 + when.getMinutes()) < hmToMin(S.times.halfOffFrom);
  }

  /** 일과 시간인가 (주말은 종일 휴식) */
  function isWorkTime(dateKey, when) {
    var wd = fromKey(dateKey).getDay();
    if (wd === 0 || wd === 6) return false;
    var mins = when.getHours() * 60 + when.getMinutes();
    return mins >= hmToMin(S.times.workStart) && mins < hmToMin(S.times.workEnd);
  }

  /** 화면에 쓸 기준 시각 — 오늘은 지금, 다른 날은 정오 */
  function refTime(dateKey) {
    return dateKey === todayKey() ? new Date() : atTime(dateKey, '12:00');
  }

  /** 근무 · 휴가 · 파견 · 일과 · 휴식 중 하나 */
  function stateOf(m, dateKey, when) {
    when = when || refTime(dateKey);
    var lv = leaveOn(m.id, dateKey);
    if (lv) return lv.type === DISPATCH_TYPE ? STATES.dispatch : STATES.leave;
    if (onDutyAt(m.id, dateKey, when)) return STATES.duty;
    if (!isWorkTime(dateKey, when)) return STATES.rest;
    return isOffAt(m.id, dateKey, when) ? STATES.off : STATES.work;
  }

  /* ==================== 인원 집계 ==================== */

  /**
   * 기준 시각의 인원 현황.
   * opts.seonsik / opts.yeondeung 가 true 면 그 인원을 현재원에서 뺀다.
   */
  function counts(dateKey, hm, roomId, opts) {
    opts = opts || {};
    var list = scopeList(roomId);
    var inScope = {};
    list.forEach(function (m) { inScope[m.id] = 1; });

    var leave = [], dispatch = [], absent = {};
    list.forEach(function (m) {
      var lv = leaveOn(m.id, dateKey);
      if (!lv) return;
      if (lv.type === DISPATCH_TYPE) dispatch.push(m.id);
      else leave.push(m.id);
      absent[m.id] = 1;
    });

    var when = atTime(dateKey, hm);
    var taken = {}, byType = [], dutyIds = [];
    S.duties.forEach(function (d) {
      if (!d.report) return;
      var hit = [];
      d.slots.forEach(function (sl) {
        /* 저녁점호에서는 슬롯별 예외를 먼저 본다.
         * present = 곧 복귀하므로 있는 것으로, absent = 미리 나가므로 없는 것으로.
         */
        var forced = opts.eveningRoll ? (sl.roll || '') : '';
        if (forced === 'present') return;
        [addDays(dateKey, -1), dateKey].forEach(function (dk) {
          var ws = slotWindows(dk, sl);
          var on = forced === 'absent'
            ? (dk === dateKey)
            : (ws.length ? ws.some(function (w) { return when >= w[0] && when < w[1]; }) : (dk === dateKey));
          if (!on) return;
          assignedIds(dk, d.id, sl.id).forEach(function (id) {
            if (!inScope[id] || absent[id] || taken[id]) return;
            taken[id] = 1;
            hit.push(id);
          });
        });
      });
      if (hit.length) {
        byType.push({ name: d.name, ids: hit });
        dutyIds = dutyIds.concat(hit);
      }
    });

    function pick(field) {
      return dailyGet(dateKey)[field].filter(function (id) {
        return inScope[id] && !absent[id] && !taken[id];
      });
    }

    var chuimin = pick('chuimin');
    chuimin.forEach(function (id) { taken[id] = 1; });
    var seonsik = pick('seonsik');
    var yeondeung = pick('yeondeung');

    /* 휴무는 부대 안에 있으므로 현재원에서 빼지 않는다. 내역으로만 적는다. */
    var dayOff = dailyGet(dateKey).off || {};
    var offFull = [], offHalf = [];
    list.forEach(function (m) {
      if (absent[m.id]) return;
      if (dayOff[m.id] === 'full') offFull.push(m.id);
      else if (dayOff[m.id] === 'half') offHalf.push(m.id);
    });

    var duty = dutyIds.length + chuimin.length;
    var present = list.length - leave.length - dispatch.length - duty;
    if (opts.seonsik) present -= seonsik.length;
    if (opts.yeondeung) present -= yeondeung.length;

    var detail = byType.map(function (t) { return t.name + ' ' + t.ids.length; });
    if (chuimin.length) detail.push('근무취침 ' + chuimin.length);

    return {
      total: list.length,
      leave: leave, dispatch: dispatch,
      byType: byType, dutyIds: dutyIds, chuimin: chuimin,
      seonsik: seonsik, yeondeung: yeondeung,
      offFull: offFull, offHalf: offHalf, off: offFull.length + offHalf.length,
      duty: duty, detail: detail.join(', '),
      present: Math.max(0, present)
    };
  }

  /* ==================== 보고 문구 ==================== */

  function head(roomId) {
    return roomId ? roomName(roomId) + ' ' : (S.unit ? S.unit + ' ' : '');
  }

  /** 근무 인원 문구 (0명이면 아예 적지 않는다) */
  function dutyPart(c) {
    return c.duty > 0 ? ['근무 ' + c.duty + '명' + (c.detail ? '(' + c.detail + ')' : '')] : [];
  }

  /** 휴무 인원 문구 (0명이면 아예 적지 않는다) */
  function offPart(c) {
    if (!c.off) return [];
    return ['휴무 ' + c.off + '명' + (c.offHalf.length ? '(반투 ' + c.offHalf.length + '명)' : '')];
  }

  /** 총원 · 휴가 · 파견. 휴가는 0명이면 적지 않는다. */
  function headParts(c) {
    var out = ['총원 ' + c.total + '명'];
    if (c.leave.length) out.push('휴가 ' + c.leave.length + '명');
    out.push('파견 ' + c.dispatch.length + '명');
    return out;
  }

  /** 총원 · 휴가 · 파견 · 근무 · 휴무 공통 앞부분 */
  function baseParts(c) {
    return headParts(c).concat(dutyPart(c), offPart(c));
  }

  function rollText(label, hm, dateKey, roomId, evening) {
    var c = counts(dateKey, hm, roomId, { eveningRoll: !!evening });
    return head(roomId) + label + ' (' + hm + ') ' +
      baseParts(c).join(', ') + ', 현재원 ' + c.present + '명';
  }

  function mealText(meal, dateKey, roomId) {
    var hm = servingTime(meal.id, dateKey);
    var c = counts(dateKey, hm, roomId, { seonsik: true });
    return head(roomId) + meal.label + ' (' + servingNo(meal.id, dateKey) + '배식 ' + hm + ') ' +
      baseParts(c).concat(['선식 ' + c.seonsik.length + '명']).join(', ') +
      ', 현재원 ' + c.present + '명';
  }

  function roomsReportText(dateKey) {
    var hm = S.times.roomReport;
    var lines = ['생활관 인원보고 (' + hm + ')'];
    S.rooms.forEach(function (r) {
      var c = counts(dateKey, hm, r.id);
      lines.push(r.name + ' ' + baseParts(c).join(', ') + ', 현재원 ' + c.present + '명');
    });
    var un = membersInRoom(null);
    if (un.length) lines.push('생활관 미지정 ' + un.length + '명');
    return lines.join('\n');
  }

  /** 다음 근무 투입자 기상 안내 */
  function wakeLines(dateKey, hm, roomId) {
    var from = atTime(dateKey, hm);
    var lead = Math.max(0, +S.times.wakeLead || 0);
    var out = [];
    [dateKey, addDays(dateKey, 1)].forEach(function (dk) {
      S.duties.forEach(function (d) {
        d.slots.forEach(function (sl) {
          /* 반복 근무는 다가오는 첫 회차만 안내한다 */
          var up = slotWindows(dk, sl).filter(function (x) {
            var mm = (x[0] - from) / 60000;
            return mm > 0 && mm <= 480;
          });
          if (!up.length) return;
          var w = up[0];
          assignedIds(dk, d.id, sl.id).forEach(function (id) {
            var m = member(id);
            if (!m || leaveOn(id, dk)) return;
            if (roomId && (m.roomId || null) !== roomId) return;
            out.push({
              at: w[0],
              text: d.name + ' ' + sl.label + ' ' + m.name + ' ' +
                minToHm(hmToMin(fmtHm(w[0])) - lead) + ' 기상 (' + fmtHm(w[0]) + ' 투입)'
            });
          });
        });
      });
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out.map(function (x) { return x.text; });
  }

  function watchText(dateKey, roomId) {
    var hm = S.times.nightWatch;
    var c = counts(dateKey, hm, roomId, { yeondeung: true });
    var day = dailyGet(dateKey);
    var lines = [head(roomId) + '불침번 보고 (' + hm + ')'];
    lines.push(headParts(c)
      .concat(dutyPart(c), ['연등 ' + c.yeondeung.length + '명', '현재원 ' + c.present + '명']).join(', '));
    var temp = roomId ? day.temp[roomId] : null;
    lines.push('생활관 온도 ' + (temp ? temp + '도' : '(미입력)'));
    var notes = [].concat(wakeLines(dateKey, hm, roomId));
    var free = roomId ? day.notes[roomId] : day.notes.all;
    if (free) notes.push(free);
    lines.push('특이사항: ' + (notes.length ? notes.join(' / ') : '없음'));
    return lines.join('\n');
  }

  /* ==================== DOM 헬퍼 ==================== */

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    var kids = [].slice.call(arguments, 2);
    (function push(list) {
      list.forEach(function (kid) {
        if (kid === null || kid === undefined || kid === false) return;
        if (Array.isArray(kid)) return push(kid);
        el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
      });
    })(kids);
    return el;
  }

  function rankBadge(m, small) {
    var r = rank(m.rankId);
    return h('span', { class: 'rank ' + r.cls + (small ? ' rank-sm' : ''), title: r.name }, r.short);
  }

  function toast(msg) {
    var root = document.getElementById('toast-root');
    var el = h('div', { class: 'toast' }, msg);
    root.appendChild(el);
    setTimeout(function () {
      el.remove();
    }, 2200);
  }

  /** 바텀시트. body/foot 노드를 받아 표시하고, 닫기 함수를 반환. */
  function sheet(title, body, footButtons) {
    var root = document.getElementById('sheet-root');
    var back = h('div', {
      class: 'sheet-back',
      onclick: function (e) {
        if (e.target === back) close();
      }
    });
    function close() {
      back.remove();
    }
    var panel = h('div', { class: 'sheet' },
      h('div', { class: 'sheet-bar' },
        h('h2', null, title),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: close }, '닫기')
      ),
      h('div', { class: 'sheet-body' }, body),
      footButtons && footButtons.length ? h('div', { class: 'sheet-foot' }, footButtons) : null
    );
    back.appendChild(panel);
    root.appendChild(back);
    return close;
  }

  function confirmSheet(title, message, onYes, yesLabel) {
    var close = sheet(title, h('p', { class: 'muted small', style: 'margin:2px 0 4px' }, message), [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-danger', onclick: function () {
          close();
          onYes();
        }
      }, yesLabel || '삭제')
    ]);
  }

  function field(label, control) {
    return h('div', { class: 'field' }, h('label', null, label), control);
  }

  /* ==================== 화면: 오늘 ==================== */

  /* 오늘 · D-1 · D-2 세 장을 같은 화면으로 넘겨 본다.
   * 날짜를 기준으로 그리므로 하루가 지나면 D-1 이 오늘 자리로 올라온다.
   */
  var DAY_PAGES = [
    { off: 0, tag: '오늘', word: '오늘' },
    { off: 1, tag: 'D-1', word: '내일' },
    { off: 2, tag: 'D-2', word: '모레' }
  ];

  function dayPage() {
    return DAY_PAGES[UI.todayOffset] || DAY_PAGES[0];
  }

  function dayPageSwitch() {
    var seg = h('div', { class: 'seg' });
    DAY_PAGES.forEach(function (pg) {
      var k = addDays(todayKey(), pg.off);
      var d = fromKey(k);
      var memo = dailyGet(k).status;
      seg.appendChild(h('button', {
        class: 'seg-btn seg-2', 'aria-pressed': UI.todayOffset === pg.off ? 'true' : 'false',
        onclick: function () {
          UI.todayOffset = pg.off;
          render();
          window.scrollTo(0, 0);
        }
      },
        h('span', null, pg.tag, memo ? h('i', { class: 'seg-dot' }) : null),
        h('span', { class: 'seg-sub' }, (d.getMonth() + 1) + '/' + d.getDate() + ' (' + DOW[d.getDay()] + ')')
      ));
    });
    return seg;
  }

  function viewToday() {
    var page = dayPage();
    var dk = addDays(todayKey(), page.off);
    var isToday = page.off === 0;
    var now = new Date();
    var wrap = h('div');
    var all = roster();

    wrap.appendChild(dayPageSwitch());

    if (!all.length) {
      wrap.appendChild(h('div', null,
        h('div', { class: 'card' },
          h('div', { class: 'empty' },
            h('div', { style: 'font-size:34px;margin-bottom:6px' }, '🫡'),
            h('div', { class: 'strong', style: 'color:var(--text);font-size:16px' }, '먼저 소대원을 등록하세요'),
            h('div', { style: 'margin-top:6px' }, '이름과 계급만 넣어도 선임 순서와 근무표를 쓸 수 있습니다.')
          ),
          h('button', {
            class: 'btn btn-primary btn-block', onclick: function () { editMember(null); }
          }, '＋ 소대원 추가')
        ),
        h('div', { class: 'card' },
          h('div', { class: 'card-title' }, '이 앱에 대해'),
          h('p', { class: 'small muted', style: 'margin:0' },
            '모든 데이터는 이 폰 안에만 저장됩니다. 인터넷이 끊겨도, 비행기 모드에서도 그대로 동작합니다. ' +
            '설정 탭에서 백업 문자열을 복사해 두면 폰을 바꿔도 옮길 수 있습니다.')
        )
      ));
      return wrap;
    }

    /* 그날 상태 · 특이사항 */
    var memo = dailyGet(dk).status;
    wrap.appendChild(h('button', {
      class: 'dstat' + (isToday ? ' is-today' : ''), style: 'margin-bottom:12px',
      onclick: function () { editStatus(dk, page); }
    },
      h('div', { class: 'dstat-head' },
        h('span', { class: 'dstat-tag' }, page.tag),
        h('span', { class: 'dstat-date' }, page.word + ' · ' + fmtDate(dk) + ' 상태 · 특이사항')
      ),
      h('div', { class: 'dstat-body' + (memo ? '' : ' faint') }, memo || '눌러서 미리 적어두기')
    ));

    /* 지금 근무 중 — 오늘 화면에서만 뜻이 있다 */
    if (isToday) {
      var live = liveDuties(now);
      var liveCard = h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', { class: 'card-title' }, '지금 근무 중'),
          h('div', { class: 'tiny faint mono' }, pad(now.getHours()) + ':' + pad(now.getMinutes()))
        )
      );
      if (!live.length) {
        liveCard.appendChild(h('div', { class: 'small faint' }, '진행 중인 근무가 없습니다.'));
      } else {
        live.forEach(function (it) {
          liveCard.appendChild(h('div', { class: 'slot is-live' },
            h('div', { class: 'slot-head' },
              h('span', { class: 'slot-label' }, it.duty.name + ' · ' + it.slot.label),
              h('span', { class: 'slot-time' }, slotTimeText(it.slot))
            ),
            h('div', { class: 'slot-people' }, it.ids.map(function (id) {
              return personChip(member(id), it.dateKey);
            }))
          ));
        });
      }
      wrap.appendChild(liveCard);
    }

    /* 내 상황 — 오늘은 '다음 근무', 미리 보는 날은 '그날 내 근무' */
    if (S.meId && member(S.meId)) {
      var me = member(S.meId);
      var lv = leaveOn(me.id, dk);
      var mine = dutiesOf(me.id, dk);
      var dutyText;
      if (isToday) {
        var nx = nextDutyOf(me.id, now);
        dutyText = nx
          ? (fmtDate(nx.dateKey) + ' ' + nx.duty.name + ' ' + nx.slot.label +
            (slotTimeText(nx.slot) ? ' (' + slotTimeText(nx.slot) + ')' : ''))
          : '예정 없음';
      } else {
        dutyText = mine.length
          ? mine.map(function (x) {
            return x.duty.name + ' ' + x.slot.label +
              (slotTimeText(x.slot) ? ' (' + slotTimeText(x.slot) + ')' : '');
          }).join(', ')
          : '편성 없음';
      }
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-title' }, '내 상황 · ' + me.name),
        h('div', { class: 'kv' },
          h('span', { class: 'k' }, isToday ? '다음 근무' : page.word + ' 근무'),
          h('span', { class: 'strong' }, dutyText)
        ),
        h('div', { class: 'kv' },
          h('span', { class: 'k' }, page.word + ' 상태'),
          h('span', { class: 'strong' }, lv ? lv.type + ' 중' : '정상 근무')
        ),
        me.discharge ? h('div', { class: 'kv' },
          h('span', { class: 'k' }, '전역'),
          h('span', { class: 'dday' }, ddayText(me))
        ) : null
      ));
    }

    /* 그날 근무 편성 */
    var todayCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, page.word + ' 근무 편성'),
        h('button', {
          class: 'btn btn-sm btn-ghost', onclick: function () {
            UI.date = dk;
            go('duty');
          }
        }, '편성하기')
      )
    );
    var any = false;
    S.duties.forEach(function (d) {
      var rows = d.slots.filter(function (sl) { return assignedIds(dk, d.id, sl.id).length; });
      if (!rows.length) return;
      any = true;
      todayCard.appendChild(h('div', { class: 'section-title', style: 'margin:10px 2px 2px' }, d.name));
      rows.forEach(function (sl) {
        todayCard.appendChild(h('div', { class: 'slot' + (isLive(dk, sl, now) ? ' is-live' : '') },
          h('div', { class: 'slot-head' },
            h('span', { class: 'slot-label' }, sl.label),
            h('span', { class: 'slot-time' }, slotTimeText(sl))
          ),
          h('div', { class: 'slot-people' }, assignedIds(dk, d.id, sl.id).map(function (id) {
            return personChip(member(id), dk);
          }))
        ));
      });
    });
    if (!any) todayCard.appendChild(h('div', { class: 'small faint' }, page.word + ' 편성된 근무가 없습니다.'));
    wrap.appendChild(todayCard);

    /* 오늘 부재자 */
    var lvs = leavesOn(dk);
    var lvCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, page.word + ' 부재 ' + (lvs.length ? '· ' + lvs.length + '명' : '')),
        h('button', {
          class: 'btn btn-sm btn-ghost', onclick: function () { editLeave(null, dk); }
        }, '＋ 등록')
      )
    );
    if (!lvs.length) {
      lvCard.appendChild(h('div', { class: 'small faint' }, '전원 부대 내에 있습니다.'));
    } else {
      lvs.sort(function (a, b) { return bySeniority(member(a.memberId), member(b.memberId)); })
        .forEach(function (lv) {
          var m = member(lv.memberId);
          lvCard.appendChild(h('button', {
            class: 'mrow', onclick: function () { editLeave(lv); }
          },
            rankBadge(m),
            h('div', { class: 'grow' },
              h('div', { class: 'mrow-name ellipsis' }, m.name),
              h('div', { class: 'mrow-meta' }, lv.start === lv.end ? fmtDate(lv.start)
                : fmtDate(lv.start) + ' → ' + fmtDate(lv.end))
            ),
            h('span', { class: 'tag tag-leave' }, lv.type)
          ));
        });
    }
    wrap.appendChild(lvCard);

    /* 그날 휴무 */
    var offMap = dailyGet(dk).off || {};
    var offList = all.filter(function (m) { return offMap[m.id]; });
    var offCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, page.word + ' 휴무 ' + (offList.length ? '· ' + offList.length + '명' : '')),
        h('button', {
          class: 'btn btn-sm btn-ghost', onclick: function () { editOffDuty(dk, null); }
        }, '＋ 지정')
      )
    );
    if (!offList.length) {
      offCard.appendChild(h('div', { class: 'small faint' }, '휴무 인원이 없습니다.'));
    } else {
      offList.forEach(function (m) {
        var kind = OFF_KINDS[offMap[m.id]];
        offCard.appendChild(h('button', {
          class: 'mrow', onclick: function () { editOffDuty(dk, null); }
        },
          rankBadge(m),
          h('div', { class: 'grow' },
            h('div', { class: 'mrow-name ellipsis' }, m.name),
            h('div', { class: 'mrow-meta' }, kind.hint + ' · 식사집합 참여')
          ),
          h('span', { class: 'tag tag-off' }, kind.label)
        ));
      });
    }
    wrap.appendChild(offCard);

    /* 소대 현황판 */
    var board = h('div', { class: 'board' });
    var when = isToday ? now : atTime(dk, '12:00');
    all.forEach(function (m) {
      var stt = stateOf(m, dk, when);
      board.appendChild(h('button', {
        class: 'board-cell ' + stt.bar, onclick: function () { memberDetail(m.id); }
      },
        rankBadge(m, true),
        h('div', { class: 'bc-name' }, m.name),
        h('div', { class: 'bc-state' }, stt.label)
      ));
    });
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '소대 현황판 · ' + all.length + '명'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { go('roster'); } }, '명단')
      ),
      board,
      stateLegend(),
      h('div', { class: 'tiny faint', style: 'margin-top:6px' },
        isToday ? '지금 시각 기준' : fmtDate(dk) + ' 12:00 기준')
    ));

    return wrap;
  }

  function editStatus(dateKey, slot) {
    var ta = h('textarea', {
      class: 'input', style: 'min-height:140px',
      placeholder: '예: 대대 사격 훈련, 08:00 완전군장 집합\n예: 인원보고 시 파견 1명 포함'
    });
    ta.value = dailyGet(dateKey).status;

    var body = h('div', null,
      h('p', { class: 'small muted', style: 'margin:0 0 10px' },
        (slot ? slot.tag + ' · ' : '') + fmtDateLong(dateKey)),
      ta
    );

    var close = sheet('상태 메모', body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var d = dailyEdit(dateKey);
          d.status = ta.value.trim();
          save();
          close();
          render();
          toast(d.status ? '저장했습니다' : '메모를 비웠습니다');
        }
      }, '저장')
    ]);
  }

  function stateLegend() {
    var keys = ['work', 'rest', 'off', 'duty', 'leave', 'dispatch'];
    return h('div', { class: 'legend' }, keys.map(function (k) {
      return h('span', null, h('i', { class: 'lg ' + STATES[k].bar }), STATES[k].label);
    }));
  }

  function personChip(m, dateKey) {
    if (!m) return h('span', { class: 'person' }, '(삭제됨)');
    var lv = leaveOn(m.id, dateKey);
    return h('button', {
      class: 'person' + (lv ? ' is-out' : '') + (m.id === S.meId ? ' is-me' : ''),
      onclick: function () { memberDetail(m.id); }
    }, rankBadge(m, true), m.name, lv ? h('span', { class: 'tag tag-leave' }, lv.type) : null);
  }

  /* ==================== 화면: 한장 요약 ==================== */

  function copyText(str, okMsg) {
    var msg = okMsg || '복사했습니다';
    var ta = h('textarea', { readonly: true, style: 'position:fixed;top:-1000px;left:0;opacity:0' });
    ta.value = str;
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, str.length);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(str).then(function () { toast(msg); }, function () {
        toast(ok ? msg : '복사에 실패했습니다. 문구를 길게 눌러 복사하세요');
      });
    } else {
      toast(ok ? msg : '복사에 실패했습니다. 문구를 길게 눌러 복사하세요');
    }
  }

  function statRow(items) {
    return h('div', { class: 'stats' }, items.map(function (it) {
      return h('div', { class: 'stat' + (it.hi ? ' hi' : '') },
        h('div', { class: 'stat-k' }, it.k),
        h('div', { class: 'stat-v' }, it.v)
      );
    }));
  }

  function countStats(c, extra) {
    var items = [
      { k: '총원', v: c.total },
      { k: '휴가', v: c.leave.length },
      { k: '파견', v: c.dispatch.length },
      { k: '근무', v: c.duty }
    ];
    if (c.off && extra !== 'yeondeung') items.push({ k: '휴무', v: c.off });
    if (extra === 'seonsik') items.push({ k: '선식', v: c.seonsik.length });
    if (extra === 'yeondeung') items.push({ k: '연등', v: c.yeondeung.length });
    items.push({ k: '현재원', v: c.present, hi: true });
    return statRow(items);
  }

  function reportCard(opts) {
    var card = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'row', style: 'gap:7px' },
          h('div', { class: 'card-title', style: 'color:var(--text);font-size:15px' }, opts.title),
          opts.now ? h('span', { class: 'tag tag-now' }, '지금') : null
        ),
        h('div', { class: 'tiny faint mono' }, opts.when)
      )
    );
    if (opts.stats) card.appendChild(opts.stats);
    if (opts.formula) card.appendChild(h('div', { class: 'formula' }, opts.formula));
    (opts.blocks || []).forEach(function (b) {
      card.appendChild(h('div', { class: 'repbox' }, b.text));
      card.appendChild(h('div', { class: 'btn-row', style: 'margin-top:8px' },
        h('button', {
          class: 'btn btn-sm', onclick: function () { copyText(b.text); }
        }, '문구 복사'),
        b.buttons || null
      ));
    });
    return card;
  }

  function viewSummary() {
    var dk = UI.date;
    var wrap = h('div');
    var now = new Date();
    var isToday = dk === todayKey();

    wrap.appendChild(h('div', { class: 'datebar' },
      h('button', { class: 'btn btn-sm', onclick: function () { UI.date = addDays(dk, -1); render(); } }, '‹'),
      h('div', { class: 'datebar-main' }, fmtDate(dk),
        h('span', null, isToday ? '오늘' : (daysUntil(dk) > 0 ? 'D+' + daysUntil(dk) : daysUntil(dk) + '일'))),
      h('button', { class: 'btn btn-sm', onclick: function () { UI.date = addDays(dk, 1); render(); } }, '›')
    ));
    if (!isToday) {
      wrap.appendChild(h('button', {
        class: 'btn btn-sm btn-ghost btn-block', style: 'margin-bottom:12px',
        onclick: function () { UI.date = todayKey(); render(); }
      }, '오늘로 이동'));
    }

    if (!S.members.length) {
      wrap.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' },
        '소대원을 등록하면 인원보고 문구가 자동으로 채워집니다.')));
      return wrap;
    }

    /* 생활관 범위 선택 */
    var chips = h('div', { class: 'chips', style: 'margin-bottom:12px' });
    chips.appendChild(h('button', {
      class: 'chip', 'aria-pressed': UI.scopeRoom ? 'false' : 'true',
      onclick: function () { UI.scopeRoom = null; render(); }
    }, '소대 전체'));
    S.rooms.forEach(function (r) {
      chips.appendChild(h('button', {
        class: 'chip', 'aria-pressed': UI.scopeRoom === r.id ? 'true' : 'false',
        onclick: function () { UI.scopeRoom = r.id; render(); }
      }, r.name));
    });
    wrap.appendChild(chips);

    var rid = UI.scopeRoom;
    if (rid && !room(rid)) {
      UI.scopeRoom = rid = null;
    }

    /* 지금 기준 현황 */
    var nowHm = isToday ? fmtHm(now) : '12:00';
    var cNow = counts(dk, nowHm, rid);
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, (rid ? roomName(rid) : (S.unit || '소대 전체')) + ' 현황'),
        h('div', { class: 'tiny faint mono' }, nowHm + ' 기준')
      ),
      countStats(cNow),
      h('div', { class: 'formula' }, '현재원 = 총원 − 휴가 − 파견 − 근무')
    ));

    /* 보고 항목 */
    var defs = [
      { id: 'mroll', title: '아침점호', hm: S.times.morningRoll },
      { id: 'meal_b', title: MEALS[0].label, hm: servingTime('b', dk), meal: MEALS[0] },
      { id: 'meal_l', title: MEALS[1].label, hm: servingTime('l', dk), meal: MEALS[1] },
      { id: 'meal_d', title: MEALS[2].label, hm: servingTime('d', dk), meal: MEALS[2] },
      { id: 'rooms', title: '생활관 인원보고', hm: S.times.roomReport },
      { id: 'eroll', title: '저녁점호집합', hm: S.times.eveningRoll },
      { id: 'watch', title: '불침번 보고', hm: S.times.nightWatch }
    ];

    /* 지금 시각에 가장 가까운 항목 하나에 '지금' 배지 */
    var nowId = null;
    if (isToday) {
      var best = 1e9;
      defs.forEach(function (d) {
        var diff = Math.abs(hmToMin(nowHm) - hmToMin(d.hm));
        if (diff < best) { best = diff; nowId = d.id; }
      });
    }

    defs.forEach(function (d) {
      if (d.meal) {
        var c = counts(dk, d.hm, rid, { seonsik: true });
        wrap.appendChild(reportCard({
          title: d.title, when: servingNo(d.meal.id, dk) + '배식 · ' + d.hm, now: nowId === d.id,
          stats: countStats(c, 'seonsik'),
          formula: '현재원 = 총원 − 휴가 − 파견 − 근무 − 선식',
          blocks: [{
            text: mealText(d.meal, dk, rid),
            buttons: h('button', {
              class: 'btn btn-sm', onclick: function () {
                pickDailyMembers(dk, 'seonsik', '선식 인원', rid);
              }
            }, '선식 지정')
          }]
        }));
        return;
      }

      if (d.id === 'rooms') {
        wrap.appendChild(reportCard({
          title: d.title, when: d.hm, now: nowId === d.id,
          blocks: [{
            text: S.rooms.length ? roomsReportText(dk)
              : '생활관을 등록하면 생활관별 인원이 여기 나옵니다. (설정 → 생활관)'
          }]
        }));
        return;
      }

      if (d.id === 'watch') {
        var targets = rid ? [rid] : (S.rooms.length ? S.rooms.map(function (r) { return r.id; }) : [null]);
        var blocks = targets.map(function (t) {
          var day = dailyGet(dk);
          return {
            text: watchText(dk, t),
            buttons: h('span', { class: 'btn-row', style: 'display:flex;gap:8px;flex:2' },
              h('button', {
                class: 'btn btn-sm', onclick: function () {
                  pickDailyMembers(dk, 'yeondeung', '연등 인원' + (t ? ' · ' + roomName(t) : ''), t);
                }
              }, '연등 지정'),
              h('button', {
                class: 'btn btn-sm', onclick: function () { editWatchExtra(dk, t); }
              }, '온도 · 메모')
            )
          };
        });
        wrap.appendChild(reportCard({
          title: d.title + (rid ? '' : (S.rooms.length ? ' · 생활관별' : '')),
          when: d.hm, now: nowId === d.id,
          stats: targets.length === 1
            ? countStats(counts(dk, d.hm, targets[0], { yeondeung: true }), 'yeondeung')
            : null,
          formula: '현재원 = 총원 − 휴가 − 파견 − 근무 − 연등',
          blocks: blocks
        }));
        return;
      }

      /* 점호 */
      var evening = d.id === 'eroll';
      var cr = counts(dk, d.hm, rid, { eveningRoll: evening });
      wrap.appendChild(reportCard({
        title: d.title, when: d.hm, now: nowId === d.id,
        stats: countStats(cr),
        formula: '현재원 = 총원 − 휴가 − 파견 − 근무' + (evening ? ' (조별 점호 예외 반영)' : ''),
        blocks: [{
          text: rollText(d.title, d.hm, dk, rid, evening),
          buttons: h('span', { class: 'btn-row', style: 'display:flex;gap:8px;flex:2' },
            h('button', {
              class: 'btn btn-sm', onclick: function () {
                pickDailyMembers(dk, 'chuimin', '근무취침 인원', rid);
              }
            }, '근무취침'),
            h('button', {
              class: 'btn btn-sm', onclick: function () { editOffDuty(dk, rid); }
            }, '휴무')
          )
        }]
      }));
    });

    wrap.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', onclick: function () { go('settings'); }
    }, '점호 · 배식 시각 수정'));

    return wrap;
  }

  /** 선식 · 근무취침 · 연등 인원 선택 */
  function pickDailyMembers(dateKey, field, title, roomId) {
    var cur = dailyGet(dateKey)[field];
    var sel = cur.slice();
    var list = h('div', { class: 'mlist' });
    var scope = scopeList(roomId);

    if (!scope.length) {
      toast('이 범위에 소대원이 없습니다');
      return;
    }

    scope.forEach(function (m) {
      var lv = leaveOn(m.id, dateKey);
      var row = h('button', {
        class: 'picker-row', 'aria-pressed': sel.indexOf(m.id) >= 0 ? 'true' : 'false'
      },
        h('span', { class: 'picker-check' }, '✓'),
        rankBadge(m, true),
        h('span', { class: 'grow' },
          h('span', { class: 'mrow-name' }, m.name),
          h('span', { class: 'mrow-meta' }, [roomName(m.roomId || null),
            m.saro ? m.saro + '사로' : null].filter(Boolean).join(' · '))
        ),
        lv ? h('span', { class: 'tag tag-leave' }, lv.type) : null
      );
      row.addEventListener('click', function () {
        var i = sel.indexOf(m.id);
        if (i >= 0) sel.splice(i, 1);
        else sel.push(m.id);
        row.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        cnt.textContent = '선택 ' + sel.length + '명';
      });
      list.appendChild(row);
    });

    var cnt = h('div', { class: 'tiny faint', style: 'padding:10px 2px 0' }, '선택 ' + sel.length + '명');
    var close = sheet(title + ' · ' + fmtDate(dateKey), h('div', null, list, cnt), [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          /* 다른 생활관 선택은 그대로 두고 이 범위만 교체 */
          var keep = cur.filter(function (id) {
            var m = member(id);
            return m && roomId && (m.roomId || null) !== roomId;
          });
          var d = dailyEdit(dateKey);
          d[field] = keep.concat(sel);
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /** 휴무 지정 — 눌러서 없음 → 휴무 → 반투휴무 로 돈다 */
  function editOffDuty(dateKey, roomId) {
    var cur = dailyGet(dateKey).off || {};
    var scope = scopeList(roomId);
    if (!scope.length) {
      toast('이 범위에 소대원이 없습니다');
      return;
    }
    var draft = {};
    Object.keys(cur).forEach(function (k) { draft[k] = cur[k]; });

    var list = h('div', { class: 'mlist' });
    scope.forEach(function (m) {
      var lv = leaveOn(m.id, dateKey);
      var tag = h('span', { class: 'tag' });
      function paint() {
        var k = draft[m.id];
        tag.className = 'tag ' + (k ? 'tag-off' : 'tag-rest');
        tag.textContent = k ? OFF_KINDS[k].label : '없음';
      }
      paint();
      var row = h('button', { class: 'picker-row' },
        rankBadge(m, true),
        h('span', { class: 'grow' },
          h('span', { class: 'mrow-name' }, m.name),
          h('span', { class: 'mrow-meta' }, lv ? lv.type + ' 중' :
            (roomName(m.roomId || null) + (m.saro ? ' ' + m.saro + '사로' : '')))
        ),
        tag
      );
      row.addEventListener('click', function () {
        var k = draft[m.id];
        if (!k) draft[m.id] = 'full';
        else if (k === 'full') draft[m.id] = 'half';
        else delete draft[m.id];
        paint();
      });
      list.appendChild(row);
    });

    var body = h('div', null,
      h('p', { class: 'small muted', style: 'margin:0 0 10px' },
        '눌러서 없음 → 휴무 → 반투휴무 로 바꿉니다. 휴무는 일과를 하지 않고, ' +
        '반투휴무는 ' + S.times.halfOffFrom + ' 부터 일과에 합류합니다. 둘 다 식사집합은 참여하고 ' +
        '현재원에도 그대로 들어갑니다.'),
      list
    );

    var close = sheet('휴무 지정 · ' + fmtDate(dateKey), body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var next = {};
          /* 다른 생활관 지정은 그대로 두고 이 범위만 교체 */
          Object.keys(cur).forEach(function (id) {
            var m = member(id);
            if (m && roomId && (m.roomId || null) !== roomId) next[id] = cur[id];
          });
          scope.forEach(function (m) {
            if (draft[m.id]) next[m.id] = draft[m.id];
          });
          var d = dailyEdit(dateKey);
          d.off = next;
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /** 생활관 온도 · 특이사항 */
  function editWatchExtra(dateKey, roomId) {
    var day = dailyGet(dateKey);
    var key = roomId || 'all';
    var tempIn = h('input', {
      class: 'input', type: 'number', min: '0', max: '45', step: '0.5',
      value: (roomId ? day.temp[roomId] : '') || '', placeholder: '예: 24'
    });
    var noteIn = h('textarea', { class: 'input', placeholder: '자동 기상 안내 외에 덧붙일 내용' });
    noteIn.value = day.notes[key] || '';

    var auto = wakeLines(dateKey, S.times.nightWatch, roomId);
    var body = h('div', null,
      roomId ? field('생활관 온도 (도)', tempIn)
        : h('div', { class: 'warnbox' }, '온도는 생활관을 선택해야 입력할 수 있습니다.'),
      field('특이사항 (직접 입력)', noteIn),
      h('div', { class: 'section-title' }, '자동으로 붙는 기상 안내'),
      auto.length
        ? h('div', { class: 'repbox' }, auto.join('\n'))
        : h('div', { class: 'small faint' }, '앞으로 8시간 내 투입되는 근무자가 없습니다.')
    );

    var close = sheet('불침번 보고 입력' + (roomId ? ' · ' + roomName(roomId) : ''), body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var d = dailyEdit(dateKey);
          if (roomId) {
            if (tempIn.value) d.temp[roomId] = tempIn.value;
            else delete d.temp[roomId];
          }
          var v = noteIn.value.trim();
          if (v) d.notes[key] = v;
          else delete d.notes[key];
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /* ==================== 화면: 근무 ==================== */

  function viewDuty() {
    var dk = UI.date;
    var now = new Date();
    var wrap = h('div');

    wrap.appendChild(h('div', { class: 'datebar' },
      h('button', {
        class: 'btn btn-sm', onclick: function () { UI.date = addDays(dk, -1); render(); }
      }, '‹'),
      h('div', { class: 'datebar-main' }, fmtDate(dk), h('span', null,
        dk === todayKey() ? '오늘' : (daysUntil(dk) > 0 ? 'D+' + daysUntil(dk) : daysUntil(dk) + '일')
      )),
      h('button', {
        class: 'btn btn-sm', onclick: function () { UI.date = addDays(dk, 1); render(); }
      }, '›')
    ));

    if (dk !== todayKey()) {
      wrap.appendChild(h('button', {
        class: 'btn btn-sm btn-ghost btn-block', style: 'margin-bottom:12px',
        onclick: function () { UI.date = todayKey(); render(); }
      }, '오늘로 이동'));
    }

    if (!S.members.length) {
      wrap.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' }, '소대원을 먼저 등록해야 근무를 편성할 수 있습니다.')));
      return wrap;
    }

    var out = leavesOn(dk);
    if (out.length) {
      wrap.appendChild(h('div', { class: 'warnbox' },
        '이 날 부재: ' + out.map(function (lv) {
          var m = member(lv.memberId);
          return m.name + '(' + lv.type + ')';
        }).join(', ')
      ));
    }

    S.duties.forEach(function (d) {
      var card = h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', { class: 'card-title' }, d.name),
          h('div', { class: 'tiny faint' }, d.kind === 'day' ? '일 단위' : d.slots.length + '개 시간대')
        )
      );
      d.slots.forEach(function (sl) {
        var ids = assignedIds(dk, d.id, sl.id);
        var short = sl.need && ids.length < sl.need;
        card.appendChild(h('div', { class: 'slot' + (isLive(dk, sl, now) ? ' is-live' : '') },
          h('div', { class: 'slot-head' },
            h('span', { class: 'slot-label' }, sl.label),
            h('span', { class: 'slot-time' }, slotTimeText(sl)),
            h('span', { class: 'grow' }),
            sl.need ? h('span', {
              class: 'tiny mono', style: short ? 'color:var(--warn)' : 'color:var(--text-faint)'
            }, ids.length + '/' + sl.need) : null
          ),
          h('div', { class: 'slot-people' },
            ids.map(function (id) { return personChip(member(id), dk); }),
            h('button', {
              class: 'slot-assign', onclick: function () { pickPeople(dk, d, sl); }
            }, ids.length ? '＋ 변경' : '＋ 배정')
          )
        ));
      });
      wrap.appendChild(card);
    });

    wrap.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', onclick: function () { go('settings'); }
    }, '근무 종류 · 시간대 수정'));

    return wrap;
  }

  /** 배정 시트: 부재자 경고 + 최근 근무 횟수 표시 */
  function pickPeople(dateKey, d, sl) {
    var sel = assignedIds(dateKey, d.id, sl.id).slice();
    var body = h('div');
    body.appendChild(h('p', { class: 'small muted', style: 'margin:0 0 10px' },
      fmtDate(dateKey) + ' · ' + d.name + ' ' + sl.label +
      (slotTimeText(sl) ? ' (' + slotTimeText(sl) + ')' : '') +
      (sl.need ? ' · 필요 ' + sl.need + '명' : '')
    ));
    var list = h('div', { class: 'mlist' });

    roster().forEach(function (m) {
      var lv = leaveOn(m.id, dateKey);
      var cnt = dutyCount(m.id, 14);
      var row = h('button', { class: 'picker-row', 'aria-pressed': sel.indexOf(m.id) >= 0 ? 'true' : 'false' },
        h('span', { class: 'picker-check' }, '✓'),
        rankBadge(m, true),
        h('span', { class: 'grow' },
          h('span', { class: 'mrow-name' }, m.name),
          h('span', { class: 'mrow-meta' }, (m.role ? m.role + ' · ' : '') + '최근 14일 ' + cnt + '회')
        ),
        lv ? h('span', { class: 'tag tag-leave' }, lv.type) : null
      );
      row.addEventListener('click', function () {
        var i = sel.indexOf(m.id);
        if (i >= 0) sel.splice(i, 1);
        else sel.push(m.id);
        row.setAttribute('aria-pressed', i >= 0 ? 'false' : 'true');
        count.textContent = '선택 ' + sel.length + '명';
      });
      list.appendChild(row);
    });

    var count = h('div', { class: 'tiny faint', style: 'padding:10px 2px 0' }, '선택 ' + sel.length + '명');
    body.appendChild(list);
    body.appendChild(count);

    var close = sheet(d.name + ' ' + sl.label, body, [
      h('button', {
        class: 'btn btn-ghost', onclick: function () {
          close();
          setAssigned(dateKey, d.id, sl.id, []);
          render();
          toast('배정을 비웠습니다');
        }
      }, '전체 해제'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          close();
          var ordered = roster().filter(function (m) { return sel.indexOf(m.id) >= 0; })
            .map(function (m) { return m.id; });
          setAssigned(dateKey, d.id, sl.id, ordered);
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /* ==================== 화면: 소대원 ==================== */

  function viewRoster() {
    var wrap = h('div');
    wrap.appendChild(h('div', { class: 'seg' },
      segBtn('명단', 'list'),
      segBtn('사로표', 'saro')
    ));
    wrap.appendChild(UI.rosterMode === 'saro' ? viewSaro() : viewRosterList());
    return wrap;
  }

  function segBtn(label, mode) {
    return h('button', {
      class: 'seg-btn', 'aria-pressed': UI.rosterMode === mode ? 'true' : 'false',
      onclick: function () { UI.rosterMode = mode; render(); }
    }, label);
  }

  /* ---------- 생활관 사로표 (2열 × 6행) ---------- */

  function viewSaro() {
    var wrap = h('div');
    var dk = todayKey();
    var now = new Date();

    if (!S.rooms.length) {
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'empty' }, '생활관을 먼저 등록하세요.', h('br'), '한 생활관당 ' + SARO_MAX + '사로까지 배정할 수 있습니다.'),
        h('button', {
          class: 'btn btn-primary btn-block', onclick: function () { editRoom(null); }
        }, '＋ 생활관 추가')
      ));
      return wrap;
    }

    wrap.appendChild(h('div', { class: 'card', style: 'padding:11px 14px' },
      stateLegend(),
      h('div', { class: 'tiny faint', style: 'margin-top:6px' }, '지금 시각 기준 상태입니다')
    ));

    S.rooms.forEach(function (r) {
      var mine = membersInRoom(r.id);
      var card = h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', { class: 'card-title', style: 'color:var(--text);font-size:15px' }, r.name),
          h('div', { class: 'row', style: 'gap:6px' },
            h('span', { class: 'tiny faint' }, mine.length + '명'),
            h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { editRoom(r.id); } }, '수정')
          )
        )
      );

      var grid = h('div', { class: 'saro-grid' });
      saroCells().forEach(function (n) {
        if (!n) {
          grid.appendChild(h('div', { class: 'saro-cell is-void' }));
          return;
        }
        var m = saroOccupant(r.id, n);
        var stt = m ? stateOf(m, dk, now) : null;
        grid.appendChild(h('button', {
          class: 'saro-cell' + (stt ? ' ' + stt.bar : '') + (m ? '' : ' is-empty'),
          onclick: function () { pickSaroOccupant(r.id, n); }
        },
          h('span', { class: 'saro-no' }, n),
          m ? h('span', { class: 'saro-who' }, rankBadge(m, true), h('span', { class: 'ellipsis' }, m.name))
            : h('span', { class: 'saro-who faint' }, '빈 사로'),
          h('span', { class: 'saro-st' }, stt ? stt.label : '')
        ));
      });
      card.appendChild(grid);
      card.appendChild(h('div', { class: 'tiny faint', style: 'margin-top:8px' },
        '왼쪽 ' + SARO_LEFT[0] + '~' + SARO_LEFT[SARO_LEFT.length - 1] + '사로, 오른쪽 ' +
        SARO_RIGHT[0] + '~' + SARO_RIGHT[SARO_RIGHT.length - 1] + '사로'));

      var un = mine.filter(function (m) { return !m.saro; });
      if (un.length) {
        card.appendChild(h('div', { class: 'section-title' }, '사로 미지정 ' + un.length + '명'));
        card.appendChild(h('div', { class: 'slot-people' }, un.map(function (m) {
          return h('button', {
            class: 'person', onclick: function () { editMember(m.id); }
          }, rankBadge(m, true), m.name);
        })));
      }
      wrap.appendChild(card);
    });

    var none = membersInRoom(null);
    if (none.length) {
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-title' }, '생활관 미지정 ' + none.length + '명'),
        h('div', { class: 'mlist' }, none.map(function (m) {
          return h('button', { class: 'mrow', onclick: function () { editMember(m.id); } },
            rankBadge(m),
            h('div', { class: 'grow' },
              h('div', { class: 'mrow-name ellipsis' }, m.name),
              h('div', { class: 'mrow-meta' }, rank(m.rankId).name)
            ),
            h('span', { class: 'tiny faint' }, '배정 ›')
          );
        }))
      ));
    }

    wrap.appendChild(h('button', {
      class: 'btn btn-ghost btn-block', onclick: function () { editRoom(null); }
    }, '＋ 생활관 추가'));

    return wrap;
  }

  function pickSaroOccupant(roomId, n) {
    var cur = saroOccupant(roomId, n);
    var list = h('div', { class: 'mlist' });
    var here = membersInRoom(roomId), other = roster().filter(function (m) {
      return (m.roomId || null) !== roomId;
    });

    function row(m) {
      return h('button', {
        class: 'picker-row', 'aria-pressed': cur && cur.id === m.id ? 'true' : 'false',
        onclick: function () {
          setSaro(m.id, roomId, n);
          close();
          render();
          toast(m.name + ' → ' + n + '사로');
        }
      },
        h('span', { class: 'picker-check' }, '✓'),
        rankBadge(m, true),
        h('span', { class: 'grow' },
          h('span', { class: 'mrow-name' }, m.name),
          h('span', { class: 'mrow-meta' }, [rank(m.rankId).name,
            m.saro ? m.saro + '사로' : null,
            (m.roomId || null) !== roomId ? roomName(m.roomId || null) : null].filter(Boolean).join(' · '))
        )
      );
    }

    here.forEach(function (m) { list.appendChild(row(m)); });
    if (other.length) {
      list.appendChild(h('div', { class: 'section-title' }, '다른 생활관 · 미지정'));
      other.forEach(function (m) { list.appendChild(row(m)); });
    }

    var close = sheet(roomName(roomId) + ' ' + n + '사로', list, [
      cur ? h('button', {
        class: 'btn btn-danger', onclick: function () {
          cur.saro = null;
          save();
          close();
          render();
          toast('비웠습니다');
        }
      }, '비우기') : null,
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '닫기')
    ].filter(Boolean));
  }

  function viewRosterList() {
    var wrap = h('div');
    var all = roster();
    var dk = todayKey();
    var now = new Date();

    wrap.appendChild(h('button', {
      class: 'btn btn-primary btn-block', style: 'margin-bottom:12px',
      onclick: function () { editMember(null); }
    }, '＋ 소대원 추가'));

    if (!all.length) {
      wrap.appendChild(h('div', { class: 'card' }, h('div', { class: 'empty' },
        '아직 등록된 소대원이 없습니다.'
      )));
      return wrap;
    }

    var groups = [
      { title: '간부', test: function (m) { return rank(m.rankId).tier >= 5; } },
      { title: '병', test: function (m) { return rank(m.rankId).tier < 5; } }
    ];

    wrap.appendChild(h('div', { class: 'card', style: 'padding:11px 14px' },
      stateLegend(),
      h('div', { class: 'tiny faint', style: 'margin-top:6px' }, '지금 시각 기준 상태입니다')
    ));

    groups.forEach(function (g) {
      var list = all.filter(g.test);
      if (!list.length) return;
      var card = h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', { class: 'card-title' }, g.title + ' · ' + list.length + '명'),
          h('div', { class: 'tiny faint' }, '선임 순')
        )
      );
      var ml = h('div', { class: 'mlist' });
      list.forEach(function (m) {
        var stt = stateOf(m, dk, now);
        ml.appendChild(h('button', {
          class: 'mrow', onclick: function () { memberDetail(m.id); }
        },
          rankBadge(m),
          h('div', { class: 'grow' },
            h('div', { class: 'mrow-name ellipsis' }, m.name,
              m.id === S.meId ? h('span', { class: 'tag tag-me', style: 'margin-left:6px' }, '나') : null),
            h('div', { class: 'mrow-meta ellipsis' },
              [rank(m.rankId).name, m.role,
                m.roomId ? roomName(m.roomId) + (m.saro ? ' ' + m.saro + '사로' : '') : null,
                m.enlist ? '입대 ' + m.enlist : null]
                .filter(Boolean).join(' · '))
          ),
          h('span', { class: 'tag ' + stt.tag }, stt.label),
          m.discharge ? h('span', { class: 'dday' }, ddayText(m)) : null
        ));
      });
      card.appendChild(ml);
      wrap.appendChild(card);
    });

    return wrap;
  }

  function memberDetail(id) {
    var m = member(id);
    if (!m) return;
    var dk = todayKey();
    var body = h('div');

    body.appendChild(h('div', { class: 'row', style: 'gap:12px;margin-bottom:14px' },
      rankBadge(m),
      h('div', { class: 'grow' },
        h('div', { class: 'strong', style: 'font-size:18px' }, m.name),
        h('div', { class: 'small muted' }, [rank(m.rankId).name, m.role].filter(Boolean).join(' · '))
      ),
      m.discharge ? h('span', { class: 'dday' }, ddayText(m)) : null
    ));

    body.appendChild(h('div', { class: 'kv' },
      h('span', { class: 'k' }, '생활관 · 사로'),
      h('span', null, roomName(m.roomId || null) + (m.saro ? ' ' + m.saro + '사로' : ''))
    ));
    body.appendChild(h('div', { class: 'kv' }, h('span', { class: 'k' }, '입대일'), h('span', null, m.enlist || '-')));
    body.appendChild(h('div', { class: 'kv' }, h('span', { class: 'k' }, '전역일'), h('span', null, m.discharge || '-')));
    body.appendChild(h('div', { class: 'kv' },
      h('span', { class: 'k' }, '지금 상태'),
      h('span', { class: 'strong' }, stateOf(m, dk).label)
    ));
    body.appendChild(h('div', { class: 'kv' },
      h('span', { class: 'k' }, '오늘 일정'),
      h('span', null, (function () {
        var lv = leaveOn(m.id, dk);
        if (lv) return lv.type + ' (' + lv.start + ' ~ ' + lv.end + ')';
        var ds = dutiesOf(m.id, dk);
        return ds.length ? ds.map(function (x) { return x.duty.name + ' ' + x.slot.label; }).join(', ') : '특이사항 없음';
      })())
    ));
    body.appendChild(h('div', { class: 'kv' },
      h('span', { class: 'k' }, '최근 14일 근무'),
      h('span', { class: 'mono' }, dutyCount(m.id, 14) + '회')
    ));
    if (m.note) {
      body.appendChild(h('div', { class: 'section-title' }, '메모'));
      body.appendChild(h('div', { class: 'small muted', style: 'white-space:pre-wrap' }, m.note));
    }

    /* 다가오는 근무 */
    var upcoming = [];
    for (var i = 0; i < 14 && upcoming.length < 8; i++) {
      var d2 = addDays(dk, i);
      dutiesOf(m.id, d2).forEach(function (x) { upcoming.push(x); });
    }
    body.appendChild(h('div', { class: 'section-title' }, '다가오는 근무'));
    if (!upcoming.length) body.appendChild(h('div', { class: 'small faint' }, '2주 내 편성된 근무가 없습니다.'));
    upcoming.forEach(function (x) {
      body.appendChild(h('div', { class: 'kv' },
        h('span', { class: 'k' }, fmtDate(x.dateKey)),
        h('span', null, x.duty.name + ' ' + x.slot.label + (slotTimeText(x.slot) ? ' · ' + slotTimeText(x.slot) : ''))
      ));
    });

    /* 부재 일정 */
    var mine = S.leaves.filter(function (lv) { return lv.memberId === m.id && lv.end >= dk; })
      .sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    body.appendChild(h('div', { class: 'section-title' }, '예정된 휴가 · 외박'));
    if (!mine.length) body.appendChild(h('div', { class: 'small faint' }, '없습니다.'));
    mine.forEach(function (lv) {
      body.appendChild(h('button', {
        class: 'mrow', onclick: function () { close(); editLeave(lv); }
      },
        h('div', { class: 'grow' },
          h('div', { class: 'mrow-name' }, lv.type),
          h('div', { class: 'mrow-meta' }, lv.start + ' ~ ' + lv.end)
        ),
        h('span', { class: 'tiny faint' }, 'D-' + Math.max(0, daysUntil(lv.start)))
      ));
    });

    var close = sheet(m.name, body, [
      h('button', {
        class: 'btn btn-ghost', onclick: function () { close(); editLeave(null, dk, m.id); }
      }, '휴가 등록'),
      h('button', {
        class: 'btn btn-primary', onclick: function () { close(); editMember(m.id); }
      }, '정보 수정')
    ]);
  }

  function editMember(id) {
    var m = id ? member(id) : null;
    var draft = m ? JSON.parse(JSON.stringify(m))
      : {
        id: uid('m'), name: '', rankId: 'pvt', role: '',
        roomId: null, saro: null, enlist: '', discharge: '', note: ''
      };

    var nameIn = h('input', { class: 'input', value: draft.name, placeholder: '예: 김철수', maxlength: '20' });
    var roleIn = h('input', { class: 'input', value: draft.role || '', placeholder: '예: 분대장, 소대장 (선택)', maxlength: '20' });
    var enlistIn = h('input', { class: 'input', type: 'date', value: draft.enlist || '' });
    var dischargeIn = h('input', { class: 'input', type: 'date', value: draft.discharge || '' });
    var noteIn = h('textarea', { class: 'input', placeholder: '주의사항, 특기, 관물대 위치 등 (선택)' });
    noteIn.value = draft.note || '';

    var chips = h('div', { class: 'chips' });
    RANKS.forEach(function (r) {
      var c = h('button', {
        class: 'chip', 'aria-pressed': draft.rankId === r.id ? 'true' : 'false',
        onclick: function () {
          draft.rankId = r.id;
          [].forEach.call(chips.children, function (x) {
            x.setAttribute('aria-pressed', x.dataset.r === r.id ? 'true' : 'false');
          });
        }
      }, r.name);
      c.dataset.r = r.id;
      chips.appendChild(c);
    });

    var roomSel = h('select', { class: 'input' });
    roomSel.appendChild(h('option', { value: '' }, '생활관 미지정'));
    S.rooms.forEach(function (r) {
      var op = h('option', { value: r.id }, r.name);
      if ((draft.roomId || '') === r.id) op.selected = true;
      roomSel.appendChild(op);
    });

    var saroSel = h('select', { class: 'input' });
    saroSel.appendChild(h('option', { value: '' }, '사로 미지정'));
    for (var sn = 1; sn <= SARO_MAX; sn++) {
      var sop = h('option', { value: sn }, sn + '사로');
      if (+draft.saro === sn) sop.selected = true;
      saroSel.appendChild(sop);
    }

    var body = h('div', null,
      field('이름', nameIn),
      field('계급', chips),
      field('직책', roleIn),
      field('생활관', S.rooms.length ? roomSel
        : h('div', { class: 'small faint' }, '설정 → 생활관에서 먼저 등록하세요')),
      field('사로 (1~' + SARO_MAX + ')', saroSel),
      field('입대일 (선임 순서 정렬에 사용, 선택)', enlistIn),
      field('전역일 (D-day 표시, 선택)', dischargeIn),
      field('메모', noteIn),
      m ? h('button', {
        class: 'btn btn-danger btn-block', onclick: function () {
          close();
          confirmSheet('소대원 삭제', m.name + ' 님을 명단에서 삭제합니다. 근무 배정과 휴가 기록도 함께 지워집니다.', function () {
            S.members = S.members.filter(function (x) { return x.id !== m.id; });
            S.leaves = S.leaves.filter(function (lv) { return lv.memberId !== m.id; });
            Object.keys(S.assign).forEach(function (dk) {
              Object.keys(S.assign[dk]).forEach(function (di) {
                Object.keys(S.assign[dk][di]).forEach(function (si) {
                  S.assign[dk][di][si] = S.assign[dk][di][si].filter(function (x) { return x !== m.id; });
                });
              });
            });
            if (S.meId === m.id) S.meId = null;
            save();
            render();
            toast('삭제했습니다');
          });
        }
      }, '이 소대원 삭제') : null
    );

    var close = sheet(m ? '소대원 수정' : '소대원 추가', body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var name = nameIn.value.trim();
          if (!name) {
            toast('이름을 입력하세요');
            return;
          }
          draft.name = name;
          draft.role = roleIn.value.trim();
          draft.enlist = enlistIn.value;
          draft.discharge = dischargeIn.value;
          draft.note = noteIn.value.trim();
          if (m) {
            for (var i = 0; i < S.members.length; i++) {
              if (S.members[i].id === m.id) S.members[i] = draft;
            }
          } else {
            S.members.push(draft);
          }
          save();
          /* 사로는 중복 배정을 정리해야 하므로 setSaro 로 반영 */
          setSaro(draft.id, roomSel.value || null, +saroSel.value || null);
          close();
          render();
          toast(m ? '수정했습니다' : name + ' 님을 추가했습니다');
        }
      }, '저장')
    ]);
  }

  /* ==================== 화면: 일정 (달력) ==================== */

  function viewCalendar() {
    var wrap = h('div');
    var mk = UI.month.split('-');
    var y = +mk[0], mo = +mk[1];
    var first = new Date(y, mo - 1, 1);
    var lastDay = new Date(y, mo, 0).getDate();

    wrap.appendChild(h('div', { class: 'datebar' },
      h('button', {
        class: 'btn btn-sm', onclick: function () {
          UI.month = monthKey(new Date(y, mo - 2, 1));
          render();
        }
      }, '‹'),
      h('div', { class: 'datebar-main' }, y + '년 ' + mo + '월', h('span', null, '휴가 · 근무 한눈에')),
      h('button', {
        class: 'btn btn-sm', onclick: function () {
          UI.month = monthKey(new Date(y, mo, 1));
          render();
        }
      }, '›')
    ));

    var grid = h('div', { class: 'cal-grid' });
    DOW.forEach(function (d, i) {
      grid.appendChild(h('div', { class: 'cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '') }, d));
    });
    for (var b = 0; b < first.getDay(); b++) grid.appendChild(h('div', { class: 'cal-day blank' }));
    for (var day = 1; day <= lastDay; day++) {
      (function (day) {
        var dk = y + '-' + pad(mo) + '-' + pad(day);
        var nLeave = leavesOn(dk).length;
        var hasDuty = dayHasDuty(dk);
        var cls = 'cal-day' + (dk === UI.date ? ' sel' : dk === todayKey() ? ' today' : '');
        grid.appendChild(h('button', {
          class: cls, onclick: function () {
            UI.date = dk;
            render();
          }
        },
          h('span', null, day),
          h('span', { class: 'dots' },
            nLeave ? h('i', { class: 'dot dot-leave' }) : null,
            hasDuty ? h('i', { class: 'dot dot-duty' }) : null
          )
        ));
      })(day);
    }
    wrap.appendChild(h('div', { class: 'card' }, grid,
      h('div', { class: 'legend' },
        h('span', null, h('i', { class: 'dot-leave', style: 'background:var(--warn)' }), '부재자 있음'),
        h('span', null, h('i', { class: 'dot-duty', style: 'background:var(--info)' }), '근무 편성됨')
      )
    ));

    /* 선택한 날 상세 */
    var dk2 = UI.date;
    var detail = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, fmtDateLong(dk2)),
        h('button', {
          class: 'btn btn-sm btn-ghost', onclick: function () { go('duty'); }
        }, '근무 편성')
      )
    );

    var st = dailyGet(dk2).status;
    detail.appendChild(h('button', {
      class: 'dstat', style: 'margin-top:2px',
      onclick: function () { editStatus(dk2, null); }
    },
      h('div', { class: 'dstat-head' },
        h('span', { class: 'dstat-tag' }, '상태 메모'),
        h('span', { class: 'dstat-date' }, daysUntil(dk2) === 0 ? '오늘'
          : (daysUntil(dk2) > 0 ? 'D+' + daysUntil(dk2) : daysUntil(dk2) + '일'))
      ),
      h('div', { class: 'dstat-body' + (st ? '' : ' faint') }, st || '눌러서 메모 쓰기')
    ));

    var lvs = leavesOn(dk2);
    detail.appendChild(h('div', { class: 'section-title', style: 'margin-top:4px' }, '부재 ' + lvs.length + '명'));
    if (!lvs.length) detail.appendChild(h('div', { class: 'small faint' }, '없습니다.'));
    lvs.forEach(function (lv) {
      var m = member(lv.memberId);
      detail.appendChild(h('button', {
        class: 'mrow', onclick: function () { editLeave(lv); }
      },
        rankBadge(m, true),
        h('div', { class: 'grow' },
          h('div', { class: 'mrow-name ellipsis' }, m.name),
          h('div', { class: 'mrow-meta' }, lv.start + ' ~ ' + lv.end)
        ),
        h('span', { class: 'tag tag-leave' }, lv.type)
      ));
    });

    var dutyLines = [];
    S.duties.forEach(function (d) {
      d.slots.forEach(function (sl) {
        var ids = assignedIds(dk2, d.id, sl.id);
        if (ids.length) dutyLines.push({ d: d, sl: sl, ids: ids });
      });
    });
    detail.appendChild(h('div', { class: 'section-title' }, '근무 ' + dutyLines.length + '건'));
    if (!dutyLines.length) detail.appendChild(h('div', { class: 'small faint' }, '편성되지 않았습니다.'));
    dutyLines.forEach(function (x) {
      detail.appendChild(h('div', { class: 'slot' },
        h('div', { class: 'slot-head' },
          h('span', { class: 'slot-label' }, x.d.name + ' ' + x.sl.label),
          h('span', { class: 'slot-time' }, slotTimeText(x.sl))
        ),
        h('div', { class: 'slot-people' }, x.ids.map(function (id) { return personChip(member(id), dk2); }))
      ));
    });

    wrap.appendChild(detail);

    wrap.appendChild(h('button', {
      class: 'btn btn-primary btn-block', onclick: function () { editLeave(null, dk2); }
    }, '＋ 휴가 · 외박 · 외출 등록'));

    return wrap;
  }

  function editLeave(lv, defaultDate, defaultMemberId) {
    if (!S.members.length) {
      toast('소대원을 먼저 등록하세요');
      return;
    }
    var draft = lv ? JSON.parse(JSON.stringify(lv)) : {
      id: uid('lv'),
      memberId: defaultMemberId || (S.meId || roster()[0].id),
      type: '휴가',
      start: defaultDate || todayKey(),
      end: defaultDate || todayKey(),
      note: ''
    };

    var memSel = h('select', { class: 'input' });
    roster().forEach(function (m) {
      var op = h('option', { value: m.id }, rank(m.rankId).name + ' ' + m.name);
      if (m.id === draft.memberId) op.selected = true;
      memSel.appendChild(op);
    });

    var typeChips = h('div', { class: 'chips' });
    LEAVE_TYPES.forEach(function (t) {
      var c = h('button', {
        class: 'chip', 'aria-pressed': draft.type === t ? 'true' : 'false',
        onclick: function () {
          draft.type = t;
          [].forEach.call(typeChips.children, function (x) {
            x.setAttribute('aria-pressed', x.textContent === t ? 'true' : 'false');
          });
        }
      }, t);
      typeChips.appendChild(c);
    });

    var startIn = h('input', { class: 'input', type: 'date', value: draft.start });
    var endIn = h('input', { class: 'input', type: 'date', value: draft.end });
    startIn.addEventListener('change', function () {
      if (endIn.value < startIn.value) endIn.value = startIn.value;
    });
    var noteIn = h('input', { class: 'input', value: draft.note || '', placeholder: '행선지, 연락 방법 등 (선택)' });

    var body = h('div', null,
      field('대상', memSel),
      field('종류', typeChips),
      field('시작일', startIn),
      field('종료일', endIn),
      field('메모', noteIn),
      lv ? h('button', {
        class: 'btn btn-danger btn-block', onclick: function () {
          close();
          S.leaves = S.leaves.filter(function (x) { return x.id !== lv.id; });
          save();
          render();
          toast('삭제했습니다');
        }
      }, '이 일정 삭제') : null
    );

    var close = sheet(lv ? '부재 일정 수정' : '부재 일정 등록', body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          if (!startIn.value || !endIn.value) {
            toast('기간을 입력하세요');
            return;
          }
          draft.memberId = memSel.value;
          draft.start = startIn.value;
          draft.end = endIn.value < startIn.value ? startIn.value : endIn.value;
          draft.note = noteIn.value.trim();
          if (lv) {
            for (var i = 0; i < S.leaves.length; i++) if (S.leaves[i].id === lv.id) S.leaves[i] = draft;
          } else {
            S.leaves.push(draft);
          }
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /* ==================== 화면: 설정 ==================== */

  function viewSettings() {
    var wrap = h('div');

    /* 내 정보 */
    var meSel = h('select', { class: 'input' });
    meSel.appendChild(h('option', { value: '' }, '선택 안 함'));
    roster().forEach(function (m) {
      var op = h('option', { value: m.id }, rank(m.rankId).name + ' ' + m.name);
      if (m.id === S.meId) op.selected = true;
      meSel.appendChild(op);
    });
    meSel.addEventListener('change', function () {
      S.meId = meSel.value || null;
      save();
      toast('내 정보를 저장했습니다');
    });

    var unitIn = h('input', { class: 'input', value: S.unit || '', placeholder: '예: 1소대', maxlength: '24' });
    unitIn.addEventListener('change', function () {
      S.unit = unitIn.value.trim();
      save();
      render();
    });

    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '내 정보'),
      field('나는 누구인가요? (내 근무 · 전역일 표시)', meSel),
      field('소대 이름', unitIn)
    ));

    /* 생활관 */
    var roomCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '생활관'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { editRoom(null); } }, '＋ 추가')
      )
    );
    if (!S.rooms.length) {
      roomCard.appendChild(h('div', { class: 'small faint' },
        '생활관을 등록하면 사로표와 생활관별 인원보고를 쓸 수 있습니다.'));
    } else {
      var rl = h('div', { class: 'mlist' });
      S.rooms.forEach(function (r) {
        var mine = membersInRoom(r.id);
        rl.appendChild(h('button', {
          class: 'mrow', onclick: function () { editRoom(r.id); }
        },
          h('div', { class: 'grow' },
            h('div', { class: 'mrow-name' }, r.name),
            h('div', { class: 'mrow-meta' }, mine.length + '명 · 사로 배정 ' +
              mine.filter(function (m) { return m.saro; }).length + '명')
          ),
          h('span', { class: 'tiny faint' }, '›')
        ));
      });
      roomCard.appendChild(rl);
    }
    wrap.appendChild(roomCard);

    /* 점호 · 보고 시각 */
    function timeField(label, key) {
      var inp = h('input', { class: 'input', type: 'time', value: S.times[key] || '' });
      inp.addEventListener('change', function () {
        S.times[key] = inp.value || S.times[key];
        save();
        render();
      });
      return field(label, inp);
    }
    var leadIn = h('input', { class: 'input', type: 'number', min: '0', max: '60', value: S.times.wakeLead });
    leadIn.addEventListener('change', function () {
      S.times.wakeLead = Math.max(0, +leadIn.value || 0);
      save();
      render();
    });
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '점호 · 보고 시각'),
      timeField('아침점호', 'morningRoll'),
      timeField('생활관 인원보고', 'roomReport'),
      timeField('저녁점호집합', 'eveningRoll'),
      timeField('불침번 보고 기준', 'nightWatch'),
      field('근무 투입 몇 분 전에 기상시킬지 (분)', leadIn)
    ));

    /* 일과 시간 — 일과 / 휴식 상태를 가르는 기준 */
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '일과 시간'),
      h('p', { class: 'small muted', style: 'margin:0 0 12px' },
        '명단 · 사로표 · 현황판의 상태를 이 시간으로 가릅니다. 일과 시간 안이면 ' +
        '일과, 벗어나면 휴식입니다. 주말은 종일 휴식으로 봅니다.'),
      timeField('일과 시작', 'workStart'),
      timeField('일과 종료', 'workEnd'),
      timeField('반투휴무가 일과에 합류하는 시각', 'halfOffFrom')
    ));

    /* 배식 */
    var svCard = h('div', { class: 'card' }, h('div', { class: 'card-title' }, '배식 순번'));
    MEALS.forEach(function (meal) {
      var baseIn = h('input', { class: 'input', type: 'time', value: S.serving.base[meal.id] });
      var noSel = h('select', { class: 'input' });
      for (var i = 1; i <= (+S.serving.count || 4); i++) {
        var op = h('option', { value: i }, i + '배식');
        if (+S.serving.order[meal.id] === i) op.selected = true;
        noSel.appendChild(op);
      }
      baseIn.addEventListener('change', function () {
        S.serving.base[meal.id] = baseIn.value || S.serving.base[meal.id];
        save();
        render();
      });
      noSel.addEventListener('change', function () {
        S.serving.order[meal.id] = +noSel.value;
        S.serving.anchor = todayKey();
        save();
        render();
      });
      svCard.appendChild(h('div', { class: 'row', style: 'gap:8px;align-items:flex-end;margin-bottom:10px' },
        h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, meal.name + ' 1배식 시각'), baseIn),
        h('div', { style: 'width:112px' }, h('div', { class: 'tiny faint' }, '이번 주 순번'), noSel)
      ));
      svCard.appendChild(h('div', { class: 'tiny faint', style: 'margin:-4px 0 12px' },
        '오늘 ' + meal.name + ' → ' + servingNo(meal.id, UI.date) + '배식 ' + servingTime(meal.id, UI.date)));
    });

    var stepIn = h('input', { class: 'input', type: 'number', min: '1', max: '60', value: S.serving.step });
    var cntIn = h('input', { class: 'input', type: 'number', min: '1', max: '12', value: S.serving.count });
    stepIn.addEventListener('change', function () {
      S.serving.step = Math.max(1, +stepIn.value || 10);
      save();
      render();
    });
    cntIn.addEventListener('change', function () {
      S.serving.count = Math.max(1, +cntIn.value || 4);
      save();
      render();
    });
    svCard.appendChild(h('div', { class: 'row', style: 'gap:8px;align-items:flex-end' },
      h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '배식 간격(분)'), stepIn),
      h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '총 배식 수'), cntIn)
    ));
    svCard.appendChild(h('button', {
      class: 'chip', style: 'margin-top:12px',
      'aria-pressed': S.serving.autoRotate ? 'true' : 'false',
      onclick: function () {
        S.serving.autoRotate = !S.serving.autoRotate;
        if (S.serving.autoRotate) S.serving.anchor = todayKey();
        save();
        render();
      }
    }, '주마다 순번 자동 회전'));
    svCard.appendChild(h('div', { class: 'tiny faint', style: 'margin-top:8px' },
      S.serving.autoRotate
        ? '이번 주(' + weekStartKey(todayKey()) + ' 시작) 순번을 기준으로 매주 한 칸씩 밀립니다.'
        : '순번을 고정합니다. 주마다 바뀌면 직접 바꿔주세요.'));
    wrap.appendChild(svCard);

    /* 근무 종류 */
    var dutyCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '근무 종류'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { editDuty(null); } }, '＋ 추가')
      )
    );
    var dl = h('div', { class: 'mlist' });
    S.duties.forEach(function (d) {
      dl.appendChild(h('button', {
        class: 'mrow', onclick: function () { editDuty(d.id); }
      },
        h('div', { class: 'grow' },
          h('div', { class: 'mrow-name' }, d.name),
          h('div', { class: 'mrow-meta ellipsis' },
            (d.report === false ? '[보고 제외] ' : '') + (d.slots.map(function (s) {
              return s.label + (slotTimeText(s) ? ' ' + slotTimeText(s) : '');
            }).join(' / ') || '시간대 없음'))
        ),
        h('span', { class: 'tiny faint' }, '›')
      ));
    });
    dutyCard.appendChild(dl);
    wrap.appendChild(dutyCard);

    /* 백업 */
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '백업 · 복원'),
      h('p', { class: 'small muted', style: 'margin:0 0 10px' },
        '데이터는 이 폰에만 저장됩니다. 앱 삭제나 브라우저 데이터 삭제 시 사라지니, 폰을 바꾸기 전에 백업 문자열을 복사해 두세요.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', onclick: doBackup }, '백업 복사'),
        h('button', { class: 'btn', onclick: doRestore }, '복원')
      )
    ));

    /* 통계 */
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-title' }, '현황'),
      h('div', { class: 'kv' }, h('span', { class: 'k' }, '소대원'), h('span', { class: 'mono' }, S.members.length + '명')),
      h('div', { class: 'kv' }, h('span', { class: 'k' }, '등록된 부재 일정'), h('span', { class: 'mono' }, S.leaves.length + '건')),
      h('div', { class: 'kv' }, h('span', { class: 'k' }, '근무 편성된 날'), h('span', { class: 'mono' }, Object.keys(S.assign).length + '일'))
    ));

    /* 초기화 */
    wrap.appendChild(h('button', {
      class: 'btn btn-danger btn-block', onclick: function () {
        confirmSheet('전체 초기화', '소대원, 근무 편성, 휴가 기록을 모두 지웁니다. 되돌릴 수 없습니다.', function () {
          S = blankState();
          save();
          go('today');
          toast('초기화했습니다');
        }, '전부 삭제');
      }
    }, '전체 초기화'));

    wrap.appendChild(h('p', { class: 'tiny faint', style: 'text-align:center;margin:16px 0 0' },
      '이등병 생존 가이드 · 오프라인 전용 · 데이터 외부 전송 없음'));

    return wrap;
  }

  function editRoom(id) {
    var r = id ? room(id) : null;
    var nameIn = h('input', {
      class: 'input', maxlength: '16',
      value: r ? r.name : (S.rooms.length + 1) + '생활관',
      placeholder: '예: 3생활관'
    });

    var body = h('div', null,
      field('생활관 이름', nameIn),
      h('p', { class: 'small faint', style: 'margin:0 0 12px' },
        '사로표는 2열 × ' + SARO_ROWS + '행으로 ' + SARO_MAX + '사로까지 표시됩니다.'),
      r ? h('button', {
        class: 'btn btn-danger btn-block', onclick: function () {
          close();
          confirmSheet('생활관 삭제', r.name + ' 을(를) 삭제합니다. 소속된 소대원은 생활관·사로 미지정으로 바뀌고, 명단에서 지워지지는 않습니다.', function () {
            membersInRoom(r.id).forEach(function (m) {
              m.roomId = null;
              m.saro = null;
            });
            S.rooms = S.rooms.filter(function (x) { return x.id !== r.id; });
            Object.keys(S.daily).forEach(function (dk) {
              var d = S.daily[dk];
              if (d.temp) delete d.temp[r.id];
              if (d.notes) delete d.notes[r.id];
            });
            if (UI.scopeRoom === r.id) UI.scopeRoom = null;
            save();
            render();
            toast('삭제했습니다');
          });
        }
      }, '이 생활관 삭제') : null
    );

    var close = sheet(r ? '생활관 수정' : '생활관 추가', body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var name = nameIn.value.trim();
          if (!name) {
            toast('이름을 입력하세요');
            return;
          }
          if (r) r.name = name;
          else S.rooms.push({ id: uid('r'), name: name });
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  function editDuty(id) {
    var d = id ? duty(id) : null;
    var draft = d ? JSON.parse(JSON.stringify(d))
      : { id: uid('d'), name: '', kind: 'slots', report: true, slots: [{ id: uid('s'), label: '1번초', start: '22:00', end: '23:30', need: 2 }] };

    var nameIn = h('input', { class: 'input', value: draft.name, placeholder: '예: 불침번', maxlength: '16' });
    var slotWrap = h('div');

    function drawSlots() {
      slotWrap.textContent = '';
      draft.slots.forEach(function (sl, idx) {
        var lab = h('input', { class: 'input', value: sl.label, placeholder: '이름', maxlength: '12' });
        var st = h('input', { class: 'input', type: 'time', value: sl.start || '' });
        var en = h('input', { class: 'input', type: 'time', value: sl.end || '' });
        var nd = h('input', { class: 'input', type: 'number', min: '0', max: '20', value: sl.need || 0 });
        lab.addEventListener('input', function () { sl.label = lab.value; });
        st.addEventListener('change', function () { sl.start = st.value; });
        en.addEventListener('change', function () { sl.end = en.value; });
        nd.addEventListener('change', function () { sl.need = Math.max(0, +nd.value || 0); });

        /* 반복 근무 (CCTV A~D조처럼 하루에 여러 번 도는 경우) */
        var isRep = !!(sl.rep && sl.rep.dur);
        var every = h('input', { class: 'input', type: 'number', min: '5', max: '1440', value: isRep ? sl.rep.every : 120 });
        var offIn = h('input', { class: 'input', type: 'number', min: '0', max: '1439', value: isRep ? sl.rep.offset : 0 });
        var durIn = h('input', { class: 'input', type: 'number', min: '5', max: '720', value: isRep ? sl.rep.dur : 30 });
        var preview = h('div', { class: 'tiny faint', style: 'margin-top:6px' });
        function syncRep() {
          sl.rep = {
            every: Math.max(5, +every.value || 120),
            offset: Math.max(0, +offIn.value || 0),
            dur: Math.max(5, +durIn.value || 30)
          };
          preview.textContent = '→ ' + repText(sl.rep);
        }
        [every, offIn, durIn].forEach(function (inp) {
          inp.addEventListener('change', function () {
            syncRep();
            drawSlots();
          });
        });
        if (isRep) preview.textContent = '→ ' + repText(sl.rep);

        var repChip = h('button', {
          class: 'chip', 'aria-pressed': isRep ? 'true' : 'false',
          onclick: function () {
            if (sl.rep && sl.rep.dur) delete sl.rep;
            else syncRep();
            drawSlots();
          }
        }, '반복 근무');

        /* 저녁점호 예외 */
        var rollSel = h('select', { class: 'input' });
        [['', '자동 (시간대로 판단)'], ['present', '있는 것으로 (곧 복귀)'], ['absent', '없는 것으로 (미리 나감)']]
          .forEach(function (o) {
            var op = h('option', { value: o[0] }, o[1]);
            if ((sl.roll || '') === o[0]) op.selected = true;
            rollSel.appendChild(op);
          });
        rollSel.addEventListener('change', function () { sl.roll = rollSel.value; });

        slotWrap.appendChild(h('div', { style: 'border:1px solid var(--line-soft);border-radius:12px;padding:10px;margin-bottom:10px' },
          h('div', { class: 'row row-between', style: 'margin-bottom:8px' },
            h('span', { class: 'tiny faint' }, (idx + 1) + '번째 시간대'),
            h('button', {
              class: 'btn btn-sm btn-danger', onclick: function () {
                draft.slots.splice(idx, 1);
                drawSlots();
              }
            }, '삭제')
          ),
          h('div', { class: 'row', style: 'gap:8px;margin-bottom:8px' }, lab),
          h('div', { style: 'margin-bottom:8px' }, repChip),
          isRep
            ? h('div', null,
              h('div', { class: 'row', style: 'gap:8px' },
                h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '간격(분)'), every),
                h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '시작 오프셋(분)'), offIn),
                h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '길이(분)'), durIn)
              ),
              preview,
              h('div', { class: 'row', style: 'gap:8px;margin-top:8px' },
                h('div', { style: 'width:76px' }, h('div', { class: 'tiny faint' }, '인원'), nd))
            )
            : h('div', { class: 'row', style: 'gap:8px' },
              h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '시작'), st),
              h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '종료'), en),
              h('div', { style: 'width:76px' }, h('div', { class: 'tiny faint' }, '인원'), nd)
            ),
          h('div', { style: 'margin-top:8px' },
            h('div', { class: 'tiny faint' }, '저녁점호 처리'), rollSel)
        ));
      });
    }
    drawSlots();

    var kindChips = h('div', { class: 'chips' });
    [{ k: 'slots', t: '시간대 근무' }, { k: 'day', t: '일 단위' }].forEach(function (o) {
      var c = h('button', {
        class: 'chip', 'aria-pressed': draft.kind === o.k ? 'true' : 'false',
        onclick: function () {
          draft.kind = o.k;
          [].forEach.call(kindChips.children, function (x) {
            x.setAttribute('aria-pressed', x.dataset.k === o.k ? 'true' : 'false');
          });
        }
      }, o.t);
      c.dataset.k = o.k;
      kindChips.appendChild(c);
    });

    var reportChip = h('button', {
      class: 'chip', 'aria-pressed': draft.report === false ? 'false' : 'true',
      onclick: function () {
        draft.report = draft.report === false;
        reportChip.setAttribute('aria-pressed', draft.report ? 'true' : 'false');
      }
    }, '인원보고에서 근무로 집계');

    var body = h('div', null,
      field('근무 이름', nameIn),
      field('형태', kindChips),
      field('인원보고', reportChip),
      h('div', { class: 'section-title' }, '시간대 · 필요 인원'),
      slotWrap,
      h('button', {
        class: 'btn btn-ghost btn-block', onclick: function () {
          draft.slots.push({ id: uid('s'), label: '새 시간대', start: '', end: '', need: 1 });
          drawSlots();
        }
      }, '＋ 시간대 추가'),
      d ? h('button', {
        class: 'btn btn-danger btn-block', style: 'margin-top:10px', onclick: function () {
          close();
          confirmSheet('근무 종류 삭제', d.name + ' 과(와) 관련된 모든 배정 기록이 지워집니다.', function () {
            S.duties = S.duties.filter(function (x) { return x.id !== d.id; });
            Object.keys(S.assign).forEach(function (dk) {
              delete S.assign[dk][d.id];
              if (!Object.keys(S.assign[dk]).length) delete S.assign[dk];
            });
            save();
            render();
            toast('삭제했습니다');
          });
        }
      }, '이 근무 종류 삭제') : null
    );

    var close = sheet(d ? '근무 종류 수정' : '근무 종류 추가', body, [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var name = nameIn.value.trim();
          if (!name) {
            toast('근무 이름을 입력하세요');
            return;
          }
          if (!draft.slots.length) {
            toast('시간대를 1개 이상 추가하세요');
            return;
          }
          draft.name = name;
          draft.slots.forEach(function (sl, i) {
            if (!String(sl.label).trim()) sl.label = (i + 1) + '번';
          });
          if (d) {
            for (var i = 0; i < S.duties.length; i++) if (S.duties[i].id === d.id) S.duties[i] = draft;
          } else {
            S.duties.push(draft);
          }
          save();
          close();
          render();
          toast('저장했습니다');
        }
      }, '저장')
    ]);
  }

  /* ==================== 백업 / 복원 ==================== */

  function doBackup() {
    var json = JSON.stringify(S);
    var ta = h('textarea', { class: 'input', style: 'min-height:150px', readonly: true });
    ta.value = json;
    var close = sheet('백업', h('div', null,
      h('p', { class: 'small muted', style: 'margin:0 0 10px' },
        '아래 문자열을 복사해 메모장이나 본인에게 보내는 메시지에 보관하세요. 복원할 때 그대로 붙여 넣으면 됩니다.'),
      ta
    ), [
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          ta.select();
          ta.setSelectionRange(0, ta.value.length);
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ta.value).then(function () {
              toast('복사했습니다');
              close();
            }, function () {
              toast(ok ? '복사했습니다' : '직접 길게 눌러 복사하세요');
            });
          } else {
            toast(ok ? '복사했습니다' : '직접 길게 눌러 복사하세요');
          }
        }
      }, '복사')
    ]);
  }

  function doRestore() {
    var ta = h('textarea', { class: 'input', style: 'min-height:150px', placeholder: '백업 문자열을 붙여 넣으세요' });
    var close = sheet('복원', h('div', null,
      h('p', { class: 'small muted', style: 'margin:0 0 10px' }, '현재 데이터는 모두 덮어써집니다.'),
      ta
    ), [
      h('button', { class: 'btn btn-ghost', onclick: function () { close(); } }, '취소'),
      h('button', {
        class: 'btn btn-primary', onclick: function () {
          var parsed;
          try {
            parsed = JSON.parse(ta.value.trim());
          } catch (e) {
            toast('형식이 올바르지 않습니다');
            return;
          }
          if (!parsed || !Array.isArray(parsed.members)) {
            toast('백업 데이터가 아닙니다');
            return;
          }
          localStorage.setItem(STORE_KEY, JSON.stringify(parsed));
          S = load();
          close();
          go('today');
          toast('복원했습니다');
        }
      }, '복원')
    ]);
  }

  /* ==================== 라우팅 / 렌더 ==================== */

  var TABS = [
    { id: 'today', label: '오늘', ico: '🎯', title: '오늘', view: viewToday },
    { id: 'summary', label: '요약', ico: '📋', title: '한장 요약', view: viewSummary },
    { id: 'duty', label: '근무', ico: '🕒', title: '근무 편성', view: viewDuty },
    { id: 'roster', label: '소대원', ico: '👥', title: '소대원', view: viewRoster },
    { id: 'cal', label: '일정', ico: '📅', title: '일정', view: viewCalendar },
    { id: 'settings', label: '설정', ico: '⚙️', title: '설정', view: viewSettings }
  ];

  function go(tab) {
    UI.tab = tab;
    if (location.hash !== '#' + tab) {
      history.replaceState(null, '', '#' + tab);
    }
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    var tab = TABS.filter(function (t) { return t.id === UI.tab; })[0] || TABS[0];

    document.getElementById('topbar-title').textContent =
      tab.id === 'today' ? dayPage().tag : tab.title;
    var sub = '';
    if (tab.id === 'today') {
      sub = fmtDateLong(addDays(todayKey(), dayPage().off)) + (S.unit ? ' · ' + S.unit : '');
    } else if (tab.id === 'summary') {
      sub = '점호 · 식사 · 불침번 보고 문구';
    } else if (tab.id === 'roster') {
      sub = UI.rosterMode === 'saro' ? '생활관 사로표 · 칸을 눌러 배정' : '계급 · 선임 순으로 정렬됩니다';
    } else if (tab.id === 'duty') {
      sub = '날짜를 넘겨 근무를 편성하세요';
    } else if (tab.id === 'cal') {
      sub = '휴가 · 외박 · 외출 일정';
    } else {
      sub = '오프라인 전용 · 데이터는 이 폰에만';
    }
    document.getElementById('topbar-sub').textContent = sub;

    var view = document.getElementById('view');
    view.textContent = '';
    view.appendChild(tab.view());

    var bar = document.getElementById('tabbar');
    bar.textContent = '';
    TABS.forEach(function (t) {
      bar.appendChild(h('button', {
        'aria-current': t.id === UI.tab ? 'page' : null,
        onclick: function () {
          /* 하단 탭은 항상 '오늘' 한 칸. 누르면 오늘 화면으로 돌아온다. */
          if (t.id === 'today') UI.todayOffset = 0;
          go(t.id);
        }
      }, h('span', { class: 'ico' }, t.ico), h('span', null, t.label)));
    });
  }

  window.addEventListener('hashchange', function () {
    var t = location.hash.replace('#', '');
    if (TABS.some(function (x) { return x.id === t; })) {
      UI.tab = t;
      render();
    }
  });

  /* 자정을 넘기거나 앱을 다시 열면 오늘 기준을 갱신 */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) render();
  });
  setInterval(function () {
    if (!document.hidden && !document.querySelector('.sheet-back')) render();
  }, 60000);

  var initial = location.hash.replace('#', '');
  if (TABS.some(function (x) { return x.id === initial; })) UI.tab = initial;
  render();

  /* 서비스 워커: 오프라인 캐시 */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }
})();
