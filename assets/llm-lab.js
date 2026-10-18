/* LLM & Security Lab — UI for Chapter 12. Mount point: #llm-root. Engines live in assets/llm-engines.js.
   Three small panels: A) Next-token machine  B) Prompt-injection sandbox + paste checklist  C) Password check.
   Everything runs in the browser. Nothing you type is sent anywhere.                                      */
(function () {
  'use strict';

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var uid = 0;
  function field(labelText, control, cls) {
    var id = 'llm-f' + (++uid), wrap = el('div', 'llm-field ' + (cls || ''));
    var lab = el('label', 'field-label', labelText);
    control.id = id; lab.setAttribute('for', id);
    wrap.appendChild(lab); wrap.appendChild(control);
    return wrap;
  }
  function select(options, value) {
    var s = el('select', 'preset-select');
    options.forEach(function (o) { var op = el('option'); op.value = o[0]; op.textContent = o[1]; s.appendChild(op); });
    if (value !== undefined) s.value = String(value);
    return s;
  }

  function mount() {
    var host = document.getElementById('llm-root');
    var E = window.LLMEngines;
    if (!host || !E) return;

    var tabs = el('div', 'llm-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Lab panels');
    var panels = [], tabBtns = [];
    [['A', 'Next-token machine'], ['B', 'Prompt-injection sandbox'], ['C', 'Password check']].forEach(function (t, i) {
      var b = el('button', 'llm-tab', '<span class="llm-tab-k">' + t[0] + '</span> ' + t[1]);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'llm-tab-' + i; b.setAttribute('aria-controls', 'llm-panel-' + i);
      b.addEventListener('click', function () { show(i); });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { var j = (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; show(j); tabBtns[j].focus(); }
      });
      tabs.appendChild(b); tabBtns.push(b);
      var p = el('div', 'run-panel llm-panel'); p.id = 'llm-panel-' + i; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b.id);
      panels.push(p);
    });
    function show(i) {
      panels.forEach(function (p, k) { p.hidden = k !== i; tabBtns[k].setAttribute('aria-selected', k === i ? 'true' : 'false'); tabBtns[k].tabIndex = k === i ? 0 : -1; });
    }
    host.appendChild(tabs);
    panels.forEach(function (p) { host.appendChild(p); });

    buildA(panels[0], E);
    buildB(panels[1], E);
    buildC(panels[2], E);
    show(0);
  }

  // ───────────────────────── Panel A ─────────────────────────
  function buildA(panel, E) {
    var T = E.Tokenizer, N = E.NGram, model = N.train(N.CORPUS);
    panel.appendChild(el('div', 'note warn llm-sim-note',
      '<span class="note-tag">Simulation</span>This is a <strong>tiny word n-gram model</strong> trained in your browser on ' + model.sentences +
      ' sentences (' + model.vocabSize + ' different words). A real LLM is a <strong>transformer with billions of parameters</strong>, ' +
      'trained on trillions of tokens, and it looks at the whole context, not just the last two words. ' +
      'But the generation loop is the same: <strong>a probability for every possible next token, pick one, append it, repeat</strong>.'));

    // A1 — tokenizer
    panel.appendChild(el('h4', '', 'A1 · Step 1 of every LLM: text becomes tokens'));
    var tIn = el('input', 'llm-text'); tIn.type = 'text'; tIn.value = 'the computer reads the prompt'; tIn.maxLength = 160;
    var tPre = select([['the computer reads the prompt', 'the computer reads the prompt'], ['tokenization is fun', 'tokenization is fun'], ['unhappiness', 'unhappiness'],
      ['password123!', 'password123!'], ['Hà Nội', 'Hà Nội (Vietnamese)'], ['', 'Type my own text']]);
    tPre.addEventListener('change', function () { if (tPre.value !== '') tIn.value = tPre.value; tokRender(); });
    var tRow = el('div', 'llm-row');
    tRow.appendChild(field('Example text', tPre)); tRow.appendChild(field('Text to tokenize (any text works)', tIn, 'llm-grow'));
    panel.appendChild(tRow);
    var tChips = el('div', 'llm-chips'); tChips.setAttribute('aria-label', 'Tokens with their ids');
    var tStat = el('div', 'sim-status'); tStat.setAttribute('role', 'status'); tStat.setAttribute('aria-live', 'polite');
    panel.appendChild(tChips); panel.appendChild(tStat);
    function tokRender() {
      var enc = T.encode(tIn.value);
      tChips.innerHTML = enc.map(function (t) {
        var isByte = /^<0x/.test(t.piece);
        return '<span class="llm-chip' + (isByte ? ' llm-byte' : '') + '"><b>' + esc(t.piece === T.SP ? '▁' : t.piece) + '</b><i>' + t.id + '</i></span>';
      }).join('') || '<span class="llm-muted">Type something above.</span>';
      var chars = Array.from(tIn.value).length;
      tStat.textContent = chars + ' characters → ' + enc.length + ' tokens. The model only ever sees the numbers (ids). ' +
        '▁ means “a space came first”. Pieces like <0xC3> are raw bytes: the toy vocabulary has no merges for accented letters, so they cost several tokens each ' +
        '(real tokenizers have a similar problem with rarer scripts, just smaller). Decoding the ids gives back: “' + T.decode(enc.map(function (t) { return t.id; })) + '”.';
    }
    tIn.addEventListener('input', function () { tPre.value = ''; tokRender(); });
    tokRender();

    // A2 — generation
    panel.appendChild(el('h4', '', 'A2 · Next-token prediction, one token at a time'));
    var orderSel = select([['1', '1 · unigram (no context)'], ['2', '2 · bigram (last word)'], ['3', '3 · trigram (last 2 words)']], 2);
    var temp = el('input'); temp.type = 'range'; temp.min = '0'; temp.max = '2'; temp.step = '0.1'; temp.value = '1';
    var tempOut = el('output', 'llm-out', '1.0');
    var topk = select([['0', 'all words'], ['1', 'top 1'], ['2', 'top 2'], ['3', 'top 3'], ['5', 'top 5']], 0);
    var seed = el('input', 'llm-seed'); seed.type = 'number'; seed.min = '1'; seed.max = '99999'; seed.value = '2';
    var prompt = el('input', 'llm-text'); prompt.type = 'text'; prompt.value = 'a language model'; prompt.maxLength = 60;
    var pPre = select([['a language model', 'a language model'], ['the cpu', 'the cpu'], ['the student', 'the student'], ['a hacker', 'a hacker'], ['the model', 'the model'], ['', 'Type my own start']]);
    pPre.addEventListener('change', function () { if (pPre.value) prompt.value = pPre.value; reset(); });
    var ctrl = el('div', 'llm-row');
    ctrl.appendChild(field('Start of the sentence (prompt)', pPre));
    ctrl.appendChild(field('or type your own (known words work best)', prompt, 'llm-grow'));
    panel.appendChild(ctrl);
    var ctrl2 = el('div', 'llm-row');
    ctrl2.appendChild(field('Model order', orderSel));
    var tf = field('Temperature', temp); tf.appendChild(tempOut); ctrl2.appendChild(tf);
    ctrl2.appendChild(field('Top-k filter', topk));
    ctrl2.appendChild(field('Random seed', seed));
    panel.appendChild(ctrl2);
    var bar = el('div', 'ex-actions');
    var stepBtn = el('button', 'btn primary', '⏭ Next token'); stepBtn.type = 'button';
    var allBtn = el('button', 'btn ghost', '▶ Generate to the end'); allBtn.type = 'button';
    var resetBtn = el('button', 'btn ghost small', '↺ Reset'); resetBtn.type = 'button';
    bar.appendChild(stepBtn); bar.appendChild(allBtn); bar.appendChild(resetBtn);
    panel.appendChild(bar);

    var textBox = el('div', 'llm-textbox'); textBox.setAttribute('aria-label', 'Generated text');
    var status = el('div', 'sim-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    var tblWrap = el('div', 'tbl-scroll');
    panel.appendChild(el('label', 'field-label', 'Text so far (your prompt, then the model’s tokens)'));
    panel.appendChild(textBox); panel.appendChild(status);
    panel.appendChild(el('label', 'field-label', 'The probability table the model just used'));
    panel.appendChild(tblWrap);
    panel.appendChild(el('div', 'note tip',
      '<span class="note-tag">Things to try</span>Set temperature to 0 and press Generate twice: same text every time (greedy). ' +
      'Raise it to 2 and the unlikely words get a real chance. Switch to the trigram model: the output becomes a near-copy of a training sentence, ' +
      'a toy version of <strong>memorization</strong> (concept 12.7). Keep temperature 1, change only the seed: same model, different story.'));

    var st = null;
    function params() {
      return { prompt: prompt.value, order: +orderSel.value, temperature: +temp.value, topK: +topk.value, seed: Math.max(1, +seed.value || 1), maxNew: 24 };
    }
    function reset() { st = N.start(model, params()); lastStep = null; render(); }
    var lastStep = null;
    function render() {
      var promptToks = st.tokens.slice(0, st.promptLen), gen = st.tokens.slice(st.promptLen);
      textBox.innerHTML = '<span class="llm-prompt">' + esc(N.detok(promptToks)) + '</span>' +
        (gen.length ? ' <span class="llm-gen">' + esc(N.detok(gen)) + '</span>' : '') + (st.done ? ' <span class="llm-muted">[end]</span>' : '<span class="llm-caret" aria-hidden="true">▌</span>');
      var unknown = N.wordTokens(prompt.value).filter(function (w) { return !model.vocab[w]; });
      if (!lastStep) {
        var d = N.nextDist(model, st.tokens, st.order);
        tblWrap.innerHTML = tableHTML(N.reshape(d.entries, st.temperature, st.topK), null, d);
        status.textContent = 'Ready. Press “Next token” to sample the first token' + (unknown.length ? '. Unknown word(s) in your prompt: ' + unknown.join(', ') + ' — the model backs off to its general word frequencies.' : '.') +
          (d.usedOrder < st.order ? ' (This context never occurred in training, so the model backed off to a shorter one.)' : '');
      } else {
        var s = lastStep, chosen = s.shaped[s.chosenIndex];
        tblWrap.innerHTML = tableHTML(s.shaped, s.chosenIndex, { usedOrder: s.usedOrder, requestedOrder: st.order });
        status.textContent = 'The model looked at ' + (s.usedOrder - 1 === 0 ? 'no context' : 'the last ' + (s.usedOrder - 1) + ' word' + (s.usedOrder > 2 ? 's' : '')) +
          ', gave every candidate a probability, and the seeded random number ' + s.u.toFixed(3) + ' picked “' + (s.chosen === N.EOS ? 'end of sentence' : s.chosen) + '” (' + (chosen.adj * 100).toFixed(0) + '% after temperature/top-k). ' +
          (st.done ? 'Generation finished.' : 'That token was appended to the text and the loop repeats.');
      }
      stepBtn.disabled = allBtn.disabled = st.done;
    }
    function tableHTML(shaped, chosenIdx, info) {
      var rows = shaped.slice(0, 8).map(function (e, i) {
        var name = e.tok === N.EOS ? '[end of sentence]' : e.tok;
        return '<tr class="' + (i === chosenIdx ? 'llm-chosen' : '') + (e.kept ? '' : ' llm-dropped') + '">' +
          '<td class="mono">' + esc(name) + '</td><td>' + e.count + '</td>' +
          '<td><span class="llm-bar"><span style="width:' + Math.round(e.p * 100) + '%"></span></span> ' + (e.p * 100).toFixed(0) + '%</td>' +
          '<td><span class="llm-bar llm-bar2"><span style="width:' + Math.round(e.adj * 100) + '%"></span></span> ' + (e.kept ? (e.adj * 100).toFixed(0) + '%' : 'filtered out') + '</td>' +
          '<td>' + (i === chosenIdx ? '◀ chosen' : '') + '</td></tr>';
      }).join('');
      var more = shaped.length > 8 ? '<p class="llm-muted">…and ' + (shaped.length - 8) + ' rarer candidates (probabilities of everything shown and hidden sum to 100%).</p>' : '';
      var ctxLine = '<p class="llm-muted">Model used a context of ' + (info.usedOrder - 1) + ' word' + (info.usedOrder === 2 ? '' : 's') +
        (info.usedOrder < info.requestedOrder ? ' (backed off from ' + (info.requestedOrder - 1) + ')' : '') + '. Counts come from the ' + model.sentences + ' training sentences.</p>';
      return '<table class="tbl llm-table"><thead><tr><th>Next token</th><th>Seen</th><th>Probability</th><th>After temperature &amp; top-k</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' + more + ctxLine;
    }
    stepBtn.addEventListener('click', function () { lastStep = N.step(st); render(); });
    allBtn.addEventListener('click', function () { while (!st.done) lastStep = N.step(st); render(); });
    resetBtn.addEventListener('click', reset);
    [orderSel, topk, seed].forEach(function (c) { c.addEventListener('change', reset); });
    prompt.addEventListener('input', function () { pPre.value = ''; reset(); });
    temp.addEventListener('input', function () { tempOut.textContent = (+temp.value).toFixed(1); reset(); });
    reset();
  }

  // ───────────────────────── Panel B ─────────────────────────
  function buildB(panel, E) {
    var I = E.Injection, C = E.Checklist;
    panel.appendChild(el('div', 'note warn llm-sim-note',
      '<span class="note-tag">Simulation</span>The “assistant” below is a <strong>scripted, rule-based toy</strong>: no AI model is involved. ' +
      'It spots instruction-like sentences (“ignore the above…”, “send my notes to…”, “say…”) in whatever text it reads and obeys them — the way a real model sometimes does, ' +
      'because for a language model <strong>instructions and data are both just tokens in one stream</strong>. Real attacks are messier; the principle is the same.'));
    panel.appendChild(el('h4', '', 'B1 · Break the assistant, then defend it'));

    var presetSel = select(I.PRESETS.map(function (p) { return [p.key, p.name]; }), 'hidden-email');
    var reqSel = select(Object.keys(I.REQUESTS).map(function (k) { return [k, I.REQUESTS[k].label]; }), 'summarise');
    var row = el('div', 'llm-row');
    row.appendChild(field('Scenario (untrusted text to start from)', presetSel, 'llm-grow'));
    panel.appendChild(row);

    var defs = el('fieldset', 'llm-defs'); defs.appendChild(el('legend', 'field-label', 'Defences (all off = vulnerable assistant)'));
    function chk(label, hint) {
      var id = 'llm-c' + (++uid), w = el('label', 'llm-chk'); w.setAttribute('for', id);
      var c = el('input'); c.type = 'checkbox'; c.id = id; w.appendChild(c);
      w.appendChild(el('span', '', '<b>' + label + '</b><small>' + hint + '</small>'));
      defs.appendChild(w); return c;
    }
    var cDelim = chk('Delimit untrusted text', 'wrap it in <untrusted_document> tags and tell the model it is data');
    var cEsc = chk('Escape look-alike tags', 'remove any copy of the tag from the document itself');
    var cLeast = chk('Least privilege', 'this task gets no tools: it cannot send e-mail or read notes');
    panel.appendChild(defs);
    var qa = el('div', 'ex-actions');
    var bVuln = el('button', 'btn ghost small', 'Turn all defences off'); bVuln.type = 'button';
    var bDef = el('button', 'btn ghost small', 'Turn all defences on'); bDef.type = 'button';
    var bReset = el('button', 'btn ghost small', '↺ Reset scenario'); bReset.type = 'button';
    qa.appendChild(bVuln); qa.appendChild(bDef); qa.appendChild(bReset);
    panel.appendChild(qa);

    // the three channels
    var chan = el('div', 'llm-chans');
    var sysBox = el('div', 'llm-chan llm-trusted');
    sysBox.innerHTML = '<span class="llm-chan-k">1 · System prompt <em>trusted · written by the developer</em></span><pre class="llm-pre"></pre>';
    sysBox.querySelector('pre').textContent = I.SYSTEM;
    var userBox = el('div', 'llm-chan llm-trusted');
    userBox.innerHTML = '<span class="llm-chan-k">2 · User request <em>trusted · typed by you</em></span><pre class="llm-pre"></pre>';
    var docBox = el('div', 'llm-chan llm-untrusted');
    docBox.innerHTML = '<span class="llm-chan-k">3 · Untrusted document <em>anyone could have written this — edit it!</em></span>';
    var docTa = el('textarea', 'code-edit llm-doc'); docTa.rows = 6; docTa.setAttribute('aria-label', 'Untrusted document text (editable)'); docTa.spellcheck = false;
    docBox.appendChild(docTa);
    docBox.appendChild(el('p', 'llm-muted', 'Hidden text tricks: <code>&lt;!-- ... --&gt;</code> or <code>[hidden]...[/hidden]</code> are invisible to a human reader but not to the model.'));
    chan.appendChild(sysBox); chan.appendChild(userBox); chan.appendChild(docBox);
    panel.appendChild(chan);
    panel.appendChild(field('What the user asked', reqSel));

    var cols = el('div', 'run-cols');
    var humanBox = el('div'); humanBox.appendChild(el('label', 'field-label', 'What a human sees'));
    var humanOut = el('pre', 'llm-pre llm-view'); humanBox.appendChild(humanOut);
    var modelBox = el('div'); modelBox.appendChild(el('label', 'field-label', 'What the model receives (one flat stream)'));
    var modelOut = el('pre', 'llm-pre llm-view'); modelBox.appendChild(modelOut);
    cols.appendChild(humanBox); cols.appendChild(modelBox);
    panel.appendChild(cols);

    var verdict = el('div', 'sim-status'); verdict.setAttribute('role', 'status'); verdict.setAttribute('aria-live', 'polite');
    panel.appendChild(verdict);
    panel.appendChild(el('label', 'field-label', 'Assistant output'));
    var outBox = el('div', 'llm-answer'); panel.appendChild(outBox);
    var cols2 = el('div', 'run-cols');
    var fBox = el('div'); fBox.appendChild(el('label', 'field-label', 'Instruction-like text found in the document'));
    var fOut = el('ul', 'llm-list'); fBox.appendChild(fOut);
    var tBox = el('div'); tBox.appendChild(el('label', 'field-label', 'Tool calls'));
    var tOut = el('ul', 'llm-list'); tBox.appendChild(tOut);
    cols2.appendChild(fBox); cols2.appendChild(tBox);
    panel.appendChild(cols2);
    panel.appendChild(el('div', 'note tip',
      '<span class="note-tag">Things to try</span>(1) Run the hidden-e-mail scenario with every defence off, then tick only “Least privilege”: the instruction is still obeyed but the damage is blocked. ' +
      '(2) Load the delimiter breaker, tick only “Delimit” — it still wins — then add “Escape look-alike tags”. ' +
      '(3) Write your own attack in the document box. Real systems also need output filtering, human approval for risky actions, and testing; <strong>no defence is perfect</strong>.'));

    function currentPreset() { return I.PRESETS.filter(function (p) { return p.key === presetSel.value; })[0]; }
    function renderViews(r) {
      humanOut.textContent = r.human || '(empty)';
      var html = esc(r.parts.untrusted);
      r.hidden.forEach(function (h) { if (h) html = html.split(esc(h)).join('<mark class="llm-hid">' + esc(h) + '</mark>'); });
      modelOut.innerHTML = html || '<span class="llm-muted">(empty)</span>';
    }
    function run() {
      userBox.querySelector('pre').textContent = I.REQUESTS[reqSel.value].label;
      var r = I.run({ doc: docTa.value, request: reqSel.value, defences: { delimit: cDelim.checked, escape: cEsc.checked, leastPrivilege: cLeast.checked } });
      renderViews(r);
      verdict.className = 'sim-status ' + (r.compromised ? 'error' : 'done');
      verdict.textContent = r.compromised
        ? 'COMPROMISED — the assistant obeyed text that came from the untrusted document, not from the system or the user.'
        : (r.findings.length ? 'SAFE this time — instruction-like text was found but not obeyed.' : 'SAFE — nothing suspicious in the document.');
      outBox.textContent = r.output;
      fOut.innerHTML = r.findings.length ? r.findings.map(function (f) {
        return '<li class="' + (f.active ? 'llm-bad' : 'llm-good') + '"><strong>' + (f.active ? 'OBEYED' : 'ignored') + '</strong> · ' + esc(f.label) + ': <code>' + esc(f.text) + '</code><br><span class="llm-muted">' + esc(f.reason) + '</span></li>';
      }).join('') : '<li class="llm-muted">None.</li>';
      tOut.innerHTML = r.tools.length ? r.tools.map(function (t) {
        return '<li class="' + (t.status === 'executed' ? 'llm-bad' : 'llm-good') + '"><strong>' + (t.status === 'executed' ? 'EXECUTED' : 'blocked') + '</strong> · <code>' + esc(t.tool) + '(to: ' + esc(t.args.to) + ')</code>' +
          (t.status === 'executed' ? '<br><span class="llm-muted">leaked: “' + esc(t.args.body) + '”</span>' : '<br><span class="llm-muted">' + esc(t.why) + '</span>') + '</li>';
      }).join('') : '<li class="llm-muted">No tool was called. Tools granted for this task: ' + (r.allowedTools.length ? esc(r.allowedTools.join(', ')) : 'none') + '.</li>';
    }
    function loadPreset() {
      var p = currentPreset(); docTa.value = p.doc; reqSel.value = p.request; run();
    }
    presetSel.addEventListener('change', loadPreset);
    reqSel.addEventListener('change', run);
    docTa.addEventListener('input', function () { run(); });
    [cDelim, cEsc, cLeast].forEach(function (c) { c.addEventListener('change', run); });
    bVuln.addEventListener('click', function () { cDelim.checked = cEsc.checked = cLeast.checked = false; run(); });
    bDef.addEventListener('click', function () { cDelim.checked = cEsc.checked = cLeast.checked = true; run(); });
    bReset.addEventListener('click', loadPreset);
    loadPreset();

    // B2 — paste checklist
    panel.appendChild(el('h4', 'llm-h-gap', 'B2 · Before you paste: what may go into a public chatbot?'));
    panel.appendChild(el('p', 'llm-muted', 'Decide for each item, then check. Rule of thumb from the textbook: only public data may be pasted freely; internal data needs thought; confidential and sensitive data: never.'));
    var list = el('div', 'llm-checks'), selects = [];
    C.ITEMS.forEach(function (it, i) {
      var row = el('div', 'llm-check-row');
      row.appendChild(el('span', 'llm-check-text', esc(it.text)));
      var s = select([['', '— choose —'], ['ok', 'Fine to paste'], ['careful', 'Think first / approved tool'], ['never', 'Never']], '');
      s.setAttribute('aria-label', 'Decision for item ' + (i + 1) + ': ' + it.text);
      selects.push(s); row.appendChild(s);
      var fb = el('span', 'llm-check-fb'); fb.setAttribute('aria-live', 'polite'); row.appendChild(fb);
      list.appendChild(row);
    });
    panel.appendChild(list);
    var cbar = el('div', 'ex-actions');
    var cbtn = el('button', 'btn primary', 'Check my answers'); cbtn.type = 'button';
    var cres = el('div', 'sim-status'); cres.setAttribute('role', 'status'); cres.setAttribute('aria-live', 'polite');
    cbar.appendChild(cbtn); panel.appendChild(cbar); panel.appendChild(cres);
    cbtn.addEventListener('click', function () {
      var answers = selects.map(function (s) { return s.value; });
      var res = C.score(answers);
      var rows = list.querySelectorAll('.llm-check-row');
      res.details.forEach(function (d, i) {
        rows[i].className = 'llm-check-row ' + (d.got ? (d.right ? 'llm-ok' : 'llm-wrong') : '');
        rows[i].querySelector('.llm-check-fb').textContent = d.got
          ? (d.right ? '✔ ' : '✘ Correct answer: ' + ({ ok: 'fine to paste', careful: 'think first', never: 'never' })[d.want] + '. ') + '(' + d.level + ') ' + d.why : '';
      });
      var done = answers.filter(Boolean).length;
      cres.className = 'sim-status ' + (res.correct === res.total ? 'done' : 'running');
      cres.textContent = done < res.total ? 'You answered ' + done + ' of ' + res.total + '; score so far ' + res.correct + '.' : 'Score: ' + res.correct + ' / ' + res.total + '.';
    });
  }

  // ───────────────────────── Panel C ─────────────────────────
  function buildC(panel, E) {
    var P = E.Password;
    panel.appendChild(el('div', 'note warn llm-sim-note',
      '<span class="note-tag">Private</span>This estimator runs only in your browser; nothing you type is sent anywhere or saved. Even so, <strong>do not type a password you really use</strong> — make up a similar one.'));
    panel.appendChild(el('h4', '', 'C · Why length beats complexity'));
    var pw = el('input', 'llm-text'); pw.type = 'text'; pw.autocomplete = 'off'; pw.spellcheck = false; pw.maxLength = 64; pw.value = 'P@ssw0rd!';
    var presets = el('div', 'ex-actions');
    ['123456', 'P@ssw0rd!', 'Xk7#mQ2!', 'purple-kettle-moon-ladder', 'qwertyuiop'].forEach(function (s) {
      var b = el('button', 'btn ghost small', esc(s)); b.type = 'button';
      b.addEventListener('click', function () { pw.value = s; render(); }); presets.appendChild(b);
    });
    panel.appendChild(field('A made-up password to test', pw));
    panel.appendChild(presets);
    var out = el('div', 'llm-pwout'); out.setAttribute('role', 'status'); out.setAttribute('aria-live', 'polite');
    panel.appendChild(out);
    function render() {
      var a = P.assess(pw.value);
      if (!pw.value) { out.innerHTML = '<p class="llm-muted">Type something to see the numbers.</p>'; return; }
      out.innerHTML =
        '<div class="llm-stats"><div><b>' + a.length + '</b><span>characters</span></div><div><b>' + a.pool + '</b><span>symbols the attacker must try per position (character types used)</span></div>' +
        '<div><b>' + a.bitsNaive.toFixed(1) + '</b><span>bits if every character were random</span></div></div>' +
        (a.common
          ? '<p class="llm-bad-text"><strong>Found in a list of common passwords</strong> (after undoing tricks like @→a, 0→o, trailing digits). An attacker’s dictionary tries it among the first guesses, so the length arithmetic does not apply: <strong>effectively only a few bits</strong>.</p>'
          : '<p>If it really is random, an attacker needs on average about <strong>' + a.avgGuesses.toExponential(1).replace('e+', ' × 10^') + '</strong> guesses (half of 2^' + a.bitsNaive.toFixed(0) + '). Human-chosen passwords are rarely random, so treat this as an upper bound.</p>') +
        '<div class="tbl-scroll"><table class="tbl"><thead><tr><th>Attacker setting (assumption, not a fact)</th><th>Average time to find it</th></tr></thead><tbody>' +
        '<tr><td>Stolen database, slow password hash: 10,000 guesses/s</td><td>' + a.slow + '</td></tr>' +
        '<tr><td>Stolen database, fast hash (e.g. MD5): 10 billion guesses/s</td><td>' + a.fast + '</td></tr>' +
        '<tr><td>Live login form with lockout</td><td>practically unlimited, if 2FA or lockout is on</td></tr></tbody></table></div>' +
        '<p class="llm-muted">The real time depends on how the site stores passwords (slow hashes such as bcrypt/Argon2, salt), rate limits and the attacker’s hardware, so no single number is “the” answer. The exponential growth in length is the durable part.</p>';
    }
    pw.addEventListener('input', render);
    render();

    panel.appendChild(el('h4', 'llm-h-gap', 'Same effort, very different strength'));
    var rows = [
      ['8 random characters from all 4 types (95 symbols)', P.bitsFor(8, 95), 'hard to remember, easy to mistype'],
      ['12 random lowercase letters (26 symbols)', P.bitsFor(12, 26), 'longer but only one character type'],
      ['4 random words from a 7,776-word list', P.passphraseBits(4), 'a passphrase you can actually remember'],
      ['5 random words from the same list', P.passphraseBits(5), 'add one word: ×7,776 harder'],
      ['16 random lowercase letters', P.bitsFor(16, 26), 'length keeps winning']
    ];
    panel.appendChild(el('div', 'tbl-scroll', '<table class="tbl"><thead><tr><th>Password recipe</th><th>Bits of guessing work</th><th>Comment</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r[0] + '</td><td class="mono">' + r[1].toFixed(1) + '</td><td>' + r[2] + '</td></tr>'; }).join('') + '</tbody></table>'));
    panel.appendChild(el('div', 'note tip', '<span class="note-tag">The pattern</span>Every extra bit doubles the attacker’s work. Adding <em>one character</em> multiplies the search space by the pool size; adding a symbol class only grows the pool a little. ' +
      'That is why the current NIST guidance asks for length and bans forced composition rules (see the Chapter 12.4 note). Unique passwords per site and 2FA matter even more than any of these numbers.'));
  }

  document.addEventListener('DOMContentLoaded', mount);
})();
