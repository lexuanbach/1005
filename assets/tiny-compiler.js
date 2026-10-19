/* Tiny compiler — CO1005 Chapter 8. Pure engine (no DOM).
   Compiles a small subset of C++ to the TOY Von Neumann machine of assets/vn-machine.js
   (a teaching machine, not x86 or ARM) and keeps the C++-line <-> assembly-line mapping.

   Subset (see SUPPORTED / UNSUPPORTED below, shown in the lab UI):
     int a, b = 3, c;   a = b + c * 2 - (d % 3) / 4;   -x   a += 1; a -= b; a *= 2; a /= 3; a %= 4;   i++; i--; ++i; --i;
     cin >> a >> b;   cout << a << b + 1 << endl;
     if (...) {...} else if (...) {...} else {...}     while (...) {...}     for (int i = 0; i < n; i++) {...}     do {...} while (...);
     break;  continue;  return 0;          conditions: == != < <= > >=  combined with  &&  ||  !(...)   (short-circuit, like C++)
     optional  #include / using namespace std; / int main() { ... return 0; }
   The lecture ISA has no multiply, divide or negate: * / % and unary minus are compiled to small inline loops of ADD / SUBTRACT / COMPARE / JUMP.
   Numbers: whole numbers, unbounded (the machine does not wrap at 32 bits).  Division and % truncate toward zero like C++ (so -7 / 2 = -3 and
   -7 % 2 = -1); a zero divisor jumps to a HALT labelled Ldiv0 (real C++ would crash), the interpreter reports "division by zero" at the same point.
   Pipeline: tokenize -> parse (AST) -> generate assembly (with mapping) -> assemble (vn-machine) -> run.
   interpret() is an independent reference interpreter of the AST: "what the C++ program prints".
   Backward compatibility: a program of the original subset (+ and - chains, if / else, while, == != < > <= >=) produces exactly the
   assembly text and machine words it always produced.                                                                       */
