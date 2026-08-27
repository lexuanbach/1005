/* Chapter 4 — Repetition Structures
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 4,

  quiz: [
    { q: 'C++ provides three forms of repetition structure. Which are they?',
      opts: ['while, for, and do-while', 'if, switch, and goto statements combined together',
             'loop, repeat, and iterate — one keyword for each kind of loop', 'while, until, and forever structures'],
      a: 0,
      why: 'The three repetition structures are while, for, and do-while. Each requires a condition that is evaluated on every pass.' },

    { q: 'What distinguishes a pre-test loop from a post-test loop?',
      opts: ['Where the condition is tested: at the beginning or at the end of the repeating code',
             'Whether the loop was fully tested by the programmer before the program was ever released',
             'Whether the loop uses an integer counter or a floating point counter variable',
             'How many statements the body of the repeating section is allowed to contain'],
      a: 0,
      why: 'Test at the beginning → pre-test loop (while, for). Test at the end → post-test loop (do-while).' },

    { q: 'Which loop is the post-test loop?',
      opts: ['do-while', 'while, because the keyword comes before the condition does',
             'for, because the update expression runs after the body finishes', 'All three loops test after the body'],
      a: 0,
      why: 'do-while places the condition after the body — so the body always executes at least once.' },

    { q: 'What is a fixed count loop?',
      opts: ['A loop that performs a set number of repetitions, tracked by the condition',
             'A loop whose body contains a fixed, unchangeable number of statements inside',
             'A loop that can only ever count upward from zero to some maximum value',
             'A loop whose counter variable must be declared with the const keyword'],
      a: 0,
      why: 'In a fixed count loop the condition tracks how many repetitions have occurred; after the fixed number, the loop exits. When the number of repetitions is unknown, a variable condition loop is used instead.' },

    { q: 'When do you need a variable condition loop instead of a fixed count loop?',
      opts: ['When the exact number of repetitions is not known in advance',
             'When the loop needs to repeat more than one hundred times in total',
             'When the loop body needs to change the value of more than one variable',
             'When the loop must run backwards from a maximum value down to zero'],
      a: 0,
      why: 'A variable condition loop stops when a specified value is encountered — however many iterations that takes. Sentinel-controlled input is the classic example.' },

    { q: 'Which of these is an <em>intentional</em> infinite loop?',
      opts: ['The main processing loop of a server or monitoring application',
             'A while loop whose counter the programmer simply forgot to increment',
             'A for loop whose condition was accidentally written as i &gt;= 0',
             'Any loop that causes high CPU usage and an unresponsive program'],
      a: 0,
      why: 'Servers, monitoring apps, and embedded systems deliberately loop forever. Unintentional infinite loops are bugs — high CPU, memory issues, frozen programs.' },

    { q: 'Counter-controlled repetition requires four things. Which list is right?',
      opts: ['A control variable, its initial value, a condition testing its final value, and an increment',
             'A sentinel value, a series of data values, an accumulator variable, and a printing statement',
             'An array, a subscript, a size constant, and a for statement to walk across them',
             'A prototype, a function call, a return value, and a pass-by-reference parameter'],
      a: 0,
      why: 'The four requirements: the name of a control variable, its initial value, the condition testing for the final value, and the increment (or decrement) applied each pass.' },

    { q: 'Trace it: what does this loop print?',
      code: 'int count = 1;\nwhile (count <= 10) {\n    cout << count << " ";\n    count++;\n}',
      opts: ['1 2 3 4 5 6 7 8 9 10', '1 2 3 4 5 6 7 8 9 10 11 — one extra pass',
             '2 3 4 5 6 7 8 9 10 11, because ++ runs before the print', 'Nothing — the condition is false at the start'],
      a: 0,
      why: 'count starts at 1, prints, then increments; the loop continues while count ≤ 10, so 1 through 10 are printed (Example 4.2.1).' },

    { q: 'What is a sentinel?',
      opts: ['A data value used to indicate the start or end of a data series',
             'A guard variable that prevents any other function from changing the counter',
             'The special first element that every array reserves for error checking',
             'A compiler warning produced whenever a loop might repeat forever'],
      a: 0,
      why: 'Sentinels mark the boundary of the data — like “any number greater than 100” ending grade entry. They must not conflict with legitimate data values.' },

    { q: 'In the grade-totalling program, HIGHGRADE = 100 and the loop is <code>while (grade &lt;= HIGHGRADE)</code>. Why must the sentinel be greater than 100?',
      opts: ['So the sentinel can never be confused with a legitimate grade',
             'Because while loops can only compare against constants larger than 100',
             'So the total is rounded up to the next multiple of one hundred at the end',
             'Because cin cannot read a number smaller than the previous number typed'],
      a: 0,
      why: 'A sentinel must sit outside the range of valid data. Grades run 0–100, so anything above 100 unambiguously means “stop”.' },

    { q: 'What extra abilities does the for statement add over while?',
      opts: ['The header can also initialize a counter and update it each iteration',
             'A for loop always runs faster because the compiler unrolls it automatically',
             'Only a for loop is allowed to contain another loop nested inside it',
             'The for condition may use && and ||, which while does not allow'],
      a: 0,
      why: 'for(init; condition; update) packs initialization and the per-iteration update into the header — otherwise it repeats exactly like while.' },

    { q: 'In <code>for (init; condition; update)</code>, when does the update statement execute?',
      opts: ['After the body, at the end of every iteration, before the condition is retested',
             'Immediately before the loop body executes, right after the condition has been tested',
             'Exactly once, just before the very first test of the loop condition',
             'Only when the condition finally becomes false and the loop is exiting'],
      a: 0,
      why: 'Order: init once → test condition → body → update → test again. (The flowchart in the slides draws exactly this cycle.)' },

    { q: 'What does <code>for (count = 2; count &lt;= 20; count = count + 2) cout &lt;&lt; count &lt;&lt; " ";</code> print?',
      opts: ['2 4 6 8 10 12 14 16 18 20', '2 3 4 5 … 20 — every number from two to twenty',
             '2 4 6 8 10 12 14 16 18 — it stops just before printing twenty', '0 2 4 6 8 10 12 14 16 18 20'],
      a: 0,
      why: 'The counter starts at 2 and grows by 2 while ≤ 20 — the even numbers 2 through 20 (Example 4.3.1).' },

    { q: 'A loop nested inside another loop: outer runs 5 times, inner runs 4 times per pass. How many times does the inner <em>body</em> execute in total?',
      opts: ['20', '9, the sum of the two loop counts added together', '5, once per pass of the outer loop', '45, five times nine iterations'],
      a: 0,
      why: 'The inner loop restarts on every outer pass: 5 × 4 = 20 executions (Example 4.4.1 prints j = 1…4 five times).' },

    { q: 'The condition of a while loop is false the very first time it is reached. How many times does the body run — and what if it were a do-while?',
      opts: ['0 times for while; 1 time for do-while',
             '1 time for while; 0 times for do-while, since do-while tests first',
             '0 times for both loops — a false condition always skips the body',
             '1 time for both loops — every loop body runs at least once in C++'],
      a: 0,
      why: 'while is pre-test: a false condition skips the body entirely. do-while is post-test: the body has already run once before the first test.' },

    { q: 'Trace Example 4.5.1: <code>digit = 2; do { sum += digit; digit += 2; } while (digit &lt;= max);</code> with max = 10. What is sum?',
      opts: ['30', '20, the sum of two, four, six and eight only', '25, the average of the even numbers times five', '55, the sum of every number from one to ten'],
      a: 0,
      why: '2 + 4 + 6 + 8 + 10 = 30. The loop adds each even digit, then increments by 2, stopping once digit exceeds max.' },

    { q: 'What does the break statement do inside a loop?',
      opts: ['Causes an exit from the innermost enclosing loop',
             'Causes an exit from every loop in the program at the same time',
             'Pauses the loop until the user presses a key on the keyboard',
             'Deletes the loop counter variable and restarts the loop from zero'],
      a: 0,
      why: 'break jumps out of the innermost enclosing loop only — execution continues at the first statement after that loop.' },

    { q: 'What does the continue statement do?',
      opts: ['Halts the current pass and restarts the loop with a new iteration',
             'Continues running the program even after a run-time error occurs',
             'Repeats the current iteration once more with the same variable values',
             'Transfers control to the next loop written below the current one'],
      a: 0,
      why: 'continue skips the rest of the body for this pass and goes straight to the next iteration — used in the slides to skip invalid grades.' },

    { q: 'In the grade loop, <code>if (grade &lt; 0 || grade &gt; 100) continue;</code> means…',
      opts: ['Invalid grades are simply ignored; only valid grades are added to the total',
             'The program stops with an error message as soon as a grade is invalid',
             'Invalid grades are corrected to the nearest value inside the valid range',
             'The loop ends immediately and prints out the total of the grades typed in so far'],
      a: 0,
      why: 'continue skips the “total = total + grade” and “count++” lines for out-of-range values — they never enter the total (Example 5.6.2).' },

    { q: 'What is the null statement?',
      opts: ['A semicolon with nothing preceding it — a valid statement that does nothing',
             'A statement that stores the special value null into an integer variable',
             'Any statement that the compiler quietly removes because it can prove it is useless',
             'A statement that ends the program immediately without returning a value'],
      a: 0,
      why: 'A lone ; is a legal, empty statement. Harmless on its own — dangerous when it lands where you did not intend it.' },

    { q: 'The classic trap: what does <code>for (int i = 0; i &lt; 10; i++);  cout &lt;&lt; i;</code> do?',
      code: 'for (int i = 0; i < 10; i++);\ncout << "done";',
      opts: ['The loop runs 10 times doing nothing — the ; is its entire body — then prints once',
             'It prints the word done ten times, once for every single pass of the loop',
             'It refuses to compile, because a for statement is never allowed to end with a semicolon',
             'It prints done once and then runs the empty loop ten times afterwards'],
      a: 0,
      why: 'The semicolon right after the ) is a null statement serving as the loop body (Example 5.6.4). The cout below is NOT inside the loop — it runs once, after.' },

    { q: 'A while loop\'s condition variable is never changed inside the body. What happens?',
      opts: ['If the condition starts true, the loop repeats forever — an unintentional infinite loop',
             'The compiler always detects this mistake and reports it as a syntax error before anything runs',
             'The loop automatically stops after a built-in maximum number of iterations',
             'The loop body is skipped, because C++ requires the body to change the condition'],
      a: 0,
      why: 'Nothing stops it: the condition stays true forever. (The Playground\'s step limit will catch it here — a real machine just spins at 100% CPU.)' },

    { q: 'Which loop is most natural for “ask for a password until it is correct”?',
      opts: ['do-while — the asking must happen at least once before any test makes sense',
             'for — because the number of attempts a user makes is always known in advance',
             'while — because the password check has to happen before the very first prompt',
             'A nested loop — one loop for the asking and a separate loop for the checking'],
      a: 0,
      why: 'You must prompt once before there is anything to test — the post-test do-while matches that shape exactly.' },

    { q: 'Which for header prints a countdown 10 9 8 … 1?',
      opts: ['for (int i = 10; i >= 1; i--)', 'for (int i = 10; i <= 1; i--) — counting down to one',
             'for (int i = 1; i <= 10; i++) with the output printed in reverse', 'for (int i = 10; i >= 1; i++)'],
      a: 0,
      why: 'Start at 10, continue while i ≥ 1, decrement each pass. (Option B\'s condition is false immediately; option D counts the wrong way and never ends.)' },

    { q: 'In a nested loop, where does <code>break</code> in the <em>inner</em> loop send control?',
      opts: ['Just after the inner loop — the outer loop keeps running',
             'Just after the outer loop — both loops are exited at the same time',
             'Back to the first statement of the outer loop\'s body immediately',
             'Out of the entire function that contains the two nested loops'],
      a: 0,
      why: 'break exits only the innermost enclosing loop. (That is why the symmetric-matrix program in Chapter 5 needs a second break for the outer loop.)' },

    { q: 'The interest program prints a table with <code>setw(4) &lt;&lt; year &lt;&lt; setw(21) &lt;&lt; amount</code>. Why setw on every item?',
      opts: ['setw applies only to the next output item, so each column needs its own',
             'Because setw grows the output field a little wider on every pass of the loop',
             'Because year and amount are different types and share no formatting',
             'It is decorative — the columns would line up the same without setw'],
      a: 0,
      why: 'Chapter 2 fact, used in a Chapter 4 loop: setw is one-shot. Each column of each row must set its own width to keep the table aligned.' }
  ],

  exercises: [
    { title: 'Count 1 to 10 with while',
      brief: 'Example 4.2.1: print the numbers from 1 to 10 separated by spaces, using a <code>while</code> loop with the four parts of counter-controlled repetition. Print a newline at the end.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int count;\n    count = 1;              // initialize the control variable\n\n    // TODO: while count <= 10, print count and a space, then increment\n\n    cout << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int count;\n    count = 1;              // initialize the control variable\n\n    while (count <= 10) {\n        cout << count << " ";\n        count++;            // increment the control variable\n    }\n\n    cout << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '1 2 3 4 5 6 7 8 9 10 \n' }
      ] },

    { title: 'Even numbers with for',
      brief: 'Example 4.3.1: print the even numbers from 2 to 20 with a single <code>for</code> statement — put the initialization, the condition, and the “add 2” update all in the header.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int count;\n\n    // TODO: one for statement, stepping by 2\n\n    cout << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int count;\n\n    for (count = 2; count <= 20; count = count + 2)\n        cout << count << " ";\n\n    cout << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '2 4 6 8 10 12 14 16 18 20 \n' }
      ] },

    { title: 'Sentinel-controlled grade total',
      brief: 'Example 4.2.2 without the prompts: read grades and add them up while they are ≤ 100. The first value greater than 100 is the sentinel that stops the loop. Print <code>Total of the grades is &lt;total&gt;</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nconst int HIGHGRADE = 100;   // sentinel boundary\n\nint main() {\n    double grade, total = 0;\n\n    cin >> grade;\n    // TODO: while grade is <= HIGHGRADE, add it and read the next one\n\n    cout << "Total of the grades is " << total << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nconst int HIGHGRADE = 100;   // sentinel boundary\n\nint main() {\n    double grade, total = 0;\n\n    cin >> grade;\n    while (grade <= HIGHGRADE) {\n        total = total + grade;\n        cin >> grade;\n    }\n\n    cout << "Total of the grades is " << total << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '80 90 101', expect: 'Total of the grades is 170\n' },
        { stdin: '95.5 4.5 200', expect: 'Total of the grades is 100\n' },
        { stdin: '999', expect: 'Total of the grades is 0\n' }
      ] },

    { title: 'Compound interest table',
      brief: 'Example 4.3.2: $1000 at 5% interest — print the deposit after each of 10 years using <code>a = p(1 + r)ⁿ</code>, with the exact column formatting (<code>setw(4)</code> for the year, <code>setw(21)</code> for the amount, <code>fixed</code>, 2 decimals). Note: year 3 prints 1157.63 here — one cent above the slide, which used a different rounding path.',
      starter: '#include <iostream>\n#include <iomanip>\n#include <cmath>\nusing namespace std;\n\nint main() {\n    double amount = 0, principal = 1000.0, rate = 0.05;\n\n    cout << "Year" << setw(21) << "Amount on deposit" << endl;\n    cout << fixed << setprecision(2);\n\n    // TODO: for year = 1..10, compute amount with pow() and print the row\n\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <iomanip>\n#include <cmath>\nusing namespace std;\n\nint main() {\n    double amount = 0, principal = 1000.0, rate = 0.05;\n\n    cout << "Year" << setw(21) << "Amount on deposit" << endl;\n    cout << fixed << setprecision(2);\n\n    for (int year = 1; year <= 10; year++) {\n        amount = principal * pow(1.0 + rate, year);\n        cout << setw(4) << year << setw(21) << amount << endl;\n    }\n\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: 'Year    Amount on deposit\n   1              1050.00\n   2              1102.50\n   3              1157.63\n   4              1215.51\n   5              1276.28\n   6              1340.10\n   7              1407.10\n   8              1477.46\n   9              1551.33\n  10              1628.89\n' }
      ] },

    { title: 'Nested loops: the i–j grid',
      brief: 'Example 4.4.1: an outer loop over i = 1…5; for each i print <code>\\n i is now &lt;i&gt;</code> and a newline, then an inner loop over j = 1…4 printing <code> j = &lt;j&gt;</code>. One trailing newline at the very end.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int MAXI = 5;\n    const int MAXJ = 4;\n    int i, j;\n\n    // TODO: outer loop over i, inner loop over j\n\n    cout << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int MAXI = 5;\n    const int MAXJ = 4;\n    int i, j;\n\n    for (i = 1; i <= MAXI; i++) {\n        cout << "\\n i is now " << i << endl;\n        for (j = 1; j <= MAXJ; j++)\n            cout << " j = " << j;\n    }\n\n    cout << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '\n i is now 1\n j = 1 j = 2 j = 3 j = 4\n i is now 2\n j = 1 j = 2 j = 3 j = 4\n i is now 3\n j = 1 j = 2 j = 3 j = 4\n i is now 4\n j = 1 j = 2 j = 3 j = 4\n i is now 5\n j = 1 j = 2 j = 3 j = 4\n' }
      ] },

    { title: 'Sum of evens with do-while',
      brief: 'Example 4.5.1 without the prompt: read <code>max</code>, then use a <strong>do-while</strong> loop to compute 2 + 4 + … + max and print <code>2 + 4 + ... + &lt;max&gt; sum = &lt;sum&gt;</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int max, sum = 0, digit;\n    digit = 2;\n    cin >> max;\n\n    // TODO: do { add digit, advance by 2 } while (digit <= max);\n\n    cout << "2 + 4 + ... + " << max << " sum = " << sum << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int max, sum = 0, digit;\n    digit = 2;\n    cin >> max;\n\n    do {\n        sum = sum + digit;\n        digit = digit + 2;\n    } while (digit <= max);\n\n    cout << "2 + 4 + ... + " << max << " sum = " << sum << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '10', expect: '2 + 4 + ... + 10 sum = 30\n' },
        { stdin: '20', expect: '2 + 4 + ... + 20 sum = 110\n' },
        { stdin: '2', expect: '2 + 4 + ... + 2 sum = 2\n' }
      ] },

    { supp: true,
      title: 'FizzBuzz',
      brief: 'The most famous loop exercise in programming (not in the slides — but every interviewer knows it). For each number 1…n: print <code>Fizz</code> if it is divisible by 3, <code>Buzz</code> if divisible by 5, <code>FizzBuzz</code> if divisible by both, otherwise the number itself — one per line.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    // TODO: loop 1..n with the three divisibility tests\n    // (hint: test "divisible by both" FIRST — why?)\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    cin >> n;\n\n    for (int i = 1; i <= n; i++) {\n        if (i % 3 == 0 && i % 5 == 0)\n            cout << "FizzBuzz" << endl;\n        else if (i % 3 == 0)\n            cout << "Fizz" << endl;\n        else if (i % 5 == 0)\n            cout << "Buzz" << endl;\n        else\n            cout << i << endl;\n    }\n    return 0;\n}\n',
      tests: [
        { stdin: '5', expect: '1\n2\nFizz\n4\nBuzz\n' },
        { stdin: '15', expect: '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz\n' }
      ] }
  ]
};
