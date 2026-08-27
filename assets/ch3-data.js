/* Chapter 3 — Selection Structure
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 3,

  quiz: [
    { q: 'What does “flow of control” mean?',
      opts: ['The speed of the processor', 'The order in which a program\'s statements are executed',
             'The number of variables and statements a program declares', 'The direction of data in a network'],
      a: 1,
      why: 'Flow of control is the order of execution. Unless directed otherwise, it is <strong>sequential</strong> — top to bottom.' },

    { q: 'Which structures can alter the normal sequential flow of control?',
      opts: ['Comments, whitespace, and preprocessor directives', 'Selection, repetition, and function invocation',
             'Declarations only', 'The preprocessor'],
      a: 1,
      why: 'Selection (this chapter), repetition (Chapter 4), and function calls (Chapter 6) are the defined ways to change the flow.' },

    { q: 'What integer values do <code>true</code> and <code>false</code> actually represent?',
      opts: ['1 and 0', '0 and 1', '1 and −1', 'Any nonzero and 0'],
      a: 0,
      why: 'true is stored as 1 and false as 0 — printing a bool with cout shows 1 or 0. (When converting the other way, any nonzero value counts as true.)' },

    { q: 'What does <code>cout &lt;&lt; (5 &gt; 3);</code> print?',
      opts: ['true', '1', '5 &gt; 3', 'yes'],
      a: 1,
      why: 'The comparison returns the bool true, which cout prints as the integer 1.' },

    { q: 'What is the difference between <code>=</code> and <code>==</code>?',
      opts: ['They are interchangeable', '= assigns a value; == compares two operands for equality',
             '== assigns a new value, while = compares two operands for equality', '= is only for strings'],
      a: 1,
      why: 'A classic trap: <code>if (x = 5)</code> assigns 5 to x (always true!) instead of comparing. Comparison needs <code>==</code>.' },

    { q: 'With <code>age = 45, term = 5</code>, what is <code>(age &gt; 40) && (term &lt; 10)</code>?',
      opts: ['true', 'false', '45', 'A compile error'],
      a: 0,
      why: 'Both sides are true (45 &gt; 40 and 5 &lt; 10), and true AND true is true.' },

    { q: 'With <code>age = 45</code>, what is <code>!(age &gt; 40)</code>?',
      opts: ['true, because 45 is greater than 40', 'false', '1, the numeric value of the comparison', '45, the value that is stored in age'],
      a: 1,
      why: 'age &gt; 40 is true; NOT true is false.' },

    { q: 'Complete the truth table: <code>true && false</code> and <code>true || false</code> are…',
      opts: ['false and true', 'true and true', 'false and false', 'true and false'],
      a: 0,
      why: 'AND needs both operands true → false. OR needs at least one true → true.' },

    { q: 'In <code>(a == b) || (c == d) || (e == f)</code>, when is <code>(c == d)</code> <em>not</em> evaluated?',
      opts: ['Never — all parts always run', 'When (a == b) is true', 'When (a == b) is false', 'When (e == f) is false'],
      a: 1,
      why: 'Short-circuit evaluation: once (a == b) is true, the whole OR is already true, so the rest is skipped.' },

    { q: 'In <code>(a == b) && (c == d) && (e == f)</code>, when does evaluation stop early?',
      opts: ['When (a == b) is true', 'When (a == b) is false', 'It never stops early', 'When all parts are true'],
      a: 1,
      why: 'For AND, one false operand settles the result as false, so the remaining sub-expressions are skipped.' },

    { q: 'Which operator group has the <em>lowest</em> precedence?',
      opts: ['* / %', '&lt; &lt;= &gt; &gt;=', '&& and ||', '= += -= *= /='],
      a: 3,
      why: 'Assignment operators sit at the bottom of the table (level 8), below || (7) and && (6). That is why <code>x = a &gt; b</code> compares first, then assigns.' },

    { q: 'Step through <code>(6*3 == 36/2) || (13 &lt; 3*3 + 4) && !(6-2 &lt; 5)</code>. The result is…',
      opts: ['1', '0', 'undefined', 'a compile error'],
      a: 0,
      why: '(18 == 18) is 1. (13 &lt; 13) is 0, !(4 &lt; 5) is 0, and 0 && 0 is 0. && binds tighter than ||, so we get 1 || 0 = 1.' },

    { q: 'What is the value of <code>\'a\' + 1 == \'b\'</code>?',
      opts: ['1 (true)', '0 (false)', "'ab'", 'A type error'],
      a: 0,
      why: 'Characters are numeric codes; \'a\' + 1 is exactly the code of \'b\', so the comparison is true.' },

    { q: 'With <code>int i = 5; char key = \'m\'; </code> the expression <code>i + 2 == key - 1</code> evaluates to…',
      opts: ['1 (true), because both sides equal 7', '0 (false)', '7, the value of the left-hand side i + 2', "the character 'l', the value of key - 1"],
      a: 1,
      why: 'i + 2 is 7, while key − 1 is the code of \'l\' (108). 7 == 108 is false — the slide\'s own worked example.' },

    { q: 'When can you omit the braces <code>{ }</code> in an if or else branch?',
      opts: ['Never', 'When the branch contains only one statement', 'When there is no else', 'When the condition is a simple comparison between two values'],
      a: 1,
      why: 'A single statement needs no block. With two or more statements, braces are required — or only the first statement belongs to the if.' },

    { q: 'In the tax program, taxes are 2% up to $20,000 and 2.5% of the excess plus $400 above it. For a taxable income of $30,000, taxes are…',
      opts: ['$600', '$650', '$750', '$400'],
      a: 1,
      why: '0.025 × (30000 − 20000) + 400 = 250 + 400 = $650. For $10,000 the other branch gives 0.02 × 10000 = $200.' },

    { q: 'What does this block-scope example print for <code>a</code> after the inner block ends?',
      code: '{ int a = 25;\n  { float a = 46.25;\n    cout << a << endl; }  // prints 46.25\n  cout << a << endl; }     // prints ?',
      opts: ['46.25', '25', '0', 'A compile error'],
      a: 1,
      why: 'The inner <code>a</code> only exists inside its block. When it ends, the name a refers to the outer variable again: 25.' },

    { q: 'A variable declared inside a block <code>{ }</code> is valid…',
      opts: ['everywhere in the file', 'only within that block', 'until the program ends', 'only in main()'],
      a: 1,
      why: 'That region is the variable\'s <strong>scope</strong> — statements outside the block cannot use it.' },

    { q: 'Using the grade ladder <code>&gt;=90 A, &gt;=80 B, &gt;=70 C, &gt;=60 D, else F</code>, a score of 75 gets…',
      opts: ['A', 'B', 'C', 'D'],
      a: 2,
      why: '75 fails the ≥90 and ≥80 tests but passes ≥70, so the chain stops at C — later tests are never reached.' },

    { q: 'In an if-else chain, what happens after one condition matches?',
      opts: ['All of the remaining conditions in the chain are still tested one by one', 'Its statements run and the rest of the chain is skipped',
             'The program restarts the chain', 'The else always runs too'],
      a: 1,
      why: 'Exactly one branch of a chain executes — that is what makes it a clean multi-way selection.' },

    { q: 'In the quadratic-equation program, when <code>del == 0.0</code> the program…',
      opts: ['prints “no solution”, since a zero discriminant means the equation has no roots', 'computes the single root x = −b / (2a)', 'divides by zero', 'asks for new input'],
      a: 1,
      why: 'del = 0 means one (repeated) root: x1 = x2 = −b / (2a). del &gt; 0 gives two roots; del &lt; 0 gives none.' },

    { q: 'The expression in a <code>switch</code> statement must evaluate to…',
      opts: ['an integer data type (int, char, long, short)', 'a double', 'a string', 'a bool only — true and false are the only legal case labels'],
      a: 0,
      why: 'switch works on integer types — which includes char. Doubles and strings need if-else chains instead.' },

    { q: 'What happens if the <code>break</code> statements are omitted in a switch?',
      opts: ['A compile error', 'All cases following the matching case, including default, are executed',
             'Only the default runs', 'The switch statement exits immediately after the matching case finishes'],
      a: 1,
      why: 'Execution “falls through” into the following cases until a break or the end of the switch — occasionally useful, usually a bug.' },

    { q: 'When does the <code>default</code> label execute?',
      opts: ['Always', 'When the expression matches no case value', 'Only when the expression evaluates to exactly the value 0', 'Before every case'],
      a: 1,
      why: 'default is the catch-all: it runs only if none of the case values match.' },

    { q: 'In the calculator program, <code>num1 = 8</code>, <code>num2 = 2</code>, <code>op = \'/\'</code>. What is printed?',
      code: "case '/':\n    if (num2 != 0)\n        cout << \"Result: \" << num1 / num2 << endl;\n    else\n        cout << \"Division by zero!\" << endl;",
      opts: ['Result: 4', 'Result: 4.0', 'Division by zero!', 'Invalid operator!'],
      a: 0,
      why: 'num2 is nonzero, so it prints 8 / 2. Both are ints, so the division is integer division: 4.' },

    { q: 'Same calculator, but the user types the operator <code>?</code>. What is printed?',
      opts: ['Result: 0', 'Nothing', 'Division by zero!', 'Invalid operator!'],
      a: 3,
      why: '\'?\' matches no case label, so the default branch runs and prints “Invalid operator!”.' }
  ],

  exercises: [
    { title: 'Even or odd?',
      brief: 'Read one integer and print <code>even</code> or <code>odd</code>. Remember which operator gives you the remainder.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    // TODO: if n is divisible by 2 print "even", otherwise "odd"\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    if (n % 2 == 0)\n        cout << "even" << endl;\n    else\n        cout << "odd" << endl;\n\n    return 0;\n}\n',
      tests: [
        { stdin: '4', expect: 'even\n' },
        { stdin: '7', expect: 'odd\n' },
        { stdin: '0', expect: 'even\n' }
      ] },

    { title: 'Letter grade with an if-else chain',
      brief: 'Read a score (0–100, may have decimals) and print the letter grade using the ladder from the slides: ≥90 A, ≥80 B, ≥70 C, ≥60 D, otherwise F.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double score;\n    cin >> score;\n    char grade;\n\n    // TODO: the if-else chain from Example 3.4.1\n\n    cout << grade << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double score;\n    cin >> score;\n    char grade;\n\n    if (score >= 90.0)\n        grade = \'A\';\n    else if (score >= 80.0)\n        grade = \'B\';\n    else if (score >= 70.0)\n        grade = \'C\';\n    else if (score >= 60.0)\n        grade = \'D\';\n    else\n        grade = \'F\';\n\n    cout << grade << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '95', expect: 'A\n' },
        { stdin: '80', expect: 'B\n' },
        { stdin: '75.5', expect: 'C\n' },
        { stdin: '42', expect: 'F\n' }
      ] },

    { title: 'Income tax with two rates',
      brief: 'Example 3.3.1 as a program: taxes are 2% of taxable income up to $20,000; above that, 2.5% of the excess plus a fixed $400. Read the income and print <code>Taxes are $ &lt;amount&gt;</code> with exactly 2 digits after the decimal point (use <code>fixed</code> and <code>setprecision</code>).',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nconst float LOWRATE = 0.02;\nconst float HIGHRATE = 0.025;\nconst float CUTOFF = 20000.0;\nconst float FIXEDAMT = 400;\n\nint main() {\n    float taxable, taxes;\n    cin >> taxable;\n\n    // TODO: pick the right formula with if-else\n\n    // TODO: print with 2 decimals: Taxes are $ <taxes>\n\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nconst float LOWRATE = 0.02;\nconst float HIGHRATE = 0.025;\nconst float CUTOFF = 20000.0;\nconst float FIXEDAMT = 400;\n\nint main() {\n    float taxable, taxes;\n    cin >> taxable;\n\n    if (taxable <= CUTOFF)\n        taxes = LOWRATE * taxable;\n    else\n        taxes = HIGHRATE * (taxable - CUTOFF) + FIXEDAMT;\n\n    cout << fixed << setprecision(2);\n    cout << "Taxes are $ " << taxes << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '10000', expect: 'Taxes are $ 200.00\n' },
        { stdin: '30000', expect: 'Taxes are $ 650.00\n' },
        { stdin: '20000', expect: 'Taxes are $ 400.00\n' }
      ] },

    { title: 'A four-function calculator with switch',
      brief: 'Example 3.5.1 without the prompts: read two integers and an operator character (<code>+ - * /</code>), then print <code>Result: &lt;value&gt;</code>. Handle division by zero with <code>Division by zero!</code> and any other operator with <code>Invalid operator!</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num1, num2;\n    char op;\n    cin >> num1 >> num2 >> op;\n\n    switch (op) {\n        // TODO: case \'+\', \'-\', \'*\', \'/\' (watch out for num2 == 0)\n        // TODO: default -> "Invalid operator!"\n    }\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num1, num2;\n    char op;\n    cin >> num1 >> num2 >> op;\n\n    switch (op) {\n        case \'+\':\n            cout << "Result: " << num1 + num2 << endl;\n            break;\n        case \'-\':\n            cout << "Result: " << num1 - num2 << endl;\n            break;\n        case \'*\':\n            cout << "Result: " << num1 * num2 << endl;\n            break;\n        case \'/\':\n            if (num2 != 0)\n                cout << "Result: " << num1 / num2 << endl;\n            else\n                cout << "Division by zero!" << endl;\n            break;\n        default:\n            cout << "Invalid operator!" << endl;\n    }\n    return 0;\n}\n',
      tests: [
        { stdin: '8 2 /', expect: 'Result: 4\n' },
        { stdin: '3 5 *', expect: 'Result: 15\n' },
        { stdin: '9 0 /', expect: 'Division by zero!\n' },
        { stdin: '7 2 ?', expect: 'Invalid operator!\n' }
      ] },

    { supp: true,
      title: 'Leap year checker',
      brief: 'A year is a leap year if it is divisible by 4 but not by 100 — unless it is also divisible by 400. Read a year and print <code>leap year</code> or <code>not a leap year</code>. One boolean expression with <code>&&</code>, <code>||</code> and <code>%</code> is enough.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int year;\n    cin >> year;\n\n    // TODO: build the condition and print the verdict\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int year;\n    cin >> year;\n\n    if ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0)\n        cout << "leap year" << endl;\n    else\n        cout << "not a leap year" << endl;\n\n    return 0;\n}\n',
      tests: [
        { stdin: '2024', expect: 'leap year\n' },
        { stdin: '1900', expect: 'not a leap year\n' },
        { stdin: '2000', expect: 'leap year\n' },
        { stdin: '2025', expect: 'not a leap year\n' }
      ] },

    { title: 'Challenge: quadratic equation solver',
      brief: 'Example 3.4.1 as an exercise: read coefficients <code>a b c</code>, compute <code>del = b² − 4ac</code>, and print <code>x1 = &lt;v&gt; x2 = &lt;v&gt;</code> (two roots or the repeated root), or <code>There is no solution</code> when del &lt; 0. You will need <code>sqrt</code> from <code>&lt;cmath&gt;</code>.',
      starter: '#include <iostream>\n#include <cmath>\nusing namespace std;\n\nint main() {\n    double a, b, c, del, x1, x2;\n    cin >> a >> b >> c;\n\n    del = b * b - 4.0 * a * c;\n\n    // TODO: the three cases — del == 0, del > 0, del < 0\n\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <cmath>\nusing namespace std;\n\nint main() {\n    double a, b, c, del, x1, x2;\n    cin >> a >> b >> c;\n\n    del = b * b - 4.0 * a * c;\n\n    if (del == 0.0) {\n        x1 = x2 = -b / (2 * a);\n        cout << "x1 = " << x1 << " x2 = " << x2 << endl;\n    }\n    else if (del > 0.0) {\n        x1 = (-b + sqrt(del)) / (2 * a);\n        x2 = (-b - sqrt(del)) / (2 * a);\n        cout << "x1 = " << x1 << " x2 = " << x2 << endl;\n    }\n    else {\n        cout << "There is no solution" << endl;\n    }\n    return 0;\n}\n',
      tests: [
        { stdin: '1 5 6', expect: 'x1 = -2 x2 = -3\n' },
        { stdin: '1 2 1', expect: 'x1 = -1 x2 = -1\n' },
        { stdin: '1 0 4', expect: 'There is no solution\n' }
      ] }
  ]
};
