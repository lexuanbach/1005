/* Chapter 9 §9.9 IoT apps: "Collect → Connect → Learn → Do" (iot-pipeline) and "Connect layer: pick the radio" (iot-connect).
   Examples come from the course slides: lecture deck 2 (slides 30–43) and textbook slides 33–50 — Timothy Chou's four layers, the Connect-layer
   coverage chart (slide 31), smart agriculture (39), air-quality monitoring (41), smart street lights (42), Libelium smart-world (43, smart parking).
   Logic is in pure functions (NetApps.engines.IotPipeline / IotConnect) so Node can test it; the UI below runs only in a browser.
   Everything is a simulation: every number, rule and radio figure is illustrative ("typical, varies by version and environment"). */
(function () {
  'use strict';
  var NA = (typeof window !== 'undefined' && window.NetApps) || require('./net-apps-core.js');

  /* =====================================================================================================
     helpers
     ===================================================================================================== */
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function r1(x) { return Math.round(x * 10) / 10; }
  function r2(x) { return Math.round(x * 100) / 100; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clock(h) { return pad2(h) + ':00'; }
  function copy(o) { var c = {}; Object.keys(o).forEach(function (k) { c[k] = o[k]; }); return c; }
  /* the message a node would really send: compact JSON (ASCII only, so characters = bytes) */
  function msg(o) { var t = JSON.stringify(o); return { text: t, bytes: t.length }; }
  /* illustrative energy for one radio message (joules), and a battery of two AA cells (≈ 27 kJ) with 5 J/day of sleep drain */
  var RADIO = { lorawan: { name: 'LoRaWAN', J: 0.15 }, zigbee: { name: 'Zigbee', J: 0.02 }, cell: { name: '4G / NB-IoT', J: 1.0 }, plc: { name: 'power line (PLC)', J: 0.01 } };
  var BATTERY_J = 27000, SLEEP_J_DAY = 5;
  function batteryYears(radio, msgsPerDay) {
    var e = RADIO[radio].J, perDay = SLEEP_J_DAY + msgsPerDay * e;
    return BATTERY_J / perDay / 365;
  }

  /* =====================================================================================================
     Scenario 1 — smart agriculture (lecture slide 39: temperature and humidity, pH, EC, light intensity, pump controllers)
     ===================================================================================================== */
  var SOILS = {
    sand: { label: 'sandy soil', history: [26, 28, 30, 27, 29] },     // wettest reading after each of the last 5 irrigations / rains (%)
    loam: { label: 'loamy soil', history: [40, 42, 44, 41, 43] },
    clay: { label: 'clay soil', history: [50, 52, 55, 51, 53] }
  };
  /* "learning": the platform looks at how wet this soil gets at best and sets the dry limit to 60 % of that */
  function learnThreshold(history) { return Math.round(0.6 * Math.max.apply(null, history)); }
  var PUMP_LITRES_PER_HOUR = 500, PUMP_GAIN = 5, PUMP_HYST = 8;

  function farmInit(soilType) {
    var h = SOILS[soilType].history, thr = learnThreshold(h);
    return { soilType: soilType, threshold: thr, pumpOn: false, cachedRain: false, soil: thr + 8, msgs: 0, bytes: 0, queued: 0, alerts: 0, water: 0, energyJ: 0, hours: 0, offlineHours: 0 };
  }
  function farmDry(r) { return Math.max(0.3, 0.5 + 0.06 * (r.temp - 20)) + (r.light > 30 ? 0.4 : 0); }
  function farmStep(state, r, linkUp) {
    var s = copy(state), soilName = SOILS[s.soilType].label, thr = s.threshold, hour = s.hours;
    var rain = linkUp ? !!r.rain : s.cachedRain;           // the forecast comes from the cloud; offline the gateway keeps the last one it heard
    if (linkUp) s.cachedRain = !!r.rain;
    var pump, why;
    if (rain) { pump = false; why = 'rain is forecast, so watering would be wasted'; }
    else if (s.pumpOn) { pump = r.soil < thr + PUMP_HYST; why = pump ? 'still below ' + (thr + PUMP_HYST) + ' % (the stop level), keep watering' : 'soil reached ' + (thr + PUMP_HYST) + ' %, stop'; }
    else { pump = r.soil < thr; why = pump ? 'soil ' + r.soil + ' % is below the dry limit ' + thr + ' %' : 'soil ' + r.soil + ' % is above the dry limit ' + thr + ' %'; }
    s.pumpOn = pump;
    var litres = pump ? PUMP_LITRES_PER_HOUR : 0;
    var next = r1(clamp(r.soil + (pump ? PUMP_GAIN : 0) - farmDry(r), 0, 60));
    var alerts = [];
    if (r.ph < 5.5 || r.ph > 7.5) alerts.push('pH ' + r.ph + ' is outside 5.5–7.5');
    if (r.ec > 3) alerts.push('EC ' + r.ec + ' dS/m is high (salty soil)');
    var m = msg({ n: 'farm1', h: hour, T: r.temp, H: r.hum, S: r.soil, pH: r.ph, EC: r.ec, L: r.light });
    var flushed = 0;
    if (linkUp) { flushed = s.queued; s.queued = 0; } else { s.queued += 1; s.offlineHours += 1; }
    s.msgs += 1; s.bytes += m.bytes * (1 + flushed); s.energyJ += RADIO.lorawan.J;
    s.water += litres; s.alerts += alerts.length; s.soil = next; s.hours += 1;
    var verdict = rain ? 'Pump OFF — rain forecast' : pump ? 'Pump ON' : 'Pump OFF';
    var say = clock(hour) + ' — ' + (linkUp ? '' : '(cloud link down) ') + why + ' → ' + verdict.toLowerCase() + (litres ? ' (' + litres + ' L this hour)' : '') + '. Soil will be ' + next + ' % next hour.';
    return {
      state: s,
      rec: {
        say: say,
        collect: [
          { k: 'Air temperature', v: r.temp, u: '°C' }, { k: 'Air humidity', v: r.hum, u: '%' }, { k: 'Soil moisture', v: r.soil, u: '%' },
          { k: 'pH', v: r.ph, u: '' }, { k: 'EC (conductivity)', v: r.ec, u: 'dS/m' }, { k: 'Light', v: r.light, u: 'klux' }
        ],
        connect: { payload: m.text, bytes: m.bytes, radio: RADIO.lorawan.name, hop: 'sensor → gateway by LoRaWAN, gateway → cloud over the Internet', delivered: linkUp, queued: s.queued, flushed: flushed, uplink: 'Internet (gateway → cloud)' },
        learn: {
          head: 'Dry limit learned for ' + soilName + ': ' + thr + ' %',
          lines: ['Learned from history: 60 % × the wettest reading seen on this soil (' + Math.max.apply(null, SOILS[s.soilType].history) + ' %).',
            'Rule: pump ON below ' + thr + ' %, OFF again at ' + (thr + PUMP_HYST) + ' %, never while rain is forecast.',
            'Rain forecast used: ' + (rain ? 'yes' : 'no') + (linkUp ? ' (fresh from the cloud).' : ' (last one heard — the cloud is unreachable).')],
          verdict: verdict,
          note: linkUp ? '' : 'The gateway keeps the last learned limit and forecast, so the pump still follows the rule — but nothing new is learned and no alert reaches the farmer.'
        },
        doo: { pump: pump, litres: litres, nextSoil: next, alerts: alerts, local: true,
          lines: [pump ? 'Pump controller switches the pump ON: +' + PUMP_GAIN + ' % soil moisture per hour, ' + litres + ' L.' : 'Pump controller keeps the pump OFF.',
            alerts.length ? (linkUp ? 'Alert sent to the farmer: ' : 'Alert raised but stuck at the gateway: ') + alerts.join('; ') + '.' : 'No alert: pH and EC are in range.'] }
      }
    };
  }
  function farmModel(h, s) {
    var temp = r1(21 + 7 * Math.sin((h - 9) * Math.PI / 12));
    return { day: { temp: temp, hum: Math.round(clamp(85 - 2.2 * (temp - 14), 20, 100)), light: Math.max(0, Math.round(90 * Math.sin((h - 6) * Math.PI / 12))) }, carry: { soil: s.soil } };
  }

  /* =====================================================================================================
     Scenario 2 — air-quality station (lecture slide 41: PM2.5, PM10, CO2, CO)
     ===================================================================================================== */
  var WHO_PM25_24H = 15;   // µg/m³, WHO 2021 air-quality guideline (24-hour mean)
  /* SIMPLIFIED bands for teaching (not an official AQI) */
  var BANDS = [
    { id: 0, max: WHO_PM25_24H, label: 'Within the WHO guideline', css: 'good', advice: 'Fine for everyone.' },
    { id: 1, max: 35, label: 'Moderate', css: 'ok', advice: 'Sensitive people may notice it.' },
    { id: 2, max: 55, label: 'Unhealthy for sensitive groups', css: 'warn', advice: 'Children, the elderly and people with asthma should limit time outside.' },
    { id: 3, max: 150, label: 'Unhealthy', css: 'bad', advice: 'Everyone should reduce outdoor effort.' },
    { id: 4, max: Infinity, label: 'Very unhealthy', css: 'worse', advice: 'Stay indoors, close windows.' }
  ];
  function airBand(pm25) { for (var i = 0; i < BANDS.length; i++) if (pm25 <= BANDS[i].max) return BANDS[i]; return BANDS[BANDS.length - 1]; }
  function airInit() { return { recent: [], msgs: 0, bytes: 0, queued: 0, alerts: 0, undelivered: 0, energyJ: 0, hours: 0, worst: 0 }; }
  function airStep(state, r, linkUp) {
    var s = copy(state); s.recent = state.recent.slice(); var hour = s.hours;
    var b = airBand(r.pm25), fault = r.pm25 > r.pm10;
    var base = (linkUp && s.recent.length >= 3) ? s.recent.slice(-6).reduce(function (a, x) { return a + x; }, 0) / Math.min(6, s.recent.length) : null;
    var spike = base != null && r.pm25 > 1.8 * base && r.pm25 > 25;
    var list = [];
    if (fault) list.push('sensor fault: PM2.5 cannot be higher than PM10 (PM2.5 is part of PM10)');
    else if (b.id >= 2) list.push('PM2.5 ' + r.pm25 + ' µg/m³ — ' + b.label.toLowerCase());
    if (spike) list.push('sudden spike: ' + r.pm25 + ' is ' + r1(r.pm25 / base) + '× the recent average ' + r1(base));
    if (r.co > 9) list.push('CO ' + r.co + ' ppm is above about 9 ppm');
    if (r.co2 > 1000) list.push('CO₂ ' + r.co2 + ' ppm: stuffy air, ventilate');
    var m = msg({ id: 'air7', pm25: r.pm25, pm10: r.pm10, co2: r.co2, co: r.co });
    var flushed = 0;
    if (linkUp) { flushed = s.queued; s.queued = 0; s.recent.push(r.pm25); if (s.recent.length > 6) s.recent.shift(); } else s.queued += 1;
    s.msgs += 1; s.bytes += m.bytes * (1 + flushed); s.energyJ += RADIO.cell.J;
    s.alerts += list.length; if (!linkUp) s.undelivered += list.length; s.worst = Math.max(s.worst, b.id); s.hours += 1;
    var say = clock(hour) + ' — PM2.5 ' + r.pm25 + ' µg/m³ → "' + b.label + '"' + (list.length ? '; ' + list.length + ' alert' + (list.length > 1 ? 's' : '') + (linkUp ? ' sent to the city dashboard' : ' raised but stuck: the cloud link is down') : '; no alert') + '.';
    return {
      state: s,
      rec: {
        say: say, band: b,
        collect: [{ k: 'PM2.5', v: r.pm25, u: 'µg/m³' }, { k: 'PM10', v: r.pm10, u: 'µg/m³' }, { k: 'CO₂', v: r.co2, u: 'ppm' }, { k: 'CO', v: r.co, u: 'ppm' }],
        connect: { payload: m.text, bytes: m.bytes, radio: 'Wi-Fi or 4G', hop: 'node → Wi-Fi / 4G → cloud platform', delivered: linkUp, queued: s.queued, flushed: flushed, uplink: 'Wi-Fi / 4G (node → cloud)' },
        learn: {
          head: 'Band for PM2.5: ' + b.label,
          lines: ['Simplified bands (not an official AQI): ≤ ' + WHO_PM25_24H + ' within the WHO 2021 24-hour guideline of ' + WHO_PM25_24H + ' µg/m³, then 35, 55, 150.',
            base == null ? (linkUp ? 'Baseline: still collecting (needs 3 readings on the platform).' : 'Baseline lives on the platform: spike detection is paused while the link is down.') : 'Learned baseline (average of the last ' + Math.min(6, s.recent.length - (linkUp ? 1 : 0)) + ' readings): ' + r1(base) + ' µg/m³' + (spike ? ' — this reading is a spike.' : '.'),
            'Sanity check: PM2.5 ≤ PM10 ' + (fault ? '✗ fails — the sensor is faulty.' : '✓.')],
          verdict: b.label,
          note: linkUp ? '' : 'The band is computed on the node itself, so the display still works; the learned baseline needs the platform.'
        },
        doo: { band: b, alerts: list, local: true,
          lines: ['Roadside display turns "' + b.css.toUpperCase() + '": ' + b.advice, list.length ? (linkUp ? 'Alert to the city dashboard: ' : 'Alert queued on the node: ') + list.join('; ') + '.' : 'No alert needed.'] }
      }
    };
  }
  var AIR_PM25 = [14, 12, 11, 11, 12, 15, 22, 38, 52, 40, 30, 26, 24, 24, 26, 32, 48, 60, 44, 30, 24, 20, 17, 15];
  var AIR_CO2 = [420, 415, 410, 410, 415, 430, 470, 560, 620, 560, 520, 500, 500, 500, 520, 560, 620, 660, 580, 520, 480, 450, 440, 430];
  var AIR_CO = [0.4, 0.3, 0.3, 0.3, 0.3, 0.5, 1.2, 2.5, 3.1, 2.0, 1.2, 1.0, 0.9, 0.9, 1.1, 1.6, 2.8, 3.4, 2.2, 1.2, 0.8, 0.6, 0.5, 0.4];
  function airModel(h) { var p = AIR_PM25[h % 24]; return { day: { pm25: p, pm10: Math.round(1.6 * p + 8), co2: AIR_CO2[h % 24], co: AIR_CO[h % 24] }, carry: {} }; }

  /* =====================================================================================================
     Scenario 3 — smart street lights (lecture slide 42 / textbook slide 48: lights → PLC → generic IoT platform → Internet → management + monitoring)
     ===================================================================================================== */
  var STREET_EXPECTED = [1, 0, 0, 0, 0, 1, 4, 14, 28, 20, 12, 10, 11, 10, 12, 16, 26, 30, 22, 12, 8, 5, 3, 2];   // typical cars per minute, learned from past weeks
  var STREET_LUX = function (h) { return (h < 5 || h >= 20) ? 3 : (h === 5 || h === 19) ? 25 : (h === 6 || h === 18) ? 80 : 400; };
  var LAMPS = 40, LAMP_KW = 0.1;        // 40 lamps on the line at 100 W each (illustrative; real drivers are not perfectly linear)
  function trafficLevel(cars) { return cars <= 0 ? 0 : cars <= 5 ? 50 : cars <= 15 ? 70 : cars <= 30 ? 85 : 100; }
  /* the dim level in % of full brightness */
  function streetDim(cars, lux, hour, linkUp) {
    if (lux >= 50) return 0;                                              // daylight: lamps off (a photocell on the pole decides, no network needed)
    if (linkUp === false) return (hour >= 19 && hour < 23) ? 100 : 50;    // fallback timetable stored in the controller
    var floor = STREET_EXPECTED[hour % 24] < 3 ? 30 : 50;                 // the learned quiet-hours pattern sets the minimum
    return Math.max(floor, trafficLevel(cars));
  }
  function streetInit() { return { msgs: 0, bytes: 0, queued: 0, kwh: 0, kwhAlways: 0, alerts: 0, energyJ: 0, hours: 0 }; }
  function streetStep(state, r, linkUp) {
    var s = copy(state), hour = s.hours;
    var level = streetDim(r.cars, r.lux, hour, linkUp), dark = r.lux < 50;
    var kwh = LAMPS * LAMP_KW * level / 100, always = dark ? LAMPS * LAMP_KW : 0;
    var m = msg({ id: 'line1', cars: r.cars, lux: r.lux, lvl: level });
    var flushed = 0; if (linkUp) { flushed = s.queued; s.queued = 0; } else s.queued += 1;
    s.msgs += 1; s.bytes += m.bytes * (1 + flushed); s.kwh += kwh; s.kwhAlways += always; s.energyJ += RADIO.plc.J; s.hours += 1;
    var quiet = STREET_EXPECTED[hour % 24] < 3;
    var say = clock(hour) + ' — ' + (dark ? r.cars + ' cars/min in the dark → lamps at ' + level + ' %' : 'daylight (' + r.lux + ' lux) → lamps OFF') + (linkUp ? '' : ' (cloud link down: the controller follows its fixed timetable)') + '. Energy this hour ' + r2(kwh) + ' kWh instead of ' + r2(always) + ' kWh.';
    return {
      state: s,
      rec: {
        say: say, level: level,
        collect: [{ k: 'Cars passing', v: r.cars, u: 'per minute' }, { k: 'Ambient light', v: r.lux, u: 'lux' }, { k: 'Lamps on the line', v: LAMPS, u: '' }],
        connect: { payload: m.text, bytes: m.bytes, radio: 'power line (PLC) → Wi-Fi / 3G / 4G / 5G', hop: 'lamps → controller over the power line, controller → IoT platform over the Internet', delivered: linkUp, queued: s.queued, flushed: flushed, uplink: 'Wi-Fi / 3G / 4G / 5G (controller → platform)' },
        learn: {
          head: dark ? (quiet ? 'Quiet hour: the learned minimum is 30 %' : 'Busy hour: the learned minimum is 50 %') : 'Daylight: nothing to learn, lamps stay off',
          lines: ['Learned from past weeks: about ' + STREET_EXPECTED[hour % 24] + ' cars/min are normal at ' + clock(hour) + (quiet ? ' (a quiet hour).' : '.'),
            'Rule: level = the larger of the learned minimum and the traffic level (≤ 5 cars/min → 50 %, ≤ 15 → 70 %, ≤ 30 → 85 %, more → 100 %).',
            linkUp ? 'Platform decision: ' + level + ' %.' : 'Controller fallback: 100 % from 19:00–23:00, otherwise 50 % — it still dims, but cannot react to the traffic.'],
          verdict: level === 0 ? 'Lamps OFF' : 'Dim to ' + level + ' %',
          note: linkUp ? '' : 'The photocell and the timetable live in the controller, so the lamps never go dark when the Internet fails.'
        },
        doo: { level: level, kwh: kwh, always: always, local: true,
          lines: ['Lamps set to ' + level + ' % → ' + r2(kwh) + ' kWh this hour (always-on at 100 % in the dark would be ' + r2(always) + ' kWh).', 'The management and monitoring systems see the same numbers' + (linkUp ? '.' : ' once the link comes back.')] }
      }
    };
  }
  function streetModel(h) { return { day: { cars: STREET_EXPECTED[h % 24], lux: STREET_LUX(h % 24) }, carry: {} }; }

  /* =====================================================================================================
     Scenario 4 — smart parking (slide 43, Libelium smart-world picture: "Smart Parking")
     ===================================================================================================== */
  var CAP = 40;
  var PARK_PROFILE = [2, 1, 1, 1, 1, 2, 4, 10, 24, 34, 38, 36, 34, 36, 38, 37, 33, 26, 16, 10, 7, 5, 3, 2];
  function parkDelta(h) { return PARK_PROFILE[(h + 1) % 24] - PARK_PROFILE[h % 24]; }
  /* hours until the lot is full if the usual daily pattern repeats (0 = already full, null = not within 12 h) */
  function predictFull(occ, hour, cap) {
    var o = occ;
    if (o >= cap) return 0;                       // already full
    for (var k = 1; k <= 12; k++) { o += parkDelta(hour + k - 1); if (o >= cap) return k; }
    return null;
  }
  function parkInit() { return { occ: 2, msgs: 0, bytes: 0, queued: 0, alerts: 0, energyJ: 0, hours: 0, events: 0 }; }
  function parkStep(state, r, linkUp) {
    var s = copy(state), hour = s.hours, occ = clamp(Math.round(r.occ), 0, CAP);
    var changed = Math.abs(occ - state.occ), up = occ > state.occ, evs = [], bytes = 0, i;
    for (i = 0; i < changed; i++) {
      var bay = up ? state.occ + i + 1 : state.occ - i;
      var e = msg({ b: bay, o: up ? 1 : 0 }); evs.push(e); bytes += e.bytes;
    }
    var flushed = 0; if (linkUp) { flushed = s.queued; s.queued = 0; } else s.queued += changed;
    s.msgs += changed; s.events += changed; s.bytes += bytes + flushed * 15; s.energyJ += changed * RADIO.zigbee.J; s.occ = occ; s.hours += 1;
    var free = CAP - occ, k = linkUp ? predictFull(occ, hour, CAP) : null, full = free <= 0;
    var sign = full ? 'FULL' : free + ' FREE' + (k != null && k <= 2 ? ' — filling fast' : '');
    var payload = changed === 0 ? '(nothing: a bay sensor only speaks when a car arrives or leaves)' : evs[0].text + (changed > 1 ? '  … and ' + (changed - 1) + ' more' : '');
    var say = clock(hour) + ' — ' + occ + ' of ' + CAP + ' bays taken (' + (changed === 0 ? 'no change, no message' : changed + ' bay event' + (changed > 1 ? 's' : '')) + '). Sign shows "' + sign + '".' + (linkUp ? (!full && k != null ? ' Platform expects the lot to fill in about ' + k + ' h.' : '') : ' Cloud link down: the sign still works.');
    return {
      state: s,
      rec: {
        say: say, sign: sign,
        collect: [{ k: 'Occupied bays', v: occ, u: 'of ' + CAP }, { k: 'Bays that changed', v: changed, u: 'since last hour' }, { k: 'Free bays', v: free, u: '' }],
        connect: { payload: payload, bytes: bytes, radio: RADIO.zigbee.name + ' → gateway → 4G', hop: 'bay sensors → gateway by Zigbee, gateway → cloud by 4G', delivered: linkUp, queued: s.queued, flushed: flushed, uplink: '4G (gateway → cloud)' },
        learn: {
          head: linkUp ? (full ? 'The lot is full right now' : k != null ? 'Prediction: the lot fills in about ' + k + ' h' : 'Prediction: no sign of the lot filling in the next 12 h') : 'No prediction: it needs the history stored on the platform',
          lines: ['Learned from past weeks: arrivals and departures per hour follow a daily pattern (peak around 10:00 and 14:00).',
            linkUp ? 'Platform adds the usual change hour by hour to today\'s count until it reaches ' + CAP + '.' : 'Cloud unreachable: nothing new is learned and the app cannot be updated.',
            'Counting free bays is simple arithmetic: ' + CAP + ' − ' + occ + ' = ' + free + ' — done locally at the gateway.'],
          verdict: sign,
          note: linkUp ? '' : 'The gateway counts the bays itself, so the street sign stays correct; only the prediction and the driver app wait for the link.'
        },
        doo: { sign: sign, free: free, local: true,
          lines: ['Street sign shows: "' + sign + '".', linkUp ? 'The driver app is updated: ' + free + ' bays free.' : 'The driver app shows old data until the link is back.'] }
      }
    };
  }
  function parkModel(h) { return { day: { occ: PARK_PROFILE[h % 24] }, carry: {} }; }

  var IotPipeline = {
    SOILS: SOILS, learnThreshold: learnThreshold, batteryYears: batteryYears, RADIO: RADIO, WHO_PM25_24H: WHO_PM25_24H, CAP: CAP, LAMPS: LAMPS,
    Farm: { init: farmInit, step: farmStep, model: farmModel, dry: farmDry },
    Air: { init: airInit, step: airStep, band: airBand, model: airModel, BANDS: BANDS },
    Street: { init: streetInit, step: streetStep, dim: streetDim, model: streetModel, EXPECTED: STREET_EXPECTED },
    Parking: { init: parkInit, step: parkStep, predictFull: predictFull, model: parkModel, PROFILE: PARK_PROFILE }
  };

  /* =====================================================================================================
     iot-connect engine — which radio (or cable) fits? Orders of magnitude, "typical, varies by version and environment".
     range / rate are [typical low, typical high]; the high end is what the technology can do at its best.
     ===================================================================================================== */
  var TECHS = [
    { id: 'nfc', label: 'NFC / RFID', short: 'NFC', wired: false, range: [0.01, 0.1], rate: [1e5, 4.24e5], battery: 20, power: 1, cost: 0.2, c: 9, used: 'tap-to-pay, tags (slide 31: near communications)', rangeTxt: '≈ 4 cm', rateTxt: '≈ 100–424 kbit/s' },
    { id: 'ble', label: 'Bluetooth LE', short: 'BLE', wired: false, range: [1, 100], rate: [1e5, 2e6], battery: 5, power: 1, cost: 0.5, c: 1, used: 'wristbands, earbuds (slide 31: PAN)', rangeTxt: '≈ 10–100 m', rateTxt: '≈ 1–2 Mbit/s' },
    { id: 'zigbee', label: 'Zigbee (mesh)', short: 'Zigbee', wired: false, range: [10, 100], rate: [2e4, 2.5e5], battery: 3, power: 2, cost: 1, c: 6, used: 'smart-home and factory sensors (slide 31: PAN)', rangeTxt: '≈ 10–100 m per hop', rateTxt: '≈ 250 kbit/s' },
    { id: 'wifi', label: 'Wi-Fi', short: 'Wi-Fi', wired: false, range: [10, 100], rate: [1e6, 1e9], battery: 0.3, power: 4, cost: 0.5, c: 8, used: 'cameras, laptops, gateways (slide 31: home / building area)', rangeTxt: '≈ 30–100 m', rateTxt: '≈ 50 Mbit/s – 1+ Gbit/s' },
    { id: 'lora', label: 'LoRaWAN', short: 'LoRaWAN', wired: false, range: [2000, 15000], rate: [3e2, 5e4], battery: 8, power: 2, cost: 1.5, c: 2, used: 'field sensors, smart agriculture (slide 39)', rangeTxt: '≈ 2–15 km', rateTxt: '≈ 0.3–50 kbit/s' },
    { id: 'nbiot', label: 'NB-IoT / LTE-M', short: 'NB-IoT', wired: false, range: [1000, 10000], rate: [2e4, 1e6], battery: 8, power: 3, cost: 2, c: 3, used: 'meters, trackers over the phone network', rangeTxt: '≈ km (a cell)', rateTxt: '≈ 20 kbit/s – 1 Mbit/s' },
    { id: 'lte', label: '4G / LTE', short: '4G', wired: false, range: [1000, 15000], rate: [1e7, 2e8], battery: 0.05, power: 4, cost: 2, c: 4, used: 'gateway uplink (slide 42: Wi-Fi / 3G / 4G / 5G)', rangeTxt: '≈ km (a cell)', rateTxt: '≈ 10–200 Mbit/s' },
    { id: 'g5', label: '5G', short: '5G', wired: false, range: [200, 5000], rate: [3e8, 2e9], battery: 0.05, power: 5, cost: 2.5, c: 7, used: 'high rate or low delay (slide 42)', rangeTxt: '≈ 0.2–5 km', rateTxt: '≈ 0.3–2 Gbit/s' },
    { id: 'sat', label: 'Satellite (geostationary)', short: 'Satellite', wired: false, range: [3e6, 4e7], rate: [1e5, 5e7], battery: 0.1, power: 5, cost: 4, c: 10, needsSky: true, used: 'remote sites, ships (slide 31: global area network)', rangeTxt: 'global (≈ 36,000 km up)', rateTxt: '≈ 0.1–50 Mbit/s' },
    { id: 'plc', label: 'Power-line (PLC)', short: 'PLC', wired: true, range: [10, 3000], rate: [1e3, 1e8], battery: 0, power: 3, cost: 0.3, c: 11, used: 'street lights, smart meters (slide 31: access networks)', rangeTxt: '≈ 10 m – 3 km of mains wiring', rateTxt: '≈ 1 kbit/s – 100 Mbit/s' },
    { id: 'xdsl', label: 'xDSL (phone line)', short: 'xDSL', wired: true, range: [500, 5000], rate: [1e6, 1e8], battery: 0, power: 3, cost: 1, c: 5, used: 'old telephone-line broadband (slide 31)', rangeTxt: '≈ 0.5–5 km of copper', rateTxt: '≈ 1–100 Mbit/s' },
    { id: 'cable', label: 'Cable-TV broadband', short: 'Cable', wired: true, range: [100, 3000], rate: [1e7, 1e9], battery: 0, power: 3, cost: 1, c: 8, used: 'cable-TV broadband (slide 31)', rangeTxt: '≈ 0.1–3 km of coax', rateTxt: '≈ 10 Mbit/s – 1 Gbit/s' },
    { id: 'ftth', label: 'Fibre (FTTx)', short: 'FTTx', wired: true, range: [1000, 20000], rate: [1e8, 1e10], battery: 0, power: 3, cost: 1.5, c: 2, used: 'fibre to the home or office (slide 31)', rangeTxt: '≈ 1–20 km of fibre', rateTxt: '≈ 0.1–10 Gbit/s' }
  ];
  function fmtDist(m) { return m < 1 ? (m * 100 < 1 ? Math.round(m * 1000) + ' mm' : +(m * 100).toPrecision(2) + ' cm') : m < 1000 ? +m.toPrecision(3) + ' m' : +(m / 1000).toPrecision(3) + ' km'; }
  function fmtRate(b) { return b < 1e3 ? +b.toPrecision(3) + ' bit/s' : b < 1e6 ? +(b / 1e3).toPrecision(3) + ' kbit/s' : b < 1e9 ? +(b / 1e6).toPrecision(3) + ' Mbit/s' : +(b / 1e9).toPrecision(3) + ' Gbit/s'; }
  function fmtYears(y) {
    if (y >= 1) { var yy = +y.toPrecision(2); return yy + (yy === 1 ? ' year' : ' years'); }
    if (y >= 1 / 12) { var mo = Math.round(y * 12); return mo + (mo === 1 ? ' month' : ' months'); }
    var d = Math.max(1, Math.round(y * 365)); return d + (d === 1 ? ' day' : ' days');
  }

  /* req: { distanceM, bps, batteryYears (0 = mains powered is fine), outdoor, cableOk } */
  function rank(req) {
    var out = TECHS.map(function (t) {
      var fails = [], oks = [];
      if (req.distanceM <= t.range[1]) oks.push('range ' + t.rangeTxt + ' covers ' + fmtDist(req.distanceM));
      else fails.push('range too short: it reaches ' + fmtDist(t.range[1]) + ' at best, you need ' + fmtDist(req.distanceM));
      if (req.bps <= t.rate[1]) oks.push('fast enough (up to ' + fmtRate(t.rate[1]) + ')');
      else fails.push('too slow: ' + fmtRate(t.rate[1]) + ' at best, you need ' + fmtRate(req.bps));
      if (req.batteryYears > 0) {
        if (t.battery >= req.batteryYears) oks.push('can run ' + (t.battery >= 20 ? 'for years (passive tag)' : 'about ' + fmtYears(t.battery) + ' on a small battery'));
        else fails.push(t.wired ? 'needs mains power, not a battery' : 'drains a battery too fast: about ' + fmtYears(t.battery) + ' at best, you want ' + fmtYears(req.batteryYears));
      } else oks.push('mains power: battery life does not matter');
      if (t.wired) { if (req.cableOk) oks.push('uses a cable or the power line you can use'); else fails.push('needs a cable (or the power line), and you cannot lay one'); }
      if (t.needsSky && !req.outdoor) fails.push('needs a clear view of the sky: not indoors');
      var pass = fails.length === 0;
      /* how far a rejected technology misses, in orders of magnitude (so "the closest one" really is the closest) */
      var gap = Math.max(0, Math.log10(req.distanceM / t.range[1])) + Math.max(0, Math.log10(req.bps / t.rate[1])) +
        (req.batteryYears > 0 && t.battery < req.batteryYears ? Math.max(0.5, Math.log10(req.batteryYears / Math.max(t.battery, 1e-3))) : 0) +
        (t.wired && !req.cableOk ? 2 : 0) + (t.needsSky && !req.outdoor ? 2 : 0);
      var tight = 0.4 * Math.log10(t.range[1] / Math.max(req.distanceM, 0.01)) + 0.2 * Math.log10(t.rate[1] / Math.max(req.bps, 1));
      var score = (req.batteryYears > 0 ? t.power : 0) + t.cost + tight;
      return { id: t.id, tech: t, pass: pass, fails: fails, oks: oks, score: score, gap: pass ? 0 : gap };
    });
    var viable = out.filter(function (x) { return x.pass; }).sort(function (a, b) { return a.score - b.score || (a.id < b.id ? -1 : 1); });
    var rejected = out.filter(function (x) { return !x.pass; }).sort(function (a, b) { return a.gap - b.gap || a.fails.length - b.fails.length || a.score - b.score; });
    return { viable: viable, rejected: rejected, all: viable.concat(rejected) };
  }
  var CONNECT_SCENARIOS = [
    { id: 'band', label: 'Wristband heart monitor', slide: 'textbook slide 34–39 (wearable)', req: { distanceM: 1, bps: 5e4, batteryYears: 0.02, outdoor: false, cableOk: false }, expect: ['ble'] },
    { id: 'soil', label: 'Soil sensors 5 km from the office', slide: 'slide 39', req: { distanceM: 5000, bps: 100, batteryYears: 5, outdoor: true, cableOk: false }, expect: ['lora', 'nbiot'] },
    { id: 'lamps', label: 'Street lights along a road (to the controller)', slide: 'slide 42', req: { distanceM: 500, bps: 1e4, batteryYears: 0, outdoor: true, cableOk: true }, expect: ['plc'] },
    { id: 'uplink', label: 'Street-light controller → platform', slide: 'slide 42', req: { distanceM: 5000, bps: 1e5, batteryYears: 0, outdoor: true, cableOk: false }, expect: ['lte', 'nbiot', 'lora'] },
    { id: 'factory', label: 'Factory vibration sensors', slide: 'textbook slide 38 (predictive maintenance)', req: { distanceM: 80, bps: 3e6, batteryYears: 0, outdoor: false, cableOk: true }, expect: ['wifi', 'zigbee', 'plc', 'xdsl', 'cable', 'ftth'] },
    { id: 'meter', label: 'Smart meter reporting once an hour', slide: 'slide 43 (smart metering)', req: { distanceM: 2000, bps: 1e3, batteryYears: 0, outdoor: true, cableOk: true }, expect: ['plc', 'lora', 'nbiot'] },
    { id: 'camera', label: 'Security camera (HD video)', slide: 'textbook slide 38', req: { distanceM: 30, bps: 4e6, batteryYears: 0, outdoor: true, cableOk: true }, expect: ['wifi', 'lte', 'ftth', 'cable', 'xdsl', 'g5', 'plc'] }
  ];
  var IotConnect = { TECHS: TECHS, rank: rank, SCENARIOS: CONNECT_SCENARIOS, fmtDist: fmtDist, fmtRate: fmtRate, fmtYears: fmtYears };

  NA.engines.IotPipeline = IotPipeline;
  NA.engines.IotConnect = IotConnect;
  if (typeof module !== 'undefined' && module.exports) module.exports = { IotPipeline: IotPipeline, IotConnect: IotConnect };
  if (typeof document === 'undefined') return;

  /* =====================================================================================================
     UI helpers
     ===================================================================================================== */
  var E = NA.el, S = NA.svg;

  /* =====================================================================================================
     iot-pipeline UI
     ===================================================================================================== */
  var STAGES = [
    { id: 'collect', name: 'Collect', glyph: '◉', who: 'sensors measure', c: 2 },
    { id: 'connect', name: 'Connect', glyph: '⇄', who: 'a network carries it', c: 1 },
    { id: 'learn', name: 'Learn', glyph: '✦', who: 'software decides', c: 5 },
    { id: 'do', name: 'Do', glyph: '⚙', who: 'an actuator acts', c: 7 }
  ];
  var SCEN = {
    farm: {
      chip: 'Smart agriculture', slide: 'slide 39', engine: IotPipeline.Farm, init: function (o) { return IotPipeline.Farm.init(o.soil); },
      source: 'Slide 39 lists the sensors (temperature and humidity, pH, EC, light intensity) and the actuator (pump controllers). The rules, numbers and payload are invented for teaching.',
      sensors: [
        { k: 'temp', label: 'Air temperature', unit: ' °C', min: 0, max: 45, step: 0.5, def: 22 }, { k: 'hum', label: 'Air humidity', unit: ' %', min: 10, max: 100, step: 1, def: 60 },
        { k: 'soil', label: 'Soil moisture', unit: ' %', min: 0, max: 60, step: 0.5, def: 34 }, { k: 'ph', label: 'pH', unit: '', min: 3, max: 10, step: 0.1, def: 6.4 },
        { k: 'ec', label: 'EC (salinity)', unit: ' dS/m', min: 0, max: 6, step: 0.1, def: 1.8 }, { k: 'light', label: 'Light', unit: ' klux', min: 0, max: 100, step: 1, def: 40 }],
      toggles: [{ k: 'rain', label: 'Rain forecast' }],
      path: [{ n: 'Field sensors', s: 0, g: '◉' }, { l: 'LoRaWAN', s: 1 }, { n: 'Gateway', s: 1, g: '▣' }, { l: 'Internet', s: 1, up: true }, { n: 'Cloud platform', s: 2, g: '☁', cloud: true }, { l: 'rule back', s: 3, cmd: true }, { n: 'Pump controller', s: 3, g: '⚙' }],
      stats: function (s) {
        var by = IotPipeline.batteryYears('lorawan', s.hours ? s.msgs / s.hours * 24 : 24);
        return [{ k: 'Water used', v: s.water.toLocaleString('en-US') + ' L', sub: 'pump hours × ' + PUMP_LITRES_PER_HOUR + ' L' }, { k: 'Alerts raised', v: String(s.alerts), sub: 'pH or EC out of range' },
          { k: 'Battery life', v: fmtYears(by), sub: 'at this message rate (illustrative)' }];
      },
      summary: function (s) { return 'End of day: ' + s.msgs + ' messages, ' + s.water.toLocaleString('en-US') + ' L of water, ' + s.alerts + ' alert(s).'; }
    },
    air: {
      chip: 'Air-quality station', slide: 'slide 41', engine: IotPipeline.Air, init: function () { return IotPipeline.Air.init(); },
      source: 'Slide 41 names the four measurements (PM2.5, PM10, CO2, CO). The bands are SIMPLIFIED for teaching, not an official air-quality index; the PM2.5 guideline is the WHO 2021 24-hour value of 15 µg/m³.',
      sensors: [
        { k: 'pm25', label: 'PM2.5', unit: ' µg/m³', min: 0, max: 200, step: 1, def: 20 }, { k: 'pm10', label: 'PM10', unit: ' µg/m³', min: 0, max: 300, step: 1, def: 40 },
        { k: 'co2', label: 'CO₂', unit: ' ppm', min: 350, max: 2500, step: 10, def: 450 }, { k: 'co', label: 'CO', unit: ' ppm', min: 0, max: 30, step: 0.1, def: 0.5 }],
      toggles: [],
      path: [{ n: 'Air sensor node', s: 0, g: '◉' }, { l: 'Wi-Fi / 4G', s: 1, up: true }, { n: 'Cloud platform', s: 2, g: '☁', cloud: true }, { l: 'alert', s: 3, cmd: true }, { n: 'City dashboard + roadside display', s: 3, g: '▤' }],
      stats: function (s) { return [{ k: 'Alerts raised', v: String(s.alerts), sub: s.undelivered ? s.undelivered + ' stuck offline' : 'all delivered' }, { k: 'Worst band today', v: IotPipeline.Air.BANDS[s.worst].label, sub: 'simplified bands' }, { k: 'Power', v: 'mains / solar', sub: 'a roadside node is not battery-only' }]; },
      summary: function (s) { return 'End of day: ' + s.msgs + ' messages, ' + s.alerts + ' alert(s), worst band "' + IotPipeline.Air.BANDS[s.worst].label + '".'; }
    },
    street: {
      chip: 'Smart street lights', slide: 'slide 42', engine: IotPipeline.Street, init: function () { return IotPipeline.Street.init(); },
      source: 'Slide 42 (textbook slide 48): street lights → a controller labelled PLC → generic IoT platform → Internet (Wi-Fi / 3G / 4G / 5G) → management and monitoring systems. Note: "PLC" on the slide is the controller box; on slide 31 the same letters mean power-line communication, one way such a line can talk. Lamp power and dim levels are illustrative.',
      sensors: [{ k: 'cars', label: 'Cars passing', unit: ' per min', min: 0, max: 50, step: 1, def: 6 }, { k: 'lux', label: 'Ambient light', unit: ' lux', min: 0, max: 600, step: 1, def: 5 }],
      toggles: [],
      path: [{ n: 'Street lamps ×' + LAMPS, s: 0, g: '◉' }, { l: 'power line', s: 1 }, { n: 'Controller (PLC)', s: 1, g: '▣' }, { l: 'Wi-Fi / 3G / 4G / 5G', s: 1, up: true }, { n: 'IoT platform', s: 2, g: '☁', cloud: true }, { l: 'dim command', s: 3, cmd: true }, { n: 'Lamps dim · management + monitoring', s: 3, g: '☀' }],
      stats: function (s) { var sv = Math.max(0, s.kwhAlways - s.kwh); return [{ k: 'Energy used', v: r1(s.kwh) + ' kWh', sub: 'always-on would use ' + r1(s.kwhAlways) + ' kWh' }, { k: 'Energy saved', v: r1(sv) + ' kWh', sub: s.kwhAlways ? Math.round(sv / s.kwhAlways * 100) + ' % of always-on' : 'no dark hour yet', cls: 'good' }, { k: 'Power', v: 'mains', sub: 'lamps are mains powered' }]; },
      summary: function (s) { var sv = Math.max(0, s.kwhAlways - s.kwh); return 'End of day: ' + s.msgs + ' messages, ' + r1(s.kwh) + ' kWh used, ' + r1(sv) + ' kWh saved (' + (s.kwhAlways ? Math.round(sv / s.kwhAlways * 100) : 0) + ' % less than always-on).'; }
    },
    park: {
      chip: 'Smart parking', slide: 'slide 43', engine: IotPipeline.Parking, init: function () { return IotPipeline.Parking.init(); },
      source: 'Slide 43 is the Libelium "Smart World" picture, whose application list includes Smart Parking. The lot size, sensors and message format are invented for teaching.',
      sensors: [{ k: 'occ', label: 'Occupied bays', unit: ' of ' + CAP, min: 0, max: CAP, step: 1, def: 10 }],
      toggles: [],
      path: [{ n: 'Bay sensors ×' + CAP, s: 0, g: '◉' }, { l: 'Zigbee', s: 1 }, { n: 'Gateway', s: 1, g: '▣' }, { l: '4G', s: 1, up: true }, { n: 'Cloud platform', s: 2, g: '☁', cloud: true }, { l: 'sign + app', s: 3, cmd: true }, { n: 'Street sign · driver app', s: 3, g: '▤' }],
      stats: function (s) {
        var perDay = s.hours ? s.msgs / CAP / s.hours * 24 : 16, by = Math.min(15, IotPipeline.batteryYears('zigbee', perDay));
        return [{ k: 'Bay events', v: String(s.events), sub: 'messages only when something changes' }, { k: 'Sensor battery', v: by >= 15 ? '15+ years' : fmtYears(by), sub: 'per bay sensor (illustrative)' }];
      },
      summary: function (s) { return 'End of day: ' + s.events + ' bay events instead of ' + (CAP * 24) + ' hourly readings (one per bay per hour).'; }
    }
  };
  var SC_ORDER = ['farm', 'air', 'street', 'park'];

  NA.register('iot-pipeline', {
    title: 'Collect → Connect → Learn → Do',
    hint: 'Try this: pick Smart agriculture, press ▶ Play a day and watch the pump follow the soil; then switch the cloud link off and play again.',
    build: function (host) {
      host.classList.add('na-iot-pipeline');
      var run = NA.runner();
      var scId = 'farm', sc = SCEN.farm, st = null, hour = 0, linkDown = false, playing = false, busy = false, soilType = 'loam';
      var sliders = {}, toggles = {}, lastRec = null;

      /* --- scenario chips + options --- */
      var chipRow = E('div', 'na-chips'); chipRow.appendChild(E('span', 'na-lab', 'Scenario'));
      var chipEls = {};
      SC_ORDER.forEach(function (id) {
        var c = NA.chip(SCEN[id].chip + ' · ' + SCEN[id].slide, function () { choose(id); }, 'From course ' + SCEN[id].slide);
        c.setAttribute('aria-pressed', id === scId ? 'true' : 'false'); chipEls[id] = c; chipRow.appendChild(c);
      });
      host.appendChild(chipRow);

      var bNext = NA.button('Next hour ▶', 'primary', function () { pause(); stepOnce(); });
      var bPlay = NA.button('▶ Play a day', '', function () { if (playing) pause(); else play(); });
      var bReset = NA.button('Reset', '', function () { reset(); });
      var linkChip = NA.chip('Cloud link: up', function () { linkDown = !linkDown; paintLink(); }, 'Switch the Internet connection to the cloud off and on');
      linkChip.setAttribute('aria-pressed', 'false');
      var soilSel = NA.select([{ value: 'sand', label: 'Sandy soil' }, { value: 'loam', label: 'Loamy soil' }, { value: 'clay', label: 'Clay soil' }], soilType, function (v) { soilType = v; reset(); });
      var soilField = NA.field('Soil type', soilSel);
      var ctrl = E('div', 'na-controls'); [bNext, bPlay, bReset].forEach(function (b) { ctrl.appendChild(b); });
      ctrl.appendChild(NA.field('What if…', linkChip)); ctrl.appendChild(soilField); ctrl.appendChild(NA.speedControl());
      host.appendChild(ctrl);

      /* --- sensors --- */
      var sensWrap = E('div', 'na-iot-pipeline-sens'); host.appendChild(E('div', 'na-lab', 'Sensors — drag to change what the node measures'));
      host.appendChild(sensWrap);

      /* --- path strip --- */
      var pathEl = E('div', 'na-iot-pipeline-path'); pathEl.setAttribute('role', 'img');
      host.appendChild(pathEl);

      /* --- the four stages --- */
      var ribbon = E('ol', 'na-iot-pipeline-ribbon'), cards = [], bodies = [];
      STAGES.forEach(function (sg, i) {
        var li = E('li', 'na-iot-pipeline-card'); li.style.setProperty('--c', 'var(--cmp-' + sg.c + ')');
        var head = E('div', 'na-iot-pipeline-ch');
        head.appendChild(E('span', 'na-iot-pipeline-gl', sg.glyph)); head.appendChild(E('b', null, (i + 1) + ' · ' + sg.name)); head.appendChild(E('i', null, sg.who));
        var body = E('div', 'na-iot-pipeline-cb', 'waiting…'); li.appendChild(head); li.appendChild(body);
        ribbon.appendChild(li); cards.push(li); bodies.push(body);
      });
      host.appendChild(ribbon);

      var statsEl = E('div', 'na-stats'); host.appendChild(statsEl);
      var nar = NA.narrator(); host.appendChild(nar.node);
      var srcEl = E('p', 'na-note'); host.appendChild(srcEl);

      /* --- scenario setup --- */
      function buildSensors() {
        NA.clear(sensWrap); sliders = {}; toggles = {};
        sc.sensors.forEach(function (d) {
          var sl = NA.slider(d.label, d.min, d.max, d.step, d.def, function (v) { return (Math.round(v * 10) / 10) + d.unit; });
          sliders[d.k] = sl; sensWrap.appendChild(sl.wrap);
        });
        (sc.toggles || []).forEach(function (t) {
          var lab = E('label', 'na-iot-pipeline-tg'), cb = E('input'); cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + t.label));
          toggles[t.k] = cb; sensWrap.appendChild(lab);
        });
        soilField.style.display = scId === 'farm' ? '' : 'none';
      }
      function buildPath() {
        NA.clear(pathEl);
        var parts = [];
        sc.path.forEach(function (p) {
          var d;
          if (p.n) { d = E('span', 'na-iot-pipeline-node' + (p.cloud ? ' cloud' : '')); d.appendChild(E('span', 'na-iot-pipeline-ng', p.g || '')); d.appendChild(document.createTextNode(p.n)); }
          else { d = E('span', 'na-iot-pipeline-link' + (p.up ? ' up' : '') + (p.cmd ? ' cmd' : ''), '─ ' + p.l + ' ▸'); }
          d.setAttribute('data-stage', p.s); d.__p = p; pathEl.appendChild(d); parts.push(d);
        });
        paintLink();
        pathEl.setAttribute('aria-label', 'Data path: ' + sc.path.map(function (p) { return p.n || p.l; }).join(', then '));
      }
      function paintLink() {
        linkChip.textContent = 'Cloud link: ' + (linkDown ? 'DOWN ✗' : 'up'); linkChip.setAttribute('aria-pressed', linkDown ? 'true' : 'false');
        Array.prototype.forEach.call(pathEl.children, function (d) {
          var p = d.__p; if (!p) return;
          if (p.up) { d.classList.toggle('down', linkDown); d.textContent = linkDown ? '─ ✗ ' + p.l + ' — down ▸' : '─ ' + p.l + ' ▸'; }
          if (p.cloud) d.classList.toggle('down', linkDown);
          if (p.cmd) d.textContent = (linkDown && sc.engine ? '─ local rule ▸' : '─ ' + p.l + ' ▸');
        });
      }
      function applyReading(vals) { Object.keys(vals).forEach(function (k) { if (sliders[k]) sliders[k].set(vals[k]); }); }
      function reading() { var r = {}; Object.keys(sliders).forEach(function (k) { r[k] = sliders[k].get(); }); Object.keys(toggles).forEach(function (k) { r[k] = toggles[k].checked; }); return r; }
      function setOn(i) {
        cards.forEach(function (c, k) { c.classList.toggle('on', k === i); c.classList.toggle('done', k < i); });
        Array.prototype.forEach.call(pathEl.children, function (d) { d.classList.toggle('on', +d.getAttribute('data-stage') === i); });
      }
      function clearOn() { cards.forEach(function (c) { c.classList.remove('on', 'done'); }); Array.prototype.forEach.call(pathEl.children, function (d) { d.classList.remove('on'); }); }

      /* --- stage panels --- */
      function fill(i, rec, s) {
        var b = bodies[i], h = '';
        if (i === 0) {
          h = '<ul class="na-iot-pipeline-rows">' + rec.collect.map(function (c) { return '<li><span>' + NA.esc(c.k) + '</span><b>' + NA.esc(String(c.v)) + (c.u ? ' <small>' + NA.esc(c.u) + '</small>' : '') + '</b></li>'; }).join('') + '</ul>';
        } else if (i === 1) {
          var c = rec.connect;
          h = '<div class="na-iot-pipeline-radio">' + NA.esc(c.radio) + '</div><code class="na-iot-pipeline-json">' + NA.esc(c.payload) + '</code>' +
            '<div class="na-iot-pipeline-meta"><b>' + c.bytes + ' bytes</b> in this message</div>' +
            '<div class="' + (c.delivered ? 'na-iot-pipeline-ok' : 'na-iot-pipeline-bad') + '">' + (c.delivered ? '✓ delivered to the cloud' + (c.flushed ? ' (+ ' + c.flushed + ' held-back message' + (c.flushed > 1 ? 's' : '') + ' sent now)' : '') : '✗ ' + NA.esc(c.uplink) + ' is down — ' + c.queued + ' waiting at the gateway') + '</div>';
        } else if (i === 2) {
          var l = rec.learn;
          h = '<p class="na-iot-pipeline-head">' + NA.esc(l.head) + '</p><ul class="na-iot-pipeline-ul">' + l.lines.map(function (x) { return '<li>' + NA.esc(x) + '</li>'; }).join('') + '</ul>' +
            '<div class="na-iot-pipeline-verdict">→ ' + NA.esc(l.verdict) + '</div>' + (l.note ? '<p class="na-iot-pipeline-note">' + NA.esc(l.note) + '</p>' : '');
        } else {
          var d = rec.doo;
          h = '<ul class="na-iot-pipeline-ul">' + d.lines.map(function (x) { return '<li>' + NA.esc(x) + '</li>'; }).join('') + '</ul>' + doVisual(rec);
        }
        b.innerHTML = h;
      }
      /* a tiny picture of the actuator's state */
      function doVisual(rec) {
        var d = rec.doo;
        if (scId === 'farm') return '<div class="na-iot-pipeline-vis"><span class="na-iot-pipeline-pump' + (d.pump ? ' on' : '') + '">' + (d.pump ? '💧 PUMP ON' : '◌ pump off') + '</span><span class="na-iot-pipeline-bar"><i style="width:' + clamp(d.nextSoil / 60 * 100, 0, 100) + '%"></i></span><small>soil next hour ' + d.nextSoil + ' %</small></div>';
        if (scId === 'air') return '<div class="na-iot-pipeline-vis"><span class="na-iot-pipeline-band b-' + d.band.css + '">' + NA.esc(d.band.label) + '</span></div>';
        if (scId === 'street') return '<div class="na-iot-pipeline-vis"><span class="na-iot-pipeline-bar lamp"><i style="width:' + d.level + '%"></i></span><small>lamps at ' + d.level + ' %</small></div>';
        return '<div class="na-iot-pipeline-vis"><span class="na-iot-pipeline-sign' + (d.free <= 0 ? ' full' : '') + '">' + NA.esc(d.sign) + '</span></div>';
      }
      function paintStats() {
        NA.clear(statsEl);
        var items = [{ k: 'Time', v: hour >= 24 ? 'end of day' : clock(hour), sub: 'simulated hour ' + Math.min(hour, 24) + ' of 24' },
          { k: 'Messages sent', v: String(st.msgs), sub: st.bytes.toLocaleString('en-US') + ' bytes' },
          { k: 'Waiting at gateway', v: String(st.queued), sub: st.queued ? 'cloud link is down' : 'nothing held back', cls: st.queued ? 'bad' : '' }].concat(sc.stats(st));
        items.forEach(function (it) { var t = NA.stat(it.k, it.cls); t.set(it.v, it.sub); statsEl.appendChild(t.node); });
      }

      /* --- stepping --- */
      async function lightUp(rec, g) {
        for (var i = 0; i < 4; i++) {
          setOn(i); fill(i, rec);
          if (!(await run.sleep(g, NA.dur(i === 3 ? 250 : 420)))) return false;
        }
        return true;
      }
      async function stepOnce() {
        if (busy || hour >= 24) return;
        busy = true;
        var g = run.start();
        var r = reading(), res = sc.engine.step(st, r, !linkDown);
        st = res.state; lastRec = res.rec;
        var ok = await lightUp(res.rec, g);
        if (!ok) { busy = false; return; }
        hour++;
        var m = sc.engine.model(hour, st);
        applyReading(playing ? Object.assign({}, m.day, m.carry) : m.carry);   // manual stepping keeps your slider settings, but the soil carries over
        paintStats();
        nar.say(NA.esc(res.rec.say) + (hour >= 24 ? '<br><b>' + NA.esc(sc.summary(st)) + '</b>' : ''));
        busy = false;
        if (hour >= 24) { playing = false; paintPlay(); }
      }
      async function play() {
        if (hour >= 24) reset();
        playing = true; paintPlay();
        var m = sc.engine.model(hour, st); applyReading(Object.assign({}, m.day, m.carry));
        while (playing && hour < 24) {
          await stepOnce();
          if (!playing) break;
          var g = run.start(); if (!(await run.sleep(g, NA.dur(450)))) break;
        }
        playing = false; paintPlay();
      }
      function pause() { playing = false; paintPlay(); }
      function paintPlay() { bPlay.textContent = playing ? '❚❚ Pause' : '▶ Play a day'; bNext.disabled = false; }
      function reset() {
        run.cancel(); playing = false; busy = false; hour = 0; lastRec = null;
        st = sc.init({ soil: soilType });
        buildSensors(); buildPath(); clearOn();
        var m = sc.engine.model(0, st); applyReading(Object.assign({}, m.day, m.carry));
        if (scId === 'farm') sliders.soil.set(st.soil);
        bodies.forEach(function (b) { b.textContent = 'waiting…'; });
        paintStats(); paintPlay(); srcEl.textContent = 'Source: ' + sc.source + ' Everything here is a simulation.';
        nar.say(scId === 'farm' ? 'Press <b>Next hour</b> to send one reading through the four stages, or <b>Play a day</b> to run 24 hours. Soil moisture starts just above the learned dry limit.'
          : 'Press <b>Next hour</b> to send one reading through the four stages, or <b>Play a day</b> to watch 24 simulated hours.');
      }
      function choose(id) {
        scId = id; sc = SCEN[id];
        SC_ORDER.forEach(function (k) { chipEls[k].setAttribute('aria-pressed', k === id ? 'true' : 'false'); });
        reset();
      }
      reset();
    }
  });

  /* =====================================================================================================
     iot-connect UI
     ===================================================================================================== */
  var DIST_MIN = -2, DIST_MAX = 6, RATE_MAX = 9;    // log10: 1 cm … 1000 km, 1 bit/s … 1 Gbit/s
  var BATT = [{ value: '0', label: 'Mains', y: 0 }, { value: '0.02', label: 'Days', y: 0.02 }, { value: '1', label: '1 year', y: 1 }, { value: '5', label: '5 years', y: 5 }, { value: '10', label: '10 years', y: 10 }];

  NA.register('iot-connect', {
    title: 'Connect layer: pick the radio',
    hint: 'Try this: choose "Soil sensors 5 km from the office", then drag the battery to "Mains" and watch which technologies light up.',
    build: function (host) {
      host.classList.add('na-iot-connect');
      var req = { distanceM: 30, bps: 1e5, batteryYears: 5, outdoor: false, cableOk: false }, selected = null;
      var chips = E('div', 'na-chips'); chips.appendChild(E('span', 'na-lab', 'Scenario'));
      var chipEls = {};
      CONNECT_SCENARIOS.forEach(function (s) { var c = NA.chip(s.label, function () { load(s); }, 'From the course: ' + s.slide); c.setAttribute('aria-pressed', 'false'); chipEls[s.id] = c; chips.appendChild(c); });
      host.appendChild(chips);

      var dSl = NA.slider('Distance to cover', DIST_MIN, DIST_MAX, 0.05, Math.log10(req.distanceM), function (v) { return fmtDist(Math.pow(10, v)); }, function (v) { req.distanceM = Math.pow(10, v); update(); });
      var rSl = NA.slider('Data rate needed', 0, RATE_MAX, 0.05, Math.log10(req.bps), function (v) { return fmtRate(Math.pow(10, v)); }, function (v) { req.bps = Math.pow(10, v); update(); });
      var bSeg = NA.segmented(BATT.map(function (b) { return { value: b.value, label: b.label }; }), '5', function (v) { req.batteryYears = +v; update(); }, 'Battery life wanted');
      var oSeg = NA.segmented([{ value: 'in', label: 'Indoor' }, { value: 'out', label: 'Outdoor' }], 'in', function (v) { req.outdoor = v === 'out'; update(); }, 'Where it is installed');
      var cb = E('input'); cb.type = 'checkbox'; cb.addEventListener('change', function () { req.cableOk = cb.checked; update(); });
      var cbLab = E('label', 'na-iot-connect-cb'); cbLab.appendChild(cb); cbLab.appendChild(document.createTextNode(' I can lay a cable or use the power line'));
      var ctrl = E('div', 'na-controls');
      dSl.wrap.classList.add('grow'); rSl.wrap.classList.add('grow');
      ctrl.appendChild(dSl.wrap); ctrl.appendChild(rSl.wrap); host.appendChild(ctrl);
      var ctrl2 = E('div', 'na-controls'); ctrl2.appendChild(NA.field('Battery life wanted', bSeg.wrap)); ctrl2.appendChild(NA.field('Installed', oSeg.wrap)); ctrl2.appendChild(cbLab); host.appendChild(ctrl2);

      /* --- the log–log chart --- */
      var X0 = 64, X1 = 626, Y0 = 12, Y1 = 322, VB = 640, VH = 372;
      var xp = function (bps) { return X0 + Math.log10(bps) / 10 * (X1 - X0); };
      var yp = function (m) { return Y1 - (Math.log10(m) - DIST_MIN) / 10 * (Y1 - Y0); };
      var svg = S('svg', { viewBox: '0 0 ' + VB + ' ' + VH, role: 'img', 'aria-label': 'Log-log chart of coverage range against data rate. Each box is one technology, from near-field NFC at the bottom left to satellite and fibre at the top and right. A crosshair shows your requirement; boxes that reach past it light up.' });
      for (var d = 0; d <= 10; d++) {
        S('line', { x1: xp(Math.pow(10, d)), x2: xp(Math.pow(10, d)), y1: Y0, y2: Y1, 'class': 'na-iot-connect-grid' }, svg);
        if (d % 3 === 0) S('text', { x: xp(Math.pow(10, d)), y: Y1 + 14, 'text-anchor': 'middle', 'class': 'na-iot-connect-tl' }, svg, d === 0 ? '1 bit/s' : d === 3 ? '1 kbit/s' : d === 6 ? '1 Mbit/s' : '1 Gbit/s');
      }
      for (var e = DIST_MIN; e <= 8; e++) {
        S('line', { x1: X0, x2: X1, y1: yp(Math.pow(10, e)), y2: yp(Math.pow(10, e)), 'class': 'na-iot-connect-grid' }, svg);
        if ([-2, 0, 3, 6, 8].indexOf(e) >= 0) S('text', { x: X0 - 6, y: yp(Math.pow(10, e)) + 3, 'text-anchor': 'end', 'class': 'na-iot-connect-tl' }, svg, e === -2 ? '1 cm' : e === 0 ? '1 m' : e === 3 ? '1 km' : e === 6 ? '1,000 km' : '100,000 km');
      }
      [['near', 0.01, 0.1], ['PAN', 1, 10], ['LAN', 10, 2000], ['MAN', 2000, 50000], ['WAN', 50000, 1e8]].forEach(function (b) {
        S('text', { x: X1 - 4, y: (yp(b[1]) + yp(b[2])) / 2 + 3, 'text-anchor': 'end', 'class': 'na-iot-connect-zone' }, svg, b[0]);
      });
      S('text', { x: X1 / 2 + 30, y: VH - 4, 'text-anchor': 'middle', 'class': 'na-iot-connect-ax' }, svg, 'data rate (log scale) →');
      var yAx = S('text', { x: 12, y: (Y0 + Y1) / 2, 'text-anchor': 'middle', 'class': 'na-iot-connect-ax', transform: 'rotate(-90 12 ' + (Y0 + Y1) / 2 + ')' }, svg, 'coverage range (log) →');
      void yAx;
      var quad = S('rect', { 'class': 'na-iot-connect-quad' }, svg);
      var blobs = {}, order = TECHS.slice().sort(function (a, b) { return (b.range[1] / b.range[0] * b.rate[1] / b.rate[0]) - (a.range[1] / a.range[0] * a.rate[1] / a.rate[0]); });
      var LABEL_AT = { plc: [0.04, 0.1], xdsl: [0.04, 0.12], cable: [0.5, 0.5], ftth: [0.5, 0.85], wifi: [0.5, 0.2], lte: [0.5, 0.2], g5: [0.5, 0.2], nfc: [1.2, 0.5], ble: [0.5, 0.2], zigbee: [0.5, 0.85], lora: [0.5, 0.5], nbiot: [0.5, 0.5], sat: [0.5, 0.5] };
      order.forEach(function (t) {
        var x = xp(t.rate[0]), x2 = xp(t.rate[1]), y = yp(t.range[1]), y2 = yp(t.range[0]);
        var g = S('g', { 'class': 'na-iot-connect-blob' + (t.wired ? ' wired' : ''), style: '--c:var(--cmp-' + t.c + ')', tabindex: '0', role: 'button', 'aria-label': t.label }, svg);
        S('rect', { x: x, y: y, width: Math.max(6, x2 - x), height: Math.max(6, y2 - y), rx: 7 }, g);
        var la = LABEL_AT[t.id] || [0.5, 0.5], w = Math.max(6, x2 - x), h = Math.max(6, y2 - y);
        var small = la[0] > 1;
        S('text', { x: small ? x + w + 4 : x + w * la[0], y: y + h * (1 - la[1]) + 3, 'text-anchor': small ? 'start' : 'middle' }, g, (t.wired ? '▬ ' : '') + t.short);
        g.addEventListener('click', function () { selected = selected === t.id ? null : t.id; update(); });
        g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selected = selected === t.id ? null : t.id; update(); } });
        blobs[t.id] = g;
      });
      var cross = S('g', { 'class': 'na-iot-connect-cross' }, svg);
      var cv = S('line', { y1: Y0, y2: Y1 }, cross), ch = S('line', { x1: X0, x2: X1 }, cross), cm = S('circle', { r: 5 }, cross);
      var ct = S('text', { 'text-anchor': 'start' }, cross, 'you need ▸');
      var stage = E('div', 'na-stage na-iot-connect-stage'); stage.appendChild(svg); host.appendChild(stage);
      host.appendChild(E('p', 'na-note na-iot-connect-scrollhint', '← the chart scrolls sideways on a narrow screen →'));
      var key = E('div', 'na-key'), k1 = E('span'), sw = E('i');
      sw.style.setProperty('--c', 'var(--cmp-1)'); k1.appendChild(sw); k1.appendChild(document.createTextNode(' solid box = radio'));
      key.appendChild(k1); key.appendChild(E('span', null, '▬ dashed box = cable or power line'));
      key.appendChild(E('span', null, 'bright = meets every requirement · faded = does not · shaded corner = what you need'));
      host.appendChild(key);

      var nar = NA.narrator(); host.appendChild(nar.node);

      /* --- ranked table (also the typical-values table) --- */
      var tblWrap = E('div', 'tbl-scroll na-iot-connect-tw');
      var tbl = E('table', 'na-table na-iot-connect-tbl'); tblWrap.appendChild(tbl); host.appendChild(tblWrap);
      host.appendChild(E('p', 'na-note', 'Typical orders of magnitude only — real range and speed vary with the version of the standard, antennas, walls and weather. 3G, WiMAX and CDMA450 also appear on slide 31; they are being retired and are not drawn. Power use: ● is low, ●●●●● is high (relative, illustrative).'));

      function dots(n) { return '●'.repeat(n) + '○'.repeat(5 - n); }
      function load(s) {
        req = { distanceM: s.req.distanceM, bps: s.req.bps, batteryYears: s.req.batteryYears, outdoor: s.req.outdoor, cableOk: s.req.cableOk };
        dSl.set(Math.log10(req.distanceM)); rSl.set(Math.log10(req.bps));
        var bv = BATT.reduce(function (best, b) { return Math.abs(b.y - req.batteryYears) < Math.abs(best.y - req.batteryYears) ? b : best; }, BATT[0]);
        bSeg.set(bv.value); oSeg.set(req.outdoor ? 'out' : 'in'); cb.checked = req.cableOk;
        Object.keys(chipEls).forEach(function (k) { chipEls[k].setAttribute('aria-pressed', k === s.id ? 'true' : 'false'); });
        update(s);
      }
      function update(scen) {
        if (!scen) Object.keys(chipEls).forEach(function (k) { chipEls[k].setAttribute('aria-pressed', 'false'); });
        var rk = rank(req), pass = {};
        rk.viable.forEach(function (x) { pass[x.id] = true; });
        var px = xp(req.bps), py = yp(req.distanceM);
        cv.setAttribute('x1', px); cv.setAttribute('x2', px); ch.setAttribute('y1', py); ch.setAttribute('y2', py);
        cm.setAttribute('cx', px); cm.setAttribute('cy', py);
        ct.setAttribute('x', X0 + 6); ct.setAttribute('y', py > Y0 + 18 ? py - 6 : py + 16);
        quad.setAttribute('x', px); quad.setAttribute('y', Y0); quad.setAttribute('width', Math.max(0, X1 - px)); quad.setAttribute('height', Math.max(0, py - Y0));
        TECHS.forEach(function (t) { blobs[t.id].classList.toggle('ok', !!pass[t.id]); blobs[t.id].classList.toggle('no', !pass[t.id]); blobs[t.id].classList.toggle('sel', selected === t.id); });
        /* table */
        var h = '<thead><tr><th></th><th>Technology</th><th>Typical range</th><th>Typical speed</th><th>Power use</th><th>Why it fits — or why not</th></tr></thead><tbody>';
        rk.all.forEach(function (x, i) {
          var t = x.tech, why = x.pass ? x.oks.join(' · ') : x.fails.join(' · ');
          h += '<tr class="' + (x.pass ? 'ok' : 'no') + (selected === t.id ? ' sel' : '') + '" data-id="' + t.id + '"><td>' + (x.pass ? '<b class="na-iot-connect-v ok">✓' + (i === 0 ? ' 1st' : '') + '</b>' : '<b class="na-iot-connect-v no">✗</b>') + '</td>' +
            '<td><b>' + (t.wired ? '▬ ' : '') + NA.esc(t.label) + '</b><br><small>' + NA.esc(t.used) + '</small><small class="na-iot-connect-sm">' + NA.esc(t.rangeTxt + ' · ' + t.rateTxt) + '</small></td><td>' + NA.esc(t.rangeTxt) + '</td><td>' + NA.esc(t.rateTxt) + '</td>' +
            '<td aria-label="' + t.power + ' of 5"><span class="na-iot-connect-dots">' + dots(t.power) + '</span></td><td class="na-iot-connect-why">' + NA.esc(why) + '</td></tr>';
        });
        tbl.innerHTML = h + '</tbody>';
        Array.prototype.forEach.call(tbl.querySelectorAll('tbody tr'), function (tr) { tr.addEventListener('click', function () { var id = tr.getAttribute('data-id'); selected = selected === id ? null : id; update(scen); }); });
        /* narration */
        var need = fmtRate(req.bps) + ' over ' + fmtDist(req.distanceM) + (req.batteryYears > 0 ? ', ' + fmtYears(req.batteryYears) + ' on a battery' : ', mains powered') + (req.outdoor ? ', outdoors' : ', indoors') + (req.cableOk ? ', a cable or the power line is allowed' : ', no cable');
        var msgTxt;
        if (rk.viable.length) {
          var best = rk.viable[0];
          msgTxt = '<b>' + rk.viable.length + ' of ' + TECHS.length + '</b> technologies can do <b>' + NA.esc(need) + '</b>. Best fit: <b>' + NA.esc(best.tech.label) + '</b> — ' + NA.esc(best.oks.slice(0, 3).join('; ')) + '.' +
            (rk.viable[1] ? ' Runner-up: ' + NA.esc(rk.viable[1].tech.label) + '.' : '') + (scen ? ' (' + NA.esc(scen.slide) + ')' : '');
        } else {
          var cl = rk.rejected[0];
          msgTxt = '<b>Nothing</b> on the chart can do <b>' + NA.esc(need) + '</b> all at once. The closest, <b>' + NA.esc(cl.tech.label) + '</b>, fails on: ' + NA.esc(cl.fails.join('; ')) + '. Relax one requirement — or use two links in a row (a radio to a gateway, then fibre or 4G to the cloud).';
        }
        nar.say(msgTxt);
      }
      load(CONNECT_SCENARIOS[1]);
    }
  });
})();
