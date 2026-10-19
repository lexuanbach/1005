/* Von Neumann Machine — examples, set EXT: the extended instruction set (supplementary) and "customize the machine".
   18 items. Every item is verified (tests run with the item's own settings, an independent oracle per id, the C++ twin,
   the numbers quoted in story / tryThis) by the author's scripts; see the registry file vn-examples.js for the schema.
   ext items use isa 'ext' (not on slide 34); custom items change a machine setting (cell width, memory size, latency). */
(function (global) {
  'use strict';
  var R = (typeof module !== 'undefined' && module.exports) ? require('./vn-examples.js') : global.VNExamples;

  R.add([

    /* ───────────────────────── EXTENDED INSTRUCTION SET (supplementary, not on slide 34) ───────────────────────── */

    { id: 'ext-immediates', title: 'Constants inside the instruction', category: 'ext', level: 1, isa: 'ext',
      summary: 'A late fee with LOADI, ADDI, SUBI and CMPI: the constants live in the instruction, not in data cells.',
      story: `Constants such as 5, 0 or 2 normally need a data cell each (LOAD FIVE), and reading that cell costs a memory access. The extended instructions LOADI, ADDI, SUBI and CMPI carry the number inside the instruction instead. The number sits in the address field, so it can be at most the memory size minus 1 (15 here), and Auto memory grows when you use a bigger one. Watch the IR box send its address field straight to the ALU, with no memory in between. Real CPUs have such immediate operands for the same reason. Supplementary: not on slide 34.`,
      concepts: ['immediate operand', 'address field', 'accumulator', 'flag LT'],
      input: '20',
      src: String.raw`; Late fee. The first 5 minutes are free, then 1 per minute, plus a flat 2 once a fee applies.
; Input: the minutes late. Every constant (5, 0, 2) is written INSIDE its instruction,
; so the program needs no data cell for it.
        IN        MINUTES
        LOAD      MINUTES
        SUBI      5          ; R = MINUTES - 5 (the 5 is part of the instruction word)
        CMPI      0          ; LT = 1 when 0 < R, that is when R > 0: more than 5 minutes late
        JUMPLT    charge
        LOADI     0          ; not late enough: the fee is 0
        JUMP      show
charge: ADDI      2          ; the flat handling charge
show:   STORE     FEE
        OUT       FEE
        HALT
.data
MINUTES: 0
FEE:     0
`,
      tests: [{ in: [20], out: [17] }, { in: [0], out: [0] }, { in: [5], out: [0] }, { in: [6], out: [3] }, { in: [-4], out: [0] }, { in: [15], out: [12] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long minutes;
    cin >> minutes;
    long long fee = minutes - 5;     // SUBI 5
    if (fee > 0) fee += 2;           // CMPI 0, JUMPLT charge, ADDI 2
    else fee = 0;                    // LOADI 0
    cout << fee << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 20 minutes (the fee is 17) and open the Listing tab: the 5, the 0 and the 2 sit in the address field of SUBI, CMPI and ADDI, right after the opcode bits.',
        'Change SUBI 5 into SUBI 10 (a ten-minute grace period). Predict the fee for 20 minutes, then run it.',
        'Change LOADI 0 into LOADI 100: with Auto memory the machine grows from 16 to 128 cells, so that 100 fits in the address field. Why 128 and not 101?',
        'Rewrite the program with only the lecture instructions (LOAD, SUBTRACT, COMPARE, ADD): you need three extra data cells for the constants. Which three?'
      ] },

    { id: 'ext-nop-slots', title: 'NOP: an instruction that does nothing', category: 'ext', level: 1, isa: 'ext',
      summary: 'Doubling a number with two spare NOP slots: a NOP costs time but changes nothing except PC.',
      story: `NOP means "no operation": the machine fetches it, decodes it and does nothing. PC still moves on, so a NOP is a placeholder. You can write over it later, or write it over another instruction to switch that instruction off without moving any other line. This program doubles its input and keeps two spare NOP slots. It executes 8 instructions and 58 micro-steps; each NOP takes 6 of them and touches memory only once, to fetch the instruction itself. A real CPU has a NOP instruction too, used for padding and patching code. It is supplementary, not on slide 34.`,
      concepts: ['NOP', 'placeholder', 'instruction fetch', 'program layout'],
      input: '5',
      src: String.raw`; NOP = "no operation". Input: a number X. The program prints 2 x X.
; The two NOP lines are spare slots: they do nothing, but they keep their place in memory.
        IN        X
        LOAD      X
        ADD       X          ; R = X + X
        NOP                  ; spare slot 1: fetched and decoded, then nothing happens
        NOP                  ; spare slot 2
        STORE     Y
        OUT       Y
        HALT
.data
X: 0
Y: 0
`,
      tests: [{ in: [5], out: [10] }, { in: [0], out: [0] }, { in: [-3], out: [-6] }, { in: [21], out: [42] }, { in: [1000000], out: [2000000] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x, y;
    cin >> x;
    y = x + x;       // LOAD X, ADD X, STORE Y
                     // the two NOP lines have no C++ counterpart: they do nothing
    cout << y << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 5 and look at the Stats tab: 8 instructions, 58 micro-steps. Each NOP is 6 micro-steps, so the two spare slots cost 12 of them for nothing.',
        'Write ADD X over the first NOP: the program now prints 15 for the input 5 (X + X + X). Not a single other line moved.',
        'Write NOP over the ADD X line instead: the program prints 5, because R is stored unchanged. Open the Listing tab: every other instruction still has the same address.'
      ] },

    { id: 'ext-array-sum', title: 'Array sum with a pointer', category: 'ext', level: 2, isa: 'ext',
      summary: 'Read N numbers into an array and add them up, walking the array with LOADP and STOREP.',
      story: `An array is a row of cells, and the cell P holds the address of the element you want. LOADP P means: go to the address stored in P and load what you find there. STOREP P stores the same way. To reach the next element the program just adds 1 to P, an ordinary data cell, and the instructions never change. The lecture machine has no such instruction, so the stored-program example array-sum-selfmod must rewrite its own instructions instead. Watch the MDR box send the pointer back to MAR. Real CPUs call this indirect addressing. Supplementary: not on slide 34.`,
      concepts: ['pointer', 'array', 'indirect addressing', 'LOADP / STOREP'],
      input: '3 10 20 30',
      src: String.raw`; Sum of N numbers (N = 1 .. 8) kept in an array, walked with a POINTER.
; P holds the ADDRESS of the current element; LOADP P / STOREP P work on the cell P points at.
; The instructions never change: only the data cell P does.
        IN        N
        LOAD      N
        STORE     COUNT
        LOADI     arr        ; a name as an immediate is that cell's address
        STORE     P          ; P points at arr[0]
readlp: IN        TMP
        LOAD      TMP
        STOREP    P          ; the cell P points at gets the number
        INCREMENT P          ; P points at the next cell
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0          ; LT = 1 while COUNT > 0
        JUMPLT    readlp
        LOADI     arr
        STORE     P          ; second pass: P points at arr[0] again
sumlp:  LOADP     P          ; R = the element P points at
        ADD       SUM
        STORE     SUM        ; SUM = SUM + element
        INCREMENT P
        DECREMENT N
        LOAD      N
        CMPI      0
        JUMPLT    sumlp
        OUT       SUM
        HALT
.data
N:     0
COUNT: 0
P:     0
TMP:   0
SUM:   0
arr:   .space 8              ; room for 8 numbers
`,
      tests: [{ in: [3, 10, 20, 30], out: [60] }, { in: [1, 7], out: [7] }, { in: [8, 1, 2, 3, 4, 5, 6, 7, 8], out: [36] }, { in: [4, -5, 5, -7, 7], out: [0] }, { in: [2, -3, -4], out: [-7] }, { in: [5, 1000000, 2000000, -3, 0, 7], out: [3000004] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[8] = {0}, sum = 0;
    cin >> n;
    long long *p = arr;                       // P: the address of arr[0]
    for (long long i = 0; i < n; i++) {
        cin >> *p;                            // IN TMP, then STOREP P
        p++;                                  // INCREMENT P
    }
    p = arr;
    for (long long i = 0; i < n; i++) {
        sum += *p;                            // LOADP P, ADD SUM, STORE SUM
        p++;
    }
    cout << sum << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 3 10 20 30 and watch the P cell in the Memory tab: it starts as the address of arr (30), reaches 33 after the first pass and goes back to 30 at the second LOADI arr.',
        'For the input 3 10 20 30 this program executes 57 instructions, the self-modifying array-sum-selfmod only 47. Where do the extra 10 come from, and what do you get in return?',
        'Enter 9 followed by nine numbers: P walks past the 8 cells of arr into free memory and the sum is still right. What would go wrong if another variable lived in cell 38?'
      ] },

    { id: 'ext-array-max', title: 'Where is the maximum?', category: 'ext', level: 3, isa: 'ext',
      summary: 'Find the largest of N numbers and its position, by remembering a pointer and subtracting the base.',
      story: `Same array walk as before, with one more idea: the program remembers WHERE the biggest number is (BESTP, a pointer), not only its value. A pointer is just a number, so you can compare it, add to it and subtract two of them. BASE is a data cell whose value is the name arr, so it holds the address of arr[0]; BESTP minus BASE is the index. It prints the maximum, then its index counting from 0 (the first one if several are equal). Indirect addressing, a supplementary idea from real CPUs: not on slide 34.`,
      concepts: ['pointer', 'array', 'pointer subtraction', 'symbol as data'],
      input: '6 3 9 2 9 4 1',
      src: String.raw`; Largest of N numbers (N = 1 .. 8) and its index. Prints the maximum, then the index (from 0).
; BESTP is a POINTER to the best element so far; BASE holds the address of arr[0].
        IN        N
        LOAD      N
        STORE     COUNT
        LOADI     arr
        STORE     P
readlp: IN        TMP
        LOAD      TMP
        STOREP    P          ; arr[i] = the number just read
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    readlp
        LOADI     arr
        STORE     P          ; P walks the array again, from arr[0]
        STORE     BESTP      ; the best element so far is arr[0] ...
        LOADP     P
        STORE     BEST       ; ... and its value
scan:   LOADP     P          ; R = the current element
        COMPARE   BEST       ; GT = BEST > R, EQ = BEST = R, LT = BEST < R
        JUMPGE    next       ; BEST is at least as big: keep it
        STORE     BEST       ; new maximum (R still holds the element)
        LOAD      P
        STORE     BESTP      ; remember where it lives
next:   INCREMENT P
        DECREMENT N
        LOAD      N
        CMPI      0
        JUMPLT    scan
        LOAD      BESTP
        SUBTRACT  BASE       ; address of the maximum - address of arr[0] = its index
        STORE     IDX
        OUT       BEST
        OUT       IDX
        HALT
.data
N:     0
COUNT: 0
P:     0
TMP:   0
BEST:  0
BESTP: 0
IDX:   0
BASE:  arr                   ; a NAME as a data value is that name's address
arr:   .space 8
`,
      tests: [{ in: [6, 3, 9, 2, 9, 4, 1], out: [9, 1] }, { in: [1, 5], out: [5, 0] }, { in: [4, -8, -3, -9, -3], out: [-3, 1] }, { in: [8, 1, 2, 3, 4, 5, 6, 7, 8], out: [8, 7] }, { in: [3, 10, 2, 1], out: [10, 0] }, { in: [5, 7, 7, 7, 7, 7], out: [7, 0] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[8] = {0};
    cin >> n;
    for (long long i = 0; i < n; i++) cin >> arr[i];
    long long *p = arr, *bestp = arr, best = arr[0];   // BESTP, BEST
    for (long long i = 0; i < n; i++) {
        if (*p > best) {                 // like JUMPGE next: equal values keep the first maximum
            best = *p;
            bestp = p;
        }
        p++;
    }
    cout << best << "\n" << (bestp - arr) << "\n";     // BESTP - BASE
    return 0;
}
`,
      tryThis: [
        'Run it with 6 3 9 2 9 4 1: the maximum 9 appears twice and the program reports index 1, the first. Change JUMPGE next into JUMPGT next and run again: it reports 3. Explain why.',
        'Watch BESTP in the Memory tab while it runs: it changes only when a bigger number is found. For input 6 3 9 2 9 4 1 that happens just once after the start. Which number triggers it?',
        'Make it print the smallest number and its index instead. Which single instruction decides between the two versions?'
      ] },

    { id: 'ext-reverse-array', title: 'Reverse an array in place', category: 'ext', level: 3, isa: 'ext',
      summary: 'Two pointers walk toward each other and swap what they point at. The array is reversed in place.',
      story: `Two pointers walk toward each other: LO starts at the front, HI at the back. Each round swaps the two cells they point at (LOADP and STOREP), then LO moves up and HI moves down, until they meet. The array is reversed in place, with only one temporary cell and no second array. HI starts at arr + N - 1, worked out with LOADI, ADD and SUBI. Finally the program prints the array from the front. Real CPUs reach memory indirectly like this all the time. Supplementary: not on slide 34.`,
      concepts: ['pointer', 'two pointers', 'swap', 'in place'],
      input: '5 1 2 3 4 5',
      src: String.raw`; Reverse N numbers (N = 1 .. 8) inside the array, then print them. Two pointers: LO and HI.
        IN        N
        LOAD      N
        STORE     COUNT
        LOADI     arr
        STORE     P
readlp: IN        TMP
        LOAD      TMP
        STOREP    P
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    readlp
        LOADI     arr
        STORE     LO         ; LO points at the first element
        ADD       N
        SUBI      1
        STORE     HI         ; HI = arr + N - 1 points at the last element
swap:   LOAD      LO
        COMPARE   HI         ; GT = HI > LO
        JUMPLE    show       ; the pointers have met or crossed: finished
        LOADP     LO
        STORE     TMP        ; TMP = *LO
        LOADP     HI         ; R = *HI
        STOREP    LO         ; *LO = *HI
        LOAD      TMP
        STOREP    HI         ; *HI = the old *LO
        INCREMENT LO
        DECREMENT HI
        JUMP      swap
show:   LOADI     arr
        STORE     P
        LOAD      N
        STORE     COUNT
outlp:  LOADP     P
        STORE     TMP
        OUT       TMP
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    outlp
        HALT
.data
N:     0
COUNT: 0
P:     0
TMP:   0
LO:    0
HI:    0
arr:   .space 8
`,
      tests: [{ in: [5, 1, 2, 3, 4, 5], out: [5, 4, 3, 2, 1] }, { in: [1, 5], out: [5] }, { in: [2, 1, 2], out: [2, 1] }, { in: [4, 7, -1, 0, 9], out: [9, 0, -1, 7] }, { in: [8, 10, 20, 30, 40, 50, 60, 70, 80], out: [80, 70, 60, 50, 40, 30, 20, 10] }, { in: [3, 4, 4, 4], out: [4, 4, 4] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[8] = {0};
    cin >> n;
    for (long long i = 0; i < n; i++) cin >> arr[i];
    long long *lo = arr, *hi = arr + n - 1;          // LO and HI
    while (hi > lo) {                                // COMPARE HI, JUMPLE show
        long long tmp = *lo;                         // TMP = *LO
        *lo = *hi;
        *hi = tmp;
        lo++;
        hi--;
    }
    for (long long i = 0; i < n; i++) cout << arr[i] << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 5 1 2 3 4 5 and follow LO and HI in the Memory tab: LO goes 49, 50, 51 while HI goes 53, 52, 51, and then they meet in the middle.',
        'With input 4 7 -1 0 9 the pointers cross instead of meeting on a middle element. Why does JUMPLE (and not JUMPEQ) stop the loop in both cases? What happens to the middle element when N is odd?',
        'Remove INCREMENT LO and DECREMENT HI from the swap loop and predict what the program does for input 5 1 2 3 4 5. Then run it and read the status line.'
      ] },

    { id: 'ext-bubble-sort', title: 'Bubble sort of six numbers', category: 'ext', level: 3, isa: 'ext',
      summary: 'Sort six numbers in an array by swapping neighbours that are in the wrong order.',
      story: `Bubble sort compares neighbours and swaps them when they are in the wrong order. After pass 1 the biggest number sits at the end, after pass 2 the second biggest, and so on, so six numbers need 5 passes of 5, 4, 3, 2 and 1 comparisons. P points at the left neighbour; after a swap it still stands on the right cell, ready for the next pair. Reads six numbers and prints them smallest first. Real CPUs address memory indirectly like this all the time; the pointer instructions are supplementary, not on slide 34.`,
      concepts: ['sorting', 'pointer', 'nested loops', 'swap'],
      input: '5 2 9 1 7 3',
      src: String.raw`; Bubble sort of six numbers. Input: six numbers. Output: the same numbers, smallest first.
; P points at the left cell of the pair being compared; COUNT is reused for several loops.
        LOADI     6
        STORE     COUNT
        LOADI     arr
        STORE     P
readlp: IN        TMP
        LOAD      TMP
        STOREP    P
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    readlp
        LOADI     5
        STORE     PASS       ; pass number 5 is the longest: it makes 5 comparisons
outer:  LOADI     arr
        STORE     P          ; every pass starts at the first pair
        LOAD      PASS
        STORE     COUNT      ; comparisons left in this pass
inner:  LOADP     P
        STORE     A          ; A = the left neighbour
        INCREMENT P
        LOADP     P
        STORE     B          ; B = the right neighbour (P now points at it)
        LOAD      A
        COMPARE   B          ; GT = B > A, EQ = B = A, LT = B < A
        JUMPGE    next       ; in order: nothing to do
        STOREP    P          ; out of order: the right cell gets A ...
        DECREMENT P
        LOAD      B
        STOREP    P          ; ... and the left cell gets B
        INCREMENT P          ; P stands on the right cell again
next:   DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    inner      ; more pairs in this pass
        DECREMENT PASS
        LOAD      PASS
        CMPI      0
        JUMPLT    outer      ; another, shorter pass
        LOADI     arr
        STORE     P
        LOADI     6
        STORE     COUNT
outlp:  LOADP     P
        STORE     TMP
        OUT       TMP
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    outlp
        HALT
.data
COUNT: 0
P:     0
TMP:   0
PASS:  0
A:     0
B:     0
arr:   .space 6
`,
      tests: [{ in: [5, 2, 9, 1, 7, 3], out: [1, 2, 3, 5, 7, 9] }, { in: [1, 2, 3, 4, 5, 6], out: [1, 2, 3, 4, 5, 6] }, { in: [6, 5, 4, 3, 2, 1], out: [1, 2, 3, 4, 5, 6] }, { in: [4, 4, 4, 4, 4, 4], out: [4, 4, 4, 4, 4, 4] }, { in: [-3, 0, -7, 12, -7, 5], out: [-7, -7, -3, 0, 5, 12] }, { in: [2, 1, 2, 1, 2, 1], out: [1, 1, 1, 2, 2, 2] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long arr[6];
    for (int i = 0; i < 6; i++) cin >> arr[i];
    for (int pass = 5; pass >= 1; pass--) {          // PASS: 5, 4, 3, 2, 1
        long long *p = arr;                          // P points at the left cell
        for (int left = pass; left > 0; left--) {    // COUNT
            long long a = *p;
            p++;
            long long b = *p;
            if (a > b) {                             // out of order: swap
                *p = a;
                p--;
                *p = b;
                p++;
            }
        }
    }
    for (int i = 0; i < 6; i++) cout << arr[i] << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 5 2 9 1 7 3 and look at arr in the Memory tab after each pass (use Next instruction until PASS changes): the biggest number, 9, is in its final cell after the first pass.',
        'Run it with 1 2 3 4 5 6, which is already sorted, and then with 6 5 4 3 2 1: compare the Instr counters (327 and 402). Both runs make the same 15 comparisons, so where do the extra 75 instructions come from?',
        'Make it sort 4 numbers instead of 6: which constants must change? (There are three: two LOADI 6 and one LOADI 5.)'
      ] },

    { id: 'ext-fib-array', title: 'Fibonacci numbers in an array', category: 'ext', level: 2, isa: 'ext',
      summary: 'Fill an array with the first N Fibonacci numbers using three pointers, then print it.',
      story: `Each Fibonacci number is the sum of the two before it, so the program keeps three pointers: PA and PB point at the two previous numbers, PNEW at the empty cell to fill. LOADP PA, LOADP PB, ADD and STOREP PNEW compute and store one number, then all three pointers move up by one. The first two numbers (0 and 1) are already in the data section. Afterwards the program prints N numbers from the array (N = 1 to 12). Indirect addressing in a real CPU works like this; it is supplementary, not on slide 34.`,
      concepts: ['pointer', 'array', 'Fibonacci', 'ADDI'],
      input: '8',
      src: String.raw`; The first N Fibonacci numbers (N = 1 .. 12), stored in an array and then printed from it.
; PA and PB point at the two previous numbers, PNEW at the cell to fill.
        IN        N
        LOADI     arr
        STORE     PA         ; PA points at arr[0]
        ADDI      1
        STORE     PB         ; PB points at arr[1]
        ADDI      1
        STORE     PNEW        ; PNEW points at arr[2]: the first cell to fill
        LOAD      N
        SUBI      2
        STORE     COUNT      ; N - 2 numbers still have to be computed
        CMPI      0
        JUMPGE    show       ; COUNT <= 0: arr[0] and arr[1] are all there is
gen:    LOADP     PA
        STORE     TMP
        LOADP     PB
        ADD       TMP        ; R = arr[i-2] + arr[i-1]
        STOREP    PNEW        ; arr[i] = R
        INCREMENT PA
        INCREMENT PB
        INCREMENT PNEW
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    gen
show:   LOADI     arr
        STORE     PA         ; PA is free now: walk the array with it
        LOAD      N
        STORE     COUNT
outlp:  LOADP     PA
        STORE     TMP
        OUT       TMP
        INCREMENT PA
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    outlp
        HALT
.data
N:     0
COUNT: 0
PA:    0
PB:    0
PNEW:  0
TMP:   0
arr:   .word 0, 1            ; the first two Fibonacci numbers
       .space 10             ; room for the rest (12 numbers in all)
`,
      tests: [{ in: [8], out: [0, 1, 1, 2, 3, 5, 8, 13] }, { in: [1], out: [0] }, { in: [2], out: [0, 1] }, { in: [3], out: [0, 1, 1] }, { in: [12], out: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89] }, { in: [6], out: [0, 1, 1, 2, 3, 5] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[12] = {0, 1};              // the data section starts with 0 and 1
    cin >> n;
    for (int i = 2; i < n; i++) arr[i] = arr[i - 1] + arr[i - 2];   // the gen loop
    for (int i = 0; i < n; i++) cout << arr[i] << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 8 and watch the cells of arr fill up one by one in the Memory tab (use Next instruction): the pointer PNEW is always one cell ahead of PB.',
        'Run it with 1 and with 2: the JUMPGE skips the generating loop. How many instructions does the program execute for N = 2 (33) and for N = 1 (25)?',
        'Make the array hold the Lucas numbers 2, 1, 3, 4, 7 ... by changing only the data section. Which two values do you change?'
      ] },

    { id: 'ext-factorial', title: 'Factorial with MUL', category: 'ext', level: 1, isa: 'ext',
      summary: 'N! with one MUL per step, and an overflow error when the result no longer fits.',
      story: `N! = N x (N-1) x ... x 1. With the MUL instruction each step is one multiplication, while the lecture machine (the Factorial example in the Loops section) has to build every product out of repeated additions. Try N = 18 and N = 19: the numbers on this machine stay exact only up to 2^53 - 1, about 9 x 10^15, and 19! is bigger, so the machine stops with an overflow error instead of printing a wrong answer. A real CPU has a hardware multiplier, a richer ALU. Supplementary: not on slide 34.`,
      concepts: ['MUL', 'loop', 'overflow', 'accumulator'],
      input: '5',
      src: String.raw`; N factorial with the MUL instruction. Input: N. N <= 1 gives 1.
        IN        N
        LOADI     1
        STORE     F          ; F = 1
loop:   LOAD      N
        CMPI      1          ; GT or EQ: 1 >= N, so we are finished; LT: N > 1
        JUMPGE    done
        LOAD      F
        MUL       N          ; R = F x N: one instruction instead of a whole loop of ADDs
        STORE     F
        DECREMENT N
        JUMP      loop
done:   OUT       F
        HALT
.data
N: 0
F: 0
`,
      tests: [{ in: [5], out: [120] }, { in: [0], out: [1] }, { in: [1], out: [1] }, { in: [12], out: [479001600] }, { in: [-2], out: [1] }, { in: [18], out: [6402373705728000] }, { in: [19], error: 'overflow' }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, f = 1;
    cin >> n;
    while (n > 1) {
        f *= n;          // MUL N. (long long holds 19! too; the machine stops at 2^53 - 1.)
        n--;
    }
    cout << f << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 7 and read the Instr counter: 56 instructions. The Factorial example in the Loops section needs 321 for the same input.',
        'Run it with 18 (it prints 6402373705728000) and then with 19. Read the error message and say which instruction failed.',
        'Change MUL N into ADD N and predict the output for 5 before you run it. What does the program compute now?'
      ] },

    { id: 'ext-gcd-mod', title: 'GCD with MOD', category: 'ext', level: 2, isa: 'ext',
      summary: 'Euclid with the remainder: replace (A, B) by (B, A mod B) until B is 0. Far fewer rounds.',
      story: `Euclid's better method replaces (A, B) by (B, A mod B) until B is 0; then A is the answer. MOD gives the remainder in one instruction, so the number of rounds stays tiny: 1 and 100 take 2 rounds, where the subtraction version (the GCD example in the Loops section) needs 99 subtractions. Zero is no problem either: gcd(0, 6) = 6, while the subtraction version never stops on it. Use non-negative inputs. A real CPU divides in hardware, one more reason for a richer ALU. Supplementary: not on slide 34.`,
      concepts: ['MOD', 'Euclid', 'loop', 'flag EQ'],
      input: '48 18',
      src: String.raw`; GCD of two non-negative numbers by Euclid's remainder method: (A, B) -> (B, A mod B).
        IN        A
        IN        B
loop:   LOAD      B
        CMPI      0          ; EQ = 1 when B = 0
        JUMPEQ    done
        LOAD      A
        MOD       B          ; R = A mod B
        STORE     T
        LOAD      B
        STORE     A          ; A = the old B
        LOAD      T
        STORE     B          ; B = A mod B
        JUMP      loop
done:   OUT       A          ; B = 0: A is the greatest common divisor
        HALT
.data
A: 0
B: 0
T: 0
`,
      tests: [{ in: [48, 18], out: [6] }, { in: [0, 6], out: [6] }, { in: [6, 0], out: [6] }, { in: [17, 5], out: [1] }, { in: [1, 100], out: [1] }, { in: [100, 75], out: [25] }, { in: [7, 7], out: [7] }, { in: [0, 0], out: [0] }, { in: [123456, 7890], out: [6] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long a, b;
    cin >> a >> b;
    while (b != 0) {
        long long t = a % b;     // MOD B
        a = b;
        b = t;
    }
    cout << a << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 48 18 and follow A and B in the Memory tab: (48, 18) (18, 12) (12, 6) (6, 0). Four values of A, three rounds of the loop.',
        'Run it with 1 100 and read the Instr counter (29). The subtraction version in the Loops section needs 799 for the same input.',
        'Run it with 0 6: this version prints 6 and stops. Follow the first round and say why 0 mod 6 is harmless.'
      ] },

    { id: 'ext-primes-mod', title: 'Primes up to N', category: 'ext', level: 3, isa: 'ext',
      summary: 'Print every prime up to N: test divisors with MOD and stop as soon as D x D passes the candidate.',
      story: `For every candidate C from 2 up to N, the program tries D = 2, 3, 4 ... and asks whether C mod D is 0: then D is a divisor and C is not prime. It may stop trying when D x D is bigger than C, because every divisor above that point has a partner below it. MUL computes D x D and MOD the remainder, which makes this much cheaper than testing each number by repeated subtraction (see Is it prime? in the Loops section). Even N = 100 runs within the default step guard (3037 instructions). A real CPU multiplies and divides in hardware too. Supplementary: not on slide 34.`,
      concepts: ['MOD', 'MUL', 'nested loops', 'prime'],
      input: '30',
      src: String.raw`; All primes up to N. For each candidate C, try D = 2, 3, ... while D x D <= C.
        IN        N
        LOADI     2
        STORE     C          ; first candidate
cand:   LOAD      C
        COMPARE   N          ; LT = 1 when N < C: all candidates done
        JUMPLT    done
        LOADI     2
        STORE     D          ; first divisor to try
trial:  LOAD      D
        MUL       D          ; R = D x D
        COMPARE   C          ; LT = 1 when C < D x D: no divisor up to the square root
        JUMPLT    isprime
        LOAD      C
        MOD       D          ; R = C mod D
        CMPI      0          ; EQ = 1 when the remainder is 0
        JUMPEQ    next       ; D divides C: not prime, say nothing
        INCREMENT D
        JUMP      trial
isprime: OUT      C
next:   INCREMENT C
        JUMP      cand
done:   HALT
.data
N: 0
C: 0
D: 0
`,
      tests: [{ in: [30], out: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29] }, { in: [1], out: [] }, { in: [2], out: [2] }, { in: [3], out: [2, 3] }, { in: [4], out: [2, 3] }, { in: [10], out: [2, 3, 5, 7] }, { in: [49], out: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47] }, { in: [50], out: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n;
    cin >> n;
    for (long long c = 2; c <= n; c++) {
        bool prime = true;
        for (long long d = 2; d * d <= c; d++) {
            if (c % d == 0) { prime = false; break; }
        }
        if (prime) cout << c << "\n";
    }
    return 0;
}
`,
      tryThis: [
        'Run it with 30 and then with 50 and compare the Instr counters (672 and 1307). N grew by about two thirds, the cost almost doubled. Why does the cost grow faster than N?',
        'For C = 49 the test D x D versus C ends in EQ at D = 7, and 7 must still be tried. Change JUMPLT isprime into JUMPLE isprime and run N = 50: four wrong numbers appear. Which, and why only those?',
        'Make it print only the number of primes up to N instead of the primes themselves. Where do you add a counter, and what do you print at the end?'
      ] },

    { id: 'ext-digits-divmod', title: 'Digits of a number', category: 'ext', level: 2, isa: 'ext',
      summary: 'Print the digits of a number, last digit first, with MOD 10 and DIV 10.',
      story: `The last digit of a number is X mod 10, and the number without its last digit is X div 10. Repeat until nothing is left and you have printed all the digits, least significant first: 123 prints 3, 2, 1. The 10 sits in a data cell, because DIV and MOD take a memory cell; there is no immediate form of them. For a negative number MOD keeps the sign of the dividend, so -45 prints -5 and -4. Zero prints 0, because the loop body runs once before it tests. Real CPUs divide in hardware, a richer ALU. Supplementary: not on slide 34.`,
      concepts: ['DIV', 'MOD', 'decimal digits', 'loop'],
      input: '2025',
      src: String.raw`; Print the decimal digits of X, least significant first (123 -> 3 2 1).
; DIV and MOD take a MEMORY cell, so the constant 10 lives in the data cell TEN.
        IN        X
loop:   LOAD      X
        MOD       TEN        ; R = the last digit (X mod 10)
        STORE     DIGIT
        OUT       DIGIT
        LOAD      X
        DIV       TEN        ; R = X div 10: X without its last digit
        STORE     X
        CMPI      0          ; EQ = 1 when nothing is left
        JUMPNEQ   loop
        HALT
.data
X:     0
DIGIT: 0
TEN:   10
`,
      tests: [{ in: [2025], out: [5, 2, 0, 2] }, { in: [123], out: [3, 2, 1] }, { in: [0], out: [0] }, { in: [7], out: [7] }, { in: [1000], out: [0, 0, 0, 1] }, { in: [-45], out: [-5, -4] }, { in: [9876543210], out: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long x;
    cin >> x;
    do {
        cout << x % 10 << "\n";    // MOD TEN (the sign follows x, as on the machine)
        x /= 10;                   // DIV TEN (rounds toward zero)
    } while (x != 0);
    return 0;
}
`,
      tryThis: [
        'Run it with 2025 and watch X in the Memory tab: 2025, 202, 20, 2, 0. The output is 5, 2, 0, 2.',
        'Add a counter so that the program also prints how many digits the number has. Which instruction increments it, and where does it go in the loop?',
        'Change TEN to 2 and run it with 13: the program prints the binary digits of 13 (least significant first). What does it print?'
      ] },

    { id: 'ext-power-mul', title: 'Fast power by squaring', category: 'ext', level: 3, isa: 'ext',
      summary: 'B to the power E in a handful of steps: square the base, halve the exponent, multiply when E is odd.',
      story: `B^E by repeated multiplication takes E steps. Squaring is faster: B^13 = B^8 x B^4 x B^1, and the exponent 13 is 1101 in binary. The loop looks at E mod 2 (is this binary digit 1? then multiply the result by the current B), halves E with DIV, and squares B with MUL. About log2(E) rounds instead of E. The squaring is skipped once E is used up, so no needless overflow. Prints 1 for E = 0. A real CPU's ALU multiplies and divides in hardware; MUL, DIV and MOD are supplementary, not on slide 34.`,
      concepts: ['MUL', 'DIV', 'MOD', 'binary exponent'],
      input: '2 10',
      src: String.raw`; B to the power E by repeated squaring. Inputs: B, then E. E <= 0 gives 1 (RES starts as 1).
; Invariant: RES x B^E is the answer. E odd: move one factor B into RES.
; Then B = B x B and E = E div 2.
        IN        B
        IN        E
loop:   LOAD      E
        CMPI      0
        JUMPGE    done       ; E <= 0: nothing left to multiply
        MOD       TWO        ; R = E mod 2
        CMPI      0
        JUMPEQ    even       ; E is even
        LOAD      RES
        MUL       B
        STORE     RES        ; E is odd: RES = RES x B
even:   LOAD      E
        DIV       TWO
        STORE     E          ; E = E div 2
        CMPI      0
        JUMPEQ    done       ; E is used up: skip the last squaring
        LOAD      B
        MUL       B
        STORE     B          ; B = B x B
        JUMP      loop
done:   OUT       RES
        HALT
.data
B:   0
E:   0
RES: 1
TWO: 2             ; DIV and MOD need the 2 in a data cell
`,
      tests: [{ in: [2, 10], out: [1024] }, { in: [3, 0], out: [1] }, { in: [0, 5], out: [0] }, { in: [5, 1], out: [5] }, { in: [-2, 3], out: [-8] }, { in: [7, 13], out: [96889010407] }, { in: [2, 52], out: [4503599627370496] }, { in: [2, 53], error: 'overflow' }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long b, e, res = 1;
    cin >> b >> e;
    while (e > 0) {
        if (e % 2 != 0) res *= b;     // E is odd: one factor B goes into RES
        e /= 2;
        if (e > 0) b *= b;            // skipped on the last round, like the machine
    }
    cout << res << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 2 10: the Instr counter is 66. The Powers example in the Loops section needs 297 instructions for the same input.',
        'Run it with 2 52 (it prints 4503599627370496) and then with 2 53 and read the error: 2^53 is one more than 2^53 - 1, the largest number this machine keeps exactly.',
        'Watch B, E and RES at the label loop for input 2 10: (B, E, RES) = (2, 10, 1), (4, 5, 1), (16, 2, 4), (256, 1, 4). Check that RES x B^E is 1024 every time.'
      ] },

    { id: 'ext-linear-search', title: 'Linear search', category: 'ext', level: 2, isa: 'ext',
      summary: 'Find the first position of a target in N numbers, or print -1. A pointer walks the array.',
      story: `Input: N, then N numbers, then the TARGET to look for. The program stores the numbers in an array and walks a pointer along it, comparing each element with TARGET; EQ = 1 ends the search and prints the index I, which counts along with the pointer. If the pointer runs off the end without a match it prints -1, built with LOADI 0 and SUBI 1 (the immediate itself cannot be negative). Real CPUs use indirect addressing like this; the pointer instructions are supplementary, not on slide 34.`,
      concepts: ['search', 'pointer', 'flag EQ', 'index'],
      input: '5 3 8 1 9 4 8',
      src: String.raw`; Linear search. Input: N (1 .. 8), N numbers, then the TARGET.
; Output: the index (from 0) of the first number equal to TARGET, or -1 if there is none.
        IN        N
        LOAD      N
        STORE     COUNT
        LOADI     arr
        STORE     P
readlp: IN        TMP
        LOAD      TMP
        STOREP    P
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    readlp
        IN        TARGET
        LOADI     arr
        STORE     P          ; P points at arr[0]
        CLEAR     I          ; I = 0
        LOAD      N
        STORE     COUNT      ; COUNT = how many elements are left to look at
look:   LOADP     P          ; R = the current element
        COMPARE   TARGET     ; EQ = 1 when TARGET = element
        JUMPEQ    found
        INCREMENT P
        INCREMENT I
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    look
        LOADI     0
        SUBI      1          ; R = -1: there is no negative immediate
        STORE     I
found:  OUT       I
        HALT
.data
N:      0
COUNT:  0
P:      0
TMP:    0
TARGET: 0
I:      0
arr:    .space 8
`,
      tests: [{ in: [5, 3, 8, 1, 9, 4, 8], out: [1] }, { in: [1, 5, 5], out: [0] }, { in: [3, 1, 2, 3, 3], out: [2] }, { in: [4, 1, 2, 3, 4, 9], out: [-1] }, { in: [8, 5, 6, 7, 8, 9, 10, 11, 12, 12], out: [7] }, { in: [4, 7, 7, 7, 7, 7], out: [0] }, { in: [2, -1, 0, -1], out: [0] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[8] = {0}, target;
    cin >> n;
    for (long long i = 0; i < n; i++) cin >> arr[i];
    cin >> target;
    long long index = -1;                        // what the machine builds with LOADI 0, SUBI 1
    for (long long i = 0; i < n; i++) {
        if (arr[i] == target) { index = i; break; }
    }
    cout << index << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 5 3 8 1 9 4 8 and then with 5 3 8 1 9 4 7. Compare the Instr counters (65 and 101): a failed search has to look at every element.',
        'Run it with 6 5 8 1 8 2 3 8 (N = 6, target 8): it prints 1. The other 8, at index 3, is never looked at. Why?',
        'Count positions from 1 and print 0 for a missing target: put LOAD I, ADDI 1 and STORE I just before OUT I at the label found. Why does 0 come out for free?'
      ] },

    { id: 'ext-binary-search', title: 'Binary search', category: 'ext', level: 3, isa: 'ext',
      summary: 'Search a sorted array by halving the range each time. Prints the index and the number of probes.',
      story: `The array is sorted, so one probe can discard half of it: look at the middle element; if the target is bigger only the right half can contain it, otherwise only the left half. The middle is MID = (LO + HI) div 2, which needs DIV, and the pointer to the middle element is arr + MID. The program prints the index (or -1) and how many probes it needed: at most 4 for 8 numbers, where a linear search might need 8. The numbers MUST be in increasing order. Real CPUs have indirect addressing and a hardware divider; both are supplementary here, not on slide 34.`,
      concepts: ['binary search', 'DIV', 'pointer', 'sorted array'],
      input: '8 1 3 5 7 9 11 13 15 11',
      src: String.raw`; Binary search in a SORTED array. Input: N (1 .. 8), N numbers in increasing order, then TARGET.
; Output: the index of TARGET (or -1), then how many probes were needed.
; LO and PROBES start at 0 (data cells); P is reused as the pointer to the middle element.
        IN        N
        LOAD      N
        STORE     COUNT
        LOADI     arr
        STORE     P
readlp: IN        TMP
        LOAD      TMP
        STOREP    P
        INCREMENT P
        DECREMENT COUNT
        LOAD      COUNT
        CMPI      0
        JUMPLT    readlp
        IN        TARGET
        LOAD      N
        SUBI      1
        STORE     HI         ; the range is LO .. HI = 0 .. N-1
probe:  LOAD      HI
        COMPARE   LO         ; GT = LO > HI: the range is empty
        JUMPGT    fail
        INCREMENT PROBES
        LOAD      LO
        ADD       HI
        DIV       TWO
        STORE     MID        ; MID = (LO + HI) div 2
        LOADI     arr
        ADD       MID
        STORE     P          ; P points at arr[MID]
        LOADP     P          ; R = arr[MID]
        COMPARE   TARGET     ; GT = TARGET > arr[MID], EQ = equal, LT = TARGET < arr[MID]
        JUMPEQ    found
        JUMPGT    right
        LOAD      MID
        SUBI      1
        STORE     HI         ; TARGET is smaller: keep the left half
        JUMP      probe
right:  LOAD      MID
        ADDI      1
        STORE     LO         ; TARGET is bigger: keep the right half
        JUMP      probe
fail:   LOADI     0
        SUBI      1
        STORE     MID        ; MID = -1 means: not found
found:  OUT       MID
        OUT       PROBES
        HALT
.data
N:      0
COUNT:  0
P:      0
TMP:    0
TARGET: 0
LO:     0
HI:     0
MID:    0
PROBES: 0
TWO:    2
arr:    .space 8
`,
      tests: [{ in: [8, 1, 3, 5, 7, 9, 11, 13, 15, 11], out: [5, 2] }, { in: [1, 4, 4], out: [0, 1] }, { in: [1, 4, 5], out: [-1, 1] }, { in: [8, 1, 3, 5, 7, 9, 11, 13, 15, 1], out: [0, 3] }, { in: [8, 1, 3, 5, 7, 9, 11, 13, 15, 15], out: [7, 4] }, { in: [8, 1, 3, 5, 7, 9, 11, 13, 15, 8], out: [-1, 3] }, { in: [5, -9, -4, 0, 6, 20, 0], out: [2, 1] }, { in: [6, 2, 2, 2, 2, 2, 2, 3], out: [-1, 3] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, arr[8] = {0}, target;
    cin >> n;
    for (long long i = 0; i < n; i++) cin >> arr[i];
    cin >> target;
    long long lo = 0, hi = n - 1, probes = 0, found = -1;
    while (lo <= hi) {
        long long mid = (lo + hi) / 2;           // DIV TWO
        probes++;
        if (arr[mid] == target) { found = mid; break; }
        if (target > arr[mid]) lo = mid + 1;     // JUMPGT right
        else hi = mid - 1;
    }
    cout << found << "\n" << probes << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 8 1 3 5 7 9 11 13 15 11: two probes (the middle is cell 3, then cell 5). Watch LO, HI and MID in the Memory tab.',
        'Search for every number in the array and for 8: the most probes you ever see is 4, with 8 elements. How many would a linear search need in the worst case?',
        'Give it an array that is NOT sorted: 8 9 7 5 3 1 11 13 15 9 contains the target 9, yet the program prints -1. Follow the probes and say which assumption broke.'
      ] },

    /* ───────────────────────── CUSTOMIZE THE MACHINE ───────────────────────── */

    { id: 'custom-overflow-wrap', title: 'Numbers that wrap around', category: 'custom', level: 1, settings: { wrap: true, size: 16 },
      summary: 'With the cell width set to wrap around, 127 + 1 becomes -128 on an 8-bit machine.',
      story: `Real memory cells hold a fixed number of bits. This example loads with the cell width set to wrap around: with 16 cells a word is 4 opcode bits + 4 address bits = 8 bits wide (W = 8), and numbers are kept as 8-bit two's complement, from -128 to 127. So 127 + 1 does not give 128 but -128, and 100 + 100 gives -56. Even IN wraps what you type. For how the bit patterns work, read the supplementary page Inside integers (../supplementary/twos-complement.html). Switch the cell width to Unlimited in Settings to see ordinary arithmetic.`,
      concepts: ['overflow', 'word width W', "two's complement", 'wrap around'],
      input: '127 1',
      src: String.raw`; Sum and difference of two numbers. Run it with Settings: cell width = wrap around.
; With 16 cells every cell is W = 8 bits wide: numbers live between -128 and 127.
        IN        A
        IN        B
        LOAD      A
        ADD       B          ; wraps: 127 + 1 = -128
        STORE     SUM
        OUT       SUM
        LOAD      A
        SUBTRACT  B          ; wraps too: -128 - 1 = 127
        STORE     DIFF
        OUT       DIFF
        HALT
.data
A:    0
B:    0
SUM:  0
DIFF: 0
`,
      tests: [{ in: [127, 1], out: [-128, 126] }, { in: [100, 100], out: [-56, 0] }, { in: [-128, 1], out: [-127, 127] }, { in: [5, 3], out: [8, 2] }, { in: [200, 0], out: [-56, -56] }, { in: [127, -1], out: [126, -128] }, { in: [-100, -100], out: [56, 0] }],
      cpp: String.raw`#include <iostream>
using namespace std;

// The machine has 16 cells, so its cells are 8 bits wide: signed char models the cell width.
// Every static_cast<signed char> is a place where the machine wraps a value (modulo 256).
int main() {
    int x, y;
    cin >> x >> y;
    signed char a = static_cast<signed char>(x);               // IN wraps what it reads
    signed char b = static_cast<signed char>(y);
    signed char sum = static_cast<signed char>(a + b);         // ADD
    signed char diff = static_cast<signed char>(a - b);        // SUBTRACT
    cout << static_cast<int>(sum) << "\n" << static_cast<int>(diff) << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 127 1: the output is -128 and 126. Then open Settings and set the cell width to Unlimited: the same program prints 128 and 126.',
        'Predict the output for 100 100 and for -100 -100 with wrap-around, then run both. In which direction does each overflow?',
        'Wrap-around on, memory size 32: a word is now 9 bits wide (W = 9, range -256 to 255). Predict what 127 1 prints now, then check.'
      ] },

    { id: 'custom-counter-wraps', title: 'A counter that wraps negative', category: 'custom', level: 1, settings: { wrap: true, size: 16 },
      summary: 'Count up until the cell wraps around to a negative number: 127 is followed by -128.',
      story: `The loop adds 1 to a counter and stops as soon as the counter is negative. With ordinary arithmetic that never happens, but with the cell width set to wrap around (8 bits on this 16-cell machine) the counter climbs to 127 and the next INCREMENT turns it into -128, so the loop stops by itself. The program prints the value before the last INCREMENT and the value after it. Switch the cell width to Unlimited and the same program runs until the step guard stops it. For the bit patterns see the supplementary page Inside integers (../supplementary/twos-complement.html).`,
      concepts: ['overflow', 'wrap around', 'loop', 'flag GT'],
      input: '0',
      src: String.raw`; Count up from START until the counter becomes negative. Needs: cell width = wrap around.
; Prints the last non-negative value PREV and the first negative value C.
        IN        C
loop:   LOAD      C
        STORE     PREV       ; PREV = the value before the INCREMENT
        INCREMENT C          ; wraps: 127 + 1 = -128 on an 8-bit machine
        LOAD      C
        COMPARE   ZERO       ; GT = 1 when 0 > C: the counter has become negative
        JUMPGT    done
        JUMP      loop
done:   OUT       PREV
        OUT       C
        HALT
.data
C:    0
PREV: 0
ZERO: 0
`,
      tests: [{ in: [0], out: [127, -128] }, { in: [100], out: [127, -128] }, { in: [126], out: [127, -128] }, { in: [127], out: [127, -128] }, { in: [-5], out: [-5, -4] }, { in: [200], out: [-56, -55] }, { in: [-128], out: [-128, -127] }],
      cpp: String.raw`#include <iostream>
using namespace std;

// The machine's cells are 8 bits wide (16 cells), so the counter is a signed char.
// static_cast<signed char> models the cell width: the value wraps modulo 256.
int main() {
    int start;
    cin >> start;
    signed char c = static_cast<signed char>(start);       // IN wraps what it reads
    signed char prev;
    do {
        prev = c;
        c = static_cast<signed char>(c + 1);               // INCREMENT C wraps at 127
    } while (c >= 0);
    cout << static_cast<int>(prev) << "\n" << static_cast<int>(c) << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 0 and read the Instr counter: 899 instructions for the 128 rounds. Run it with 100 instead: 199, because only 28 rounds are left.',
        'Open Settings and set the cell width to Unlimited, then run it again with 0: the counter never becomes negative, so the step guard stops the run.',
        'With wrap-around on, set the memory size to 32 (words 9 bits wide) and run with 0: it now stops at 255 and -256. Why?'
      ] },

    { id: 'custom-big-memory', title: 'A program too big for 16 cells', category: 'custom', level: 2, settings: { size: 64 },
      summary: 'Sum, maximum and minimum of five numbers without loops: 59 cells, so the memory is set to 64.',
      story: `This program has no loop and no array, so the same few instructions are written out once per number and the program is long: 51 instructions plus 8 data cells, 59 cells in all. A 16-cell machine cannot hold that, so this example loads with the memory size set to 64. A bigger memory needs more address bits (6 instead of 4), so every instruction word is 10 bits wide. Look at the Memory tab: the last five cells are free. A loop over an array (see the Loops section and the pointer examples) would need far less code.`,
      concepts: ['memory size', 'address bits', 'straight-line code', 'COMPARE'],
      input: '4 -2 9 9 0',
      src: String.raw`; Sum, largest and smallest of five numbers, written out WITHOUT a loop or an array.
; The same few instructions appear once per number, so the program is long: 59 cells in all.
; This example loads with memory size 64 (Settings): a 16-cell machine could not hold it.
        IN        D1
        IN        D2
        IN        D3
        IN        D4
        IN        D5
        LOAD      D1         ; SUM = D1 + D2 + D3 + D4 + D5
        ADD       D2
        ADD       D3
        ADD       D4
        ADD       D5
        STORE     SUM
        OUT       SUM
        LOAD      D1
        STORE     MAX        ; start with MAX = D1, then look at D2 .. D5
        LOAD      D2
        COMPARE   MAX        ; GT = 1 when MAX > D2
        JUMPGT    mx3        ; MAX is bigger: keep it
        STORE     MAX        ; D2 is the new MAX
mx3:    LOAD      D3
        COMPARE   MAX        ; GT = 1 when MAX > D3
        JUMPGT    mx4        ; MAX is bigger: keep it
        STORE     MAX        ; D3 is the new MAX
mx4:    LOAD      D4
        COMPARE   MAX        ; GT = 1 when MAX > D4
        JUMPGT    mx5        ; MAX is bigger: keep it
        STORE     MAX        ; D4 is the new MAX
mx5:    LOAD      D5
        COMPARE   MAX        ; GT = 1 when MAX > D5
        JUMPGT    mx6        ; MAX is bigger: keep it
        STORE     MAX        ; D5 is the new MAX
mx6:    OUT       MAX
        LOAD      D1
        STORE     MIN        ; start with MIN = D1, then look at D2 .. D5
        LOAD      D2
        COMPARE   MIN        ; LT = 1 when MIN < D2
        JUMPLT    mn3        ; MIN is smaller: keep it
        STORE     MIN        ; D2 is the new MIN
mn3:    LOAD      D3
        COMPARE   MIN        ; LT = 1 when MIN < D3
        JUMPLT    mn4        ; MIN is smaller: keep it
        STORE     MIN        ; D3 is the new MIN
mn4:    LOAD      D4
        COMPARE   MIN        ; LT = 1 when MIN < D4
        JUMPLT    mn5        ; MIN is smaller: keep it
        STORE     MIN        ; D4 is the new MIN
mn5:    LOAD      D5
        COMPARE   MIN        ; LT = 1 when MIN < D5
        JUMPLT    mn6        ; MIN is smaller: keep it
        STORE     MIN        ; D5 is the new MIN
mn6:    OUT       MIN
        HALT
.data
D1:  0
D2:  0
D3:  0
D4:  0
D5:  0
SUM: 0
MAX: 0
MIN: 0
`,
      tests: [{ in: [4, -2, 9, 9, 0], out: [20, 9, -2] }, { in: [1, 2, 3, 4, 5], out: [15, 5, 1] }, { in: [5, 4, 3, 2, 1], out: [15, 5, 1] }, { in: [-1, -2, -3, -4, -5], out: [-15, -1, -5] }, { in: [7, 7, 7, 7, 7], out: [35, 7, 7] }, { in: [0, 0, 0, 0, 0], out: [0, 0, 0] }, { in: [10, -10, 20, -20, 5], out: [5, 20, -20] }],
      cpp: String.raw`#include <iostream>
#include <algorithm>
using namespace std;

int main() {
    long long d[5], sum = 0;
    for (int i = 0; i < 5; i++) { cin >> d[i]; sum += d[i]; }
    long long mx = d[0], mn = d[0];
    for (int i = 1; i < 5; i++) { mx = max(mx, d[i]); mn = min(mn, d[i]); }
    cout << sum << "\n" << mx << "\n" << mn << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 4 -2 9 9 0 (it prints 20, 9, -2) and look at the Memory tab: the code and the data together fill cells 0 to 58, and the last five cells are free.',
        'Open Settings and set the memory size to 32: the assembler now refuses the program with an out-of-memory message. How many cells does it need?',
        'Set the memory size to Auto: which size does the machine pick, and why not 59 or 60?',
        'Extend the program to six numbers (D6). How many instructions and data cells do you add, and does it still fit into 64?'
      ] },

    { id: 'custom-latency-compare', title: 'Same program, slower memory', category: 'custom', level: 2, isa: 'ext', settings: { isa: 'ext', memLatency: 5 }, slide: 'slide 35',
      summary: 'Sum of cubes at memory latency 5: compare cycles, instructions and memory accesses with latency 1.',
      story: `Memory is slow compared with the CPU, and every instruction fetch, data read and data write has to wait for it. This example loads with memory latency 5: each memory access costs 5 cycles instead of 1. The rule is cycles = micro-steps + (latency - 1) x memory accesses. Run the program to the end and read the Stats tab, then set the latency to 1 and run again: instructions, micro-steps and memory accesses stay the same, only the cycles and the memory share change. That gap is the Von Neumann bottleneck of slide 35. The MUL instruction makes this an extended-ISA program, supplementary.`,
      concepts: ['memory latency', 'cycles', 'Von Neumann bottleneck', 'MUL'],
      input: '10',
      src: String.raw`; Sum of cubes 1^3 + 2^3 + ... + N^3 (N >= 1), using MUL for the cubes.
; Run it with memory latency 5 (this example's setting) and read the Stats tab, then set latency 1.
        IN        N
loop:   INCREMENT I          ; I = 1, 2, ..., N
        LOAD      I
        MUL       I
        MUL       I          ; R = I x I x I
        ADD       SUM
        STORE     SUM        ; SUM = SUM + I cubed
        LOAD      I
        COMPARE   N          ; GT = 1 while N > I
        JUMPGT    loop
        OUT       SUM
        HALT
.data
N:   0
I:   0
SUM: 0
`,
      tests: [{ in: [10], out: [3025] }, { in: [1], out: [1] }, { in: [2], out: [9] }, { in: [3], out: [36] }, { in: [20], out: [44100] }, { in: [100], out: [25502500] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, sum = 0, i = 0;
    cin >> n;
    do {                         // the machine tests at the bottom, so N = 0 would run once
        i++;
        sum += i * i * i;
    } while (n > i);
    cout << sum << "\n";
    return 0;
}
`,
      tryThis: [
        'Run it with 10 (it prints 3025). In the Stats tab write down: instructions (93), micro-steps (732), memory accesses = instruction fetches + data reads + data writes (185), cycles (1472) and the memory share (63%).',
        'Check the rule with your numbers: micro-steps + (5 - 1) x memory accesses = cycles. Then set the latency to 1 and run again. Which of the five numbers stay the same, which change?',
        'Use the rule to predict the cycles at latency 20 before you set it, then check in the Stats tab (4247 cycles, 87% on memory).'
      ] },

    { id: 'custom-small-memory', title: 'A program that just fits', category: 'custom', level: 1, settings: { size: 16 },
      summary: 'A table of triangle numbers that fills a 16-cell memory exactly. One more cell and it no longer fits.',
      story: `This program fills a 16-cell memory exactly: 13 instructions in cells 0 to 12 and 3 data cells in cells 13 to 15. The memory size is pinned to 16 here, so there is no room for even one more instruction or variable. With 16 cells the address field is 4 bits (0 to 15) and a word is 8 bits wide; a 17th cell would need a fifth address bit and make every word 9 bits. Try adding an instruction, read what the assembler says, then grow the memory in Settings. The program prints k and the k-th triangle number (1, 3, 6, 10 ...) for k = 1 to N.`,
      concepts: ['memory size', 'address bits', 'out of memory', 'loop'],
      input: '4',
      src: String.raw`; Triangle numbers: for k = 1 .. N print k and 1 + 2 + ... + k.
; The program uses all 16 cells (13 instructions + 3 data cells): the memory size is set to 16.
        IN        N
        CLEAR     SUM
        CLEAR     I
loop:   INCREMENT I
        LOAD      SUM
        ADD       I
        STORE     SUM        ; SUM = 1 + 2 + ... + I
        OUT       I
        OUT       SUM
        LOAD      I
        COMPARE   N          ; GT = 1 while N > I
        JUMPGT    loop
        HALT
.data
N:   0
SUM: 0
I:   0
`,
      tests: [{ in: [4], out: [1, 1, 2, 3, 3, 6, 4, 10] }, { in: [1], out: [1, 1] }, { in: [0], out: [1, 1] }, { in: [2], out: [1, 1, 2, 3] }, { in: [6], out: [1, 1, 2, 3, 3, 6, 4, 10, 5, 15, 6, 21] }],
      cpp: String.raw`#include <iostream>
using namespace std;

int main() {
    long long n, sum = 0, i = 0;
    cin >> n;
    do {                         // the test is at the bottom, so even N = 0 prints one row
        i++;
        sum += i;
        cout << i << "\n" << sum << "\n";
    } while (n > i);
    return 0;
}
`,
      tryThis: [
        'Open the Memory tab: cells 13, 14 and 15 are N, SUM and I, and there is no free cell. Run it with 4 and check the output: pairs k and the k-th triangle number.',
        'Add one more instruction, for example OUT N before HALT. The assembler reports out-of-memory: 17 cells needed, only 16 available. Read the message.',
        'Open Settings and set the memory size to 32, or to Auto: the longer program now assembles, and each word in the Listing tab is 9 bits wide. Why 9?'
      ] }

  ]);
})(typeof window !== 'undefined' ? window : this);
