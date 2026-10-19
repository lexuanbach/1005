/* Von Neumann Machine - examples, part A: basics, input and output, decisions (25 programs).
   Every item is verified by scratchpad/vnm/examples-a/verify.js: registry validation, tests on the engine,
   an independent oracle, the C++ twin compiled with g++ and clang++, and the numbers quoted in the texts. */
(function (global) {
  var R = (typeof module !== 'undefined' && module.exports) ? require('./vn-examples.js') : global.VNExamples;

  R.add([

    /* ------------------------------------------------------------------ basics */

    { id: 'sum3', title: 'A = B + C (slide 28)', category: 'basics', level: 1,
      summary: 'The lecture example: add two memory cells and store the result in a third.',
      story: 'The example from the slides: A, B and C are three memory cells. Watch every instruction travel through fetch, decode and execute. (The slide puts A, B, C at cells 100, 150, 151; our toy memory has only 16 cells, so they sit right after the code.)',
      concepts: ['LOAD/STORE', 'ADD', 'memory cell', 'accumulator R'],
      slide: 'slide 28',
      src: '; A = B + C   — slide 28\n        LOAD  B        ; B -> R\n        ADD   C        ; R + C -> R\n        STORE A        ; R -> A\n        OUT   A        ; show the result\n        HALT\n.data\nA: 0\nB: 5\nC: 7\n',
      input: '',
      tests: [ { in: [], out: [12] }, { in: [99], out: [12] }, { in: [1, 2, 3], out: [12] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long A = 0, B = 5, C = 7;   // the three memory cells
    A = B + C;                       // LOAD B, ADD C, STORE A
    cout << A << endl;               // OUT A
    return 0;
}
`,
      tryThis: [
        'Change the data value of B from 5 to 100 and predict the output before you run it. It should be 107.',
        'Replace ADD C by SUBTRACT C. Predict what OUT A prints (5 - 7) and why the answer is negative.',
        'Micro-step through LOAD B and count how often the arrow memory[MAR] to MDR lights up: once to fetch the instruction, once to fetch the data.'
      ] },

    { id: 'copy-value', title: 'Copy a value', category: 'basics', level: 1,
      summary: 'IN, LOAD and STORE: copy a number into a second cell and show that the first keeps it.',
      story: 'IN drops your number into cell A. LOAD A copies it into the accumulator R and STORE B copies R into cell B; a copy never empties the source, so both OUT lines print the same number. Watch R fill up on the LOAD and the value leave R and enter memory on the STORE. The run is 6 instructions and the program fits in 8 memory cells.',
      concepts: ['LOAD/STORE', 'accumulator R', 'memory cell', 'input and output'],
      src: `\
; copy-value: B = A, then show that A still holds its value
        IN      A          ; the number you type goes into cell A
        LOAD    A          ; copy A into the accumulator R ...
        STORE   B          ; ... and copy R into cell B
        OUT     A          ; the source is unchanged
        OUT     B          ; the copy holds the same number
        HALT
.data
A: 0
B: 0
`,
      input: '7',
      tests: [ { in: [7], out: [7, 7] }, { in: [0], out: [0, 0] }, { in: [-5], out: [-5, -5] }, { in: [123456789], out: [123456789, 123456789] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a;          // IN A
    b = a;             // LOAD A, STORE B
    cout << a << endl; // OUT A
    cout << b << endl; // OUT B
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 7 (it prints 7 twice), then run it and watch cell B receive the 7.',
        'Insert CLEAR A just before the first OUT. Predict the output for the input 7, then run it. B keeps the copy while A is wiped.'
      ] },

    { id: 'swap', title: 'Swap two numbers', category: 'basics', level: 2,
      summary: 'Exchange two cells with the help of a temporary third cell.',
      story: 'Swapping needs a third cell. If the program simply stored B into A, the old A would be destroyed, because STORE overwrites a cell. So it parks A in the temporary cell T first, then copies B into A, and finally T into B. Watch the three LOAD instructions refill R one after the other. The run is 11 instructions and uses 14 memory cells.',
      concepts: ['temporary variable', 'LOAD/STORE', 'destructive write', 'accumulator R'],
      src: `\
; swap: exchange A and B using a third cell T
        IN      A
        IN      B
        LOAD    A          ; R = A
        STORE   T          ; park the old A in T before A is overwritten
        LOAD    B          ; R = B
        STORE   A          ; A = old B   (the old A is safe in T)
        LOAD    T          ; R = old A
        STORE   B          ; B = old A
        OUT     A          ; prints the old B
        OUT     B          ; prints the old A
        HALT
.data
A: 0
B: 0
T: 0                       ; the temporary cell
`,
      input: '3 9',
      tests: [ { in: [3, 9], out: [9, 3] }, { in: [5, 5], out: [5, 5] }, { in: [-1, 0], out: [0, -1] }, { in: [1000000, -1000000], out: [-1000000, 1000000] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b, t;
    cin >> a >> b;     // IN A, IN B
    t = a;             // LOAD A, STORE T
    a = b;             // LOAD B, STORE A
    b = t;             // LOAD T, STORE B
    cout << a << endl;
    cout << b << endl;
    return 0;
}
`,
      tryThis: [
        'Run it with the input 3 9 and check that it prints 9 and then 3.',
        'Delete the two lines LOAD A and STORE T and change LOAD T into LOAD A. Predict the output for 3 9 (it prints 9 and 9), then explain where the 3 went.'
      ] },

    { id: 'double', title: 'Double a number', category: 'basics', level: 1,
      summary: 'Add a cell to itself: LOAD, ADD, STORE.',
      story: 'Doubling is adding a number to itself. LOAD X puts x into R, ADD X adds the cell again, and the ALU leaves 2x in R; STORE Y writes it to a new cell so that OUT can print it. Notice that ADD fetches the value from memory a second time: R and the cell X are two separate places. The run is 6 instructions.',
      concepts: ['ADD', 'ALU', 'accumulator R', 'LOAD/STORE'],
      src: `\
; double: Y = X + X
        IN      X
        LOAD    X          ; R = X
        ADD     X          ; R = X + X   (the cell is read a second time)
        STORE   Y          ; keep the result in memory ...
        OUT     Y          ; ... so that OUT can show it
        HALT
.data
X: 0
Y: 0
`,
      input: '21',
      tests: [ { in: [0], out: [0] }, { in: [5], out: [10] }, { in: [-4], out: [-8] }, { in: [1], out: [2] }, { in: [1000000], out: [2000000] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, y;
    cin >> x;          // IN X
    y = x + x;         // LOAD X, ADD X, STORE Y
    cout << y << endl; // OUT Y
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 21 (42), then run it and watch R change on the ADD.',
        'Add a second ADD X between the ADD and the STORE so that the program triples its input. The input 5 must print 15.',
        'Delete the STORE Y line and change OUT Y into OUT X. Predict what the input 5 prints (5), and explain why R never reached memory.'
      ] },

    { id: 'negate', title: 'Negate a number', category: 'basics', level: 1,
      summary: 'No negate instruction: compute 0 minus x with a constant cell.',
      story: 'There is no negate instruction, and an instruction cannot contain the constant 0, so the program keeps a 0 in a cell of its own called ZERO. It computes 0 - x with LOAD ZERO followed by SUBTRACT X. Watch the ALU: SUBTRACT takes R minus the memory value, never the other way round.',
      concepts: ['SUBTRACT', 'constant in memory', 'ALU', 'accumulator R'],
      src: `\
; negate: Y = 0 - X
; An instruction cannot hold the number 0 itself, so we keep a 0 in memory.
        IN      X
        LOAD    ZERO       ; R = 0
        SUBTRACT X         ; R = 0 - X
        STORE   Y
        OUT     Y
        HALT
.data
X:    0
Y:    0
ZERO: 0                    ; the constant 0
`,
      input: '8',
      tests: [ { in: [5], out: [-5] }, { in: [-7], out: [7] }, { in: [0], out: [0] }, { in: [1], out: [-1] }, { in: [123456], out: [-123456] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, zero = 0;
    cin >> x;                  // IN X
    long long y = zero - x;    // LOAD ZERO, SUBTRACT X, STORE Y
    cout << y << endl;         // OUT Y
    return 0;
}
`,
      tryThis: [
        'Change the data cell ZERO from 0 to 10 and predict the output for the input 3. It prints 7.',
        'Run the original with the input -8 and check that the answer is 8.'
      ] },

    { id: 'inc-dec', title: 'INCREMENT and DECREMENT', category: 'basics', level: 1,
      summary: 'Change a memory cell directly while the accumulator R stays untouched.',
      story: 'INCREMENT and DECREMENT work on a memory cell: the value travels through MDR and the ALU and is written straight back, while the accumulator R is left alone. The program loads N into R, then changes the cell N three times (up, up, down) and prints the copy OLD and the cell N. Watch R keep the original number while memory moves on. The run is 9 instructions.',
      concepts: ['INCREMENT', 'DECREMENT', 'accumulator R', 'memory cell'],
      slide: 'slide 34',
      src: `\
; inc-dec: INCREMENT and DECREMENT change a memory cell, not R
        IN      N
        LOAD    N          ; R = N (this copy will not change)
        INCREMENT N        ; N = N + 1   (R untouched)
        INCREMENT N        ; N = N + 2
        DECREMENT N        ; N = N + 1
        STORE   OLD        ; R still holds the original number
        OUT     OLD        ; prints the original number
        OUT     N          ; prints the number plus one
        HALT
.data
N:   0
OLD: 0
`,
      input: '10',
      tests: [ { in: [10], out: [10, 11] }, { in: [0], out: [0, 1] }, { in: [-1], out: [-1, 0] }, { in: [99], out: [99, 100] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, old;
    cin >> n;          // IN N
    old = n;           // LOAD N ... STORE OLD  (R keeps the original)
    n++;               // INCREMENT N
    n++;               // INCREMENT N
    n--;               // DECREMENT N
    cout << old << endl;
    cout << n << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 10 (10 and then 11), then run it and watch R while the cell N changes.',
        'Add one more DECREMENT N right after the existing one. Predict the output for the input 10 (10 and 10).',
        'Move the line LOAD N down so that it comes after the DECREMENT. Predict the output for 10 (11 and 11) and explain why OLD is no longer old.'
      ] },

    { id: 'print-sequence', title: 'Print a sequence', category: 'basics', level: 1,
      summary: 'Print N, N+1, N+2 using INCREMENT between the OUT instructions.',
      story: 'One IN, three OUTs. After each OUT, INCREMENT adds 1 to the cell in memory, so the next OUT shows the next number. There is no loop: the three OUT lines are three separate instructions, which is exactly the repetition a loop will remove later. Watch the memory table: only the cell N changes. The run is 7 instructions.',
      concepts: ['INCREMENT', 'OUT', 'sequence of instructions'],
      src: `\
; print-sequence: N, N+1, N+2
        IN      N
        OUT     N          ; N
        INCREMENT N
        OUT     N          ; N + 1
        INCREMENT N
        OUT     N          ; N + 2
        HALT
.data
N: 0
`,
      input: '5',
      tests: [ { in: [1], out: [1, 2, 3] }, { in: [0], out: [0, 1, 2] }, { in: [-1], out: [-1, 0, 1] }, { in: [99], out: [99, 100, 101] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n;
    cin >> n;                 // IN N
    cout << n << endl;        // OUT N
    n++;                      // INCREMENT N
    cout << n << endl;
    n++;
    cout << n << endl;
    return 0;
}
`,
      tryThis: [
        'Add INCREMENT N and OUT N just before HALT so that the input 7 prints 7 8 9 10.',
        'Change both INCREMENT lines into DECREMENT. Predict the output for the input 5 (5 4 3), then run it.'
      ] },

    { id: 'diff-of-two', title: 'Difference of two numbers', category: 'basics', level: 1,
      summary: 'SUBTRACT computes R minus a cell, so the order of the operands matters.',
      story: 'SUBTRACT works on the accumulator: R becomes R minus the memory cell. So LOAD A followed by SUBTRACT B leaves A - B in R. The order matters; try the inputs 10 3 and then 3 10 and look at the sign. Watch the ALU box and the register R in the diagram. The run is 7 instructions.',
      concepts: ['SUBTRACT', 'ALU', 'operand order', 'accumulator R'],
      src: `\
; diff-of-two: D = A - B
        IN      A
        IN      B
        LOAD    A          ; R = A
        SUBTRACT B         ; R = A - B   (R minus the cell, not the other way round)
        STORE   D
        OUT     D
        HALT
.data
A: 0
B: 0
D: 0
`,
      input: '10 3',
      tests: [ { in: [10, 3], out: [7] }, { in: [3, 10], out: [-7] }, { in: [5, 5], out: [0] }, { in: [-4, -6], out: [2] }, { in: [0, 0], out: [0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;            // IN A, IN B
    long long d = a - b;      // LOAD A, SUBTRACT B, STORE D
    cout << d << endl;        // OUT D
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 3 10 (-7), then run it.',
        'Make the program print B - A: swap the operands of LOAD and SUBTRACT. The input 10 3 must now print -7.'
      ] },

    /* ------------------------------------------------------------------ input and output */

    { id: 'echo-until-zero', title: 'Echo until zero', category: 'io', level: 1,
      summary: 'A sentinel loop: copy input numbers to the output until a 0 arrives.',
      story: 'A sentinel value tells a program that the input is over. Each trip round the loop reads a number with IN, loads it, and compares it with ZERO; JUMPEQ leaves the loop when EQ is 1. Watch the PC jump back to the label loop each time and the flag EQ turn to 1 only on the final 0, which is not echoed. For the default input 4 8 15 0 the program executes 23 instructions.',
      concepts: ['loop', 'sentinel', 'COMPARE', 'JUMPEQ', 'flag'],
      src: `\
; echo-until-zero: copy the numbers to the output; a 0 means "stop"
loop:   IN      X          ; read the next number
        LOAD    X          ; R = X so that COMPARE can look at it
        COMPARE ZERO       ; EQ = 1 when X is 0
        JUMPEQ  done       ; the sentinel itself is not printed
        OUT     X
        JUMP    loop       ; back for the next number
done:   HALT
.data
X:    0
ZERO: 0                    ; the constant 0
`,
      input: '4 8 15 0',
      tests: [ { in: [3, 5, 0], out: [3, 5] }, { in: [0], out: [] }, { in: [-2, 7, 0, 9], out: [-2, 7] }, { in: [1, 0], out: [1] }, { in: [4, 8, 15, 0], out: [4, 8, 15] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x;
    while (true) {
        cin >> x;                  // IN X
        if (x == 0) break;         // COMPARE ZERO, JUMPEQ done
        cout << x << endl;         // OUT X
    }
    return 0;
}
`,
      tryThis: [
        'Run it with the input 0 only. Nothing is printed and the program executes just 5 instructions.',
        'Add a second OUT X right after the first one so that every number is printed twice. The input 3 5 0 must print 3 3 5 5.',
        'Predict the output for the input 2 0 9 (only 2), then run it and ask yourself what happened to the 9.'
      ] },

    { id: 'running-total', title: 'Running total', category: 'io', level: 2,
      summary: 'Print the sum so far after each number; a 0 ends the input.',
      story: 'This is echo-until-zero with a memory: the cell TOTAL keeps the sum of everything read so far. Each trip round the loop does LOAD, ADD and STORE (the number is still in R, so only the ADD is needed) and then prints TOTAL. Watch TOTAL grow in the memory table. For the default input 5 10 -3 0 the program executes 29 instructions.',
      concepts: ['accumulator R', 'loop', 'sentinel', 'running sum'],
      src: `\
; running-total: after every number print the sum of all numbers so far
loop:   IN      X          ; next number
        LOAD    X          ; R = X
        COMPARE ZERO       ; is it the sentinel 0?
        JUMPEQ  done
        ADD     TOTAL      ; R = X + TOTAL   (R still held X)
        STORE   TOTAL      ; remember the new total in memory
        OUT     TOTAL
        JUMP    loop
done:   HALT
.data
X:     0
TOTAL: 0                   ; starts at 0 and grows
ZERO:  0
`,
      input: '5 10 -3 0',
      tests: [ { in: [5, 10, -3, 0], out: [5, 15, 12] }, { in: [0], out: [] }, { in: [1, 1, 1, 1, 0], out: [1, 2, 3, 4] }, { in: [-4, 4, 0], out: [-4, 0] }, { in: [1000000, 1000000, 0], out: [1000000, 2000000] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, total = 0;
    while (true) {
        cin >> x;                  // IN X
        if (x == 0) break;         // sentinel
        total = x + total;         // ADD TOTAL, STORE TOTAL
        cout << total << endl;     // OUT TOTAL
    }
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 5 10 -3 0 (5 15 12), then run it and watch the cell TOTAL.',
        'Print only the final total: remove the OUT TOTAL inside the loop and put OUT TOTAL on a new line right after the label done. The input 5 10 -3 0 must print just 12.'
      ] },

    { id: 'reverse3', title: 'Reverse three numbers', category: 'io', level: 1,
      summary: 'Read three numbers into three cells, then print them in the opposite order.',
      story: 'Three IN instructions put the numbers into three different cells, then three OUT instructions print them in the opposite order. This is only possible because memory remembers: the first number is still waiting in cell A while the others arrive. Open the memory table and watch A, B and C fill up one after the other. The run is 7 instructions.',
      concepts: ['memory cell', 'IN and OUT', 'order of execution'],
      src: `\
; reverse3: read A, B, C and print C, B, A
        IN      A
        IN      B
        IN      C
        OUT     C          ; the last number comes out first
        OUT     B
        OUT     A
        HALT
.data
A: 0
B: 0
C: 0
`,
      input: '1 2 3',
      tests: [ { in: [1, 2, 3], out: [3, 2, 1] }, { in: [0, 0, 0], out: [0, 0, 0] }, { in: [-1, 5, -1], out: [-1, 5, -1] }, { in: [7, 0, 9], out: [9, 0, 7] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b, c;
    cin >> a >> b >> c;        // IN A, IN B, IN C
    cout << c << endl;
    cout << b << endl;
    cout << a << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 1 2 3 (3 2 1), then run it.',
        'Change the second and third IN into IN A and print A three times. The input 1 2 3 now prints 3 3 3, because every new number overwrites the old one.'
      ] },

    { id: 'count-inputs', title: 'Count the inputs', category: 'io', level: 2,
      summary: 'Count how many numbers arrive before the 0, using INCREMENT.',
      story: 'Counting is incrementing: every number that is not the sentinel adds 1 to COUNT. INCREMENT works directly on the memory cell and leaves R alone, and the value that was typed in is thrown away (only its zero test matters). Watch COUNT in the memory table and the jump back to the label loop. For the default input 7 7 7 0 the program executes 24 instructions.',
      concepts: ['INCREMENT', 'counter', 'loop', 'sentinel'],
      src: `\
; count-inputs: how many numbers come before the 0?
loop:   IN      X          ; read the next number
        LOAD    X
        COMPARE ZERO       ; EQ = 1 for the sentinel
        JUMPEQ  done
        INCREMENT COUNT    ; one more number seen
        JUMP    loop
done:   OUT     COUNT
        HALT
.data
X:     0
COUNT: 0
ZERO:  0
`,
      input: '7 7 7 0',
      tests: [ { in: [0], out: [0] }, { in: [5, 0], out: [1] }, { in: [1, 2, 3, 4, 5, 0], out: [5] }, { in: [-1, -1, 0, 7], out: [2] }, { in: [7, 7, 7, 0], out: [3] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, count = 0;
    while (true) {
        cin >> x;                  // IN X
        if (x == 0) break;         // COMPARE ZERO, JUMPEQ done
        count++;                   // INCREMENT COUNT
    }
    cout << count << endl;         // OUT COUNT
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 5 -2 9 0 (3), then run it.',
        'Count in steps of two: put a second INCREMENT COUNT line right after the first one. The input 7 7 7 0 must now print 6.'
      ] },

    { id: 'min-max-list', title: 'Smallest and largest of a list', category: 'io', level: 3,
      summary: 'Print the minimum then the maximum of a list that ends with 0.',
      story: 'The first number starts both MIN and MAX; every later number is compared with both. After LOAD X, COMPARE MIN sets GT when MIN is bigger than X (a new smallest), and COMPARE MAX sets LT when MAX is smaller than X (a new largest); R keeps X throughout, so a STORE can record it. Watch MIN and MAX change in the memory table. If the very first number is 0 the list is empty and the program prints 0 and 0.',
      concepts: ['COMPARE', 'conditional jump', 'loop', 'sentinel', 'flag'],
      src: `\
; min-max-list: print the smallest, then the largest, of a list ending with 0
        IN      X          ; the first number starts both records
        LOAD    X
        COMPARE ZERO
        JUMPEQ  done       ; empty list: MIN and MAX stay 0
        STORE   MIN
        STORE   MAX
loop:   IN      X
        LOAD    X          ; R = X
        COMPARE ZERO
        JUMPEQ  done
        COMPARE MIN        ; GT = 1 when MIN > X : a new smallest
        JUMPGT  newmin
        COMPARE MAX        ; LT = 1 when MAX < X : a new largest
        JUMPLT  newmax
        JUMP    loop
newmin: STORE   MIN        ; R still holds X
        JUMP    loop
newmax: STORE   MAX
        JUMP    loop
done:   OUT     MIN
        OUT     MAX
        HALT
.data
X:    0
ZERO: 0
MIN:  0
MAX:  0
`,
      input: '3 9 -2 5 0',
      tests: [ { in: [5, 0], out: [5, 5] }, { in: [3, 9, 1, 0], out: [1, 9] }, { in: [-4, -9, -1, 0], out: [-9, -1] }, { in: [7, 7, 7, 0], out: [7, 7] }, { in: [0], out: [0, 0] }, { in: [9, 5, 1, 0, 100], out: [1, 9] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, mn = 0, mx = 0;
    cin >> x;                            // IN X
    if (x != 0) {
        mn = mx = x;                     // STORE MIN, STORE MAX
        while (true) {
            cin >> x;
            if (x == 0) break;
            if (x < mn) mn = x;          // COMPARE MIN, JUMPGT newmin
            else if (x > mx) mx = x;     // COMPARE MAX, JUMPLT newmax
        }
    }
    cout << mn << endl;
    cout << mx << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 3 9 -2 5 0 (-2 and 9), then run it and watch the two records change.',
        'Print the largest first: swap the two OUT lines at the end. The input 3 9 -2 5 0 must print 9 and then -2.',
        'Run it with the input 0 only and explain why it prints 0 and 0.'
      ] },

    { id: 'average-list', title: 'Whole-number average', category: 'io', level: 3,
      summary: 'Sum a list, then divide by the count using repeated subtraction.',
      story: 'The program works in two phases. First a loop adds the positive numbers into SUM and counts them in COUNT. Then, since there is no divide instruction, it subtracts COUNT from SUM again and again, adding 1 to QUOT each time, until the rest is smaller than COUNT; that rest is the remainder. Watch the second loop: SUM shrinks while QUOT grows. It needs at least one number before the 0.',
      concepts: ['loop', 'repeated subtraction', 'division', 'counter', 'sentinel'],
      src: `\
; average-list: whole-number average (QUOT) and remainder of positive numbers ending with 0
loop:   IN      X
        LOAD    X
        COMPARE ZERO
        JUMPEQ  divide     ; sentinel: start dividing
        ADD     SUM        ; R = X + SUM
        STORE   SUM
        INCREMENT COUNT
        JUMP    loop
; phase 2: SUM / COUNT by repeated subtraction. SUM turns into the remainder.
divide: LOAD    SUM
        COMPARE COUNT      ; GT = 1 when COUNT > SUM : not enough left for another COUNT
        JUMPGT  finish
        SUBTRACT COUNT     ; take one COUNT away ...
        STORE   SUM
        INCREMENT QUOT     ; ... and remember that we did
        JUMP    divide
finish: OUT     QUOT       ; the whole-number average
        OUT     SUM        ; the remainder
        HALT
.data
X:     0
ZERO:  0
SUM:   0
COUNT: 0
QUOT:  0
`,
      input: '4 6 9 0',
      tests: [ { in: [4, 6, 0], out: [5, 0] }, { in: [7, 0], out: [7, 0] }, { in: [1, 2, 0], out: [1, 1] }, { in: [10, 20, 30, 41, 0], out: [25, 1] }, { in: [5, 5, 5, 0], out: [5, 0] }, { in: [1, 0], out: [1, 0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, sum = 0, count = 0;
    while (true) {
        cin >> x;
        if (x == 0) break;
        sum += x;                  // ADD SUM, STORE SUM
        count++;                   // INCREMENT COUNT
    }
    // the machine divides by repeated subtraction; for positive numbers this equals / and %
    cout << sum / count << endl;   // QUOT
    cout << sum % count << endl;   // the remainder left in SUM
    return 0;
}
`,
      tryThis: [
        'Predict the output for the input 1 2 0 (1 and 1), then run it. 1 + 2 = 3 and 3 divided by 2 is 1 remainder 1.',
        'Add OUT COUNT just before HALT so that the program also prints how many numbers it read. The input 4 6 9 0 must end with 3.',
        'Run it with the input 0 only. There is no number to average, the second loop never ends, and the step guard stops it. Find the instruction that never changes SUM.'
      ] },

    /* ------------------------------------------------------------------ decisions */

    { id: 'max2', title: 'Max of two numbers (a branch)', category: 'decisions', level: 1,
      summary: 'An if-else as COMPARE plus a conditional jump.',
      story: 'An if–else becomes COMPARE plus a conditional jump. Try the inputs 8 3 and then 3 8. Note: COMPARE X sets GT when the cell X is bigger than R, so after LOAD A / COMPARE B, “A > B” shows up as LT.',
      concepts: ['COMPARE', 'conditional jump', 'if-else', 'flag'],
      src: '; print the larger of two numbers\n        IN      A\n        IN      B\n        LOAD    A          ; R = A\n        COMPARE B          ; LT = 1 when B < A, i.e. A is bigger\n        JUMPLT  showA\n        OUT     B          ; else-part\n        JUMP    done\nshowA:  OUT     A          ; then-part\ndone:   HALT\n.data\nA: 0\nB: 0\n',
      input: '8 3',
      tests: [ { in: [8, 3], out: [8] }, { in: [3, 8], out: [8] }, { in: [5, 5], out: [5] }, { in: [-2, -9], out: [-2] }, { in: [0, -1], out: [0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;                 // IN A, IN B
    if (a > b) cout << a << endl;  // LOAD A, COMPARE B, JUMPLT showA
    else       cout << b << endl;  // else-part
    return 0;
}
`,
      tryThis: [
        'Run 8 3, then 3 8, then 5 5. Which OUT line prints each time? Watch which way the PC goes after JUMPLT.',
        'Change JUMPLT into JUMPGT. The program now prints the smaller number: the input 8 3 prints 3.'
      ] },

    { id: 'min2', title: 'Min of two numbers', category: 'decisions', level: 2,
      summary: 'Guess, compare, correct: meet the JUMPGE pseudo-instruction.',
      story: 'The program guesses that A is the smaller one and stores it in SMALL. COMPARE B then tells whether the guess stands: if B is greater or equal (JUMPGE) nothing more happens, otherwise LOAD B and STORE SMALL overwrite the guess. JUMPGE is not one of the 16 real instructions: the assembler turns it into the two real jumps JUMPGT and JUMPEQ, so it occupies two memory cells.',
      concepts: ['COMPARE', 'JUMPGE pseudo-instruction', 'flag', 'if without else'],
      src: `\
; min2: print the smaller of two numbers
        IN      A
        IN      B
        LOAD    A
        STORE   SMALL      ; first guess: A is the smaller
        COMPARE B          ; GT = 1 when B > A, EQ = 1 when B = A
        JUMPGE  show       ; B is not smaller, so the guess was right
        LOAD    B          ; otherwise correct the guess
        STORE   SMALL
show:   OUT     SMALL
        HALT
.data
A:     0
B:     0
SMALL: 0
`,
      input: '8 3',
      tests: [ { in: [3, 8], out: [3] }, { in: [8, 3], out: [3] }, { in: [4, 4], out: [4] }, { in: [-5, 2], out: [-5] }, { in: [-1, -9], out: [-9] }, { in: [0, 0], out: [0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b, small;
    cin >> a >> b;             // IN A, IN B
    small = a;                 // first guess
    if (!(b >= a)) small = b;  // JUMPGE show skips the correction
    cout << small << endl;     // OUT SMALL
    return 0;
}
`,
      tryThis: [
        'Open the Listing tab and find the two cells that JUMPGE became. They hold JUMPGT and JUMPEQ.',
        'Change JUMPGE into JUMPLE and the program becomes max2: the input 3 8 prints 8.',
        'Run the input 4 4 and watch the flags: JUMPGT is not taken, JUMPEQ is taken. The run is 9 instructions.'
      ] },

    { id: 'abs', title: 'Absolute value', category: 'decisions', level: 2,
      summary: 'Flip the sign only when the number is negative.',
      story: 'Absolute value flips the sign only when the number is negative. LOAD X, then COMPARE ZERO: GT is 1 when ZERO is greater than R, which means X is negative. In that case the program computes 0 - X; otherwise it jumps straight to the printing. Watch the flag GT and the PC: the input 5 takes 7 instructions because it skips the three of the negative branch, the input -5 takes 9.',
      concepts: ['COMPARE', 'conditional jump', 'if without else', 'flag GT'],
      src: `\
; abs: print |X|
        IN      X
        LOAD    X
        COMPARE ZERO       ; GT = 1 when 0 > X, i.e. X is negative
        JUMPGT  negative
        JUMP    show       ; X is fine as it is
negative:
        LOAD    ZERO
        SUBTRACT X         ; 0 - X
        STORE   X
show:   OUT     X
        HALT
.data
X:    0
ZERO: 0
`,
      input: '-5',
      tests: [ { in: [5], out: [5] }, { in: [-5], out: [5] }, { in: [0], out: [0] }, { in: [-1], out: [1] }, { in: [-1000000], out: [1000000] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x;
    cin >> x;                  // IN X
    if (0 > x) x = 0 - x;      // COMPARE ZERO, JUMPGT negative ... SUBTRACT X
    cout << x << endl;         // OUT X
    return 0;
}
`,
      tryThis: [
        'Predict the output for -12, 0 and 7 (12, 0 and 7), then run all three.',
        'Change JUMPGT into JUMPLT. Now only positive numbers are flipped: the input 5 prints -5 and the input -5 prints -5.'
      ] },

    { id: 'sign', title: 'Sign of a number', category: 'decisions', level: 2,
      summary: 'One COMPARE, three outcomes: print -1, 0 or 1.',
      story: 'A single COMPARE sets all three flags at once, and two conditional jumps pick the outcome: JUMPGT for a negative number, JUMPEQ for zero, and a positive number simply falls through to the printing. The constants 1, 0 and -1 each need their own memory cell because instructions have no immediate values. Watch which flag is 1 for the inputs -9, 0 and 9.',
      concepts: ['COMPARE', 'three-way decision', 'flags GT EQ LT', 'constant in memory'],
      src: `\
; sign: print -1 for negative, 0 for zero, 1 for positive
        IN      X
        LOAD    X
        COMPARE ZERO       ; GT: X < 0     EQ: X = 0     LT: X > 0
        JUMPGT  negative
        JUMPEQ  iszero
        OUT     ONE        ; positive: falls through to here
        HALT
negative:
        OUT     MINUS_ONE
        HALT
iszero: OUT     ZERO
        HALT
.data
X:         0
ZERO:      0
ONE:       1
MINUS_ONE: -1
`,
      input: '-9',
      tests: [ { in: [7], out: [1] }, { in: [-7], out: [-1] }, { in: [0], out: [0] }, { in: [1], out: [1] }, { in: [-1], out: [-1] }, { in: [1000000], out: [1] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x;
    cin >> x;                          // IN X
    if (0 > x)       cout << -1 << endl;   // JUMPGT negative
    else if (0 == x) cout << 0 << endl;    // JUMPEQ zero
    else             cout << 1 << endl;    // positive
    return 0;
}
`,
      tryThis: [
        'Run -9, 0 and 9 one after the other and watch the flags after the COMPARE: GT is 1 for -9, EQ for 0 and LT for 9.',
        'Make zero count as positive: change OUT ZERO under the label iszero into OUT ONE. The input 0 must now print 1.'
      ] },

    { id: 'even-odd', title: 'Even or odd', category: 'decisions', level: 3,
      summary: 'Find the remainder after dividing by 2 with a subtract-2 loop; works for negatives.',
      story: 'There is no divide, so the program removes twos: while X is 2 or more it subtracts 2, and while X is negative it adds 2, until only 0 or 1 is left. That leftover is the remainder; 1 - remainder turns it into the printed answer (1 for even, 0 for odd). Watch X shrink by 2 each time round the loop. The input 7 takes 35 instructions and the input 1000 takes 4011.',
      concepts: ['loop', 'repeated subtraction', 'remainder', 'two conditional jumps'],
      src: `\
; even-odd: print 1 if X is even, 0 if X is odd (also for negative X)
        IN      X
loop:   LOAD    X
        COMPARE ZERO       ; GT = 1 when X < 0
        JUMPGT  raise
        COMPARE TWO        ; GT = 1 when X < 2 : at most 1 is left
        JUMPGT  finish
        SUBTRACT TWO       ; R = X - 2
        STORE   X
        JUMP    loop
raise:  ADD     TWO        ; negative X: add 2 until it is no longer negative
        STORE   X
        JUMP    loop
finish: LOAD    ONE        ; X is now 0 (even) or 1 (odd)
        SUBTRACT X         ; 1 - X is 1 for even and 0 for odd
        STORE   ANSWER
        OUT     ANSWER
        HALT
.data
X:      0
ZERO:   0
ONE:    1
TWO:    2
ANSWER: 0
`,
      input: '7',
      tests: [ { in: [7], out: [0] }, { in: [10], out: [1] }, { in: [0], out: [1] }, { in: [1], out: [0] }, { in: [-3], out: [0] }, { in: [-8], out: [1] }, { in: [1000], out: [1] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x;
    cin >> x;                         // IN X
    while (true) {
        if (0 > x) x = x + 2;         // raise
        else if (2 > x) break;        // finish: 0 or 1 is left
        else x = x - 2;
    }
    long long answer = 1 - x;         // 1 for even, 0 for odd
    cout << answer << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the output for 7, 10 and -3 (0, 1 and 0), then run them and compare the instruction counts.',
        'Run the input 1000 and note the instruction count, then try 3000. The step guard stops it at 10000 instructions: raise it in the settings and run again.',
        'Change the data cell TWO from 2 to 3. The program now divides by 3 and prints 1 minus the remainder: the input 9 prints 1, the input 10 prints 0 and the input 11 prints -1.'
      ] },

    { id: 'max3', title: 'Max of three numbers', category: 'decisions', level: 2,
      summary: 'Keep a best-so-far cell and challenge it twice.',
      story: 'The program keeps a best-so-far in the cell BEST. It starts with A, then challenges it with B and with C. Each challenge is a COMPARE: if the challenger is not bigger, JUMPLE skips the two lines that would replace BEST. JUMPLE is a pseudo-instruction (the two real jumps JUMPLT and JUMPEQ), so the code takes 18 cells, and with 4 data cells the assembler picks a 32-cell memory.',
      concepts: ['COMPARE', 'JUMPLE pseudo-instruction', 'best so far', 'if without else'],
      src: `\
; max3: print the largest of three numbers
        IN      A
        IN      B
        IN      C
        LOAD    A
        STORE   BEST       ; best so far = A
        COMPARE B          ; GT = 1 when B > BEST
        JUMPLE  checkc     ; B is not bigger: keep BEST
        LOAD    B
        STORE   BEST       ; B is the new best
checkc: LOAD    BEST
        COMPARE C          ; GT = 1 when C > BEST
        JUMPLE  show
        LOAD    C
        STORE   BEST       ; C is the new best
show:   OUT     BEST
        HALT
.data
A:    0
B:    0
C:    0
BEST: 0
`,
      input: '4 9 6',
      tests: [ { in: [1, 2, 3], out: [3] }, { in: [3, 2, 1], out: [3] }, { in: [2, 3, 1], out: [3] }, { in: [5, 5, 5], out: [5] }, { in: [-1, -2, -3], out: [-1] }, { in: [0, 0, -1], out: [0] }, { in: [7, 7, 8], out: [8] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b, c, best;
    cin >> a >> b >> c;        // IN A, IN B, IN C
    best = a;                  // first guess
    if (b > best) best = b;    // COMPARE B, JUMPLE checkc skips this
    if (c > best) best = c;    // COMPARE C, JUMPLE show skips this
    cout << best << endl;      // OUT BEST
    return 0;
}
`,
      tryThis: [
        'Predict the output for 4 9 6, 9 4 6 and 4 6 9 (always 9) and watch BEST: it changes at different moments each time.',
        'Turn it into min3: change both JUMPLE into JUMPGE. The input 4 9 6 must print 4.'
      ] },

    { id: 'sort3', title: 'Sort three numbers', category: 'decisions', level: 3,
      summary: 'Three compare-and-swap steps put A, B and C in ascending order.',
      story: 'Sorting three numbers takes three compare-and-swap steps: A with B, then B with C, then A with B again. Each step compares two cells and, if they are in the wrong order, swaps them through the temporary cell T (the trick from the swap example). Watch the PC jump over the five swap instructions whenever a pair is already in order. The code takes 34 cells and with 4 data cells the memory grows to 64.',
      concepts: ['COMPARE', 'JUMPGE pseudo-instruction', 'temporary variable', 'sorting'],
      src: `\
; sort3: read A, B, C and print them in ascending order
        IN      A
        IN      B
        IN      C
; step 1: make A <= B
        LOAD    A
        COMPARE B          ; LT = 1 when B < A : out of order
        JUMPGE  step2      ; already in order
        STORE   T          ; R holds A: swap A and B through T
        LOAD    B
        STORE   A
        LOAD    T
        STORE   B
; step 2: make B <= C
step2:  LOAD    B
        COMPARE C
        JUMPGE  step3
        STORE   T
        LOAD    C
        STORE   B
        LOAD    T
        STORE   C
; step 3: make A <= B again (the new B may be smaller than A)
step3:  LOAD    A
        COMPARE B
        JUMPGE  show
        STORE   T
        LOAD    B
        STORE   A
        LOAD    T
        STORE   B
show:   OUT     A
        OUT     B
        OUT     C
        HALT
.data
A: 0
B: 0
C: 0
T: 0
`,
      input: '3 1 2',
      tests: [ { in: [1, 2, 3], out: [1, 2, 3] }, { in: [3, 2, 1], out: [1, 2, 3] }, { in: [2, 3, 1], out: [1, 2, 3] }, { in: [3, 1, 2], out: [1, 2, 3] }, { in: [2, 2, 1], out: [1, 2, 2] }, { in: [5, 5, 5], out: [5, 5, 5] }, { in: [-1, 0, -5], out: [-5, -1, 0] } ],
      cpp: String.raw`#include <iostream>
#include <utility>
using namespace std;

int main() {
    long long a, b, c;
    cin >> a >> b >> c;                // IN A, IN B, IN C
    if (b < a) swap(a, b);             // step 1 (the swap uses T on the machine)
    if (c < b) swap(b, c);             // step 2
    if (b < a) swap(a, b);             // step 3
    cout << a << endl;
    cout << b << endl;
    cout << c << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the output for 3 1 2 and for 3 2 1 (1 2 3 both times) and find out which of the three steps swap.',
        'Sort downwards: change each JUMPGE into JUMPLE. The input 1 3 2 must now print 3 2 1.'
      ] },

    { id: 'clamp', title: 'Clamp to a range', category: 'decisions', level: 2,
      summary: 'Limit x to the range lo..hi with two tests.',
      story: 'The inputs are lo, hi and x, in this order. After LOAD X the program makes two tests while R keeps holding x: if LO is greater than x (GT) it prints LO, if HI is smaller than x (LT) it prints HI, and otherwise it prints x unchanged. There are three exits, each with its own HALT. Watch which flag decides for x = -3, 5 and 99 with the range 0 to 10.',
      concepts: ['COMPARE', 'two conditional jumps', 'range check', 'flags GT LT'],
      src: `\
; clamp: print x, but never below LO and never above HI   (input order: lo hi x)
        IN      LO
        IN      HI
        IN      X
        LOAD    X          ; R = X stays in R through both tests
        COMPARE LO         ; GT = 1 when LO > X : too small
        JUMPGT  low
        COMPARE HI         ; LT = 1 when HI < X : too big
        JUMPLT  high
        OUT     X          ; inside the range
        HALT
low:    OUT     LO
        HALT
high:   OUT     HI
        HALT
.data
LO: 0
HI: 0
X:  0
`,
      input: '0 10 -3',
      tests: [ { in: [0, 10, 5], out: [5] }, { in: [0, 10, -3], out: [0] }, { in: [0, 10, 99], out: [10] }, { in: [0, 10, 0], out: [0] }, { in: [0, 10, 10], out: [10] }, { in: [-5, -1, -3], out: [-3] }, { in: [3, 3, 9], out: [3] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long lo, hi, x;
    cin >> lo >> hi >> x;          // IN LO, IN HI, IN X
    if (lo > x)      cout << lo << endl;   // JUMPGT low
    else if (hi < x) cout << hi << endl;   // JUMPLT high
    else             cout << x << endl;    // inside the range
    return 0;
}
`,
      tryThis: [
        'With lo 0 and hi 10 predict the output for x = -3, 5 and 99 (0, 5 and 10), then run them.',
        'Break the rule on purpose: run the input 10 0 5, where lo is bigger than hi. It prints 10 because the low test comes first. What would change if you swapped the two tests?'
      ] },

    { id: 'grade-band', title: 'Grade band (if / else-if)', category: 'decisions', level: 2,
      summary: 'Turn a score into a band 4, 3, 2, 1 or 0 with a chain of tests.',
      story: 'A chain of if / else-if: test the highest limit first. COMPARE N90 sets GT when 90 is greater than the score, which means "not an A", so the program jumps on to the next test. Because R still holds the score after every COMPARE, the same value is checked against 80, 70 and 50 in turn, and the first test that passes decides the band. The score 95 takes 6 instructions, the score 10 takes 12: count the COMPARE and JUMPGT pairs.',
      concepts: ['if / else-if chain', 'COMPARE', 'conditional jump', 'constant in memory'],
      src: `\
; grade-band: score >= 90 -> 4, >= 80 -> 3, >= 70 -> 2, >= 50 -> 1, otherwise 0
        IN      SCORE
        LOAD    SCORE      ; R keeps the score through the whole chain
        COMPARE N90        ; GT = 1 when 90 > score : not band 4
        JUMPGT  try3
        OUT     FOUR
        HALT
try3:   COMPARE N80        ; same score, next limit
        JUMPGT  try2
        OUT     THREE
        HALT
try2:   COMPARE N70
        JUMPGT  try1
        OUT     TWO
        HALT
try1:   COMPARE N50
        JUMPGT  none
        OUT     ONE
        HALT
none:   OUT     ZERO
        HALT
.data
SCORE: 0
N90:   90
N80:   80
N70:   70
N50:   50
FOUR:  4
THREE: 3
TWO:   2
ONE:   1
ZERO:  0
`,
      input: '85',
      tests: [ { in: [100], out: [4] }, { in: [90], out: [4] }, { in: [89], out: [3] }, { in: [80], out: [3] }, { in: [79], out: [2] }, { in: [70], out: [2] }, { in: [69], out: [1] }, { in: [50], out: [1] }, { in: [49], out: [0] }, { in: [0], out: [0] }, { in: [-5], out: [0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long score;
    cin >> score;                              // IN SCORE
    int band;
    if (score >= 90)      band = 4;            // not (90 > score)
    else if (score >= 80) band = 3;
    else if (score >= 70) band = 2;
    else if (score >= 50) band = 1;
    else                  band = 0;
    cout << band << endl;
    return 0;
}
`,
      tryThis: [
        'Predict the band for 89, 90 and 49 (3, 4 and 0), then run them and watch the PC fall through the chain.',
        'Lower the limit for the top band: change the data cell N90 from 90 to 85. The input 88 must now print 4.',
        'Run the input -5. It prints 0: is that a sensible answer for a negative score?'
      ] },

    { id: 'triangle-check', title: 'Triangle check', category: 'decisions', level: 2,
      summary: 'Print 1 if three lengths can form a triangle, else 0.',
      story: 'Three sticks form a triangle only if each one is shorter than the sum of the other two. The program checks the three sums in turn: LOAD, ADD, then COMPARE with the third side. GT or EQ after the COMPARE means that side is too long, and JUMPGE sends the PC to the answer 0. Note the flat case 1 2 3: 1 + 2 equals 3, so EQ = 1 and the answer is 0.',
      concepts: ['COMPARE', 'JUMPGE pseudo-instruction', 'three conditions', 'ADD'],
      src: `\
; triangle-check: 1 if the sides A, B, C form a triangle, otherwise 0
        IN      A
        IN      B
        IN      C
        LOAD    A
        ADD     B          ; R = A + B
        COMPARE C          ; GT or EQ : C is not shorter than A + B
        JUMPGE  no
        LOAD    A
        ADD     C          ; R = A + C
        COMPARE B
        JUMPGE  no
        LOAD    B
        ADD     C          ; R = B + C
        COMPARE A
        JUMPGE  no
        OUT     ONE        ; all three tests passed
        HALT
no:     OUT     ZERO
        HALT
.data
A:    0
B:    0
C:    0
ONE:  1
ZERO: 0
`,
      input: '3 4 5',
      tests: [ { in: [3, 4, 5], out: [1] }, { in: [1, 2, 3], out: [0] }, { in: [1, 1, 1], out: [1] }, { in: [1, 2, 10], out: [0] }, { in: [5, 5, 1], out: [1] }, { in: [0, 0, 0], out: [0] }, { in: [-1, 5, 5], out: [0] }, { in: [10, 1, 1], out: [0] }, { in: [4, 3, 2], out: [1] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b, c;
    cin >> a >> b >> c;                    // IN A, IN B, IN C
    bool ok = (c < a + b) && (b < a + c) && (a < b + c);
    cout << (ok ? 1 : 0) << endl;          // OUT ONE or OUT ZERO
    return 0;
}
`,
      tryThis: [
        'Predict the output for 3 4 5, 1 2 3 and 2 2 3 (1, 0 and 1), then run them.',
        'Accept flat triangles as well: change the three JUMPGE into JUMPGT. The input 1 2 3 must now print 1.'
      ] },

    { id: 'calculator-menu', title: 'Calculator menu (switch)', category: 'decisions', level: 3,
      summary: 'A switch in machine code: add, subtract, larger or a default.',
      story: 'This is a switch statement. The first input is the menu choice, the next two are the operands. COMPARE with 1, 2 and 3 in turn (R keeps the choice through all three) and JUMPEQ goes to the matching case. Each case ends with JUMP show, which plays the role of break; the last case simply falls through to show. Any other choice runs the default, which clears RES. The code takes 28 cells, with 7 data cells that is 35, so the memory grows to 64.',
      concepts: ['switch statement', 'COMPARE', 'JUMPEQ', 'jump table by hand', 'break'],
      src: `\
; calculator-menu: input = choice a b
;   choice 1: print a + b     choice 2: print a - b     choice 3: print the larger
;   any other choice: print 0
        IN      CHOICE
        IN      A
        IN      B
        LOAD    CHOICE     ; R keeps the choice through all three tests
        COMPARE ONE
        JUMPEQ  case1
        COMPARE TWO
        JUMPEQ  case2
        COMPARE THREE
        JUMPEQ  case3
        CLEAR   RES        ; default: the result is 0
        JUMP    show
case1:  LOAD    A
        ADD     B
        STORE   RES
        JUMP    show       ; "break"
case2:  LOAD    A
        SUBTRACT B
        STORE   RES
        JUMP    show       ; "break"
case3:  LOAD    A
        STORE   RES        ; assume A is the larger
        COMPARE B          ; LT = 1 when B < A
        JUMPLT  show
        LOAD    B          ; B was larger or equal
        STORE   RES
show:   OUT     RES
        HALT
.data
CHOICE: 0
A:      0
B:      0
RES:    0
ONE:    1
TWO:    2
THREE:  3
`,
      input: '1 5 3',
      tests: [ { in: [1, 5, 3], out: [8] }, { in: [2, 5, 3], out: [2] }, { in: [2, 3, 5], out: [-2] }, { in: [3, 5, 3], out: [5] }, { in: [3, 3, 5], out: [5] }, { in: [3, 4, 4], out: [4] }, { in: [4, 1, 1], out: [0] }, { in: [0, 9, 9], out: [0] }, { in: [-1, 2, 2], out: [0] }, { in: [1, -5, 5], out: [0] } ],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long choice, a, b, res;
    cin >> choice >> a >> b;       // IN CHOICE, IN A, IN B
    switch (choice) {
        case 1: res = a + b; break;
        case 2: res = a - b; break;
        case 3: res = (a > b) ? a : b; break;
        default: res = 0;
    }
    cout << res << endl;           // OUT RES
    return 0;
}
`,
      tryThis: [
        'Predict the output for 1 5 3, 2 5 3, 3 5 3 and 4 5 3 (8, 2, 5 and 0), then run them.',
        'Forget a break on purpose: delete the JUMP show at the end of case1. The input 1 5 3 now prints 2, not 8, because case 1 falls through into case 2.',
        'Add a fourth choice: a data cell FOUR holding 4, a COMPARE FOUR and JUMPEQ case4 in the chain, and a case4 that doubles A (LOAD A, ADD A, STORE RES, JUMP show). The input 4 5 3 must print 10.'
      ] }

  ]);
})(typeof window !== 'undefined' ? window : this);
