/* Von Neumann Machine - examples, set B: loops, stored program, when things go wrong, speed and size.
   26 items. Every item is verified (tests against an independent oracle, the C++ twin, the numbers quoted in
   story / tryThis) by the author's scripts; see the registry file vn-examples.js for the schema. */
(function (global) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./vn-examples.js') : global.VNExamples;

  R.add([

    /* ---------- LOOPS ---------- */

    { id: 'sum1n', title: 'Sum of 1..N (a loop)', category: 'loops', level: 2,
      summary: 'Add 1 + 2 + ... + N with a backward JUMP: a loop is just PC being overwritten.',
      story: 'A loop is nothing but a JUMP backwards. Give it N in the input box. The loop adds 1, 2, 3 … N into SUM. (It assumes N ≥ 1 — try 0 and see what happens.)',
      concepts: ['loop', 'JUMPGT', 'accumulator', 'flag GT'],
      input: '5',
      src: '; sum = 1 + 2 + ... + N\n        IN        N\n        CLEAR     SUM\n        CLEAR     I\nloop:   INCREMENT I        ; I = I + 1\n        LOAD      SUM\n        ADD       I\n        STORE     SUM      ; SUM = SUM + I\n        LOAD      I\n        COMPARE   N        ; GT = 1 when N > I\n        JUMPGT    loop     ; not finished: go round again\n        OUT       SUM\n        HALT\n.data\nN:   0\nSUM: 0\nI:   0\n',
      tests: [{ in: [5], out: [15] }, { in: [1], out: [1] }, { in: [2], out: [3] }, { in: [10], out: [55] }, { in: [100], out: [5050] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, sum = 0, i = 0;\n    cin >> n;\n    do {                 // the machine tests at the bottom of the loop,\n        i++;             // so even n = 0 runs the body once\n        sum += i;\n    } while (n > i);\n    cout << sum << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with input 5 and watch the GT flag: JUMPGT is taken four times and falls through on the fifth pass.',
        'Predict the instruction count for input 5 (the loop body has 7 instructions, and 5 more instructions run outside the loop), then run it: 40.',
        'Enter 0 as the input: it prints 1, not 0. Add a ZERO cell and a COMPARE before the loop so that N = 0 prints 0 and every other answer stays the same.'
      ] },

    { id: 'countdown', title: 'Countdown to liftoff', category: 'loops', level: 1,
      summary: 'Print N, N-1, ... 1 and then 0. R is loaded once and never touched inside the loop.',
      story: 'The input N is counted down one step at a time. R is loaded with 0 once and then stays 0: COMPARE N tests the memory cell against R, and DECREMENT works directly on the cell, so the loop never needs the accumulator again. Watch the GT flag stay on while N is positive, and the JUMP at the bottom send PC back up to the COMPARE.',
      concepts: ['loop', 'DECREMENT', 'COMPARE', 'flag GT'],
      input: '5',
      src: '; Countdown: print N, N-1, ..., 1 and then 0\n        IN        N\n        LOAD      ZERO       ; R = 0, and R keeps this value for the rest of the program\nloop:   COMPARE   N          ; GT = 1 while N is bigger than R (= 0)\n        JUMPGT    body\n        OUT       ZERO       ; N has reached 0 (or never was positive): print the 0 and stop\n        HALT\nbody:   OUT       N\n        DECREMENT N          ; DECREMENT works on the memory cell itself, so R is untouched\n        JUMP      loop       ; back to the test\n.data\nN:    0\nZERO: 0\n',
      tests: [{ in: [3], out: [3, 2, 1, 0] }, { in: [0], out: [0] }, { in: [1], out: [1, 0] }, { in: [-4], out: [0] }, { in: [10], out: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }, { in: [5], out: [5, 4, 3, 2, 1, 0] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n;\n    cin >> n;\n    while (n > 0) {\n        cout << n << "\\n";\n        n--;\n    }\n    cout << 0 << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Predict the output for input 4, then run it.',
        'Make it count down in steps of 2: add a second DECREMENT N right after the first one. Predict what input 7 prints (does it still reach 0?), then check.'
      ] },

    { id: 'count-up', title: 'Count up until equal', category: 'loops', level: 1,
      summary: 'Print 1, 2, ... N: JUMPNEQ goes round again until I has reached the value kept in R.',
      story: 'JUMPNEQ means "jump if not equal": it is taken while EQ is 0 and falls through the moment EQ becomes 1. R holds N from the start and is never touched again, INCREMENT works on the cell I, and COMPARE I asks whether I has caught up with R. Watch the EQ flag stay 0 round after round and turn 1 on the last pass. For N = 5 the program executes 23 instructions. It needs N ≥ 1: with 0 the counter can never be equal to R.',
      concepts: ['loop', 'JUMPNEQ', 'flag EQ', 'INCREMENT'],
      input: '5',
      src: '; Count up: print 1, 2, ..., N and stop when I has reached N (needs N >= 1)\n        IN        N\n        LOAD      N          ; R = N, and R keeps this value for the rest of the program\nloop:   INCREMENT I          ; I = I + 1\n        OUT       I\n        COMPARE   I          ; EQ = 1 when I is equal to R (= N)\n        JUMPNEQ   loop       ; not there yet: go round again\n        HALT\n.data\nN: 0\nI: 0\n',
      tests: [{ in: [5], out: [1, 2, 3, 4, 5] }, { in: [1], out: [1] }, { in: [2], out: [1, 2] }, { in: [3], out: [1, 2, 3] }, { in: [12], out: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, i = 0;\n    cin >> n;                 // the machine program needs n >= 1\n    do {\n        i++;                  // INCREMENT I\n        cout << i << "\\n";    // OUT I\n    } while (i != n);         // COMPARE I, JUMPNEQ loop\n    return 0;\n}\n',
      tryThis: [
        'Predict the output for the input 3, then run it and watch EQ: it is 0 after the first two passes and 1 after the third.',
        'Run it with the input 0. The counter is already past 0 and can never be equal to it, so the step guard ends the run. Why does this loop need N >= 1?',
        'Make it count in steps of 2 by adding a second INCREMENT I right after the first. Predict what the input 5 prints (does I ever equal 5?), then check.'
      ] },

    { id: 'multiply', title: 'Multiply by repeated addition', category: 'loops', level: 2,
      summary: 'A x B using only ADD: add A to PRODUCT, B times. Works for A, B >= 0.',
      story: 'The machine has no multiply instruction, so A x B is done the way you first learned it: add A to PRODUCT, B times. B is the loop counter, and DECREMENT B counts the copies down to 0. Watch PRODUCT grow by A on every pass, and the JUMP at the bottom send PC back up to the test. The loop runs B times, so the smaller number is the cheaper one to put in B.',
      concepts: ['loop', 'repeated addition', 'counter', 'DECREMENT'],
      input: '6 7',
      src: '; PRODUCT = A x B, by adding A to PRODUCT, B times\n        IN        A\n        IN        B\nloop:   LOAD      ZERO\n        COMPARE   B          ; GT = 1 while B > 0: there is still a copy of A to add\n        JUMPGT    more\n        OUT       PRODUCT\n        HALT\nmore:   LOAD      PRODUCT\n        ADD       A\n        STORE     PRODUCT    ; PRODUCT = PRODUCT + A\n        DECREMENT B          ; one copy fewer to add\n        JUMP      loop\n.data\nA:       0\nB:       0\nPRODUCT: 0\nZERO:    0\n',
      tests: [{ in: [3, 4], out: [12] }, { in: [0, 5], out: [0] }, { in: [5, 0], out: [0] }, { in: [1, 1], out: [1] }, { in: [7, 9], out: [63] }, { in: [12, 12], out: [144] }, { in: [50, 50], out: [2500] }, { in: [6, 7], out: [42] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b, product = 0;\n    cin >> a >> b;\n    while (b > 0) {\n        product += a;\n        b--;\n    }\n    cout << product << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 3 4 and then with 4 3: both print 12, but the instruction count shows 39 for the first run and 31 for the second. Explain the difference.',
        'Run it with 5 0. It prints 0 after only 7 instructions. Which instruction decides that the loop body is skipped?'
      ] },

    { id: 'power', title: 'Powers with nested loops', category: 'loops', level: 3,
      summary: 'A to the power B: an outer loop multiplies B times, an inner loop does each multiplication.',
      story: 'A to the power B means multiplying B times, and each multiplication is itself a loop of additions, so this program has a loop inside a loop. The outer loop counts B down; the inner loop adds RESULT to SUM, A times, and SUM then becomes the new RESULT. Watch two different backward jumps in the diagram. The program needs 28 cells, so the memory grew from 16 to 32 cells by itself.',
      concepts: ['nested loops', 'repeated addition', 'counter', 'accumulator'],
      input: '2 10',
      src: '; RESULT = A to the power B (A >= 0, B >= 0)\n; outer loop: multiply RESULT by A, B times\n; inner loop: one multiplication = add RESULT to SUM, A times\n        IN        A\n        IN        B\nouter:  LOAD      ZERO\n        COMPARE   B          ; GT = 1 while B > 0: one more multiplication to do\n        JUMPGT    multiply\n        OUT       RESULT\n        HALT\nmultiply: CLEAR   SUM        ; SUM will become RESULT x A\n        LOAD      A\n        STORE     COUNT      ; COUNT = A, so that A itself survives\ninner:  LOAD      ZERO\n        COMPARE   COUNT      ; GT = 1 while COUNT > 0\n        JUMPGT    addmore\n        LOAD      SUM\n        STORE     RESULT     ; the multiplication is finished: RESULT = RESULT x A\n        DECREMENT B          ; one multiplication done\n        JUMP      outer\naddmore: LOAD     SUM\n        ADD       RESULT\n        STORE     SUM        ; SUM = SUM + RESULT\n        DECREMENT COUNT\n        JUMP      inner\n.data\nA:      0\nB:      0\nRESULT: 1                    ; anything to the power 0 is 1, so we start from 1\nSUM:    0\nCOUNT:  0\nZERO:   0\n',
      tests: [{ in: [2, 10], out: [1024] }, { in: [3, 5], out: [243] }, { in: [5, 3], out: [125] }, { in: [7, 0], out: [1] }, { in: [0, 0], out: [1] }, { in: [0, 3], out: [0] }, { in: [1, 9], out: [1] }, { in: [10, 4], out: [10000] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b, result = 1;\n    cin >> a >> b;\n    while (b > 0) {\n        long long sum = 0;\n        for (long long count = a; count > 0; count--)\n            sum += result;\n        result = sum;\n        b--;\n    }\n    cout << result << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 5 0. It prints 1 after only 7 instructions, with no multiplication at all. Where does the 1 come from?',
        'Change the starting value of RESULT in the data section from 1 to 2. Predict the output for input 3 2 (the start value gets multiplied by 3 twice), then run it.',
        'Run it with 2 10 and then with 10 4. The answers (1024 and 10000) differ a lot, but the instruction counts are close: 297 and 379. Explain why.'
      ] },

    { id: 'factorial', title: 'Factorial', category: 'loops', level: 2,
      summary: 'N! for N from 0 to 7: multiply a growing RESULT by 1, 2, 3 ... using small add-loops.',
      story: 'N! = 1 x 2 x ... x N. K is the next factor, starting at 1. For each K the program builds RESULT x K by adding RESULT to PRODUCT, K times (a small inner loop), stores it back into RESULT and moves K on. 0! is 1 because the very first COMPARE already says K > N, so no loop runs at all. Inputs from 0 to 7 keep the run short: 7! = 5040 takes 321 instructions.',
      concepts: ['nested loops', 'repeated addition', 'counter', 'accumulator'],
      input: '5',
      src: '; RESULT = N! = 1 x 2 x ... x N   (0! = 1)\n; K is the next factor. RESULT x K is built by adding RESULT to PRODUCT, K times.\n        IN        N\nouter:  LOAD      N\n        COMPARE   K          ; GT = 1 when K > N: every factor has been used\n        JUMPGT    done\n        CLEAR     PRODUCT\n        LOAD      K\n        STORE     COUNT      ; COUNT = K\ninner:  LOAD      ZERO\n        COMPARE   COUNT      ; GT = 1 while COUNT > 0\n        JUMPGT    addmore\n        LOAD      PRODUCT\n        STORE     RESULT     ; RESULT = RESULT x K\n        INCREMENT K          ; on to the next factor\n        JUMP      outer\naddmore: LOAD     PRODUCT\n        ADD       RESULT\n        STORE     PRODUCT\n        DECREMENT COUNT\n        JUMP      inner\ndone:   OUT       RESULT\n        HALT\n.data\nN:       0\nRESULT:  1\nK:       1\nPRODUCT: 0\nCOUNT:   0\nZERO:    0\n',
      tests: [{ in: [0], out: [1] }, { in: [1], out: [1] }, { in: [2], out: [2] }, { in: [5], out: [120] }, { in: [7], out: [5040] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, result = 1, k = 1;\n    cin >> n;\n    while (n >= k) {\n        long long product = 0;\n        for (long long count = k; count > 0; count--)\n            product += result;\n        result = product;\n        k++;\n    }\n    cout << result << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 5 and watch the RESULT cell in the Memory tab: it takes the values 1, 2, 6, 24 and finally 120.',
        'Change K in the data section from 1 to 2. The answers stay the same, but input 7 now needs 300 instructions instead of 321: the 21 saved instructions are one whole pass of the outer loop.'
      ] },

    { id: 'fibonacci', title: 'Fibonacci numbers', category: 'loops', level: 2,
      summary: 'Print the first N Fibonacci numbers: each one is the sum of the two before it.',
      story: 'A and B hold two neighbours of the sequence, starting with 0 and 1. Each pass prints A, computes NEXT = A + B, and then slides the pair one step along: A takes the value of B and B takes NEXT. The three STORE instructions are that shuffle; watch A and B chase each other down the Memory tab. The program needs 20 cells, so the memory grows to 32.',
      concepts: ['loop', 'temporary variable', 'LOAD/STORE', 'counter'],
      input: '10',
      src: '; print the first N Fibonacci numbers: 0 1 1 2 3 5 8 ...\n        IN        N\nloop:   LOAD      ZERO\n        COMPARE   N          ; GT = 1 while N > 0: more numbers to print\n        JUMPGT    body\n        HALT\nbody:   OUT       A          ; print the current number\n        LOAD      A\n        ADD       B\n        STORE     NEXT       ; NEXT = A + B\n        LOAD      B\n        STORE     A          ; A takes B\'s value\n        LOAD      NEXT\n        STORE     B          ; B takes NEXT: the pair has moved one step along\n        DECREMENT N\n        JUMP      loop\n.data\nN:    0\nZERO: 0\nA:    0              ; the number to print now\nB:    1              ; its right-hand neighbour\nNEXT: 0\n',
      tests: [{ in: [0], out: [] }, { in: [1], out: [0] }, { in: [2], out: [0, 1] }, { in: [5], out: [0, 1, 1, 2, 3] }, { in: [10], out: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34] }, { in: [20], out: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 2584, 4181] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, a = 0, b = 1;\n    cin >> n;\n    while (n > 0) {\n        cout << a << "\\n";\n        long long next = a + b;\n        a = b;\n        b = next;\n        n--;\n    }\n    return 0;\n}\n',
      tryThis: [
        'Run it with 10 and check that the last number printed is 34.',
        'Change the starting pair in the data section to A = 2 and B = 1 (the Lucas numbers). Predict the first six numbers, then run it.'
      ] },

    { id: 'gcd', title: 'Greatest common divisor (Euclid)', category: 'loops', level: 2,
      summary: 'Subtract the smaller number from the larger until both are equal: that value is the GCD.',
      story: 'Euclid noticed that the GCD of A and B does not change when the bigger number is replaced by the difference of the two. So the loop subtracts the smaller number from the bigger one until both are equal, and that value is the answer. One COMPARE sets the flags and two jumps read them: JUMPEQ ends the loop, JUMPLT means B < A, and falling through means B is bigger. Both inputs must be at least 1.',
      concepts: ['loop', 'three-way branch', 'flags', 'algorithm'],
      input: '48 18',
      src: '; GCD of two positive numbers by Euclid\'s subtraction method\n        IN        A\n        IN        B\nloop:   LOAD      A\n        COMPARE   B          ; EQ = 1: equal, LT = 1: B < A (A is bigger), otherwise B is bigger\n        JUMPEQ    done\n        JUMPLT    abig\n        LOAD      B          ; B is bigger: B = B - A\n        SUBTRACT  A\n        STORE     B\n        JUMP      loop\nabig:   LOAD      A          ; A is bigger: A = A - B\n        SUBTRACT  B\n        STORE     A\n        JUMP      loop\ndone:   OUT       A          ; A = B = the greatest common divisor\n        HALT\n.data\nA: 0\nB: 0\n',
      tests: [{ in: [48, 18], out: [6] }, { in: [17, 5], out: [1] }, { in: [7, 7], out: [7] }, { in: [1, 100], out: [1] }, { in: [100, 75], out: [25] }, { in: [270, 192], out: [6] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b;\n    cin >> a >> b;\n    while (a != b) {\n        if (a > b) a -= b;\n        else b -= a;\n    }\n    cout << a << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 48 18 and follow A and B in the Memory tab: (48, 18) (30, 18) (12, 18) (12, 6) (6, 6).',
        'Run it with 1 100. Predict the instruction count (8 instructions for each of the 99 subtractions, plus 7 more), then check: 799.',
        'Run it with 0 6: the machine never stops and the step guard ends the run. Explain why the loop can never reach EQ.'
      ] },

    { id: 'divmod', title: 'Quotient and remainder', category: 'loops', level: 2,
      summary: 'Divide A by B with subtraction only: count how often B fits into A; the rest is the remainder.',
      story: 'Long before CPUs had a divide instruction, division was repeated subtraction: take B away from A as long as B still fits, and count the takes in Q. What is left in A is the remainder. The test B <= A is JUMPLE, a pseudo-instruction that the assembler turns into two real jumps (JUMPLT, then JUMPEQ), which is why the 12 instruction lines take 13 cells. Needs A >= 0 and B >= 1.',
      concepts: ['loop', 'pseudo-instruction', 'JUMPLE', 'repeated subtraction'],
      input: '17 5',
      src: '; A divided by B with whole numbers: quotient Q and remainder (left in A). Needs A >= 0 and B > 0.\n        IN        A\n        IN        B\nloop:   LOAD      A\n        COMPARE   B          ; LT = 1 when B < A, EQ = 1 when B = A\n        JUMPLE    take       ; B <= A: B still fits into A (a pseudo-instruction: two real jumps)\n        OUT       Q          ; the quotient\n        OUT       A          ; what is left over is the remainder\n        HALT\ntake:   SUBTRACT  B          ; R still holds A, so R = A - B\n        STORE     A\n        INCREMENT Q          ; one more copy of B taken out\n        JUMP      loop\n.data\nA: 0\nB: 0\nQ: 0\n',
      tests: [{ in: [17, 5], out: [3, 2] }, { in: [20, 5], out: [4, 0] }, { in: [3, 7], out: [0, 3] }, { in: [0, 4], out: [0, 0] }, { in: [100, 1], out: [100, 0] }, { in: [9, 9], out: [1, 0] }, { in: [1000, 10], out: [100, 0] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b, q = 0;\n    cin >> a >> b;\n    while (b <= a) {\n        a -= b;\n        q++;\n    }\n    cout << q << "\\n" << a << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 17 5: it prints the quotient 3 and then the remainder 2. Find Q and A in the Memory tab afterwards.',
        'Replace JUMPLE by JUMPLT and run 20 5. The answer changes from 4 0 to 3 5: explain why the case B = A matters.',
        'Open the Listing tab and find the two words that the single line JUMPLE take turned into.'
      ] },

    { id: 'collatz', title: 'Collatz steps', category: 'loops', level: 3,
      summary: 'Count the steps of the 3N + 1 game until N reaches 1, halving N with a subtraction loop.',
      story: 'The Collatz game: if N is even halve it, if odd replace it by 3N + 1, and count the steps until N = 1. The machine cannot divide, so the program takes 2 away from a copy of N again and again: Q counts the takes (that is N / 2) and REM ends as 0 for an even N and 1 for an odd N. It is slow on purpose: 6 needs 8 steps but 364 instructions. Needs N >= 1.',
      concepts: ['nested loops', 'parity', 'repeated subtraction', 'step guard'],
      input: '6',
      src: '; Collatz game: if N is even halve it, if odd replace it by 3N + 1; count the steps until N = 1.\n; There is no division, so we take 2 away from a copy of N again and again:\n; Q counts the takes (= N / 2) and REM ends as 0 (N even) or 1 (N odd). Needs N >= 1.\n        IN        N\nloop:   LOAD      ONE\n        COMPARE   N          ; EQ = 1 when N is 1: the game is over\n        JUMPEQ    done\n        CLEAR     Q\n        LOAD      N\n        STORE     REM        ; REM starts as a copy of N\nhalf:   LOAD      REM\n        COMPARE   TWO        ; LT = 1 when 2 < REM, EQ = 1 when 2 = REM\n        JUMPLE    take2      ; REM >= 2: take another 2 away (pseudo-instruction, two real jumps)\n        LOAD      ZERO\n        COMPARE   REM        ; EQ = 1 when REM is 0: N was even\n        JUMPEQ    even\n        LOAD      N          ; N was odd: N = 3N + 1\n        ADD       N\n        ADD       N\n        ADD       ONE\n        STORE     N\n        JUMP      counted\neven:   LOAD      Q\n        STORE     N          ; N was even: N = N / 2\ncounted: INCREMENT STEPS\n        JUMP      loop\ntake2:  LOAD      REM\n        SUBTRACT  TWO\n        STORE     REM\n        INCREMENT Q\n        JUMP      half\ndone:   OUT       STEPS\n        HALT\n.data\nN:     0\nSTEPS: 0\nQ:     0\nREM:   0\nONE:   1\nTWO:   2\nZERO:  0\n',
      tests: [{ in: [1], out: [0] }, { in: [2], out: [1] }, { in: [3], out: [7] }, { in: [6], out: [8] }, { in: [7], out: [16] }, { in: [9], out: [19] }, { in: [12], out: [9] }, { in: [15], out: [17] }, { in: [19], out: [20] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, steps = 0;\n    cin >> n;\n    while (n != 1) {\n        if (n % 2 == 0) n = n / 2;\n        else n = 3 * n + 1;\n        steps++;\n    }\n    cout << steps << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 6 and follow N in the Memory tab: 6, 3, 10, 5, 16, 8, 4, 2, 1. That is 8 steps.',
        'Run it with 27 (111 steps): the step guard stops the run at 10000 instructions. In Settings raise the step guard to 1000000 and run again: it prints 111 after 407719 instructions.',
        'Which starting number below 20 takes the most steps? Run the candidates and find out (two numbers share the record).'
      ] },

    { id: 'times-table', title: 'Times table', category: 'loops', level: 1,
      summary: 'Print N x 1 up to N x 10 by adding N to a running total, ten times.',
      story: 'No multiply instruction is needed: every round adds N to ROW, so ROW takes the values N, 2N, 3N ... 10N and OUT prints it each time. I counts the rows with INCREMENT, and COMPARE LIMIT decides when ten rows are done. Watch ROW grow by the same step in the Memory tab, and the GT flag turn off after the tenth row. Ten rounds of 8 instructions plus IN and HALT make 82 instructions.',
      concepts: ['loop', 'counter', 'repeated addition', 'OUT'],
      input: '7',
      src: '; times table: N x 1, N x 2, ..., N x 10 (each row is the previous row plus N)\n        IN        N\nloop:   LOAD      ROW\n        ADD       N\n        STORE     ROW        ; ROW = ROW + N\n        OUT       ROW\n        INCREMENT I          ; I counts the rows printed so far\n        LOAD      I\n        COMPARE   LIMIT      ; GT = 1 while LIMIT > I: more rows to print\n        JUMPGT    loop\n        HALT\n.data\nN:     0\nROW:   0\nI:     0\nLIMIT: 10\n',
      tests: [{ in: [3], out: [3, 6, 9, 12, 15, 18, 21, 24, 27, 30] }, { in: [0], out: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, { in: [1], out: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }, { in: [-2], out: [-2, -4, -6, -8, -10, -12, -14, -16, -18, -20] }, { in: [12], out: [12, 24, 36, 48, 60, 72, 84, 96, 108, 120] }, { in: [7], out: [7, 14, 21, 28, 35, 42, 49, 56, 63, 70] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, row = 0;\n    cin >> n;\n    for (int i = 1; i <= 10; i++) {\n        row += n;\n        cout << row << "\\n";\n    }\n    return 0;\n}\n',
      tryThis: [
        'Run it with 7 and check the last line of the output: 70.',
        'Make the table go up to 12 instead of 10 by changing one number in the data section. Run it with 3: the last line must be 36.'
      ] },

    { id: 'sum-of-squares', title: 'Sum of squares', category: 'loops', level: 2,
      summary: 'Compute 1^2 + 2^2 + ... + N^2 with no multiplication: each square is the last plus an odd number.',
      story: 'Squares have a pattern: 1, 4, 9, 16 ... grow by the odd numbers 3, 5, 7 ... So each pass adds ODD to SQ to get the next square, moves ODD on by 2, and adds SQ to TOTAL. No multiplication is needed. Watch SQ and ODD in the Memory tab: ODD always holds the gap to the next square.',
      concepts: ['loop', 'accumulator', 'pattern', 'LOAD/STORE'],
      input: '5',
      src: '; TOTAL = 1^2 + 2^2 + ... + N^2 without a multiply instruction.\n; The squares 1, 4, 9, 16 ... grow by the odd numbers 3, 5, 7 ...\n        IN        N\nloop:   LOAD      I\n        COMPARE   N          ; GT = 1 while N > I: another square to add\n        JUMPGT    body\n        OUT       TOTAL\n        HALT\nbody:   INCREMENT I\n        LOAD      SQ\n        ADD       ODD\n        STORE     SQ         ; SQ = I squared (the previous square plus the next odd number)\n        LOAD      ODD\n        ADD       TWO\n        STORE     ODD        ; the next odd number\n        LOAD      TOTAL\n        ADD       SQ\n        STORE     TOTAL\n        JUMP      loop\n.data\nN:     0\nI:     0\nSQ:    0\nODD:   1\nTWO:   2\nTOTAL: 0\n',
      tests: [{ in: [0], out: [0] }, { in: [1], out: [1] }, { in: [2], out: [5] }, { in: [3], out: [14] }, { in: [10], out: [385] }, { in: [20], out: [2870] }, { in: [30], out: [9455] }, { in: [5], out: [55] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, i = 0, sq = 0, odd = 1, total = 0;\n    cin >> n;\n    while (n > i) {\n        i++;\n        sq += odd;\n        odd += 2;\n        total += sq;\n    }\n    cout << total << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 10: the answer is 385. Watch SQ and ODD in the Memory tab: SQ is 1, 4, 9, 16 ... while ODD is 3, 5, 7, 9 ...',
        'Add the line OUT SQ right after STORE SQ. With input 5 the output becomes 1 4 9 16 25 and then the total 55.'
      ] },

    { id: 'prime-test', title: 'Is it prime?', category: 'loops', level: 3,
      summary: 'Trial division by 2, 3, 4 ... using repeated subtraction. Prints 1 for a prime and 0 otherwise.',
      story: 'To test N the program tries every D from 2 up to N - 1. D divides N when subtracting D again and again lands exactly on D (REM = D); if REM falls below D instead, there is a remainder and D is rejected. Reaching D = N without a hit means N is prime; 0 and 1 are rejected at the start. Primes are the slow case: 97 takes 3595 instructions, but 91 = 7 x 13 stops at D = 7 after only 1064.',
      concepts: ['nested loops', 'repeated subtraction', 'early exit', 'algorithm'],
      input: '97',
      src: '; prints 1 if N is prime, 0 if not. Tries D = 2, 3, ... N-1 as a divisor.\n        IN        N\n        LOAD      TWO\n        COMPARE   N          ; LT = 1 when N < 2: 0 and 1 are not prime\n        JUMPLT    notprime\ntry:    LOAD      D\n        COMPARE   N          ; GT = 1 while N > D: another divisor to try\n        JUMPGT    divtest\n        OUT       ONE        ; no divisor found: N is prime\n        HALT\ndivtest: LOAD     N\n        STORE     REM        ; REM starts as a copy of N\nsub:    LOAD      REM\n        COMPARE   D          ; LT = 1 when D < REM, EQ = 1 when D = REM\n        JUMPLT    takeaway\n        JUMPEQ    notprime   ; subtracting D landed exactly on D: D divides N\n        INCREMENT D          ; REM fell below D: not a divisor, try the next D\n        JUMP      try\ntakeaway: LOAD    REM\n        SUBTRACT  D\n        STORE     REM\n        JUMP      sub\nnotprime: OUT     ZERO\n        HALT\n.data\nN:    0\nTWO:  2\nD:    2\nREM:  0\nONE:  1\nZERO: 0\n',
      tests: [{ in: [0], out: [0] }, { in: [1], out: [0] }, { in: [2], out: [1] }, { in: [3], out: [1] }, { in: [4], out: [0] }, { in: [9], out: [0] }, { in: [17], out: [1] }, { in: [25], out: [0] }, { in: [53], out: [1] }, { in: [91], out: [0] }, { in: [97], out: [1] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n;\n    cin >> n;\n    bool prime = n >= 2;\n    for (long long d = 2; d < n && prime; d++) {\n        long long rem = n;\n        while (rem > d) rem -= d;\n        if (rem == d) prime = false;\n    }\n    cout << (prime ? 1 : 0) << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 97 and then with 91 (7 x 13). Compare the instruction counts (3595 and 1064): why is a composite number cheaper than a prime?',
        'Run it with 3 and then with 4. Although 4 is bigger it needs fewer instructions (22 instead of 27). Which divisor does 4 find, and what does 3 have to try?'
      ] },

    /* ---------- STORED PROGRAM ---------- */

    { id: 'selfmod', title: 'Program and data share memory', category: 'stored', level: 1,
      summary: 'INCREMENT edits an instruction as if it were data: OUT 3 becomes OUT 4. The stored-program idea.',
      story: 'The stored-program idea in one picture: the instruction OUT 3 lives in cell 1, and INCREMENT treats that cell as ordinary data. Add 1 to the word and it becomes OUT 4. Compare the “Bits” column in the Memory tab before and after. Try also clicking a cell and typing a new number into it.',
      concepts: ['stored program', 'self-modifying code', 'opcode + address', 'INCREMENT'],
      input: '',
      src: '; a program that edits its own instruction\n        INCREMENT patch    ; cell 1 is an INSTRUCTION, but INCREMENT only sees a number\npatch:  OUT       first    ; after the edit this reads OUT second\n        HALT\n.data\nfirst:  111\nsecond: 222\n',
      tests: [{ in: [], out: [222] }, { in: [5], out: [222] }, { in: [1, 2, 3], out: [222] }],
      noCpp: 'C++ keeps code and data apart; a program cannot rewrite its own instructions, so there is no honest C++ twin.',
      tryThis: [
        'Step through it and watch cell 1 in the Memory tab: its “As code” column reads OUT 3 before the INCREMENT and OUT 4 after it.',
        'Change INCREMENT patch into DECREMENT patch, so that cell 1 becomes OUT 2. Predict what is printed (hint: cell 2 holds HALT), then run it.',
        'Add a third data cell, third: 333, after second. Use two INCREMENT patch lines (one after the other) so that the program prints 333.'
      ] },

    { id: 'array-sum-selfmod', title: 'Array sum with a self-changing LOAD', category: 'stored', level: 3,
      summary: 'Read up to 8 numbers into an array and add them up by rewriting the address field of IN and LOAD.',
      story: 'There is no index register on this machine, so how do you walk through an array? An instruction is a number in memory and its address field is the low bits of that number. INCREMENT on the cell of IN arr or LOAD arr turns it into IN arr+1 or LOAD arr+1, so the same instruction visits the next element. In C++ you would write arr[i]; here the program rewrites itself to move the index. Watch cells 3 (readlp) and 9 (addlp) change in the Memory tab.',
      concepts: ['arrays (chapter 5)', 'self-modifying code', 'address field', 'stored program'],
      input: '5 3 8 1 9 4',
      src: '; Sum of N numbers kept in an array (N = 1 .. 8). First input number: N. Then N numbers follow.\n; This machine has no index register, so the program rewrites the address field of the\n; IN and the LOAD below: INCREMENT on an instruction cell turns "LOAD arr" into "LOAD arr+1".\n        IN        N\n        LOAD      N\n        STORE     COUNT\nreadlp: IN        arr        ; the address field of this word moves on: arr, arr+1, arr+2 ...\n        INCREMENT readlp     ; rewrite the instruction above (its address field grows by 1)\n        DECREMENT COUNT\n        LOAD      ZERO\n        COMPARE   COUNT      ; GT = 1 while COUNT > 0\n        JUMPGT    readlp\naddlp:  LOAD      arr        ; second pass: this address field also moves on\n        ADD       SUM\n        STORE     SUM        ; SUM = SUM + the next array element\n        INCREMENT addlp\n        DECREMENT N\n        LOAD      ZERO\n        COMPARE   N\n        JUMPGT    addlp\n        OUT       SUM\n        HALT\n.data\nN:     0\nCOUNT: 0\nZERO:  0\nSUM:   0\narr:   .word 0, 0, 0, 0, 0, 0, 0, 0    ; room for 8 numbers\n',
      tests: [{ in: [5, 3, 8, 1, 9, 4], out: [25] }, { in: [1, 7], out: [7] }, { in: [3, 10, 20, 30], out: [60] }, { in: [4, -5, 5, -5, 5], out: [0] }, { in: [8, 1, 2, 3, 4, 5, 6, 7, 8], out: [36] }, { in: [2, -9, -1], out: [-10] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, arr[8] = {0}, sum = 0;\n    cin >> n;\n    for (int i = 0; i < n; i++) cin >> arr[i];     // the machine\'s first loop: IN arr, IN arr+1, ...\n    for (int i = 0; i < n; i++) sum += arr[i];     // the second loop: LOAD arr, LOAD arr+1, ...\n    cout << sum << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 3 10 20 30 and look at cells 3 and 9 afterwards: they read IN 26 and LOAD 26 instead of IN 23 and LOAD 23. The array starts at cell 23.',
        'Input 9 followed by 1 2 ... 9 prints 45 (cell 31 is free, so nine elements still fit). Now try 10 followed by 1 2 ... 10 and explain the two odd numbers 435 and 45.'
      ] },

    { id: 'array-max-selfmod', title: 'Array maximum with a self-changing LOAD', category: 'stored', level: 3,
      summary: 'Read up to 8 numbers into an array and find the largest by walking it with a rewritten LOAD.',
      story: 'The same trick as in the array-sum example, now looking for the largest number. The first loop reads N numbers into the array by rewriting the address field of IN; the second walks the array by rewriting the address field of LOAD. COMPARE MAX sets LT when MAX is smaller than the element in R, and then JUMPLT newmax stores the new champion. The program needs 35 cells, so the memory grows to 64.',
      concepts: ['arrays (chapter 5)', 'self-modifying code', 'maximum', 'COMPARE'],
      input: '5 3 8 1 9 4',
      src: '; Largest of N numbers kept in an array (N = 1 .. 8). First input number: N, then N numbers.\n; As in the array-sum example the program walks the array by rewriting the address field\n; of its own IN and LOAD instructions (no index register on this machine).\n        IN        N\n        LOAD      N\n        STORE     COUNT\nreadlp: IN        arr        ; address field: arr, arr+1, ...\n        INCREMENT readlp\n        DECREMENT COUNT\n        LOAD      ZERO\n        COMPARE   COUNT      ; GT = 1 while COUNT > 0\n        JUMPGT    readlp\n        LOAD      arr\n        STORE     MAX        ; start with the first element as the best so far\nscan:   LOAD      arr        ; this address field also moves on\n        COMPARE   MAX        ; LT = 1 when MAX < this element\n        JUMPLT    newmax\nnext:   INCREMENT scan       ; walk on to the next element\n        DECREMENT N\n        LOAD      ZERO\n        COMPARE   N\n        JUMPGT    scan\n        OUT       MAX\n        HALT\nnewmax: STORE     MAX        ; R still holds the element that beat MAX\n        JUMP      next\n.data\nN:     0\nCOUNT: 0\nZERO:  0\nMAX:   0\narr:   .word 0, 0, 0, 0, 0, 0, 0, 0    ; room for 8 numbers\n',
      tests: [{ in: [5, 3, 8, 1, 9, 4], out: [9] }, { in: [1, 7], out: [7] }, { in: [3, -5, -2, -9], out: [-2] }, { in: [4, 6, 6, 6, 6], out: [6] }, { in: [8, 1, 2, 3, 4, 5, 6, 7, 99], out: [99] }, { in: [6, 100, 3, 2, 1, 0, -1], out: [100] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, arr[8] = {0};\n    cin >> n;\n    for (int i = 0; i < n; i++) cin >> arr[i];\n    long long mx = arr[0];\n    for (int i = 0; i < n; i++)\n        if (arr[i] > mx) mx = arr[i];\n    cout << mx << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run it with 6 4 17 9 -3 12 8 and watch the MAX cell: it becomes 4 (the first element), then 17, and never changes again.',
        'Run it with 3 -5 -2 -9: it prints -2. Explain why the program copies the first element into MAX instead of starting MAX at 0.'
      ] },

    { id: 'print-own-code', title: 'A program that prints its own code', category: 'stored', level: 1,
      summary: 'OUT prints any cell, even one that holds an instruction: code is just numbers in memory.',
      story: 'OUT prints the number stored in a cell and does not care whether the cell holds data or an instruction. Cell 0 holds the instruction OUT 0 itself, so the first number printed is its machine word: opcode 1110 (OUT) followed by address 0000 gives 224. The second is OUT 1 = 225, the third is the HALT word 1111 0000 = 240, and the last is the ordinary data cell 42. Compare the bits column in the Memory tab with the printed numbers.',
      concepts: ['stored program', 'opcode + address', 'code is data', 'OUT'],
      input: '',
      src: '; OUT shows the number in a cell. It does not care whether the cell holds data or an instruction.\n        OUT       0          ; cell 0 is THIS instruction, so we print its own machine word\n        OUT       1          ; cell 1 is the next instruction: OUT 1\n        OUT       4          ; cell 4 is the HALT instruction below\n        OUT       answer     ; for comparison: an ordinary data cell\n        HALT\n.data\nanswer: 42\n',
      tests: [{ in: [], out: [224, 225, 240, 42] }, { in: [7], out: [224, 225, 240, 42] }, { in: [1, 2, 3], out: [224, 225, 240, 42] }],
      noCpp: 'A C++ program cannot print its own machine code portably, so there is no honest C++ twin.',
      tryThis: [
        'Change the data value 42 to 240 and run again: the data cell and the HALT instruction print the same number. What does this say about code and data?',
        'In Settings set the memory size to 32 cells (the address field grows from 4 to 5 bits). Predict the first number printed (opcode 1110, then five address bits), then run it.'
      ] },

    { id: 'patch-halt', title: 'Patch a HALT at run time', category: 'stored', level: 1,
      summary: 'The program copies an instruction over its own HALT before it gets there, so it keeps going.',
      story: 'The HALT at the label slot never gets the chance to stop the machine. Before PC reaches it, LOAD spare copies the machine word of the instruction OUT X (a cell parked behind the real HALT) into R, and STORE slot writes it over the HALT. Watch cell 4 in the Memory tab: it changes from HALT (240) to OUT 8 (232), so X is printed a second time and only then does the real HALT stop the program.',
      concepts: ['stored program', 'self-modifying code', 'LOAD/STORE', 'HALT'],
      input: '5',
      src: '; The first HALT is replaced while the program runs.\n        IN        X\n        OUT       X          ; first output\n        LOAD      spare      ; R = the machine word of the instruction "OUT X" (a code cell!)\n        STORE     slot       ; ...and write it on top of the HALT below\nslot:   HALT                 ; by the time PC arrives, this cell holds OUT X\n        HALT                 ; the real end\nspare:  OUT       X          ; never executed in place: only used as a template\n        HALT                 ; (never reached) so that the template cannot run off the end\n.data\nX: 0\n',
      tests: [{ in: [5], out: [5, 5] }, { in: [0], out: [0, 0] }, { in: [-3], out: [-3, -3] }, { in: [123], out: [123, 123] }],
      noCpp: 'C++ code is not stored in writable memory the program can edit, so there is no honest C++ twin.',
      tryThis: [
        'Run it with 5: it prints 5 twice although only one OUT comes before the first HALT. Step to STORE slot and watch cell 4 change.',
        'Delete the STORE slot line and run again: the first HALT now stops the program, and only one 5 is printed.'
      ] },

    /* ---------- WHEN THINGS GO WRONG ---------- */

    { id: 'bug-no-halt', title: 'Bug: the missing HALT', category: 'wrong', level: 1,
      summary: 'A program that prints 12 and then never stops properly: the CPU runs on into the data cells.',
      story: 'The program adds 7 and 5, prints 12 and then keeps going. There is no HALT, so PC moves on into the data cells and the CPU tries to execute them: 7, 5 and 12 happen to be valid instruction words (LOAD 7, LOAD 5, LOAD 12), and the empty cells after them are all 0 = LOAD 0. After 16 instructions PC reaches 16, outside the memory, and the machine stops with an error. Watch PC walk down the Memory tab.',
      concepts: ['HALT', 'program counter', 'data as code', 'error message'],
      input: '',
      src: '; Add two numbers and print the sum.\n        LOAD      FIRST      ; R = 7\n        ADD       SECOND     ; R = 7 + 5\n        STORE     SUM        ; OUT can only print a memory cell, so park the result in one\n        OUT       SUM        ; prints 12\n        ; BUG: no HALT here, so PC just keeps going into the next cell\n.data\nFIRST:  7\nSECOND: 5\nSUM:    0\n',
      tests: [{ in: [], error: 'pc-range' }, { in: [1], error: 'pc-range' }, { in: [1, 2], error: 'pc-range' }],
      noCpp: 'A C++ function always returns at its closing brace; there is no way to run on into the data, so no twin.',
      tryThis: [
        'Add a HALT line after OUT SUM and run again: the program now stops cleanly after 5 instructions.',
        'Change SECOND from 5 to 1000 and run again. The error changes: which cell does the machine now refuse to execute, and why?'
      ] },

    { id: 'bug-data-as-code', title: 'Bug: executing a data cell', category: 'wrong', level: 1,
      summary: 'A mistyped JUMP target sends PC into a data cell, and the number there is not an instruction.',
      story: 'The program prints 270 and then JUMPs. It was meant to jump to the label finish, but a data name works as an address too, so PC lands in cell 9, which holds the number 270. The machine copies it into IR and tries to decode it, but a word on this 16-cell machine has only 4 opcode bits and 4 address bits (at most 255), so 270 is not an instruction and the run stops with an error.',
      concepts: ['JUMP', 'data as code', 'opcode + address', 'error message'],
      input: '',
      src: '; Price plus tax, then skip the debugging line and stop.\n        LOAD      PRICE\n        ADD       TAX\n        STORE     TOTAL\n        OUT       TOTAL\n        JUMP      TOTAL      ; BUG: TOTAL is a data cell. We meant to jump to "finish".\n        OUT       PRICE      ; a debugging line we wanted to skip\nfinish: HALT\n.data\nPRICE: 250\nTAX:   20\nTOTAL: 0\n',
      tests: [{ in: [], error: 'bad-word' }, { in: [1], error: 'bad-word' }, { in: [4, 5], error: 'bad-word' }],
      noCpp: 'The C++ compiler keeps data and code apart, so a jump into a variable cannot be written; no twin.',
      tryThis: [
        'Fix the typo (JUMP finish) and run again: the program stops cleanly after printing 270.',
        'Change PRICE to 100 and run again with the typo still in place. TOTAL is now 120 = 0111 1000, a valid instruction (COMPARE 8). Predict how the run ends, then check.'
      ] },

    { id: 'bug-infinite-loop', title: 'Bug: the loop that never ends', category: 'wrong', level: 1,
      summary: 'A sum loop that forgets to move its counter. The step guard stops it after 10000 instructions.',
      story: 'The loop is meant to add 1, 2, 3 ... N, but nothing ever changes I, so COMPARE N keeps saying GT = 1 and JUMP loop is taken again and again. After 10000 instructions the step guard stops the machine; without it the page would hang. Watch the same seven instructions repeat while SUM stays at 0. (Input 0 or less is fine: the first COMPARE already gives GT = 0, so the program prints 0 and halts.)',
      concepts: ['loop', 'step guard', 'infinite loop', 'INCREMENT'],
      input: '5',
      src: '; Sum of 1..N, but the loop never moves I forward.\n        IN        N\nloop:   LOAD      I\n        COMPARE   N          ; GT = 1 while N is bigger than I\n        JUMPGT    body\n        OUT       SUM\n        HALT\nbody:   LOAD      SUM\n        ADD       I\n        STORE     SUM\n        JUMP      loop       ; BUG: nothing in the loop changes I, so GT stays 1 for ever\n.data\nN:   0\nI:   0\nSUM: 0\n',
      tests: [{ in: [5], error: 'step-guard' }, { in: [1], error: 'step-guard' }, { in: [100], error: 'step-guard' }, { in: [0], out: [0] }],
      noCpp: 'An endless loop cannot be run as an automated check, so there is no compile-and-compare twin.',
      tryThis: [
        'Fix it: insert INCREMENT I as the first line after the label body. Run it with 5: it prints 15 and stops after 46 instructions.',
        'Run it with 0: it prints 0 and halts. Why does the same program stop for N = 0 but not for N = 5?'
      ] },

    { id: 'bug-off-by-one', title: 'Bug: off by one', category: 'wrong', level: 2,
      summary: 'A sum loop that runs but prints 10 instead of 15 for N = 5: the last number is left out.',
      story: 'This program should print 15 for N = 5 but prints 10: the last number, 5, is never added. When I has just reached N, COMPARE N gives GT = 0, so JUMPGT does not go to addit and the loop ends one round too early. A bug like this runs happily and prints a plausible wrong answer. The tests of this example hold the correct answers (15 for 5, 55 for 10), so the Tests tab shows red until you fix the bug and green afterwards.',
      concepts: ['off-by-one error', 'COMPARE', 'JUMPGT', 'testing'],
      input: '5',
      src: '; Sum of 1 + 2 + ... + N. BUGGY: for N = 5 the answer should be 15.\n        IN        N\nloop:   INCREMENT I\n        LOAD      I\n        COMPARE   N          ; GT = 1 when N > I\n        JUMPGT    addit      ; BUG: when I has just reached N we still have to add it\n        JUMP      done\naddit:  LOAD      SUM\n        ADD       I\n        STORE     SUM\n        JUMP      loop\ndone:   OUT       SUM\n        HALT\n.data\nN:   0\nI:   0\nSUM: 0\n',
      tests: [{ in: [5], out: [15] }, { in: [1], out: [1] }, { in: [2], out: [3] }, { in: [10], out: [55] }, { in: [0], out: [0] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nconst bool BUG = false;   // set to true to reproduce the bug of the machine program\n\nint main() {\n    long long n, i = 0, sum = 0;\n    cin >> n;\n    for (;;) {\n        i++;\n        bool add = BUG ? (n > i) : (n >= i);   // BUG: the machine program forgets i == n\n        if (!add) break;\n        sum += i;\n    }\n    cout << sum << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Before fixing anything, predict the output for N = 10 (45 or 55?), then run it. Open the Tests tab and press Run all: four of the five cases fail (only N = 0 passes, by luck), because the expected values are the correct ones.',
        'Fix it by replacing JUMPGT addit with JUMPGE addit (a pseudo-instruction). Run N = 5: you should get 15. Then press Run all in the Tests tab: every case turns green.'
      ] },

    { id: 'bug-needs-input', title: 'Bug: waiting for a number', category: 'wrong', level: 1,
      summary: 'The program asks for three numbers but the input box holds two: the machine waits, it does not fail.',
      story: 'The program wants three numbers, but the input box holds only 4 and 6. After the second IN the third one has nothing to read, so the machine stops and shows that it is waiting for input. That is not an error: nothing is lost. Look at the status line, the number of finished instructions (2) and the output log (still empty). Add a third number to the input box and run again.',
      concepts: ['IN', 'input queue', 'waiting', 'status'],
      input: '4 6',
      src: '; Add three numbers. The input box holds only two, so the third IN has to wait.\n        IN        A          ; takes the first number from the input queue\n        IN        B          ; takes the second one\n        IN        C          ; with an empty queue the machine waits right here\n        LOAD      A          ; from here on the program is fine; it just never gets this far\n        ADD       B\n        ADD       C\n        STORE     SUM\n        OUT       SUM\n        HALT\n.data\nA:   0\nB:   0\nC:   0\nSUM: 0\n',
      tests: [{ in: [4, 6], error: 'waiting' }, { in: [], error: 'waiting' }, { in: [1], error: 'waiting' }, { in: [4, 6, 10], out: [20] }, { in: [-1, 0, 1], out: [0] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long a, b, c;\n    if (!(cin >> a >> b >> c)) return 0;   // the machine "waits" here; a batch program has to give up\n    cout << a + b + c << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Add a third number, for example 4 6 10, and run again: the program prints 20.',
        'Run it with an empty input box, then with one number, then with two: the instruction count shows 0, 1 and 2 before the machine starts to wait.'
      ] },

    { id: 'bug-uninitialized', title: 'Bug: forgotten starting value', category: 'wrong', level: 1,
      summary: 'A doubling loop that should print 2^N prints 0 every time: the starting value was never set.',
      story: 'The doubling loop is correct, but POWER has no starting value: a data cell without a value starts as 0, and 0 + 0 is 0 however often you double it. So every input prints 0, even N = 0 (where the answer should be 1). A local int in C++ without an initial value is even worse: it can hold leftover garbage. Give accumulators the right start: 0 for sums, 1 for products and powers. The tests of this example hold the correct answers (1, 2, 8, 1024), so the Tests tab stays red until you fix the bug.',
      concepts: ['initialization', 'data section', 'accumulator', 'loop'],
      input: '3',
      src: '; POWER = 2 to the power N, by doubling POWER N times. BUGGY: it prints 0.\n        IN        N\nloop:   LOAD      ZERO\n        COMPARE   N          ; GT = 1 while N > 0\n        JUMPGT    double\n        OUT       POWER\n        HALT\ndouble: LOAD      POWER\n        ADD       POWER\n        STORE     POWER      ; POWER = POWER + POWER\n        DECREMENT N\n        JUMP      loop\n.data\nN:     0\nZERO:  0\nPOWER:               ; BUG: no starting value was given, so the cell starts as 0\n',
      tests: [{ in: [3], out: [8] }, { in: [0], out: [1] }, { in: [10], out: [1024] }, { in: [1], out: [2] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nconst bool BUG = false;   // set to true to reproduce the bug of the machine program\n\nint main() {\n    long long n, power = BUG ? 0 : 1;   // BUG: the machine program never sets the start value 1\n    cin >> n;\n    while (n > 0) {\n        power = power + power;\n        n--;\n    }\n    cout << power << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Give POWER the starting value 1 in the data section. Run N = 3: the answer becomes 8, and N = 10 gives 1024. Press Run all in the Tests tab to see every case turn green.',
        'With the fix in place, add a second ADD POWER line right after the first one (tripling instead of doubling) and run N = 3: the answer is 27.'
      ] },

    /* ---------- SPEED, SIZE AND THE BOTTLENECK ---------- */

    { id: 'loop-vs-unrolled', title: 'Loop or straight-line code?', category: 'speed', level: 2,
      summary: 'X times 8 written twice in one program: as a loop (small, slow) and unrolled (bigger, fast).',
      story: 'Both versions compute X x 8 by adding X eight times. The first input number picks the version: 0 runs the loop, any other number runs the straight-line copy. With input 0 5 the loop needs 63 instructions; with 1 5 the unrolled code needs only 17, because it has no counter, no COMPARE and no JUMP. The price is memory: the unrolled block takes 11 cells against 9 for the loop block, and each extra repetition would add one more instruction to it.',
      concepts: ['loop unrolling', 'program size', 'instruction count', 'trade-off'],
      input: '0 5',
      src: '; X x 8 computed in two ways. The first input number picks the version:\n; 0 = the loop, anything else = the same additions written out one by one.\n        IN        MODE\n        IN        X\n        LOAD      ZERO\n        COMPARE   MODE       ; EQ = 1 when MODE is 0\n        JUMPEQ    again\n        JUMP      straight\n; ---- version 1: a loop, 8 rounds ----\nagain:  LOAD      TOTAL\n        ADD       X\n        STORE     TOTAL\n        INCREMENT I\n        LOAD      I\n        COMPARE   EIGHT      ; GT = 1 while I < 8\n        JUMPGT    again\n        OUT       TOTAL\n        HALT\n; ---- version 2: no loop, eight additions in a row ----\nstraight: LOAD    X\n        ADD       X\n        ADD       X\n        ADD       X\n        ADD       X\n        ADD       X\n        ADD       X\n        ADD       X\n        STORE     TOTAL\n        OUT       TOTAL\n        HALT\n.data\nMODE:  0\nX:     0\nZERO:  0\nTOTAL: 0\nI:     0\nEIGHT: 8\n',
      tests: [{ in: [0, 3], out: [24] }, { in: [1, 3], out: [24] }, { in: [0, 0], out: [0] }, { in: [1, -5], out: [-40] }, { in: [0, 125], out: [1000] }, { in: [7, 1], out: [8] }, { in: [0, 5], out: [40] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long mode, x, total = 0;\n    cin >> mode >> x;\n    if (mode == 0) {\n        for (int i = 0; i < 8; i++) total += x;                  // the loop\n    } else {\n        total = x + x + x + x + x + x + x + x;                   // written out\n    }\n    cout << total << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Run 0 5 and then 1 5 and compare the instruction counts: 63 against 17. Both runs print 40.',
        'Change EIGHT to 16, so that the loop adds X sixteen times. Predict the instruction count for input 0 5 (7 instructions per round), then run it: it prints 80.'
      ] },

    { id: 'instruction-mix', title: 'What is the CPU really doing?', category: 'speed', level: 2,
      summary: 'Print the triangular numbers and read the Stats tab: how many of the instructions do arithmetic?',
      story: 'The program prints the running totals 1, 3, 6, 10 ... for N rounds. Run it with 10 and open the Stats tab: of the 95 instructions only ADD and INCREMENT (20 of them) do arithmetic. LOAD is the most frequent instruction (21 times), because almost every calculation first has to bring a number from memory into R. COMPARE and the jumps (32 in total) only steer the loop. About one instruction in five calculates.',
      concepts: ['instruction mix', 'LOAD/STORE', 'overhead', 'Stats tab'],
      input: '10',
      src: '; prints the running totals 1, 3, 6, 10, ... (N of them). Run it, then open the Stats tab.\n        IN        N\nloop:   LOAD      I\n        COMPARE   N          ; GT = 1 while N > I\n        JUMPGT    body\n        HALT\nbody:   INCREMENT I\n        LOAD      TOTAL\n        ADD       I\n        STORE     TOTAL      ; TOTAL = TOTAL + I\n        OUT       TOTAL\n        JUMP      loop\n.data\nN:     0\nI:     0\nTOTAL: 0\n',
      tests: [{ in: [0], out: [] }, { in: [1], out: [1] }, { in: [5], out: [1, 3, 6, 10, 15] }, { in: [10], out: [1, 3, 6, 10, 15, 21, 28, 36, 45, 55] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, i = 0, total = 0;\n    cin >> n;\n    while (n > i) {\n        i++;\n        total += i;\n        cout << total << "\\n";\n    }\n    return 0;\n}\n',
      tryThis: [
        'Run it with 10 and read the mix in the Stats tab. Which instruction is the most frequent (21 times), and which two come next (11 times each)?',
        'Run it with 20 instead of 10: the counts roughly double (95 becomes 185) but the shares in the mix barely move. Why?'
      ] },

    { id: 'bottleneck-latency', title: 'The Von Neumann bottleneck', category: 'speed', level: 2,
      settings: { memLatency: 10 },
      summary: 'Run one program with memory at 10 cycles per access, then at 1, and compare the cycle counts.',
      story: 'Every instruction has to be fetched from memory, and most of them also read or write a data cell, so the CPU spends much of its time waiting for memory: the Von Neumann bottleneck of slide 35. This example loads with memory latency 10 (cycles per memory access). Run it to the end with N = 10 and read the Stats tab: 2874 cycles, about 77% of them spent on memory. Now open Settings, set the latency to 1 and run again: the same 116 instructions and the same output, but only 894 cycles, about 25% on memory.',
      concepts: ['Von Neumann bottleneck', 'memory latency', 'cycles', 'Stats tab'],
      slide: 'slide 35',
      input: '10',
      src: '; N squared as the sum of the first N odd numbers: 1 + 3 + 5 + ... (N terms).\n; Run it with memory latency 10 (this example\'s setting), read the Stats tab, then set latency 1.\n        IN        N\nloop:   LOAD      ZERO\n        COMPARE   N          ; GT = 1 while N > 0\n        JUMPGT    body\n        OUT       SUM\n        HALT\nbody:   LOAD      SUM\n        ADD       ODD\n        STORE     SUM        ; SUM = SUM + the next odd number\n        LOAD      ODD\n        ADD       TWO\n        STORE     ODD        ; ODD = ODD + 2\n        DECREMENT N\n        JUMP      loop\n.data\nN:    0\nZERO: 0\nSUM:  0\nODD:  1\nTWO:  2\n',
      tests: [{ in: [0], out: [0] }, { in: [1], out: [1] }, { in: [5], out: [25] }, { in: [10], out: [100] }, { in: [30], out: [900] }],
      cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    long long n, sum = 0, odd = 1;\n    cin >> n;\n    while (n > 0) {\n        sum += odd;\n        odd += 2;\n        n--;\n    }\n    cout << sum << "\\n";\n    return 0;\n}\n',
      tryThis: [
        'Compare these numbers in the Stats tab for latency 10 and latency 1: cycles (2874 and 894), memory share (about 77% and 25%) and instructions (116 both times). Which of them depends on the memory speed?',
        'Set the latency to 50 and run again: the program is the same, but cycles become 11674 and about 94% of them are memory cycles.',
        'Find the three memory counts in the Stats tab: 116 instruction fetches, 73 data reads and 31 data writes. Why are there exactly as many fetches as instructions?'
      ] }

  ]);
})(typeof window !== 'undefined' ? window : this);
