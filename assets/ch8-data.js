/* Chapter 8 — Assembly & Compilers
   Quiz + exercises data, rendered by assets/course.js. Numbers in solutions checked with assets/vn-machine.js and assets/tiny-compiler.js. */
window.CHAPTER_DATA = {
  id: 8,

  quiz: [
    { q: 'What is a machine-language instruction made of?',
      opts: [
        'A line of English text that the CPU reads word by word and interprets as it runs',
        'An opcode for the operation, plus address fields for the cells it works on',
        'A name chosen by the programmer, followed by a value that the compiler looks up later',
        'A file name and a line number pointing back to the C++ statement that produced it'],
      a: 1,
      why: 'Binary opcode + address field(s): the only thing the CPU can execute directly.' },

    { q: 'In the slides, A = B + C with A, B, C in cells 100, 150, 151 becomes LOAD 150, ADD 151, STORE 100. What does ADD 151 do?',
      opts: [
        'It adds the content of cell 151 to R and leaves the sum in R',
        'It adds the number 151 to the value that is currently in R, leaving the sum in R',
        'It stores R + 151 into cell 100, which is the address of the variable A',
        'It adds the content of cell 151 to the content of cell 150 and keeps the sum'],
      a: 0,
      why: 'ADD X means R + CON(X) → R. It adds the content of cell 151 (C), not the number 151.' },

    { q: 'Compared with machine code, what does assembly language add?',
      opts: [
        'Mnemonics instead of binary opcodes, and names instead of numeric addresses',
        'Loops and if-statements that the processor executes in a single instruction',
        'Independence from the processor, so the same file runs on x86 and on ARM',
        'Automatic checking that the program computes what the programmer intended'],
      a: 0,
      why: 'Assembly is a symbolic form of the same instructions, still tied to one ISA. Control structures and portability come only with high-level languages.' },

    { q: 'Which statement about the mapping from assembly to machine instructions is the most accurate?',
      opts: [
        'Each assembly line becomes dozens of machine instructions',
        'There is no relation; the assembler invents its own machine code each time',
        'It is almost one-to-one, though macros and pseudo-instructions can break that',
        'It is exactly many-to-one: several machine instructions become one assembly line'],
      a: 2,
      why: 'Assembly mirrors the machine instructions almost one-to-one. In the lab, JUMPGE (a pseudo-instruction) becomes two real jumps.' },

    { q: 'What is the assembler?',
      opts: [
        'A program that translates assembly text into binary machine code',
        'The circuit inside the CPU that carries out additions and comparisons',
        'A tool that joins several object files with library code into one program',
        'The program that copies an executable into memory and starts it'],
      a: 0,
      why: 'The assembler turns mnemonics and labels into opcodes and addresses. Joining files is the linker, and loading is done by the operating system.' },

    { q: 'What is the compiler\'s role (textbook review question 16)?',
      opts: [
        'It binds the program to memory addresses at the moment the user starts it',
        'It only removes comments and spaces from the source file',
        'It translates a high-level program into assembly or machine code',
        'It runs the program line by line and prints the result of each line'],
      a: 2,
      why: 'The compiler translates the whole high-level program into assembly or machine code; the assembler then makes binary of the assembly. Running line by line describes an interpreter.' },

    { q: 'After LOAD A and COMPARE B, which flag is 1 when A is larger than B (slide 34 semantics)?',
      opts: [
        'GT',
        'LT',
        'EQ',
        'None; COMPARE alone sets no flags'],
      a: 1,
      why: 'COMPARE X sets GT when the content of X (here B) is greater than R (A). If B < A the cell is smaller than R, so LT = 1.' },

    { q: 'How does the machine implement if (a > b) … else … ?',
      opts: [
        'COMPARE sets condition codes, then a conditional jump chooses between the two blocks',
        'A single IF instruction that runs one of two blocks',
        'The ALU evaluates both blocks and the control unit discards one of the two results',
        'The assembler decides at translation time, so there is nothing left to decide when running'],
      a: 0,
      why: 'There are no if/else instructions: a compare, one conditional jump, and an unconditional JUMP over the else-part.' },

    { q: 'In the max program, why is there a JUMP done after the else-part (OUT B)?',
      opts: [
        'To restart the program from the beginning, so that it asks for new input',
        'To make the PC point to the data cells where A and B are kept',
        'To set all three condition codes back to zero for the next comparison',
        'To skip the then-part (OUT A) that sits right after it in memory'],
      a: 3,
      why: 'Instructions run in sequence. Without the JUMP the machine would continue into OUT A and print both numbers.' },

    { q: 'Which pattern implements a while loop?',
      opts: [
        'A test at the top that jumps out when the condition fails, and a JUMP back at the end',
        'A single instruction that repeats the next instruction a fixed number of times, then stops',
        'A test at the bottom that jumps forward past the end of the program on success',
        'A copy of the loop body written out once for every iteration the loop will need'],
      a: 0,
      why: 'Test, conditional jump out, body, JUMP back. The loop is a backwards jump (S5).' },

    { q: 'Trace: R = 6, then SUBTRACT X where cell X holds 4. What does R hold afterwards?',
      opts: [
        '−2',
        '10',
        '2',
        '4'],
      a: 2,
      why: 'SUBTRACT X means R − CON(X) → R = 6 − 4 = 2. (The operands are not reversible: 4 − 6 would be −2.)' },

    { q: 'Which of these is the result of lexing?',
      opts: [
        'A list of tokens such as keywords, names, numbers and operators',
        'A tree that shows how the statements and expressions are nested inside each other',
        'A file of binary machine code for one particular target processor family',
        'The output that the finished program would print when it is run'],
      a: 0,
      why: 'Lexing cuts the text into tokens; parsing then builds the tree; code generation emits instructions.' },

    { q: 'A compiler stops with “expected ; at the end of the declaration”. In which stage was the error found, and does a program get produced?',
      opts: [
        'At run time; a program exists but it crashes when it reaches that line',
        'During parsing, before any code is generated; no program is produced',
        'During linking; the executable is produced but it is incomplete',
        'During loading; the operating system refuses to start the program'],
      a: 1,
      why: 'Syntax errors are compile-time errors found while parsing. The compiler writes no program at all.' },

    { q: 'What does the linker do?',
      opts: [
        'Translates each C++ statement into assembly instructions for the CPU',
        'Replaces mnemonics such as ADD and LOAD with their binary opcodes',
        'Combines object files and libraries into one executable',
        'Copies the program into RAM and sets the program counter'],
      a: 2,
      why: 'The linker joins your code with library code (where cout lives). Translating is the compiler, opcodes are the assembler, loading is the OS.' },

    { q: 'A program compiles, but the build fails with “undefined reference to sqrt_helper”. Which stage reported it?',
      opts: [
        'The lexer, because sqrt_helper is not a valid token in a C++ source file',
        'The CPU, when it hit an unknown opcode while the program was running',
        'The assembler, because it does not know the mnemonic sqrt_helper',
        'The linker, because no object file or library provides that function'],
      a: 3,
      why: 'Calling a function is fine for the compiler as long as it is declared; the linker then fails to find its code.' },

    { q: 'Which statement about machine code is true?',
      opts: [
        'It is portable: exactly the same bytes run on every kind of processor',
        'It is always generated directly from assembly by the preprocessor',
        'It is human readable, because every byte is an ASCII character',
        'It belongs to one ISA, so x86 and ARM machine code differ'],
      a: 3,
      why: 'Machine code is defined by the ISA, so x86 machine code does not run on ARM. That is why programs are recompiled for each architecture.' },

    { q: 'The same C++ function compiled for x86-64 needs 24 bytes, but for ARM64 40 bytes. What explains the difference in this example?',
      opts: [
        'x86 instructions vary in length and can read memory; ARM instructions are fixed 4-byte words',
        'ARM has far fewer registers than x86, so it needs extra instructions to shuffle values around',
        'The ARM compiler is older and, unlike the x86 compiler, performs no optimisation at all',
        'x86 machine code is stored in a compressed form that is unpacked when it runs'],
      a: 0,
      why: 'CISC (x86) has variable-length, dense instructions with memory operands; RISC (ARM) has fixed 4-byte instructions and load–store, so the same function takes more, simpler instructions.' },

    { q: 'With optimisation on (-O2), the compiler turned sum10() into movl $55, %eax. What does that show?',
      opts: [
        'The compiler made a mistake because loops must always remain loops',
        'The compiler can work out a program\'s answer ahead of time',
        'The processor has a special instruction that adds the numbers 1 to 10',
        'The optimiser deleted the function, so it will return a random value'],
      a: 1,
      why: 'This is constant folding: 1 + 2 + … + 10 = 55 is known at compile time, so no loop remains at run time.' },

    { q: 'In the Tiny compiler lab, why do the constants 0 and 1 get memory cells of their own?',
      opts: [
        'Constants are always kept inside the ALU, never in memory, in real programs',
        'The compiler is not allowed to use the numbers 0 and 1 inside the program',
        'The toy ISA has no immediate operands: every operand is a cell address',
        'Every number in a C++ program is stored twice so that errors can be detected'],
      a: 2,
      why: 'In slide 34\'s ISA every operand is the address of a cell, so a constant has to sit in memory. Real ISAs usually put small constants inside the instruction.' },

    { q: 'After compiling and running a program, the lab shows “Same output”. What have we established?',
      opts: [
        'The compiler is proven correct for every possible program that it might compile',
        'The program is as fast as an optimised real compiler would make it',
        'For that input, the compiled program printed what the C++ meaning predicts',
        'The program contains no bugs, whatever input it is given'],
      a: 2,
      why: 'Matching output on one input is evidence, not proof. It says nothing about speed or other inputs.' },

    { q: 'Textbook Table 1.5: which statement about high-level languages versus assembly is right?',
      opts: [
        'High-level languages give more direct control of the hardware, but are less portable than assembly',
        'Assembly is more readable than a high-level language and is also faster to develop in',
        'There is no difference in portability, only in the file extension',
        'High-level languages are more portable and faster to develop in, but give less hardware control'],
      a: 3,
      why: 'The trade-off: abstraction and portability on one side, hardware control on the other. Assembly gives complete control and none of the portability.' },

    { q: 'Where is assembly language still commonly used today?',
      opts: [
        'Everyday web applications and spreadsheets',
        'Device drivers, firmware, boot code and interrupt handlers',
        'Only in museums and teaching, since compilers replaced it entirely',
        'Data-analysis scripts written by non-programmers'],
      a: 1,
      why: 'Where code must touch specific hardware registers or be tiny and exact — drivers, firmware, bootloaders, ISRs — and in a few hand-tuned inner loops.' },

    { q: 'A well-known claim from the textbook: a modern optimising compiler (GCC, LLVM) often produces code …',
      opts: [
        'That is always slower than hand-written assembly, which is why kernels are written entirely in assembly',
        'Equal to or faster than hand-written assembly, in many situations',
        'That is correct only if the programmer also writes the assembler',
        'That cannot run unless an interpreter is installed on the machine'],
      a: 1,
      why: 'Compilers know the target well and apply many optimisations, so for most code hand-written assembly does not win.' },

    { q: 'You write ARM assembly for a phone and now want to run the same program on a PC with an x86 processor. What is needed?',
      opts: [
        'Nothing at all, because assembly language is portable between all processors',
        'Only to rename the file from .arm to .x86 and then run it unchanged on the PC',
        'Only to link it again with the standard library that belongs to the x86 PC',
        'To rewrite it for the x86 instruction set, or recompile a higher-level source'],
      a: 3,
      why: 'Assembly is tied to an ISA. A C++ source can be recompiled for x86; ARM assembly would have to be rewritten.' },

    { q: 'The Linux kernel is mostly C with small pieces of assembly. What does that illustrate?',
      opts: [
        'That C code cannot be turned into machine code without hand-written assembly',
        'That assembly is always faster than C, which is why kernels avoid C wherever they possibly can',
        'That a kernel is built without any assembler, since C makes it unnecessary',
        'That large systems combine levels, using assembly only where hardware access is needed'],
      a: 3,
      why: 'Real systems mix levels: a high-level language for most of the code and assembly for the few parts that need special registers or exact control.' },

    { q: 'Why can a compiler exist at all, from the Von Neumann point of view (Chapter 7)?',
      opts: [
        'Because the CPU contains a built-in translator for every programming language ever made',
        'Because programs and data share memory: source and machine code are both just data',
        'Because source code is stored in the CPU\'s registers',
        'Because the operating system forbids the CPU from running anything but compiled code'],
      a: 1,
      why: 'The stored-program idea: instructions are numbers like any others, so a compiler can produce them as its output and the CPU can later execute them.' }
  ],

  exercises: [
    { type: 'text', title: '1 · Compile a loop in the lab',
      brief: 'In the <strong>Tiny compiler</strong> lab load <em>Sum of 1..N (while loop)</em> with input <code>5</code> and press <em>Compile</em>. Go through all five stages. (a) How many tokens and how many lines does the source have? (b) How many instruction words does the assembly produce, and how wide is a machine word? (c) Which C++ line is the loop test generated from? (d) Give the machine word, in binary and in hex, of the first instruction and of <code>HALT</code>. (e) Run it: what is printed, and how many instructions are executed?',
      solutionText: '(a) 41 tokens on 7 source lines.\n(b) 17 instruction words (cells 0-16); the program needs 22 cells in all (5 data cells: n, sum, i and the constants 0 and 1), so the compiler picks a 32-cell machine. 32 cells need 5 address bits, so a word is 4 + 5 = 9 bits.\n(c) The test (LOAD n, COMPARE i, JUMPGT Lexit1) comes from line 3, while (i <= n) {.\n(d) The first instruction is LOAD _0 (the constant 0 sits in cell 20): 0000 10100 = hex 014. HALT is opcode 1111 with address 0: 1111 00000 = hex 1E0 (decimal 480).\n(e) It prints 15, after 60 executed instructions.' },

    { type: 'text', title: '2 · Translate if and if–else (textbook problem 1.11.5)',
      brief: 'Use the textbook\'s jump instructions: <code>JE0 a, L</code> (jump to L if a = 0), <code>JG0</code> (a &gt; 0), <code>JL0</code> (a &lt; 0), <code>JLE0</code> (a ≤ 0) and <code>JMP L</code>. Assume S1 and S2 are already valid instruction sequences. Write assembly for: (a) <code>if (a &gt; 0) S1;</code> (b) <code>if (a &lt;= 0) S1; else S2;</code>',
      solutionText: '(a) Jump over S1 when the condition is FALSE (a <= 0):\n        JLE0 a, Lend\n        S1\nLend:\n\n(b) Jump to the else-part when the condition is false (a > 0), and jump over the else-part at the end of the then-part:\n        JG0  a, Lelse\n        S1\n        JMP  Lend\nLelse:  S2\nLend:\n\nThe pattern: test the opposite of the condition, jump past the then-part. Both translations were checked with a small simulator for a = -3 ... 3.' },

    { type: 'text', title: '3 · Translate loops with break and continue (textbook problem 1.11.5)',
      brief: 'With the same jump instructions, write assembly for: (a) <code>while (a != 0) { if (a &gt; 0) break; else S; }</code> (b) <code>do { if (a == 0) continue; else S; } while (a &lt; 0);</code> (c) <code>repeat if (a &gt;= 0) S; until (a &gt; 0)</code> (repeat–until runs the body first and stops when the condition becomes <em>true</em>).',
      solutionText: '(a)\nLtop:   JE0  a, Lend      ; loop condition a != 0 is false: leave\n        JG0  a, Lend      ; break\n        S                 ; else-part\n        JMP  Ltop\nLend:\n\n(b) continue jumps to the loop condition, not to the top:\nLtop:   JE0  a, Lcond     ; continue\n        S\nLcond:  JL0  a, Ltop      ; while (a < 0) repeat\n\n(c)\nLtop:   JL0  a, Lcheck    ; if (a >= 0) is false (a < 0): skip S\n        S\nLcheck: JG0  a, Lend      ; until (a > 0): stop when true\n        JMP  Ltop\nLend:\n\nAll three were checked against a direct simulation of the C++ semantics for a = -3 ... 3 (with S taken as a = a + 1).' },

    { type: 'text', title: '4 · Read real compiler output',
      brief: 'Below is what <code>clang -S -O0</code> produced for <code>int add(int b, int c) { int a = b + c; return a; }</code> on x86-64: <pre>pushq %rbp\nmovq %rsp, %rbp\nmovl %edi, -4(%rbp)\nmovl %esi, -8(%rbp)\nmovl -4(%rbp), %eax\naddl -8(%rbp), %eax\nmovl %eax, -12(%rbp)\nmovl -12(%rbp), %eax\npopq %rbp\nretq</pre> (a) Which instruction performs the addition, and where do b and c come from? (b) Where do a, b and c live? (c) Where does the return value travel? (d) Which program turned the C++ into this text, and which program would turn this text into bytes?',
      solutionText: '(a) addl -8(%rbp), %eax adds c to the value in eax. The arguments arrive in registers edi (b) and esi (c); the first two movl instructions copy them to memory.\n(b) Each variable has its own memory slot below the frame pointer: b at -4(%rbp), c at -8(%rbp), a at -12(%rbp). At -O0 the compiler keeps everything in memory.\n(c) In register eax. The last movl copies a into eax, popq restores the frame pointer, retq returns to the caller.\n(d) The compiler produced the assembly text; the assembler turns it into bytes (here 24 bytes: 55 48 89 e5 89 7d fc 89 75 f8 8b 45 fc 03 45 f8 89 45 f4 8b 45 f4 5d c3). Notice that it is the compiler, not the assembler, that decided to keep a in memory and reload it.' },

    { type: 'text', title: '5 · Errors and endless loops in the lab',
      brief: 'In the Tiny compiler (a) compile each of these and write down what the compiler says: <code>int x = 5</code> followed on the next line by <code>cout &lt;&lt; x;</code> · <code>int x;</code> then <code>y = 3;</code> · <code>int x = 3;</code> then <code>x = x ^ 2;</code>. (b) Load the <em>Greatest common divisor</em> preset and run it with <code>48 18</code>, then <code>7 7</code>, then <code>0 5</code>. Report the output and the number of executed instructions each time. Explain the last result.',
      solutionText: '(a) 1: "expected \';\' at the end of the declaration but found \'cout\'" — reported on line 1, column 10, right after the 5 where the semicolon is missing (the lab underlines that spot and says: every statement ends with a semicolon). 2: "variable \'y\' is used before it is declared" (line 2, with a hint to declare it first). 3: "the tiny compiler does not understand the character \'^\'" (line 2, column 7: powers and bit operations are outside the subset; the hint suggests a multiplication loop). In all three cases no machine code is produced: compile-time errors.\n(b) 48 18 prints 6 after 53 instructions. 7 7 prints 7 after 7 instructions (the loop is never entered). 0 5 never finishes: the lab stops with the step guard after 20,000 instructions and prints nothing. With a = 0 and b = 5 the program does b = b - a forever, so b never changes and a != b stays true. The compiler translated the program faithfully; the bug is in the algorithm (this version of Euclid assumes both numbers are positive).' },

    { type: 'text', title: '6 · Write and compile your own program',
      brief: 'In the Tiny compiler, write a C++ program in the subset that reads two numbers <code>a</code> and <code>b</code> and prints their product by repeated addition (assume b ≥ 0). Compile it, then run it with <code>6 7</code>, <code>5 0</code> and <code>0 9</code>. How many instructions does <code>6 7</code> take? Why does <code>0 9</code> take far more instructions than <code>5 0</code>?',
      solutionText: 'One solution:\n  int a, b, p = 0;\n  cin >> a >> b;\n  while (b > 0) {\n      p = p + a;\n      b = b - 1;\n  }\n  cout << p << endl;\n\n(The compiler produces 17 instruction words.) Results: 6 7 prints 42 after 87 instructions; 5 0 prints 0 after 10 instructions; 0 9 prints 0 after 109 instructions.\nThe cost is set by b, the number of loop iterations, not by the values being added: with b = 0 the loop body never runs (10 instructions: setup, one test, print, halt), with b = 9 it runs nine times, even though adding 0 changes nothing. Each iteration costs 11 or 12 instructions, which is why a hardware multiply instruction exists in real CPUs. (The lab can now do this for you: p = a * b; is compiled into just such a loop; exercise 8 reads the similar routine for %.)' },

    { type: 'text', title: '7 · Compile a for loop and read how it works',
      brief: 'In the <strong>Tiny compiler</strong> pick <em>Sum of 1..N (for loop)</em> (category Loops) with input <code>5</code> and press <em>Compile</em>; then do the same with <em>Sum of 1..N (while loop)</em>. (a) How many tokens does the for version have, and how many instruction words do the for and while versions produce? (b) Which instruction does <code>i++</code> become, and what did <code>i = i + 1</code> become in the while version? (c) The last jump of the for version: at which cell is it, and to which cell does it go? Where does the <code>JUMPGT</code> go when the test fails? (d) How many instructions does each version execute for N = 5?',
      solutionText: '(a) The for version has 37 tokens and 15 instruction words (cells 0-14); the while version has 41 tokens and 17 words.\n(b) i++ becomes the single instruction INCREMENT i (cell 11). In the while version i = i + 1 is three instructions: LOAD i, ADD _1, STORE i (cells 11-13). That is the whole difference in length: two words.\n(c) The loop ends with JUMP Ltop1 at cell 12. Ltop1 is cell 5, the first instruction of the test (LOAD n, COMPARE i, JUMPGT Lexit1): a loop is a backward jump. When the test fails, JUMPGT (cell 7) goes forward to Lexit1, cell 13, which is OUT sum. The initialisation i = 1 (cells 3-4) sits before Ltop1, so it runs only once; the step (INCREMENT) sits at the bottom, before the jump back.\n(d) The for version executes 50 instructions and prints 15; the while version executes 60 and also prints 15. Each round costs 8 instructions in the for version and 10 in the while version.' },

    { type: 'text', title: '8 · Use % and read the routine the compiler writes',
      brief: 'In the Tiny compiler type the three lines <code>int n;</code> / <code>cin &gt;&gt; n;</code> / <code>cout &lt;&lt; n % 10 &lt;&lt; endl;</code> and press <em>Compile</em>. (a) How many instruction words does the program have, and how many of them come from line 3 (see the <em>Assembly</em> tab)? (b) Find the backward jump of the routine: at which cell is it and where does it go? (c) Run it with <code>1234</code>, <code>-1234</code> and <code>0</code>: what is printed and how many instructions are executed? (d) Run it with <code>99999</code> and explain what the lab reports. (e) Which data cell holds the remainder at the end?',
      solutionText: '(a) 31 instruction words (cells 0-30); 29 of them (cells 1-29) come from line 3: the lecture ISA has no divide or modulo instruction, so the compiler expands the % into a loop of subtractions (cells 1-27) followed by STORE _t / OUT _t. Cell 0 is the IN, cell 30 the HALT. The word count includes JUMPGE twice, because the assembler turns that pseudo-instruction into two real jumps.\n(b) JUMP Ldiv1 at cell 20 goes back to cell 14 (LOAD _db). Cells 14-16 test whether what is left is smaller than the divisor (JUMPLT Ldivx1 leaves the loop); cells 17-19 subtract the divisor once more.\n(c) 1234 prints 4 after 880 instructions; -1234 prints -4 after 888 (C++ also gives -4: the remainder takes the sign of the dividend, which is what cells 10-13 and 24-26 take care of); 0 prints 0 after only 20 instructions. The cost is about 7 instructions for each subtraction of 10, so it grows with the size of n.\n(d) 99999 needs 9999 subtractions, about 70,000 instructions, more than the default step guard of 20,000, so the machine stops with the step guard message and prints nothing. Raising the step guard on the Run tab to 200,000 lets it finish and print 9.\n(e) The remainder is left in the cell _da (cell 35 in the 64-cell machine of this program); the final LOAD _da copies it into R, and STORE _t / OUT _t print it.' }
  ]
};
