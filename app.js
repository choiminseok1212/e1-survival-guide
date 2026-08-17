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

  var LEAVE_TYPES = ['휴가', '외박', '외출', '병가', '기타'];

  var DOW = ['일', '월', '화', '수', '목', '금', '토'];

  function defaultDuties() {
    return [
      {
        id: 'd_bul', name: '불침번', kind: 'slots',
        slots: [
          { id: 'b1', label: '1번초', start: '22:00', end: '23:30', need: 2 },
          { id: 'b2', label: '2번초', start: '23:30', end: '01:00', need: 2 },
          { id: 'b3', label: '3번초', start: '01:00', end: '02:30', need: 2 },
          { id: 'b4', label: '4번초', start: '02:30', end: '04:00', need: 2 },
          { id: 'b5', label: '5번초', start: '04:00', end: '05:30', need: 2 }
        ]
      },
      {
        id: 'd_cctv', name: 'CCTV', kind: 'slots',
        slots: [
          { id: 'c1', label: '주간 1', start: '08:00', end: '12:00', need: 1 },
          { id: 'c2', label: '주간 2', start: '12:00', end: '16:00', need: 1 },
          { id: 'c3', label: '주간 3', start: '16:00', end: '20:00', need: 1 },
          { id: 'c4', label: '야간 1', start: '20:00', end: '00:00', need: 1 },
          { id: 'c5', label: '야간 2', start: '00:00', end: '04:00', need: 1 },
          { id: 'c6', label: '야간 3', start: '04:00', end: '08:00', need: 1 }
        ]
      },
      {
        id: 'd_gate', name: '위병소', kind: 'slots',
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
        id: 'd_flash', name: '번개조', kind: 'day',
        slots: [{ id: 'f1', label: '대기', start: '', end: '', need: 3 }]
      },
      {
        id: 'd_duty', name: '당직', kind: 'day',
        slots: [
          { id: 't1', label: '당직사관', start: '', end: '', need: 1 },
          { id: 't2', label: '당직병', start: '', end: '', need: 1 }
        ]
      }
    ];
  }

  /* ==================== 상태 ==================== */

  var S = load();
  var UI = { tab: 'today', date: todayKey(), month: monthKey(new Date()) };

  function blankState() {
    return { v: 1, unit: '', meId: null, members: [], duties: defaultDuties(), assign: {}, leaves: [] };
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
      base.duties = Array.isArray(s.duties) && s.duties.length ? s.duties : defaultDuties();
      base.assign = s.assign && typeof s.assign === 'object' ? s.assign : {};
      base.leaves = Array.isArray(s.leaves) ? s.leaves : [];
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

  function slotWindow(dateKey, slot) {
    if (!slot.start || !slot.end) return null;
    var s = fromKey(dateKey), e = fromKey(dateKey);
    var sp = slot.start.split(':'), ep = slot.end.split(':');
    s.setHours(+sp[0], +sp[1], 0, 0);
    e.setHours(+ep[0], +ep[1], 0, 0);
    if (e <= s) e.setDate(e.getDate() + 1);
    return [s, e];
  }

  function slotTimeText(slot) {
    if (!slot.start || !slot.end) return '';
    return slot.start + ' – ' + slot.end;
  }

  function isLive(dateKey, slot, now) {
    var w = slotWindow(dateKey, slot);
    if (!w) return false;
    return now >= w[0] && now < w[1];
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
      var list = dutiesOf(memberId, dk).sort(function (a, b) {
        return String(a.slot.start).localeCompare(String(b.slot.start));
      });
      for (var j = 0; j < list.length; j++) {
        var w = slotWindow(dk, list[j].slot);
        if (!w) {
          if (i > 0 || dk === todayKey()) return list[j];
          continue;
        }
        if (w[1] > now) return list[j];
      }
    }
    return null;
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

  function viewToday() {
    var now = new Date();
    var dk = todayKey();
    var wrap = h('div');
    var all = roster();

    if (!all.length) {
      return h('div', null,
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
      );
    }

    /* 지금 근무 중 */
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

    /* 내 다음 근무 */
    if (S.meId && member(S.meId)) {
      var me = member(S.meId);
      var nx = nextDutyOf(me.id, now);
      var lv = leaveOn(me.id, dk);
      wrap.appendChild(h('div', { class: 'card' },
        h('div', { class: 'card-title' }, '내 상황 · ' + me.name),
        h('div', { class: 'kv' },
          h('span', { class: 'k' }, '다음 근무'),
          h('span', { class: 'strong' }, nx
            ? (fmtDate(nx.dateKey) + ' ' + nx.duty.name + ' ' + nx.slot.label +
              (slotTimeText(nx.slot) ? ' (' + slotTimeText(nx.slot) + ')' : ''))
            : '예정 없음')
        ),
        h('div', { class: 'kv' },
          h('span', { class: 'k' }, '오늘 상태'),
          h('span', { class: 'strong' }, lv ? lv.type + ' 중' : '정상 근무')
        ),
        me.discharge ? h('div', { class: 'kv' },
          h('span', { class: 'k' }, '전역'),
          h('span', { class: 'dday' }, ddayText(me))
        ) : null
      ));
    }

    /* 오늘 근무 편성 */
    var todayCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '오늘 근무 편성'),
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
    if (!any) todayCard.appendChild(h('div', { class: 'small faint' }, '오늘 편성된 근무가 없습니다.'));
    wrap.appendChild(todayCard);

    /* 오늘 부재자 */
    var lvs = leavesOn(dk);
    var lvCard = h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '오늘 부재 ' + (lvs.length ? '· ' + lvs.length + '명' : '')),
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

    /* 소대 현황판 */
    var board = h('div', { class: 'board' });
    all.forEach(function (m) {
      var lv = leaveOn(m.id, dk);
      var ds = dutiesOf(m.id, dk);
      var liveNow = ds.some(function (x) { return isLive(dk, x.slot, now); });
      var st = liveNow ? 'st-now' : (lv ? 'st-leave' : (ds.length ? 'st-duty' : ''));
      var label = liveNow ? '근무 중' : (lv ? lv.type : (ds.length ? ds[0].duty.name : '대기'));
      board.appendChild(h('button', {
        class: 'board-cell ' + st, onclick: function () { memberDetail(m.id); }
      },
        rankBadge(m, true),
        h('div', { class: 'bc-name' }, m.name),
        h('div', { class: 'bc-state' }, label)
      ));
    });
    wrap.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', { class: 'card-title' }, '소대 현황판 · ' + all.length + '명'),
        h('button', { class: 'btn btn-sm btn-ghost', onclick: function () { go('roster'); } }, '명단')
      ),
      board,
      h('div', { class: 'legend' },
        h('span', null, h('i', { style: 'background:var(--accent)' }), '근무 중'),
        h('span', null, h('i', { style: 'background:var(--info)' }), '오늘 근무'),
        h('span', null, h('i', { style: 'background:var(--warn)' }), '부재'),
        h('span', null, h('i', { style: 'background:var(--line)' }), '대기')
      )
    ));

    return wrap;
  }

  function personChip(m, dateKey) {
    if (!m) return h('span', { class: 'person' }, '(삭제됨)');
    var lv = leaveOn(m.id, dateKey);
    return h('button', {
      class: 'person' + (lv ? ' is-out' : '') + (m.id === S.meId ? ' is-me' : ''),
      onclick: function () { memberDetail(m.id); }
    }, rankBadge(m, true), m.name, lv ? h('span', { class: 'tag tag-leave' }, lv.type) : null);
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
        var lv = leaveOn(m.id, dk);
        var ds = dutiesOf(m.id, dk);
        var liveNow = ds.some(function (x) { return isLive(dk, x.slot, now); });
        ml.appendChild(h('button', {
          class: 'mrow', onclick: function () { memberDetail(m.id); }
        },
          rankBadge(m),
          h('div', { class: 'grow' },
            h('div', { class: 'mrow-name ellipsis' }, m.name,
              m.id === S.meId ? h('span', { class: 'tag tag-me', style: 'margin-left:6px' }, '나') : null),
            h('div', { class: 'mrow-meta ellipsis' },
              [rank(m.rankId).name, m.role, m.enlist ? '입대 ' + m.enlist : null]
                .filter(Boolean).join(' · '))
          ),
          liveNow ? h('span', { class: 'tag tag-now' }, '근무 중')
            : lv ? h('span', { class: 'tag tag-leave' }, lv.type)
              : ds.length ? h('span', { class: 'tag tag-duty' }, ds[0].duty.name) : null,
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

    body.appendChild(h('div', { class: 'kv' }, h('span', { class: 'k' }, '입대일'), h('span', null, m.enlist || '-')));
    body.appendChild(h('div', { class: 'kv' }, h('span', { class: 'k' }, '전역일'), h('span', null, m.discharge || '-')));
    body.appendChild(h('div', { class: 'kv' },
      h('span', { class: 'k' }, '오늘 상태'),
      h('span', null, (function () {
        var lv = leaveOn(m.id, dk);
        if (lv) return lv.type + ' (' + lv.start + ' ~ ' + lv.end + ')';
        var ds = dutiesOf(m.id, dk);
        return ds.length ? ds.map(function (x) { return x.duty.name + ' ' + x.slot.label; }).join(', ') : '정상 근무';
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
      : { id: uid('m'), name: '', rankId: 'pvt', role: '', enlist: '', discharge: '', note: '' };

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

    var body = h('div', null,
      field('이름', nameIn),
      field('계급', chips),
      field('직책', roleIn),
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
          h('div', { class: 'mrow-meta ellipsis' }, d.slots.map(function (s) {
            return s.label + (slotTimeText(s) ? ' ' + slotTimeText(s) : '');
          }).join(' / ') || '시간대 없음')
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

  function editDuty(id) {
    var d = id ? duty(id) : null;
    var draft = d ? JSON.parse(JSON.stringify(d))
      : { id: uid('d'), name: '', kind: 'slots', slots: [{ id: uid('s'), label: '1번초', start: '22:00', end: '23:30', need: 2 }] };

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
          h('div', { class: 'row', style: 'gap:8px' },
            h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '시작'), st),
            h('div', { class: 'grow' }, h('div', { class: 'tiny faint' }, '종료'), en),
            h('div', { style: 'width:76px' }, h('div', { class: 'tiny faint' }, '인원'), nd)
          )
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

    var body = h('div', null,
      field('근무 이름', nameIn),
      field('형태', kindChips),
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

    document.getElementById('topbar-title').textContent = tab.title;
    var sub = '';
    if (tab.id === 'today') {
      sub = fmtDateLong(todayKey()) + (S.unit ? ' · ' + S.unit : '');
    } else if (tab.id === 'roster') {
      sub = '계급 · 선임 순으로 정렬됩니다';
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
        onclick: function () { go(t.id); }
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
