/* Chapter 7 — Von Neumann Architecture
   Quiz + exercises data, rendered by assets/course.js. All trace answers checked against assets/vn-machine.js. */
window.CHAPTER_DATA = {
  id: 7,

  quiz: [
    { q: 'Which four subsystems make up the Von Neumann model?',
      opts: [
        'Memory, hard disk, graphics card, and a network adapter',
        'CPU, keyboard, monitor, and the operating system software',
        'Registers, cache, RAM, and the instruction pipeline circuits',
        'Memory, ALU, control unit, and input/output'],
      a: 3,
      why: 'Memory, the arithmetic/logic unit, the control unit and the I/O system. ALU plus control unit together form the CPU.' },

    { q: 'What does the “stored-program concept” say?',
      opts: [
        'Every program must be saved to a hard disk before the computer is allowed to run it',
        'The CPU keeps a private copy of the program in registers so memory is not needed',
        'Programs are stored as source code and translated by the hardware as each line runs',
        'Instructions and data are both kept as binary numbers in one addressable memory'],
      a: 3,
      why: 'Program and data share one memory, so a program can be loaded, changed and executed without rewiring the machine.' },

    { q: 'ENIAC took days to reprogram, while a stored-program computer does not. Why?',
      opts: [
        'A new program is just new numbers loaded into memory; no cables or switches change',
        'Stored-program computers have far more vacuum tubes, so they can hold every program ever written',
        'The program is burned permanently into the ALU, so changing it is never needed again',
        'Stored-program machines run each instruction so fast that reprogramming time stops mattering'],
      a: 0,
      why: 'On ENIAC the program was in the wiring. When it is in memory, loading a new program is just writing numbers into cells.' },

    { q: 'Which layer is the interface between hardware and software — the list of instructions the machine understands?',
      opts: [
        'The instruction set architecture (ISA)',
        'The microarchitecture, because it decides how registers are wired',
        'The operating system, because it starts every program',
        'The digital-circuit layer, because gates define every operation'],
      a: 0,
      why: 'The ISA defines instructions, registers, data types and addressing — the contract that software relies on and hardware implements.' },

    { q: 'Intel\'s Skylake and AMD\'s Zen both run x86 programs. What does that show?',
      opts: [
        'Intel and AMD copy each other\'s circuits exactly, transistor by transistor',
        'x86 programs are translated into a different machine language for each vendor',
        'One ISA can be implemented by several different microarchitectures',
        'Microarchitecture is part of the ISA, so software must know which chip it runs on'],
      a: 2,
      why: 'The ISA is the contract; each vendor builds its own internal design (microarchitecture) that honours it, with its own speed and power.' },

    { q: 'What is the job of the program counter (PC)?',
      opts: [
        'It counts how many instructions the program contains in total',
        'It holds the address of the next instruction to fetch',
        'It stores the instruction that is currently being decoded',
        'It records whether the last comparison was greater, equal or less'],
      a: 1,
      why: 'The PC points to the next instruction. After each fetch it moves on by one; a jump overwrites it.' },

    { q: 'What does the instruction register (IR) hold?',
      opts: [
        'The memory address of the next instruction that will be fetched from memory',
        'The result of the most recent arithmetic operation done by the ALU circuits',
        'The values the user has typed in at the keyboard since the program started',
        'The instruction just fetched, held while it is decoded and executed'],
      a: 3,
      why: 'IR keeps the current instruction stable during decode and execute. PC, not IR, holds addresses of future instructions.' },

    { q: 'Which component performs additions and comparisons?',
      opts: [
        'The program counter, because it increments',
        'The memory address register, which holds numbers',
        'The ALU',
        'The instruction decoder, which reads the opcode'],
      a: 2,
      why: 'The ALU (arithmetic/logic unit) does the arithmetic and logic operations. The control unit only directs; it does no calculating.' },

    { q: 'What is stored in the condition codes (GT, EQ, LT), and what are they for?',
      opts: [
        'The outcome of the last comparison, checked by later conditional jumps',
        'The memory address of the last jump, so the CPU can return to it later',
        'The error codes that report when a program uses too much memory',
        'The three most recent values loaded into the accumulator register R'],
      a: 0,
      why: 'COMPARE sets the flags. A later JUMPGT, JUMPEQ, … looks at them — the hardware form of an if-condition.' },

    { q: 'A memory has 12-bit addresses and 8-bit cells. How many cells can it hold, and how many bytes is that?',
      opts: [
        '4,096 cells = 4 KB',
        '1,024 cells = 1 KB',
        '12 cells = 12 bytes',
        '8,192 cells = 8 KB'],
      a: 0,
      why: '2^12 = 4,096 cells, each one byte, so 4,096 bytes = 4 KB. The cell width does not change the number of cells.' },

    { q: 'How many address bits are needed to address 1 GB of byte-sized cells?',
      opts: [
        '10 bits',
        '20 bits',
        '30 bits',
        '32 bits'],
      a: 2,
      why: '1 GB = 2^30 bytes, so 30 bits of address are enough. 32 bits would address 4 GB.' },

    { q: 'What is the difference between a memory cell\'s address and its content?',
      opts: [
        'The address says where the cell is; the content is the value stored there',
        'They are the same number, shown once in decimal and once in binary notation by the CPU',
        'The content says where the cell is; the address is the value stored there',
        'Addresses live inside the CPU, while the contents live only on the hard disk'],
      a: 0,
      why: 'Address = location (0, 1, 2, …); content = what is stored there. “Fetch(address)” returns the content.' },

    { q: 'Which statement about the two memory operations is correct?',
      opts: [
        'Fetch copies the value and leaves it; store overwrites the old value',
        'Both fetch and store erase the old value of the cell they are applied to',
        'Fetch is destructive and store is non-destructive, so a read loses its data',
        'Fetch and store both leave the cell untouched, because only the MDR ever changes'],
      a: 0,
      why: 'Reading is a copy — the cell keeps its value. Writing replaces the old value, which is gone.' },

    { q: 'To read the cell at address 40, the CPU first puts 40 in …',
      opts: [
        'the memory data register (MDR), where the value will arrive',
        'the program counter (PC), which always holds the current address',
        'the memory address register (MAR)',
        'the accumulator (R), so the ALU can use the address'],
      a: 2,
      why: 'The address always goes into MAR; the fetch signal then makes the memory copy the cell into MDR.' },

    { q: 'Order the memory levels from fastest and smallest to slowest and largest.',
      opts: [
        'Cache, registers, RAM, SSD/HDD',
        'Registers, RAM, cache, SSD/HDD',
        'RAM, cache, registers, SSD/HDD',
        'Registers, cache, RAM, SSD/HDD'],
      a: 3,
      why: 'Registers sit on the CPU (under 1 ns), then the L1/L2/L3 caches, then RAM (about 50–80 ns), then SSD and HDD (milliseconds).' },

    { q: 'A loop adds up the elements of an array one after another. Which kinds of locality does it show?',
      opts: [
        'Neither one, because memory accesses made inside a loop are unpredictable',
        'Both: reused variables (temporal) and neighbouring elements (spatial)',
        'Only spatial locality, because the neighbouring elements are used one after another',
        'Only temporal locality, because the loop reuses the same sum and index variables'],
      a: 1,
      why: 'The sum and the index are touched again and again (temporal); the array elements sit side by side, so loading a whole cache block pays off (spatial).' },

    { q: 'RAM answers in about 50 ns; a hard disk in about 10 ms. Roughly how many times slower is the disk?',
      opts: [
        '200 times',
        '200,000 times',
        '2,000 times',
        '2 million times'],
      a: 1,
      why: '10 ms = 10,000,000 ns, and 10,000,000 ÷ 50 = 200,000.' },

    { q: 'Why does a computer use an I/O controller with interrupts?',
      opts: [
        'So the CPU can work while a slow device transfers data, and be told when it ends',
        'So that every device can write directly into the CPU\'s registers without any buffer',
        'Because the ALU is unable to read numbers that come from outside the machine',
        'To make the hard disk run at the same speed as RAM by slowing the RAM down'],
      a: 0,
      why: 'The controller runs the device and raises an interrupt on completion, so the CPU is not stuck waiting for 200,000× slower hardware.' },

    { q: 'Which is the correct order of the register transfers in the fetch phase?',
      opts: [
        'MDR → IR, then PC → MAR, then fetch signal, then PC + 1 → PC',
        'IR → decoder, then PC → MAR, then MDR → IR, then fetch signal',
        'PC + 1 → PC, then MAR → PC, then fetch signal, then IR → MDR',
        'PC → MAR, fetch signal (memory → MDR), MDR → IR, PC + 1 → PC'],
      a: 3,
      why: 'Address to MAR, memory delivers the word into MDR, MDR is copied to IR, and PC is advanced so it already points at the next instruction.' },

    { q: 'What does a JUMP X instruction do during its execute phase?',
      opts: [
        'It fetches the value in cell X and adds it to R',
        'It writes X into the PC, so the next fetch comes from cell X',
        'It stops the machine until the user types address X',
        'It copies PC into cell X, so the program can return there later'],
      a: 1,
      why: 'Execute for JUMP is just “IR.address → PC”. The next fetch then reads from X; a conditional jump does this only when its flag is set.' },

    { q: 'During the execute phase of LOAD 7, which registers receive new values?',
      opts: [
        'Only R, which is loaded directly from cell 7',
        'IR and PC, because LOAD fetches a new instruction',
        'MAR (7), then MDR (content of cell 7), then R',
        'MAR and the cell at address 7, which is overwritten'],
      a: 2,
      why: 'The address 7 goes to MAR, the fetch signal copies cell 7 into MDR, and MDR is copied into R. Cell 7 itself is unchanged.' },

    { q: 'R holds 5 and cell 9 holds 3. After ADD 9 and then STORE 9, what do R and cell 9 contain?',
      opts: [
        'R = 5, cell 9 = 5',
        'R = 8, cell 9 = 8',
        'R = 3, cell 9 = 3',
        'R = 8, cell 9 = 3'],
      a: 1,
      why: 'ADD 9 puts R + CON(9) = 8 into R. STORE 9 then writes R into cell 9, overwriting the 3.' },

    { q: 'R holds 4 and cell X holds 9. After COMPARE X, which flag is set?',
      opts: [
        'LT, because R is smaller than 9 and so R is the smaller operand',
        'EQ, because both are positive numbers',
        'No flag; COMPARE only works when the values differ by one',
        'GT, because the content of X is greater than R'],
      a: 3,
      why: 'Slide 34: GT = 1 if CON(X) > R. 9 > 4, so GT = 1 and EQ = LT = 0.' },

    { q: 'The toy machine has a 4-bit opcode and 16 memory cells. How many bits is one instruction?',
      opts: [
        '4 bits',
        '8 bits',
        '16 bits',
        '20 bits'],
      a: 1,
      why: '4 bits of opcode + 4 bits of address (2^4 = 16 cells) = 8 bits. The opcode alone allows at most 16 different instructions.' },

    { q: 'Slide 34 gives opcode 0101 to both SUBTRACT and DECREMENT. Why is that a mistake?',
      opts: [
        'Opcodes must be sorted alphabetically, and these two names are not next to each other',
        'DECREMENT works on the ALU and SUBTRACT on memory, so the hardware needs different word sizes',
        'No mistake: the address field tells the decoder which of the two is meant',
        'The decoder could not distinguish them: the opcode alone selects the operation'],
      a: 3,
      why: 'The opcode is the only thing the decoder looks at to choose the circuits. Two operations need two codes — the lab uses 0110 for DECREMENT.' },

    { q: 'Which consequence follows directly from storing programs as data in memory?',
      opts: [
        'Programs can never contain errors, because the hardware checks every stored number',
        'A compiler can write machine code into memory, and the CPU can then run it',
        'Computers can only run one program in their whole lifetime',
        'The CPU no longer needs a program counter, since memory keeps the order'],
      a: 1,
      why: 'A compiler is a program whose output (machine code) is data; the same memory then holds it and the CPU executes it. The same idea makes operating systems and self-modifying code possible.' },

    { q: 'Which description fits a RISC design rather than a CISC one?',
      opts: [
        'Variable-length instructions that range from one to fifteen bytes',
        'ALU instructions that are allowed to use memory operands directly',
        'Fixed-length instructions and only load/store accessing memory',
        'Backward compatibility with software written for the 1978 original'],
      a: 2,
      why: 'RISC (ARM, RISC-V, MIPS): simple, fixed-format instructions, load-store architecture. The other three describe x86-style CISC.' },

    { q: 'The Von Neumann bottleneck arises because …',
      opts: [
        'the ALU is far too slow to finish even a single addition within one clock cycle of the CPU',
        'there are too few registers, so nearly every operand has to be written out to the hard disk',
        'instructions and data share memory and one path to it, so fetches and data reads compete',
        'operating systems force the CPU to wait for the keyboard and the mouse almost all of the time'],
      a: 2,
      why: 'Instructions and data travel over one shared path, so the CPU often waits for memory. Caches ease the problem.' }
  ],

  exercises: [
    { type: 'text', title: '1 · The three principles',
      brief: 'State the three core principles of the Von Neumann model and explain, in two or three sentences, why the stored-program principle was <em>revolutionary</em> compared with ENIAC. (Textbook review questions 1, 8 and 9.)',
      solutionText: 'The three principles:\n1. Decomposition: the computer consists of four cooperating subsystems: memory, ALU, control unit, and input/output.\n2. Stored program: instructions and data are both binary numbers kept in the same addressable memory.\n3. Sequential execution: instructions are fetched and executed one after another, unless a branch or jump changes the flow.\n\nWhy revolutionary: on ENIAC the program was in the wiring, so a new program meant days of re-plugging cables and switches. If the program is just numbers in memory, a new program is loaded like any data, and the machine is changed by software alone. It also lets one program (an operating system, a compiler) produce or manage other programs, which is the basis of the whole software industry.' },

    { type: 'text', title: '2 · Micro-steps of A = B + C',
      brief: 'In the lab load the example <strong>A = B + C</strong> (it is the one that opens first), press <em>Reset</em>, and run it with <em>Micro-step</em> only. (a) What do PC, MAR, MDR, IR and R contain after the first <strong>four</strong> micro-steps? (b) How many micro-steps does the whole program take, and how many instructions does it execute? (c) What does it print?',
      solutionText: '(a) The first instruction is LOAD B. B sits at cell 6 (cells 0-4 hold the code, A, B, C are cells 5, 6, 7), so the word is opcode 0000 + address 0110 = 0000 0110 = 6. After the four fetch micro-steps: PC = 1 (already advanced), MAR = 0 (the address that was fetched), MDR = 6, IR = 6, R = 0. The instruction has been fetched but not yet decoded or executed.\n\n(b) 38 micro-steps in total for 5 instructions (LOAD, ADD, STORE, OUT = 8 micro-steps each; HALT = 6).\n(c) It prints 12 (5 + 7).' },

    { type: 'text', title: '3 · Memory arithmetic',
      brief: '(a) A memory has 10-bit addresses and 8-bit cells. How many cells does it hold, and what is its capacity in KB? (b) How many address bits does a memory of 64 KB (byte cells) need? (c) A hard disk takes 10 ms for an access and RAM takes 50 ns. How many RAM accesses fit into one disk access?',
      solutionText: '(a) 2^10 = 1,024 cells of 1 byte = 1,024 bytes = 1 KB.\n(b) 64 KB = 64 x 1,024 = 65,536 = 2^16 bytes, so 16 address bits.\n(c) 10 ms = 10,000,000 ns; 10,000,000 / 50 = 200,000 RAM accesses per disk access.' },

    { type: 'text', title: '4 · The cost of sorting on a disk (textbook problem 1.11.3)',
      brief: 'The textbook counts disk reads and writes. <strong>Method 1</strong> sorts directly on the disk with selection sort: pass <em>k</em> reads all remaining elements (N−k+1 reads) and swapping costs 2 writes (here: only when a swap really happens). <strong>Method 2</strong> copies the N elements into main memory (N reads), sorts them there for free, and writes N elements back (N writes). Fill in the table of costs for the four arrays: <code>2,4,7,9,16</code> · <code>16,9,7,4,2</code> · <code>2,4,7,19,6</code> · <code>2,19,4,7,6</code>. Check your method with the textbook example <code>12,4,27,9</code> (9 reads, 6 writes).',
      solutionText: 'Selection sort on N = 5 elements always does 5+4+3+2 = 14 reads. Writes depend on swaps (2 per swap):\n\nArray            Method 1 (reads + writes)   Method 2\n2,4,7,9,16       14 + 0  = 14                5 + 5 = 10\n16,9,7,4,2       14 + 4  = 18                10\n2,4,7,19,6       14 + 4  = 18                10\n2,19,4,7,6       14 + 4  = 18                10\n\nCheck: 12,4,27,9 gives 4+3+2 = 9 reads and 3 swaps = 6 writes, as in the textbook.\nConclusion: copying into main memory first is cheaper in every case here, because the disk is touched only 2N times instead of about N^2/2 times.' },

    { type: 'text', title: '5 · A program that edits itself (lab)',
      brief: 'Load the example <strong>Program and data share memory</strong> (<em>Examples</em> → <em>Stored program</em>). (a) Before running: what are the decimal value and the 8-bit pattern of cell 1, and what does it read as? Predict the output. (b) Run it: what is cell 1 now, and what was printed? (c) Now edit the source: change <code>INCREMENT patch</code> to <code>DECREMENT patch</code>, press <em>Assemble &amp; load</em> and run. Predict, then check what is printed — and explain why.',
      solutionText: '(a) Cell 1 holds OUT first (first is at cell 3): opcode 1110 + address 0011 = 1110 0011 = 227. Without the first instruction, OUT 3 would print 111.\n(b) INCREMENT treats cell 1 as a number and adds 1: 227 becomes 228 = 1110 0100, which reads as OUT 4. The program prints 222 (the content of cell 4, "second").\n(c) DECREMENT turns 227 into 226 = 1110 0010 = OUT 2. Cell 2 holds the HALT instruction, i.e. the number 240 (1111 0000), so the program prints 240: the machine printed an instruction as if it were data. Same memory, same bits; only how the word is used decides whether it is an instruction or a number.' },

    { type: 'text', title: '6 · Write your own machine program (lab)',
      brief: 'In the lab, replace the source with a program that <strong>reads two numbers A and B and prints |A − B|</strong> (the difference, never negative). Use only the 16 instructions. Test it with the inputs <code>9 4</code>, <code>4 9</code> and <code>5 5</code>.',
      solutionText: 'One solution (verified in the lab: 9 4 → 5, 4 9 → 5, 5 5 → 0, also -3 2 → 5):\n\n        IN A\n        IN B\n        LOAD A\n        COMPARE B        ; LT = 1 when B < A\n        JUMPLT aBig\n        LOAD B           ; B >= A\n        SUBTRACT A\n        JUMP show\naBig:   LOAD A\n        SUBTRACT B\nshow:   STORE D\n        OUT D\n        HALT\n.data\nA: 0\nB: 0\nD: 0\n\nIdea: there is no absolute-value instruction, so compare first and subtract the smaller from the larger. It is the same if/else pattern as the "max" preset. The program uses 13 code cells + 3 data cells = 16 cells, exactly the whole memory.' },

    { type: 'text', title: '7 · The memory bottleneck experiment (lab)',
      brief: 'Load the example <strong>A = B + C</strong> and open <em>Settings</em>. With <strong>memory latency 1</strong> press <em>Run to end</em> and read the <em>Stats</em> tab. (a) Write down the instructions, micro-steps and cycles, the memory accesses split into instruction fetches, data reads and data writes, and the share of the cycles spent on memory. (b) Predict, then check: set the latency to <strong>10</strong>, press <em>Reset</em> and run again. Which numbers change and which stay the same? Then try <strong>50</strong>. (c) Why does every instruction cost at least one memory access, and what does that have to do with the Von Neumann bottleneck? (d) With latency 10, which would shorten the run more: a CPU whose register transfers are twice as fast, or a memory that is twice as fast (latency 5)? Calculate first, then check the second option in the lab.',
      solutionText: '(a) Latency 1: 5 instructions, 38 micro-steps, 38 cycles (with latency 1 the cycles equal the micro-steps). Memory accesses: 9 = 5 instruction fetches + 3 data reads (LOAD B, ADD C, OUT A) + 1 data write (STORE A). Memory share = 9 / 38 = 23.7 %.\n\n(b) Latency 10: still 5 instructions, 38 micro-steps, the same 5 / 3 / 1 memory accesses and the same output 12. Only the cycles change: 38 + 9 x (10 - 1) = 119 cycles, and the memory share rises to 90 / 119 = 75.6 %. Latency 50: 38 + 9 x 49 = 479 cycles, 450 / 479 = 93.9 % spent on memory. The program does exactly the same work; the machine just waits longer for memory.\n\n(c) The program lives in memory, so before an instruction can do anything it has to be fetched: 5 instructions need 5 fetches, already more than half of the 9 accesses, before a single data cell is touched. Instructions and data share one memory and one path to it, so fetches and data accesses compete. That is the Von Neumann bottleneck of slide 35. Caches exist to soften it.\n\n(d) With latency 10, 29 of the 119 cycles are not memory cycles (119 - 90). A CPU twice as fast on those: 14.5 + 90 = 104.5 cycles, only 12 % shorter. A memory twice as fast (latency 5): 38 + 9 x 4 = 74 cycles, which is exactly what the lab shows (60.8 % of them memory), 38 % shorter. Speeding up the part that takes 76 % of the time pays off far more than speeding up the part that takes 24 %.' },

    { type: 'text', title: '8 · Write and test your own program (lab)',
      brief: 'In the lab press <em>New</em> and write a program that reads numbers until it reads a <strong>0</strong> and then prints the <strong>largest</strong> number it saw (at least one non-zero number comes before the 0). Open the <em>Tests</em> tab, add at least five cases (include one with a single number, one with only negative numbers and one where the largest comes first), write the expected outputs <em>before</em> you run anything, and press <em>Run all tests</em>. (a) Which cases and expected outputs did you choose? (b) How many code words and how many cells does your program need, and what memory size did <em>Auto</em> pick (see the line under the editor and the <em>Listing</em> tab)? (c) Change one jump instruction so that the program finds the <em>smallest</em> number instead. Which of your tests fail, and what does that tell you about the tests?',
      solutionText: 'One solution (verified in the lab):\n\n        IN      BEST            ; the first number is the best so far\nloop:   IN      X\n        LOAD    ZERO\n        COMPARE X               ; EQ = 1 when X is 0 (the sentinel)\n        JUMPEQ  done\n        LOAD    BEST\n        COMPARE X               ; GT = 1 when X > BEST\n        JUMPGT  newbest\n        JUMP    loop\nnewbest: LOAD   X\n        STORE   BEST\n        JUMP    loop\ndone:   OUT     BEST\n        HALT\n.data\nBEST: 0\nX:    0\nZERO: 0\n\n(a) Cases that all pass: 5 3 9 2 0 -> 9; 7 0 -> 7; -4 -9 -2 0 -> -2; 4 4 4 0 -> 4; 9 1 2 0 -> 9; 1 2 3 4 5 0 -> 5. The all-negative case is the one that catches a classic bug: if you start BEST at 0 instead of reading the first number into it, -4 -9 -2 0 prints 0 although 0 was never entered.\n\n(b) 14 code words + 3 data cells = 17 cells. That does not fit in 16, so Auto picks a 32-cell memory, and every word is 4 opcode bits + 5 address bits = 9 bits wide (the Listing tab shows the 9-bit patterns). Starting BEST at 0 would need only 13 words and 16 cells, but it is wrong for negative numbers.\n\n(c) Change JUMPGT newbest to JUMPLT newbest. The program now keeps the smaller number: it prints 2, 7, -9, 4, 1, 1 for the six cases, so four tests fail (5 3 9 2 0, -4 -9 -2 0, 9 1 2 0 and 1 2 3 4 5 0) while 7 0 and 4 4 4 0 still pass, because with one number or all equal numbers the largest and the smallest are the same. Tests that cannot tell two different programs apart are weak tests: choose cases where the right answer and a plausible wrong answer differ.' }
  ]
};
