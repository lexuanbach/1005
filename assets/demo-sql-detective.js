/* The Missing Trophy: an SQL mystery.  CO1005 demo for Chapter 10 (Databases).
   Part 1 (this IIFE): the pure case file -- generated database, levels, clue checks, suspects, SVG avatars.
   Part 2 (further down): the browser UI.  Everything, people and places included, is invented.
   Needs assets/sql-lab.js (the same engine as the Chapter 10 lab). */
(function (root) {
  'use strict';

  const Sql = (typeof module !== 'undefined' && typeof require === 'function') ? require('./sql-lab.js') : root.SqlLab;

  /* ------------------------------------------------------------------ the story constants */
  const SEED = 20261009;
  const ROOM_TROPHY = 14, ROOM_LAB3 = 8, ROOM_HANGAR = 10, ROOM_DOCK = 13, ROOM_GATE = 1;
  const LOCKED_AT = '2026-10-09 17:30', FOUND_AT = '2026-10-10 04:07', LAST_SEEN = '2026-10-10 01:38';
  const HACKATHON_ID = 24;

  const DDL = `
CREATE TABLE people (
  person_id  INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,
  department TEXT,
  card_level INTEGER NOT NULL
);
CREATE TABLE rooms (
  room_id   INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  building  TEXT,
  min_level INTEGER NOT NULL
);
CREATE TABLE clubs (
  club_id   INTEGER PRIMARY KEY,
  club_name TEXT NOT NULL
);
CREATE TABLE club_members (
  person_id INTEGER REFERENCES people(person_id),
  club_id   INTEGER REFERENCES clubs(club_id),
  member_role TEXT,
  joined_on TEXT,
  PRIMARY KEY (person_id, club_id)
);
CREATE TABLE keycard_swipes (
  swipe_id  INTEGER PRIMARY KEY,
  person_id INTEGER REFERENCES people(person_id),
  room_id   INTEGER REFERENCES rooms(room_id),
  ts        TEXT NOT NULL,
  direction TEXT NOT NULL
);
CREATE TABLE events (
  event_id INTEGER PRIMARY KEY,
  title    TEXT NOT NULL,
  room_id  INTEGER REFERENCES rooms(room_id),
  starts   TEXT,
  ends     TEXT,
  organiser_id INTEGER REFERENCES people(person_id)
);
CREATE TABLE event_attendance (
  event_id  INTEGER REFERENCES events(event_id),
  person_id INTEGER REFERENCES people(person_id),
  PRIMARY KEY (event_id, person_id)
);
CREATE TABLE purchases (
  purchase_id INTEGER PRIMARY KEY,
  person_id   INTEGER REFERENCES people(person_id),
  shop        TEXT,
  item        TEXT,
  category    TEXT,
  amount      REAL,
  ts          TEXT
);
CREATE TABLE messages (
  msg_id       INTEGER PRIMARY KEY,
  sender_id    INTEGER REFERENCES people(person_id),
  recipient_id INTEGER REFERENCES people(person_id),
  ts           TEXT,
  body         TEXT
);
CREATE TABLE incident (
  case_no      INTEGER PRIMARY KEY,
  item         TEXT,
  room_id      INTEGER REFERENCES rooms(room_id),
  last_locked  TEXT,
  found_missing TEXT,
  reported_by  INTEGER REFERENCES people(person_id)
);`;

  /* ------------------------------------------------------------------ the ten people of interest */
  /* av: look of the SVG portrait. bio: what anyone on campus could tell you (no spoilers). */
  const CAST = [
    { id: 1007, name: 'Wren Calloway', role: 'cleaner', dept: 'Facilities', level: 2, tag: 'Night cleaner',
      bio: 'Cleans the main halls every evening and locks up after her round.', av: { bg: '#8fb8a8', skin: '#e8b98f', hair: '#5a3d2b', style: 'bun', acc: 'lanyard', shirt: '#3f7f6a' } },
    { id: 1013, name: 'Marisol Quade', role: 'student', dept: 'Mechatronics', level: 2, tag: 'Robotics president',
      bio: 'Captain of the winning Robotics team. Practically lives in the workshop.', av: { bg: '#b9a6e0', skin: '#c68a5e', hair: '#1f1a1a', style: 'long', acc: 'headset', shirt: '#6b4fb0' } },
    { id: 1021, name: 'Ignatius Bloom', role: 'lecturer', dept: 'Computer Science', level: 2, tag: 'Hackathon host',
      bio: 'Lecturer in Computer Science; organises the Midnight Hackathon every term.', av: { bg: '#e0c88f', skin: '#f1c9a5', hair: '#8a8a8a', style: 'short', acc: 'glasses', shirt: '#8a5a2b' } },
    { id: 1030, name: 'Halden Pike', role: 'security', dept: 'Campus Security', level: 3, tag: 'Night guard',
      bio: 'Night security guard. Walks five rounds a night and carries the master card.', av: { bg: '#8aa4cf', skin: '#d9a47a', hair: '#2b2b2b', style: 'cap', acc: 'none', shirt: '#2f4a78' } },
    { id: 1044, name: 'Thaddeus Rook', role: 'student', dept: 'Aerospace', level: 2, tag: 'Drone Society captain',
      bio: 'Captain of the runner-up Drone Society. Loud, competitive, and very unhappy about the Cup Final.', av: { bg: '#e0a39a', skin: '#f1c9a5', hair: '#b5532b', style: 'mohawk', acc: 'beard', shirt: '#b8433a' } },
    { id: 1052, name: 'Osric Fenn', role: 'student', dept: 'Electrical', level: 2, tag: 'AV volunteer',
      bio: 'Volunteers on the audio-visual crew; fixes every projector in the building.', av: { bg: '#a9d3dd', skin: '#8d5a3c', hair: '#161616', style: 'curly', acc: 'headset', shirt: '#2e7f95' } },
    { id: 1067, name: 'Juniper Ashdown', role: 'student', dept: 'Mechatronics', level: 2, tag: 'Robotics treasurer',
      bio: 'Treasurer of the Robotics Club. Keeps the receipts, the insurance papers and the keys.', av: { bg: '#e6b2cf', skin: '#f1c9a5', hair: '#7a2f55', style: 'short', acc: 'glasses', shirt: '#a14a7f' } },
    { id: 1073, name: 'Cassian Dray', role: 'student', dept: 'Mechatronics', level: 2, tag: 'Drone Society member',
      bio: 'Quiet second-year who builds drones and also plays Chess Club. Volunteers at events, so his card opens most doors.', av: { bg: '#b9c2cf', skin: '#e8b98f', hair: '#3a2a1f', style: 'short', acc: 'scarf', shirt: '#4b5a72' } },
    { id: 1088, name: 'Pell Vickery', role: 'student', dept: 'Computer Science', level: 2, tag: 'Drone Society member',
      bio: 'Drone Society pilot and events-committee member. Never says no to a favour.', av: { bg: '#c5d9a3', skin: '#c68a5e', hair: '#6a4a22', style: 'cap', acc: 'none', shirt: '#6a8a35' } },
    { id: 1096, name: 'Odalys Thorne', role: 'lecturer', dept: 'Materials Science', level: 2, tag: 'Archive curator',
      bio: 'Lecturer who looks after the display cases and the institute archive.', av: { bg: '#d9c0a0', skin: '#f1c9a5', hair: '#c9c9c9', style: 'long', acc: 'glasses', shirt: '#7a6a55' } }
  ];
  const CAST_BY_NAME = {};
  CAST.forEach((c) => { CAST_BY_NAME[c.name.split(' ')[0]] = c.id; });
  const P = CAST_BY_NAME;   // P.Cassian === 1073 ...

  const ROOMS = [
    [1, 'Main Gate', 'Gate House', 1], [2, 'Library', 'Library', 1], [3, 'Canteen', 'Commons', 1],
    [4, 'Lecture Hall A', 'North Block', 1], [5, 'Lecture Hall B', 'North Block', 1], [6, 'Lab 1', 'Science Block', 1],
    [7, 'Lab 2', 'Science Block', 1], [8, 'Lab 3', 'Science Block', 1], [9, 'Robotics Workshop', 'Workshop Row', 2],
    [10, 'Drone Hangar', 'Workshop Row', 2], [11, 'Chess Room', 'Commons', 1], [12, 'Sports Hall', 'Gym Block', 1],
    [13, 'Loading Dock', 'Workshop Row', 2], [14, 'Hall of Trophies', 'Commons', 2], [15, 'Security Office', 'Gate House', 3],
    [16, 'Staff Lounge', 'North Block', 2]
  ];
  const CLUBS = [[1, 'Robotics Club'], [2, 'Drone Society'], [3, 'Chess Club'], [4, 'Film Society'], [5, 'Debate Club'], [6, 'Cooking Club']];

  /* ------------------------------------------------------------------ helpers */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (mins) => pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
  function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  const hashName = (n) => fnv('trophy|' + String(n).trim().toLowerCase());
  const CULPRIT_HASH = '772dd94f';

  const FIRST = ['Aldous', 'Briar', 'Corwin', 'Dessa', 'Evander', 'Fenella', 'Gideon', 'Hesper', 'Isolde', 'Jarek', 'Kestrel', 'Lysander', 'Mirelle', 'Nestor', 'Oriel', 'Perrin', 'Quillon', 'Rhea', 'Sable', 'Tamsin', 'Ulric', 'Vesper', 'Wystan', 'Xanthe', 'Yarrow', 'Zephyr', 'Alder', 'Bram', 'Calla', 'Dorian', 'Elowen', 'Fable', 'Garnet', 'Hollis', 'Indigo', 'Jessamy', 'Kit', 'Linnea', 'Merrick', 'Nolan'];
  const LAST = ['Ashby', 'Birchall', 'Caldwell', 'Dunmore', 'Eastlake', 'Fairweather', 'Greaves', 'Hartwell', 'Ironside', 'Jessop', 'Kettering', 'Lockhart', 'Marlowe', 'Nettleton', 'Oakley', 'Pemberton', 'Quarrie', 'Redfern', 'Stannard', 'Tolliver', 'Underhill', 'Venn', 'Whitlock', 'Yardley', 'Zeller', 'Applegarth', 'Bellweather', 'Cobbett', 'Drummond', 'Elmsworth'];
  const DEPTS = ['Mechatronics', 'Computer Science', 'Electrical', 'Aerospace', 'Materials Science', 'Applied Maths', 'Civil'];

  const CATALOG = [   // [shop, item, category, price]
    ['Canteen', 'rice and chicken', 'food', 2.6], ['Canteen', 'noodle soup', 'food', 2.9], ['Canteen', 'sandwich', 'food', 1.8],
    ['Canteen', 'iced tea', 'drink', 0.9], ['Canteen', 'coffee', 'drink', 1.1], ['Canteen', 'energy drink', 'drink', 1.6],
    ['Campus Store', 'notebook', 'stationery', 1.5], ['Campus Store', 'pen set', 'stationery', 2.2], ['Campus Store', 'USB cable', 'tech', 3.4],
    ['Campus Store', 'battery pack', 'tech', 7.5], ['Campus Store', 'soldering wire', 'tech', 4.1], ['Print Shop', 'poster print', 'printing', 3.0],
    ['Print Shop', 'report binding', 'printing', 2.0]
  ];
  const PACKING = [['Campus Store', 'foam padding', 'packing', 4.5], ['Campus Store', 'packing tape', 'packing', 2.0], ['Campus Store', 'gift box', 'packing', 3.5],
    ['Campus Store', 'bubble wrap', 'packing', 3.0], ['Campus Store', 'cardboard box', 'packing', 2.5], ['Campus Store', 'duct tape', 'packing', 2.8]];
  const PACK = {}; PACKING.forEach((x) => { PACK[x[1]] = x; });

  const CHATTER = ['Are you coming to {club} on {day}?', 'Can you send me the lecture notes from {day}?', 'Lab report is due {day}, did you finish?',
    'Lunch at the canteen at 12?', 'I left my charger in the library, did you see it?', 'The projector in {room} is acting up again.',
    'Remember to bring your card to {room}.', 'Who has the key for the {room} cupboard?', 'Study group in {room}, 4 pm?',
    'The Wi-Fi in {room} is down again.', 'Thanks for the help with the circuit!', 'Did the coach announce the Cup Final seating?',
    'Can I borrow your multimeter?', 'Meeting moved to {day}, same room.', 'Anyone want to split a pizza after the {club} meeting?'];
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  /* ------------------------------------------------------------------ the generated database */
  function buildData() {
    const rnd = mulberry32(SEED);
    const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const chance = (p) => rnd() < p;

    /* people ------------------------------------------------------------ */
    const castIds = new Set(CAST.map((c) => c.id));
    const people = [];
    const taken = new Set(CAST.map((c) => c.name));
    const byId = {};
    let idNo = 1001;
    const noiseIds = [];
    for (let i = 0; i < 120; i++, idNo++) {
      const cast = CAST.find((c) => c.id === idNo);
      let row;
      if (cast) row = [cast.id, cast.name, cast.role, cast.dept, cast.level];
      else {
        let name; do { name = pick(FIRST) + ' ' + pick(LAST); } while (taken.has(name));
        taken.add(name);
        const k = noiseIds.length;
        let role = 'student', level = chance(0.12) ? 2 : 1;
        if (k % 14 === 5) { role = 'lecturer'; level = 2; } else if (k === 20 || k === 61 || k === 90) { role = 'security'; level = 3; } else if (k === 44 || k === 77) { role = 'cleaner'; level = 2; }
        const dept = role === 'security' ? 'Campus Security' : role === 'cleaner' ? 'Facilities' : pick(DEPTS);
        row = [idNo, name, role, dept, level];
        noiseIds.push(idNo);
      }
      people.push(row); byId[row[0]] = { id: row[0], name: row[1], role: row[2], level: row[4], cast: castIds.has(row[0]) };
    }
    const noiseStudents = noiseIds.filter((id) => byId[id].role === 'student');
    const noiseSecurity = noiseIds.filter((id) => byId[id].role === 'security');

    /* club members ------------------------------------------------------- */
    const members = [];
    const memSet = new Set();
    const addMem = (pid, cid, role, when) => { const k = pid + '/' + cid; if (!memSet.has(k)) { memSet.add(k); members.push([pid, cid, role, when]); } };
    addMem(P.Marisol, 1, 'president', '2025-09-08'); addMem(P.Juniper, 1, 'treasurer', '2025-09-15');
    addMem(P.Thaddeus, 2, 'captain', '2025-09-08'); addMem(P.Cassian, 2, 'member', '2026-02-02'); addMem(P.Pell, 2, 'member', '2026-02-09');
    addMem(P.Cassian, 3, 'member', '2025-10-01'); addMem(P.Osric, 4, 'member', '2025-09-22'); addMem(P.Ignatius, 5, 'advisor', '2024-09-01');
    noiseStudents.forEach((id) => {
      const n = chance(0.55) ? ri(1, 2) : 0;
      for (let j = 0; j < n; j++) addMem(id, ri(1, 6), 'member', '2025-' + pad(ri(9, 12)) + '-' + pad(ri(1, 28)));
    });

    /* swipes ------------------------------------------------------------- */
    const swipes = [];                                 // {p, r, ts, d}
    const addVisit = (p, r, date, inMin, outMin) => {
      swipes.push({ p, r, ts: date + ' ' + hm(inMin), d: 'IN' });
      swipes.push({ p, r, ts: date + ' ' + hm(outMin), d: 'OUT' });
    };
    const dates = [];
    for (let d = new Date(Date.UTC(2026, 8, 14)); d <= new Date(Date.UTC(2026, 9, 9)); d = new Date(d.getTime() + 86400000)) {
      dates.push({ s: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), dow: d.getUTCDay() });
    }
    const clubOf = {};
    members.forEach((m) => { (clubOf[m[0]] = clubOf[m[0]] || []).push(m[1]); });
    function roomsFor(id) {
      const p = byId[id], list = [2, 3, 4, 5, 6, 7, 8, 12, 2, 3, 4, 5, 6, 7, 8];
      if (p.role === 'security') list.push(15, 15, 14, 14, 13);
      if (p.role === 'cleaner') list.push(14, 16, 13, 4, 5);
      if (p.role === 'lecturer') list.push(16, 16, 14);
      (clubOf[id] || []).forEach((c) => { if (c === 1) list.push(9, 9, 9); if (c === 2) list.push(10, 10, 10); if (c === 3) list.push(11, 11); });
      return list.filter((r) => ROOMS[r - 1][3] <= p.level);
    }
    const allIds = people.map((p) => p[0]);
    allIds.forEach((id) => {
      const rl = roomsFor(id);
      dates.forEach((day) => {
        const weekend = day.dow === 0 || day.dow === 6;
        if (!chance(weekend ? 0.12 : 0.78)) return;
        const visits = ri(1, 3);
        let t = ri(8 * 60, 11 * 60);
        for (let v = 0; v < visits; v++) {
          const room = pick(rl), dur = ri(15, 110);
          const endLimit = day.s === '2026-10-09' ? 17 * 60 + 20 : 21 * 60;
          if (t + dur > endLimit) break;
          addVisit(id, room, day.s, t, t + dur);
          t += dur + ri(10, 90);
        }
      });
    });
    /* an ordinary Friday evening elsewhere on campus (never the Hall or Lab 3) */
    noiseIds.slice(0, 60).forEach((id) => {
      if (!chance(0.5)) return;
      const room = pick([2, 3, 6, 7, 12].filter((r) => ROOMS[r - 1][3] <= byId[id].level));
      const t = ri(18 * 60, 20 * 60 + 30);
      addVisit(id, room, '2026-10-09', t, t + ri(20, 80));
    });

    /* the planted night ---------------------------------------------------- */
    const D9 = '2026-10-09', D10 = '2026-10-10';
    const M = (h, m) => h * 60 + m;
    addVisit(P.Wren, ROOM_TROPHY, D9, M(18, 5), M(18, 40));
    addVisit(P.Marisol, ROOM_TROPHY, D9, M(18, 50), M(19, 20));
    addVisit(P.Ignatius, ROOM_TROPHY, D9, M(20, 15), M(20, 30));
    addVisit(P.Halden, ROOM_TROPHY, D9, M(22, 0), M(22, 6));
    addVisit(P.Thaddeus, ROOM_TROPHY, D9, M(23, 10), M(23, 25));
    addVisit(P.Osric, ROOM_TROPHY, D10, M(0, 20), M(0, 38));
    addVisit(P.Juniper, ROOM_TROPHY, D10, M(1, 30), M(1, 37));
    addVisit(P.Cassian, ROOM_TROPHY, D10, M(2, 2), M(2, 9));
    addVisit(P.Pell, ROOM_TROPHY, D10, M(2, 48), M(2, 56));
    addVisit(P.Odalys, ROOM_TROPHY, D10, M(3, 35), M(3, 50));
    addVisit(P.Halden, ROOM_TROPHY, D10, M(4, 0), M(4, 20));
    /* the hackathon in Lab 3: everyone on the sheet except Cassian really swiped in */
    const hackers = [P.Ignatius, P.Osric, P.Juniper, P.Pell].concat(noiseStudents.filter((id) => byId[id].level >= 1).slice(0, 12));
    hackers.forEach((id) => {
      if (id === P.Juniper) { swipes.push({ p: id, r: ROOM_LAB3, ts: D9 + ' 20:01', d: 'IN' }, { p: id, r: ROOM_LAB3, ts: D10 + ' 01:20', d: 'OUT' }); return; }
      if (id === P.Osric) { swipes.push({ p: id, r: ROOM_LAB3, ts: D9 + ' 19:55', d: 'IN' }, { p: id, r: ROOM_LAB3, ts: D10 + ' 00:15', d: 'OUT' }); return; }
      if (id === P.Pell) { swipes.push({ p: id, r: ROOM_LAB3, ts: D9 + ' 20:03', d: 'IN' }, { p: id, r: ROOM_LAB3, ts: D10 + ' 02:10', d: 'OUT' }); return; }
      if (id === P.Ignatius) { swipes.push({ p: id, r: ROOM_LAB3, ts: D9 + ' 19:45', d: 'IN' }, { p: id, r: ROOM_LAB3, ts: D10 + ' 02:15', d: 'OUT' }); return; }
      swipes.push({ p: id, r: ROOM_LAB3, ts: D9 + ' ' + hm(M(19, 50) + ri(0, 35)), d: 'IN' }, { p: id, r: ROOM_LAB3, ts: D10 + ' ' + hm(M(1, 30) + ri(0, 45)), d: 'OUT' });
    });
    /* Cassian: casing the Hall on 6 Oct, a normal Lab 3 session on 7 Oct, then his night */
    addVisit(P.Cassian, ROOM_TROPHY, '2026-10-06', M(14, 30), M(14, 38));
    addVisit(P.Cassian, ROOM_LAB3, '2026-10-07', M(10, 0), M(11, 30));
    swipes.push({ p: P.Cassian, r: ROOM_GATE, ts: D9 + ' 19:50', d: 'IN' },
      { p: P.Cassian, r: ROOM_DOCK, ts: D10 + ' 01:50', d: 'IN' },
      { p: P.Cassian, r: ROOM_DOCK, ts: D10 + ' 02:14', d: 'OUT' },
      { p: P.Cassian, r: ROOM_HANGAR, ts: D10 + ' 02:21', d: 'IN' },
      { p: P.Cassian, r: ROOM_HANGAR, ts: D10 + ' 03:05', d: 'OUT' },
      { p: P.Cassian, r: ROOM_GATE, ts: D10 + ' 03:12', d: 'OUT' });
    const filtered = swipes;   // noise never touches the Hall or Lab 3 after 17:20 on Friday (checked in the Node tests)
    filtered.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.p - b.p || (a.d < b.d ? -1 : 1)));
    const swipeRows = filtered.map((s, i) => [i + 1, s.p, s.r, s.ts, s.d]);

    /* events ------------------------------------------------------------------ */
    const evTitles = ['Robotics open day', 'Chess ladder round', 'Film night', 'Debate: AI in class', 'Bake sale', 'Drone flight test', 'Career talk', 'Lab safety briefing', 'Soldering workshop', 'Quiz night', 'Python clinic', 'Blood drive'];
    const events = [];
    for (let i = 1; i <= 23; i++) {
      const day = pick(dates.slice(0, 22)).s, h = ri(9, 18);
      events.push([i, evTitles[(i - 1) % evTitles.length] + (i > evTitles.length ? ' #2' : ''), pick([4, 5, 6, 7, 9, 10, 11, 12]), day + ' ' + hm(h * 60), day + ' ' + hm(h * 60 + ri(60, 180)), pick(noiseIds)]);
    }
    events.push([HACKATHON_ID, 'Midnight Hackathon', ROOM_LAB3, '2026-10-09 20:00', '2026-10-10 03:00', P.Ignatius]);
    events.push([25, 'Inter-Club Cup Final', 12, '2026-10-09 15:00', '2026-10-09 17:00', P.Marisol]);
    const attendance = [];
    hackers.concat([P.Cassian]).forEach((id) => attendance.push([HACKATHON_ID, id]));
    for (let i = 1; i <= 23; i++) { const n = ri(5, 14), seen = new Set(); for (let j = 0; j < n; j++) { const id = pick(noiseStudents); if (!seen.has(id)) { seen.add(id); attendance.push([i, id]); } } }
    [P.Marisol, P.Juniper, P.Thaddeus, P.Cassian, P.Pell, P.Osric].forEach((id) => attendance.push([25, id]));
    noiseStudents.slice(20, 50).forEach((id) => attendance.push([25, id]));

    /* purchases ----------------------------------------------------------------- */
    const purchases = [];
    const addBuy = (pid, ts, row) => purchases.push({ p: pid, ts, shop: row[0], item: row[1], cat: row[2], amt: row[3] });
    allIds.forEach((id) => {
      dates.forEach((day) => {
        if (day.dow === 0 || day.dow === 6 || !chance(0.33)) return;
        const n = ri(1, 2);
        for (let k = 0; k < n; k++) addBuy(id, day.s + ' ' + hm(ri(8 * 60, 17 * 60)), pick(CATALOG));
      });
    });
    /* a few harmless single packing purchases elsewhere in the term, none of them suspects */
    const lone = noiseStudents.slice(30, 40);
    lone.forEach((id, i) => addBuy(id, dates[(i * 2) % 18].s + ' ' + hm(ri(9 * 60, 16 * 60)), PACKING[i % PACKING.length]));
    /* people who buy 2+ packing items in the week before: a few innocents plus Cassian */
    const rhea = noiseStudents[2], dorian = noiseStudents[6];
    addBuy(rhea, '2026-10-07 10:12', PACK['foam padding']); addBuy(rhea, '2026-10-07 10:13', PACK['cardboard box']); addBuy(rhea, '2026-10-07 10:14', PACK['bubble wrap']);
    addBuy(dorian, '2026-10-06 15:40', PACK['duct tape']); addBuy(dorian, '2026-10-06 15:41', PACK['duct tape']);
    ['cardboard box', 'cardboard box', 'cardboard box', 'cardboard box', 'bubble wrap'].forEach((it, i) => addBuy(P.Marisol, '2026-10-08 12:0' + i, PACK[it]));
    addBuy(P.Thaddeus, '2026-10-08 16:30', PACK['packing tape']); addBuy(P.Thaddeus, '2026-10-08 16:31', PACK['cardboard box']);
    addBuy(P.Pell, '2026-10-08 13:40', PACK['gift box']);
    addBuy(P.Cassian, '2026-10-08 15:20', PACK['foam padding']); addBuy(P.Cassian, '2026-10-09 11:05', PACK['gift box']); addBuy(P.Cassian, '2026-10-09 11:06', PACK['packing tape']);
    purchases.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.p - b.p));
    const purchaseRows = purchases.map((x, i) => [i + 1, x.p, x.shop, x.item, x.cat, x.amt, x.ts]);

    /* messages -------------------------------------------------------------------- */
    const msgs = [];
    const roomNames = ROOMS.map((r) => r[1]);
    for (let i = 0; i < 520; i++) {
      const a = pick(allIds); let b = pick(allIds); if (b === a) b = pick(allIds);
      if (castIds.has(a) && chance(0.7)) continue;                       // cast speak mostly through the planted lines
      const day = pick(dates.slice(0, 22)).s;
      const body = pick(CHATTER).replace('{club}', pick(CLUBS)[1]).replace('{day}', pick(DAYS)).replace('{room}', pick(roomNames.slice(1, 12)));
      msgs.push([a, b, day + ' ' + hm(ri(7 * 60, 22 * 60)), body]);
    }
    /* pre-event excitement: mentions the Golden Gear but long before the night */
    msgs.push([noiseStudents[10], noiseStudents[11], '2026-10-02 12:30', 'Cup Final next Friday! Robotics vs Drone Society, winner takes the Golden Gear.']);
    msgs.push([noiseStudents[12], noiseStudents[13], '2026-10-08 18:05', 'Whoever wins gets the Golden Gear for a whole year. Tense.']);
    const dronePal = noiseStudents.find((id) => (clubOf[id] || []).includes(2)) || noiseStudents[14];
    const guardDesk = noiseSecurity[0];
    msgs.push(
      [P.Thaddeus, dronePal, '2026-10-08 21:10', 'Mark my words: the Golden Gear ends up in OUR hangar next year. Robotics just got lucky.'],
      [P.Marisol, noiseStudents[15], '2026-10-09 16:20', 'WE WON!! The Golden Gear goes to the Hall of Trophies tonight. Come and see it tomorrow!'],
      [P.Marisol, P.Juniper, '2026-10-08 12:10', 'Bought boxes and bubble wrap for shipping the robot to the regional contest. Receipt is yours, treasurer.'],
      [P.Thaddeus, dronePal, '2026-10-08 16:40', 'Got packing tape and a box for the drone parts going back to the supplier.'],
      [P.Pell, noiseStudents[17], '2026-10-08 13:50', 'Picked up a gift box for my mum\'s birthday. Hope she likes the scarf.'],
      [P.Cassian, P.Pell, '2026-10-09 19:40', 'Can you put my name on the hackathon sheet? I have an errand tonight. I owe you one.'],
      [P.Pell, P.Cassian, '2026-10-09 19:44', 'Fine. Just do not make me regret it.'],
      [P.Halden, guardDesk, '2026-10-09 22:05', 'Round 3 done. Hall of Trophies locked. Golden Gear on its plinth under the display cloth.'],
      [P.Thaddeus, dronePal, '2026-10-09 23:20', 'Stood in front of the Golden Gear for ten minutes. Still stings. At least it is safe in there.'],
      [P.Osric, P.Ignatius, '2026-10-10 00:40', 'Projector cable in the Hall of Trophies is fixed. Golden Gear still on its plinth, photo attached.'],
      [P.Juniper, P.Marisol, '2026-10-10 01:38', 'Insurance tag photographed: the Golden Gear is on its plinth, serial GG-0412 visible. All good.'],
      [P.Pell, noiseStudents[16], '2026-10-10 02:51', 'Grabbed the spare bunting from the Hall store cupboard. Long night.'],
      [P.Odalys, P.Ignatius, '2026-10-10 03:41', 'Humidity logger in the Hall reads normal. Heading home.'],
      [P.Halden, guardDesk, '2026-10-10 04:07', 'ALARM Hall of Trophies. Under the cloth there is only an empty gift box. The Golden Gear is GONE.'],
      [guardDesk, P.Halden, '2026-10-10 04:12', 'Understood. Locking the building and calling the police now.']
    );
    msgs.sort((a, b) => (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : a[0] - b[0]));
    const messageRows = msgs.map((m, i) => [i + 1, m[0], m[1], m[2], m[3]]);

    return {
      people, rooms: ROOMS, clubs: CLUBS, club_members: members, keycard_swipes: swipeRows, events, event_attendance: attendance,
      purchases: purchaseRows, messages: messageRows,
      incident: [[2026101, 'Golden Gear trophy', ROOM_TROPHY, LOCKED_AT, FOUND_AT, P.Halden]]
    };
  }

  function openDatabase() {
    const db = new Sql.Database();
    const r = db.run(DDL);
    if (r.error) throw new Error('Case file DDL: ' + r.error.message);
    const data = buildData();
    Object.keys(data).forEach((t) => db.load(t, data[t]));
    return db;
  }

  /* ------------------------------------------------------------------ the six chapters of the investigation */
  const LEVELS = [
    {
      id: 1, topic: 'SELECT and WHERE', title: 'Who was at the door?',
      task: 'Open the incident file, then list every card swipe on the door of the Hall of Trophies between the time it was locked and the time the theft was found. Your result must show the swipe times.',
      ok: { needles: [['2026-10-09 18:05'], ['2026-10-10 02:02'], ['2026-10-10 03:35']], maxRows: 40 },
      ref: "SELECT * FROM keycard_swipes\nWHERE room_id = 14\n  AND ts BETWEEN '2026-10-09 17:30' AND '2026-10-10 04:07'\nORDER BY ts;",
      hints: [
        'Two tables matter first. incident tells you WHICH room and WHEN it was locked and found missing. keycard_swipes records every door event.',
        "Filter keycard_swipes with WHERE room_id = ... AND ts BETWEEN '...' AND '...'. Times are text in the form 'YYYY-MM-DD HH:MM', and text in that form sorts in time order.",
        "SELECT * FROM keycard_swipes\nWHERE room_id = 14\n  AND ts BETWEEN '2026-10-09 17:30' AND '2026-10-10 04:07'\nORDER BY ts;"
      ],
      clueTitle: 'The door log',
      clue: 'Ten different people opened the Hall of Trophies door between the lock-up and the discovery. The thief must be one of the ten, but you do not yet know when the Golden Gear was last seen.',
      evidence: ['The Hall of Trophies (room 14) was locked at 17:30 on Friday and the theft was found at 04:07 on Saturday.', 'Ten people swiped into the Hall in between: the ten faces on the board.'],
      board: {}
    },
    {
      id: 2, topic: 'ORDER BY and LIMIT', title: 'When was it last seen?',
      task: 'People gossip. Find the newest messages that mention the Golden Gear: sort by time, newest first, and keep only the first few. Who saw it last, and when?',
      ok: { needles: [['2026-10-10 01:38']], maxRows: 8 },
      ref: "SELECT msg_id, ts, sender_id, body FROM messages\nWHERE body LIKE '%Golden Gear%'\nORDER BY ts DESC\nLIMIT 3;",
      hints: [
        'The messages table has a body column. LIKE with % wildcards finds a word inside it.',
        "WHERE body LIKE '%Golden Gear%' picks the right messages. ORDER BY ts DESC puts the newest first, and LIMIT 3 keeps the top three.",
        "SELECT msg_id, ts, sender_id, body FROM messages\nWHERE body LIKE '%Golden Gear%'\nORDER BY ts DESC\nLIMIT 3;"
      ],
      clueTitle: 'The last sighting',
      clue: "At 01:38 Juniper photographed the Golden Gear on its plinth, after she had already left the Hall (OUT at 01:37). The theft cannot have happened before 01:38. Everyone who had left the Hall by then is cleared; the thief is among those who came IN after 01:38.",
      evidence: ['Last sighting: Juniper Ashdown, 01:38, Golden Gear on its plinth (she swiped OUT of the Hall at 01:37).', 'The thief swiped IN after 01:38: Cassian Dray, Pell Vickery, Odalys Thorne or Halden Pike.'],
      board: { 1007: ['cleared', 'Left the Hall at 18:40, long before the last sighting.'], 1013: ['cleared', 'Left the Hall at 19:20.'], 1021: ['cleared', 'Left the Hall at 20:30.'],
        1044: ['cleared', 'Left at 23:25; the trophy was still there at 01:38.'], 1052: ['cleared', 'Left at 00:38; the trophy was still there at 01:38.'], 1067: ['cleared', 'Left at 01:37 and photographed the trophy at 01:38.'] }
    },
    {
      id: 3, topic: 'JOIN', title: 'Faces and clubs',
      task: 'The swipe table only has numbers. JOIN it to people to get names, and to the club tables to see who belongs to which club. Show who swiped IN to the Hall after the last sighting, with their club. (People with no club should still appear: think LEFT JOIN.)',
      ok: { needles: [['Cassian Dray'], ['Pell Vickery'], ['Drone Society']], maxRows: 14 },
      ref: "SELECT s.ts, p.name, c.club_name\nFROM keycard_swipes s\nJOIN people p ON p.person_id = s.person_id\nLEFT JOIN club_members m ON m.person_id = p.person_id\nLEFT JOIN clubs c ON c.club_id = m.club_id\nWHERE s.room_id = 14 AND s.direction = 'IN'\n  AND s.ts > '2026-10-10 01:38'\nORDER BY s.ts;",
      hints: [
        'Chain the tables: keycard_swipes -> people (on person_id) -> club_members (on person_id) -> clubs (on club_id).',
        'Use JOIN for people, but LEFT JOIN for club_members and clubs, because some people belong to no club and an inner JOIN would drop them. Keep room 14, direction IN, and ts later than the last sighting.',
        "SELECT s.ts, p.name, c.club_name\nFROM keycard_swipes s\nJOIN people p ON p.person_id = s.person_id\nLEFT JOIN club_members m ON m.person_id = p.person_id\nLEFT JOIN clubs c ON c.club_id = m.club_id\nWHERE s.room_id = 14 AND s.direction = 'IN'\n  AND s.ts > '2026-10-10 01:38'\nORDER BY s.ts;"
      ],
      clueTitle: 'A rival in the building',
      clue: 'Four people came after the last sighting. Cassian and Pell belong to the Drone Society, the club that lost the Cup Final to Robotics: a motive. Odalys (archive curator) and Halden (the guard who raised the alarm) belong to no club and have no link to the contest.',
      evidence: ['Late visitors: Cassian Dray (Drone Society, Chess Club), Pell Vickery (Drone Society), Odalys Thorne (no club), Halden Pike (no club).', 'Only the Drone Society lost the Cup Final, so only Cassian and Pell have a motive.'],
      board: { 1096: ['cleared', 'No club, no stake in the Cup Final.'], 1030: ['cleared', 'No club; he raised the alarm himself.'] }
    },
    {
      id: 4, topic: 'GROUP BY and HAVING', title: 'The shopping list',
      task: 'Whoever took the trophy needed something to pack or swap it. In purchases, count the items of category packing that each person bought from 5 October on, and keep only people who bought 2 or more. Name them.',
      ok: { needles: [['Cassian Dray', 1073], ['Marisol Quade', 1013]], maxRows: 12 },
      ref: "SELECT p.name, COUNT(*) AS packing_items\nFROM purchases pu\nJOIN people p ON p.person_id = pu.person_id\nWHERE pu.category = 'packing' AND pu.ts >= '2026-10-05'\nGROUP BY p.person_id, p.name\nHAVING COUNT(*) >= 2\nORDER BY packing_items DESC;",
      hints: [
        'Filter rows first with WHERE (category and date), then GROUP BY person, and finally filter the groups with HAVING.',
        "WHERE category = 'packing' AND ts >= '2026-10-05' ... GROUP BY person ... HAVING COUNT(*) >= 2. Join people if you want names instead of numbers.",
        "SELECT p.name, COUNT(*) AS packing_items\nFROM purchases pu\nJOIN people p ON p.person_id = pu.person_id\nWHERE pu.category = 'packing' AND pu.ts >= '2026-10-05'\nGROUP BY p.person_id, p.name\nHAVING COUNT(*) >= 2\nORDER BY packing_items DESC;"
      ],
      clueTitle: 'Foam, tape and a gift box',
      clue: 'Several people bought packing material this week (Marisol for shipping robots, Thaddeus for drone parts), but of the two Drone Society suspects only Cassian bought three items: foam padding, a gift box and packing tape. Pell bought a single gift box. The guard found an empty gift box under the display cloth.',
      evidence: ['Cassian Dray bought foam padding, a gift box and packing tape on 8 and 9 October.', 'Pell Vickery bought one gift box and nothing else: below the line.'],
      board: { 1088: ['cleared', 'Only one packing item (a gift box), well below the pattern.'] }
    },
    {
      id: 5, topic: 'Subqueries', title: 'The broken alibi',
      task: "Cassian says he spent the night at the Midnight Hackathon in Lab 3, and he is on the sign-in sheet (event_attendance). Find the attendees who have NO card swipe into Lab 3 during the night of the hackathon. Use a sub-query (NOT IN or NOT EXISTS) and remember to limit the swipes to that night.",
      ok: { needles: [['Cassian Dray', 1073]], maxRows: 3 },
      ref: "SELECT p.person_id, p.name\nFROM event_attendance ea\nJOIN people p ON p.person_id = ea.person_id\nWHERE ea.event_id = 24\n  AND p.person_id NOT IN (\n    SELECT person_id FROM keycard_swipes\n    WHERE room_id = 8\n      AND ts BETWEEN '2026-10-09 18:00' AND '2026-10-10 03:00');",
      hints: [
        'Look at events to find the hackathon id and its room. The question has two parts: who is on the sheet, and who is NOT among the people who swiped into that room that night.',
        "Outer query: attendees of event 24. Inner query (in parentheses): SELECT person_id FROM keycard_swipes WHERE room_id = 8 AND ts BETWEEN ... . Combine with person_id NOT IN (inner query). Without the time filter an older Lab 3 swipe would hide the liar.",
        "SELECT p.person_id, p.name\nFROM event_attendance ea\nJOIN people p ON p.person_id = ea.person_id\nWHERE ea.event_id = 24\n  AND p.person_id NOT IN (\n    SELECT person_id FROM keycard_swipes\n    WHERE room_id = 8\n      AND ts BETWEEN '2026-10-09 18:00' AND '2026-10-10 03:00');"
      ],
      clueTitle: 'Alibi broken',
      clue: "Sixteen of the seventeen names on the sheet swiped into Lab 3 that night. Cassian did not: his name was written on the sheet (he even asked Pell to do it), while his own card was opening the Hall of Trophies at 02:02, with the hackathon still running until 03:00. He did swipe into Lab 3 once, on 7 October, which is why a query without a time filter would let him slip away.",
      evidence: ['Cassian Dray is on the Midnight Hackathon sign-in sheet but has no Lab 3 swipe that night.', 'At 19:40 he messaged Pell: "Can you put my name on the hackathon sheet? I have an errand tonight."'],
      board: { 1073: ['prime', 'Late visitor, rival club, packing material, and a false alibi.'] }
    },
    {
      id: 6, topic: 'Indexes', title: 'Follow the card',
      task: "Trace Cassian's card (person_id 1073) over the whole swipe archive. The archive is huge, and campus IT cancels any query that reads more than 300 rows. Run it once and look at the plan; if it is refused, make the lookup fast with CREATE INDEX and run it again.",
      ok: { needles: [['2026-10-10 02:21']], maxRows: 200, maxRead: 300 },
      ref: "CREATE INDEX idx_swipes_person ON keycard_swipes(person_id);\nSELECT * FROM keycard_swipes\nWHERE person_id = 1073\nORDER BY ts;",
      hints: [
        'Run SELECT * FROM keycard_swipes WHERE person_id = 1073; and read the plan panel. How many rows did the database have to look at to find about 70?',
        'Without an index the engine reads every row of the table. An index on the column in your WHERE lets it jump straight to the matching rows: CREATE INDEX name ON table(column);',
        "CREATE INDEX idx_swipes_person ON keycard_swipes(person_id);\nSELECT * FROM keycard_swipes\nWHERE person_id = 1073\nORDER BY ts;"
      ],
      clueTitle: 'The trail to the hangar',
      clue: "Cassian's card tells the rest: Loading Dock IN at 01:50, the Hall of Trophies 02:02 to 02:09, Loading Dock OUT at 02:14, then the Drone Hangar IN at 02:21 and OUT at 03:05. The Golden Gear never left Workshop Row: it is in the Drone Hangar. The same lookup that read thousands of rows now reads only Cassian's own swipes.",
      evidence: ["Cassian's route: Loading Dock 01:50, Hall of Trophies 02:02-02:09, Loading Dock 02:14, Drone Hangar 02:21-03:05.", 'On 6 October he had visited the Hall for eight minutes: he had been casing the room.'],
      board: {}
    }
  ];

  /* ------------------------------------------------------------------ checking a result against a level */
  function cellsOf(result) {
    const set = new Set();
    result.rows.forEach((row) => row.forEach((v) => { if (v !== null) set.add(String(v).trim().toLowerCase()); }));
    return set;
  }
  /* result: one SELECT result from Database.run(); returns {pass, reason} */
  function checkLevel(levelIdx, result) {
    const lv = LEVELS[levelIdx], ok = lv.ok;
    if (!result || result.kind !== 'select') return { pass: false, reason: 'Run a SELECT to look for the clue.' };
    if (result.rows.length > ok.maxRows) return { pass: false, reason: 'Your result has ' + result.rows.length + ' rows: too many to read. Narrow it down with WHERE (at most ' + ok.maxRows + ' rows).' };
    if (ok.maxRead && result.stats.rowsRead > ok.maxRead) {
      return { pass: false, reason: 'IT cancelled this one: it read ' + result.stats.rowsRead + ' rows and the limit is ' + ok.maxRead + '. Give the database a faster way in.' };
    }
    const cells = cellsOf(result);
    const missing = ok.needles.filter((alts) => !alts.some((a) => cells.has(String(a).toLowerCase())));
    if (missing.length) return { pass: false, reason: 'Not yet: the clue is not in this result. Re-read the task and check your filters.' };
    return { pass: true, reason: '' };
  }

  /* ------------------------------------------------------------------ SVG portraits */
  function avatarSvg(av, label, size) {
    const s = av, ink = '#1c1c28';
    let hairBack = '', hairFront = '', acc = '';
    switch (s.style) {
      case 'long':
        hairBack = '<path d="M19 28 C16 10 48 10 45 28 L47 48 L38 48 L39 30 L25 30 L26 48 L17 48 Z" fill="' + s.hair + '"/>';
        hairFront = '<path d="M20 26 C20 13 44 13 44 26 C40 20 24 20 20 26 Z" fill="' + s.hair + '"/>'; break;
      case 'bun':
        hairBack = '<circle cx="32" cy="12" r="5.5" fill="' + s.hair + '"/>';
        hairFront = '<path d="M20 27 C19 12 45 12 44 27 C40 19 24 19 20 27 Z" fill="' + s.hair + '"/>'; break;
      case 'cap':
        hairFront = '<path d="M20 25 C20 10 44 10 44 25 Z" fill="' + s.hair + '"/><rect x="18" y="23" width="30" height="3.4" rx="1.6" fill="' + s.hair + '"/>'; break;
      case 'curly':
        hairFront = '<g fill="' + s.hair + '"><circle cx="23" cy="19" r="5"/><circle cx="29" cy="14.5" r="5.2"/><circle cx="36" cy="14.5" r="5.2"/><circle cx="41.5" cy="19" r="5"/><circle cx="21.5" cy="25" r="3.6"/><circle cx="42.5" cy="25" r="3.6"/></g>'; break;
      case 'mohawk':
        hairFront = '<path d="M28 6 L36 6 L37.5 19 L26.5 19 Z" fill="' + s.hair + '"/>'; break;
      case 'bald': break;
      default:
        hairFront = '<path d="M20.5 27 C19 12 45 12 43.5 27 C40 20 24 20 20.5 27 Z" fill="' + s.hair + '"/>';
    }
    if (s.acc === 'glasses') acc = '<g fill="none" stroke="' + ink + '" stroke-width="1.3"><circle cx="27" cy="29" r="3.8"/><circle cx="37" cy="29" r="3.8"/><path d="M30.8 29 H33.2"/></g>';
    else if (s.acc === 'beard') acc = '<path d="M21 31 C21 46 43 46 43 31 C40 38 24 38 21 31 Z" fill="' + s.hair + '"/>';
    else if (s.acc === 'scarf') acc = '<path d="M22 43 C28 48 36 48 42 43 L44 50 C36 55 28 55 20 50 Z" fill="#c8523c"/>';
    else if (s.acc === 'headset') acc = '<g fill="none" stroke="' + ink + '" stroke-width="1.6" stroke-linecap="round"><path d="M20 28 C19 12 45 12 44 28"/><path d="M44 29 C44 36 41 38 37 38.5"/></g><rect x="17.8" y="26" width="3.6" height="7" rx="1.6" fill="' + ink + '"/><rect x="42.6" y="26" width="3.6" height="7" rx="1.6" fill="' + ink + '"/>';
    else if (s.acc === 'lanyard') acc = '<path d="M26 45 L32 58 L38 45" fill="none" stroke="#e8e8f0" stroke-width="1.6"/><rect x="29.5" y="56" width="5" height="6" rx="1" fill="#ffffff" stroke="' + ink + '" stroke-width="0.6"/>';
    const sz = size ? ' width="' + size + '" height="' + size + '"' : '';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"' + sz + ' role="img" aria-label="' + label.replace(/"/g, '') + '">' +
      '<title>' + label.replace(/[<&]/g, '') + '</title><rect width="64" height="64" rx="12" fill="' + s.bg + '"/>' + hairBack +
      '<path d="M6 64 C8 50 20 44 32 44 C44 44 56 50 58 64 Z" fill="' + s.shirt + '"/><rect x="28" y="37" width="8" height="9" rx="2" fill="' + s.skin + '"/>' +
      '<ellipse cx="32" cy="28.5" rx="11" ry="13" fill="' + s.skin + '"/>' + hairFront +
      '<circle cx="27.5" cy="29" r="1.3" fill="' + ink + '"/><circle cx="36.5" cy="29" r="1.3" fill="' + ink + '"/>' +
      '<path d="M28.5 35.5 Q32 38 35.5 35.5" fill="none" stroke="' + ink + '" stroke-width="1.2" stroke-linecap="round"/>' + acc + '</svg>';
  }

  const api = {
    SEED, DDL, CAST, ROOMS, LEVELS, LOCKED_AT, FOUND_AT, LAST_SEEN, HACKATHON_ID, CULPRIT_HASH,
    buildData, openDatabase, checkLevel, avatarSvg, hashName, mulberry32
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SqlDetective = api;

  /* ==================================================================================================== UI */
  if (typeof document === 'undefined') return;
  const mount = document.getElementById('sd-root');
  if (!mount || !Sql) return;

  const KEY = 'co1005-sql-detective-v1';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const $ = (sel, el) => (el || mount).querySelector(sel);
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let db, S;     // S = saved state
  let flow = null;   // 'Inside the database' diagram (assets/sql-flow.js); purely a view of db.trace()
  const fresh = () => ({ solved: [], hints: {}, notebook: [], wrong: 0, runs: 0, closed: false, big: false, view: 0, draft: '' });
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && Array.isArray(v.solved)) return Object.assign(fresh(), v); } catch (e) { /* no storage */ } return fresh(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  const nextOpen = () => { for (let i = 0; i < D_LEVELS.length; i++) if (!S.solved.includes(i)) return i; return D_LEVELS.length; };
  const D_LEVELS = LEVELS;
  const lastRead = {};      // normalised sql -> rowsRead of the previous run (for the before/after note)

  /* --------------------------------------------------------------- skeleton */
  function skeleton() {
    mount.innerHTML =
      '<section class="sd-board" aria-labelledby="sd-board-h">' +
        '<div class="sd-board-head"><h2 id="sd-board-h">Case board</h2><span class="sd-progress" id="sd-progress"></span>' +
        '<span class="sd-tools"><button type="button" class="btn ghost small" id="sd-big" aria-pressed="false">Large type</button>' +
        '<span id="sd-resetwrap"><button type="button" class="btn ghost small" id="sd-reset">New investigation</button></span></span></div>' +
        '<div class="sd-board-grid"><ul class="sd-suspects" id="sd-suspects" aria-label="People of interest"></ul>' +
        '<div class="sd-side"><div class="sd-evwrap"><h3>Evidence</h3><ol class="sd-evidence" id="sd-evidence"></ol></div>' +
        '<form class="sd-accuse" id="sd-accuse"><h3>Make your accusation</h3><label for="sd-who">The thief is</label>' +
        '<div class="sd-accuse-row"><select id="sd-who"><option value="">Choose a suspect…</option></select><button type="submit" class="btn primary small">Accuse</button></div>' +
        '<p class="sd-accuse-msg" id="sd-accuse-msg" role="status"></p></form></div></div>' +
        '<div id="sd-closed" class="sd-closed" hidden></div>' +
      '</section>' +
      '<section class="sd-work" aria-label="Investigation desk">' +
        '<div class="sd-main">' +
          '<ol class="sd-steps" id="sd-steps" aria-label="Chapters of the investigation"></ol>' +
          '<div class="sd-mission" id="sd-mission"></div>' +
          '<div class="sd-editor-wrap"><label class="sd-label" for="sd-sql">Your query <span>(Ctrl/Cmd + Enter runs it)</span></label>' +
          '<textarea id="sd-sql" class="sd-editor" rows="7" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="SELECT * FROM incident;"></textarea>' +
          '<div class="sd-actions"><button type="button" class="btn primary" id="sd-run">Run</button><button type="button" class="btn ghost small" id="sd-clear">Clear</button>' +
          '<p class="sd-status" id="sd-status" role="status" aria-live="polite"></p></div></div>' +
          '<div class="sd-outrow"><div id="sd-result" class="sd-result"></div><div id="sd-plan" class="sd-plan" hidden></div></div><div id="sd-clue"></div>' +
        '</div>' +
        '<aside class="sd-aside" data-tab="schema"><div class="sd-tabs" role="group" aria-label="Tools">' +
          '<button type="button" class="sd-tab" data-tab="machine" aria-pressed="false">Inside the database</button><button type="button" class="sd-tab" data-tab="schema" aria-pressed="true">Schema browser</button><button type="button" class="sd-tab" data-tab="notebook" aria-pressed="false">Notebook</button></div>' +
        '<section class="sd-card sd-machine" aria-label="Inside the database"><h3>Inside the database <span class="sd-sub">every query goes through the machine (a simulation)</span></h3><div id="sd-flow"></div></section>' +
        '<section class="sd-card sd-schemacard"><h3>Schema browser</h3><div id="sd-schema"></div></section>' +
        '<section class="sd-card sd-nbcard"><h3>Notebook <span class="sd-sub">your earlier queries</span></h3><ul class="sd-notebook" id="sd-notebook"></ul></section></aside>' +
      '</section>';
    const sel = $('#sd-who');
    CAST.forEach((c) => { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name + ' (' + c.tag + ')'; sel.appendChild(o); });
  }

  /* --------------------------------------------------------------- board */
  function statusOf(personId) {
    let st = ['open', 'In the frame'], why = '';
    S.solved.slice().sort().forEach((i) => { const b = LEVELS[i].board[personId]; if (b) { st = [b[0], b[0] === 'cleared' ? 'Cleared' : 'Prime suspect']; why = b[1]; } });
    return { cls: st[0], label: st[1], why };
  }
  function renderBoard() {
    const ul = $('#sd-suspects'); ul.innerHTML = '';
    CAST.forEach((c) => {
      const st = statusOf(c.id);
      const li = document.createElement('li');
      li.className = 'sd-sus sd-' + st.cls;
      li.innerHTML = '<div class="sd-pin" aria-hidden="true"></div><div class="sd-photo">' + avatarSvg(c.av, c.name, 64) + '</div>' +
        '<div class="sd-sus-body"><b class="sd-sus-name">' + esc(c.name) + '</b><span class="sd-sus-tag">' + esc(c.tag) + ' · id ' + c.id + '</span>' +
        '<span class="sd-sus-bio">' + esc(c.bio) + '</span>' +
        '<span class="sd-chip sd-chip-' + st.cls + '">' + st.label + '</span>' + (st.why ? '<span class="sd-sus-why">' + esc(st.why) + '</span>' : '') + '</div>';
      ul.appendChild(li);
    });
    const ev = $('#sd-evidence'); ev.innerHTML = '';
    S.solved.slice().sort().forEach((i) => LEVELS[i].evidence.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ev.appendChild(li); }));
    if (!ev.children.length) { const li = document.createElement('li'); li.className = 'sd-none'; li.textContent = 'Nothing yet. Solve chapter 1 to pin your first clue here.'; ev.appendChild(li); }
    $('#sd-progress').textContent = S.solved.length + ' of ' + LEVELS.length + ' clues found' + (S.closed ? ' · case closed' : '');
  }

  /* --------------------------------------------------------------- stepper + mission */
  function renderSteps() {
    const ol = $('#sd-steps'); ol.innerHTML = '';
    const open = nextOpen();
    LEVELS.forEach((lv, i) => {
      const li = document.createElement('li');
      const locked = i > open, done = S.solved.includes(i);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sd-step' + (i === S.view ? ' sd-current' : '') + (done ? ' sd-done' : '') + (locked ? ' sd-locked' : '');
      b.disabled = locked;
      b.setAttribute('aria-current', i === S.view ? 'step' : 'false');
      b.innerHTML = '<span class="sd-step-n">' + (done ? '✓' : locked ? '·' : lv.id) + '</span><span class="sd-step-t">' + esc(lv.topic) + '</span>';
      b.title = locked ? 'Solve the previous chapter first' : lv.title;
      b.addEventListener('click', () => { S.view = i; save(); renderSteps(); renderMission(); renderClue(); });
      li.appendChild(b); ol.appendChild(li);
    });
  }
  function renderMission() {
    const lv = LEVELS[S.view], used = S.hints[S.view] || 0, done = S.solved.includes(S.view);
    const m = $('#sd-mission');
    let h = '<div class="sd-mission-top"><span class="sd-topic">Chapter ' + lv.id + ' · ' + esc(lv.topic) + '</span>' + (done ? '<span class="sd-chip sd-chip-cleared">Solved</span>' : '') + '</div>' +
      '<h3>' + esc(lv.title) + '</h3><p class="sd-task">' + esc(lv.task) + '</p>' +
      '<div class="sd-ladder" role="group" aria-label="Hint ladder"><span class="sd-ladder-l">Hint ladder</span>';
    for (let k = 1; k <= 3; k++) {
      const enabled = k <= used + 1;
      h += '<button type="button" class="btn ghost small sd-hint-btn' + (k <= used ? ' sd-used' : '') + '" data-k="' + k + '"' + (enabled ? '' : ' disabled') + '>' + (k === 3 ? 'Hint 3 · full query' : k === 2 ? 'Hint 2 · skeleton' : 'Hint 1 · nudge') + '</button>';
    }
    h += '</div><div class="sd-hints" id="sd-hints">';
    for (let k = 0; k < used; k++) {
      h += '<div class="sd-hint"><b>Hint ' + (k + 1) + '.</b> ' + (k === 2 ? '<pre>' + esc(lv.hints[2]) + '</pre><button type="button" class="btn ghost small" id="sd-use3">Put it in the editor</button>' : esc(lv.hints[k])) + '</div>';
    }
    m.innerHTML = h + '</div>';
    m.querySelectorAll('.sd-hint-btn').forEach((b) => b.addEventListener('click', () => {
      const k = +b.dataset.k; if (k > (S.hints[S.view] || 0)) { S.hints[S.view] = k; save(); renderMission(); const hb = $('#sd-hints'); if (hb && hb.lastChild) hb.lastChild.scrollIntoView({ block: 'nearest' }); }
    }));
    const u = $('#sd-use3'); if (u) u.addEventListener('click', () => { $('#sd-sql').value = lv.hints[2]; $('#sd-sql').focus(); });
  }
  function renderClue() {
    const box = $('#sd-clue'); box.innerHTML = '';
    if (!S.solved.includes(S.view)) return;
    const lv = LEVELS[S.view];
    const nxt = S.view + 1 < LEVELS.length;
    box.innerHTML = '<div class="sd-clue' + (S.justSolved === S.view && !reduced() ? ' sd-pop' : '') + '"><h4>Clue ' + lv.id + ' · ' + esc(lv.clueTitle) + '</h4><p>' + esc(lv.clue) + '</p>' +
      (nxt ? '<button type="button" class="btn primary small" id="sd-next">On to chapter ' + (S.view + 2) + ': ' + esc(LEVELS[S.view + 1].topic) + '</button>' :
        '<p class="sd-final">The file is complete. Make your accusation on the case board above.</p>') + '</div>';
    const n = $('#sd-next'); if (n) n.addEventListener('click', () => { S.view++; save(); renderAll(); $('#sd-mission').scrollIntoView({ block: 'nearest' }); });
    S.justSolved = null;
  }

  /* --------------------------------------------------------------- schema + notebook */
  function renderSchema() {
    const box = $('#sd-schema'); box.innerHTML = '';
    db.describe().forEach((t) => {
      const d = document.createElement('details'); d.className = 'sd-tbl';
      const idx = t.indexes.filter((x) => !x.auto);
      d.innerHTML = '<summary><b>' + esc(t.name) + '</b> <span class="sd-rc">' + t.rowCount + ' rows</span>' + (idx.length ? ' <span class="sd-idx">indexed</span>' : '') + '</summary><ul>' +
        t.columns.map((c) => '<li><code>' + esc(c.name) + '</code> <span class="sd-ty">' + esc(c.type || '') + '</span>' + (c.pk ? ' <span class="sd-badge">PK</span>' : '') + (c.fk ? ' <span class="sd-badge sd-fk">→ ' + esc(c.fk) + '</span>' : '') + '</li>').join('') +
        '</ul>' + (idx.length ? '<p class="sd-idxl">Index: ' + idx.map((x) => esc(x.name) + ' on ' + esc(x.column)).join(', ') + '</p>' : '') +
        '<button type="button" class="btn ghost small sd-peek" data-t="' + esc(t.name) + '">Peek: first 5 rows</button>';
      box.appendChild(d);
    });
    box.querySelectorAll('.sd-peek').forEach((b) => b.addEventListener('click', () => { $('#sd-sql').value = 'SELECT * FROM ' + b.dataset.t + ' LIMIT 5;'; runQuery(); }));
  }
  function renderNotebook() {
    const ul = $('#sd-notebook'); ul.innerHTML = '';
    if (!S.notebook.length) { const li = document.createElement('li'); li.className = 'sd-none'; li.textContent = 'Empty. Every query you run is kept here.'; ul.appendChild(li); return; }
    S.notebook.slice().reverse().forEach((n) => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sd-nb sd-nb-' + n.st;
      b.innerHTML = '<span class="sd-nb-st">' + ({ ok: 'clue', err: 'error', run: 'ran' }[n.st]) + '</span><code>' + esc(n.sql.replace(/\s+/g, ' ').slice(0, 90)) + '</code>';
      b.title = 'Load this query into the editor';
      b.addEventListener('click', () => { $('#sd-sql').value = n.sql; $('#sd-sql').focus(); });
      li.appendChild(b); ul.appendChild(li);
    });
  }

  /* --------------------------------------------------------------- running a query */
  function setStatus(msg, bad) { const s = $('#sd-status'); s.textContent = msg; s.classList.toggle('sd-bad', !!bad); }
  function fmtCell(v) { return v === null ? '<span class="sd-null">NULL</span>' : esc(v); }
  function renderTable(r) {
    const MAX = 200, shown = r.rows.slice(0, MAX);
    let h = '<div class="sd-tablewrap" tabindex="0" role="region" aria-label="Query result"><table class="sd-table"><caption class="sd-cap">' + r.rows.length + ' row' + (r.rows.length === 1 ? '' : 's') + '</caption><thead><tr>' +
      r.columns.map((c) => '<th scope="col">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>';
    shown.forEach((row) => { h += '<tr>' + row.map((v) => '<td' + (typeof v === 'number' ? ' class="sd-num"' : '') + '>' + fmtCell(v) + '</td>').join('') + '</tr>'; });
    h += '</tbody></table></div>';
    if (r.rows.length > MAX) h += '<p class="sd-more">Showing the first ' + MAX + ' of ' + r.rows.length + ' rows. Add a WHERE condition.</p>';
    return h;
  }
  function renderPlan(r, key) {
    const box = $('#sd-plan'); const st = r.stats || {};
    const steps = (r.plan || []).filter((p) => p.kind === 'scan' || p.kind === 'search');
    if (!steps.length) { box.hidden = true; return; }
    const full = Math.max(st.fullScanWork || 0, st.rowsRead || 0, 1), pct = Math.max(1.5, Math.round(100 * (st.rowsRead || 0) / full));
    const usedIndex = steps.some((p) => p.kind === 'search');
    let note = '';
    if (key in lastRead && lastRead[key] !== st.rowsRead) note = '<p class="sd-delta">This exact query read <b>' + lastRead[key] + '</b> rows last time and <b>' + st.rowsRead + '</b> now' + (st.rowsRead < lastRead[key] ? ': the index made it ' + Math.round(lastRead[key] / Math.max(1, st.rowsRead)) + ' times cheaper.' : '.') + '</p>';
    lastRead[key] = st.rowsRead;
    box.hidden = false;
    box.innerHTML = '<h4>Query plan <span class="sd-sub">a simulation of how a real engine works</span></h4><div class="sd-meter-row"><span class="sf-c-S"><i></i>Rows read: <b>' + st.rowsRead + '</b></span><span class="sf-c-I"><i></i>Index steps: <b>' + (st.indexSteps || 0) + '</b></span><span class="sf-c-R"><i></i>Rows returned: <b>' + (st.rowsReturned === null ? 0 : st.rowsReturned) + '</b></span></div>' +
      '<div class="sd-bar" role="img" aria-label="' + st.rowsRead + ' of ' + full + ' rows read"><div class="sd-bar-fill' + (usedIndex && st.rowsRead < full / 4 ? ' sd-fast' : '') + '" style="width:' + pct + '%"></div></div>' + note +
      '<ul class="sd-steps-list">' + steps.map((p) => '<li class="' + (p.kind === 'search' ? 'sf-c-I' : 'sf-c-S') + '">' + (p.kind === 'search' ? '<b class="sd-good">Index search</b> on <code>' + esc(p.table) + '</code> using <code>' + esc(p.index) + '</code> (' + esc(p.cond) + '): read ' + p.rowsRead + ' of ' + p.tableRows + ' rows'
        : '<b class="sd-warn">Full scan</b> of <code>' + esc(p.table) + '</code>: read ' + p.rowsRead + ' rows' + (p.loops > 1 ? ' over ' + p.loops + ' passes' : ' (the whole table is ' + p.tableRows + ')')) + '</li>').join('') + '</ul>';
  }
  function runQuery() {
    const ta = $('#sd-sql'), sql = ta.value;
    S.draft = sql; S.runs++;
    const out = flow && db.trace ? db.trace(sql) : db.run(sql);
    if (flow && out.events) flow.play(out);
    const box = $('#sd-result'); box.innerHTML = '';
    let state = 'run';
    const msgs = [];
    let lastSel = null;
    out.results.forEach((r) => { if (r.kind === 'select' || r.kind === 'explain') lastSel = r; else if (r.message) msgs.push(r.message); });
    msgs.forEach((m) => { const p = document.createElement('p'); p.className = 'sd-msg'; p.textContent = m; box.appendChild(p); });
    if (lastSel) { const w = document.createElement('div'); w.innerHTML = renderTable(lastSel); box.appendChild(w); renderPlan(lastSel, sql.replace(/\s+/g, ' ').trim().replace(/;$/, '').toLowerCase()); } else $('#sd-plan').hidden = true;
    if (out.error) {
      state = 'err';
      const e = document.createElement('div'); e.className = 'sd-err';
      e.innerHTML = '<strong>The database says no.</strong> ' + esc(out.error.message) + (out.error.of > 1 ? ' <span class="sd-sub">(statement ' + out.error.statement + ' of ' + out.error.of + ')</span>' : '');
      box.appendChild(e);
      setStatus('Error. Read the message: it names what is wrong and often suggests the fix.', true);
    } else {
      setStatus(lastSel ? lastSel.rows.length + ' row' + (lastSel.rows.length === 1 ? '' : 's') + ' returned, ' + lastSel.stats.rowsRead + ' rows read.' : (msgs[0] || 'Done.'));
    }
    /* clue check: only for the chapter currently open and unsolved */
    if (!out.error && lastSel && S.view === nextOpen()) {
      const c = checkLevel(S.view, lastSel);
      if (c.pass) {
        state = 'ok'; S.solved.push(S.view); S.justSolved = S.view;
        setStatus('Clue found: ' + LEVELS[S.view].clueTitle + '. Chapter ' + (S.view + 1) + (S.view + 1 < LEVELS.length ? ' is unlocked.' : ' completes the file.'));
        const note = document.createElement('p'); note.className = 'sd-success'; note.textContent = 'Clue found: ' + LEVELS[S.view].clueTitle; box.insertBefore(note, box.firstChild);
        S.notebook.push({ sql, st: state }); if (S.notebook.length > 40) S.notebook.shift();
        save(); renderBoard(); renderSteps(); renderMission(); renderClue(); renderSchema(); renderNotebook();
        return;
      } else if (c.reason) {
        const hint = document.createElement('p'); hint.className = 'sd-near'; hint.textContent = c.reason; box.appendChild(hint);
      }
    }
    S.notebook.push({ sql, st: state }); if (S.notebook.length > 40) S.notebook.shift();
    save(); renderSchema(); renderNotebook();
  }

  /* --------------------------------------------------------------- accusation */
  function accuse(ev) {
    ev.preventDefault();
    const who = $('#sd-who').value, msg = $('#sd-accuse-msg');
    if (!who) { msg.textContent = 'Choose a name first.'; msg.className = 'sd-accuse-msg'; return; }
    if (hashName(who) === CULPRIT_HASH) {
      S.closed = true; save(); renderBoard(); renderClosed(); msg.className = 'sd-accuse-msg sd-goodmsg'; msg.textContent = 'Correct. Case closed.';
      return;
    }
    S.wrong++; save();
    const c = CAST.find((x) => x.name === who); const st = statusOf(c.id);
    msg.className = 'sd-accuse-msg sd-badmsg';
    msg.textContent = who + ' did not do it. ' + (st.cls === 'cleared' ? 'The evidence on the board clears them: ' + st.why : 'Your file does not yet prove it either way: keep querying.') + ' (' + S.wrong + ' wrong ' + (S.wrong === 1 ? 'accusation' : 'accusations') + ' so far)';
  }
  function rank() {
    const hints = Object.keys(S.hints).reduce((a, k) => a + S.hints[k], 0);
    const pen = hints + 3 * S.wrong;
    return { hints, title: pen === 0 ? 'Chief Inspector' : pen <= 4 ? 'Inspector' : pen <= 9 ? 'Detective' : 'Junior Sleuth' };
  }
  function renderClosed() {
    const box = $('#sd-closed'); $('.sd-board').classList.toggle('sd-isclosed', !!S.closed);
    if (!S.closed) { box.hidden = true; return; }
    const r = rank(), done = S.solved.length;
    box.hidden = false;
    box.innerHTML = '<h3>Case closed: Cassian Dray</h3><p>Confronted with the broken alibi, Cassian led the police to the Drone Hangar, where the Golden Gear sat wrapped in foam padding. He had swapped it for an empty gift box under the display cloth, hoping nobody would look until Monday. Pell, who had signed the hackathon sheet for him, was embarrassed but is not charged.</p>' +
      '<p><b>Your rank: ' + r.title + '.</b> ' + done + ' of ' + LEVELS.length + ' clues, ' + r.hints + ' hint' + (r.hints === 1 ? '' : 's') + ' used, ' + S.wrong + ' wrong accusation' + (S.wrong === 1 ? '' : 's') + ', ' + S.runs + ' queries run.' +
      (done < LEVELS.length ? ' You solved it before reading the whole file: chapter ' + (nextOpen() + 1) + ' (' + esc(LEVELS[nextOpen()].topic) + ') still has a clue waiting.' : '') + '</p>' +
      '<p class="sd-sub">One fact, four filters: arrived after the last sighting, belongs to the club that lost, bought the packing material, and faked the alibi. Each filter alone leaves several people; only the combination (JOIN, GROUP BY and sub-queries working together) leaves exactly one.</p>';
    if (!reduced()) box.classList.add('sd-pop');
  }

  /* --------------------------------------------------------------- reset */
  function startReset() {
    const w = $('#sd-resetwrap');
    w.innerHTML = '<span class="sd-confirm">Erase progress and start over? <button type="button" class="btn primary small" id="sd-yes">Yes, reset</button> <button type="button" class="btn ghost small" id="sd-no">Keep going</button></span>';
    $('#sd-no').addEventListener('click', () => { w.innerHTML = '<button type="button" class="btn ghost small" id="sd-reset">New investigation</button>'; $('#sd-reset').addEventListener('click', startReset); $('#sd-reset').focus(); });
    $('#sd-yes').addEventListener('click', () => { const big = S.big; S = fresh(); S.big = big; save(); Object.keys(lastRead).forEach((k) => delete lastRead[k]); start(true); });
    $('#sd-yes').focus();
  }

  function renderAll() { renderBoard(); renderSteps(); renderMission(); renderClue(); renderSchema(); renderNotebook(); renderClosed(); }
  function applyBig() { mount.classList.toggle('sd-big', !!S.big); const b = $('#sd-big'); if (b) b.setAttribute('aria-pressed', S.big ? 'true' : 'false'); }

  /* The saved clues are restored by re-checking nothing: progress is a list of solved chapters.
     The database itself is rebuilt on every load, so an index you made last time must be made again. */
  function start(isReset) {
    db = openDatabase();
    if (!isReset) S = load();
    if (S.view > nextOpen()) S.view = nextOpen();
    if (S.view >= LEVELS.length) S.view = LEVELS.length - 1;
    skeleton(); applyBig(); renderAll();
    flow = (typeof root !== 'undefined' && root && root.SqlFlow && $('#sd-flow')) ? root.SqlFlow.create($('#sd-flow'), { speedKey: 'co1005-sql-speed' }) : null;
    $('#sd-sql').value = S.draft || (isReset ? '' : '');
    $('#sd-run').addEventListener('click', runQuery);
    $('#sd-clear').addEventListener('click', () => { $('#sd-sql').value = ''; $('#sd-sql').focus(); });
    $('#sd-sql').addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } });
    $('#sd-sql').addEventListener('input', () => { S.draft = $('#sd-sql').value; });
    $('#sd-accuse').addEventListener('submit', accuse);
    mount.querySelectorAll('.sd-tab').forEach((b) => b.addEventListener('click', () => {      /* the tool tabs only show in the compact full-screen layout (assets/fs-sql.css) */
      $('.sd-aside').dataset.tab = b.dataset.tab;
      mount.querySelectorAll('.sd-tab').forEach((o) => o.setAttribute('aria-pressed', o === b ? 'true' : 'false'));
    }));
    $('#sd-reset').addEventListener('click', startReset);
    $('#sd-big').addEventListener('click', () => { S.big = !S.big; save(); applyBig(); });
    setStatus(isReset ? 'New investigation. The case file is closed again; no clue is shown.' : (S.solved.length ? 'Welcome back: ' + S.solved.length + ' clue(s) restored. Indexes you created earlier must be created again.' : 'Start with the incident file: SELECT * FROM incident;'));
  }
  start(false);
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
