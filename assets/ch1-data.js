/* Chapter 1 — Introduction to Algorithms and Flowcharts
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 1,

  quiz: [
    { q: 'What is an algorithm?',
      opts: ['A special programming language that computers use internally to describe, organize, and process all of their stored data',
             'A step-by-step sequence of instructions that describes how data are processed to produce the desired outputs',
             'A diagram made of boxes and arrows that shows how the physical parts of a computer are wired together',
             'A program that has already been compiled and translated into machine code so that it can run directly'],
      a: 1,
      why: 'By definition, an algorithm is a step-by-step sequence of instructions describing how the data are to be processed to produce the desired outputs. A flowchart is just one way to <em>describe</em> an algorithm.' },

    { q: 'In essence, which question does an algorithm answer?',
      opts: ['“Which programming language and which compiler will you use to write the code?”', '“What method will you use to solve the problem?”',
             '“How fast is the computer?”', '“Where is the data stored?”'],
      a: 1,
      why: 'An algorithm is about the <strong>method</strong> — the plan for solving the problem — independent of any programming language.' },

    { q: 'A flowchart is best described as…',
      opts: ['the compiled, executable form of a program that is ready to be run', 'an outline of the basic structure or logic of the program',
             'a list of variable declarations', 'a table of test cases'],
      a: 1,
      why: 'A flowchart draws the logic of the program with standard symbols, before any code is written.' },

    { q: 'Besides flowcharts, what is the other common way to describe an algorithm in this course?',
      opts: ['Machine code', 'Pseudocode — English-like phrases', 'UML class diagrams — the standardized drawings used in software design', 'Binary trees'],
      a: 1,
      why: 'Pseudocode describes the same steps with English-like phrases instead of drawing symbols.' },

    { q: 'Which flowchart symbol marks the start or the end of an algorithm?',
      opts: ['Rectangle, with one entry and one exit arrow', 'Diamond, with two labelled exit arrows', 'Rounded shape (terminal)', 'Parallelogram, slanted to one side'],
      a: 2,
      why: 'The rounded <strong>terminal</strong> symbol is used exactly twice per simple flowchart: once for Start, once for End.' },

    { q: 'Which symbol is used for input and output?',
      opts: ['The parallelogram symbol', 'The diamond symbol with two exits', 'The small circle symbol', 'The rectangle symbol used everywhere else'],
      a: 0,
      why: 'The slanted parallelogram covers both reading data in (input) and displaying results (output).' },

    { q: 'A calculation such as <code>Pay ← Hours × Rate</code> belongs in which symbol?',
      opts: ['Decision (diamond)', 'Process (rectangle)', 'Terminal (the rounded shape)', 'Connector (circle)'],
      a: 1,
      why: 'Calculations and assignments are <strong>process</strong> steps, drawn as rectangles.' },

    { q: 'Which symbol asks a question with a yes/no answer?',
      opts: ['Rectangle, holding a calculation', 'Parallelogram, slanted to the right', 'Diamond (decision)', 'Terminal, at the very start or end'],
      a: 2,
      why: 'The diamond is the <strong>decision</strong> symbol; the flow leaves it along one of two labelled arrows (Yes / No).' },

    { q: 'What do the arrows (flowlines) in a flowchart show?',
      opts: ['Which steps are the most important and should therefore be checked first', 'The order in which the steps are executed',
             'How much memory each step uses', 'Which steps can be deleted'],
      a: 1,
      why: 'Flowlines connect the symbols and define the order of execution.' },

    { q: 'What is the small circle (connector) used for?',
      opts: ['Marking a place where the algorithm contains an error that must be fixed before it can run', 'Joining parts of a flowchart, e.g. when it continues elsewhere on the page',
             'Multiplying two values', 'Declaring a variable'],
      a: 1,
      why: 'Connectors let you break a large flowchart into pieces and show where the flow continues.' },

    { q: 'The “predefined process” symbol (a rectangle with double side bars) represents…',
      opts: ['a special step that the computer is allowed to skip whenever it is busy', 'a named sub-algorithm defined elsewhere, like a function',
             'the fastest step', 'user input'],
      a: 1,
      why: 'It stands for a whole procedure defined elsewhere — a preview of functions in Chapter 6.' },

    { q: 'How many exit arrows does a decision block have?',
      opts: ['Exactly one', 'Exactly two', 'Three or more', 'None'],
      a: 1,
      why: 'A decision asks a yes/no question, so exactly two arrows leave it: one for Yes, one for No.' },

    { q: 'Trace this pseudocode with A = 9: what is printed?',
      code: 'Input A\nif A > 0 then\n    calculate B = sqrt(A)\n    print B\nelse\n    print "A is negative"\nendif',
      opts: ['9', '3', 'A is negative', 'Nothing'],
      a: 1,
      why: '9 &gt; 0, so the Yes branch runs: B = sqrt(9) = 3, and 3 is printed.' },

    { q: 'Trace the same pseudocode with A = −4: what is printed?',
      code: 'Input A\nif A > 0 then\n    calculate B = sqrt(A)\n    print B\nelse\n    print "A is negative"\nendif',
      opts: ['The value 2, since the square root of −4 is taken as ±2', 'The value −2, computed as minus the square root of 4', 'A is negative', 'The value 0, because negative inputs are rounded up to zero'],
      a: 2,
      why: '−4 &gt; 0 is false, so the else branch prints “A is negative”. (Good thing, too — sqrt of a negative number is undefined for real numbers.)' },

    { q: 'In the quadratic-equation pseudocode, when is “No solution” printed?',
      opts: ['When del > 0', 'When del = 0', 'When del < 0', 'Always'],
      a: 2,
      why: 'del &gt; 0 gives two roots, del = 0 gives one root, and the remaining case (del &lt; 0) prints “No solution”.' },

    { q: 'Why do many problems need loops (iteration)?',
      opts: ['To make the flowchart look bigger',
             'Because the same sequence of instructions must be repeated over and over with different data',
             'Because a computer is physically unable to execute the same instruction twice unless that instruction is written inside a loop',
             'To avoid using variables'],
      a: 1,
      why: 'Repetition with different data is exactly what loops are for — one of the most important concepts in programming.' },

    { q: 'Trace the loop: NUM starts at 4; each pass prints NUM and NUM², then adds 1; it stops when NUM > 9. How many pairs are printed?',
      opts: ['5', '6', '9', '10'],
      a: 1,
      why: 'NUM takes the values 4, 5, 6, 7, 8, 9 — six passes — before NUM becomes 10 and the test NUM &gt; 9 stops the loop.' },

    { q: 'In that same loop, what does <code>NUM ← NUM + 1</code> mean?',
      opts: ['NUM and NUM + 1 are equal', 'The old value of NUM plus 1 becomes the new value of NUM',
             'NUM is compared with NUM + 1', 'It is a mathematical contradiction, since no number can ever be equal to itself plus one'],
      a: 1,
      why: 'The arrow is an <strong>assignment</strong>: compute the right side using the old value, then store the result back into NUM. It is not an equation.' },

    { q: 'The algorithm that sums all even numbers between 1 and 20 inclusive displays…',
      opts: ['100', '110', '210', '20'],
      a: 1,
      why: '2 + 4 + 6 + … + 20 = 110. (Ten even numbers, average 11, so 10 × 11 = 110.)' },

    { q: 'In the “squares of 4…9” flowchart, the loop test <code>NUM &gt; 9 ?</code> is placed after the loop body. What does this guarantee?',
      opts: ['The body may never run', 'The body always runs at least once',
             'The loop never ends', 'The test is evaluated once, before the body has had a chance to run'],
      a: 1,
      why: 'Testing at the end (a do-while shape) means the body executes before the first test — so it always runs at least once.' },

    { q: 'Trace the “largest of three different numbers” pseudocode with a = 5, b = 9, c = 4. What is printed?',
      code: 'Input a, b, c\nif a > b then\n    if a > c then print a endif\nelse\n    if b > c then print b\n    else print c endif\nendif',
      opts: ['5', '9', '4', 'Nothing'],
      a: 1,
      why: 'a &gt; b is false (5 &gt; 9 is false), so the else branch runs; b &gt; c (9 &gt; 4) is true, so b = 9 is printed.' },

    { q: 'Same pseudocode with a = 7, b = 3, c = 10. What is printed?',
      code: 'Input a, b, c\nif a > b then\n    if a > c then print a endif\nelse\n    if b > c then print b\n    else print c endif\nendif',
      opts: ['It prints 7, the value that was read into a', 'It prints 10, because 10 is the largest of the three numbers', 'It prints 3, the value that was read into b', 'Nothing — the algorithm has a missing case'],
      a: 3,
      why: 'a &gt; b is true, so the inner test runs: a &gt; c (7 &gt; 10) is false — and there is no else for that inner if, so nothing is printed. Tracing found a bug!' },

    { q: 'In the “sum of 5 numbers” flowchart, the decision <code>count &lt; 5 ?</code> with Yes looping back creates…',
      opts: ['a branch whose statements execute exactly one single time', 'a loop that reads and adds 5 numbers', 'an infinite loop', 'a syntax error'],
      a: 1,
      why: 'Looping back while count &lt; 5 repeats the read-and-add steps exactly 5 times.' },

    { q: 'Which pseudocode line correctly computes the area of a rectangle?',
      opts: ['area ← length + width', 'area ← 2 × (length + width)', 'area ← length × width', 'area ← length ÷ width'],
      a: 2,
      why: 'Area is length × width; the formula with 2 × (length + width) is the <em>perimeter</em>.' },

    { q: 'Which statement about flowcharts and pseudocode is true?',
      opts: ['They necessarily describe two entirely different algorithms', 'They are two notations for the same algorithm',
             'Pseudocode can only describe loops', 'Flowcharts require a compiler'],
      a: 1,
      why: 'One algorithm, two notations: draw it (flowchart) or write it in English-like phrases (pseudocode). You should be able to convert between them.' }
  ],

  exercises: [
    { type: 'text',
      title: 'Write the pseudocode: largest of three numbers',
      brief: 'A flowchart finds the largest among 3 different numbers <code>a</code>, <code>b</code>, <code>c</code>. Write the matching pseudocode on paper, then compare. Bonus: use your trace from quiz Q22 to fix the missing case.',
      solutionText: 'Input a, b, c\nif a > b then\n    if a > c then\n        print a\n    else\n        print c        ← the fix for the missing case\n    endif\nelse\n    if b > c then\n        print b\n    else\n        print c\n    endif\nendif' },

    { type: 'text',
      title: 'Describe the flowchart: sum of 5 numbers',
      brief: 'Given the pseudocode below, sketch the flowchart on paper. Which symbols do you need for each numbered step?<br><code>1. sum ← 0, count ← 0 &nbsp;2. Enter n &nbsp;3. sum ← sum + n &nbsp;4. count ← count + 1 &nbsp;5. count &lt; 5? Yes → step 2, No → print sum</code>',
      solutionText: 'Start          → terminal (rounded)\nsum ← 0, count ← 0   → process (rectangle)\nEnter n        → input (parallelogram)\nsum ← sum + n  → process (rectangle)\ncount ← count + 1 → process (rectangle)\ncount < 5 ?    → decision (diamond)\n   Yes → arrow looping back to “Enter n”\n   No  → continue down\nPrint sum      → output (parallelogram)\nEnd            → terminal (rounded)\n\nTip: rebuild this one in the Flowchart Studio above — the\n“Squares of 4…9” example has the same loop shape.' },

    { type: 'text',
      title: 'Pseudocode + flowchart: rectangle area and perimeter',
      brief: 'Write pseudocode (and draw the flowchart) that reads the length and width of a rectangle and calculates its area and perimeter.',
      solutionText: 'Input length, width\narea ← length × width\nperimeter ← 2 × (length + width)\nDisplay area, perimeter\n\nFlowchart: Start → Input length, width → area ← length × width\n→ perimeter ← 2 × (length + width) → Display area, perimeter → End\n(one input, two process blocks, one output — all in sequence)' },

    { supp: true,
      title: 'From flowchart to C++: the payroll program',
      brief: 'A preview of Chapter 2. The payroll flowchart reads <code>Name, Hours, Rate</code>, computes <code>Pay ← Hours × Rate</code> and displays the results. Complete the C++ translation below — each flowchart block becomes one or two lines of code.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    string name;\n    double hours, rate;\n\n    // Input Name, Hours, Rate\n    cin >> name >> hours >> rate;\n\n    // TODO: Process — compute pay = hours * rate\n\n    // TODO: Output — print exactly:\n    //   Name: <name>\n    //   Pay: <pay>\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    string name;\n    double hours, rate;\n\n    // Input Name, Hours, Rate\n    cin >> name >> hours >> rate;\n\n    // Process: Pay <- Hours x Rate\n    double pay = hours * rate;\n\n    // Output: Display Name, Pay\n    cout << "Name: " << name << endl;\n    cout << "Pay: " << pay << endl;\n\n    return 0;\n}\n',
      tests: [
        { stdin: 'Alice 40 15', expect: 'Name: Alice\nPay: 600\n' },
        { stdin: 'Minh 12.5 8', expect: 'Name: Minh\nPay: 100\n' }
      ] },

    { supp: true,
      title: 'From pseudocode to C++: sum of even numbers 1…20',
      brief: 'Translate the pseudocode from the slides — <code>sum ← 0; count ← 1; repeat: if count is even add it to sum; count ← count + 1; while count ≤ 20; display sum</code>. The program prints a single number.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int sum = 0;\n    int count = 1;\n\n    // TODO: loop while count <= 20;\n    // add count to sum when it is even (hint: count % 2 == 0)\n\n    cout << sum << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int sum = 0;\n    int count = 1;\n\n    while (count <= 20) {\n        if (count % 2 == 0) {\n            sum = sum + count;\n        }\n        count = count + 1;\n    }\n\n    cout << sum << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '110\n' }
      ] },

    { supp: true,
      title: 'From flowchart to C++: squares of 4…9',
      brief: 'The loop flowchart from the slides: start NUM at 4; each pass prints NUM and its square, then increases NUM; stop when NUM &gt; 9. Print one pair per line, separated by a space.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num = 4;\n\n    // TODO: do-while shape — print num and num*num,\n    // then increase num, while num <= 9\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num = 4;\n\n    do {\n        int sqnum = num * num;\n        cout << num << " " << sqnum << endl;\n        num = num + 1;\n    } while (num <= 9);\n\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '4 16\n5 25\n6 36\n7 49\n8 64\n9 81\n' }
      ] }
  ]
};