(function (global) {
  'use strict';
  var VN = (typeof module !== 'undefined' && module.exports) ? require('./vn-machine.js') : global.VNMachine;

  var LIMITS = { maxSource: 20000, maxTokens: 6000, maxCells: 256, maxBlockDepth: 24, maxExprDepth: 40, maxOperators: 200 };

  var KEYWORDS = { 'int': 1, 'cin': 1, 'cout': 1, 'endl': 1, 'if': 1, 'else': 1, 'while': 1, 'for': 1, 'do': 1, 'break': 1, 'continue': 1,
                   'return': 1, 'main': 1, 'using': 1, 'namespace': 1, 'std': 1 };
  var SUGGEST_WORDS = ['int', 'cin', 'cout', 'endl', 'if', 'else', 'while', 'for', 'do', 'break', 'continue', 'return', 'main'];
  var OTHER_TYPES = { 'float': 1, 'double': 1, 'char': 1, 'bool': 1, 'long': 1, 'short': 1, 'unsigned': 1, 'signed': 1, 'string': 1, 'auto': 1,
                      'void': 1, 'const': 1, 'static': 1, 'size_t': 1 };
  var OTHER_STMT = { 'switch': 1, 'case': 1, 'default': 1, 'goto': 1, 'struct': 1, 'class': 1, 'typedef': 1, 'new': 1, 'delete': 1, 'do_': 1, 'try': 1, 'catch': 1,
                     'throw': 1, 'namespace_': 1, 'template': 1, 'enum': 1, 'union': 1, 'sizeof': 1, 'printf': 1, 'scanf': 1, 'puts': 1, 'getline': 1 };

  /* what the lab UI lists as supported / not supported (kept next to the compiler so the two never drift apart) */
  var SUPPORTED = [
    ['Variables', 'int only: int a, b = 3, c;  (a declaration can sit anywhere, also in the header of a for loop)'],
    ['Arithmetic', '+  -  *  /  %  unary minus  and ( ) — with C++ precedence; / and % truncate toward zero'],
    ['Assignment', '=  +=  -=  *=  /=  %=  and  ++  --  as statements (i++;  --n;)'],
    ['Input / output', 'cin >> a >> b;   cout << a << b + 1 << endl;  — numbers only (one printed number per item)'],
    ['Decisions', 'if / else if / else, with == != < <= > >= and the logical operators && || !( ) (short-circuit)'],
    ['Loops', 'while, for (init; test; step), do { } while (test);  break;  continue;'],
    ['Program shape', 'bare statements, or #include / using namespace std; / int main() { ... return 0; }  — // and /* */ comments']
  ];
  var UNSUPPORTED = [
    ['Text', 'string literals such as "Sum: ", char literals such as \'a\', string / char variables — the toy machine prints numbers only'],
    ['Other types', 'double, float, bool, long, unsigned, char ... — only int (so no decimals; true / false are 1 / 0)'],
    ['Functions & libraries', 'your own functions, function calls such as abs(x) or max(a, b), #include contents'],
    ['Arrays, pointers, structs', 'int a[10], &x, *p, struct, class'],
    ['Expressions', 'comparisons or && as values (int ok = a > b;), ?:, x++ inside an expression, a = b = 0, bit operators (& | ^ ~ << >> on numbers)'],
    ['Other statements', 'switch, goto, if (x) without a comparison (write if (x != 0)), several steps in a for header (i++, j--)'],
    ['Size', 'at most ' + 20000 + ' characters, and the finished program (code + data) must fit in the 256 cells of the toy machine']
  ];

  /* error with a position: line/col are 1-based, len = how many characters to underline, hint = a friendly suggestion */
  function CompileError(line, msg, col, len, hint, tokIndex) { this.line = line; this.msg = msg; this.col = col || 0; this.len = len || 1; this.hint = hint || ''; this.tok = tokIndex === undefined ? -1 : tokIndex; }

  function lev(a, b) {                           // edit distance; swapping two neighbouring letters (itn / int) counts as one edit
    if (Math.abs(a.length - b.length) > 2) return 9;
    var d = [], i, j;
    for (i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (j = 0; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  function closest(word, cands) {
    if (word.length < 3) return null;                // one- and two-letter names: a "suggestion" would only be noise
    var best = null, bd = 99, w = word.toLowerCase();
    cands.forEach(function (c) { if (c.length < 3) return; var d = lev(w, c.toLowerCase()); if (d < bd) { bd = d; best = c; } });
    var limit = word.length <= 4 ? 1 : 2;
    return bd <= limit && best !== word ? best : null;
  }

  /* ───── 1. tokens ───── */
  var RE_ID = /[A-Za-z_]\w*/y, RE_NUM = /\d+/y;
  function tokenize(src, sink) {                 // sink (optional): array that receives the tokens as they are found, so they survive an error
    src = String(src);
    var toks = sink || [], i = 0, line = 1, lineStart = 0, n = src.length, m;
    function bad(at, len, msg, hint) { throw new CompileError(line, msg, at - lineStart + 1, len, hint); }
    function push(t, v, at, len) { toks.push({ t: t, v: v, line: line, col: at - lineStart + 1, pos: at, len: len }); }
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; lineStart = i; continue; }
      if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ') { i++; continue; }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }              // #include ...
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        var startLine = line, startCol = i - lineStart + 1, j0 = i;
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') { line++; lineStart = i + 1; } i++; }
        if (i >= n) { line = startLine; throw new CompileError(startLine, 'this comment is never closed', startCol, 2, "Add */ where the comment should end (comments that start with /* must end with */)."); }
        i += 2; continue;
      }
      RE_ID.lastIndex = i;
      if ((m = RE_ID.exec(src))) { push(KEYWORDS[m[0]] ? 'kw' : 'id', m[0], i, m[0].length); i += m[0].length; continue; }
      RE_NUM.lastIndex = i;
      if ((m = RE_NUM.exec(src))) {
        var end = i + m[0].length;
        if (src[end] === '.' && /\d/.test(src[end + 1] || '')) bad(i, end - i + 2, 'decimal numbers such as ' + m[0] + '.' + src[end + 1] + ' are outside the tiny subset', 'The toy machine stores whole numbers only. Use int and scale the value (for example work in cents instead of euros).');
        if (/[A-Za-z_]/.test(src[end] || '')) {
          var k = end; while (k < n && /\w/.test(src[k])) k++;
          bad(i, k - i, "'" + src.slice(i, k) + "' is not a valid number or name", /^0[xX]/.test(src.slice(i, k)) ? 'Hexadecimal literals are not supported: write the number in decimal.' : 'A name cannot start with a digit; a number cannot contain letters. Did you forget an operator such as * between them?');
        }
        if (m[0].length > 15) bad(i, m[0].length, 'the number ' + m[0] + ' is too large', 'Whole numbers up to 15 digits are accepted (and a real C++ int only holds up to 2147483647).');
        push('num', m[0], i, m[0].length); i = end; continue;
      }
      if (c === '"') {
        var j = i + 1; while (j < n && src[j] !== '"' && src[j] !== '\n') j++;
        push('str', src.slice(i, j + 1), i, j + 1 - i); i = j + 1; continue;
      }
      if (c === "'") {
        var q = i + 1; while (q < n && src[q] !== "'" && src[q] !== '\n') q++;
        bad(i, Math.min(q + 1, n) - i, "character literals such as " + src.slice(i, q + 1) + " are outside the tiny subset", 'There is no char type: the machine only handles whole numbers. Use the number itself (for example 97 instead of \'a\').');
      }
      var two = src.substr(i, 2);
      if (two === '<<' || two === '>>' || two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '++' || two === '--' ||
          two === '+=' || two === '-=' || two === '*=' || two === '/=' || two === '%=' || two === '&&' || two === '||') { push('op', two, i, 2); i += 2; continue; }
      if (two === '::') bad(i, 2, "'::' (the scope operator) is outside the tiny subset", 'Write using namespace std; at the top and then just cout, cin and endl.');
      if (two === '->') bad(i, 2, "'->' is outside the tiny subset", 'Pointers and structures are not supported.');
      if (c === '&') bad(i, 1, "the character '&' is outside the tiny subset", 'For "and" in a condition write && (two ampersands). Bit operations and references are not supported.');
      if (c === '|') bad(i, 1, "the character '|' is outside the tiny subset", 'For "or" in a condition write || (two bars). Bit operations are not supported.');
      if ('<>+-=*/%!'.indexOf(c) >= 0) { push('op', c, i, 1); i++; continue; }
      if (';(){},'.indexOf(c) >= 0) { push('punct', c, i, 1); i++; continue; }
      if (c === '[' || c === ']') bad(i, 1, "arrays are outside the tiny subset (found '" + c + "')", 'Use separate int variables instead of int a[10].');
      if (c === '?' || c === ':') bad(i, 1, "the tiny compiler does not understand the character '" + c + "'", 'The ?: operator is outside the subset: use if / else instead.');
      if (c === '.') bad(i, 1, "the tiny compiler does not understand the character '.'", /\d/.test(src[i + 1] || '') ? 'Decimal numbers are outside the subset: only whole numbers.' : 'Member access (a.b) and decimal points are outside the subset.');
      if (c === '“' || c === '”' || c === '‘' || c === '’') bad(i, 1, "the tiny compiler does not understand the character '" + c + "'", 'That is a typographic ("smart") quote copied from a document. Text is outside the subset anyway; delete it.');
      if (c === '−' || c === '–' || c === '—') bad(i, 1, "the tiny compiler does not understand the character '" + c + "'", 'That is not the minus sign of the keyboard. Type a plain hyphen-minus: -');
      if (c === '^' || c === '~') bad(i, 1, "the tiny compiler does not understand the character '" + c + "'", 'Bit operations and powers are outside the subset: use * in a loop, or a loop that multiplies repeatedly.');
      bad(i, 1, "the tiny compiler does not understand the character '" + c + "'", c.charCodeAt(0) > 127 ? 'Names can only use the English letters A-Z a-z, digits and _ ; accented letters and other symbols are not allowed.' : 'This character has no meaning in the subset: delete it, or check for a typo.');
    }
    return toks;
  }

  /* ───── 2. parser ───── */
  var PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };
  function exprText(e, parentPrec, right) {
    switch (e.k) {
      case 'num': return String(e.value);
      case 'var': return e.name;
      case 'neg': return '-' + exprText(e.a, 3, false);
      case 'bin':
        var pr = PREC[e.op], s = exprText(e.a, pr, false) + ' ' + e.op + ' ' + exprText(e.b, pr, true);
        return parentPrec !== undefined && (pr < parentPrec || (pr === parentPrec && right)) ? '(' + s + ')' : s;
    }
    return '?';
  }
  function condText(c, parentPrec) {            // parentPrec: 0 = top, 1 = inside ||, 2 = inside &&, 3 = inside !
    switch (c.k) {
      case 'cmp': return exprText(c.a) + ' ' + c.op + ' ' + exprText(c.b);
      case 'not': return '!(' + condText(c.a, 0) + ')';
      case 'and': { var s = condText(c.a, 2) + ' && ' + condText(c.b, 2); return parentPrec > 2 ? '(' + s + ')' : s; }
      case 'or': { var s2 = condText(c.a, 1) + ' || ' + condText(c.b, 1); return parentPrec > 1 ? '(' + s2 + ')' : s2; }
    }
    return '?';
  }
  function simpleText(n) {
    if (!n) return '';
    if (n.k === 'decl') return 'int ' + n.name + (n.expr ? ' = ' + exprText(n.expr) : '');
    if (n.k === 'assign') return n.op && n.op !== '=' ? n.name + ' ' + n.op + ' ' + exprText(n.rhs || n.expr) : n.name + ' = ' + exprText(n.expr);
    if (n.k === 'inc') return n.name + (n.delta > 0 ? '++' : '--');
    return n.k;
  }
  function nodeLabel(n) {
    switch (n.k) {
      case 'decl': return 'Declare ' + n.name + (n.expr ? ' = ' + exprText(n.expr) : '');
      case 'assign': return 'Assign ' + (n.op && n.op !== '=' ? n.name + ' ' + n.op + ' ' + exprText(n.rhs) : n.name + ' = ' + exprText(n.expr));
      case 'inc': return (n.delta > 0 ? 'Increment ' : 'Decrement ') + n.name;
      case 'in': return 'Input -> ' + n.name;
      case 'out': return 'Output ' + exprText(n.expr);
      case 'break': return 'Break (leave the loop)';
      case 'continue': return 'Continue (next round)';
      case 'return': return 'Return (end the program)';
      default: return n.k;
    }
  }
  var REL = { '==': 1, '!=': 1, '<': 1, '>': 1, '<=': 1, '>=': 1 };

  function parse(toks, hook) {                   // hook (optional): called with {node,label,line,depth} as the tree grows (pre-order for compound statements)
    var p = 0, depth = 0, sdepth = 0, edepth = 0, loopDepth = 0, inMain = false;
    var scopes = [{ vars: {}, kind: 'main' }], retired = {}, strictRetired = {}, cellsUsed = {}, infos = [], warnings = [], warned = {};
    var names = {};
    toks.forEach(function (t) { if (t.t === 'id' || t.t === 'kw') names[t.v] = 1; });

    function tokAt(i) { return toks[i]; }
    function peek() { return toks[p]; }
    function lastLine() { return toks.length ? toks[Math.min(p, toks.length - 1)].line : 1; }
    function isTok(v) { var t = toks[p]; return t && t.v === v && t.t !== 'str'; }
    function isOp(v) { var t = toks[p]; return t && t.t === 'op' && t.v === v; }
    function errTok(t, msg, hint) { return new CompileError(t.line, msg, t.col, t.len, hint, toks.indexOf(t)); }
    function errEnd(prev, msg, hint) { return prev ? new CompileError(prev.line, msg, prev.col + prev.len, 1, hint, p) : new CompileError(1, msg, 1, 1, hint, p); }
    function errHere(msg, hint) {                     // at the current token, or just after the previous one when the current token sits on a later line
      var t = toks[p], prev = toks[p - 1];
      if (!t) return errEnd(prev, msg, hint);
      if (prev && t.line > prev.line) return errEnd(prev, msg, hint);
      return errTok(t, msg, hint);
    }
    function warn(t, msg, key) {
      key = key || (t.line + ':' + t.col + msg);
      if (warned[key]) return; warned[key] = 1;
      warnings.push({ line: t.line, col: t.col, len: t.len, msg: msg });
    }
    function expect(v, why, hint) {
      if (!isTok(v)) {
        var t = toks[p];
        var h = hint || ({ ';': 'Every statement ends with a semicolon ;', ')': "Check that every '(' has a matching ')'.", '(': "Write the condition in parentheses, like while (n > 0).", '}': "Check that every '{' has a matching '}'." })[v] || '';
        throw errHere("expected '" + v + "'" + (why ? ' ' + why : '') + (t ? " but found '" + t.v + "'" : ' but the program ended'), h);
      }
      return toks[p++];
    }
    function ident() {
      var t = toks[p];
      if (!t || t.t !== 'id') {
        if (t && t.t === 'kw') throw errTok(t, "'" + t.v + "' is a C++ keyword, so it cannot be used as a variable name", 'Choose another name.');
        throw errHere('expected a variable name' + (t ? " but found '" + t.v + "'" : ''), '');
      }
      p++; return t;
    }

    /* scopes: variables of plain blocks are retired (but still usable with a warning, as before); variables of a for header are strictly scoped */
    function pushScope(kind) { scopes.push({ vars: {}, kind: kind }); }
    function popScope() {
      var s = scopes.pop();
      Object.keys(s.vars).forEach(function (nm) { if (s.kind === 'for') strictRetired[nm] = s.vars[nm]; else retired[nm] = s.vars[nm]; });
    }
    function lookup(nm) { for (var i = scopes.length - 1; i >= 0; i--) if (scopes[i].vars[nm]) return scopes[i].vars[nm]; return null; }
    function pickCell(nm) {
      if (!cellsUsed[nm]) { cellsUsed[nm] = 1; return nm; }
      for (var k = 2; ; k++) { var c = nm + '_' + k; if (!names[c] && !cellsUsed[c]) { cellsUsed[c] = 1; return c; } }
    }
    function declare(idTok, hasInit) {
      var nm = idTok.v, old = lookup(nm);
      if (old) throw errTok(idTok, "variable '" + nm + "' is declared twice",
        "'" + nm + "' already exists (declared on line " + old.line + "). Remove the 'int' to reuse it, or pick another name. (C++ lets an inner block hide an outer variable; this compiler does not, to avoid confusion.)");
      if (OTHER_TYPES[nm]) throw errTok(idTok, "'" + nm + "' is a C++ keyword and cannot be used as a variable name", 'Choose another name.');
      var info = { name: nm, cell: pickCell(nm), line: idTok.line, col: idTok.col, assigned: !!hasInit };
      scopes[scopes.length - 1].vars[nm] = info; infos.push(info);
      return info;
    }
    function varCandidates() {
      var out = [];
      for (var i = scopes.length - 1; i >= 0; i--) Object.keys(scopes[i].vars).forEach(function (k) { out.push(k); });
      return out;
    }
    function undeclared(t) {
      var nm = t.v, hint = '';
      if (nm === 'true' || nm === 'false') return errTok(t, "'" + nm + "' does not exist in this subset (there is no bool type)", 'Use 1 for true and 0 for false.');
      if (strictRetired[nm]) return errTok(t, "variable '" + nm + "' is used after the for loop that declared it", "'" + nm + "' only lives inside the for statement. Declare it before the loop (int " + nm + ";) if you need it afterwards.");
      var kw = closest(nm, SUGGEST_WORDS), vr = closest(nm, varCandidates());
      if (kw && !vr) hint = "Did you mean the keyword '" + kw + "'?";
      else if (vr) hint = "Did you mean the variable '" + vr + "'?";
      else hint = "Declare it first, for example  int " + nm + ";  (C++ is case-sensitive: n and N are different names).";
      return errTok(t, "variable '" + nm + "' is used before it is declared (the compiler would say: not declared in this scope)", hint);
    }
    function resolve(t, read) {
      var info = lookup(t.v);
      if (!info) {
        var r = retired[t.v];
        if (r) { warn(t, "'" + t.v + "' was declared inside a block that has already ended. Real C++ would reject this use ('" + t.v + "' was not declared in this scope); this teaching compiler lets it through.", 'ret:' + t.v + ':' + t.line); info = r; }
        else throw undeclared(t);
      }
      if (read && !info.assigned) warn(t, "'" + t.v + "' is read before it has been given a value. Here it starts as 0, but in real C++ it would hold an unpredictable value.", 'unassigned:' + info.cell);
      return info;
    }

    /* ── expressions ── */
    var opCount = 0;
    function enter(t) { if (++edepth > LIMITS.maxExprDepth) throw errTok(t, 'this expression is nested too deeply (limit ' + LIMITS.maxExprDepth + ' levels)', 'Split it into several statements using extra variables.'); }
    function leave() { edepth--; }
    function mkNum(value, t) { return { k: 'num', value: value, line: t.line, col: t.col }; }
    function primary() {
      var t = toks[p];
      if (!t) throw errHere('expected a value', 'An expression is a variable, a whole number, or something in ( ).');
      if (t.t === 'num') { p++; var v = parseInt(t.v, 10); if (v > 2147483647) warn(t, 'the number ' + t.v + ' does not fit in a 32-bit C++ int (the toy machine would still store it).'); return mkNum(v, t); }
      if (t.t === 'id') {
        var nx = toks[p + 1];
        if (nx && nx.v === '(' && nx.t !== 'str' && !lookup(t.v)) {
          var kw = closest(t.v, SUGGEST_WORDS);
          throw errTok(t, "function calls such as " + t.v + "(...) are outside the tiny subset",
            kw ? "Did you mean '" + kw + "'?" : (t.v === 'abs' ? 'Write the absolute value with if (x < 0) x = -x;' : t.v === 'max' || t.v === 'min' ? 'Compare with if / else instead of calling ' + t.v + '.' : 'There are no functions here; write the steps out in the program.'));
        }
        var info = resolve(t, true); p++;
        if (nx && nx.t === 'op' && (nx.v === '++' || nx.v === '--')) throw errTok(nx, "'" + t.v + nx.v + "' inside an expression is outside the tiny subset", 'Write it as its own statement: ' + t.v + nx.v + ';');
        if (nx && nx.v === '[' ) throw errTok(nx, 'arrays are outside the tiny subset', 'Use separate int variables.');
        return { k: 'var', name: t.v, ref: info, line: t.line, col: t.col };
      }
      if (t.v === '(' && t.t === 'punct') {
        p++; enter(t);
        var e = additive();
        expect(')', 'to close the parenthesis', "Check that every '(' has a matching ')'.");
        leave(); return e;
      }
      if (t.t === 'str') throw errTok(t, 'text strings are outside the tiny subset: the toy machine prints integers only', 'Print a number instead, for example  cout << x << endl;  Texts such as ' + t.v + ' cannot be printed because the machine has only numeric output.');
      if (t.t === 'op' && (t.v === '++' || t.v === '--')) throw errTok(t, "'" + t.v + "' inside an expression is outside the tiny subset", 'Write it as its own statement first, for example  ' + t.v + 'x;  and then use x.');
      if (t.v === '!' && t.t === 'op') throw errTok(t, "'!' can only be used in a condition", 'Conditions (in if, while, for) may use ! and && and ||; numbers cannot.');
      if (t.t === 'kw' && t.v === 'endl') throw errTok(t, "'endl' can only follow <<", 'For example  cout << x << endl;');
      throw errTok(t, "expected a variable or a whole number but found '" + t.v + "'", t.v === ';' || t.v === ')' ? 'Something is missing before this point: a value after an operator, or a stray operator.' : (t.t === 'op' ? 'An operator needs a value on each side; here a value is missing before ' + t.v + '.' : ''));
    }
    function unary() {
      var t = toks[p];
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
        p++; enter(t);
        var a = unary(); leave();
        if (t.v === '+') return a;
        if (a.k === 'num') return { k: 'num', value: a.value === 0 ? 0 : -a.value, line: t.line, col: t.col };
        return { k: 'neg', a: a, line: t.line, col: t.col };
      }
      return primary();
    }
    function bump(t) { if (++opCount > LIMITS.maxOperators) throw errTok(t, 'this expression has too many operators (limit ' + LIMITS.maxOperators + ')', 'Split it into several statements.'); }
    function multiplicative() {
      var l = unary();
      while (toks[p] && toks[p].t === 'op' && (toks[p].v === '*' || toks[p].v === '/' || toks[p].v === '%')) {
        var o = toks[p++]; bump(o);
        var r = unary();
        if ((o.v === '/' || o.v === '%') && r.k === 'num' && r.value === 0) warn(o, 'division by zero: this program will stop at the ' + o.v + ' (real C++ would crash or give garbage).');
        l = { k: 'bin', op: o.v, a: l, b: r, line: o.line, col: o.col };
      }
      return l;
    }
    function additive() {
      var l = multiplicative();
      while (toks[p] && toks[p].t === 'op' && (toks[p].v === '+' || toks[p].v === '-')) {
        var o = toks[p++]; bump(o);
        var r = multiplicative(), op = o.v;
        if (r.k === 'neg') { r = r.a; op = op === '+' ? '-' : '+'; }            // a - (-b)  ==  a + b
        l = { k: 'bin', op: op, a: l, b: r, line: o.line, col: o.col };
      }
      return l;
    }
    function expr() { opCount = 0; edepth = 0; var t = toks[p]; var e = additive(); e.line = t ? t.line : lastLine(); return e; }

    /* ── conditions ── */
    function cond() { opCount = 0; edepth = 0; return orCond(); }
    function orCond() {
      var l = andCond();
      while (isOp('||')) { var o = toks[p++]; bump(o); l = { k: 'or', a: l, b: andCond(), line: o.line }; }
      return l;
    }
    function andCond() {
      var l = notCond();
      while (isOp('&&')) { var o = toks[p++]; bump(o); l = { k: 'and', a: l, b: notCond(), line: o.line }; }
      return l;
    }
    function notCond() {
      var t = toks[p];
      if (t && t.t === 'op' && t.v === '!') {
        p++;
        if (!isTok('(')) throw errHere("'!' must be followed by a condition in parentheses, like !(a > b)", 'Or, simply flip the comparison (!(a > b) is the same as a <= b).');
        enter(t); var c = notCond(); leave();
        return { k: 'not', a: c, line: t.line };
      }
      if (t && t.t === 'punct' && t.v === '(') {                 // a parenthesised condition, or the start of an arithmetic expression such as (a + b) > c
        var save = p, e1 = null, res = null;
        try {
          p++; enter(t);
          var inner = orCond();
          expect(')');
          leave();
          var nx = toks[p];
          if (nx && nx.t === 'op' && (REL[nx.v] || PREC[nx.v] || nx.v === '=')) {
            var fe = errTok(nx, REL[nx.v] ? "a comparison gives true or false, so it cannot be compared again with '" + nx.v + "'" : "a comparison gives true or false, so it cannot be used in arithmetic here ('" + nx.v + "')",
              'Conditions can be combined with && and || only. To use the result of a test as a number, use if / else to choose 1 or 0.');
            fe.final = true; throw fe;
          }
          res = inner;
        } catch (e) {
          if (!(e instanceof CompileError) || e.final) throw e;
          e1 = e; res = null; edepth = 0;
        }
        if (res) return res;
        p = save;
        try { return cmpCond(); } catch (e2) {
          if (!(e2 instanceof CompileError)) throw e2;
          if (e1 && e1.tok > e2.tok) throw e1;
          throw e2;
        }
      }
      return cmpCond();
    }
    function cmpCond() {
      var first = toks[p], startIdx = p;
      var l = expr(), t = toks[p];
      if (!t || t.t !== 'op' || !REL[t.v]) {
        var hint = '', e;
        var lone = t && t.t === 'punct' && (t.v === ')' || t.v === ';') && p - 1 >= startIdx;
        if (t && t.t === 'op' && t.v === '=') hint = "Did you mean == ? A single = assigns a value; comparing needs two: a == b.";
        else if (lone) hint = "A condition must compare two values. Instead of  if (" + exprText(l) + ")  write  if (" + exprText(l) + " != 0)  — C++ treats any non-zero value as true, this compiler wants it spelled out.";
        else if (t && t.t === 'id' && (t.v === 'and' || t.v === 'or' || t.v === 'not')) hint = "Use the symbols && (and), || (or) and !( ) (not).";
        var msg = 'a condition must compare two values with == != < > <= >=' + (t ? " (found '" + t.v + "')" : '');
        if (lone) {                                    // underline the whole operand instead of the bracket after it
          var lastT = toks[p - 1], endCol = lastT.line === first.line ? lastT.col + lastT.len - first.col : first.len;
          e = new CompileError(first.line, msg, first.col, Math.max(1, endCol), hint, startIdx);
        } else e = null;
        throw e || errHere(msg, hint);
      }
      p++;
      var r = expr();
      var nx = toks[p];
      if (nx && nx.t === 'op' && REL[nx.v]) throw errTok(nx, 'a comparison cannot be chained: a < b < c does not mean what it looks like', 'Write two comparisons joined by && :  a < b && b < c');
      return { k: 'cmp', op: t.v, a: l, b: r, line: first ? first.line : t.line };
    }

    /* ── statements ── */
    function openBrace() { var t = toks[p]; p++; return t; }
    function closeBrace(open) {
      if (!isTok('}')) {
        var t = toks[p];
        throw errHere("expected '}' to close the block that started on line " + open.line + (t ? " but found '" + t.v + "'" : ' but the program ended'),
          "The '{' on line " + open.line + (t ? ' is not closed before here.' : ' is never closed: add a } at the end.'));
      }
      p++;
    }
    function body() {
      var t = toks[p];
      if (++sdepth > LIMITS.maxBlockDepth) throw errTok(t || toks[toks.length - 1], 'blocks are nested too deeply (limit ' + LIMITS.maxBlockDepth + ' levels)', 'Simplify the structure or merge conditions with && and ||.');
      var r;
      if (isTok('{')) { var open = openBrace(); pushScope('block'); r = stmts('}'); closeBrace(open); popScope(); }
      else {
        if (!t) throw errHere('expected a statement or a block { ... } here but the program ended', '');
        pushScope('block'); r = stmt(); popScope();
      }
      sdepth--; return r;
    }
    function stmts(stop) {
      var out = [];
      while (p < toks.length && !(stop && isTok(stop))) {
        var s = stmt(); Array.prototype.push.apply(out, s);
      }
      return out;
    }
    function stmt() {
      var r = stmt0();
      if (hook) r.forEach(function (n) {
        if (n.k === 'if' || n.k === 'while' || n.k === 'for' || n.k === 'dowhile' || n.k === 'endl') return;
        if (n.k === 'return' && n.trailing) return;
        hook({ node: n.k, label: nodeLabel(n), line: n.line, depth: depth });
      });
      return r;
    }
    function stmtEnd(t) { return expect(';', 'at the end of the statement'); }

    function declList(afterInt) {                  // after 'int': a, b = 3, c  (no ';')
      var out = [];
      do {
        var id = ident();
        if (isTok('(') ) throw errTok(id, 'defining functions is outside the tiny subset', 'Put the statements directly in the program (or inside int main() { ... }).');
        if (isTok('[')) throw errTok(toks[p], 'arrays are outside the tiny subset', 'Use separate int variables.');
        var e = null;
        if (isTok('=')) { p++; e = expr(); }
        var info = declare(id, !!e);
        out.push({ k: 'decl', name: id.v, ref: info, expr: e, line: id.line });
        if (isTok(',')) p++; else break;
      } while (true);
      return out;
    }
    function assignTail(idTok, info, op) {         // after 'x op': the right-hand side
      var line = idTok.line, rhs = expr();
      var t = toks[p];
      if (t && t.t === 'op' && t.v === '=') throw errTok(t, 'chained assignment (a = b = 0) is outside the tiny subset', 'Write one assignment per statement.');
      if (op === '=') { info.assigned = true; return { k: 'assign', name: idTok.v, ref: info, op: '=', expr: rhs, line: line }; }
      var base = op[0], v = { k: 'var', name: idTok.v, ref: info, line: idTok.line, col: idTok.col };
      if ((base === '/' || base === '%') && rhs.k === 'num' && rhs.value === 0) warn(idTok, 'division by zero: this program will stop at the ' + op + ' (real C++ would crash or give garbage).');
      return { k: 'assign', name: idTok.v, ref: info, op: op, rhs: rhs, expr: { k: 'bin', op: base, a: v, b: rhs, line: idTok.line, col: idTok.col }, line: line };
    }
    function simple(fromFor) {                      // assignment / compound assignment / ++ -- (no ';'); returns a node
      var t = toks[p];
      if (t.t === 'op' && (t.v === '++' || t.v === '--')) {
        p++; var id = ident(); var info = resolve(id, true);
        return { k: 'inc', name: id.v, ref: info, delta: t.v === '++' ? 1 : -1, line: t.line };
      }
      var idt = ident(), nx = toks[p];
      if (!nx) throw errEnd(idt, "expected '=' in an assignment but the program ended", '');
      if (nx.t === 'op' && (nx.v === '++' || nx.v === '--')) { p++; var inf = resolve(idt, true); return { k: 'inc', name: idt.v, ref: inf, delta: nx.v === '++' ? 1 : -1, line: idt.line }; }
      if (nx.t === 'op' && (nx.v === '=' || nx.v === '+=' || nx.v === '-=' || nx.v === '*=' || nx.v === '/=' || nx.v === '%=')) {
        p++;
        var inf2 = resolve(idt, nx.v !== '=');
        return assignTail(idt, inf2, nx.v);
      }
      resolve(idt, false);
      var hint = '';
      if (nx.t === 'op' && nx.v === '==') hint = "'==' compares two values; to store a value use a single '='.";
      else if (nx.t === 'op' && (PREC[nx.v] || REL[nx.v])) hint = 'A statement that only computes a value does nothing. To keep the result, assign it:  ' + idt.v + ' = ' + idt.v + ' ' + nx.v + ' ...;';
      else if (nx.t === 'punct' && nx.v === '[') hint = 'Arrays are outside the subset.';
      throw errHere("expected '=' in an assignment but found '" + nx.v + "'", hint);
    }

    function stmt0() {
      var t = toks[p];
      if (!t) return [];
      var line = t.line, out = [];
      if (t.t === 'kw') {
        switch (t.v) {
          case 'int':
            if (toks[p + 1] && toks[p + 1].v === 'main') throw errTok(toks[p + 1], "'main' can only appear once, at the very start of the program", 'Write the statements inside a single int main() { ... }.');
            p++;
            out = declList();
            expect(';', 'at the end of the declaration');
            return out;
          case 'cin':
            p++;
            if (!isOp('>>')) throw errHere("expected '>>'" + (toks[p] ? " but found '" + toks[p].v + "'" : ' but the program ended'), toks[p] && toks[p].v === '<<' ? 'cin reads with >> (into the variable); cout prints with <<.' : 'Write  cin >> a >> b;');
            p++;
            do {
              var v = ident(), vi = resolve(v, false); vi.assigned = true;
              if (isTok('[')) throw errTok(toks[p], 'arrays are outside the tiny subset', 'Use separate int variables.');
              out.push({ k: 'in', name: v.v, ref: vi, line: line });
              if (isOp('>>')) p++; else break;
            } while (true);
            expect(';', 'at the end of the statement');
            return out;
          case 'cout':
            p++;
            if (!isOp('<<')) throw errHere("expected '<<'" + (toks[p] ? " but found '" + toks[p].v + "'" : ' but the program ended'), toks[p] && toks[p].v === '>>' ? 'cout prints with <<; cin reads with >>.' : 'Write  cout << x << endl;');
            p++;
            do {
              if (isTok('endl')) { p++; out.push({ k: 'endl', line: line }); }
              else out.push({ k: 'out', expr: expr(), line: line });
              if (isOp('<<')) p++; else break;
            } while (true);
            var nt = toks[p];
            if (nt && nt.t === 'op' && (REL[nt.v] || nt.v === '>>')) throw errTok(nt, "'" + nt.v + "' cannot follow a value printed with cout", nt.v === '>>' ? 'cin uses >>, cout uses <<.' : 'To print the result of a comparison, use an if / else that prints 1 or 0.');
            expect(';', 'at the end of the statement');
            return out;
          case 'if': {
            p++; expect('(', 'after if'); var c = cond();
            if (isOp('=')) throw errTok(toks[p], "a condition must compare two values with == != < > <= >= (found '=')", 'Did you mean == ? A single = assigns a value.');
            expect(')', 'after the condition');
            if (hook) hook({ node: 'if', label: 'If ' + condText(c, 0), line: line, depth: depth });
            depth++;
            var th = body(), el = null;
            if (isTok('else')) { p++; el = body(); }
            depth--;
            return [{ k: 'if', cond: c, then: [].concat(th), else: el ? [].concat(el) : null, line: line }];
          }
          case 'while': {
            p++; expect('(', 'after while'); var c2 = cond(); expect(')', 'after the condition');
            if (isTok(';')) { /* while (c);  -> an empty loop body, allowed but suspicious */ warn(toks[p], 'this semicolon ends the while loop: its body is empty. Did you mean to write a { block } here?'); }
            if (hook) hook({ node: 'while', label: 'While ' + condText(c2, 0), line: line, depth: depth });
            depth++; loopDepth++;
            var wb = [].concat(body());
            loopDepth--; depth--;
            return [{ k: 'while', cond: c2, body: wb, line: line }];
          }
          case 'do': {
            p++;
            if (hook) hook({ node: 'do', label: 'Do ... while (test at the bottom)', line: line, depth: depth });
            depth++; loopDepth++;
            var db = [].concat(body());
            loopDepth--; depth--;
            if (!isTok('while')) throw errHere("expected 'while' after the body of do" + (toks[p] ? " but found '" + toks[p].v + "'" : ' but the program ended'), 'A do-loop looks like:  do { ... } while (condition);');
            p++; expect('(', 'after while'); var dc = cond(); expect(')', 'after the condition'); expect(';', 'after do ... while (...)', 'A do-while ends with a semicolon:  } while (n > 0);');
            return [{ k: 'dowhile', cond: dc, body: db, line: line }];
          }
          case 'for': {
            p++; expect('(', 'after for');
            pushScope('for');
            var init = [], fc = null, step = [];
            if (!isTok(';')) {
              if (isTok('int')) { p++; init = declList(); }
              else if (toks[p] && (toks[p].t === 'id' || (toks[p].t === 'op' && (toks[p].v === '++' || toks[p].v === '--')))) init = [simple(true)];
              else throw errHere('the first part of a for loop must be a declaration (int i = 0), an assignment, or empty', 'Example:  for (int i = 0; i < n; i++)');
              if (isTok(',')) throw errTok(toks[p], 'only one expression is allowed in each part of a for header here', 'Declare several variables with  int i = 0, j = 5  or move the extra work into the body.');
            }
            expect(';', 'after the first part of the for header', 'A for header has three parts separated by ;  —  for (int i = 0; i < n; i++)');
            if (!isTok(';')) fc = cond();
            expect(';', 'after the test of the for header', 'A for header has three parts separated by ;  —  for (int i = 0; i < n; i++)');
            if (!isTok(')')) {
              if (toks[p] && (toks[p].t === 'id' || (toks[p].t === 'op' && (toks[p].v === '++' || toks[p].v === '--')))) step = [simple(true)];
              else throw errHere('the last part of a for loop must be a step such as i++ or i = i + 2, or empty', 'Example:  for (int i = 0; i < n; i++)');
              if (isTok(',')) throw errTok(toks[p], 'only one step is allowed in a for header here', 'Move the second step into the body of the loop.');
            }
            expect(')', 'to close the for header');
            if (hook) hook({ node: 'for', label: 'For ' + init.map(simpleText).join(', ') + '; ' + (fc ? condText(fc, 0) : '') + '; ' + step.map(simpleText).join(', '), line: line, depth: depth });
            depth++; loopDepth++;
            var fb = [].concat(body());
            loopDepth--; depth--;
            popScope();
            return [{ k: 'for', init: init, cond: fc, step: step, body: fb, line: line }];
          }
          case 'break': case 'continue': {
            p++;
            if (!loopDepth) throw errTok(t, "'" + t.v + "' only makes sense inside a loop (while, for or do-while)", 'Remove it, or put it inside the loop body.');
            expect(';', 'after ' + t.v);
            return [{ k: t.v, line: line }];
          }
          case 'return': {
            p++;
            if (toks[p] && toks[p].t === 'num') p++;
            else if (toks[p] && !isTok(';')) throw errHere("'return' can only be followed by a number here", 'The value is ignored; write  return 0;');
            expect(';');
            var nxt = toks[p];
            var trailing = !nxt || (inMain && sdepth === 0 && nxt.v === '}' && nxt.t === 'punct');
            return [{ k: 'return', trailing: trailing, line: line }];
          }
          case 'else': throw errTok(t, "'else' without a matching 'if'", 'An else must come right after the } of an if block (or after the single statement of the if).');
          case 'endl': throw errTok(t, "'endl' can only follow <<", 'For example  cout << x << endl;');
          case 'using': throw errTok(t, "'using namespace std;' must be the first statement of the program", '');
          case 'main': case 'namespace': case 'std': throw errTok(t, "the tiny compiler does not know how to start a statement with '" + t.v + "'", t.v === 'std' ? 'Write using namespace std; once at the top and then just cout / cin.' : '');
        }
      }
      if (t.t === 'id') {
        var nx = toks[p + 1];
        if (OTHER_TYPES[t.v] && !lookup(t.v)) {
          if (t.v === 'string' || t.v === 'char') throw errTok(t, "'" + t.v + "' variables are outside the tiny subset", 'Only int exists here: the toy machine works with whole numbers only.');
          throw errTok(t, "only 'int' variables exist in this subset ('" + t.v + "' is not supported)", t.v === 'double' || t.v === 'float' ? 'There are no decimal numbers; scale the values to whole numbers (cents instead of euros).' : t.v === 'bool' ? 'Use an int that holds 1 (true) or 0 (false).' : 'Use int.');
        }
        if (OTHER_STMT[t.v] && !lookup(t.v)) throw errTok(t, "'" + t.v + "' is outside the tiny subset", t.v === 'switch' || t.v === 'case' || t.v === 'default' ? 'Use if / else if / else instead.' : t.v === 'printf' || t.v === 'scanf' || t.v === 'puts' ? 'Use cout << ...; and cin >> ...;' : t.v === 'goto' ? 'Use loops (while / for) with break and continue instead.' : 'See the list of supported statements below the editor.');
        if (nx && nx.t === 'punct' && nx.v === '(' && !lookup(t.v)) {
          var kw = closest(t.v, SUGGEST_WORDS);
          throw errTok(t, kw ? "'" + t.v + "' is not a statement the compiler knows" : "function calls such as " + t.v + "(...) are outside the tiny subset", kw ? "Did you mean '" + kw + "'?" : 'There are no functions here.');
        }
        if (!lookup(t.v) && !retired[t.v] && nx && !(nx.t === 'op' && (nx.v === '=' || nx.v === '+=' || nx.v === '-=' || nx.v === '*=' || nx.v === '/=' || nx.v === '%=' || nx.v === '++' || nx.v === '--'))) {
          var kw2 = closest(t.v, SUGGEST_WORDS);
          if (kw2) throw errTok(t, "the tiny compiler does not know how to start a statement with '" + t.v + "'", "Did you mean '" + kw2 + "'?");
        }
        if (nx && nx.t === 'op' && (nx.v === '<<' || nx.v === '>>') && !lookup(t.v)) {
          var kw3 = closest(t.v, ['cin', 'cout']);
          throw errTok(t, "the tiny compiler does not know how to start a statement with '" + t.v + "'", kw3 ? "Did you mean '" + kw3 + "'?" : 'Declare it first, or use cin / cout.');
        }
        var n = simple(false);
        expect(';', n.k === 'inc' ? 'at the end of the statement' : 'at the end of the statement');
        return [n];
      }
      if (t.t === 'op' && (t.v === '++' || t.v === '--')) { var n2 = simple(false); expect(';', 'at the end of the statement'); return [n2]; }
      if (t.t === 'num') throw errTok(t, "a statement cannot start with the number " + t.v, 'A bare value does nothing. Did you mean to assign it to a variable, or print it with cout?');
      if (t.t === 'str') throw errTok(t, 'text strings are outside the tiny subset: the toy machine prints integers only', 'Print a number instead, for example  cout << x << endl;');
      if (t.v === '{' && t.t === 'punct') {
        if (++sdepth > LIMITS.maxBlockDepth) throw errTok(t, 'blocks are nested too deeply (limit ' + LIMITS.maxBlockDepth + ' levels)', '');
        var open = openBrace(); pushScope('block'); var inner = stmts('}'); closeBrace(open); popScope(); sdepth--; return inner;
      }
      if (t.v === ';' && t.t === 'punct') { p++; return []; }
      if (t.v === '}' && t.t === 'punct') throw errTok(t, "the tiny compiler does not know how to start a statement with '}'", "This '}' closes nothing: there is one '}' too many (or a '{' is missing above).");
      throw errTok(t, "the tiny compiler does not know how to start a statement with '" + t.v + "'", t.v === ')' ? "There is a ')' too many." : '');
    }

    // optional boilerplate
    if (isTok('using')) { p++; expect('namespace'); expect('std'); expect(';'); }
    var list;
    if (isTok('int') && toks[p + 1] && toks[p + 1].v === 'main') {
      p += 2; expect('('); if (isTok('void')) p++; expect(')'); inMain = true;
      if (!isTok('{')) throw errHere("expected '{' but found " + (toks[p] ? "'" + toks[p].v + "'" : 'the end of the program'), 'The body of main starts with {');
      var mopen = openBrace(); list = stmts('}'); closeBrace(mopen);
      if (p < toks.length) throw errTok(toks[p], 'unexpected text after the end of main()', 'Everything must be inside int main() { ... }.');
    } else {
      var t0 = toks[p];
      if (t0 && t0.t === 'id' && t0.v === 'void' && toks[p + 1] && toks[p + 1].v === 'main') throw errTok(t0, "main must be declared as 'int main()'", 'Write  int main() { ... return 0; }');
      list = stmts(null);
    }
    return { k: 'program', body: list, warnings: warnings, infos: infos, names: names };
  }

  /* ───── 3. code generation ───── */
  var NEG_JUMP = { '>': 'JUMPLE', '<': 'JUMPGE', '==': 'JUMPNEQ', '!=': 'JUMPEQ', '>=': 'JUMPLT', '<=': 'JUMPGT' };
  var POS_JUMP = { '>': 'JUMPGT', '<': 'JUMPLT', '==': 'JUMPEQ', '!=': 'JUMPNEQ', '>=': 'JUMPGE', '<=': 'JUMPLE' };
  var EXPLAIN = {
    'while': 'A while loop becomes: a test at the top that jumps OUT when the condition is false, the body, and a JUMP back up to the test.',
    'for': 'A for loop is a while loop with its parts in a fixed order: init once, test at the top (jump out when false), body, step, then JUMP back to the test.',
    'dowhile': 'A do-while runs the body first; the test sits at the bottom and jumps BACK to the top while the condition is true.',
    'if': 'An if becomes COMPARE plus a conditional jump that skips the then-part when the condition is false.',
    'logic': '&& and || short-circuit like C++: && leaves as soon as one test is false, || as soon as one is true, so the second test may never run.',
    'mul': 'The lecture ISA has no MULTIPLY. a * b becomes a small loop: add a to a running total b times (after making b positive).',
    'div': 'The lecture ISA has no DIVIDE. a / b subtracts b from a until what is left is smaller than b, counting the subtractions. A zero divisor jumps to a HALT.',
    'mod': 'The lecture ISA has no DIVIDE or MOD. a % b subtracts b from a until what is left is smaller than b; the leftover is the remainder.',
    'mulcall': 'This * is a call: the two numbers go into _ma and _mb, a return number into _mret, then JUMP to the shared multiply routine at the end of the program. The ISA has no CALL or RET, so the routine finds its way back by comparing _mret.',
    'divcall': 'This / or % is a call: the numbers go into _da and _db, a return number into _dret, then JUMP to the shared divide routine at the end of the program. The ISA has no CALL or RET.',
    'mulsub': 'The shared multiply routine (every * jumps here): repeated addition, then it compares _mret with each return number to jump back to the right place.',
    'divsub': 'The shared divide routine (every / and % jumps here): repeated subtraction gives the quotient in _dq and the remainder in _da, then it jumps back to the right place.',
    'inc': 'i++ and i-- are one instruction each: the ISA has INCREMENT and DECREMENT, which work on a memory cell directly.',
    'neg': 'There is no negate instruction: -x is computed as 0 - x.',
    'jump': 'break jumps to the label after the loop; continue jumps to the loop test (or to the step of a for loop).',
    'return': 'return before the end of the program becomes a JUMP to the final HALT.'
  };

  function generate(ast, gopts) {
    var shared = !!(gopts && gopts.shared), mulRets = [], divRets = [];
    function free0(nm) { var t = (ast.names || {}); while (t[nm]) nm += '_'; return nm; }
    var code = [], consts = {}, constOrder = [], labelN = 0, scratch = {}, scratchOrder = [], vars = [];
    var taken = ast.names || {}, HALT_L = free0('Lhalt'), DIV0_L = free0('Ldiv0'), tmpDepth = 0, loops = [], needHalt = false, needDiv0 = false, grp = { name: '', explain: '', pending: false };
    function reserved(n) { var u = n.toUpperCase(); return !!(VN.OPS.some(function (o) { return o.name === u; }) || VN.PSEUDO[u]); }
    function an(info) { var c = info.cell; return reserved(c) ? c + '_' : c; }
    function free(nm) { while (taken[nm]) nm += '_'; return nm; }
    function L(base, id) { return free(base + id); }
    function emit(text, cline, comment, kind) {
      var l = { text: text, cline: cline, comment: comment || '', kind: kind || 'code' };
      if (grp.name) { l.group = grp.name; if (grp.pending) { l.explain = grp.explain; grp.pending = false; } }
      code.push(l); return l;
    }
    var grpStack = [];
    function tag(name, quiet) { grpStack.push(grp); grp = { name: name, explain: EXPLAIN[name] || '', pending: !!EXPLAIN[name] && !quiet }; }
    function untag() { grp = grpStack.pop() || { name: '', explain: '', pending: false }; }
    function label(name, cline) { emit(name + ':', cline, '', 'label'); }
    function constName(v) {
      var nm = v < 0 ? '_m' + (-v) : '_' + v;
      if (!(nm in consts)) { consts[nm] = { v: v, cell: free(nm) }; constOrder.push(nm); }
      return consts[nm].cell;
    }
    function sc(base, comment) {                       // internal scratch cell (temporaries and the multiply / divide work cells)
      if (!(base in scratch)) { scratch[base] = { cell: free(base), comment: comment }; scratchOrder.push(base); }
      return scratch[base].cell;
    }
    function tmpBase(i) { return i === 0 ? '_t' : '_t' + (i + 1); }
    function allocTmp() { return sc(tmpBase(tmpDepth++), 'scratch cell'); }
    function freeTmp() { tmpDepth--; }
    function isAtom(e) { return e.k === 'num' || e.k === 'var'; }
    function operand(t) { return t.k === 'var' ? an(t.ref) : constName(t.value); }
    function desc(e) { return exprText(e); }
    function isSum(e) { return isAtom(e) || (e.k === 'bin' && (e.op === '+' || e.op === '-') && isSum(e.a) && isSum(e.b)); }

    function evalR(e, cline) {                         // leaves the value of e in R
      switch (e.k) {
        case 'num': case 'var': emit('LOAD ' + operand(e), cline, 'R = ' + desc(e)); return;
        case 'neg':
          tag('neg');
          if (isAtom(e.a)) { emit('LOAD ' + constName(0), cline, 'R = 0'); emit('SUBTRACT ' + operand(e.a), cline, 'R = 0 - ' + desc(e.a)); }
          else { evalR(e.a, cline); var tn = allocTmp(); emit('STORE ' + tn, cline, 'temporary'); emit('LOAD ' + constName(0), cline, 'R = 0'); emit('SUBTRACT ' + tn, cline, 'R = 0 - (' + desc(e.a) + ')'); freeTmp(); }
          untag(); return;
        case 'bin':
          if (e.op === '+' || e.op === '-') {
            var ins = e.op === '+' ? 'ADD ' : 'SUBTRACT ';
            if (isAtom(e.b)) { evalR(e.a, cline); emit(ins + operand(e.b), cline, 'R = R ' + e.op + ' ' + desc(e.b)); }
            else if (e.op === '+' && isAtom(e.a)) { evalR(e.b, cline); emit('ADD ' + operand(e.a), cline, 'R = R + ' + desc(e.a)); }      // + commutes: no temporary needed
            else {
              evalR(e.b, cline); var t = allocTmp(); emit('STORE ' + t, cline, 'temporary (right-hand side)');
              evalR(e.a, cline); emit(ins + t, cline, 'R = R ' + e.op + ' (' + desc(e.b) + ')'); freeTmp();
            }
            return;
          }
          var spilled = 0;
          function cellOf(x) {
            if (isAtom(x)) return operand(x);
            evalR(x, cline); var tc = allocTmp(); spilled++; emit('STORE ' + tc, cline, 'temporary'); return tc;
          }
          var swap = e.op === '*' && e.a.k === 'num' && e.a.value > 0 && !(e.b.k === 'num' && e.b.value > 0);    // 3 * n: use the positive constant as the counter (no sign test needed)
          var lc = cellOf(swap ? e.b : e.a), rc = cellOf(swap ? e.a : e.b);
          if (e.op === '*') mulRoutine(lc, rc, cline, e, swap);
          else divRoutine(e.op, lc, rc, cline, e);
          while (spilled--) freeTmp();
          return;
      }
    }

    /* a * b by repeated addition (see the comments the compiler writes into the assembly) */
    function callSite(kind, rets, args, cline, e, swap) {
      var k = rets.length + 1, back = L('Lret' + kind, k), retCell = sc(kind === 'mul' ? '_mret' : '_dret', kind === 'mul' ? 'multiply: which call site to return to' : 'divide: which call site to return to');
      tag(kind + 'call');
      emit('LOAD ' + args[0][1], cline, kind === 'mul' ? 'call multiply: R = ' + desc(swap ? e.b : e.a) : 'call ' + (e.op === '/' ? 'divide' : 'remainder') + ': R = ' + desc(e.a));
      emit('STORE ' + args[0][0], cline, 'first number');
      emit('LOAD ' + args[1][1], cline, 'R = ' + desc(swap ? e.a : e.b));
      emit('STORE ' + args[1][0], cline, 'second number');
      emit('LOAD ' + constName(k), cline, 'return number ' + k);
      emit('STORE ' + retCell, cline, 'remember where to come back to');
      emit('JUMP ' + (kind === 'mul' ? 'Lmulsub' : 'Ldivsub'), cline, 'call the shared routine');
      label(back, cline);
      rets.push({ k: k, back: back });
      untag();
    }
    function mulRoutine(lc, rc, cline, e, swap) {
      if (shared) {
        callSite('mul', mulRets, [[sc('_ma', 'multiply: the number that is added again and again'), lc], [sc('_mb', 'multiply: how many times is left'), rc]], cline, e, swap);
        sc('_mr', 'multiply: running total');
        tag('mulcall'); grp.pending = false; emit('LOAD _mr', cline, 'R = ' + desc(e.a) + ' * ' + desc(e.b)); untag();
        return;
      }
      var id = ++labelN, ma = sc('_ma', 'multiply: the number that is added again and again'), mb = sc('_mb', 'multiply: how many times is left'), mr = sc('_mr', 'multiply: running total'), z = constName(0);
      var loop = L('Lmul', id), done = L('Lmulx', id), da = desc(swap ? e.b : e.a), db = desc(swap ? e.a : e.b), whole = desc(e.a) + ' * ' + desc(e.b);
      var counterE = swap ? e.a : e.b, positive = counterE.k === 'num' && counterE.value > 0;
      tag('mul');
      emit('LOAD ' + lc, cline, 'multiply ' + whole + ': R = ' + da);
      emit('STORE ' + ma, cline, 'multiplicand = ' + da);
      emit('LOAD ' + rc, cline, 'R = ' + db);
      emit('STORE ' + mb, cline, 'counter = ' + db + ' (how many times to add)');
      emit('CLEAR ' + mr, cline, 'total = 0');
      if (!positive) {
        emit('LOAD ' + z, cline, 'R = 0');
        emit('COMPARE ' + mb, cline, 'is the counter bigger / equal / smaller than 0?');
        emit('JUMPGT ' + loop, cline, 'counter > 0: start adding');
        emit('JUMPEQ ' + done, cline, 'counter = 0: the product is 0');
        emit('LOAD ' + z, cline, 'counter < 0: use -counter times -multiplicand');
        emit('SUBTRACT ' + mb, cline, 'R = 0 - counter');
        emit('STORE ' + mb, cline, 'counter = -counter');
        emit('LOAD ' + z, cline, 'R = 0');
        emit('SUBTRACT ' + ma, cline, 'R = 0 - multiplicand');
        emit('STORE ' + ma, cline, 'multiplicand = -multiplicand');
      }
      label(loop, cline);
      emit('LOAD ' + mr, cline, 'R = total');
      emit('ADD ' + ma, cline, 'R = total + multiplicand');
      emit('STORE ' + mr, cline, 'total = R');
      emit('DECREMENT ' + mb, cline, 'counter = counter - 1');
      emit('LOAD ' + z, cline, 'R = 0');
      emit('COMPARE ' + mb, cline, 'is the counter bigger / equal / smaller than 0?');
      emit('JUMPGT ' + loop, cline, 'counter > 0: add once more');
      label(done, cline);
      emit('LOAD ' + mr, cline, 'R = ' + whole);
      untag();
    }
    /* a / b and a % b by repeated subtraction; signs are handled so the result truncates toward zero like C++ */
    function divRoutine(op, lc, rc, cline, e) {
      if (shared) {
        needDiv0 = true;
        callSite('div', divRets, [[sc('_da', 'divide: what is left of the dividend'), lc], [sc('_db', 'divide: the divisor (made positive)'), rc]], cline, e);
        var res0 = op === '/' ? sc('_dq', 'divide: the quotient so far') : '_da';
        tag('divcall'); grp.pending = false; emit('LOAD ' + res0, cline, 'R = ' + desc(e.a) + ' ' + op + ' ' + desc(e.b)); untag();
        return;
      }
      var id = ++labelN, isDiv = op === '/', name = isDiv ? 'div' : 'mod', z = constName(0), one = constName(1);
      var da = sc('_da', 'divide: what is left of the dividend'), db = sc('_db', 'divide: the divisor (made positive)'), dn = sc('_dn', 'divide: sign counter');
      var dq = isDiv ? sc('_dq', 'divide: the quotient so far') : null;
      var bpos = L('Ldivb', id), apos = L('Ldiva', id), loop = L('Ldiv', id), done = L('Ldivx', id), fin = L('Ldivs', id);
      var sa = desc(e.a), sb = desc(e.b), dd = sa + ' ' + op + ' ' + sb;
      var literalPos = e.b.k === 'num' && e.b.value > 0;
      tag(name);
      emit('LOAD ' + lc, cline, dd + ': R = ' + sa);
      emit('STORE ' + da, cline, 'dividend = ' + sa);
      emit('LOAD ' + rc, cline, 'R = ' + sb);
      emit('STORE ' + db, cline, 'divisor = ' + sb);
      if (isDiv) emit('CLEAR ' + dq, cline, 'quotient = 0');
      emit('CLEAR ' + dn, cline, 'sign counter = 0');
      if (!literalPos) {
        needDiv0 = true;
        emit('LOAD ' + z, cline, 'R = 0');
        emit('COMPARE ' + db, cline, 'is the divisor bigger / equal / smaller than 0?');
        emit('JUMPEQ ' + DIV0_L, cline, 'divisor = 0: division by zero, the program stops');
        emit('JUMPGT ' + bpos, cline, 'divisor > 0: fine as it is');
        emit('LOAD ' + z, cline, 'divisor < 0: make it positive');
        emit('SUBTRACT ' + db, cline, 'R = 0 - divisor');
        emit('STORE ' + db, cline, 'divisor = -divisor');
        if (isDiv) emit('INCREMENT ' + dn, cline, 'remember one minus sign');
        label(bpos, cline);
      }
      emit('LOAD ' + z, cline, 'R = 0');
      emit('COMPARE ' + da, cline, 'is the dividend bigger / equal / smaller than 0?');
      emit('JUMPGE ' + loop, cline, 'dividend >= 0: fine as it is');
      emit('LOAD ' + z, cline, 'dividend < 0: make it positive');
      emit('SUBTRACT ' + da, cline, 'R = 0 - dividend');
      emit('STORE ' + da, cline, 'dividend = -dividend');
      emit('INCREMENT ' + dn, cline, 'remember a minus sign');
      label(loop, cline);
      emit('LOAD ' + db, cline, 'R = divisor');
      emit('COMPARE ' + da, cline, 'is what is left bigger / equal / smaller than the divisor?');
      emit('JUMPLT ' + done, cline, 'left < divisor: stop subtracting');
      emit('LOAD ' + da, cline, 'R = what is left');
      emit('SUBTRACT ' + db, cline, 'R = left - divisor');
      emit('STORE ' + da, cline, 'left = R');
      if (isDiv) emit('INCREMENT ' + dq, cline, 'quotient = quotient + 1');
      emit('JUMP ' + loop, cline, 'subtract again');
      label(done, cline);
      var res = isDiv ? dq : da;
      emit('LOAD ' + one, cline, 'R = 1');
      emit('COMPARE ' + dn, cline, 'exactly one minus sign?');
      emit('JUMPNEQ ' + fin, cline, isDiv ? 'no: the quotient is positive' : 'no: the remainder is positive');
      emit('LOAD ' + z, cline, isDiv ? 'signs differ: negate the quotient' : 'the dividend was negative: so is the remainder');
      emit('SUBTRACT ' + res, cline, 'R = 0 - ' + (isDiv ? 'quotient' : 'remainder'));
      emit('STORE ' + res, cline, (isDiv ? 'quotient' : 'remainder') + ' = R');
      label(fin, cline);
      emit('LOAD ' + res, cline, 'R = ' + dd);
      untag();
    }

    /* conditions */
    function cmpEmit(c, cline) {                        // sets the flags: compares c.a with c.b
      var spilled = null;
      if (!isAtom(c.a)) { evalR(c.a, cline); spilled = allocTmp(); emit('STORE ' + spilled, cline, 'temporary (left side of the comparison)'); }
      if (isAtom(c.b)) emit('LOAD ' + operand(c.b), cline, 'R = ' + desc(c.b)); else evalR(c.b, cline);
      emit('COMPARE ' + (spilled || operand(c.a)), cline, 'is ' + desc(c.a) + ' bigger / equal / smaller than R?');
      if (spilled) freeTmp();
    }
    function branch(c, T, F, cline) {                   // T / F: label to jump to when true / false; null = fall through
      switch (c.k) {
        case 'cmp':
          cmpEmit(c, cline);
          var d = condText(c);
          if (F && !T) emit(NEG_JUMP[c.op] + ' ' + F, cline, 'condition (' + d + ') false -> skip');
          else if (T && !F) emit(POS_JUMP[c.op] + ' ' + T, cline, 'condition (' + d + ') true -> jump');
          else { emit(POS_JUMP[c.op] + ' ' + T, cline, 'condition (' + d + ') true -> jump'); emit('JUMP ' + F, cline, 'condition false -> jump'); }
          return;
        case 'not': branch(c.a, F, T, cline); return;
        case 'and':
          if (F) { branch(c.a, null, F, cline); branch(c.b, T, F, cline); }
          else { var ida = ++labelN, skip = L('Land', ida); branch(c.a, null, skip, cline); branch(c.b, T, null, cline); label(skip, cline); }
          return;
        case 'or':
          if (T) { branch(c.a, T, null, cline); branch(c.b, T, F, cline); }
          else { var ido = ++labelN, ok = L('Lor', ido); branch(c.a, ok, null, cline); branch(c.b, null, F, cline); label(ok, cline); }
          return;
      }
    }
    function compound(c) { return c.k === 'and' || c.k === 'or' || (c.k === 'not' && compound(c.a)); }
    function branchTagged(c, T, F, cline) {
      var cp = compound(c);
      if (cp) tag('logic');
      branch(c, T, F, cline);
      if (cp) untag();
    }

    function block(list) { list.forEach(stmt); }
    function stmt(s) {
      switch (s.k) {
        case 'decl':
          vars.push(s);
          if (s.expr) { evalR(s.expr, s.line); emit('STORE ' + an(s.ref), s.line, s.name + ' = R'); }
          break;
        case 'assign':
          evalR(s.expr, s.line); emit('STORE ' + an(s.ref), s.line, s.name + ' = R'); break;
        case 'inc':
          tag('inc'); emit((s.delta > 0 ? 'INCREMENT ' : 'DECREMENT ') + an(s.ref), s.line, s.name + ' = ' + s.name + (s.delta > 0 ? ' + 1' : ' - 1') + '  (a single instruction)'); untag(); break;
        case 'in': emit('IN ' + an(s.ref), s.line, 'read a number into ' + s.name); break;
        case 'endl': break;
        case 'out':
          if (isAtom(s.expr)) emit('OUT ' + operand(s.expr), s.line, 'print ' + desc(s.expr));
          else { evalR(s.expr, s.line); var t = sc('_t', 'scratch cell'); emit('STORE ' + t, s.line, 'temporary'); emit('OUT ' + t, s.line, isSum(s.expr) ? 'print the sum' : 'print the result'); }
          break;
        case 'if':
          var id = ++labelN;
          tag('if');
          if (s.else) {
            branchTagged(s.cond, null, L('Lelse', id), s.line); untag();
            block(s.then);
            emit('JUMP ' + L('Lend', id), s.line, 'skip the else-part');
            label(L('Lelse', id), s.line);
            block(s.else);
            label(L('Lend', id), s.line);
          } else {
            branchTagged(s.cond, null, L('Lend', id), s.line); untag();
            block(s.then);
            label(L('Lend', id), s.line);
          }
          break;
        case 'while':
          var w = ++labelN, fr = { brk: L('Lexit', w), cont: L('Ltop', w), usedBrk: false, usedCont: false };
          tag('while'); label(L('Ltop', w), s.line);
          branchTagged(s.cond, null, L('Lexit', w), s.line); untag();
          loops.push(fr); block(s.body); loops.pop();
          tag('while', true);
          emit('JUMP ' + L('Ltop', w), s.line, 'go back and test again');
          label(L('Lexit', w), s.line);
          untag();
          break;
        case 'dowhile':
          var dw = ++labelN, dfr = { brk: L('Lexit', dw), cont: L('Lcond', dw), usedBrk: false, usedCont: false };
          tag('dowhile'); label(L('Ltop', dw), s.line); untag();
          loops.push(dfr); block(s.body); loops.pop();
          tag('dowhile', true);
          if (dfr.usedCont) label(dfr.cont, s.line);
          branchTagged(s.cond, L('Ltop', dw), null, s.line);
          if (dfr.usedBrk) label(dfr.brk, s.line);
          untag();
          break;
        case 'for':
          var fid = ++labelN, ffr = { brk: L('Lexit', fid), cont: L('Lstep', fid), usedBrk: false, usedCont: false };
          tag('for');
          block(s.init);
          label(L('Ltop', fid), s.line);
          if (s.cond) branchTagged(s.cond, null, L('Lexit', fid), s.line);
          untag();
          loops.push(ffr); block(s.body); loops.pop();
          tag('for', true);
          if (ffr.usedCont) label(ffr.cont, s.line);
          block(s.step);
          emit('JUMP ' + L('Ltop', fid), s.line, 'go back and test again');
          label(L('Lexit', fid), s.line);
          untag();
          break;
        case 'break': { var bl = loops[loops.length - 1]; bl.usedBrk = true; tag('jump'); emit('JUMP ' + bl.brk, s.line, 'break: leave the loop'); untag(); break; }
        case 'continue': { var cl = loops[loops.length - 1]; cl.usedCont = true; tag('jump'); emit('JUMP ' + cl.cont, s.line, 'continue: next round'); untag(); break; }
        case 'return': if (!s.trailing) { needHalt = true; tag('return'); emit('JUMP ' + HALT_L, s.line, 'return: jump to the end of the program'); untag(); } break;
      }
    }

    function dispatch(rets, retCell) {                // the ISA has no RET: compare the saved return number with each call site's number
      var z = retCell;
      emit('LOAD ' + retCell, 0, 'which call site called me?');
      rets.forEach(function (r, i) {
        if (i === rets.length - 1) emit('JUMP ' + r.back, 0, 'return to call site ' + r.k);
        else { emit('COMPARE ' + constName(r.k), 0, 'is it call site ' + r.k + '?'); emit('JUMPEQ ' + r.back, 0, 'yes: return there'); }
      });
    }
    function emitSharedRoutines() {
      var z = constName(0), one = constName(1), i;
      if (mulRets.length) {
        var ma = sc('_ma'), mb = sc('_mb'), mr = sc('_mr'), mret = sc('_mret');
        tag('mulsub'); label('Lmulsub', 0);
        emit('CLEAR ' + mr, 0, 'total = 0');
        emit('LOAD ' + z, 0, 'R = 0');
        emit('COMPARE ' + mb, 0, 'is the counter bigger / equal / smaller than 0?');
        emit('JUMPGT Lmulloop', 0, 'counter > 0: start adding');
        emit('JUMPEQ Lmulend', 0, 'counter = 0: the product is 0');
        emit('LOAD ' + z, 0, 'counter < 0: use -counter times -multiplicand');
        emit('SUBTRACT ' + mb, 0, 'R = 0 - counter');
        emit('STORE ' + mb, 0, 'counter = -counter');
        emit('LOAD ' + z, 0, 'R = 0');
        emit('SUBTRACT ' + ma, 0, 'R = 0 - multiplicand');
        emit('STORE ' + ma, 0, 'multiplicand = -multiplicand');
        label('Lmulloop', 0);
        emit('LOAD ' + mr, 0, 'R = total');
        emit('ADD ' + ma, 0, 'R = total + multiplicand');
        emit('STORE ' + mr, 0, 'total = R');
        emit('DECREMENT ' + mb, 0, 'counter = counter - 1');
        emit('LOAD ' + z, 0, 'R = 0');
        emit('COMPARE ' + mb, 0, 'is the counter bigger / equal / smaller than 0?');
        emit('JUMPGT Lmulloop', 0, 'counter > 0: add once more');
        label('Lmulend', 0);
        dispatch(mulRets, mret);
        untag();
      }
      if (divRets.length) {
        var da = sc('_da'), db = sc('_db'), dq = sc('_dq', 'divide: the quotient so far'), dn = sc('_dn', 'divide: sign counter'), ds = sc('_ds', 'divide: 1 when the dividend was negative'), dret = sc('_dret');
        tag('divsub'); label('Ldivsub', 0);
        emit('CLEAR ' + dq, 0, 'quotient = 0');
        emit('CLEAR ' + dn, 0, 'sign counter = 0');
        emit('CLEAR ' + ds, 0, 'dividend-was-negative flag = 0');
        emit('LOAD ' + z, 0, 'R = 0');
        emit('COMPARE ' + db, 0, 'is the divisor bigger / equal / smaller than 0?');
        emit('JUMPEQ ' + DIV0_L, 0, 'divisor = 0: division by zero, the program stops');
        emit('JUMPGT Ldivb', 0, 'divisor > 0: fine as it is');
        emit('LOAD ' + z, 0, 'divisor < 0: make it positive');
        emit('SUBTRACT ' + db, 0, 'R = 0 - divisor');
        emit('STORE ' + db, 0, 'divisor = -divisor');
        emit('INCREMENT ' + dn, 0, 'remember one minus sign');
        label('Ldivb', 0);
        emit('LOAD ' + z, 0, 'R = 0');
        emit('COMPARE ' + da, 0, 'is the dividend bigger / equal / smaller than 0?');
        emit('JUMPGE Ldivloop', 0, 'dividend >= 0: fine as it is');
        emit('LOAD ' + z, 0, 'dividend < 0: make it positive');
        emit('SUBTRACT ' + da, 0, 'R = 0 - dividend');
        emit('STORE ' + da, 0, 'dividend = -dividend');
        emit('INCREMENT ' + dn, 0, 'remember a minus sign');
        emit('INCREMENT ' + ds, 0, 'and that the dividend was negative');
        label('Ldivloop', 0);
        emit('LOAD ' + db, 0, 'R = divisor');
        emit('COMPARE ' + da, 0, 'is what is left bigger / equal / smaller than the divisor?');
        emit('JUMPLT Ldivdone', 0, 'left < divisor: stop subtracting');
        emit('LOAD ' + da, 0, 'R = what is left');
        emit('SUBTRACT ' + db, 0, 'R = left - divisor');
        emit('STORE ' + da, 0, 'left = R');
        emit('INCREMENT ' + dq, 0, 'quotient = quotient + 1');
        emit('JUMP Ldivloop', 0, 'subtract again');
        label('Ldivdone', 0);
        emit('LOAD ' + one, 0, 'R = 1');
        emit('COMPARE ' + dn, 0, 'exactly one minus sign?');
        emit('JUMPNEQ Ldivq', 0, 'no: the quotient is positive');
        emit('LOAD ' + z, 0, 'signs differ: negate the quotient');
        emit('SUBTRACT ' + dq, 0, 'R = 0 - quotient');
        emit('STORE ' + dq, 0, 'quotient = R');
        label('Ldivq', 0);
        emit('LOAD ' + one, 0, 'R = 1');
        emit('COMPARE ' + ds, 0, 'was the dividend negative?');
        emit('JUMPNEQ Ldivr', 0, 'no: the remainder is positive');
        emit('LOAD ' + z, 0, 'yes: the remainder is negative too');
        emit('SUBTRACT ' + da, 0, 'R = 0 - remainder');
        emit('STORE ' + da, 0, 'remainder = R');
        label('Ldivr', 0);
        dispatch(divRets, dret);
        untag();
      }
    }
    // gather constants/vars via a dry run
    block(ast.body);
    if (needHalt) label(HALT_L, 0);
    emit('HALT', 0, 'end of program');
    if (needDiv0) { label(DIV0_L, 0); emit('HALT', 0, 'division by zero: the program stops here'); code.div0 = DIV0_L; }
    if (shared) emitSharedRoutines();
    emit('.data', 0, '', 'dir');
    vars.forEach(function (v) { var l = emit(an(v.ref) + ': 0', v.line || 0, 'int ' + v.name + (v.ref.cell !== v.name ? ' (another variable called ' + v.name + ')' : '') + ' (starts at 0 here; real C++ leaves it undefined)', 'data'); l.dtype = 'var'; });
    constOrder.forEach(function (c) { var l = emit(consts[c].cell + ': ' + consts[c].v, 0, 'constant ' + consts[c].v + ' — this ISA has no immediate operands, so it lives in a cell', 'data'); l.dtype = 'const'; });
    scratchOrder.forEach(function (b) { var l = emit(scratch[b].cell + ': 0', 0, scratch[b].comment, 'data'); l.dtype = 'scratch'; });
    return code;
  }

  function asmText(lines) {
    return lines.map(function (l) {
      var body = l.kind === 'code' ? '        ' + l.text : l.text;
      if (l.comment) body = (body + '                              ').slice(0, Math.max(body.length, 30)) + ' ; ' + l.comment;
      return body;
    }).join('\n') + '\n';
  }

  /* how many memory cells will the program need?  (pseudo-jumps JUMPGE / JUMPLE take two words) */
  function sizeInfo(lines) {
    var words = 0, data = 0, vars = 0, consts = 0, scratch = 0, ops = { mul: 0, div: 0, mod: 0 };
    lines.forEach(function (l) {
      if (l.kind === 'code') {
        words += /^JUMP(GE|LE)\b/.test(l.text) ? 2 : 1;
        if (l.explain) { var g = l.group === 'mulcall' ? 'mul' : l.group === 'divcall' ? (/remainder/.test(l.text + l.comment) ? 'mod' : 'div') : l.group; if (ops[g] !== undefined) ops[g]++; }
      } else if (l.kind === 'data') { data++; if (l.dtype === 'var') vars++; else if (l.dtype === 'const') consts++; else scratch++; }
    });
    return { words: words, data: data, total: words + data, vars: vars, consts: consts, scratch: scratch, mul: ops.mul, div: ops.div, mod: ops.mod };
  }
  function sizeError(lines) {
    var si = sizeInfo(lines);
    if (si.total <= LIMITS.maxCells) return null;
    var budget = LIMITS.maxCells - si.data, acc = 0, errLine = 0, lastLine = 0, i;
    for (i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (l.kind !== 'code') continue;
      acc += /^JUMP(GE|LE)\b/.test(l.text) ? 2 : 1;
      if (l.cline) lastLine = l.cline;
      if (acc > budget) { errLine = l.cline || lastLine; break; }
    }
    if (!errLine) for (i = lines.length - 1; i >= 0; i--) if (lines[i].kind === 'data' && lines[i].cline) { errLine = lines[i].cline; break; }
    if (!errLine) for (i = lines.length - 1; i >= 0; i--) if (lines[i].cline) { errLine = lines[i].cline; break; }
    var parts = [], per = lines.shared ? ['about 10 words per call', 'about 10 words per call', 'about 10 words per call'] : ['about 25 words each', 'about 33 words each', 'about 31 words each'];
    if (si.mul) parts.push(si.mul + ' multiplication' + (si.mul > 1 ? 's' : '') + ' (' + per[0] + ')');
    if (si.div) parts.push(si.div + ' division' + (si.div > 1 ? 's' : '') + ' (' + per[1] + ')');
    if (si.mod) parts.push(si.mod + ' remainder operation' + (si.mod > 1 ? 's' : '') + ' (' + per[2] + ')');
    return { line: errLine, col: 0, len: 0,
      msg: 'the program needs ' + si.total + ' memory cells (' + si.words + ' instruction words + ' + si.data + ' data cells: ' + si.vars + ' variables, ' + si.consts + ' constants, ' + si.scratch + ' scratch cells) but the toy machine has at most ' + LIMITS.maxCells,
      hint: 'There is no stack and every statement needs its own instruction words.' + (parts.length ? ' This program contains ' + parts.join(', ') + (lines.shared ? ' plus the shared routines (about 70 words)' : '') + ': * / % have no instruction, so each is expanded into a loop.' : '') + ' Use fewer variables, fewer constants, fewer * / % or shorter code. The first statement that does not fit is marked.' };
  }

  /* inline loops are easier to read, but each * / % costs 25-33 words; when the inline version does not fit in 256 cells the compiler
     switches (for the whole program) to one shared routine per operation, entered with a JUMP and left through a compare ladder */
  function genAuto(ast, mode) {                       // mode: undefined / 'auto' | true (always shared) | false (never)
    var lines = generate(ast, { shared: mode === true });
    lines.shared = mode === true;
    if (mode === true || mode === false) return lines;
    if (sizeError(lines) && lines.some(function (l) { return l.group === 'mul' || l.group === 'div' || l.group === 'mod'; })) {
      var alt = generate(ast, { shared: true }); alt.shared = true;
      if (sizeInfo(alt).total < sizeInfo(lines).total) return alt;
    }
    return lines;
  }

  /* ───── 4. top level ───── */
  function limitError(src) {
    if (src.length > LIMITS.maxSource) return { line: 1, col: 1, len: 1, msg: 'the program is too long: ' + src.length + ' characters (the limit is ' + LIMITS.maxSource + ')', hint: 'The toy machine only has 256 memory cells anyway, so no program that big could ever fit.' };
    return null;
  }
  function stage(e) { return { line: e.line, col: e.col || 0, len: e.len || 1, msg: e.msg, hint: e.hint || '' }; }

  function compile(src, copts) {
    src = String(src);
    var res = { ok: false, errors: [], warnings: [], tokens: [], ast: null, asmLines: [], asmText: '', asm: null, stats: null };
    var le = limitError(src);
    if (le) { res.errors = [le]; return res; }
    try {
      res.tokens = tokenize(src);
      if (res.tokens.length > LIMITS.maxTokens) { var tk = res.tokens[LIMITS.maxTokens]; throw new CompileError(tk.line, 'the program has too many tokens (limit ' + LIMITS.maxTokens + ')', tk.col, tk.len, 'Shorten the program.'); }
      res.ast = parse(res.tokens);
      res.warnings = res.ast.warnings || [];
      res.asmLines = genAuto(res.ast, copts && copts.shared);
      res.asmText = asmText(res.asmLines);
      var se = sizeError(res.asmLines);
      if (se) { res.errors = [se]; return res; }
      res.asm = VN.assemble(res.asmText);
      if (!res.asm.ok) res.errors = res.asm.errors.map(function (e) { return { line: 0, msg: 'assembler: ' + e.msg + (e.line ? ' (assembly line ' + e.line + ')' : '') }; });
      else {
        res.ok = true;
        var si = sizeInfo(res.asmLines);
        res.stats = { tokens: res.tokens.length, instructions: res.asm.codeLen, dataCells: si.data, cells: res.asm.size, used: si.total, statements: countStmts(res.ast.body), shared: !!res.asmLines.shared };
        if (res.asmLines.shared && !(copts && copts.shared === true)) res.warnings = res.warnings.concat([{ line: 0, col: 0, len: 0, msg: 'The multiply / divide loops did not fit inline in 256 cells, so this program uses ONE shared copy of each routine (entered with JUMP, left through a compare ladder: the ISA has no CALL / RET).' }]);
      }
    } catch (e) {
      if (e instanceof CompileError) res.errors = [stage(e)];
      else throw e;
    }
    return res;
  }
  function countStmts(list) {
    var n = 0;
    (list || []).forEach(function (s) { n++; if (s.then) n += countStmts(s.then); if (s.else) n += countStmts(s.else); if (s.body) n += countStmts(s.body); });
    return n;
  }

  // mapping: assembled word -> C++ line
  function mapping(res) {
    return res.asm.listing.map(function (w) {
      var l = res.asmLines[w.line - 1];
      return { addr: w.addr, word: w.word, asm: w.text, cline: l ? l.cline : 0, part: w.part, of: w.of };
    });
  }
  // address -> C++ line (0 = none), for highlighting the source line the CPU is executing
  function lineOfAddr(res) {
    var map = {};
    res.asm.listing.forEach(function (w) { var l = res.asmLines[w.line - 1]; map[w.addr] = l ? l.cline : 0; });
    return map;
  }

  /* reference interpreter: what the C++ program prints, one integer per output item */
  function interpret(ast, input, opts) {
    var vars = {}, out = [], inPos = 0, steps = 0, limit = (opts && opts.maxSteps) || 200000, err = null, maxAbs = 0;
    var DIVZ = { divzero: true };
    function ev(e) {
      switch (e.k) {
        case 'num': return e.value;
        case 'var': return vars[e.ref.cell] || 0;
        case 'neg': return 0 - ev(e.a);
        case 'bin':
          var a = ev(e.a), b = ev(e.b), v = 0;
          switch (e.op) {
            case '+': v = a + b; break;
            case '-': v = a - b; break;
            case '*': v = a * b + 0; break;
            case '/': if (b === 0) throw DIVZ; v = Math.trunc(a / b) + 0; break;
            case '%': if (b === 0) throw DIVZ; v = (a % b) + 0; break;
          }
          if (v > maxAbs || -v > maxAbs) maxAbs = Math.abs(v);
          return v;
      }
      return 0;
    }
    function test(c) {
      switch (c.k) {
        case 'cmp':
          var a = ev(c.a), b = ev(c.b);
          switch (c.op) { case '>': return a > b; case '<': return a < b; case '==': return a === b; case '!=': return a !== b; case '>=': return a >= b; case '<=': return a <= b; }
          return false;
        case 'not': return !test(c.a);
        case 'and': return test(c.a) && test(c.b);
        case 'or': return test(c.a) || test(c.b);
      }
      return false;
    }
    // run() returns 0 = normal, 1 = break, 2 = continue, 3 = stop (return or error)
    function run(list) {
      for (var i = 0; i < list.length; i++) {
        if (err) return 3;
        if (++steps > limit) { err = 'too many steps (infinite loop?)'; return 3; }
        var s = list[i], r;
        switch (s.k) {
          case 'decl': vars[s.ref.cell] = s.expr ? ev(s.expr) : 0; break;
          case 'assign': vars[s.ref.cell] = ev(s.expr); break;
          case 'inc': vars[s.ref.cell] = (vars[s.ref.cell] || 0) + s.delta; break;
          case 'in': if (inPos >= input.length) { err = 'cin ran out of input'; return 3; } vars[s.ref.cell] = input[inPos++]; break;
          case 'out': out.push(ev(s.expr)); break;
          case 'if': r = test(s.cond) ? run(s.then) : (s.else ? run(s.else) : 0); if (r) return r; break;
          case 'while':
            while (test(s.cond) && !err) {
              r = run(s.body); if (r === 1) break; if (r === 3) return 3;
              if (++steps > limit) { err = 'too many steps (infinite loop?)'; return 3; }
            }
            break;
          case 'dowhile':
            do {
              r = run(s.body); if (r === 1) break; if (r === 3) return 3;
              if (++steps > limit) { err = 'too many steps (infinite loop?)'; return 3; }
            } while (test(s.cond) && !err);
            break;
          case 'for':
            r = run(s.init); if (r) return r;
            while ((!s.cond || test(s.cond)) && !err) {
              r = run(s.body); if (r === 1) break; if (r === 3) return 3;
              r = run(s.step); if (r) return r;
              if (++steps > limit) { err = 'too many steps (infinite loop?)'; return 3; }
            }
            break;
          case 'break': return 1;
          case 'continue': return 2;
          case 'return': return 3;
        }
        if (err) return 3;
      }
      return 0;
    }
    try { run(ast.body); } catch (e) { if (e === DIVZ) err = 'division by zero'; else throw e; }
    return { out: out, error: err, vars: vars, maxAbs: maxAbs };
  }

  // convenience: compile + run on the toy machine
  function runCompiled(res, input, maxInstr) {
    var st = VN.create(res.asm, { input: input || [], maxInstr: maxInstr || 20000 });
    VN.run(st);
    return st;
  }
  // did the machine stop at the HALT that follows a zero divisor?
  function stoppedAtDivZero(res, st) {
    var nm = res && res.asmLines && res.asmLines.div0;
    return !!(nm && res.asm && st && st.halted && res.asm.symbols && res.asm.symbols[nm] !== undefined && st.cur && st.cur.at === res.asm.symbols[nm]);
  }

  function astOutline(ast) {
    var lines = [];
    function ex(e) { return exprText(e); }
    function walk(list, ind) {
      list.forEach(function (s) {
        var pad = new Array(ind + 1).join('  ');
        switch (s.k) {
          case 'decl': lines.push(pad + 'Declare ' + s.name + (s.expr ? ' = ' + ex(s.expr) : '')); break;
          case 'assign': lines.push(pad + 'Assign ' + s.name + (s.op && s.op !== '=' ? ' ' + s.op + ' ' + ex(s.rhs) : ' ← ' + ex(s.expr))); break;
          case 'inc': lines.push(pad + (s.delta > 0 ? 'Increment ' : 'Decrement ') + s.name); break;
          case 'in': lines.push(pad + 'Input → ' + s.name); break;
          case 'out': lines.push(pad + 'Output ' + ex(s.expr)); break;
          case 'endl': lines.push(pad + 'Newline (ignored by the toy machine)'); break;
          case 'break': lines.push(pad + 'Break'); break;
          case 'continue': lines.push(pad + 'Continue'); break;
          case 'return': if (!s.trailing) lines.push(pad + 'Return'); break;
          case 'if': lines.push(pad + 'If ' + condText(s.cond, 0)); lines.push(pad + '  then:'); walk(s.then, ind + 2); if (s.else) { lines.push(pad + '  else:'); walk(s.else, ind + 2); } break;
          case 'while': lines.push(pad + 'While ' + condText(s.cond, 0)); lines.push(pad + '  do:'); walk(s.body, ind + 2); break;
          case 'dowhile': lines.push(pad + 'Do'); walk(s.body, ind + 2); lines.push(pad + 'While ' + condText(s.cond, 0)); break;
          case 'for':
            lines.push(pad + 'For'); lines.push(pad + '  init:'); walk(s.init, ind + 2);
            lines.push(pad + '  test: ' + (s.cond ? condText(s.cond, 0) : '(always true)'));
            lines.push(pad + '  step:'); walk(s.step, ind + 2); lines.push(pad + '  do:'); walk(s.body, ind + 2); break;
        }
      });
    }
    walk(ast.body, 0);
    return lines.join('\n');
  }


  /* ───── 5. pure event trace ─────
     trace(source, opts) -> { ok, failedAt, error, events, res }
     events are the ordered artefacts that move through the toolchain; the animated views (assets/compiler-flow.js) are driven from them.
       {stage:'source',  kind:'source',  lines, text}
       {stage:'lexer',   kind:'token',   index, type, v, line, col}      then  'done' {count}   or  'error' {line,col,msg,hint}
       {stage:'parser',  kind:'node',    node, label, depth, line}  then  'done' {count}   or  'error' {line,col,msg,hint}
       {stage:'codegen', kind:'asm',     index, text, cline, comment, lineKind, group?, explain?}  then 'done' {count}
       {stage:'assembler', kind:'word',  addr, word, cell:'code'|'data', text, cline, bits, hex}  then 'done' {words} or 'error' {msg}
       {stage:'loader',  kind:'load',    cells, size}
       {stage:'cpu',     kind:'instr',   n, at, cline, op, arg, text, pc, r, gt, eq, lt, reads, writes, input, out, micros}  ...  'done' {reason, instrCount, out, finalMem, pc, r, truncated, divzero}
     failedAt: null | 'lexer' | 'parser' | 'assembler'.  The cpu stage runs only when opts.input (array) is given; opts.record (default 400) caps recorded instructions. */
  function trace(source, opts) {
    opts = opts || {};
    var events = [], failedAt = null, error = null;
    function push(stage, kind, o) { var e = { stage: stage, kind: kind }; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) e[k] = o[k]; events.push(e); return e; }
    function fail(stage, e) { failedAt = stage; error = { stage: stage, line: e.line || 0, col: e.col || 0, len: e.len || 1, msg: e.msg, hint: e.hint || '' }; push(stage, 'error', { line: e.line || 0, col: e.col || 0, len: e.len || 1, msg: e.msg, hint: e.hint || '' }); }
    function out() { return { ok: failedAt === null, failedAt: failedAt, error: error, events: events, res: compile(source, { shared: opts.shared }) }; }
    source = String(source);
    push('source', 'source', { lines: source.split('\n').length, text: source });
    var le = limitError(source);
    if (le) { fail('lexer', le); return out(); }

    var toks = [], ast = null;
    try { tokenize(source, toks); } catch (e) { if (!(e instanceof CompileError)) throw e; error = e; }
    toks.forEach(function (t, i) { push('lexer', 'token', { index: i, type: t.t, v: t.v, line: t.line, col: t.col }); });
    if (error) { var le2 = error; error = null; fail('lexer', le2); return out(); }
    if (toks.length > LIMITS.maxTokens) { fail('lexer', { line: toks[LIMITS.maxTokens].line, col: toks[LIMITS.maxTokens].col, msg: 'the program has too many tokens (limit ' + LIMITS.maxTokens + ')', hint: 'Shorten the program.' }); return out(); }
    push('lexer', 'done', { count: toks.length });

    var nodes = 0, pe = null;
    try { ast = parse(toks, function (n) { nodes++; push('parser', 'node', n); }); } catch (e) { if (!(e instanceof CompileError)) throw e; pe = e; }
    if (pe) { fail('parser', pe); return out(); }
    push('parser', 'done', { count: nodes });

    var lines = genAuto(ast, opts.shared);
    lines.forEach(function (l, i) { var ev = { index: i, text: l.text, cline: l.cline, comment: l.comment, lineKind: l.kind }; if (l.group) ev.group = l.group; if (l.explain) ev.explain = l.explain; push('codegen', 'asm', ev); });
    push('codegen', 'done', { count: lines.length });

    var se = sizeError(lines);
    if (se) { fail('assembler', se); return out(); }
    var asm = VN.assemble(asmText(lines));
    if (!asm.ok) { fail('assembler', { line: 0, msg: 'assembler: ' + asm.errors[0].msg }); return out(); }
    var byAddr = {}, nWords = 0;
    asm.listing.forEach(function (w) { var l = lines[w.line - 1]; byAddr[w.addr] = { text: w.text, cline: l ? l.cline : 0 }; });
    for (var a = 0; a < asm.size; a++) {
      var c = asm.cells[a];
      if (c.kind === 'free') continue;
      var info = c.kind === 'code' ? byAddr[a] : { text: (asm.names[a] || '') + ' = ' + asm.mem[a], cline: lines[c.line - 1] ? lines[c.line - 1].cline : 0 };
      push('assembler', 'word', { addr: a, word: asm.mem[a], cell: c.kind, text: info ? info.text : '', cline: info ? info.cline : 0,
                                  bits: VN.bits(asm.mem[a], asm.addrBits), hex: VN.hex(asm.mem[a], asm.addrBits) });
      nWords++;
    }
    push('assembler', 'done', { words: nWords });
    push('loader', 'load', { cells: nWords, size: asm.size });

    if (opts.input) {
      var st = VN.create(asm, { input: opts.input, maxInstr: opts.maxInstr || 20000 }), cap = opts.record || 400, n = 0, guard = 0;
      while (!st.halted && !st.error && !st.waiting && guard++ < st.maxInstr + 5) {
        if (n >= cap) {                                   // past the recorded window: run at full speed, nothing to record
          if (!VN.stepInstr(st)) break;
          n++; continue;
        }
        var micros = [], reads = [], writes = [], outLen = st.out.length, inPos = st.inPos, m;
        do {
          m = VN.stepMicro(st);
          if (!m) break;
          micros.push({ phase: m.phase, label: m.label, flow: (m.flow || []).map(function (p) { return p.slice(); }), text: m.text });
          if (st.lastRead !== null) reads.push(st.lastRead);
          if (st.lastWrite !== null) writes.push({ addr: st.lastWrite, value: st.mem[st.lastWrite] });
        } while (st.queue.length && !st.error);
        if (!micros.length) break;
        n++;
        if (st.cur) {
          push('cpu', 'instr', { n: n, at: st.cur.at, cline: byAddr[st.cur.at] ? byAddr[st.cur.at].cline : 0, op: st.cur.op.name, arg: st.cur.op.arg ? st.cur.addr : null,
            text: st.cur.op.arg ? st.cur.op.name + ' ' + st.cur.addr : st.cur.op.name,
            pc: st.pc, r: st.r, gt: st.gt, eq: st.eq, lt: st.lt, reads: reads, writes: writes,
            input: st.inPos > inPos ? st.input[st.inPos - 1] : null, out: st.out.length > outLen ? st.out[st.out.length - 1] : null, micros: micros });
        }
      }
      push('cpu', 'done', { reason: st.error ? 'error' : st.waiting ? 'waiting' : st.halted ? 'halt' : 'limit', error: st.error, instrCount: st.instrCount,
        out: st.out.slice(), finalMem: st.mem.slice(), pc: st.pc, r: st.r, gt: st.gt, eq: st.eq, lt: st.lt, truncated: n > cap,
        divzero: !!(st.halted && st.cur && lines.div0 && asm.symbols[lines.div0] !== undefined && st.cur.at === asm.symbols[lines.div0]) });
    }
    return out();
  }

  /* the five original examples (kept exactly: the exercises and the test suites refer to them by key).  The full catalogue is in assets/tc-examples.js */
  var PRESETS = [
    { key: 'sum', name: 'Sum of 1..N (while loop)', input: '5',
      src: 'int n, sum = 0, i = 1;\ncin >> n;\nwhile (i <= n) {\n    sum = sum + i;\n    i = i + 1;\n}\ncout << sum << endl;\n' },
    { key: 'max', name: 'Larger of two numbers (if / else)', input: '8 3',
      src: 'int a, b;\ncin >> a >> b;\nif (a > b) {\n    cout << a << endl;\n} else {\n    cout << b << endl;\n}\n' },
    { key: 'add', name: 'A = B + C (straight line)', input: '',
      src: 'int a, b = 5, c = 7;\na = b + c;\ncout << a << endl;\n' },
    { key: 'countdown', name: 'Countdown from N', input: '4',
      src: 'int n;\ncin >> n;\nwhile (n > 0) {\n    cout << n << endl;\n    n = n - 1;\n}\n' },
    { key: 'gcd', name: 'Greatest common divisor (Euclid, by subtraction)', input: '48 18',
      src: 'int a, b;\ncin >> a >> b;\nwhile (a != b) {\n    if (a > b) {\n        a = a - b;\n    } else {\n        b = b - a;\n    }\n}\ncout << a << endl;\n' }
  ];

  var TC = { tokenize: tokenize, parse: parse, generate: generate, compile: compile, mapping: mapping, lineOfAddr: lineOfAddr, interpret: interpret,
             runCompiled: runCompiled, stoppedAtDivZero: stoppedAtDivZero, astOutline: astOutline, trace: trace, PRESETS: PRESETS,
             LIMITS: LIMITS, SUPPORTED: SUPPORTED, UNSUPPORTED: UNSUPPORTED, CompileError: CompileError, exprText: exprText, condText: condText, sizeInfo: sizeInfo };
  if (typeof module !== 'undefined' && module.exports) module.exports = TC;
  else global.TinyCompiler = TC;
})(typeof window !== 'undefined' ? window : this);
