/* Chapter 5 — Arrays and Strings
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 5,

  quiz: [
    { q: 'What is a compound data type?',
      opts: ['A type created from basic data types, for when the basic types are not sufficient',
             'A data type that stores two values of different basic types in one variable',
             'Any data type whose values must be declared with the const keyword in front',
             'A type that the compiler creates automatically for every arithmetic expression it sees'],
      a: 0,
      why: 'Compound types — array, string, class/struct — are built from the basic types and give more flexible ways to store and use data.' },

    { q: 'What is an array?',
      opts: ['A set of data represented by a single variable name',
             'A list that automatically grows whenever a new value is assigned into it',
             'A collection that may freely mix values of different data types together',
             'A pair of variables that always store exactly the same value as each other'],
      a: 0,
      why: 'An array holds a set of data under one name; each individual piece of data is an element. (A C++ array\'s size is fixed, and all elements share one type.)' },

    { q: 'Element numbering within an array starts at…',
      opts: ['0 — the index (subscript) of the first element',
             '1 — arrays count elements the way people naturally count them',
             '−1 — the position reserved just before the first real element',
             'Any value the programmer chooses in the declaration brackets'],
      a: 0,
      why: 'Index numbers start at 0: in a 5-element array the elements are numbered 0 through 4.' },

    { q: 'For <code>char arStuGrade[5]</code>, which element is <code>arStuGrade[3]</code>?',
      opts: ['The 4th element', 'The 3rd element, since names and positions always match',
             'The last element, because indexing counts backwards from the end', 'The middle element, whatever the size of the array is'],
      a: 0,
      why: 'Index 0 is the 1st element, so index 3 is the 4th. With {\'A\',\'B\',\'C\',\'D\',\'F\'} that is \'D\'.' },

    { q: 'What is the valid index range of <code>int a[12]</code>?',
      opts: ['0 through 11', '1 through 12, one index for each of the twelve elements',
             '0 through 12, since both endpoints of the range are always included', 'Any int — C++ checks nothing, so every index is “valid”'],
      a: 0,
      why: '12 elements, numbered 0…11. Real C++ indeed does not check bounds (option D is the danger, not the definition) — the playground checks for you while you learn.' },

    { q: 'Trace Example 5.2.2: <code>int a[12] = {1,3,5,4,7,2,99,16,45,67,89,45}</code>, summed in a for loop. The output is…',
      opts: ['Total of array element values is 383', 'Total of array element values is 338',
             'Total of array element values is 384, counting the size as an element', 'A compile error — an array cannot be initialized with a list'],
      a: 0,
      why: 'The loop adds all twelve elements: 383 (slide 5.2.2). The {…} initializer list is exactly how arrays are given starting values.' },

    { q: 'What does the declaration <code>int b[4][3];</code> create?',
      opts: ['A two-dimensional array with 4 × 3 = 12 elements',
             'Two separate arrays: one with four elements and one with three elements',
             'An array of four elements whose values may only be 0, 1, or 2',
             'A three-dimensional array with four elements along each dimension'],
      a: 0,
      why: 'Two bracket pairs → two dimensions: 4 rows × 3 columns, 12 elements. Each extra bracket pair adds another dimension.' },

    { q: 'In the row/column picture of <code>int b[4][3]</code>, which element is row 2, column 3?',
      opts: ['b[1][2]', 'b[2][3] — the row and column numbers used directly as written',
             'b[3][2], with the column number placed before the row number', 'b[2][2], because both indices start from one in a 2-D array'],
      a: 0,
      why: 'Rows and columns are numbered from 0: row 2 is index 1, column 3 is index 2 (the slide\'s table shows b[1][2] in exactly that spot).' },

    { q: 'How are the elements of a 2-D array arranged in memory?',
      opts: ['Contiguously, one after another, starting at the array\'s base address',
             'Each row is stored in a separate region of memory chosen at random',
             'In a grid of memory cells that mirrors the rows and columns physically',
             'Only the addresses are stored; the values live somewhere else entirely'],
      a: 0,
      why: 'All elements sit contiguously from the base address — the rows/columns picture is a convenient way to think, not a memory layout.' },

    { q: 'How many elements does <code>int c[7][9][2];</code> have?',
      opts: ['126', '18, the sum of the three dimension sizes added together', '63, the first two dimensions multiplied', '729, nine to the power of three'],
      a: 0,
      why: '7 × 9 × 2 = 126. Each bracket pair multiplies in another dimension.' },

    { q: 'What must a program include to use the string class?',
      opts: ['#include &lt;string&gt; — the header where the type is defined',
             'Nothing — string is a basic type built into the C++ language itself',
             '#include &lt;iostream&gt; only, since strings are a kind of output',
             'A declaration of the string class written above the main function'],
      a: 0,
      why: 'string is a compound type from the standard library; its header must be included. (In this playground iostream pulls it in for convenience, but write the include anyway.)' },

    { q: 'After <code>string str3 = "Hot Dog"; string str5(str3, 4);</code> what is str5?',
      opts: ['Dog', 'Hot , the first four characters of the string str3', 'og, starting after the fourth character of the string', 'H, the single character at index four of the string'],
      a: 0,
      why: 'string s(str, n) copies from index n to the end: index 4 of "Hot Dog" is \'D\' → "Dog" (Example 5.4.2).' },

    { q: 'After <code>string str6 = "linear"; string str7(str6, 3, 3);</code> what is str7?',
      opts: ['ear', 'lin, the first three characters of the string str6', 'nea, three characters starting at the third position', 'ar, whatever remains after the first four characters'],
      a: 0,
      why: 'string s(str, n, p) takes p characters starting at index n: from "linear", 3 characters from index 3 → "ear".' },

    { q: 'What does the <code>+=</code> operator do for strings?',
      opts: ['Appends characters to the end of the string',
             'Adds the numeric values of the characters in the two strings together',
             'Repeats the string a given number of times, like multiplication would',
             'Compares the two strings and stores the longer one on the left side'],
      a: 0,
      why: 'From the operator table: += appends, = assigns, [] indexes a character, + concatenates two strings.' },

    { q: 'Trace: <code>string a = "Hello"; string b = "World"; a += " "; string c = a + b; cout &lt;&lt; c &lt;&lt; " | " &lt;&lt; c[0];</code>',
      opts: ['Hello World | H', 'HelloWorld | H — the appended space is lost in the +',
             'Hello World | e, since indexing starts at the second character', 'World Hello | W'],
      a: 0,
      why: 'a becomes "Hello ", c becomes "Hello World", and c[0] is \'H\' (Example 5.4.3).' },

    { q: 'What does <code>getline(cin, message)</code> do?',
      opts: ['Stores every character typed until Enter is pressed into the string message',
             'Reads exactly one single word, stopping at the first space that the user types in',
             'Reads a single character from the keyboard into the variable message',
             'Prints the current contents of message and then clears the variable'],
      a: 0,
      why: 'getline() accepts characters up to the Enter key — spaces included. Plain cin >> would stop at the first whitespace.' },

    { q: 'What is the relationship between <code>length()</code> and <code>size()</code>?',
      opts: ['They both return the number of characters in the string',
             'length() counts characters while size() counts bytes of memory used',
             'length() includes the terminating character but size() does not',
             'size() works only on strings that were created with a constructor'],
      a: 0,
      why: 'They are two names for the same thing (Example 5.4.5 prints the same number twice).' },

    { q: 'For <code>string s = "Hello World!";</code> what does <code>s.at(s.length() - 1)</code> return?',
      opts: ['The character ! — the last character of the string',
             'The character d, which sits just before the final character',
             'The number 12, the length of the string minus one plus one',
             'An error — at() cannot take an expression as its argument'],
      a: 0,
      why: 'length() is 12, so at(11) is the last character: \'!\' (Example 5.4.6).' },

    { q: 'Which is TRUE when comparing character arrays and strings?',
      opts: ['A char array has a fixed size; a string can grow or shrink as needed',
             'A char array has built-in functions such as at(), length() and size()',
             'A string\'s characters cannot be accessed with an index in brackets',
             'A char array manages its own memory automatically, unlike a string'],
      a: 0,
      why: 'From the comparison slide: char arrays are fixed-size with no built-in methods; strings are dynamic and carry at()/length()/size(). Both can be indexed.' },

    { q: 'Why is <code>const int arraySize = 12;</code> better than writing 12 twice (in the declaration and the loop)?',
      opts: ['One named constant keeps the size and the loop bound in step when the code changes',
             'Because C++ arrays can only ever be declared using const variables as their size value',
             'It makes the array use less memory, since const values are stored only once',
             'It lets the loop run faster because the compiler skips the bounds test'],
      a: 0,
      why: 'A named size used in both places cannot drift out of sync — change it once and the declaration and every loop follow (Example 5.2.2 does exactly this).' },

    { q: 'What happens in real C++ when you write past the end of an array (e.g. <code>a[12]</code> on <code>int a[12]</code>)?',
      opts: ['Undefined behaviour — C++ performs no bounds checking on arrays',
             'The array grows automatically to make room for the extra element',
             'The compiler always detects the mistake and refuses to compile it',
             'The value is stored into element zero, wrapping around the array'],
      a: 0,
      why: 'Real C++ silently writes over whatever memory sits there — a classic source of serious bugs. (The playground raises a clear error instead, so you can learn safely.)' },

    { q: 'The symmetric-matrix program tests <code>a[i][j] != a[j][i]</code>. A matrix is symmetric when…',
      opts: ['Every element equals its mirror across the main diagonal',
             'Every row of the matrix contains exactly the same set of values',
             'The first and last columns of the matrix are identical to each other',
             'All the elements on the main diagonal of the matrix are equal to zero'],
      a: 0,
      why: 'Symmetric means a[i][j] = a[j][i] for all i, j — mirrored across the diagonal. One mismatch and the double loop breaks out early (Example 5.3.1).' },

    { q: 'In the student score table (Example 5.3.2), why is a 2-D array the right tool?',
      opts: ['Each student is a row and each score is a column — one grid holds the whole table',
             'Because a 1-D array cannot hold more than a dozen values at one time',
             'Because 2-D arrays are the only kind of array that is able to store decimal numbers',
             'Because reading with cin inside two loops is faster than one loop'],
      a: 0,
      why: 'The data IS a table: n students × m columns. a[i][j] maps directly to “student i, column j”, and the final score lands in the last column.' },

    { q: 'Which declaration creates a string initialized at declaration time?',
      opts: ['string month = "March"; — and string s1("Hello"); works as well',
             'string month: "March"; using a colon in place of the equals sign',
             'month = string "March"; with the type written before the value',
             'string month["March"]; using brackets to attach the initial value'],
      a: 0,
      why: 'Both forms are legal initializations (slide 5.4.1): assignment syntax and constructor syntax.' },

    { q: 'What does <code>cin &gt;&gt; word;</code> read when the user types <code>This is a test</code> and presses Enter?',
      opts: ['Only the word This — extraction stops at the first whitespace',
             'The entire line, exactly the way getline would have read it in',
             'The first character T only, one character for each cin statement',
             'Nothing — a string cannot be read with the extraction operator'],
      a: 0,
      why: '&gt;&gt; is whitespace-delimited. To capture a whole line with its spaces you need getline(cin, word) — that is why Example 5.4.4 uses it.' }
  ],

  exercises: [
    { title: 'Print the grade array',
      brief: 'Example 5.2.1: declare <code>char arStuGrade[5]</code> initialized with the five grades A, B, C, D, F, then print each element on its own line with a for loop.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: declare and initialize the array with {\'A\',\'B\',\'C\',\'D\',\'F\'}\n\n    // TODO: loop i = 0..4, printing arStuGrade[i] and endl\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    char arStuGrade[5] = {\'A\', \'B\', \'C\', \'D\', \'F\'};\n\n    for (int i = 0; i < 5; i++)\n        cout << arStuGrade[i] << endl;\n\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: 'A\nB\nC\nD\nF\n' }
      ] },

    { title: 'Sum of the elements',
      brief: 'Example 5.2.2 exactly: a 12-element int array initialized with {1, 3, 5, 4, 7, 2, 99, 16, 45, 67, 89, 45}; total it with a loop and print <code>Total of array element values is &lt;total&gt;</code>. Use a <code>const int arraySize</code> for the size.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int arraySize = 12;\n    int a[arraySize] = {1, 3, 5, 4, 7, 2, 99, 16, 45, 67, 89, 45};\n    int total = 0;\n\n    // TODO: accumulate every element into total\n\n    cout << "Total of array element values is " << total << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int arraySize = 12;\n    int a[arraySize] = {1, 3, 5, 4, 7, 2, 99, 16, 45, 67, 89, 45};\n    int total = 0;\n\n    for (int i = 0; i < arraySize; i++)\n        total += a[i];\n\n    cout << "Total of array element values is " << total << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: 'Total of array element values is 383\n' }
      ] },

    { title: 'Largest and smallest element',
      brief: 'Read <code>n</code> (at most 20), then n integers into an array. Print <code>max = &lt;value&gt;</code> and <code>min = &lt;value&gt;</code> on separate lines. Start both answers from <code>a[0]</code> — why is starting from 0 a bug?',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a[20];\n    int n;\n    cin >> n;\n\n    for (int i = 0; i < n; i++)\n        cin >> a[i];\n\n    // TODO: find the largest and smallest element\n\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a[20];\n    int n;\n    cin >> n;\n\n    for (int i = 0; i < n; i++)\n        cin >> a[i];\n\n    int max = a[0], min = a[0];\n    for (int i = 1; i < n; i++) {\n        if (a[i] > max) max = a[i];\n        if (a[i] < min) min = a[i];\n    }\n\n    cout << "max = " << max << endl;\n    cout << "min = " << min << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '5 7 -3 12 0 9', expect: 'max = 12\nmin = -3\n' },
        { stdin: '1 42', expect: 'max = 42\nmin = 42\n' },
        { stdin: '4 -5 -2 -9 -1', expect: 'max = -1\nmin = -9\n' }
      ] },

    { title: 'Is the matrix symmetric?',
      brief: 'Example 5.3.1: read a 3×3 matrix into <code>int a[N][N]</code> with two nested loops, then test <code>a[i][j] != a[j][i]</code> to decide. Print <code>The matrix is symmetric</code> or <code>The matrix is not symmetric</code>. Remember: break only exits the <em>innermost</em> loop.',
      starter: '#include <iostream>\nusing namespace std;\n\nconst int N = 3;\n\nint main() {\n    int i, j;\n    int a[N][N];\n    bool symmetr = true;\n\n    for (i = 0; i < N; i++)\n        for (j = 0; j < N; j++)\n            cin >> a[i][j];\n\n    // TODO: the double loop with the two breaks\n\n    if (symmetr)\n        cout << "The matrix is symmetric" << endl;\n    else\n        cout << "The matrix is not symmetric" << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nconst int N = 3;\n\nint main() {\n    int i, j;\n    int a[N][N];\n    bool symmetr = true;\n\n    for (i = 0; i < N; i++)\n        for (j = 0; j < N; j++)\n            cin >> a[i][j];\n\n    for (i = 0; i < N; i++) {\n        for (j = 0; j < N; j++)\n            if (a[i][j] != a[j][i]) {\n                symmetr = false;\n                break;          // leaves the inner loop only\n            }\n        if (!symmetr)\n            break;              // now leave the outer loop too\n    }\n\n    if (symmetr)\n        cout << "The matrix is symmetric" << endl;\n    else\n        cout << "The matrix is not symmetric" << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '1 2 3 2 5 6 3 6 9', expect: 'The matrix is symmetric\n' },
        { stdin: '1 2 3 4 5 6 7 8 9', expect: 'The matrix is not symmetric\n' }
      ] },

    { title: 'String constructors, all seven',
      brief: 'Example 5.4.2: build str1…str7 with the different constructor forms and print each as <code>strN is: &lt;value&gt;</code>. Predict str5 and str7 before you run!',
      starter: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string str1;                    // an empty string\n    string str2("Good Morning");\n    string str3 = "Hot Dog";\n    // TODO: str4 - a copy of str3\n    // TODO: str5 - from str4, starting at index 4\n    string str6 = "linear";\n    // TODO: str7 - from str6, 3 characters starting at index 3\n\n    cout << "str1 is: " << str1 << endl;\n    cout << "str2 is: " << str2 << endl;\n    cout << "str3 is: " << str3 << endl;\n    // TODO: print str4..str7 in the same format\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string str1;                    // an empty string\n    string str2("Good Morning");\n    string str3 = "Hot Dog";\n    string str4(str3);\n    string str5(str4, 4);\n    string str6 = "linear";\n    string str7(str6, 3, 3);\n\n    cout << "str1 is: " << str1 << endl;\n    cout << "str2 is: " << str2 << endl;\n    cout << "str3 is: " << str3 << endl;\n    cout << "str4 is: " << str4 << endl;\n    cout << "str5 is: " << str5 << endl;\n    cout << "str6 is: " << str6 << endl;\n    cout << "str7 is: " << str7 << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: '', expect: 'str1 is: \nstr2 is: Good Morning\nstr3 is: Hot Dog\nstr4 is: Hot Dog\nstr5 is: Dog\nstr6 is: linear\nstr7 is: ear\n' }
      ] },

    { supp: true,
      title: 'Reverse a whole line',
      brief: 'A step beyond the slides: read a full line with <code>getline</code>, print <code>Length: &lt;n&gt;</code>, then print the line reversed — walk the indices from <code>length()−1</code> down to 0 using <code>[]</code>.',
      starter: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string line;\n    getline(cin, line);\n\n    cout << "Length: " << line.length() << endl;\n\n    // TODO: loop from the last index down to 0, printing line[i]\n\n    cout << endl;\n    return 0;\n}\n',
      solution: '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string line;\n    getline(cin, line);\n\n    cout << "Length: " << line.length() << endl;\n\n    for (int i = line.length() - 1; i >= 0; i--)\n        cout << line[i];\n\n    cout << endl;\n    return 0;\n}\n',
      tests: [
        { stdin: 'Hello World', expect: 'Length: 11\ndlroW olleH\n' },
        { stdin: 'CO1005', expect: 'Length: 6\n5001OC\n' }
      ] }
  ]
};
