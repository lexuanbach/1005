/* Tiny compiler lab (Chapter 8): the catalogue of example programs.  Generated from verified sources: every program was compiled, run on the toy
   machine, run by the reference interpreter AND compiled with g++ -std=c++17, and the three outputs agreed on every test input listed in "tests".
   (instr = instructions executed on the toy machine.)  Each example: key, cat (category id), name, blurb (one line), level (1-3), input (sample), out (its output),
   src, story, look (what to look for in the stages), tryIt (challenges), tests.                                                                       */
(function (global) {
  'use strict';
  var LEVELS = ['', 'Starter', 'Intermediate', 'Challenge'];
  var CATEGORIES = [
  {
    "id": "basics",
    "name": "Basics",
    "blurb": "Straight-line code: assignments, arithmetic, no decisions."
  },
  {
    "id": "decisions",
    "name": "Decisions",
    "blurb": "if / else, else if, && and ||: how a choice becomes compare-and-jump."
  },
  {
    "id": "loops",
    "name": "Loops",
    "blurb": "while, for and do-while: a loop is a jump backwards."
  },
  {
    "id": "classic",
    "name": "Classic algorithms",
    "blurb": "Euclid, Fibonacci, primes: well-known recipes, compiled."
  },
  {
    "id": "input",
    "name": "Input processing",
    "blurb": "Programs driven by the numbers typed into the input box."
  },
  {
    "id": "puzzles",
    "name": "Puzzles",
    "blurb": "FizzBuzz, nested loops, break: a bit more to look at."
  }
];
  var EXAMPLES = [
 {
  "key": "add",
  "cat": "basics",
  "name": "A = B + C (straight line)",
  "blurb": "Three statements, nothing to decide, nothing to repeat: the simplest program.",
  "level": 1,
  "input": "",
  "out": [
   12
  ],
  "src": "int a, b = 5, c = 7;\na = b + c;\ncout << a << endl;\n",
  "story": "A = B + C from the lecture slides, written in C++. Nothing is decided and nothing repeats, so the machine runs the code once from top to bottom.",
  "look": [
   "Assembly: one C++ line, a = b + c;, becomes three instructions: LOAD b, ADD c, STORE a. Every statement ends with a STORE because the result is in R and must go back to a cell.",
   "Machine code: the constants 5 and 7 are not inside the instructions. This ISA has no immediate operands, so each constant lives in its own data cell after the code.",
   "Run: 9 instructions in all, one pass through the code, then HALT."
  ],
  "tryIt": [
   "Change b = 5 into b = 5 + 2 - 1 and compare the assembly: every extra term adds one ADD or SUBTRACT.",
   "Add the line  c = a - b;  and find the new LOAD / SUBTRACT / STORE in the assembly."
  ],
  "tests": [
   {
    "in": "",
    "out": [
     12
    ],
    "instr": 9
   }
  ]
 },
 {
  "key": "swap",
  "cat": "basics",
  "name": "Swap two numbers",
  "blurb": "Exchange two values with a helper variable.",
  "level": 1,
  "input": "3 7",
  "out": [
   7,
   3
  ],
  "src": "int a, b, tmp;\ncin >> a >> b;\ntmp = a;\na = b;\nb = tmp;\ncout << a << endl;\ncout << b << endl;\n",
  "story": "Reads two numbers and prints them in the opposite order. There is no swap instruction and no instruction that copies one memory cell to another: every move goes through R.",
  "look": [
   "Assembly: tmp = a; is LOAD a, STORE tmp; then a = b; is LOAD b, STORE a; then b = tmp; is LOAD tmp, STORE b. Six instructions for three lines.",
   "Tokens & tree: after the Declare and Input nodes come three Assign nodes. The order of the nodes is the order of execution.",
   "Run: R always holds the value that was just loaded or stored; watch it in the CPU block of the diagram."
  ],
  "tryIt": [
   "Delete the line  tmp = a;  and run with 3 7. Which value is lost, and which instruction destroyed it?",
   "Swap without a helper variable:  a = a + b;  b = a - b;  a = a - b;  and compare the instruction counts."
  ],
  "tests": [
   {
    "in": "3 7",
    "out": [
     7,
     3
    ],
    "instr": 11
   },
   {
    "in": "0 0",
    "out": [
     0,
     0
    ],
    "instr": 11
   },
   {
    "in": "-5 9",
    "out": [
     9,
     -5
    ],
    "instr": 11
   },
   {
    "in": "100 -100",
    "out": [
     -100,
     100
    ],
    "instr": 11
   }
  ]
 },
 {
  "key": "avg2",
  "cat": "basics",
  "name": "Average of two numbers (integer)",
  "blurb": "(a + b) / 2: integer division throws the fraction away.",
  "level": 1,
  "input": "7 4",
  "out": [
   5
  ],
  "src": "int a, b, avg;\ncin >> a >> b;\navg = (a + b) / 2;\ncout << avg << endl;\n",
  "story": "The average of two whole numbers, rounded toward zero like C++. The lecture ISA has no divide instruction, so the compiler writes a small loop that subtracts 2 again and again and counts the subtractions.",
  "look": [
   "Assembly: the parentheses decide the order: the sum a + b is computed first and handed to the divide routine in the cells _da and _db.",
   "The divide routine is the block of lines that all come from line 3: a JUMP that goes backwards (\"subtract again\") is a loop, exactly like a while loop. The divisor 2 is a positive constant, so no test for zero is needed.",
   "Run: 64 instructions for 7 and 4 although the C++ is one line. The cost depends on the size of the numbers: try 1000 and 2."
  ],
  "tryIt": [
   "Run -7 -4 and then -7 4. In C++ the quotient is cut toward zero, so (-7 + -4) / 2 is -5, not -6. Find the lines that remember the minus sign.",
   "Replace  / 2  by  % 2  (the remainder) and compare the assembly with the division version."
  ],
  "tests": [
   {
    "in": "7 4",
    "out": [
     5
    ],
    "instr": 64
   },
   {
    "in": "10 20",
    "out": [
     15
    ],
    "instr": 144
   },
   {
    "in": "-7 -4",
    "out": [
     -5
    ],
    "instr": 72
   },
   {
    "in": "-7 4",
    "out": [
     -1
    ],
    "instr": 40
   },
   {
    "in": "0 1",
    "out": [
     0
    ],
    "instr": 24
   },
   {
    "in": "1 0",
    "out": [
     0
    ],
    "instr": 24
   }
  ]
 },
 {
  "key": "celsius",
  "cat": "basics",
  "name": "Celsius to Fahrenheit",
  "blurb": "c * 9 / 5 + 32: a multiplication and a division in one expression.",
  "level": 2,
  "input": "100",
  "out": [
   212
  ],
  "src": "int c, f;\ncin >> c;\nf = c * 9 / 5 + 32;\ncout << f << endl;\n",
  "story": "Converts Celsius to Fahrenheit with whole numbers. The expression uses * then / (left to right, as in C++), and each of them has no instruction in the lecture ISA, so each becomes its own loop.",
  "look": [
   "Assembly: the multiply loop (add c to a total nine times) is followed by the divide loop (subtract 5 until less than 5 is left), then ADD for the + 32. Precedence decides the order, not the text.",
   "Run: 1531 instructions for 100 degrees: multiplication is repeated addition and division is repeated subtraction, so the work grows with the numbers.",
   "Because / throws the remainder away, 37 degrees gives 98, not 98.6."
  ],
  "tryIt": [
   "Try -40 (the temperature where both scales agree) and 0. Negative numbers work too: find the lines that remember the minus sign.",
   "Move the parentheses:  c * (9 / 5) + 32  and run 100 again. Why is the answer different? (9 / 5 is 1 in integers.)"
  ],
  "tests": [
   {
    "in": "100",
    "out": [
     212
    ],
    "instr": 1531
   },
   {
    "in": "0",
    "out": [
     32
    ],
    "instr": 92
   },
   {
    "in": "-40",
    "out": [
     -40
    ],
    "instr": 675
   },
   {
    "in": "37",
    "out": [
     98
    ],
    "instr": 619
   },
   {
    "in": "-273",
    "out": [
     -459
    ],
    "instr": 4027
   },
   {
    "in": "5",
    "out": [
     41
    ],
    "instr": 163
   }
  ]
 },
 {
  "key": "max",
  "cat": "decisions",
  "name": "Larger of two numbers (if / else)",
  "blurb": "if / else is a compare, a conditional jump and an unconditional jump.",
  "level": 1,
  "input": "8 3",
  "out": [
   8
  ],
  "src": "int a, b;\ncin >> a >> b;\nif (a > b) {\n    cout << a << endl;\n} else {\n    cout << b << endl;\n}\n",
  "story": "Prints the larger of two numbers. This is the textbook picture of a decision: there is no \"if\" instruction, only COMPARE and jumps.",
  "look": [
   "Assembly: the first jump (JUMPLE Lelse1) leaves the then-part when the condition is false; the JUMP Lend1 at the end of the then-part hops over the else-part.",
   "Machine code: the labels Lelse1 and Lend1 have become plain cell numbers inside the jump instructions.",
   "Run: only one of the two OUT instructions executes; the other is skipped without a trace."
  ],
  "tryIt": [
   "Run 8 3, then 3 8, then 4 4. In which case is the else-part taken?",
   "Remove the else-part (keep only the then-part) and compare: the JUMP Lend1 disappears, because there is nothing to hop over."
  ],
  "tests": [
   {
    "in": "8 3",
    "out": [
     8
    ],
    "instr": 9
   },
   {
    "in": "3 8",
    "out": [
     8
    ],
    "instr": 7
   },
   {
    "in": "4 4",
    "out": [
     4
    ],
    "instr": 8
   },
   {
    "in": "-1 -5",
    "out": [
     -1
    ],
    "instr": 9
   },
   {
    "in": "0 0",
    "out": [
     0
    ],
    "instr": 8
   }
  ]
 },
 {
  "key": "abs",
  "cat": "decisions",
  "name": "Absolute value",
  "blurb": "A minus sign has no instruction of its own.",
  "level": 1,
  "input": "-5",
  "out": [
   5
  ],
  "src": "int x;\ncin >> x;\nif (x < 0) {\n    x = -x;\n}\ncout << x << endl;\n",
  "story": "Prints the absolute value. The only new idea is  x = -x;  The lecture ISA cannot negate a cell, so the compiler computes 0 - x.",
  "look": [
   "Assembly: x = -x becomes LOAD _0, SUBTRACT x, STORE x. The constant 0 has a cell of its own, called _0.",
   "The test  x < 0  is LOAD _0, COMPARE x, JUMPGE: the compiler writes \"jump if the condition is FALSE\" (>= is the opposite of <), and JUMPGE is a pseudo-instruction that the assembler turns into two real jumps (see the machine code tab).",
   "Run: for a positive input the three negating instructions are skipped."
  ],
  "tryIt": [
   "Run -5, 0 and 7 and count the executed instructions for each.",
   "Write the program with  x = 0 - x;  instead of -x and compare the assembly: it is identical."
  ],
  "tests": [
   {
    "in": "-5",
    "out": [
     5
    ],
    "instr": 10
   },
   {
    "in": "0",
    "out": [
     0
    ],
    "instr": 7
   },
   {
    "in": "7",
    "out": [
     7
    ],
    "instr": 6
   },
   {
    "in": "-100000",
    "out": [
     100000
    ],
    "instr": 10
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 6
   }
  ]
 },
 {
  "key": "max3",
  "cat": "decisions",
  "name": "Largest of three (else if)",
  "blurb": "else if is just another compare-and-jump inside the else part.",
  "level": 2,
  "input": "3 9 4",
  "out": [
   9
  ],
  "src": "int a, b, c, best;\ncin >> a >> b >> c;\nif (a >= b && a >= c) {\n    best = a;\n} else if (b >= c) {\n    best = b;\n} else {\n    best = c;\n}\ncout << best << endl;\n",
  "story": "Prints the largest of three numbers with an else-if chain and && in the first test. && uses short-circuit evaluation: if the first comparison is false, the second one is never executed.",
  "look": [
   "Assembly: the condition a >= b && a >= c has two compare-and-jump pairs, and BOTH jumps go to the same label, the start of the else-if part. That is short-circuit evaluation.",
   "The else-if is not a new statement: it is an if inside the else part, so the tree view shows a nested If node.",
   "Run: with 3 9 4 the first test fails at once, so only 14 instructions run; compare with 9 3 4."
  ],
  "tryIt": [
   "Run 9 3 4 and 3 9 4 and compare the instruction counts. Which input needs the fewest?",
   "Change && to || in the first test and think first: what will 3 9 4 print now? Then run it."
  ],
  "tests": [
   {
    "in": "3 9 4",
    "out": [
     9
    ],
    "instr": 14
   },
   {
    "in": "9 3 4",
    "out": [
     9
    ],
    "instr": 14
   },
   {
    "in": "4 3 9",
    "out": [
     9
    ],
    "instr": 16
   },
   {
    "in": "5 5 5",
    "out": [
     5
    ],
    "instr": 14
   },
   {
    "in": "-1 -2 -3",
    "out": [
     -1
    ],
    "instr": 14
   },
   {
    "in": "2 7 7",
    "out": [
     7
    ],
    "instr": 14
   }
  ]
 },
 {
  "key": "leap",
  "cat": "decisions",
  "name": "Leap year test (&& and ||)",
  "blurb": "Three % operations and the logical operators && and ||.",
  "level": 2,
  "input": "2024",
  "out": [
   1
  ],
  "src": "int year;\ncin >> year;\nif ((year % 4 == 0 && year % 100 != 0) || year % 400 == 0) {\n    cout << 1 << endl;\n} else {\n    cout << 0 << endl;\n}\n",
  "story": "Prints 1 for a leap year and 0 otherwise: divisible by 4 and not by 100, or divisible by 400. Every % is a loop of subtractions, and the && / || are decided one comparison at a time.",
  "look": [
   "Assembly: each  year % n == 0  has its own copy of the remainder loop (look for the backwards JUMP each time). They are the long blocks tagged with line 3.",
   "The || means: if the first group is already true, jump to the then-part without evaluating year % 400.",
   "Run: 3724 instructions for 2024, almost all of them inside the remainder loops (2024 / 4 = 506 subtractions)."
  ],
  "tryIt": [
   "Run 1900, 2000 and 2023. Which of the three % operations is evaluated at all for 2023?",
   "Swap the two halves:  year % 400 == 0 || (year % 4 == 0 && year % 100 != 0)  and run 2000. Does the instruction count change?"
  ],
  "tests": [
   {
    "in": "2024",
    "out": [
     1
    ],
    "instr": 3724
   },
   {
    "in": "1900",
    "out": [
     0
    ],
    "instr": 3546
   },
   {
    "in": "2000",
    "out": [
     1
    ],
    "instr": 3736
   },
   {
    "in": "2023",
    "out": [
     0
    ],
    "instr": 3611
   },
   {
    "in": "1",
    "out": [
     0
    ],
    "instr": 41
   },
   {
    "in": "100",
    "out": [
     0
    ],
    "instr": 242
   },
   {
    "in": "400",
    "out": [
     1
    ],
    "instr": 796
   }
  ]
 },
 {
  "key": "sum",
  "cat": "loops",
  "name": "Sum of 1..N (while loop)",
  "blurb": "A while loop is a test at the top and a jump back at the bottom.",
  "level": 1,
  "input": "5",
  "out": [
   15
  ],
  "src": "int n, sum = 0, i = 1;\ncin >> n;\nwhile (i <= n) {\n    sum = sum + i;\n    i = i + 1;\n}\ncout << sum << endl;\n",
  "story": "Adds 1 + 2 + ... + N. The classic loop: the test at the top jumps out when the condition is false, and a JUMP at the bottom goes back up.",
  "look": [
   "Assembly: Ltop1 and Lexit1 are labels. LOAD n, COMPARE i, JUMPGT Lexit1 is the test of  i <= n  (written as \"leave when i > n\").",
   "Machine code: the JUMP Ltop1 at the end has a smaller address than itself: a loop is simply a backward jump.",
   "Run: 60 instructions for N = 5. Each round costs 10 instructions, so the cost grows with N."
  ],
  "tryIt": [
   "Run N = 0, 1 and 10 and write down the instruction counts. What formula fits?",
   "The program stops when i > n. What does it print for N = -3?"
  ],
  "tests": [
   {
    "in": "5",
    "out": [
     15
    ],
    "instr": 60
   },
   {
    "in": "0",
    "out": [
     0
    ],
    "instr": 10
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 20
   },
   {
    "in": "10",
    "out": [
     55
    ],
    "instr": 110
   },
   {
    "in": "-3",
    "out": [
     0
    ],
    "instr": 10
   }
  ]
 },
 {
  "key": "sumfor",
  "cat": "loops",
  "name": "Sum of 1..N (for loop)",
  "blurb": "The same sum written as a for loop: compare the assembly with the while version.",
  "level": 1,
  "input": "5",
  "out": [
   15
  ],
  "src": "int n, sum = 0;\ncin >> n;\nfor (int i = 1; i <= n; i++) {\n    sum += i;\n}\ncout << sum << endl;\n",
  "story": "A for loop is a while loop with its three parts in a fixed place: initialise once, test at the top, step at the bottom. The compiler produces almost the same code as for the while version, only shorter.",
  "look": [
   "Assembly: i++ is a single instruction, INCREMENT i, where  i = i + 1  needed LOAD, ADD, STORE. That is why this version has 15 instruction words and the while version 17.",
   "sum += i is the same as sum = sum + i: the tree view shows it as Assign sum += i, the assembly is identical.",
   "Run: 50 instructions for N = 5 against 60 for the while version: same result, less work."
  ],
  "tryIt": [
   "Rewrite the for header as  for (int i = 1; i <= n; i = i + 1)  and see which lines of assembly grow.",
   "Count down instead:  for (int i = n; i > 0; i--)  and check the result for N = 5."
  ],
  "tests": [
   {
    "in": "5",
    "out": [
     15
    ],
    "instr": 50
   },
   {
    "in": "0",
    "out": [
     0
    ],
    "instr": 10
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 18
   },
   {
    "in": "10",
    "out": [
     55
    ],
    "instr": 90
   },
   {
    "in": "100",
    "out": [
     5050
    ],
    "instr": 810
   },
   {
    "in": "-3",
    "out": [
     0
    ],
    "instr": 10
   }
  ]
 },
 {
  "key": "countdown",
  "cat": "loops",
  "name": "Countdown from N",
  "blurb": "A loop that prints on every round.",
  "level": 1,
  "input": "4",
  "out": [
   4,
   3,
   2,
   1
  ],
  "src": "int n;\ncin >> n;\nwhile (n > 0) {\n    cout << n << endl;\n    n = n - 1;\n}\n",
  "story": "Prints N, N-1, ..., 1. Output is just an OUT instruction inside the loop.",
  "look": [
   "Assembly: OUT n sits between the test and the JUMP back, so it runs once per round.",
   "Run: the OUT instruction sends a number to the output device block of the diagram; the first number appears before the loop has been left.",
   "The loop test is  n > 0, so the compiler jumps out with JUMPLE."
  ],
  "tryIt": [
   "Run N = 0: how many instructions are executed, and what is printed?",
   "Change the step to n = n - 2 and run 7 and 6. Which numbers are printed?"
  ],
  "tests": [
   {
    "in": "4",
    "out": [
     4,
     3,
     2,
     1
    ],
    "instr": 42
   },
   {
    "in": "0",
    "out": [],
    "instr": 6
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 15
   },
   {
    "in": "7",
    "out": [
     7,
     6,
     5,
     4,
     3,
     2,
     1
    ],
    "instr": 69
   }
  ]
 },
 {
  "key": "factorial",
  "cat": "loops",
  "name": "Factorial (a product in a loop)",
  "blurb": "A product inside a loop: multiplication is a loop inside a loop.",
  "level": 2,
  "input": "5",
  "out": [
   120
  ],
  "src": "int n, f = 1;\ncin >> n;\nfor (int i = 2; i <= n; i++) {\n    f = f * i;\n}\ncout << f << endl;\n",
  "story": "Computes N! = 2 * 3 * ... * N with a for loop. The multiplication  f * i  has no instruction either, so each round of the C++ loop runs another loop of repeated additions inside.",
  "look": [
   "Assembly: the multiply routine sits inside the for loop. Find its backwards JUMPGT (\"add once more\") and the outer JUMP back to the for test.",
   "The product is built in the cell _mr and then copied into f. _ma, _mb and _mr are scratch cells added by the compiler (look at the data cells).",
   "Run: 168 instructions for N = 5, but 12! needs several hundred, because the inner loop adds i times."
  ],
  "tryIt": [
   "Run N = 0, 1, 5, 10 and 12, and write down the instruction counts. Why does N = 12 cost so much more than N = 5?",
   "Run 13: a real C++ int overflows here, but the toy machine never wraps, so it prints 13! = 6227020800."
  ],
  "tests": [
   {
    "in": "5",
    "out": [
     120
    ],
    "instr": 168
   },
   {
    "in": "0",
    "out": [
     1
    ],
    "instr": 10
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 10
   },
   {
    "in": "2",
    "out": [
     2
    ],
    "instr": 39
   },
   {
    "in": "10",
    "out": [
     3628800
    ],
    "instr": 523
   },
   {
    "in": "12",
    "out": [
     479001600
    ],
    "instr": 714
   }
  ]
 },
 {
  "key": "digits",
  "cat": "loops",
  "name": "Count the digits (do-while)",
  "blurb": "do-while: the body runs first, so 0 has one digit.",
  "level": 2,
  "input": "12345",
  "out": [
   5
  ],
  "src": "int n, count = 0;\ncin >> n;\nif (n < 0) {\n    n = -n;\n}\ndo {\n    n = n / 10;\n    count++;\n} while (n != 0);\ncout << count << endl;\n",
  "story": "Counts the decimal digits of a whole number by dividing by 10 until nothing is left. A do-while tests at the bottom, which is why the digit count of 0 is correctly 1.",
  "look": [
   "Assembly: Ltop2 is at the top of the body, and the only test is at the bottom: JUMPNEQ Ltop2 jumps BACK while n != 0. A while loop has its test at the top instead.",
   "The division by 10 is the long block in the middle (a loop of subtractions). Its work grows with n: 11073 instructions for 12345 but almost nothing for 7.",
   "Break the symmetry: the sign is removed first with  n = -n."
  ],
  "tryIt": [
   "Run 0 and 7. Then change do { ... } while (n != 0)  into  while (n != 0) { ... }  and run 0 again. What is printed now?",
   "Run 1000000 with the default step guard, then raise the guard in the Run tab. How many instructions does it need?"
  ],
  "tests": [
   {
    "in": "12345",
    "out": [
     5
    ],
    "instr": 11073
   },
   {
    "in": "0",
    "out": [
     1
    ],
    "instr": 31
   },
   {
    "in": "7",
    "out": [
     1
    ],
    "instr": 29
   },
   {
    "in": "-999",
    "out": [
     3
    ],
    "instr": 939
   },
   {
    "in": "1000000",
    "out": [
     7
    ],
    "instr": 889043
   },
   {
    "in": "10",
    "out": [
     2
    ],
    "instr": 58
   }
  ]
 },
 {
  "key": "gcd",
  "cat": "classic",
  "name": "Greatest common divisor (Euclid, by subtraction)",
  "blurb": "A loop with a decision inside.",
  "level": 2,
  "input": "48 18",
  "out": [
   6
  ],
  "src": "int a, b;\ncin >> a >> b;\nwhile (a != b) {\n    if (a > b) {\n        a = a - b;\n    } else {\n        b = b - a;\n    }\n}\ncout << a << endl;\n",
  "story": "Euclid by subtraction: replace the larger number by the difference until both are equal. Assumes both inputs are positive: try 0 5 and see the step guard stop the machine.",
  "look": [
   "Assembly: the if / else is inside the while. The else-part ends right before the JUMP that goes back to the top, so both branches meet at the same place.",
   "Tokens & tree: the nesting of the tree (While, then If) is exactly the nesting of the jumps.",
   "Run: 53 instructions for 48 and 18."
  ],
  "tryIt": [
   "Run 48 18, then 7 7, then 0 5 (what stops it?).",
   "Compare with the next example, which uses %."
  ],
  "tests": [
   {
    "in": "48 18",
    "out": [
     6
    ],
    "instr": 53
   },
   {
    "in": "7 7",
    "out": [
     7
    ],
    "instr": 7
   },
   {
    "in": "1 9",
    "out": [
     1
    ],
    "instr": 87
   },
   {
    "in": "100 75",
    "out": [
     25
    ],
    "instr": 39
   },
   {
    "in": "13 17",
    "out": [
     1
    ],
    "instr": 83
   }
  ]
 },
 {
  "key": "gcdmod",
  "cat": "classic",
  "name": "Greatest common divisor (Euclid, with %)",
  "blurb": "The same algorithm with %: fewer rounds, a loop inside the loop.",
  "level": 2,
  "input": "48 18",
  "out": [
   6
  ],
  "src": "int a, b, r;\ncin >> a >> b;\nwhile (b != 0) {\n    r = a % b;\n    a = b;\n    b = r;\n}\ncout << a << endl;\n",
  "story": "Euclid with the remainder: (a, b) becomes (b, a % b) until b is 0. It needs far fewer rounds than the subtraction version, and it also works when one of the numbers is 0.",
  "look": [
   "Assembly: a % b with a variable divisor starts with a test for zero: JUMPEQ Ldiv0 jumps to a separate HALT at the very end of the program (real C++ would crash). The remainder is the _da cell after the subtraction loop.",
   "Run: 126 instructions for 48 and 18 against 53 for the subtraction version: fewer rounds, but every round contains a whole division loop.",
   "There are two loops, one inside the other: the while loop of the C++ and the loop of subtractions the compiler adds for %."
  ],
  "tryIt": [
   "Run 0 5 and 17 0. What happens in the second case, and which line of assembly decides it? (Hint: the divisor is 0.)",
   "Run 1071 462 and compare the instruction count with the gcd by subtraction."
  ],
  "tests": [
   {
    "in": "48 18",
    "out": [
     6
    ],
    "instr": 126
   },
   {
    "in": "7 7",
    "out": [
     7
    ],
    "instr": 42
   },
   {
    "in": "0 5",
    "out": [
     5
    ],
    "instr": 36
   },
   {
    "in": "17 0",
    "out": [
     17
    ],
    "instr": 7
   },
   {
    "in": "1071 462",
    "out": [
     21
    ],
    "instr": 175
   },
   {
    "in": "100 75",
    "out": [
     25
    ],
    "instr": 91
   },
   {
    "in": "13 17",
    "out": [
     1
    ],
    "instr": 175
   }
  ]
 },
 {
  "key": "fib",
  "cat": "classic",
  "name": "Fibonacci numbers",
  "blurb": "Fibonacci numbers: the variables move along one place per round.",
  "level": 2,
  "input": "10",
  "out": [
   0,
   1,
   1,
   2,
   3,
   5,
   8,
   13,
   21,
   34
  ],
  "src": "int n, a = 0, b = 1, t;\ncin >> n;\nfor (int i = 0; i < n; i++) {\n    cout << a << endl;\n    t = a + b;\n    a = b;\n    b = t;\n}\n",
  "story": "Prints the first N Fibonacci numbers. The variables a and b slide along the sequence: after each round a holds the next number.",
  "look": [
   "Assembly: t = a + b; a = b; b = t; is three assignments, nine instructions. The compiler never reuses a value from R across statements.",
   "Run: 152 instructions for N = 10; watch the values in the memory cells change in the diagram.",
   "The for header is the init  i = 0, the test  i < n  and the step  i++  from top to bottom of the loop."
  ],
  "tryIt": [
   "Run N = 0, 1 and 2.",
   "Change the program to print only the last number instead of all of them (move the cout)."
  ],
  "tests": [
   {
    "in": "10",
    "out": [
     0,
     1,
     1,
     2,
     3,
     5,
     8,
     13,
     21,
     34
    ],
    "instr": 152
   },
   {
    "in": "0",
    "out": [],
    "instr": 12
   },
   {
    "in": "1",
    "out": [
     0
    ],
    "instr": 26
   },
   {
    "in": "2",
    "out": [
     0,
     1
    ],
    "instr": 40
   },
   {
    "in": "25",
    "out": [
     0,
     1,
     1,
     2,
     3,
     5,
     8,
     13,
     21,
     34,
     55,
     89,
     144,
     233,
     377,
     610,
     987,
     1597,
     2584,
     4181,
     6765,
     10946,
     17711,
     28657,
     46368
    ],
    "instr": 362
   }
  ]
 },
 {
  "key": "prime",
  "cat": "classic",
  "name": "Is it prime? (trial division)",
  "blurb": "A multiplication inside the loop test, and && that stops early.",
  "level": 3,
  "input": "97",
  "out": [
   1
  ],
  "src": "int n, d = 2, prime = 1;\ncin >> n;\nif (n < 2) {\n    prime = 0;\n}\nwhile (d * d <= n && prime == 1) {\n    if (n % d == 0) {\n        prime = 0;\n    }\n    d++;\n}\ncout << prime << endl;\n",
  "story": "Trial division: n is prime if no d with d * d <= n divides it. The loop test contains a multiplication and an &&, so every round evaluates a multiply loop, then a comparison, then (only if still true) the second comparison.",
  "look": [
   "Assembly: the loop test d * d <= n is not a simple compare. The multiplication is evaluated first (its loop is inside the test), then a COMPARE.",
   "The && means the loop also stops as soon as prime becomes 0 (a divisor was found): two jumps leave the loop.",
   "Run: 1947 instructions for 97. Every % is a loop whose length is n / d, so the cost grows quickly for large primes: 7919 needs far more than the default step guard (raise it in the Run tab)."
  ],
  "tryIt": [
   "Run 97, 91 (7 * 13), 2, 1, 0 and -5.",
   "Remove the  && prime == 1  part: does the result change? Does the cost change?"
  ],
  "tests": [
   {
    "in": "97",
    "out": [
     1
    ],
    "instr": 1947
   },
   {
    "in": "91",
    "out": [
     0
    ],
    "instr": 1520
   },
   {
    "in": "2",
    "out": [
     1
    ],
    "instr": 38
   },
   {
    "in": "1",
    "out": [
     0
    ],
    "instr": 40
   },
   {
    "in": "0",
    "out": [
     0
    ],
    "instr": 40
   },
   {
    "in": "-5",
    "out": [
     0
    ],
    "instr": 40
   },
   {
    "in": "49",
    "out": [
     0
    ],
    "instr": 1048
   },
   {
    "in": "7919",
    "out": [
     1
    ],
    "instr": 256325
   }
  ]
 },
 {
  "key": "collatz",
  "cat": "classic",
  "name": "Collatz steps (3n + 1)",
  "blurb": "3n + 1: the machine keeps the program honest about cost.",
  "level": 3,
  "input": "6",
  "out": [
   8
  ],
  "src": "int n, steps = 0;\ncin >> n;\nwhile (n > 1) {\n    if (n % 2 == 0) {\n        n = n / 2;\n    } else {\n        n = 3 * n + 1;\n    }\n    steps++;\n}\ncout << steps << endl;\n",
  "story": "Counts how many steps the Collatz process (halve if even, otherwise triple and add one) needs to reach 1. Nobody has proved that it always stops, but every number tested does.",
  "look": [
   "Assembly: n % 2 == 0 is a remainder loop, n / 2 a division loop, 3 * n a multiply loop: three loops live inside the while loop.",
   "The multiplication by the constant 3 has no sign test, because the compiler knows 3 is positive.",
   "Run: 741 instructions for 6 (8 steps). The input 27 takes 111 steps and needs more instructions than the default step guard."
  ],
  "tryIt": [
   "Run 6, 7 and 1. How many steps does each need?",
   "Run 27 and watch the step guard stop the machine. Raise the guard in the Run tab and run it again."
  ],
  "tests": [
   {
    "in": "6",
    "out": [
     8
    ],
    "instr": 741
   },
   {
    "in": "1",
    "out": [
     0
    ],
    "instr": 9
   },
   {
    "in": "7",
    "out": [
     16
    ],
    "instr": 2675
   },
   {
    "in": "27",
    "out": [
     111
    ],
    "instr": 684838
   },
   {
    "in": "2",
    "out": [
     1
    ],
    "instr": 67
   },
   {
    "in": "97",
    "out": [
     118
    ],
    "instr": 697423
   }
  ]
 },
 {
  "key": "sentinel",
  "cat": "input",
  "name": "Sum until 0 (sentinel)",
  "blurb": "Read numbers until a special value ends the list.",
  "level": 2,
  "input": "4 8 15 16 23 42 0",
  "out": [
   108,
   6
  ],
  "src": "int x, sum = 0, count = 0;\ncin >> x;\nwhile (x != 0) {\n    sum += x;\n    count++;\n    cin >> x;\n}\ncout << sum << endl;\ncout << count << endl;\n",
  "story": "Adds up numbers typed in the input box until it meets 0 (the sentinel), then prints the sum and how many numbers there were. The first cin is outside the loop so that the loop test already has something to look at.",
  "look": [
   "Assembly: there are TWO IN instructions: the first before the loop, the second at the end of the loop body. IN takes the next number from the input queue (the Input block in the diagram).",
   "What happens without the final 0 in the input? The machine waits for more input: the run tab says so.",
   "Run: the number of rounds is decided by the data, not by the program: 65 instructions for the sample input."
  ],
  "tryIt": [
   "Remove the last 0 from the input and run. What does the machine report?",
   "Add a number after the 0 in the input: it is never read. Why?"
  ],
  "tests": [
   {
    "in": "4 8 15 16 23 42 0",
    "out": [
     108,
     6
    ],
    "instr": 65
   },
   {
    "in": "0",
    "out": [
     0,
     0
    ],
    "instr": 11
   },
   {
    "in": "5 0",
    "out": [
     5,
     1
    ],
    "instr": 20
   },
   {
    "in": "-3 3 0",
    "out": [
     0,
     2
    ],
    "instr": 29
   },
   {
    "in": "10 20 30 0",
    "out": [
     60,
     3
    ],
    "instr": 38
   }
  ]
 },
 {
  "key": "posneg",
  "cat": "input",
  "name": "Count positives and negatives",
  "blurb": "else if inside a counting loop.",
  "level": 2,
  "input": "5 3 -1 0 7 -2",
  "out": [
   2,
   2
  ],
  "src": "int n, x, pos = 0, neg = 0;\ncin >> n;\nfor (int i = 0; i < n; i++) {\n    cin >> x;\n    if (x > 0) {\n        pos++;\n    } else if (x < 0) {\n        neg++;\n    }\n}\ncout << pos << endl;\ncout << neg << endl;\n",
  "story": "Reads N numbers and counts how many are positive and how many negative; zeros are counted as neither. The else-if has no final else, so zeros fall through both tests.",
  "look": [
   "Assembly: x > 0 and x < 0 are two separate compare-and-jump pairs; the else-if is the second pair, reached only when the first test failed.",
   "pos++ and neg++ are single INCREMENT instructions.",
   "Tokens & tree: the else branch holds a second If node."
  ],
  "tryIt": [
   "Run 3 0 0 0 and then 4 -1 -2 -3 -4.",
   "Add a third counter zero for the zeros (an else branch)."
  ],
  "tests": [
   {
    "in": "5 3 -1 0 7 -2",
    "out": [
     2,
     2
    ],
    "instr": 85
   },
   {
    "in": "0",
    "out": [
     0,
     0
    ],
    "instr": 14
   },
   {
    "in": "3 0 0 0",
    "out": [
     0,
     0
    ],
    "instr": 59
   },
   {
    "in": "4 -1 -2 -3 -4",
    "out": [
     0,
     4
    ],
    "instr": 74
   },
   {
    "in": "1 9",
    "out": [
     1,
     0
    ],
    "instr": 27
   }
  ]
 },
 {
  "key": "minmax",
  "cat": "input",
  "name": "Smallest and largest of a list",
  "blurb": "Two independent if statements in a loop.",
  "level": 2,
  "input": "5 3 9 -2 7 4",
  "out": [
   -2,
   9
  ],
  "src": "int n, x, lo, hi;\ncin >> n;\ncin >> x;\nlo = x;\nhi = x;\nfor (int i = 1; i < n; i++) {\n    cin >> x;\n    if (x < lo) {\n        lo = x;\n    }\n    if (x > hi) {\n        hi = x;\n    }\n}\ncout << lo << endl;\ncout << hi << endl;\n",
  "story": "Finds the smallest and the largest of N numbers. The first number initialises both lo and hi; the loop starts at i = 1 because the first number has been read already. Assumes N >= 1.",
  "look": [
   "Assembly: the two ifs are independent: each has its own COMPARE and JUMP, and no else.",
   "The loop variable i starts at 1 (see the constant _1 in the data cells), not at 0.",
   "Run N = 0 and see what the machine does: it waits for input that never comes."
  ],
  "tryIt": [
   "Run 4 -1 -9 -3 -9 (the minimum appears twice).",
   "Change the second if into an else if: is the result still right for the input 1 5?"
  ],
  "tests": [
   {
    "in": "5 3 9 -2 7 4",
    "out": [
     -2,
     9
    ],
    "instr": 73
   },
   {
    "in": "1 5",
    "out": [
     5,
     5
    ],
    "instr": 15
   },
   {
    "in": "3 2 2 2",
    "out": [
     2,
     2
    ],
    "instr": 45
   },
   {
    "in": "4 -1 -9 -3 -9",
    "out": [
     -9,
     -1
    ],
    "instr": 58
   },
   {
    "in": "2 8 -8",
    "out": [
     -8,
     8
    ],
    "instr": 31
   }
  ]
 },
 {
  "key": "bank",
  "cat": "input",
  "name": "Bank balance simulation",
  "blurb": "A small simulation: deposit, withdraw, refuse.",
  "level": 3,
  "input": "100 1 50 2 30 2 500 0",
  "out": [
   150,
   120,
   -1,
   120
  ],
  "src": "int balance, op, amount;\ncin >> balance;\ncin >> op;\nwhile (op != 0) {\n    cin >> amount;\n    if (op == 1) {\n        balance += amount;\n    } else if (op == 2 && amount <= balance) {\n        balance -= amount;\n    } else {\n        cout << -1 << endl;\n    }\n    cout << balance << endl;\n    cin >> op;\n}\n",
  "story": "A bank balance reacts to commands: 1 amount deposits, 2 amount withdraws if there is enough money, 0 stops. A refused withdrawal prints -1 first. Negative numbers stand in for words, because the machine can only print numbers.",
  "look": [
   "Assembly: op == 2 && amount <= balance is two compare-and-jump pairs that both fall into the final else (the \"print -1\" part).",
   "The loop is a sentinel loop (see the example Sum until 0): a cin before the loop and another at the end.",
   "Tokens & tree: the nested If / else If / else inside the While."
  ],
  "tryIt": [
   "Run the sample, then try a withdrawal of exactly the balance, and an unknown command (3).",
   "Change  amount <= balance  into  amount < balance  and find an input that behaves differently."
  ],
  "tests": [
   {
    "in": "100 1 50 2 30 2 500 0",
    "out": [
     150,
     120,
     -1,
     120
    ],
    "instr": 57
   },
   {
    "in": "0 0",
    "out": [],
    "instr": 6
   },
   {
    "in": "50 2 50 0",
    "out": [
     0
    ],
    "instr": 26
   },
   {
    "in": "10 3 5 1 5 0",
    "out": [
     -1,
     10,
     15
    ],
    "instr": 34
   },
   {
    "in": "200 2 100 2 100 2 1 0",
    "out": [
     100,
     0,
     -1,
     0
    ],
    "instr": 63
   }
  ]
 },
 {
  "key": "fizz",
  "cat": "puzzles",
  "name": "FizzBuzz with numbers",
  "blurb": "Three % tests in an else-if chain; negative numbers stand for the words.",
  "level": 3,
  "input": "15",
  "out": [
   1,
   2,
   -3,
   4,
   -5,
   -3,
   7,
   8,
   -3,
   -5,
   11,
   -3,
   13,
   14,
   -15
  ],
  "src": "int n;\ncin >> n;\nfor (int i = 1; i <= n; i++) {\n    if (i % 15 == 0) {\n        cout << -15 << endl;\n    } else if (i % 3 == 0) {\n        cout << -3 << endl;\n    } else if (i % 5 == 0) {\n        cout << -5 << endl;\n    } else {\n        cout << i << endl;\n    }\n}\n",
  "story": "The famous FizzBuzz exercise. The machine cannot print text, so Fizz is printed as -3, Buzz as -5 and FizzBuzz as -15. The order of the else-if chain matters: i % 15 has to be tested first.",
  "look": [
   "Assembly: three separate remainder loops (one per %), each followed by a test against 0, chained by the else-if jumps.",
   "The program is 109 words long: every % is expanded in place.",
   "Run: 1139 instructions for N = 15."
  ],
  "tryIt": [
   "Move the  i % 15  test to the end of the chain: what is printed for 15? Why?",
   "Print 0 for multiples of 7 as well. How much longer does the machine code get?"
  ],
  "tests": [
   {
    "in": "15",
    "out": [
     1,
     2,
     -3,
     4,
     -5,
     -3,
     7,
     8,
     -3,
     -5,
     11,
     -3,
     13,
     14,
     -15
    ],
    "instr": 1139
   },
   {
    "in": "0",
    "out": [],
    "instr": 7
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 70
   },
   {
    "in": "3",
    "out": [
     1,
     2,
     -3
    ],
    "instr": 185
   },
   {
    "in": "5",
    "out": [
     1,
     2,
     -3,
     4,
     -5
    ],
    "instr": 333
   },
   {
    "in": "30",
    "out": [
     1,
     2,
     -3,
     4,
     -5,
     -3,
     7,
     8,
     -3,
     -5,
     11,
     -3,
     13,
     14,
     -15,
     16,
     17,
     -3,
     19,
     -5,
     -3,
     22,
     23,
     -3,
     -5,
     26,
     -3,
     28,
     29,
     -15
    ],
    "instr": 3076
   }
  ]
 },
 {
  "key": "triangle",
  "cat": "puzzles",
  "name": "Triangle of numbers (nested loops)",
  "blurb": "Nested for loops: a loop inside a loop.",
  "level": 2,
  "input": "4",
  "out": [
   1,
   2,
   2,
   3,
   3,
   3,
   4,
   4,
   4,
   4
  ],
  "src": "int n;\ncin >> n;\nfor (int row = 1; row <= n; row++) {\n    for (int col = 1; col <= row; col++) {\n        cout << row << endl;\n    }\n}\n",
  "story": "Row number r prints the number r exactly r times: 1, 2 2, 3 3 3, ... The inner loop depends on the outer one.",
  "look": [
   "Assembly: two pairs of labels, Ltop1 / Lexit1 for the outer loop and Ltop2 / Lexit2 for the inner one; the inner JUMP goes back to Ltop2 only.",
   "Both loop variables have their own cell: row and col.",
   "Run: 107 instructions for N = 4, ten numbers printed: the cost grows with the square of N."
  ],
  "tryIt": [
   "Run N = 6. How many numbers are printed? (1 + 2 + ... + 6)",
   "Change the inner test to col <= n so that every row has n entries."
  ],
  "tests": [
   {
    "in": "4",
    "out": [
     1,
     2,
     2,
     3,
     3,
     3,
     4,
     4,
     4,
     4
    ],
    "instr": 107
   },
   {
    "in": "0",
    "out": [],
    "instr": 7
   },
   {
    "in": "1",
    "out": [
     1
    ],
    "instr": 23
   },
   {
    "in": "6",
    "out": [
     1,
     2,
     2,
     3,
     3,
     3,
     4,
     4,
     4,
     4,
     5,
     5,
     5,
     5,
     5,
     6,
     6,
     6,
     6,
     6,
     6
    ],
    "instr": 193
   }
  ]
 },
 {
  "key": "guess",
  "cat": "puzzles",
  "name": "Guess the secret number",
  "blurb": "An endless loop that is left with break.",
  "level": 3,
  "input": "50 20 37",
  "out": [
   2,
   1,
   3
  ],
  "src": "int secret = 37, guess, tries = 0;\nfor (;;) {\n    cin >> guess;\n    tries++;\n    if (guess == secret) {\n        break;\n    }\n    if (guess < secret) {\n        cout << 1 << endl;\n    } else {\n        cout << 2 << endl;\n    }\n}\ncout << tries << endl;\n",
  "story": "A number guessing game against a fixed secret (37). The program answers 1 for \"too low\" and 2 for \"too high\", and prints the number of tries when the guess is right. for (;;) has no test, so only break gets out.",
  "look": [
   "Assembly: the loop has no test at the top. The only way out is the JUMP Lexit1 that the compiler wrote for break.",
   "if (guess == secret) { break; } becomes a compare, a jump over the break, and the break itself (an unconditional JUMP).",
   "Run: the number of rounds depends only on the input. If the secret never appears in the input the machine runs out of input and waits."
  ],
  "tryIt": [
   "Run 37 and then 50 20 37.",
   "Replace break by return 0; and see that it also ends the program (the compiler emits a JUMP to the final HALT)."
  ],
  "tests": [
   {
    "in": "50 20 37",
    "out": [
     2,
     1,
     3
    ],
    "instr": 34
   },
   {
    "in": "37",
    "out": [
     1
    ],
    "instr": 12
   },
   {
    "in": "10 99 40 36 37",
    "out": [
     1,
     2,
     2,
     1,
     5
    ],
    "instr": 56
   },
   {
    "in": "1 2 3 37 5",
    "out": [
     1,
     1,
     1,
     4
    ],
    "instr": 48
   }
  ]
 },
 {
  "key": "reverse",
  "cat": "puzzles",
  "name": "Reverse the digits of a number",
  "blurb": "% and / with * 10: take digits off one end, put them on the other.",
  "level": 3,
  "input": "123",
  "out": [
   321
  ],
  "src": "int n, rev = 0;\ncin >> n;\nwhile (n != 0) {\n    rev = rev * 10 + n % 10;\n    n = n / 10;\n}\ncout << rev << endl;\n",
  "story": "Reverses the digits of a number: 123 becomes 321. Each round takes the last digit with n % 10, appends it to rev with rev * 10 + ..., and drops it from n with n / 10.",
  "look": [
   "Assembly: three loops live inside the while: a multiply loop for rev * 10, a remainder loop and a divide loop. rev * 10 and n / 10 know their constant is positive and skip the sign test.",
   "The same value n is divided twice per round (once for % and once for /): the compiler does not notice that one division would give both.",
   "Run: 548 instructions for 123."
  ],
  "tryIt": [
   "Run 1200: the answer is 21. Where did the zeros go?",
   "Run -45. In C++ the remainder takes the sign of the dividend, so the answer is -54."
  ],
  "tests": [
   {
    "in": "123",
    "out": [
     321
    ],
    "instr": 548
   },
   {
    "in": "1200",
    "out": [
     21
    ],
    "instr": 2463
   },
   {
    "in": "0",
    "out": [
     0
    ],
    "instr": 8
   },
   {
    "in": "-45",
    "out": [
     -54
    ],
    "instr": 330
   },
   {
    "in": "7",
    "out": [
     7
    ],
    "instr": 123
   },
   {
    "in": "98765",
    "out": [
     56789
    ],
    "instr": 165133
   }
  ]
 }
];
  var api = { CATEGORIES: CATEGORIES, EXAMPLES: EXAMPLES, LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { global.TcExamples = api; if (global.TinyCompiler) { global.TinyCompiler.EXAMPLES = EXAMPLES; global.TinyCompiler.CATEGORIES = CATEGORIES; global.TinyCompiler.LEVELS = LEVELS; } }
})(typeof window !== 'undefined' ? window : this);
