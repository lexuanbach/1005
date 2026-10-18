/* SQL Query Lab — a small, dependency-free SQL engine (pure, no DOM).
   Chapter 10 · Databases.  Exported for Node tests; the UI lives in sql-lab-ui.js.

   Supported: CREATE/DROP TABLE, ALTER TABLE (ADD/DROP COLUMN, ADD FOREIGN KEY), CREATE/DROP INDEX
   (one column), INSERT (VALUES / SELECT), UPDATE, DELETE, SELECT with DISTINCT, WHERE, GROUP BY, HAVING,
   ORDER BY, LIMIT/OFFSET, aggregates, INNER / LEFT / comma joins and sub-queries (scalar, IN, EXISTS).
   Constraints: PRIMARY KEY, NOT NULL, UNIQUE, DEFAULT, CHECK, FOREIGN KEY (ON DELETE RESTRICT/CASCADE/SET NULL).
   Every query reports a plan and counts the rows it had to read (full scan versus index lookup). */
(function (root) {
  'use strict';

  class SqlError extends Error {
    constructor(message) { super(message); this.name = 'SqlError'; }
  }
  const fail = (msg) => { throw new SqlError(msg); };

  /* ---------------------------------------------------------------- tokens */
  const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'GROUP', 'BY', 'HAVING', 'ORDER', 'ASC', 'DESC', 'LIMIT',
    'OFFSET', 'DISTINCT', 'ALL', 'AS', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'EXISTS', 'JOIN',
    'INNER', 'LEFT', 'OUTER', 'ON', 'CROSS', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE',
    'INDEX', 'UNIQUE', 'DROP', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'CHECK', 'DEFAULT', 'CONSTRAINT', 'CASCADE',
    'RESTRICT', 'EXPLAIN', 'TRUE', 'FALSE', 'ALTER', 'ADD', 'COLUMN', 'IF']);
  const UNSUPPORTED = {
    UNION: 'UNION / INTERSECT / EXCEPT (combining two SELECTs) is not supported in this lab.',
    INTERSECT: 'UNION / INTERSECT / EXCEPT (combining two SELECTs) is not supported in this lab.',
    EXCEPT: 'UNION / INTERSECT / EXCEPT (combining two SELECTs) is not supported in this lab.',
    WITH: 'WITH (common table expressions) is not supported in this lab. Use a sub-query in WHERE instead.',
    OVER: 'Window functions (OVER ...) are not supported in this lab.',
    CASE: 'CASE ... WHEN ... END is not supported in this lab.',
    RIGHT: 'RIGHT JOIN is not supported in this lab. Swap the two tables and use LEFT JOIN.',
    FULL: 'FULL JOIN is not supported in this lab.',
    NATURAL: 'NATURAL JOIN is not supported in this lab. Write the join condition with ON.',
    USING: 'JOIN ... USING is not supported in this lab. Write the join condition with ON.',
    TRIGGER: 'Triggers are not supported in this lab.',
    VIEW: 'Views are not supported in this lab.',
    BEGIN: 'Transactions (BEGIN / COMMIT / ROLLBACK) are not supported in this lab. Every statement saves immediately.',
    COMMIT: 'Transactions (BEGIN / COMMIT / ROLLBACK) are not supported in this lab. Every statement saves immediately.',
    ROLLBACK: 'Transactions (BEGIN / COMMIT / ROLLBACK) are not supported in this lab. Every statement saves immediately.',
    PRAGMA: 'PRAGMA is a SQLite-only command and is not supported in this lab.',
    REPLACE: 'REPLACE is not supported in this lab. Use UPDATE or INSERT.',
    CAST: 'CAST is not supported in this lab.',
    GLOB: 'GLOB is not supported in this lab. Use LIKE.',
    REGEXP: 'REGEXP is not supported in this lab. Use LIKE.',
    ESCAPE: 'LIKE ... ESCAPE is not supported in this lab.',
    TRUNCATE: 'TRUNCATE is not supported in this lab. Use DELETE FROM table.',
    GRANT: 'GRANT / REVOKE (the DCL commands) are not supported in this lab: there is only one user.',
    REVOKE: 'GRANT / REVOKE (the DCL commands) are not supported in this lab: there is only one user.',
    DATABASE: 'CREATE DATABASE is not supported here: use the dataset menu to switch databases.'
  };
  const SELECT_WORDS = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'HAVING', 'ORDER BY', 'LIMIT', 'INSERT', 'UPDATE',
    'DELETE', 'CREATE', 'VALUES', 'JOIN', 'DISTINCT', 'BETWEEN', 'LIKE', 'DROP', 'ALTER', 'EXPLAIN'];

  function tokenize(sql) {
    const toks = [];
    let i = 0;
    const n = sql.length;
    while (i < n) {
      const c = sql[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '-' && sql[i + 1] === '-') { while (i < n && sql[i] !== '\n') i++; continue; }
      if (c === '/' && sql[i + 1] === '*') {
        const e = sql.indexOf('*/', i + 2);
        if (e < 0) fail('A /* comment is never closed with */.');
        i = e + 2; continue;
      }
      const pos = i;
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(sql[i + 1] || ''))) {
        let j = i;
        while (j < n && /[0-9]/.test(sql[j])) j++;
        if (sql[j] === '.') { j++; while (j < n && /[0-9]/.test(sql[j])) j++; }
        if (/[eE]/.test(sql[j] || '') && /[0-9+-]/.test(sql[j + 1] || '')) {
          j += 2; while (j < n && /[0-9]/.test(sql[j])) j++;
        }
        toks.push({ t: 'num', v: Number(sql.slice(i, j)), raw: sql.slice(i, j), pos, real: /[.eE]/.test(sql.slice(i, j)) });
        i = j; continue;
      }
      if (c === "'") {
        let j = i + 1, s = '';
        for (;;) {
          if (j >= n) fail('A text value starting at character ' + (pos + 1) + " is missing its closing quote '.");
          if (sql[j] === "'") { if (sql[j + 1] === "'") { s += "'"; j += 2; continue; } break; }
          s += sql[j++];
        }
        toks.push({ t: 'str', v: s, raw: sql.slice(i, j + 1), pos });
        i = j + 1; continue;
      }
      if (c === '"' || c === '`') {
        const e = sql.indexOf(c, i + 1);
        if (e < 0) fail('A quoted name starting at character ' + (pos + 1) + ' is never closed.');
        toks.push({ t: 'id', v: sql.slice(i + 1, e), raw: sql.slice(i, e + 1), pos, quoted: true });
        i = e + 1; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < n && /[A-Za-z0-9_]/.test(sql[j])) j++;
        const w = sql.slice(i, j), u = w.toUpperCase();
        toks.push(KEYWORDS.has(u) ? { t: 'kw', v: u, raw: w, pos } : { t: 'id', v: w, raw: w, pos });
        i = j; continue;
      }
      const two = sql.slice(i, i + 2);
      if (['<=', '>=', '<>', '!=', '||'].includes(two)) { toks.push({ t: 'op', v: two === '!=' ? '<>' : two, raw: two, pos }); i += 2; continue; }
      if ('()+-*/%,.;=<>'.includes(c)) { toks.push({ t: 'op', v: c, raw: c, pos }); i++; continue; }
      fail("I don't understand the character '" + c + "' at position " + (pos + 1) + '.');
    }
    toks.push({ t: 'eof', v: '', raw: 'end of the statement', pos: n });
    return toks;
  }

  function lev(a, b) {
    const d = [];
    for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function didYouMean(word, options) {
    const w = String(word).toLowerCase();
    let best = null, bd = 3;
    options.forEach((o) => { const d = lev(w, String(o).toLowerCase()); if (d < bd) { bd = d; best = o; } });
    return best;
  }

  /* ---------------------------------------------------------------- parser */
  const AGG = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX']);
  const SCALAR_FN = new Set(['UPPER', 'LOWER', 'LENGTH', 'ABS', 'ROUND', 'SUBSTR', 'COALESCE']);

  class Parser {
    constructor(sql) { this.toks = tokenize(sql); this.p = 0; }
    get cur() { return this.toks[this.p]; }
    next() { return this.toks[this.p++]; }
    isKw(v) { const t = this.cur; return t.t === 'kw' && t.v === v; }
    isOp(v) { const t = this.cur; return t.t === 'op' && t.v === v; }
    eatKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
    eatOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    near(t) { return t.t === 'eof' ? 'the end of the statement' : "'" + t.raw + "'"; }
    unexpected(expected) {
      const t = this.cur;
      if (t.t === 'id' && UNSUPPORTED[t.v.toUpperCase()]) fail(UNSUPPORTED[t.v.toUpperCase()]);
      let hint = '';
      if (t.t === 'id') {
        const m = didYouMean(t.v, SELECT_WORDS);
        if (m) hint = " Did you mean " + m + '?';
      }
      fail('Syntax error near ' + this.near(t) + ': expected ' + expected + '.' + hint);
    }
    expectKw(v) { if (!this.eatKw(v)) this.unexpected(v); }
    expectOp(v) { if (!this.eatOp(v)) this.unexpected("'" + v + "'"); }
    ident(what) {
      const t = this.cur;
      if (t.t === 'id') { this.p++; return t.v; }
      this.unexpected(what || 'a name');
    }

    script() {
      const stmts = [];
      while (this.cur.t !== 'eof') {
        if (this.eatOp(';')) continue;
        stmts.push(this.statement());
        if (this.cur.t !== 'eof' && !this.isOp(';')) this.unexpected("';' or the end of the statement");
      }
      return stmts;
    }

    statement() {
      const t = this.cur;
      if (t.t === 'kw') {
        switch (t.v) {
          case 'SELECT': return this.select();
          case 'EXPLAIN': this.p++; if (!this.isKw('SELECT')) this.unexpected('SELECT after EXPLAIN'); return { kind: 'explain', sel: this.select() };
          case 'INSERT': return this.insert();
          case 'UPDATE': return this.update();
          case 'DELETE': return this.del();
          case 'CREATE': return this.create();
          case 'DROP': return this.drop();
          case 'ALTER': return this.alter();
          default: break;
        }
      }
      if (t.t === 'id' && UNSUPPORTED[t.v.toUpperCase()]) fail(UNSUPPORTED[t.v.toUpperCase()]);
      this.unexpected('a statement such as SELECT, INSERT, UPDATE, DELETE or CREATE');
    }

    /* ---- SELECT */
    select() {
      this.expectKw('SELECT');
      const s = { kind: 'select', distinct: false, items: [], from: [], where: null, groupBy: [], having: null, orderBy: [], limit: null, offset: null };
      if (this.eatKw('DISTINCT')) s.distinct = true; else this.eatKw('ALL');
      do {
        if (this.isOp('*')) { this.p++; s.items.push({ star: true }); continue; }
        if (this.cur.t === 'id' && this.toks[this.p + 1].v === '.' && this.toks[this.p + 2].v === '*' && this.toks[this.p + 1].t === 'op') {
          const tb = this.next().v; this.p += 2; s.items.push({ star: true, table: tb }); continue;
        }
        const e = this.expr();
        let alias = null;
        if (this.eatKw('AS')) alias = this.cur.t === 'str' ? this.next().v : this.ident('a column name after AS');
        else if (this.cur.t === 'id' && !UNSUPPORTED[this.cur.v.toUpperCase()]) { this.typoGuard(); alias = this.next().v; }
        s.items.push({ expr: e, alias });
      } while (this.eatOp(','));
      if (this.eatKw('FROM')) {
        s.from.push(this.tableRef('first'));
        for (;;) {
          if (this.eatOp(',')) { s.from.push(this.tableRef('cross')); continue; }
          let kind = null;
          if (this.isKw('JOIN')) { this.p++; kind = 'inner'; }
          else if (this.isKw('INNER')) { this.p++; this.expectKw('JOIN'); kind = 'inner'; }
          else if (this.isKw('CROSS')) { this.p++; this.expectKw('JOIN'); kind = 'cross'; }
          else if (this.isKw('LEFT')) { this.p++; this.eatKw('OUTER'); this.expectKw('JOIN'); kind = 'left'; }
          else break;
          const ref = this.tableRef(kind);
          if (kind !== 'cross') {
            if (!this.eatKw('ON')) { if (this.cur.t === 'id' && UNSUPPORTED[this.cur.v.toUpperCase()]) this.unexpected('ON'); this.unexpected('ON <join condition> (for example ON a.id = b.a_id)'); }
            ref.on = this.expr();
          }
          s.from.push(ref);
        }
      }
      if (this.eatKw('WHERE')) s.where = this.expr();
      if (this.eatKw('GROUP')) { this.expectKw('BY'); do s.groupBy.push(this.expr()); while (this.eatOp(',')); }
      if (this.eatKw('HAVING')) s.having = this.expr();
      if (this.eatKw('ORDER')) {
        this.expectKw('BY');
        do { const e = this.expr(); let desc = false; if (this.eatKw('DESC')) desc = true; else this.eatKw('ASC'); s.orderBy.push({ expr: e, desc }); } while (this.eatOp(','));
      }
      if (this.eatKw('LIMIT')) {
        s.limit = this.intLit('LIMIT');
        if (this.eatKw('OFFSET')) s.offset = this.intLit('OFFSET');
        else if (this.eatOp(',')) { s.offset = s.limit; s.limit = this.intLit('LIMIT'); }
      }
      if (this.cur.t === 'id' && UNSUPPORTED[this.cur.v.toUpperCase()]) fail(UNSUPPORTED[this.cur.v.toUpperCase()]);
      return s;
    }
    typoGuard() {          // an unknown word where a clause keyword could stand is more likely a typo than an alias
      const w = this.cur.v;
      const m = didYouMean(w, ['FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'JOIN', 'INNER', 'VALUES', 'SET']);
      if (m && w.length >= 4 && w.toLowerCase() !== m.toLowerCase()) fail("Syntax error near '" + w + "': did you mean " + m + '? (If you really want an alias, write AS ' + w + '.)');
    }
    intLit(what) {
      const t = this.cur;
      if (t.t === 'num' && Number.isInteger(t.v) && t.v >= 0) { this.p++; return t.v; }
      this.unexpected('a whole number after ' + what);
    }
    tableRef(join) {
      if (this.isOp('(')) fail('A sub-query inside FROM is not supported in this lab. Put the sub-query in WHERE (for example WHERE x IN (SELECT ...)).');
      const name = this.ident('a table name');
      let alias = null;
      if (this.eatKw('AS')) alias = this.ident('an alias');
      else if (this.cur.t === 'id') {
        const u = this.cur.v.toUpperCase();
        if (UNSUPPORTED[u]) fail(UNSUPPORTED[u]);
        this.typoGuard();
        alias = this.next().v;
      }
      return { name, alias: alias || name, join, on: null };
    }

    /* ---- expressions */
    expr() { return this.orE(); }
    orE() { let l = this.andE(); while (this.eatKw('OR')) l = { k: 'bin', op: 'OR', l, r: this.andE() }; return l; }
    andE() { let l = this.notE(); while (this.eatKw('AND')) l = { k: 'bin', op: 'AND', l, r: this.notE() }; return l; }
    notE() {
      if (this.isKw('NOT') && !(this.toks[this.p + 1].t === 'kw' && this.toks[this.p + 1].v === 'EXISTS')) { this.p++; return { k: 'not', e: this.notE() }; }
      return this.cmp();
    }
    cmp() {
      let l = this.concat();
      for (;;) {
        const t = this.cur;
        if (t.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(t.v)) { this.p++; l = { k: 'bin', op: t.v, l, r: this.concat() }; continue; }
        if (this.isKw('IS')) {
          this.p++; const neg = this.eatKw('NOT'); this.expectKw('NULL'); l = { k: 'isnull', e: l, neg }; continue;
        }
        let neg = false, save = this.p;
        if (this.isKw('NOT')) { this.p++; neg = true; }
        if (this.eatKw('LIKE')) { l = { k: 'like', e: l, p: this.concat(), neg }; continue; }
        if (this.eatKw('BETWEEN')) {
          const lo = this.concat(); this.expectKw('AND'); const hi = this.concat();
          l = { k: 'between', e: l, lo, hi, neg }; continue;
        }
        if (this.eatKw('IN')) {
          this.expectOp('(');
          if (this.isKw('SELECT')) { const sel = this.select(); this.expectOp(')'); l = { k: 'in', e: l, sub: sel, neg }; }
          else { const list = []; do list.push(this.expr()); while (this.eatOp(',')); this.expectOp(')'); l = { k: 'in', e: l, list, neg }; }
          continue;
        }
        if (neg) { this.p = save; this.unexpected('LIKE, BETWEEN or IN after NOT'); }
        return l;
      }
    }
    concat() { let l = this.add(); while (this.isOp('||')) { this.p++; l = { k: 'bin', op: '||', l, r: this.add() }; } return l; }
    add() {
      let l = this.mul();
      while (this.isOp('+') || this.isOp('-')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.mul() }; }
      return l;
    }
    mul() {
      let l = this.unary();
      while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const op = this.next().v; l = { k: 'bin', op, l, r: this.unary() }; }
      return l;
    }
    unary() {
      if (this.isOp('-')) { this.p++; const e = this.unary(); return e.k === 'num' ? { k: 'num', v: -e.v, real: e.real } : { k: 'neg', e }; }
      if (this.isOp('+')) { this.p++; return this.unary(); }
      return this.primary();
    }
    primary() {
      const t = this.cur;
      if (t.t === 'num') { this.p++; return { k: 'num', v: t.v, real: t.real }; }
      if (t.t === 'str') { this.p++; return { k: 'str', v: t.v }; }
      if (t.t === 'kw') {
        if (t.v === 'NULL') { this.p++; return { k: 'null' }; }
        if (t.v === 'TRUE') { this.p++; return { k: 'num', v: 1 }; }
        if (t.v === 'FALSE') { this.p++; return { k: 'num', v: 0 }; }
        if (t.v === 'EXISTS' || (t.v === 'NOT' && this.toks[this.p + 1].v === 'EXISTS')) {
          const neg = t.v === 'NOT'; if (neg) this.p++;
          this.p++; this.expectOp('('); const sel = this.select(); this.expectOp(')');
          return { k: 'exists', sel, neg };
        }
      }
      if (t.t === 'op' && t.v === '(') {
        this.p++;
        if (this.isKw('SELECT')) { const sel = this.select(); this.expectOp(')'); return { k: 'sub', sel }; }
        const e = this.expr(); this.expectOp(')'); return e;
      }
      if (t.t === 'id') {
        const nxt = this.toks[this.p + 1];
        const up = t.v.toUpperCase();
        if (nxt.t === 'op' && nxt.v === '(' && !t.quoted) {
          this.p += 2;
          if (!AGG.has(up) && !SCALAR_FN.has(up)) {
            fail("Function '" + t.v + "' is not supported in this lab. Available: COUNT, SUM, AVG, MIN, MAX (aggregates) and " + [...SCALAR_FN].join(', ') + '.');
          }
          const node = { k: 'fn', name: up, args: [], distinct: false, star: false };
          if (AGG.has(up) && this.isOp('*')) {
            if (up !== 'COUNT') fail(up + '(*) does not make sense: only COUNT(*) can count rows. Give ' + up + ' a column.');
            this.p++; node.star = true;
          } else if (!this.isOp(')')) {
            if (AGG.has(up) && this.eatKw('DISTINCT')) node.distinct = true;
            do node.args.push(this.expr()); while (this.eatOp(','));
          }
          this.expectOp(')');
          const need = { COUNT: [1, 1], SUM: [1, 1], AVG: [1, 1], MIN: [1, 1], MAX: [1, 1], UPPER: [1, 1], LOWER: [1, 1], LENGTH: [1, 1], ABS: [1, 1], ROUND: [1, 2], SUBSTR: [2, 3], COALESCE: [1, 99] }[up];
          if (!node.star && (node.args.length < need[0] || node.args.length > need[1])) fail(up + ' is given the wrong number of arguments.');
          return node;
        }
        if (UNSUPPORTED[up] && !(nxt.t === 'op' && nxt.v === '.')) fail(UNSUPPORTED[up]);
        this.p++;
        if (this.isOp('.')) {
          this.p++;
          if (this.isOp('*')) fail('table.* is only allowed in the SELECT list.');
          return { k: 'col', table: t.v, name: this.ident('a column name after the dot') };
        }
        return { k: 'col', table: null, name: t.v };
      }
      this.unexpected('a value, a column name or ( ... )');
    }

    /* ---- DML */
    insert() {
      this.expectKw('INSERT'); this.expectKw('INTO');
      const table = this.ident('a table name');
      let cols = null;
      if (this.isOp('(')) { this.p++; cols = []; do cols.push(this.ident('a column name')); while (this.eatOp(',')); this.expectOp(')'); }
      if (this.isKw('SELECT')) return { kind: 'insert', table, cols, sel: this.select() };
      this.expectKw('VALUES');
      const rows = [];
      do {
        this.expectOp('('); const r = []; do r.push(this.expr()); while (this.eatOp(',')); this.expectOp(')'); rows.push(r);
      } while (this.eatOp(','));
      return { kind: 'insert', table, cols, rows };
    }
    update() {
      this.expectKw('UPDATE');
      const table = this.ident('a table name');
      this.expectKw('SET');
      const sets = [];
      do { const c = this.ident('a column name'); this.expectOp('='); sets.push({ col: c, e: this.expr() }); } while (this.eatOp(','));
      const where = this.eatKw('WHERE') ? this.expr() : null;
      return { kind: 'update', table, sets, where };
    }
    del() {
      this.expectKw('DELETE'); this.expectKw('FROM');
      const table = this.ident('a table name');
      const where = this.eatKw('WHERE') ? this.expr() : null;
      return { kind: 'delete', table, where };
    }

    /* ---- DDL */
    create() {
      this.expectKw('CREATE');
      if (this.eatKw('UNIQUE')) { this.expectKw('INDEX'); return this.createIndex(true); }
      if (this.eatKw('INDEX')) return this.createIndex(false);
      if (this.isKw('TABLE')) { this.p++; return this.createTable(); }
      if (this.cur.t === 'id' && UNSUPPORTED[this.cur.v.toUpperCase()]) fail(UNSUPPORTED[this.cur.v.toUpperCase()]);
      this.unexpected('TABLE or INDEX after CREATE');
    }
    createIndex(unique) {
      if (this.isKw('IF')) fail('IF NOT EXISTS is not supported in this lab.');
      const name = this.ident('an index name');
      this.expectKw('ON');
      const table = this.ident('a table name');
      this.expectOp('(');
      const col = this.ident('a column name');
      if (this.isOp(',')) fail('This lab supports an index on ONE column only (CREATE INDEX name ON table (column)). Multi-column indexes are a real feature, just not in the lab.');
      if (this.isKw('ASC') || this.isKw('DESC')) this.p++;
      this.expectOp(')');
      return { kind: 'createindex', name, table, col, unique };
    }
    typeName() {
      const t = this.cur;
      if (t.t !== 'id') this.unexpected('a column type such as INTEGER, TEXT or REAL');
      this.p++;
      let name = t.v.toUpperCase();
      if (name === 'DOUBLE' && this.cur.t === 'id' && this.cur.v.toUpperCase() === 'PRECISION') this.p++;
      let declared = name;
      if (this.isOp('(')) {
        this.p++; const a = [];
        do { const n = this.cur; if (n.t !== 'num') this.unexpected('a number'); this.p++; a.push(n.raw); } while (this.eatOp(','));
        this.expectOp(')'); declared += '(' + a.join(',') + ')';
      }
      const map = { INT: 'INTEGER', INTEGER: 'INTEGER', SMALLINT: 'INTEGER', BIGINT: 'INTEGER', BOOLEAN: 'INTEGER',
        TEXT: 'TEXT', CHAR: 'TEXT', VARCHAR: 'TEXT', DATE: 'TEXT', TIME: 'TEXT', TIMESTAMP: 'TEXT', DATETIME: 'TEXT',
        REAL: 'REAL', FLOAT: 'REAL', DOUBLE: 'REAL', DECIMAL: 'REAL', NUMERIC: 'REAL' };
      if (!map[name]) fail("Unknown column type '" + t.v + "'. This lab knows INTEGER/INT, TEXT/CHAR/VARCHAR/DATE, REAL/FLOAT/DECIMAL/NUMERIC.");
      return { type: map[name], declared };
    }
    refClause() {
      this.expectKw('REFERENCES');
      const refTable = this.ident('a table name');
      let refCols = null;
      if (this.eatOp('(')) { refCols = []; do refCols.push(this.ident('a column name')); while (this.eatOp(',')); this.expectOp(')'); }
      let onDelete = 'RESTRICT';
      while (this.isKw('ON')) {
        this.p++;
        if (this.eatKw('DELETE')) {
          if (this.eatKw('CASCADE')) onDelete = 'CASCADE';
          else if (this.eatKw('RESTRICT')) onDelete = 'RESTRICT';
          else if (this.eatKw('SET')) { this.expectKw('NULL'); onDelete = 'SET NULL'; }
          else this.unexpected('CASCADE, RESTRICT or SET NULL');
        } else fail('ON UPDATE actions are not supported in this lab (updating a key that other rows point to is always refused).');
      }
      return { refTable, refCols, onDelete };
    }
    createTable() {
      if (this.isKw('IF')) fail('IF NOT EXISTS is not supported in this lab.');
      const name = this.ident('a table name');
      this.expectOp('(');
      const def = { kind: 'createtable', name, cols: [], pk: null, uniques: [], fks: [], checks: [] };
      do {
        if (this.isKw('CONSTRAINT')) { this.p++; this.ident('a constraint name'); }
        if (this.isKw('PRIMARY')) {
          this.p++; this.expectKw('KEY'); def.pk = this.nameList();
        } else if (this.isKw('UNIQUE')) {
          this.p++; def.uniques.push(this.nameList());
        } else if (this.isKw('FOREIGN')) {
          this.p++; this.expectKw('KEY'); const cols = this.nameList(); const r = this.refClause();
          def.fks.push({ cols, refTable: r.refTable, refCols: r.refCols, onDelete: r.onDelete });
        } else if (this.isKw('CHECK')) {
          def.checks.push(this.checkExpr());
        } else {
          const cname = this.ident('a column name or PRIMARY KEY / FOREIGN KEY');
          const ty = this.typeName();
          const col = { name: cname, type: ty.type, declared: ty.declared, notNull: false, def: null, hasDef: false };
          for (;;) {
            if (this.isKw('PRIMARY')) { this.p++; this.expectKw('KEY'); def.pk = [cname]; }
            else if (this.isKw('NOT')) { this.p++; this.expectKw('NULL'); col.notNull = true; }
            else if (this.isKw('NULL')) { this.p++; }
            else if (this.isKw('UNIQUE')) { this.p++; def.uniques.push([cname]); }
            else if (this.isKw('DEFAULT')) {
              this.p++;
              const e = this.unary();
              if (e.k === 'num') col.def = e.v; else if (e.k === 'str') col.def = e.v; else if (e.k === 'null') col.def = null;
              else fail('DEFAULT must be a plain number, text or NULL.');
              col.hasDef = true;
            }
            else if (this.isKw('CHECK')) def.checks.push(this.checkExpr());
            else if (this.isKw('REFERENCES')) { const r = this.refClause(); def.fks.push({ cols: [cname], refTable: r.refTable, refCols: r.refCols, onDelete: r.onDelete }); }
            else if (this.isKw('CONSTRAINT')) { this.p++; this.ident('a constraint name'); }
            else break;
          }
          def.cols.push(col);
        }
      } while (this.eatOp(','));
      this.expectOp(')');
      return def;
    }
    nameList() { this.expectOp('('); const a = []; do a.push(this.ident('a column name')); while (this.eatOp(',')); this.expectOp(')'); return a; }
    checkExpr() {
      this.expectKw('CHECK'); this.expectOp('(');
      const start = this.cur.pos;
      const e = this.expr();
      const end = this.cur.pos;
      this.expectOp(')');
      return { e, text: exprToSql(e), pos: [start, end] };
    }
    drop() {
      this.expectKw('DROP');
      if (this.eatKw('TABLE')) {
        if (this.isKw('IF')) fail('IF EXISTS is not supported in this lab.');
        return { kind: 'droptable', name: this.ident('a table name') };
      }
      if (this.eatKw('INDEX')) {
        const name = this.ident('an index name');
        if (this.eatKw('ON')) this.ident('a table name');
        return { kind: 'dropindex', name };
      }
      this.unexpected('TABLE or INDEX after DROP');
    }
    alter() {
      this.expectKw('ALTER'); this.expectKw('TABLE');
      const table = this.ident('a table name');
      if (this.eatKw('DROP')) { this.eatKw('COLUMN'); return { kind: 'altertable', table, op: 'drop', col: this.ident('a column name') }; }
      if (!this.isKw('ADD')) fail('This lab supports only ALTER TABLE ... ADD [COLUMN], DROP COLUMN and ADD FOREIGN KEY. (RENAME, ALTER COLUMN, ... are not supported.)');
      this.p++;
      if (this.isKw('CONSTRAINT') || this.isKw('FOREIGN')) {
        if (this.eatKw('CONSTRAINT')) this.ident('a constraint name');
        if (!this.isKw('FOREIGN')) fail('ALTER TABLE ... ADD supports a column or a FOREIGN KEY constraint in this lab.');
        this.p++; this.expectKw('KEY'); const cols = this.nameList(); const r = this.refClause();
        return { kind: 'altertable', table, op: 'addfk', fk: { cols, refTable: r.refTable, refCols: r.refCols, onDelete: r.onDelete } };
      }
      this.eatKw('COLUMN');
      const cname = this.ident('a column name');
      const ty = this.typeName();
      const col = { name: cname, type: ty.type, declared: ty.declared, notNull: false, def: null, hasDef: false, unique: false };
      for (;;) {
        if (this.isKw('NOT')) { this.p++; this.expectKw('NULL'); col.notNull = true; }
        else if (this.isKw('UNIQUE')) { this.p++; col.unique = true; }
        else if (this.isKw('DEFAULT')) { this.p++; const e = this.unary(); if (e.k === 'num' || e.k === 'str') col.def = e.v; col.hasDef = true; }
        else break;
      }
      return { kind: 'altertable', table, op: 'add', col };
    }
  }

  function exprToSql(e) {
    switch (e.k) {
      case 'num': return String(e.v);
      case 'str': return "'" + e.v.replace(/'/g, "''") + "'";
      case 'null': return 'NULL';
      case 'col': return (e.table ? e.table + '.' : '') + e.name;
      case 'neg': return '-' + exprToSql(e.e);
      case 'not': return 'NOT ' + exprToSql(e.e);
      case 'bin': return exprToSql(e.l) + ' ' + e.op + ' ' + exprToSql(e.r);
      case 'isnull': return exprToSql(e.e) + (e.neg ? ' IS NOT NULL' : ' IS NULL');
      case 'like': return exprToSql(e.e) + (e.neg ? ' NOT LIKE ' : ' LIKE ') + exprToSql(e.p);
      case 'between': return exprToSql(e.e) + (e.neg ? ' NOT BETWEEN ' : ' BETWEEN ') + exprToSql(e.lo) + ' AND ' + exprToSql(e.hi);
      case 'in': return exprToSql(e.e) + (e.neg ? ' NOT IN (' : ' IN (') + (e.list ? e.list.map(exprToSql).join(', ') : '...') + ')';
      case 'fn': return e.name + '(' + (e.star ? '*' : (e.distinct ? 'DISTINCT ' : '') + e.args.map(exprToSql).join(', ')) + ')';
      case 'sub': return '(SELECT ...)';
      case 'exists': return (e.neg ? 'NOT ' : '') + 'EXISTS (SELECT ...)';
      default: return '?';
    }
  }

  /* ------------------------------------------------------------ value rules */
  const isNum = (v) => typeof v === 'number';
  function cmpVals(a, b) {          // total order used for sorting & index: NULL < numbers < text
    if (a === null || a === undefined) return (b === null || b === undefined) ? 0 : -1;
    if (b === null || b === undefined) return 1;
    if (isNum(a) && isNum(b)) return a < b ? -1 : a > b ? 1 : 0;
    if (isNum(a)) return -1;
    if (isNum(b)) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function truthy(v) {
    if (v === null || v === undefined) return false;
    if (isNum(v)) return v !== 0;
    const n = parseFloat(v); return !isNaN(n) && n !== 0;
  }
  function likeRegex(pat) {
    let re = '^';
    for (const ch of String(pat)) re += ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
    return new RegExp(re + '$', 'is');
  }
  function toNumber(v, what) {
    if (isNum(v)) return v;
    const n = Number(v);
    if (v === '' || isNaN(n)) fail("Can't do arithmetic on the text '" + v + "' (" + what + '). Use numbers.');
    return n;
  }

  /* ---------------------------------------------------------------- database */
  class Database {
    constructor() { this.tables = new Map(); this.indexes = new Map(); }

    tableNames() { return [...this.tables.values()].map((t) => t.name); }
    getTable(name, quiet) {
      const t = this.tables.get(String(name).toLowerCase());
      if (!t && !quiet) {
        const names = this.tableNames();
        const m = didYouMean(name, names);
        fail("There is no table called '" + name + "'." + (m ? ' Did you mean ' + m + '?' : '') + (names.length ? ' Tables here: ' + names.join(', ') + '.' : ' This database has no tables yet: use CREATE TABLE.'));
      }
      return t;
    }
    colIndex(t, name, quiet) {
      const i = t.cols.findIndex((c) => c.name.toLowerCase() === String(name).toLowerCase());
      if (i < 0 && !quiet) {
        const m = didYouMean(name, t.cols.map((c) => c.name));
        fail("Table '" + t.name + "' has no column '" + name + "'." + (m ? ' Did you mean ' + m + '?' : '') + ' Its columns: ' + t.cols.map((c) => c.name).join(', ') + '.');
      }
      return i;
    }

    /* Run a script; returns {results:[...], error:null|{message,statement}} */
    run(sql) {
      const out = { results: [], error: null };
      let stmts;
      try { stmts = new Parser(sql).script(); } catch (e) {
        if (e instanceof SqlError) { out.error = { message: e.message, statement: 1 }; return out; }
        throw e;
      }
      if (!stmts.length) { out.error = { message: 'Type a SQL statement first, then press Run.', statement: 1 }; return out; }
      for (let i = 0; i < stmts.length; i++) {
        try { out.results.push(this.exec(stmts[i])); } catch (e) {
          if (e instanceof SqlError) { out.error = { message: e.message, statement: i + 1, of: stmts.length }; return out; }
          throw e;
        }
      }
      return out;
    }

    snapshot() {
      const s = new Map();
      this.tables.forEach((t, k) => s.set(k, { rows: t.rows.slice(), cols: t.cols, fks: t.fks.slice() }));
      return { s, idx: new Map(this.indexes), tbls: new Map(this.tables) };
    }
    restore(sn) {
      this.tables = new Map(sn.tbls); this.indexes = new Map(sn.idx);
      sn.s.forEach((v, k) => { const t = this.tables.get(k); t.rows = v.rows; t.cols = v.cols; t.fks = v.fks; t.indexes.forEach((x) => { x.dirty = true; }); });
    }

    /* exec() = execRaw() + (only when trace() is running) statement start/finish events */
    exec(st) {
      if (!TR) return this.execRaw(st);
      TR.stmt(st);
      const r = this.execRaw(st);
      TR.done(r);
      return r;
    }
    /* Run a script exactly like run(), and also return the ordered execution events (see makeTrace). */
    trace(sql) {
      const prev = TR;
      TR = makeTrace(sql);
      try {
        const out = this.run(sql);
        if (out.error) TR.push('error', { t: 'error', stmt: out.error.statement, message: out.error.message, parse: !TR.started }, false);
        return { results: out.results, error: out.error, events: TR.events, counts: TR.counts, skipped: TR.skipped, truncated: TR.truncated, statements: TR.stmts, sql };
      } finally { TR = prev; }
    }
    execRaw(st) {
      const sn = this.snapshot();
      try {
        switch (st.kind) {
          case 'select': return this.execSelectTop(st);
          case 'explain': { const r = this.execSelectTop(st.sel); r.kind = 'explain'; return r; }
          case 'insert': return this.execInsert(st);
          case 'update': return this.execUpdate(st);
          case 'delete': return this.execDelete(st);
          case 'createtable': return this.execCreateTable(st);
          case 'createindex': return this.execCreateIndex(st);
          case 'droptable': return this.execDropTable(st);
          case 'dropindex': return this.execDropIndex(st);
          case 'altertable': return this.execAlter(st);
          default: return fail('That statement is not supported.');
        }
      } catch (e) { this.restore(sn); throw e; }
    }

    /* ---------- DDL */
    execCreateTable(d) {
      if (this.getTable(d.name, true)) fail("A table called '" + d.name + "' already exists. Use DROP TABLE " + d.name + ' first if you want to start again.');
      if (!d.cols.length) fail('A table needs at least one column.');
      const seen = new Set();
      d.cols.forEach((c) => { const k = c.name.toLowerCase(); if (seen.has(k)) fail("The column name '" + c.name + "' is used twice in CREATE TABLE " + d.name + '.'); seen.add(k); });
      const t = { name: d.name, cols: d.cols.map((c) => ({ name: c.name, type: c.type, declared: c.declared, notNull: c.notNull, def: c.def, hasDef: c.hasDef })),
        pk: [], uniques: [], fks: [], checks: d.checks, rows: [], indexes: [] };
      const idxOf = (n) => { const i = t.cols.findIndex((c) => c.name.toLowerCase() === n.toLowerCase()); if (i < 0) fail("Constraint refers to a column '" + n + "' that table " + d.name + ' does not have.'); return i; };
      if (d.pk) { t.pk = d.pk.map(idxOf); t.pk.forEach((i) => { t.cols[i].notNull = true; }); }
      d.uniques.forEach((u) => t.uniques.push(u.map(idxOf)));
      d.fks.forEach((f) => t.fks.push({ cols: f.cols.map(idxOf), refTable: f.refTable, refCols: f.refCols, onDelete: f.onDelete }));
      this.tables.set(d.name.toLowerCase(), t);
      t.checks.forEach((ck) => { if (/\(SELECT/.test(ck.text)) fail('CHECK rules cannot contain a sub-query.'); this.bind(ck.e, this.singleScope(t)); });
      this.checkFkTargets(t);
      if (t.pk.length === 1) this.addIndex(t, 'pk_' + t.name.toLowerCase() + '_' + t.cols[t.pk[0]].name.toLowerCase(), t.pk[0], true, true);
      t.uniques.forEach((u) => { if (u.length === 1 && !t.indexes.some((x) => x.ci === u[0])) this.addIndex(t, 'uq_' + t.name.toLowerCase() + '_' + t.cols[u[0]].name.toLowerCase(), u[0], true, true); });
      return { kind: 'ddl', message: "Table '" + d.name + "' created with " + t.cols.length + ' columns' + (t.pk.length ? ' (primary key: ' + t.pk.map((i) => t.cols[i].name).join(', ') + ').' : ' and no primary key.') };
    }
    checkFkTargets(t) {
      t.fks.forEach((f) => {
        const rt = f.refTable.toLowerCase() === t.name.toLowerCase() ? t : this.getTable(f.refTable, true);
        if (!rt) return;                                  // may be created later (circular references)
        if (!f.refCols) { if (!rt.pk.length) fail("FOREIGN KEY ... REFERENCES " + rt.name + ' needs column names, because ' + rt.name + ' has no PRIMARY KEY.'); f.refIdx = rt.pk.slice(); }
        else f.refIdx = f.refCols.map((c) => this.colIndex(rt, c));
        if (f.refIdx.length !== f.cols.length) fail('A FOREIGN KEY must list as many columns as the key it points to (' + f.refIdx.length + ' needed).');
      });
    }
    addIndex(t, name, ci, unique, auto) {
      const ix = { name, table: t, ci, unique: !!unique, auto: !!auto, entries: [], dirty: true };
      t.indexes.push(ix); this.indexes.set(name.toLowerCase(), ix); return ix;
    }
    execCreateIndex(d) {
      const t = this.getTable(d.table);
      if (this.indexes.has(d.name.toLowerCase())) fail("An index called '" + d.name + "' already exists.");
      const ci = this.colIndex(t, d.col);
      if (d.unique) {
        const seen = new Set();
        t.rows.forEach((r) => { if (r[ci] !== null) { const k = JSON.stringify(r[ci]); if (seen.has(k)) fail("Can't create a UNIQUE index: the column '" + t.cols[ci].name + "' already contains the value " + fmt(r[ci]) + ' more than once.'); seen.add(k); } });
      }
      const ix = this.addIndex(t, d.name, ci, d.unique, false);
      this.build(ix);
      if (TR) TR.push('build', { t: 'build', table: t.name, index: d.name, column: t.cols[ci].name, entries: ix.entries.length, tableRows: t.rows.length }, false);
      return { kind: 'ddl', message: "Index '" + d.name + "' created on " + t.name + '(' + t.cols[ci].name + '): ' + ix.entries.length + ' sorted entries, each pointing at a row. Queries that filter on ' + t.cols[ci].name + ' can now use binary search.' };
    }
    execDropIndex(d) {
      const ix = this.indexes.get(d.name.toLowerCase());
      if (!ix) fail("There is no index called '" + d.name + "'. Indexes: " + ([...this.indexes.values()].filter((x) => !x.auto).map((x) => x.name).join(', ') || 'none') + '.');
      if (ix.auto) fail("'" + d.name + "' is created automatically for a PRIMARY KEY / UNIQUE column and cannot be dropped.");
      ix.table.indexes = ix.table.indexes.filter((x) => x !== ix); this.indexes.delete(d.name.toLowerCase());
      return { kind: 'ddl', message: "Index '" + d.name + "' dropped. Queries on that column go back to scanning." };
    }
    execDropTable(d) {
      const t = this.getTable(d.name);
      this.tables.forEach((o) => {
        if (o !== t && o.fks.some((f) => f.refTable.toLowerCase() === t.name.toLowerCase())) fail("Can't drop '" + t.name + "': table '" + o.name + "' has a FOREIGN KEY pointing to it. Drop " + o.name + ' first.');
      });
      t.indexes.forEach((x) => this.indexes.delete(x.name.toLowerCase()));
      this.tables.delete(t.name.toLowerCase());
      return { kind: 'ddl', message: "Table '" + t.name + "' dropped (its " + t.rows.length + ' rows and its indexes are gone).' };
    }
    execAlter(d) {
      const t = this.getTable(d.table);
      if (d.op === 'add') {
        if (this.colIndex(t, d.col.name, true) >= 0) fail("Table '" + t.name + "' already has a column '" + d.col.name + "'.");
        if (d.col.notNull && !d.col.hasDef && t.rows.length) fail("Can't add a NOT NULL column without a DEFAULT to a table that already has rows.");
        const nc = { name: d.col.name, type: d.col.type, declared: d.col.declared, notNull: d.col.notNull, def: d.col.def, hasDef: d.col.hasDef };
        t.cols = t.cols.concat([nc]);
        t.rows = t.rows.map((r) => r.concat([nc.def]));
        if (d.col.unique) { const ix = this.addIndex(t, 'uq_' + t.name.toLowerCase() + '_' + nc.name.toLowerCase(), t.cols.length - 1, true, true); this.build(ix); t.uniques.push([t.cols.length - 1]); }
        return { kind: 'ddl', message: "Column '" + nc.name + "' added to " + t.name + '; the ' + t.rows.length + ' existing rows got ' + (nc.def === null ? 'NULL' : fmt(nc.def)) + ' in it.' };
      }
      if (d.op === 'drop') {
        const ci = this.colIndex(t, d.col);
        if (t.checks.length) fail("Can't drop a column from a table that has CHECK rules (they may mention it). Re-create the table instead.");
        const key = t.pk.includes(ci) || t.uniques.some((u) => u.includes(ci) && u.length > 1) || t.fks.some((f) => f.cols.includes(ci)) || t.indexes.some((x) => x.ci === ci && !x.auto);
        if (key) fail("Can't drop '" + t.cols[ci].name + "': it is part of a key or an index. Remove that first (DROP INDEX / re-create the table).");
        if (this.tables.size && [...this.tables.values()].some((o) => o.fks.some((f) => f.refTable.toLowerCase() === t.name.toLowerCase() && (f.refIdx || []).includes(ci)))) fail("Can't drop '" + t.cols[ci].name + "': another table's FOREIGN KEY points to it.");
        t.uniques = t.uniques.filter((u) => !(u.length === 1 && u[0] === ci));
        t.indexes.filter((x) => x.ci === ci).forEach((x) => this.indexes.delete(x.name.toLowerCase()));
        t.indexes = t.indexes.filter((x) => x.ci !== ci);
        const shift = (i) => (i > ci ? i - 1 : i);
        t.cols = t.cols.filter((_, i) => i !== ci);
        t.rows = t.rows.map((r) => r.filter((_, i) => i !== ci));
        t.pk = t.pk.map(shift); t.uniques = t.uniques.map((u) => u.map(shift));
        t.fks.forEach((f) => { f.cols = f.cols.map(shift); });
        t.indexes.forEach((x) => { x.ci = shift(x.ci); x.dirty = true; });
        return { kind: 'ddl', message: "Column '" + d.col + "' dropped from " + t.name + '.' };
      }
      const f = { cols: d.fk.cols.map((c) => this.colIndex(t, c)), refTable: d.fk.refTable, refCols: d.fk.refCols, onDelete: d.fk.onDelete };
      const rt = this.getTable(f.refTable);
      f.refIdx = f.refCols ? f.refCols.map((c) => this.colIndex(rt, c)) : rt.pk.slice();
      if (!f.refIdx.length || f.refIdx.length !== f.cols.length) fail('The FOREIGN KEY columns do not match the columns it points to.');
      t.rows.forEach((r) => this.checkFkRow(t, f, r));
      t.fks.push(f);
      return { kind: 'ddl', message: 'FOREIGN KEY added: ' + t.name + '(' + f.cols.map((i) => t.cols[i].name).join(', ') + ') -> ' + rt.name + '. All ' + t.rows.length + ' existing rows were checked and are valid.' };
    }

    /* ---------- index machinery */
    build(ix) {
      if (!ix.dirty) return;
      const ci = ix.ci;
      const arr = [];
      ix.table.rows.forEach((r, i) => { if (r[ci] !== null) arr.push([r[ci], i]); });
      arr.sort((a, b) => cmpVals(a[0], b[0]) || a[1] - b[1]);
      ix.entries = arr; ix.dirty = false;
    }
    /* Range lookup on the sorted entries; returns row ids + the number of index steps taken */
    probe(ix, lo, loInc, hi, hiInc, rec) {
      this.build(ix);
      const e = ix.entries;
      let steps = 0, start = 0;
      if (lo !== undefined) {                       // binary search for the first entry >= lo (or > lo)
        let a = 0, b = e.length;
        while (a < b) {
          const m = (a + b) >> 1; steps++;
          if (rec) rec.push({ phase: 'search', pos: m, key: e[m][0] });
          const c = cmpVals(e[m][0], lo);
          if (c < 0 || (c === 0 && !loInc)) a = m + 1; else b = m;
        }
        start = a;
      }
      const ids = [];
      let i = start;
      for (; i < e.length; i++) {
        steps++;
        if (rec) rec.push({ phase: 'walk', pos: i, key: e[i][0] });
        if (hi !== undefined) { const c = cmpVals(e[i][0], hi); if (c > 0 || (c === 0 && !hiInc)) break; }
        ids.push(e[i][1]);
      }
      return { ids, steps };
    }

    /* ---------- constraints */
    coerce(t, ci, v) {
      const c = t.cols[ci];
      if (v === null || v === undefined) return null;
      if (c.type === 'INTEGER') {
        if (isNum(v)) { if (!Number.isInteger(v)) fail("Column '" + c.name + "' is " + c.declared + ' but ' + v + ' is not a whole number.'); return v; }
        if (/^\s*-?\d+\s*$/.test(v)) return parseInt(v, 10);
        fail("Column '" + c.name + "' is " + c.declared + " but you gave the text '" + v + "'.");
      }
      if (c.type === 'REAL') {
        if (isNum(v)) return v;
        if (v !== '' && !isNaN(Number(v))) return Number(v);
        fail("Column '" + c.name + "' is " + c.declared + " but you gave the text '" + v + "'.");
      }
      return isNum(v) ? String(v) : v;
    }
    checkFkRow(t, f, row) {
      if (f.cols.some((i) => row[i] === null)) return;
      const rt = f.refTable.toLowerCase() === t.name.toLowerCase() ? t : this.getTable(f.refTable, true);
      if (!rt) fail("FOREIGN KEY refers to a table '" + f.refTable + "' that does not exist.");
      if (!f.refIdx) this.checkFkTargets(t);
      const ok = rt.rows.some((r) => f.refIdx.every((ri, k) => cmpVals(r[ri], row[f.cols[k]]) === 0));
      if (!ok) fail('FOREIGN KEY violated: ' + t.name + '(' + f.cols.map((i) => t.cols[i].name).join(', ') + ') = (' + f.cols.map((i) => fmt(row[i])).join(', ') + ') does not match any row of ' + rt.name + '(' + f.refIdx.map((i) => rt.cols[i].name).join(', ') + '). A row may only point at a row that exists.');
    }
    checkRow(t, row, skipRow) {
      t.cols.forEach((c, i) => { if (row[i] === null && c.notNull) fail(t.pk.includes(i) ? "PRIMARY KEY violated: '" + c.name + "' is part of the primary key and cannot be NULL." : "NOT NULL violated: column '" + c.name + "' cannot be empty (NULL).") ; });
      const scope = { tables: [{ alias: t.name, name: t.name, tbl: t }], parent: null };
      t.checks.forEach((ck) => {
        const env = { scope, rows: [row], parent: null };
        const v = this.ev(ck.e, env, newCtx(this));
        if (v !== null && !truthy(v)) fail('CHECK violated: the rule (' + ck.text + ') is false for this row.');
      });
      const dup = (cols, label) => {
        if (cols.some((i) => row[i] === null)) return;
        for (const r of t.rows) {
          if (r === skipRow) continue;
          if (cols.every((i) => cmpVals(r[i], row[i]) === 0)) fail(label + ' violated: there is already a row with ' + cols.map((i) => t.cols[i].name + ' = ' + fmt(row[i])).join(', ') + ' in ' + t.name + '.');
        }
      };
      if (t.pk.length) dup(t.pk, 'PRIMARY KEY');
      t.uniques.forEach((u) => dup(u, 'UNIQUE'));
      t.indexes.forEach((x) => { if (x.unique && !x.auto) dup([x.ci], 'UNIQUE index ' + x.name); });
      t.fks.forEach((f) => this.checkFkRow(t, f, row));
    }
    nextAutoId(t) { let m = 0; t.rows.forEach((r) => { if (r[t.pk[0]] > m) m = r[t.pk[0]]; }); return m + 1; }

    /* Bulk loader used by the sample datasets (trusted rows, no per-row checks). */
    load(tableName, rows) {
      const t = this.getTable(tableName);
      rows.forEach((r) => t.rows.push(r.map((v, i) => (v === undefined ? null : this.coerce(t, i, v)))));
      t.indexes.forEach((x) => { x.dirty = true; });
    }

    execInsert(d) {
      const t = this.getTable(d.table);
      const ci = d.cols ? d.cols.map((c) => this.colIndex(t, c)) : t.cols.map((_, i) => i);
      if (new Set(ci).size !== ci.length) fail('A column is listed twice in the INSERT.');
      let src;
      if (d.sel) { const r = this.execSelectTop(d.sel); src = r.rows; }
      else {
        const ctx = newCtx(this);
        const env = { scope: { tables: [], parent: null }, rows: [], parent: null };
        d.rows.forEach((exprs) => exprs.forEach((e) => this.bind(e, env.scope)));
        src = d.rows.map((exprs) => exprs.map((e) => this.ev(e, env, ctx)));
      }
      let n = 0;
      src.forEach((vals) => {
        if (vals.length !== ci.length) fail('This INSERT names ' + ci.length + ' column(s) but gives ' + vals.length + ' value(s): the counts must match.' + (d.cols ? '' : ' Table ' + t.name + ' has ' + t.cols.length + ' columns (' + t.cols.map((c) => c.name).join(', ') + ').'));
        const row = t.cols.map((c) => (c.hasDef ? c.def : null));
        vals.forEach((v, k) => { row[ci[k]] = this.coerce(t, ci[k], v); });
        if (t.pk.length === 1 && t.cols[t.pk[0]].type === 'INTEGER' && /^INT(EGER)?$/.test(t.cols[t.pk[0]].declared) && row[t.pk[0]] === null && !ci.includes(t.pk[0])) row[t.pk[0]] = this.nextAutoId(t);
        this.checkRow(t, row, null);
        t.rows.push(row); n++;
        t.indexes.forEach((x) => { x.dirty = true; });
      });
      if (TR) TR.write('insert', t.name, n, Array.from({ length: Math.min(n, 30) }, (_, k) => t.rows.length - n + k), n * t.indexes.length, t.rows.length);
      return { kind: 'dml', affected: n, message: n + ' row' + (n === 1 ? '' : 's') + ' inserted into ' + t.name + '. ' + (t.indexes.length ? 'Write cost: ' + t.name + ' has ' + t.indexes.length + ' ' + (t.indexes.length === 1 ? 'index' : 'indexes') + ', so ' + n * t.indexes.length + ' index ' + (n * t.indexes.length === 1 ? 'entry was' : 'entries were') + ' written as well.' : 'No index to maintain.'), plan: [], stats: { indexWrites: n * t.indexes.length } };
    }

    singleScope(t, alias) { return { tables: [{ alias: alias || t.name, name: t.name, tbl: t }], parent: null }; }
    matchRows(t, where, ctx) {          // rows (and their positions) matched by a WHERE, using the same access planner as SELECT
      const scope = this.singleScope(t);
      const conj = where ? flattenAnd(where) : [];
      conj.forEach((c) => this.bind(c, scope, null));
      const acc = this.planAccess(0, scope, conj, true);
      const entry = ctx.entry(t, t.name, acc);
      const env = { scope, rows: [null], parent: null };
      const cand = this.fetch(acc, t, env, ctx, entry, 0);
      const hit = [];
      cand.forEach((pos) => {
        env.rows[0] = t.rows[pos];
        if (TR) TR.row(t.name, 0, pos, t.rows[pos], acc.kind === 'scan' ? 'scan' : 'index', false);
        if (conj.every((c) => truthy(this.ev(c, env, ctx)))) { hit.push(pos); if (TR) TR.match(t.name, 0, pos, false); }
      });
      entry.matches = hit.length;
      return hit;
    }
    execUpdate(d) {
      const t = this.getTable(d.table);
      const ctx = newCtx(this);
      const scope = this.singleScope(t);
      const sets = d.sets.map((s) => ({ ci: this.colIndex(t, s.col), e: s.e }));
      sets.forEach((s) => this.bind(s.e, scope, null));
      const hit = this.matchRows(t, d.where, ctx);
      const env = { scope, rows: [null], parent: null };
      const newRows = hit.map((pos) => {
        env.rows[0] = t.rows[pos];
        const nr = t.rows[pos].slice();
        sets.forEach((s) => { nr[s.ci] = this.coerce(t, s.ci, this.ev(s.e, env, ctx)); });
        return nr;
      });
      const referenced = new Set();
      this.tables.forEach((o) => o.fks.forEach((f) => { if (f.refTable.toLowerCase() === t.name.toLowerCase()) (f.refIdx || []).forEach((i) => referenced.add(i)); }));
      if (sets.some((s) => referenced.has(s.ci))) hit.forEach((pos, k) => this.refuseIfReferenced(t, t.rows[pos], newRows[k]));
      hit.forEach((pos, k) => { this.checkRow(t, newRows[k], t.rows[pos]); t.rows[pos] = newRows[k]; });
      t.indexes.forEach((x) => { x.dirty = true; });
      const writes = hit.length * t.indexes.filter((x) => sets.some((s) => s.ci === x.ci)).length;
      if (TR) TR.write('update', t.name, hit.length, hit.slice(0, 30), writes, t.rows.length);
      return { kind: 'dml', affected: hit.length, message: hit.length + ' row' + (hit.length === 1 ? '' : 's') + ' updated in ' + t.name + '. ' + (writes ? writes + ' index ' + (writes === 1 ? 'entry' : 'entries') + ' had to be moved as well.' : ''), plan: ctx.plan(), stats: ctx.stats(writes) };
    }
    refuseIfReferenced(t, oldRow, newRow) {
      this.tables.forEach((o) => o.fks.forEach((f) => {
        if (f.refTable.toLowerCase() !== t.name.toLowerCase() || !f.refIdx) return;
        if (newRow && f.refIdx.every((ri) => cmpVals(oldRow[ri], newRow[ri]) === 0)) return;
        const n = o.rows.filter((r) => f.cols.every((c, k) => cmpVals(r[c], oldRow[f.refIdx[k]]) === 0)).length;
        if (n) fail("Can't change key " + f.refIdx.map((ri) => t.cols[ri].name + ' = ' + fmt(oldRow[ri])).join(', ') + ' of ' + t.name + ': ' + n + ' row(s) of ' + o.name + ' still point to it (FOREIGN KEY).');
      }));
    }
    execDelete(d) {
      const t = this.getTable(d.table);
      const ctx = newCtx(this);
      const hit = this.matchRows(t, d.where, ctx);
      const hitSet = new Set(hit);
      const hitPos = hit.slice(0, 30), sizeBefore = t.rows.length;
      let cascaded = 0;
      const removeRows = (tbl, positions) => {
        const set = new Set(positions);
        const gone = positions.map((p) => tbl.rows[p]);
        this.tables.forEach((o) => o.fks.forEach((f) => {
          if (f.refTable.toLowerCase() !== tbl.name.toLowerCase() || !f.refIdx) return;
          gone.forEach((g) => {
            const kids = [];
            o.rows.forEach((r, i) => { if (r && f.cols.every((c, k) => cmpVals(r[c], g[f.refIdx[k]]) === 0) && !(o === tbl && set.has(i))) kids.push(i); });
            if (!kids.length) return;
            if (f.onDelete === 'RESTRICT') fail("Can't delete from " + tbl.name + ': ' + kids.length + ' row(s) of ' + o.name + ' still point to ' + f.refIdx.map((ri) => tbl.cols[ri].name + ' = ' + fmt(g[ri])).join(', ') + ' (FOREIGN KEY, ON DELETE RESTRICT). Delete or change those rows first.');
            if (f.onDelete === 'SET NULL') kids.forEach((i) => { const nr = o.rows[i].slice(); f.cols.forEach((c) => { nr[c] = null; }); o.rows[i] = nr; });
            else { cascaded += kids.length; removeRows(o, kids); }
          });
        }));
        tbl.rows = tbl.rows.filter((_, i) => !set.has(i));
        tbl.indexes.forEach((x) => { x.dirty = true; });
      };
      removeRows(t, hit);
      void hitSet;
      const writes = hit.length * t.indexes.length;
      if (TR) TR.write('delete', t.name, hit.length, hitPos, writes, sizeBefore);
      return { kind: 'dml', affected: hit.length, message: hit.length + ' row' + (hit.length === 1 ? '' : 's') + ' deleted from ' + t.name + (cascaded ? ' (and ' + cascaded + ' dependent row(s) removed by ON DELETE CASCADE)' : '') + '.' + (writes ? ' ' + writes + ' index ' + (writes === 1 ? 'entry' : 'entries') + ' removed too.' : ''), plan: ctx.plan(), stats: ctx.stats(writes) };
    }

    /* ---------- SELECT */
    execSelectTop(sel) {
      const ctx = newCtx(this);
      const r = this.execSelect(sel, null, ctx, null);
      return { kind: 'select', columns: r.columns, rows: r.rows, plan: ctx.plan(), stats: ctx.stats(0, r.rows.length) };
    }

    /* Bind column references to (depth, table, column) and validate names */
    bind(e, scope, aggOk) {
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        switch (n.k) {
          case 'col': n.res = this.resolveCol(n, scope); return;
          case 'sub': case 'exists': n.scope = scope; return;
          case 'in': walk(n.e); if (n.sub) n.scope = scope; else n.list.forEach(walk); return;
          case 'bin': walk(n.l); walk(n.r); return;
          case 'neg': case 'not': case 'isnull': walk(n.e); return;
          case 'like': walk(n.e); walk(n.p); return;
          case 'between': walk(n.e); walk(n.lo); walk(n.hi); return;
          case 'fn': n.args.forEach(walk); return;
          default:
        }
      };
      walk(e);
    }
    resolveCol(n, scope) {
      let depth = 0, sc = scope;
      const label = n.table ? n.table + '.' + n.name : n.name;
      while (sc) {
        const hits = [];
        sc.tables.forEach((tb, ti) => {
          if (n.table && tb.alias.toLowerCase() !== n.table.toLowerCase()) return;
          const ci = tb.tbl.cols.findIndex((c) => c.name.toLowerCase() === n.name.toLowerCase());
          if (ci >= 0) hits.push({ depth, ti, ci });
        });
        if (hits.length > 1) fail("Column '" + n.name + "' is ambiguous: it exists in " + hits.map((h) => sc.tables[h.ti].alias).join(' and ') + '. Write it as table.column (for example ' + sc.tables[hits[0].ti].alias + '.' + n.name + ').');
        if (hits.length === 1) return hits[0];
        if (n.table && sc.tables.some((tb) => tb.alias.toLowerCase() === n.table.toLowerCase())) {
          const tb = sc.tables.find((x) => x.alias.toLowerCase() === n.table.toLowerCase());
          const m = didYouMean(n.name, tb.tbl.cols.map((c) => c.name));
          fail("Table '" + tb.alias + "' has no column '" + n.name + "'." + (m ? ' Did you mean ' + tb.alias + '.' + m + '?' : '') + ' Its columns: ' + tb.tbl.cols.map((c) => c.name).join(', ') + '.');
        }
        sc = sc.parent; depth++;
      }
      if (n.table) fail("There is no table or alias '" + n.table + "' in this query" + (scope.tables.length ? ' (it has: ' + scope.tables.map((t) => t.alias).join(', ') + ')' : '') + '.');
      const all = [];
      scope.tables.forEach((tb) => tb.tbl.cols.forEach((c) => all.push(c.name)));
      const m = didYouMean(n.name, all);
      return fail("There is no column '" + label + "' here." + (m ? ' Did you mean ' + m + '?' : '') + (all.length ? ' Columns you can use: ' + all.join(', ') + '.' : ''));
    }

    /* Which FROM tables does an expression touch? (null = contains a sub-query: handle at the last level) */
    refTables(e, out) {
      let ok = true;
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        switch (n.k) {
          case 'col': if (n.res.depth === 0) out.add(n.res.ti); return;
          case 'sub': case 'exists': ok = false; return;
          case 'in': walk(n.e); if (n.sub) ok = false; else n.list.forEach(walk); return;
          case 'bin': walk(n.l); walk(n.r); return;
          case 'neg': case 'not': case 'isnull': walk(n.e); return;
          case 'like': walk(n.e); walk(n.p); return;
          case 'between': walk(n.e); walk(n.lo); walk(n.hi); return;
          case 'fn': n.args.forEach(walk); return;
          default:
        }
      };
      walk(e);
      return ok;
    }

    /* Decide how to read table #ti: full scan or an index (sargable conjunct).  Returns an access plan. */
    planAccess(ti, scope, conj, allowWhere) {
      const tb = scope.tables[ti];
      const t = tb.tbl;
      const cands = [];
      const colOf = (n) => (n && n.k === 'col' && n.res.depth === 0 && n.res.ti === ti ? n.res.ci : -1);
      const early = (n) => { const s = new Set(); const ok = this.refTables(n, s); return ok && [...s].every((x) => x < ti); };
      conj.forEach((c) => {
        if (c.noIndex) return;
        if (c.k === 'bin' && ['=', '<', '>', '<=', '>='].includes(c.op)) {
          let ci = colOf(c.l), other = c.r, op = c.op;
          if (ci < 0) { ci = colOf(c.r); other = c.l; op = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '=': '=' }[c.op]; }
          if (ci >= 0 && early(other)) cands.push({ ci, op, other, c });
        } else if (c.k === 'between' && !c.neg && colOf(c.e) >= 0 && early(c.lo) && early(c.hi)) {
          cands.push({ ci: colOf(c.e), op: 'between', lo: c.lo, hi: c.hi, c });
        } else if (c.k === 'in' && !c.neg && c.list && colOf(c.e) >= 0 && c.list.every(early)) {
          cands.push({ ci: colOf(c.e), op: 'in', list: c.list, c });
        }
      });
      let best = null, bestScore = 0;
      t.indexes.forEach((ix) => {
        const mine = cands.filter((x) => x.ci === ix.ci);
        if (!mine.length) return;
        const eq = mine.find((x) => x.op === '=');
        const inn = mine.find((x) => x.op === 'in');
        let plan, score;
        if (eq) { plan = { type: 'eq', ix, other: eq.other, cond: ix.table.cols[ix.ci].name + ' = ?' }; score = 4 + (ix.unique ? 1 : 0); }
        else if (inn) { plan = { type: 'in', ix, list: inn.list, cond: ix.table.cols[ix.ci].name + ' IN (...)' }; score = 3; }
        else {
          const lo = mine.find((x) => x.op === '>' || x.op === '>=' || x.op === 'between');
          const hi = mine.find((x) => x.op === '<' || x.op === '<=' || x.op === 'between');
          const parts = [];
          const nm = ix.table.cols[ix.ci].name;
          if (lo && lo.op === 'between') parts.push(nm + ' BETWEEN ? AND ?');
          else { if (lo) parts.push(nm + lo.op + '?'); if (hi) parts.push(nm + hi.op + '?'); }
          plan = { type: 'range', ix, lo, hi, cond: parts.join(' AND ') }; score = lo && hi ? 2 : 1;
        }
        if (score > bestScore) { best = plan; bestScore = score; }
      });
      void allowWhere;
      return best ? Object.assign({ kind: 'index' }, best) : { kind: 'scan' };
    }

    /* Read the candidate row positions for table #ti under the current outer rows (env). Updates the plan entry. */
    fetch(acc, t, env, ctx, entry, ti) {
      entry.loops++;
      if (acc.kind === 'scan') {
        entry.rowsRead += t.rows.length; ctx.read(t.rows.length);
        if (TR) TR.access({ ti: ti || 0, table: t.name, alias: entry.alias, loop: entry.loops, mode: 'scan', index: null, cond: null, tableRows: t.rows.length, rows: t.rows.length, steps: 0, sub: entry.sub });
        return t.rows.map((_, i) => i);
      }
      const ix = acc.ix;
      const val = (e) => this.ev(e, env, ctx);
      let ids = [], steps = 0, keyDesc = '';
      const rec = TR ? [] : null;
      const add = (r) => { ids = ids.concat(r.ids); steps += r.steps; };
      if (acc.type === 'eq') { const v = val(acc.other); keyDesc = '= ' + fmt(v); if (v !== null) add(this.probe(ix, v, true, v, true, rec)); }
      else if (acc.type === 'in') {
        const seen = new Set();
        acc.list.forEach((e) => { const v = val(e); if (v === null || seen.has(JSON.stringify(v))) return; seen.add(JSON.stringify(v)); keyDesc += (keyDesc ? ', ' : 'IN ') + fmt(v); add(this.probe(ix, v, true, v, true, rec)); });
      } else {
        let lo, loInc = true, hi, hiInc = true, nullBound = false;
        const setLo = (x) => { if (x.op === 'between') { lo = val(x.lo); loInc = true; } else { lo = val(x.other); loInc = x.op === '>='; } if (lo === null) nullBound = true; };
        const setHi = (x) => { if (x.op === 'between') { hi = val(x.hi); hiInc = true; } else { hi = val(x.other); hiInc = x.op === '<='; } if (hi === null) nullBound = true; };
        if (acc.lo) setLo(acc.lo);
        if (acc.hi) setHi(acc.hi);
        keyDesc = (lo !== undefined && lo !== null ? (loInc ? '>= ' : '> ') + fmt(lo) : '') + (lo !== undefined && lo !== null && hi !== undefined && hi !== null ? ' and ' : '') + (hi !== undefined && hi !== null ? (hiInc ? '<= ' : '< ') + fmt(hi) : '');
        if (!nullBound) add(this.probe(ix, lo === null ? undefined : lo, loInc, hi === null ? undefined : hi, hiInc, rec));
      }
      entry.indexSteps += steps; entry.rowsRead += ids.length; ctx.read(ids.length + steps);
      if (TR) {
        const en = ix.entries, L = Math.min(6, Math.max(1, en.length)), bounds = [];
        for (let j = 0; j < L; j++) bounds.push(en.length ? en[Math.floor(j * en.length / L)][0] : null);
        TR.access({ ti: ti || 0, table: t.name, alias: entry.alias, loop: entry.loops, mode: 'index', index: ix.name, cond: entry.cond, key: keyDesc, tableRows: t.rows.length, rows: ids.length, steps, sub: entry.sub, ixSize: en.length, leaves: L, bounds });
        rec.forEach((r) => TR.step(ix.name, r));
      }
      return ids;
    }

    execSelect(sel, parentEnv, ctx, parentScope) {
      const tablesInScope = sel.from.map((f) => { const t = this.getTable(f.name); return { alias: f.alias, name: f.name, tbl: t }; });
      const seenAlias = new Set();
      tablesInScope.forEach((tb) => { const k = tb.alias.toLowerCase(); if (seenAlias.has(k)) fail("The name '" + tb.alias + "' is used for two tables in FROM. Give one of them an alias: FROM " + tb.name + ' AS x.'); seenAlias.add(k); });
      const scope = { tables: tablesInScope, parent: parentScope || null };
      const n = tablesInScope.length;

      // expand * and bind everything
      const items = [];
      sel.items.forEach((it) => {
        if (it.star) {
          if (!n) fail('SELECT * needs a FROM clause.');
          tablesInScope.forEach((tb, ti) => {
            if (it.table && tb.alias.toLowerCase() !== it.table.toLowerCase()) return;
            tb.tbl.cols.forEach((c, ci) => items.push({ expr: { k: 'col', table: tb.alias, name: c.name, res: { depth: 0, ti, ci } }, alias: c.name }));
          });
          if (it.table && !items.length) fail("There is no table or alias '" + it.table + "' to expand '" + it.table + ".*'.");
        } else { this.bind(it.expr, scope); items.push({ expr: it.expr, alias: it.alias }); }
      });
      const aliasMap = new Map();
      items.forEach((it) => { if (it.alias) aliasMap.set(it.alias.toLowerCase(), it.expr); });
      const resolveAlias = (e, allowAlias) => {
        if (e.k === 'num' && Number.isInteger(e.v)) {
          if (e.v < 1 || e.v > items.length) fail('Column number ' + e.v + " is out of range: the SELECT list has " + items.length + ' column(s).');
          return items[e.v - 1].expr;
        }
        if (allowAlias && e.k === 'col' && !e.table && aliasMap.has(e.name.toLowerCase())) return aliasMap.get(e.name.toLowerCase());
        this.bind(e, scope); return e;
      };
      const whereConj = sel.where ? flattenAnd(sel.where) : [];
      whereConj.forEach((c) => this.bind(c, scope));
      sel.from.forEach((f) => { if (f.on) flattenAnd(f.on).forEach((c) => this.bind(c, scope)); });
      const groupBy = sel.groupBy.map((e) => {
        if (e.k === 'col' && !e.table && aliasMap.has(e.name.toLowerCase())) {
          let real = false; tablesInScope.forEach((tb) => { if (this.colIndex(tb.tbl, e.name, true) >= 0) real = true; });
          if (!real) return aliasMap.get(e.name.toLowerCase());
        }
        return resolveAlias(e, false);
      });
      if (sel.having) this.bind(sel.having, scope);
      const orderBy = sel.orderBy.map((o) => ({ expr: resolveAlias(o.expr, true), desc: o.desc }));

      const hasAgg = (e) => { let f = false; const w = (x) => { if (!x || typeof x !== 'object' || f) return; if (x.k === 'fn' && AGG.has(x.name)) { f = true; return; } ['e', 'l', 'r', 'p', 'lo', 'hi'].forEach((k) => w(x[k])); (x.args || []).forEach(w); (x.list || []).forEach(w); }; w(e); return f; };
      whereConj.forEach((c) => { if (hasAgg(c)) fail("Aggregate functions (COUNT, SUM, ...) can't be used in WHERE, because WHERE runs before the groups exist. Use HAVING for conditions on groups, or a sub-query: WHERE x > (SELECT AVG(x) FROM ...)."); });
      // classify conjuncts by the join level at which they can be evaluated
      const levels = tablesInScope.map(() => ({ join: [], where: [], onAll: [] }));
      const place = (c, extraOnly, ti) => {
        const set = new Set(); const ok = this.refTables(c, set);
        let lv = ok ? (set.size ? Math.max(...set) : 0) : n - 1;
        if (extraOnly) lv = Math.max(lv, ti);
        return lv;
      };
      whereConj.forEach((c) => { const lv = place(c); if (n) { if (sel.from[lv].join === 'left') levels[lv].where.push(c); else levels[lv].join.push(c); } });
      sel.from.forEach((f, ti) => {
        if (!f.on) return;
        flattenAnd(f.on).forEach((c) => {
          if (f.join === 'left') levels[ti].join.push(c);
          else { const lv = place(c, true, ti); levels[lv].join.push(c); }
          levels[ti].onAll.push(c);
        });
      });
      // access path per level: index only from conjuncts that are safe for that join type
      const access = tablesInScope.map((tb, ti) => {
        const usable = sel.from[ti].join === 'left' ? levels[ti].onAll.slice() : whereConj.concat(...sel.from.map((f, j) => (f.join === 'left' ? [] : levels[j].onAll)));
        const safeUsable = sel.from[ti].join === 'left' ? usable : usable.filter((c) => {
          // a WHERE conjunct that mentions a LEFT-joined table must not drive an earlier table's access
          return true;
        });
        return this.planAccess(ti, scope, safeUsable, true);
      });
      const entries = tablesInScope.map((tb, ti) => ctx.entry(tb.tbl, tb.alias, access[ti], parentEnv ? 'sub' : null));

      // nested-loop join
      const envRows = [];
      const cur = new Array(n).fill(null);
      const mkEnv = () => ({ scope, rows: cur, parent: parentEnv });
      const enough = null; void enough;
      const loop = (ti) => {
        if (ti === n) { envRows.push(cur.slice()); if (envRows.length > 400000) fail('This query builds more than 400,000 intermediate rows. Add a join condition (ON ...) or a WHERE filter.'); return; }
        const tb = tablesInScope[ti], t = tb.tbl;
        const env = mkEnv();
        const cand = this.fetch(access[ti], t, env, ctx, entries[ti], ti);
        let matched = false;
        for (let k = 0; k < cand.length; k++) {
          cur[ti] = t.rows[cand[k]];
          if (TR) TR.row(t.name, ti, cand[k], cur[ti], access[ti].kind === 'scan' ? 'scan' : 'index', !!parentEnv);
          let ok = true;
          for (const c of levels[ti].join) { if (!truthy(this.ev(c, env, ctx))) { ok = false; break; } }
          if (!ok) continue;
          matched = true;
          let wok = true;
          for (const c of levels[ti].where) { if (!truthy(this.ev(c, env, ctx))) { wok = false; break; } }
          if (wok) { entries[ti].matches++; if (TR) TR.match(t.name, ti, cand[k], ti === n - 1 && !parentEnv); loop(ti + 1); }
        }
        if (!matched && sel.from[ti].join === 'left') {
          cur[ti] = null;
          let wok = true;
          for (const c of levels[ti].where) { if (!truthy(this.ev(c, env, ctx))) { wok = false; break; } }
          if (wok) { entries[ti].matches++; if (TR) TR.match(t.name, ti, -1, ti === n - 1 && !parentEnv); loop(ti + 1); }
        }
        cur[ti] = null;
      };
      let srcRows;
      if (n === 0) {
        srcRows = [[]];
        if (whereConj.some((c) => !truthy(this.ev(c, { scope, rows: [], parent: parentEnv }, ctx)))) srcRows = [];
      } else { loop(0); srcRows = envRows; }

      // aggregation
      const aggregated = groupBy.length > 0 || items.some((it) => hasAgg(it.expr)) || (sel.having && hasAgg(sel.having)) || orderBy.some((o) => hasAgg(o.expr));
      sel.from.forEach((f) => { if (f.on && hasAgg(f.on)) fail("Aggregate functions can't be used in an ON condition."); });
      if (sel.having && !aggregated) fail('HAVING needs GROUP BY or an aggregate function such as COUNT(*).');
      if (aggregated) {
        const gkeys = groupBy.map((g) => g.k === 'col' ? g.res.depth + ':' + g.res.ti + '.' + g.res.ci : null);
        const check = (e, where) => {
          const w = (x) => {
            if (!x || typeof x !== 'object') return;
            if (x.k === 'fn' && AGG.has(x.name)) return;
            if (x.k === 'col') {
              if (x.res.depth > 0) return;
              if (gkeys.includes('0:' + x.res.ti + '.' + x.res.ci)) return;
              fail("Column '" + (x.table ? x.table + '.' : '') + x.name + "' in " + where + ' must appear in GROUP BY or be inside an aggregate function (COUNT, SUM, AVG, MIN, MAX). Otherwise the database would not know which row of the group to show.');
            }
            if (groupBy.some((g) => g.k !== 'col' && exprToSql(g) === exprToSql(x))) return;
            ['e', 'l', 'r', 'p', 'lo', 'hi'].forEach((k) => w(x[k])); (x.args || []).forEach(w); (x.list || []).forEach(w);
          };
          w(e);
        };
        items.forEach((it) => check(it.expr, 'the SELECT list'));
        if (sel.having) check(sel.having, 'HAVING');
        orderBy.forEach((o) => check(o.expr, 'ORDER BY'));
      }

      // build output "contexts" (an env per output row)
      let ctxs;
      if (aggregated) {
        const groups = new Map();
        srcRows.forEach((r) => {
          const env = { scope, rows: r, parent: parentEnv };
          const key = JSON.stringify(groupBy.map((g) => this.ev(g, env, ctx)));
          if (TR) TR.group(key, !groups.has(key));
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(r);
        });
        if (!groupBy.length && !groups.size) groups.set('', []);
        ctx.note('GROUP BY', (groupBy.length ? srcRows.length + ' rows put into ' + groups.size + ' group(s)' : 'one group over ' + srcRows.length + ' rows') + ' (no index needed: hashing in memory)');
        ctxs = [];
        groups.forEach((rows) => {
          const first = rows[0] || new Array(n).fill(null);
          ctxs.push({ scope, rows: first, parent: parentEnv, group: rows.map((r) => ({ scope, rows: r, parent: parentEnv })) });
        });
        if (sel.having) ctxs = ctxs.filter((e) => truthy(this.ev(sel.having, e, ctx)));
      } else {
        ctxs = srcRows.map((r) => ({ scope, rows: r, parent: parentEnv }));
      }

      let out = ctxs.map((e) => ({ vals: items.map((it) => this.ev(it.expr, e, ctx)), keys: orderBy.map((o) => this.ev(o.expr, e, ctx)) }));
      if (sel.distinct) {
        const seen = new Set();
        out = out.filter((o) => { const k = JSON.stringify(o.vals); if (seen.has(k)) return false; seen.add(k); return true; });
      }
      if (orderBy.length) {
        out = out.map((o, i) => ({ o, i }));
        out.sort((a, b) => {
          for (let k = 0; k < orderBy.length; k++) { const c = cmpVals(a.o.keys[k], b.o.keys[k]); if (c) return orderBy[k].desc ? -c : c; }
          return a.i - b.i;
        });
        out = out.map((x) => x.o);
        if (TR) TR.push('sort', { t: 'sort', rows: out.length }, false);
        ctx.note('SORT', 'ORDER BY ' + orderBy.map((o) => exprToSql(o.expr) + (o.desc ? ' DESC' : '')).join(', ') + ': sorted ' + out.length + ' result rows in memory');
      }
      const off = sel.offset || 0;
      if (sel.limit !== null) out = out.slice(off, off + sel.limit); else if (off) out = out.slice(off);
      if (TR && !parentEnv) out.forEach((o, i) => TR.emit(i, o.vals));
      const columns = items.map((it) => it.alias || (it.expr.k === 'col' ? it.expr.name : exprToSql(it.expr)));
      return { columns, rows: out.map((o) => o.vals) };
    }

    /* ---------- expression evaluation */
    ev(e, env, ctx) {
      switch (e.k) {
        case 'num': case 'str': return e.v;
        case 'null': return null;
        case 'col': {
          let en = env; for (let d = 0; d < e.res.depth; d++) { en = en.parent; en.usedByInner = true; }
          const r = en.rows[e.res.ti];
          return r ? r[e.res.ci] : null;
        }
        case 'neg': { const v = this.ev(e.e, env, ctx); return v === null ? null : -toNumber(v, 'unary minus'); }
        case 'not': { const v = this.ev(e.e, env, ctx); return v === null ? null : (truthy(v) ? 0 : 1); }
        case 'isnull': { const v = this.ev(e.e, env, ctx); return (v === null) !== e.neg ? 1 : 0; }
        case 'bin': return this.evBin(e, env, ctx);
        case 'like': {
          const v = this.ev(e.e, env, ctx), p = this.ev(e.p, env, ctx);
          if (v === null || p === null) return null;
          const m = likeRegex(p).test(String(v)); return m !== e.neg ? 1 : 0;
        }
        case 'between': {
          const v = this.ev(e.e, env, ctx), lo = this.ev(e.lo, env, ctx), hi = this.ev(e.hi, env, ctx);
          if (v === null || lo === null || hi === null) return null;
          const m = cmpVals(v, lo) >= 0 && cmpVals(v, hi) <= 0; return m !== e.neg ? 1 : 0;
        }
        case 'in': {
          const v = this.ev(e.e, env, ctx);
          let vals;
          if (e.sub) vals = this.subQuery(e, env, ctx, 'column').map((r) => r[0]);
          else vals = e.list.map((x) => this.ev(x, env, ctx));
          if (v === null) return null;
          let sawNull = false;
          for (const x of vals) { if (x === null) sawNull = true; else if (cmpVals(x, v) === 0) return e.neg ? 0 : 1; }
          if (sawNull) return null;
          return e.neg ? 1 : 0;
        }
        case 'sub': {
          const rows = this.subQuery(e, env, ctx, 'scalar');
          if (rows.length > 1) fail('A sub-query used as a single value returned ' + rows.length + ' rows. Use IN (...) instead of =, or make the sub-query return one row (for example with MIN/MAX/AVG).');
          return rows.length ? rows[0][0] : null;
        }
        case 'exists': { const rows = this.subQuery(e, env, ctx, 'any'); return (rows.length > 0) !== e.neg ? 1 : 0; }
        case 'fn': return this.evFn(e, env, ctx);
        default: return fail('Unsupported expression.');
      }
    }
    subQuery(e, env, ctx, mode) {
      if (e.cache) return e.cache;
      const marker = { used: false };
      // run the inner SELECT; an inner reference to an outer row flips marker through usedByInner on our env
      env.usedByInner = false;
      const r = this.execSelect(e.sel || e.sub, env, ctx, e.scope);
      if (mode !== 'any' && r.columns.length !== 1) fail('A sub-query used here must return exactly one column, but it returns ' + r.columns.length + '.');
      const correlated = env.usedByInner;
      void marker;
      if (!correlated) e.cache = r.rows;
      return r.rows;
    }
    evBin(e, env, ctx) {
      const op = e.op;
      if (op === 'AND') {
        const a = this.ev(e.l, env, ctx);
        if (a !== null && !truthy(a)) return 0;
        const b = this.ev(e.r, env, ctx);
        if (b !== null && !truthy(b)) return 0;
        return a === null || b === null ? null : 1;
      }
      if (op === 'OR') {
        const a = this.ev(e.l, env, ctx);
        if (a !== null && truthy(a)) return 1;
        const b = this.ev(e.r, env, ctx);
        if (b !== null && truthy(b)) return 1;
        return a === null || b === null ? null : 0;
      }
      const a = this.ev(e.l, env, ctx), b = this.ev(e.r, env, ctx);
      if (a === null || b === null) return null;
      switch (op) {
        case '=': return cmpVals(a, b) === 0 ? 1 : 0;
        case '<>': return cmpVals(a, b) !== 0 ? 1 : 0;
        case '<': return cmpVals(a, b) < 0 ? 1 : 0;
        case '>': return cmpVals(a, b) > 0 ? 1 : 0;
        case '<=': return cmpVals(a, b) <= 0 ? 1 : 0;
        case '>=': return cmpVals(a, b) >= 0 ? 1 : 0;
        case '||': return String(a) + String(b);
        default: break;
      }
      const x = toNumber(a, op), y = toNumber(b, op);
      switch (op) {
        case '+': return x + y;
        case '-': return x - y;
        case '*': return x * y;
        case '/': if (y === 0) return null; if (e.realDiv === undefined) e.realDiv = this.isReal(e.l, env) || this.isReal(e.r, env); return (!e.realDiv && Number.isInteger(x) && Number.isInteger(y)) ? Math.trunc(x / y) : x / y;
        case '%': if (y === 0) return null; return x % y;
        default: return fail('Unsupported operator ' + op);
      }
    }
    /* Is this expression a REAL (decimal) value?  Needed because 7/2 is 3 (whole numbers) but 7.0/2 is 3.5. */
    isReal(e, env) {
      switch (e.k) {
        case 'num': return !!e.real;
        case 'col': { let en = env; for (let d = 0; d < e.res.depth; d++) en = en.parent; return en.scope.tables[e.res.ti].tbl.cols[e.res.ci].type === 'REAL'; }
        case 'neg': return this.isReal(e.e, env);
        case 'bin': return ['+', '-', '*', '/', '%'].includes(e.op) && (this.isReal(e.l, env) || this.isReal(e.r, env));
        case 'fn': return e.name === 'AVG' || e.name === 'ROUND' || ((e.name === 'SUM' || e.name === 'MIN' || e.name === 'MAX' || e.name === 'ABS' || e.name === 'COALESCE') && e.args.some((a) => this.isReal(a, env)));
        default: return false;
      }
    }
    evFn(e, env, ctx) {
      if (AGG.has(e.name)) {
        if (!env.group) fail('Aggregate function ' + e.name + ' is not allowed here.');
        if (e.star) return env.group.length;
        let vals = env.group.map((g) => this.ev(e.args[0], g, ctx)).filter((v) => v !== null);
        if (e.distinct) { const s = new Set(); vals = vals.filter((v) => { const k = JSON.stringify(v); if (s.has(k)) return false; s.add(k); return true; }); }
        switch (e.name) {
          case 'COUNT': return vals.length;
          case 'SUM': return vals.length ? vals.reduce((a, v) => a + toNumber(v, 'SUM'), 0) : null;
          case 'AVG': return vals.length ? vals.reduce((a, v) => a + toNumber(v, 'AVG'), 0) / vals.length : null;
          case 'MIN': return vals.length ? vals.reduce((a, v) => (cmpVals(v, a) < 0 ? v : a)) : null;
          default: return vals.length ? vals.reduce((a, v) => (cmpVals(v, a) > 0 ? v : a)) : null;
        }
      }
      const a = e.args.map((x) => this.ev(x, env, ctx));
      if (e.name === 'COALESCE') { for (const v of a) if (v !== null) return v; return null; }
      if (a[0] === null) return null;
      switch (e.name) {
        case 'UPPER': return String(a[0]).toUpperCase();
        case 'LOWER': return String(a[0]).toLowerCase();
        case 'LENGTH': return String(a[0]).length;
        case 'ABS': return Math.abs(toNumber(a[0], 'ABS'));
        case 'ROUND': {
          const d = a.length > 1 ? toNumber(a[1], 'ROUND') : 0, m = Math.pow(10, d), x = toNumber(a[0], 'ROUND');
          return Math.sign(x) * Math.round(Math.abs(x) * m + 1e-9) / m;
        }
        default: {                                    // SUBSTR(s, start[, len]), 1-based like SQL
          const s = String(a[0]); let st = toNumber(a[1], 'SUBSTR'); let len = a.length > 2 ? toNumber(a[2], 'SUBSTR') : s.length;
          if (st < 0) st = Math.max(0, s.length + st) + 1; else if (st === 0) { len -= 1; st = 1; }
          return s.substr(st - 1, Math.max(0, len));
        }
      }
    }

    /* ---------- schema for the browser */
    describe() {
      return [...this.tables.values()].map((t) => ({
        name: t.name, rowCount: t.rows.length,
        columns: t.cols.map((c, i) => ({ name: c.name, type: c.declared, pk: t.pk.includes(i), notNull: c.notNull && !t.pk.includes(i), unique: t.uniques.some((u) => u.length === 1 && u[0] === i),
          fk: (t.fks.find((f) => f.cols.length === 1 && f.cols[0] === i) || {}).refTable || null })),
        compositeFks: t.fks.filter((f) => f.cols.length > 1).map((f) => '(' + f.cols.map((i) => t.cols[i].name).join(', ') + ') -> ' + f.refTable),
        checks: t.checks.map((c) => c.text),
        indexes: t.indexes.map((x) => ({ name: x.name, column: t.cols[x.ci].name, unique: x.unique, auto: x.auto }))
      }));
    }
  }

  function flattenAnd(e) { return e.k === 'bin' && e.op === 'AND' ? flattenAnd(e.l).concat(flattenAnd(e.r)) : [e]; }
  function fmt(v) { return v === null ? 'NULL' : typeof v === 'string' ? "'" + v + "'" : String(v); }

  /* ---------------------------------------------------------------- execution trace (Database.trace)
     While trace() runs, the executor reports what it really does, in order:
       stmt, access (a table is opened: scan or index lookup; one per join probe), step (one index comparison),
       row (one table row read), match (a row passed the filters), group, sort, emit (a result row), check, write,
       build (CREATE INDEX), done (the engine's own stats for the statement), error.
     counts.row / counts.step are exact and equal stats.rowsRead / stats.indexSteps; only the *stored* bulk events
     are capped (skipped tells how many were dropped), so animations stay light on big tables. */
  const TRACE_CAP = 6000;
  let TR = null;
  function splitSql(sql) {
    const out = []; let cur = '', q = null;
    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      if (q) { cur += ch; if (ch === q) q = null; continue; }
      if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
      if (ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function pv(v) { return v === null ? 'NULL' : typeof v === 'string' ? (v.length > 12 ? v.slice(0, 11) + '…' : v) : v; }
  function makeTrace(sql) {
    const pieces = splitSql(sql || '');
    const tr = { events: [], counts: { stmt: 0, access: 0, step: 0, row: 0, match: 0, group: 0, emit: 0, write: 0, sort: 0, lastMatch: 0 }, skipped: {}, truncated: false, stmts: [], started: false, bulk: 0, emitStored: 0 };
    tr.push = (type, ev, bulk) => {
      if (tr.counts[type] !== undefined) tr.counts[type]++;
      if (bulk === 'emit') {
        if (tr.emitStored >= 400) { tr.skipped[type] = (tr.skipped[type] || 0) + 1; tr.truncated = true; return; }
        tr.emitStored++;
      } else if (bulk) {
        if (tr.bulk >= TRACE_CAP) { tr.skipped[type] = (tr.skipped[type] || 0) + 1; tr.truncated = true; return; }
        tr.bulk++;
      }
      tr.events.push(ev);
    };
    tr.stmt = (st) => {
      tr.started = true;
      const i = tr.counts.stmt;
      tr.cur = { i, kind: st.kind, text: pieces.length ? pieces[i] || '' : '', before: Object.assign({}, tr.counts) };
      tr.stmts.push(tr.cur);
      tr.push('stmt', { t: 'stmt', i, kind: st.kind, text: tr.cur.text }, false);
    };
    tr.done = (r) => {
      const c = tr.cur, b = c.before, n = tr.counts;
      const rows = n.row - b.row, steps = n.step - b.step;
      c.rows = rows; c.steps = steps; c.matches = n.match - b.match; c.groups = n.group - b.group; c.sorts = n.sort - b.sort; c.lastMatches = n.lastMatch - b.lastMatch; c.emitted = n.emit - b.emit; c.accesses = n.access - b.access;
      c.reported = r.stats ? { rowsRead: r.stats.rowsRead, indexSteps: r.stats.indexSteps } : null;
      tr.push('done', { t: 'done', i: c.i, kind: r.kind, rowsRead: r.stats && r.stats.rowsRead !== undefined ? r.stats.rowsRead : null, indexSteps: r.stats && r.stats.indexSteps !== undefined ? r.stats.indexSteps : null,
        returned: r.kind === 'select' || r.kind === 'explain' ? r.rows.length : (r.affected !== undefined ? r.affected : null), message: r.message || null }, false);
    };
    tr.access = (o) => tr.push('access', Object.assign({ t: 'access', stmt: tr.counts.stmt - 1 }, o), true);
    tr.step = (index, r) => tr.push('step', { t: 'step', index, phase: r.phase, pos: r.pos, key: r.key }, true);
    tr.row = (table, ti, pos, row, via, sub) => tr.push('row', { t: 'row', table, ti, pos, via, sub, v: tr.bulk < TRACE_CAP ? row.slice(0, 4).map(pv) : null }, true);
    tr.match = (table, ti, pos, last) => { if (last) tr.counts.lastMatch++; tr.push('match', { t: 'match', table, ti, pos, last }, true); };
    tr.group = (key, isNew) => tr.push('group', { t: 'group', key: key.length > 24 ? key.slice(0, 23) + '…' : key, isNew }, true);
    tr.emit = (i, vals) => tr.push('emit', { t: 'emit', i, v: i < 4 ? vals.slice(0, 4).map(pv) : null }, 'emit');
    tr.write = (op, table, rows, pos, indexWrites, tableRows) => {
      tr.push('check', { t: 'check', table, op }, false);
      tr.push('write', { t: 'write', op, table, rows, pos, indexWrites, tableRows }, false);
    };
    return tr;
  }

  /* execution context: counts the work and records the plan */
  const READ_LIMIT = 3000000;
  function newCtx(db) {
    const steps = [];
    let reads = 0;
    return {
      db,
      read(n) { reads += n; if (reads > READ_LIMIT) fail('This query would look at more than 3 million rows, so the lab stopped it. Add a WHERE condition, a join condition or an index.'); },
      entry(t, alias, acc, sub) {
        const e = { kind: acc.kind === 'scan' ? 'scan' : 'search', table: t.name, alias, tableRows: t.rows.length, index: acc.kind === 'index' ? acc.ix.name : null,
          cond: acc.kind === 'index' ? acc.cond : null, loops: 0, rowsRead: 0, indexSteps: 0, matches: 0, sub: !!sub };
        const old = steps.find((x) => x.table === e.table && x.alias === e.alias && x.index === e.index && x.cond === e.cond && x.sub === e.sub && x.kind === e.kind);
        if (old) return old;
        steps.push(e); return e;
      },
      note(title, detail) { if (!steps.some((x) => x.kind === 'note' && x.title === title)) steps.push({ kind: 'note', title, detail }); },
      plan() { return steps; },
      stats(indexWrites, returned) {
        let scanned = 0, full = 0, idxSteps = 0;
        steps.forEach((s) => { if (s.kind === 'scan' || s.kind === 'search') { scanned += s.rowsRead; idxSteps += s.indexSteps; full += s.loops * s.tableRows; } });
        return { rowsRead: scanned, indexSteps: idxSteps, work: scanned + idxSteps, fullScanWork: full, rowsReturned: returned === undefined ? null : returned, indexWrites: indexWrites || 0 };
      }
    };
  }

  /* ---------------------------------------------------------------- sample databases */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DATASETS = {
    university: {
      title: 'University — students, courses, enrolments',
      blurb: 'The STUDENTS / COURSES figure from the lecture, fixed up: a third table, enrolments, joins the two (one student ↔ many enrolments, one course ↔ many enrolments).',
      ddl: `CREATE TABLE students (
  student_id INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  year       INTEGER CHECK (year BETWEEN 1 AND 4),
  gpa        REAL,
  email      TEXT UNIQUE,
  city       TEXT
);
CREATE TABLE courses (
  course_id   TEXT PRIMARY KEY,
  course_name TEXT NOT NULL,
  credits     INTEGER
);
CREATE TABLE enrolments (
  student_id INTEGER REFERENCES students(student_id),
  course_id  TEXT REFERENCES courses(course_id),
  grade      REAL,
  PRIMARY KEY (student_id, course_id)
);`,
      data: {
        students: [[211001, 'An', 1, 3.5, 'an@uni.edu', 'Hanoi'], [211002, 'Binh', 2, 3.8, 'binh@uni.edu', 'Da Nang'], [211003, 'Colin', 3, 3.1, 'colin@uni.edu', 'Hanoi'],
          [211004, 'Daisy', 4, 3.9, 'daisy@uni.edu', null], [211005, 'Binh', 1, 2.7, 'binh2@uni.edu', 'Hue'], [211006, 'Em', 2, 3.3, 'em@uni.edu', 'Da Nang'],
          [211007, 'Phuc', 3, 2.4, 'phuc@uni.edu', 'Can Tho'], [211008, 'Giang', 1, null, 'giang@uni.edu', 'Hanoi'], [211009, 'Hoa', 2, 3.6, 'hoa@uni.edu', 'Hue'],
          [211010, 'Khoa', 4, 3.0, 'khoa@uni.edu', 'Can Tho']],
        courses: [['CS101', 'Intro to CS', 3], ['MA101', 'Calculus I', 4], ['CS102', 'Data structures', 3], ['PH101', 'Physics I', 3], ['EN101', 'Academic English', 2]],
        enrolments: [[211001, 'MA101', 8.5], [211001, 'CS102', 7.0], [211002, 'CS101', 9.0], [211002, 'MA101', 8.0], [211002, 'CS102', 9.5], [211003, 'CS102', 6.5],
          [211003, 'PH101', 7.5], [211004, 'CS101', 9.5], [211004, 'CS102', 10.0], [211005, 'MA101', 5.5], [211005, 'EN101', 6.0], [211006, 'CS101', 7.0],
          [211006, 'PH101', null], [211007, 'MA101', 4.5], [211007, 'EN101', 5.0], [211009, 'CS101', 8.5], [211009, 'MA101', 9.0], [211010, 'PH101', 6.0], [211010, 'CS102', 7.5]]
      },
      examples: [
        { label: 'Everything about students', sql: 'SELECT * FROM students;', note: 'The star means "all columns". Each row is one student, each column one attribute.' },
        { label: 'Pick columns and rows', sql: "SELECT name, gpa FROM students WHERE year = 2 AND gpa >= 3.3 ORDER BY gpa DESC;", note: 'WHERE filters rows, the column list filters columns, ORDER BY sorts the result.' },
        { label: 'Two students named Binh', sql: "SELECT * FROM students WHERE name = 'Binh';", note: 'Why a name is a bad primary key: it is not unique. The student_id is.' },
        { label: 'Bad primary key demo', sql: "CREATE TABLE people (name TEXT PRIMARY KEY, year INTEGER);\nINSERT INTO people VALUES ('Binh', 2);\nINSERT INTO people VALUES ('Binh', 1);", note: 'The second INSERT is refused: a PRIMARY KEY must be unique, but two real students can share a name.' },
        { label: 'Join: who takes what', sql: "SELECT s.name, c.course_name, e.grade\nFROM students s\nJOIN enrolments e ON e.student_id = s.student_id\nJOIN courses c ON c.course_id = e.course_id\nORDER BY s.name, c.course_name;", note: 'Foreign keys let three small tables answer one question. The ON conditions match a foreign key to the primary key it points at.' },
        { label: 'Average grade per course', sql: "SELECT c.course_name, COUNT(*) AS takers, AVG(e.grade) AS avg_grade\nFROM courses c JOIN enrolments e ON e.course_id = c.course_id\nGROUP BY c.course_name\nORDER BY avg_grade DESC;", note: 'GROUP BY makes one row per course. AVG ignores the NULL grade.' },
        { label: 'Courses with 3+ students', sql: "SELECT course_id, COUNT(*) AS takers\nFROM enrolments\nGROUP BY course_id\nHAVING COUNT(*) >= 3;", note: 'WHERE filters rows before grouping; HAVING filters groups after.' },
        { label: 'Above-average GPA (sub-query)', sql: "SELECT name, gpa FROM students\nWHERE gpa > (SELECT AVG(gpa) FROM students)\nORDER BY gpa DESC;", note: 'You cannot write WHERE gpa > AVG(gpa). The inner query computes the average first.' },
        { label: 'Break a foreign key', sql: "INSERT INTO enrolments VALUES (999999, 'CS101', 8.0);", note: 'No student 999999 exists, so the database refuses the row. That is referential integrity.' }
      ]
    },
    canteen: {
      title: 'Canteen — 2 000 generated orders (index demo)',
      blurb: 'customers (100 rows) and orders (2 000 rows, generated with a fixed seed, so everyone sees the same numbers). Use it to watch an index cut the rows read.',
      ddl: `CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  faculty     TEXT
);
CREATE TABLE orders (
  order_id    INTEGER PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(customer_id),
  item        TEXT,
  qty         INTEGER,
  price       REAL,
  day         TEXT
);`,
      generate(db) {
        const rnd = mulberry32(2026);
        const pick = (a) => a[Math.floor(rnd() * a.length)];
        const first = ['An', 'Binh', 'Chi', 'Dung', 'Giang', 'Hoa', 'Khanh', 'Lan', 'Minh', 'Nam', 'Oanh', 'Phuc', 'Quynh', 'Son', 'Thao', 'Uyen', 'Vy', 'Yen'];
        const last = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo'];
        const fac = ['Computer Science', 'Mechanical', 'Electrical', 'Civil', 'Chemical', 'Applied Science'];
        const customers = [];
        for (let i = 1; i <= 100; i++) customers.push([i, pick(last) + ' ' + pick(first), pick(fac)]);
        const menu = [['Pho', 3.0], ['Com tam', 2.5], ['Banh mi', 1.2], ['Bun cha', 3.2], ['Tra da', 0.5], ['Ca phe sua', 1.0], ['Che', 0.9], ['Mi xao', 2.4], ['Nuoc mia', 0.8], ['Goi cuon', 1.5]];
        const orders = [];
        for (let i = 1; i <= 2000; i++) {
          const m = pick(menu), d = 1 + Math.floor(rnd() * 60);
          const date = d <= 30 ? '2026-09-' + String(d).padStart(2, '0') : '2026-10-' + String(d - 30).padStart(2, '0');
          orders.push([i, 1 + Math.floor(rnd() * 100), m[0], 1 + Math.floor(rnd() * 4), m[1], date]);
        }
        db.load('customers', customers); db.load('orders', orders);
      },
      examples: [
        { label: '1 · Find one order (primary key)', sql: 'SELECT * FROM orders WHERE order_id = 1500;', note: 'order_id is the PRIMARY KEY, so the lab built an index for it automatically. Look at the plan: about a dozen index steps and ONE row read, out of 2 000.' },
        { label: '2 · One customer, no index', sql: 'SELECT * FROM orders WHERE customer_id = 42;', note: 'customer_id has no index yet, so the database must read every one of the 2 000 rows to find the few that match. This is a full table scan.' },
        { label: '3 · Create the index', sql: 'CREATE INDEX idx_orders_customer ON orders (customer_id);', note: 'The database builds a sorted list of (customer_id, row pointer) pairs. Now run example 2 again.' },
        { label: '4 · Same query, with the index', sql: 'SELECT * FROM orders WHERE customer_id = 42;', note: 'Compare the rows read with example 2. Binary search finds the first matching entry in about log2(2000) = 11 comparisons, then walks along the matching entries (one step each) and reads only those rows. The row ORDER may differ, because without ORDER BY the order is not promised.' },
        { label: '5 · Range of values', sql: 'SELECT order_id, customer_id FROM orders WHERE order_id BETWEEN 100 AND 110;', note: 'A sorted index also answers ranges: find the start, then walk forward until the range ends.' },
        { label: '6 · An index cannot help here', sql: "SELECT * FROM orders WHERE item LIKE '%ho';", note: 'LIKE with a leading % (and, in this lab, any LIKE) is always a scan: the sorted order of the column says nothing about words ENDING in "ho".' },
        { label: '7 · Join with / without index', sql: "SELECT c.name, COUNT(*) AS orders_placed\nFROM customers c JOIN orders o ON o.customer_id = c.customer_id\nGROUP BY c.name\nORDER BY orders_placed DESC\nLIMIT 5;", note: 'A join runs a lookup into one table for every row of the other. Try it before and after example 3 and compare the rows read.' },
        { label: '8 · The price of an index', sql: "UPDATE orders SET customer_id = 7 WHERE order_id = 1500;", note: 'Reading got faster, but every change to an indexed column must also fix the index. Indexes cost space and write time.' },
        { label: '9 · An index that does not pay off', sql: "CREATE INDEX idx_orders_day ON orders (day);\nSELECT * FROM orders WHERE day >= '2026-10-01';", note: 'About half the table matches, so following the index costs MORE than just reading everything (compare total work with the "same query with full scans only" figure). Try day >= \'2026-10-25\' instead: a small range, a big saving. (If it says the index already exists, you created it before: just run the SELECT.)' },
        { label: '10 · Hide the column in arithmetic', sql: 'SELECT * FROM orders WHERE customer_id + 0 = 42;', note: 'Run example 3 first so the index exists (if it is missing, press Reset database and run 3 again). The index is sorted by customer_id, not by customer_id + 0, so the plan falls back to a full scan even though the index exists. Rewrite the condition as customer_id = 42 and it comes back.' },
        { label: 'Remove the index', sql: 'DROP INDEX idx_orders_customer;', note: 'Back to scanning.' }
      ]
    },
    company: {
      title: 'Company — the textbook database',
      blurb: 'The COMPANY database of textbook section 3.6 (EMPLOYEE, DEPARTMENT, DEPT_LOCATIONS, PROJECT, WORKS_ON, DEPENDENT). Textbook examples 3.1–3.19 run here.',
      ddl: `CREATE TABLE EMPLOYEE (
  Fname VARCHAR(15) NOT NULL, Minit CHAR, Lname VARCHAR(15) NOT NULL,
  SSN CHAR(9) PRIMARY KEY, Bdate DATE, Address VARCHAR(30), Sex CHAR,
  Salary DECIMAL(10,2), Super_ssn CHAR(9) REFERENCES EMPLOYEE(SSN),
  Dno INT NOT NULL REFERENCES DEPARTMENT(Dnumber)
);
CREATE TABLE DEPARTMENT (
  Dname VARCHAR(15) NOT NULL UNIQUE, Dnumber INT PRIMARY KEY,
  Mgr_ssn CHAR(9) REFERENCES EMPLOYEE(SSN), Mgr_start_date DATE
);
CREATE TABLE DEPT_LOCATIONS (
  Dnumber INT NOT NULL REFERENCES DEPARTMENT(Dnumber), Dlocation VARCHAR(15) NOT NULL,
  PRIMARY KEY (Dnumber, Dlocation)
);
CREATE TABLE PROJECT (
  Pname VARCHAR(15) NOT NULL UNIQUE, Pnumber INT PRIMARY KEY, Plocation VARCHAR(15),
  Dnum INT NOT NULL REFERENCES DEPARTMENT(Dnumber)
);
CREATE TABLE WORKS_ON (
  Essn CHAR(9) NOT NULL REFERENCES EMPLOYEE(SSN), Pno INT NOT NULL REFERENCES PROJECT(Pnumber),
  Hours DECIMAL(3,1), PRIMARY KEY (Essn, Pno)
);
CREATE TABLE DEPENDENT (
  Essn CHAR(9) NOT NULL REFERENCES EMPLOYEE(SSN), Dependent_name VARCHAR(15) NOT NULL,
  Sex CHAR, Bdate DATE, Relationship VARCHAR(8), PRIMARY KEY (Essn, Dependent_name)
);`,
      data: {
        EMPLOYEE: [['John', 'B', 'Smith', '123456789', '1965-01-09', '731 Fondren, Houston, TX', 'M', 30000, '333445555', 5],
          ['Franklin', 'T', 'Wong', '333445555', '1955-12-08', '638 Voss, Houston, TX', 'M', 40000, '888665555', 5],
          ['Alicia', 'J', 'Zelaya', '999887777', '1968-01-19', '3321 Castle, Spring, TX', 'F', 25000, '987654321', 4],
          ['Jennifer', 'S', 'Wallace', '987654321', '1941-06-20', '291 Berry, Bellaire, TX', 'F', 43000, '888665555', 4],
          ['Ramesh', 'K', 'Narayan', '666884444', '1962-09-15', '975 Fire Oak, Humble, TX', 'M', 38000, '333445555', 5],
          ['Joyce', 'A', 'English', '453453453', '1972-07-31', '5631 Rice, Houston, TX', 'F', 25000, '333445555', 5],
          ['Ahmad', 'V', 'Jabbar', '987987987', '1969-03-29', '980 Dallas, Houston, TX', 'M', 25000, '987654321', 4],
          ['James', 'E', 'Borg', '888665555', '1937-11-10', '450 Stone, Houston, TX', 'M', 55000, null, 1]],
        DEPARTMENT: [['Research', 5, '333445555', '1988-05-22'], ['Administration', 4, '987654321', '1995-01-01'], ['Headquarters', 1, '888665555', '1981-06-19']],
        DEPT_LOCATIONS: [[1, 'Houston'], [4, 'Stafford'], [5, 'Bellaire'], [5, 'Sugarland'], [5, 'Houston']],
        PROJECT: [['ProductX', 1, 'Bellaire', 5], ['ProductY', 2, 'Sugarland', 5], ['ProductZ', 3, 'Houston', 5], ['Computerization', 10, 'Stafford', 4],
          ['Reorganization', 20, 'Houston', 1], ['Newbenefits', 30, 'Stafford', 4]],
        WORKS_ON: [['123456789', 1, 32.5], ['123456789', 2, 7.5], ['666884444', 3, 40.0], ['453453453', 1, 20.0], ['453453453', 2, 20.0], ['333445555', 2, 10.0],
          ['333445555', 3, 10.0], ['333445555', 10, 10.0], ['333445555', 20, 10.0], ['999887777', 30, 30.0], ['999887777', 10, 10.0], ['987987987', 10, 35.0],
          ['987987987', 30, 5.0], ['987654321', 30, 20.0], ['987654321', 20, 15.0], ['888665555', 20, null]],
        DEPENDENT: [['333445555', 'Alice', 'F', '1986-04-05', 'Daughter'], ['333445555', 'Theodore', 'M', '1983-10-25', 'Son'], ['333445555', 'Joy', 'F', '1958-05-03', 'Spouse'],
          ['987654321', 'Abner', 'M', '1942-02-28', 'Spouse'], ['123456789', 'Michael', 'M', '1988-01-04', 'Son'], ['123456789', 'Alice', 'F', '1988-12-30', 'Daughter'],
          ['123456789', 'Elizabeth', 'F', '1967-05-05', 'Spouse']]
      },
      examples: [
        { label: 'Ex 3.1 · all columns', sql: 'SELECT * FROM Employee;', note: 'Textbook example 3.1: SELECT * lists every column of every row.' },
        { label: 'Ex 3.3 · DISTINCT', sql: 'SELECT DISTINCT Salary FROM Employee;', note: 'Three employees earn 25 000, but DISTINCT shows each salary once.' },
        { label: 'Ex 3.4 · comparison', sql: 'SELECT Fname, Minit, Lname FROM Employee WHERE Salary > 30000;', note: 'A simple WHERE with a comparison operator.' },
        { label: 'Ex 3.6 · BETWEEN', sql: 'SELECT Fname, Lname FROM Employee WHERE Salary BETWEEN 10000 AND 30000;', note: 'BETWEEN includes both end points.' },
        { label: 'Ex 3.7 · IN', sql: 'SELECT Fname, Minit, Lname FROM Employee WHERE Dno IN (5, 4);', note: 'IN tests membership of a set.' },
        { label: 'Ex 3.8 · LIKE (fixed)', sql: "SELECT * FROM Employee WHERE Address LIKE '%Houston, TX%';", note: 'The textbook writes %Houston,TX% without the space, which matches nothing in this data. The addresses contain "Houston, TX".' },
        { label: 'Ex 3.10 · two sort keys', sql: 'SELECT * FROM EMPLOYEE ORDER BY DNO, Salary DESC;', note: 'Department first; inside each department, highest salary first.' },
        { label: 'Ex 3.14 · MIN, MAX, AVG', sql: 'SELECT MIN(Salary) AS LowestSalary, MAX(Salary) AS HighestSalary, AVG(Salary) AS AverageSalary FROM EMPLOYEE;', note: '25 000, 55 000 and 35 125, as in the textbook.' },
        { label: 'Ex 3.15 · GROUP BY', sql: 'SELECT DNO, COUNT(SSN) AS Employees, SUM(Salary) AS TotalSalary FROM EMPLOYEE GROUP BY DNO;', note: 'Three departments, so three groups and three result rows.' },
        { label: 'Ex 3.16 · HAVING', sql: 'SELECT DNO, COUNT(SSN) AS Employees, SUM(Salary) AS TotalSalary FROM EMPLOYEE GROUP BY DNO HAVING COUNT(SSN) > 2;', note: 'Only departments with more than two employees survive. (The textbook text says "more than one" but its query says > 2.)' },
        { label: 'Ex 3.17 · sub-query', sql: "SELECT Fname, Lname, Salary FROM EMPLOYEE WHERE DNO = (SELECT Dnumber FROM DEPARTMENT WHERE Dname = 'Research');", note: 'The inner query finds the number of the Research department (5); the outer query uses it.' },
        { label: 'Ex 3.18 · above average', sql: 'SELECT Fname, Lname, Salary, Salary - (SELECT AVG(Salary) FROM EMPLOYEE) AS SalDiff\nFROM EMPLOYEE\nWHERE Salary > (SELECT AVG(Salary) FROM EMPLOYEE);', note: 'Four employees earn more than 35 125.' },
        { label: 'Ex 3.19 · nested IN', sql: "SELECT DISTINCT Fname, Lname FROM EMPLOYEE\nWHERE SSN IN (SELECT Essn FROM WORKS_ON\n              WHERE Pno IN (SELECT Pnumber FROM PROJECT WHERE Plocation = 'Houston'));", note: 'Run from the inside out. NOTE: the result table printed in the textbook does not match this data; this is the real answer (4 people).' }
      ]
    },
    library: {
      title: 'Library — textbook exercise database',
      blurb: 'Book, BookCopy, Borrower, BookLoan from textbook section 3.9, with every constraint of Table 3.8 declared. Try the INSERT statements of exercise 3.9.2 and the queries of 3.9.3.',
      ddl: `CREATE TABLE Book (
  ISBN CHAR(14) PRIMARY KEY,
  title VARCHAR(50) NOT NULL,
  edition INT CHECK (edition > 0),
  publishedYear NUMERIC(4)
);
CREATE TABLE BookCopy (
  copyNo INT,
  ISBN CHAR(14),
  status VARCHAR(10) DEFAULT 'good',
  PRIMARY KEY (copyNo, ISBN),
  FOREIGN KEY (ISBN) REFERENCES Book(ISBN)
);
CREATE TABLE Borrower (
  borrowerNo INT PRIMARY KEY,
  borrowerName VARCHAR(30) NOT NULL,
  address VARCHAR(50)
);
CREATE TABLE BookLoan (
  copyNo INT,
  ISBN CHAR(14),
  borrowedDate DATE,
  dueDate DATE NOT NULL,
  actReturnDate DATE,
  BNo INT,
  PRIMARY KEY (copyNo, ISBN, borrowedDate),
  FOREIGN KEY (BNo) REFERENCES Borrower(borrowerNo),
  FOREIGN KEY (copyNo, ISBN) REFERENCES BookCopy(copyNo, ISBN),
  CHECK (dueDate > borrowedDate)
);`,
      data: {
        Book: [['978-0743273111', 'Database System Concepts', 7, 2019], ['978-0141439222', 'Fundamentals of Database Systems', 7, 2019],
          ['978-1400079333', 'The C++ Programming Language', 4, 2013], ['978-1400079444', 'The Age of AI: And Our Human Future', 1, 2022]],
        BookCopy: [[1, '978-0743273111', 'good'], [2, '978-0743273111', 'old'], [3, '978-0743273111', 'torn'], [1, '978-0141439222', 'good'], [2, '978-0141439222', 'good'],
          [3, '978-0141439222', 'good'], [1, '978-1400079333', 'old'], [2, '978-1400079333', 'torn'], [3, '978-1400079333', 'old'], [4, '978-1400079333', 'good'],
          [1, '978-1400079444', 'good'], [2, '978-1400079444', 'good'], [3, '978-1400079444', 'good']],
        Borrower: [[101, 'Mark King', '123 Main St, LA'], [102, 'Theodore Blake', '456 Oak St, NY'], [103, 'Justin Martin', '789 Pine St, TX'], [104, 'Mary Smith', '987 Weast St, DC']],
        BookLoan: [[1, '978-0743273111', '2025-05-10', '2025-05-20', null, 101], [2, '978-0743273111', '2025-05-15', '2025-05-25', '2025-05-22', 102],
          [3, '978-0141439222', '2025-05-15', '2025-05-25', null, 101], [2, '978-0141439222', '2025-05-16', '2025-05-26', '2025-05-24', 102],
          [3, '978-1400079444', '2025-05-16', '2025-05-26', null, 101]]
      },
      examples: [
        { label: '3.9.2 a · duplicate primary key', sql: "INSERT INTO BookLoan VALUES (1, '978-0743273111', '2025-05-10', '2025-05-25', NULL, 101);", note: 'Copy 1 of this ISBN was already borrowed on 2025-05-10, so (copyNo, ISBN, borrowedDate) would repeat.' },
        { label: '3.9.2 c · unknown borrower', sql: "INSERT INTO BookLoan VALUES (1, '978-1400079333', '2025-05-10', '2025-05-20', '2025-05-21', 111);", note: 'There is no borrower 111: the foreign key BNo refuses it.' },
        { label: '3.9.2 d · due before borrowed', sql: "INSERT INTO BookLoan VALUES (2, '978-1400079444', '2025-05-28', '2025-05-20', NULL, 101);", note: 'The CHECK rule dueDate > borrowedDate is false.' },
        { label: '3.9.2 e · a valid loan', sql: "INSERT INTO BookLoan VALUES (3, '978-1400079444', '2025-06-01', '2025-06-15', NULL, 103);", note: 'Every rule is satisfied, so the row goes in.' },
        { label: '3.9.3 b · title + year', sql: "SELECT * FROM Book WHERE title LIKE '%Database%' AND publishedYear >= 2019;", note: 'LIKE with wildcards plus a comparison.' },
        { label: '3.9.3 e · never borrowed', sql: 'SELECT ISBN, title, edition FROM Book\nWHERE ISBN NOT IN (SELECT ISBN FROM BookLoan);', note: 'NOT IN with a sub-query.' },
        { label: '3.9.3 g · 3+ different books', sql: 'SELECT b.borrowerNo, b.borrowerName\nFROM Borrower b JOIN BookLoan l ON l.BNo = b.borrowerNo\nGROUP BY b.borrowerNo, b.borrowerName\nHAVING COUNT(DISTINCT l.ISBN) > 2;', note: 'JOIN, GROUP BY, HAVING and COUNT(DISTINCT ...) in one query.' },
        { label: '3.9.3 j · unborrowed, 3+ copies', sql: 'SELECT ISBN, title FROM Book\nWHERE ISBN NOT IN (SELECT ISBN FROM BookLoan)\n  AND ISBN IN (SELECT ISBN FROM BookCopy GROUP BY ISBN HAVING COUNT(*) >= 3);', note: 'Two sub-queries, one with GROUP BY / HAVING.' }
      ]
    },
    blank: {
      title: 'Blank — design your own',
      blurb: 'An empty database. Write your own CREATE TABLE statements (for example exercise 3.9.1 or the team activity), insert rows and query them.',
      ddl: '',
      data: {},
      examples: [
        { label: 'A first table', sql: "CREATE TABLE club (\n  club_id INTEGER PRIMARY KEY,\n  club_name TEXT NOT NULL UNIQUE,\n  members INTEGER DEFAULT 0 CHECK (members >= 0)\n);\nINSERT INTO club (club_name, members) VALUES ('Robotics', 25), ('Chess', 12);\nSELECT * FROM club;", note: 'INTEGER PRIMARY KEY numbers new rows for you (1, 2, ...). DEFAULT fills a missing value.' },
        { label: 'Constraints say no', sql: "CREATE TABLE t (id INTEGER PRIMARY KEY, label TEXT NOT NULL);\nINSERT INTO t VALUES (1, 'a');\nINSERT INTO t VALUES (1, 'b');", note: 'The second row repeats the primary key and is refused.' }
      ]
    }
  };

  function createDatabase(name) {
    const ds = DATASETS[name];
    if (!ds) throw new Error('Unknown dataset ' + name);
    const db = new Database();
    if (ds.ddl) { const r = db.run(ds.ddl); if (r.error) throw new Error('Dataset ' + name + ': ' + r.error.message); }
    if (ds.data) Object.keys(ds.data).forEach((t) => db.load(t, ds.data[t]));
    if (ds.generate) ds.generate(db);
    return db;
  }

  const api = { Database, SqlError, DATASETS, createDatabase, parse: (sql) => new Parser(sql).script(), cmpVals, mulberry32, trace: (db, sql) => db.trace(sql), splitSql };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SqlLab = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
