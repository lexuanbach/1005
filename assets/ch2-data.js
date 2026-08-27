/* Chapter 2 — Basic Elements in C++
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 2,

  quiz: [
    { q: 'What does the preprocessor do with <code>#include &lt;iostream&gt;</code>?',
      opts: ['Runs the program', 'Places the entire contents of the iostream file into the current file',
             'Compiles the iostream library into machine code before your program starts running', 'Deletes unused code'],
      a: 1,
      why: 'The preprocessor runs <em>before</em> the compiler; on <code>#include</code> it pastes the whole designated file into your source file, giving you access to its classes and functions.' },

    { q: 'When does the preprocessor run?',
      opts: ['After the compiler', 'Before the compiler', 'While the program executes', 'Only when there is an error'],
      a: 1,
      why: 'The preprocessor is a program that runs before the compiler and handles directives like <code>#include</code>.' },

    { q: 'What must every statement in C++ end with?',
      opts: ['A period character (.)', 'A comma', 'A semicolon', 'A newline character (\\n)'],
      a: 2,
      why: 'All statements in C++ must end with a semicolon — forgetting one is the classic first compile error.' },

    { q: 'Which statement about <code>main()</code> is true?',
      opts: ['A program may contain several main() functions, and the compiler simply runs the first one it finds', 'main() runs automatically when the program executes, and every C++ program must include exactly one',
             'main() is optional', 'main() can only call cout'],
      a: 1,
      why: 'main() is the special entry point: it runs automatically, and all other functions are executed from it.' },

    { q: 'In <code>int main()</code>, what does <code>return 0;</code> indicate?',
      opts: ['The program crashed', 'The program terminated successfully', 'Exactly zero lines of output were printed to the screen', 'The loop ran zero times'],
      a: 1,
      why: 'Returning 0 from main() signals successful termination to the operating system.' },

    { q: 'The <code>&lt;&lt;</code> in <code>cout &lt;&lt; "Hello";</code> is called the…',
      opts: ['extraction operator', 'insertion operator', 'comparison operator', 'shift-reduce operator'],
      a: 1,
      why: 'The insertion operator <code>&lt;&lt;</code> sends (inserts) data into the output stream. Its mirror image <code>&gt;&gt;</code> on cin is the extraction operator.' },

    { q: 'What does the <code>endl</code> manipulator represent?',
      opts: ['The end of the program', 'A new line character', 'A space', 'The end of a variable'],
      a: 1,
      why: '<code>endl</code> is an i/o manipulator from the iostream classes that represents a new line.' },

    { q: 'Which comment syntax spans multiple lines?',
      opts: ['// … //', '/* … */', '# … #', '&lt;!-- … --&gt;'],
      a: 1,
      why: 'Block comments open with <code>/*</code> and close with <code>*/</code>; <code>//</code> comments run to the end of one line only.' },

    { q: 'According to the slides, the three basic data types used in C++ are…',
      opts: ['strings, arrays, and pointers to memory locations', 'integers, floating point numbers, characters',
             'bytes, words, bits', 'lists, sets, maps'],
      a: 1,
      why: 'The chapter introduces integers (no decimal places), floating point numbers, and characters.' },

    { q: 'The literal <code>90.1e3</code> means…',
      opts: ['90.1 × 3', '90.13', '90.1 × 10³', '90.1 ÷ 10³'],
      a: 2,
      why: 'Exponential notation: <code>e3</code> multiplies by 10³, so 90.1e3 = 90100.' },

    { q: 'Why should you avoid <code>==</code> between floating-point results?',
      opts: ['It is a syntax error — the compiler refuses to compare two floating point values directly', 'Floating point values are always approximate, so an exact-equality test may fail',
             'It is slower than &lt;', 'cout cannot print bools'],
      a: 1,
      why: 'Floating point numbers (IEEE 754) store approximations — e.g. 0.1 + 0.2 is not guaranteed to equal exactly 0.3.' },

    { q: 'In the single-precision IEEE 754 standard (32 bits), the bits are divided into…',
      opts: ['1 sign, 8 exponent, 23 mantissa', '8 sign, 8 exponent, 16 mantissa',
             '1 sign, 11 exponent, 52 mantissa', '2 sign, 10 exponent, 20 mantissa'],
      a: 0,
      why: 'Single precision: 1 sign bit + 8 exponent bits + 23 mantissa bits = 32. (Double precision is 1 + 11 + 52 = 64.)' },

    { q: 'How many bytes do <code>float</code> and <code>double</code> typically occupy?',
      opts: ['2 and 4', '4 and 8', '8 and 16', '4 and 4'],
      a: 1,
      why: 'float is typically 4 bytes (32 bits) and double is 8 bytes (64 bits) — which is why double has more precision.' },

    { q: 'Which is a correct character literal with an escape sequence meaning “move to the next line”?',
      opts: ["'n'", '"\\n"', "'\\n'", '\\n'],
      a: 2,
      why: 'A char literal uses single quotes; <code>\\n</code> is the escape sequence for a new line, so <code>\'\\n\'</code> is the character. (Double quotes would make it a string.)' },

    { q: 'What is the value of <code>15 / 2</code> in C++?',
      opts: ['7.5', '7', '8', '1'],
      a: 1,
      why: 'Both operands are integers, so the division is integer division: the result is 7 with the fraction discarded.' },

    { q: 'What is the value of <code>17 % 3</code>?',
      opts: ['5', '2', '1', '0'],
      a: 1,
      why: 'The modulus operator gives the remainder of the integer division: 17 = 5 × 3 + 2, so 17 % 3 is 2.' },

    { q: 'Using precedence and left-to-right associativity, what is <code>8 + 5 * 7 % 2 * 4</code>?',
      opts: ['12', '20', '8', '48'],
      a: 0,
      why: '<code>* / %</code> are evaluated first, left to right: 5 × 7 = 35; 35 % 2 = 1; 1 × 4 = 4; then 8 + 4 = 12.' },

    { q: 'What is the value of <code>9 / 2 * 3 - 10 * 4 % 3</code>?',
      opts: ['11', '12', '1', '13.5'],
      a: 0,
      why: '9 / 2 = 4 (integer!), 4 × 3 = 12; then 10 × 4 = 40, 40 % 3 = 1; finally 12 − 1 = 11.' },

    { q: 'Which of the following is a valid identifier?',
      opts: ['%x1', 'X$2', 'myVariable', '2count_of_items'],
      a: 2,
      why: 'Identifiers start with a letter or underscore and use only letters, digits, and underscores. <code>myVariable</code> (camelCase) is also the suggested style for C++ in this course.' },

    { q: 'What does the declaration <code>int count;</code> tell the compiler?',
      opts: ['To execute a step of the algorithm', 'That count stores integer values',
             'To print count', 'That count is constant'],
      a: 1,
      why: 'A declaration gives information to the compiler — the data type determines what the variable can store. It must appear before the variable is used.' },

    { q: 'If <code>temp</code> is an <code>int</code>, what does <code>temp = 25.89;</code> store?',
      opts: ['25.89', '26', '25', 'A compile error'],
      a: 2,
      why: 'Conversion across the assignment operator: the value is converted to the variable\'s type, truncating to 25 (not rounding).' },

    { q: '<code>sum += 10;</code> is equivalent to…',
      opts: ['sum = 10', 'sum = sum + 10', 'sum + 10 = sum', 'sum == sum + 10'],
      a: 1,
      why: 'The compound operator <code>+=</code> adds and assigns: sum = sum + 10. Similar shortcuts exist for −=, *=, /=, %=.' },

    { q: 'If <code>a</code> is 5, what are <code>b</code> and <code>a</code> after <code>b = ++a;</code>?',
      opts: ['b = 5, a = 6', 'b = 6, a = 6', 'b = 5, a = 5', 'b = 6, a = 5'],
      a: 1,
      why: 'Prefix: first increase a to 6, then assign that new value to b. (Postfix <code>b = a++;</code> would give b = 5, a = 6.)' },

    { q: 'What does this program print?',
      code: 'int c;\nc = 5;\ncout << c << endl;\ncout << c++ << endl;\ncout << c << endl;',
      opts: ['5 5 6', '5 6 6', '5 6 7', '6 6 6'],
      a: 0,
      why: 'The postfix <code>c++</code> prints the old value (5) and then increments, so the third line prints 6. Prefix <code>++c</code> would print 5 6 6.' },

    { q: 'What happens when execution reaches <code>cin &gt;&gt; num1;</code>?',
      opts: ['The program prints num1', 'The program stops and waits for the user to type a value, which is stored into num1',
             'num1 is set to 0', 'The compiler immediately reports an error because num1 has not been given a value yet'],
      a: 1,
      why: 'cin reads from the standard input stream: execution pauses, the typed value is extracted by <code>&gt;&gt;</code> and stored into the variable.' },

    { q: 'Your program calls <code>sqrt(x)</code>. Which directive does it need, and what type does sqrt return?',
      opts: ['#include &lt;iostream&gt;, returns int', '#include &lt;cmath&gt;, returns double',
             '#include &lt;cstring&gt;, returns float', 'No include needed, returns double'],
      a: 1,
      why: '<code>&lt;cmath&gt;</code> is the modern C++ math header; like most math library functions, sqrt takes and returns double.' },

    { q: 'What does <code>setw(10)</code> do?',
      opts: ['Prints the number 10', 'Sets the minimum field width for the next output item to 10 character positions',
             'Rounds to 10 digits', 'Adds exactly ten blank spaces after every item that the program prints from then on'],
      a: 1,
      why: '<code>setw()</code> (set width) pads the <em>next</em> item to at least the given width — handy for lining up columns. It needs <code>#include &lt;iomanip&gt;</code>.' },

    { q: 'With <code>fixed</code> enabled, what does <code>setprecision(2)</code> mean?',
      opts: ['2 significant digits in total, counted from the first digit', '2 digits to the right of the decimal point',
             'Numbers are multiplied by 100', 'Only 2 numbers can be printed'],
      a: 1,
      why: 'With the fixed flag, precision counts digits after the decimal point — so 25.67 with setprecision(3) prints 25.670.' }
  ],

  exercises: [
    { title: 'Fix the broken program',
      brief: 'This “Hello” program has <strong>three</strong> mistakes. Fix them so it compiles and prints exactly <code>Hello, CO1005!</code> followed by a newline. (Hint: statements end with… what? And look closely at the quotes and the stream name.)',
      starter: '#include <iostream>\nusing namespace std\n\nint main() {\n    Cout << "Hello, CO1005! << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CO1005!" << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: 'Hello, CO1005!\n' }
      ] },

    { title: 'Volume of a cylinder',
      brief: 'Based on Example 2.4.1 — but read <code>radius</code> and <code>height</code> from the keyboard instead of hard-coding them. Compute <code>volume = 3.1416 × radius² × height</code> and print exactly: <code>The volume of the cylinder is &lt;volume&gt;</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    float radius, height, volume;\n\n    // TODO: read radius and height with cin\n\n    // TODO: compute volume = 3.1416 * radius * radius * height\n\n    // TODO: print "The volume of the cylinder is " << volume << endl\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    float radius, height, volume;\n\n    cin >> radius >> height;\n\n    volume = 3.1416 * radius * radius * height;\n\n    cout << "The volume of the cylinder is " << volume << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '2.5 16', expect: 'The volume of the cylinder is 314.16\n' },
        { stdin: '1 1', expect: 'The volume of the cylinder is 3.1416\n' }
      ] },

    { title: 'Product of two numbers',
      brief: 'From Example 3.5.1: read two floating-point numbers and print <code>&lt;num1&gt; times &lt;num2&gt; is &lt;product&gt;</code>. Note how C++ prints the numbers back.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    float num1, num2, product;\n\n    // TODO: read num1 and num2\n\n    // TODO: compute and print: <num1> times <num2> is <product>\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    float num1, num2, product;\n\n    cin >> num1 >> num2;\n    product = num1 * num2;\n    cout << num1 << " times " << num2 << " is " << product << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '30 0.05', expect: '30 times 0.05 is 1.5\n' },
        { stdin: '2.5 4', expect: '2.5 times 4 is 10\n' }
      ] },

    { title: 'Average of three integers',
      brief: 'From Example 3.5.2: read three integers with one <code>cin</code> statement and print <code>The average of the numbers is &lt;average&gt;</code>. Careful: divide by <code>3.0</code>, not <code>3</code> — why does it matter? Try both and see.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num1, num2, num3;\n    float average;\n\n    // TODO: read the three integers in one statement\n\n    // TODO: compute the average (divide by 3.0!) and print:\n    // The average of the numbers is <average>\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num1, num2, num3;\n    float average;\n\n    cin >> num1 >> num2 >> num3;\n    average = (num1 + num2 + num3) / 3.0;\n    cout << "The average of the numbers is " << average << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '22 56 73', expect: 'The average of the numbers is 50.3333\n' },
        { stdin: '10 20 30', expect: 'The average of the numbers is 20\n' }
      ] },

    { title: 'Prefix vs postfix — predict, then verify',
      brief: 'Reproduce Example 2.4.2 exactly. Before you press Run: write your prediction of the seven lines of output on paper. Then run and compare. The exact expected output is in the sample test.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int c;\n    c = 5;\n    cout << c << endl;          // ?\n    cout << c++ << endl;        // ?\n    cout << c << endl << endl;  // ?\n    c = 5;\n    cout << c << endl;          // ?\n    cout << ++c << endl;        // ?\n    cout << c << endl;          // ?\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int c;\n    c = 5;\n    cout << c << endl;          // 5\n    cout << c++ << endl;        // 5 (print first, then increment)\n    cout << c << endl << endl;  // 6, plus a blank line\n    c = 5;\n    cout << c << endl;          // 5\n    cout << ++c << endl;        // 6 (increment first, then print)\n    cout << c << endl;          // 6\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '5\n5\n6\n\n5\n6\n6\n' }
      ] },

    { title: 'Formatted output with setw and setprecision',
      brief: 'From Examples 2.7.1 and 2.7.2: print <code>25.67</code> between two <code>|</code> bars, right-aligned in a field of 10 characters with exactly 3 digits after the decimal point — then print the column of numbers 6, 18, 124, each in a field of width 3, followed by <code>---</code> and their sum.',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    // TODO line 1: |    25.670|   (setw(10), setprecision(3), fixed)\n\n    // TODO: then the column:\n    //   6\n    //  18\n    // 124\n    // ---\n    // 148\n\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    cout << "|" << setw(10)\n         << setprecision(3) << fixed << 25.67 << "|" << endl;\n\n    cout << setw(3) << 6 << endl\n         << setw(3) << 18 << endl\n         << setw(3) << 124 << endl\n         << "---\\n"\n         << (6 + 18 + 124) << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: '|    25.670|\n  6\n 18\n124\n---\n148\n' }
      ] }
  ]
};
