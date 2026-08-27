/* Chapter 6 — Functions
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 6,

  quiz: [
    { q: 'In C++, what are user-defined program units (subprograms) called?',
      opts: ['Functions', 'Procedures, when they return nothing, and functions otherwise',
             'Methods, because every piece of C++ code must belong to a class', 'Modules, each stored in its own separate source file'],
      a: 0,
      why: 'In C++ all subprograms are referred to as functions — whatever they return.' },

    { q: 'A function definition consists of four parts. Which list is correct?',
      opts: ['Return data type, function name, parameters in ( ), and the body in { }',
             'A prototype, a function call, a return statement, and the main function itself',
             'The header file, the namespace, the declaration, and the definition',
             'Local variables, global variables, parameters, and the return value'],
      a: 0,
      why: 'The four parts: the reserved word for the return type, the name, any parameters within parentheses, and the statements enclosed in curly braces.' },

    { q: 'What is the difference between formal and actual parameters?',
      opts: ['Formal parameters are the names in the function header; actual parameters are the values placed in the call',
             'Formal parameters must be declared with data types, while actual parameters never need to have any type at all',
             'Actual parameters live inside the function; formal parameters live inside the caller\'s code',
             'There is no difference — the two terms are used interchangeably in C++'],
      a: 0,
      why: 'findMax(int x, int y) — x and y are formal parameters; in findMax(firstNum, secNum) the variables passed are the actual parameters.' },

    { q: 'What does a function prototype do?',
      opts: ['Declares to the compiler that you intend to use the function later in the program',
             'Creates a first, temporary working version of the function that is replaced afterwards',
             'Runs the function once at program start to make sure that it works correctly',
             'Reserves the memory that all of the function\'s local variables will occupy'],
      a: 0,
      why: 'A prototype (forward declaration) lets you call a function before its definition appears. Calling before either exists is a compile-time error.' },

    { q: 'Trace Example 7.3.2 with inputs 22 85 17. What does <code>maximum(a, b, c)</code> return?',
      opts: ['85', '22, because the first argument is used when the values differ', '17, the value that was typed last of the three', '124, the total of the three integers added together'],
      a: 0,
      why: 'max starts at 22, y=85 is larger → max=85, z=17 is not → returns 85.' },

    { q: 'When an argument is passed by value, the called function receives…',
      opts: ['A copy of the value stored in the variable — the original cannot be changed',
             'The variable itself, so any assignment inside the function changes the caller',
             'A read-only view of the variable that the function may inspect but not use',
             'The variable\'s name as a string, which the function looks up when needed'],
      a: 0,
      why: 'Pass by value copies. Changes to the copy do not affect the original variable in the caller — the central fact of this chapter.' },

    { q: 'What are the two legal forms of the return statement?',
      opts: ['return expression; and the bare form return;',
             'return value; and return reference; — one form for each passing style',
             'return; and exit; — the second one used only inside the main function',
             'return (value) and return [value], with parentheses or with brackets'],
      a: 0,
      why: 'return expression; hands a value back; the bare return; exits a void function. Values passed back must match the function\'s declared type.' },

    { q: 'What is the scope of a variable?',
      opts: ['Where in the program the declared variable is allowed to be used',
             'The range of numeric values that the variable is able to store safely',
             'The amount of memory the variable occupies while the program runs',
             'The length of time the variable exists before it is destroyed again'],
      a: 0,
      why: 'Scope is about WHERE a name can be used. (How LONG it lives is its storage duration — the next section.)' },

    { q: 'A variable declared outside of any function has…',
      opts: ['Global scope — it is accessible throughout the entire program',
             'Local scope in whichever function happens to use it first at run time',
             'No scope at all until some function declares it a second time inside',
             'File scope only in the sense that it must be the first line of the file'],
      a: 0,
      why: 'Declared outside all functions → global scope. Declared inside a function → local scope, usable only in that function.' },

    { q: 'Trace Example 6.3.1: global x, main sets x=10, y=20; valfun() sets its own local y=30 and then x=40. Back in main, what are x and y?',
      code: 'int x;              // global\nint main() {\n    int y;          // local to main\n    x = 10; y = 20;\n    valfun();       // sets ITS OWN y = 30, then x = 40\n    // x = ?  y = ?\n}',
      opts: ['x = 40 and y = 20', 'x = 10 and y = 20 — a function cannot change anything in main',
             'x = 40 and y = 30, both assignments made inside valfun persist', 'x = 10 and y = 30'],
      a: 0,
      why: 'x is global — valfun\'s x = 40 changes it for everyone. Each function\'s y is its own local variable, so main\'s y is still 20.' },

    { q: 'Which storage classes may a local variable belong to?',
      opts: ['auto, static, or register', 'auto, extern, or global — the three duration keywords',
             'static and extern only, since auto applies to global variables', 'Any of the four, including extern, with no restrictions'],
      a: 0,
      why: 'Locals: auto (the default), static, or register. extern refers to a global defined in another file.' },

    { q: 'By default, what storage class does a local variable have?',
      opts: ['auto — it exists only during the lifetime of the block that contains it',
             'static — it keeps its value between one function call and the very next one',
             'register — it is stored in the CPU\'s internal registers when possible',
             'extern — it is shared with every other file in the whole program'],
      a: 0,
      why: '“auto” is short for automatic: created when the block is entered, destroyed when it exits. That is why Example 6.4.1 prints 0 three times.' },

    { q: 'Example 6.4.1: <code>void testauto() { int num = 0; cout &lt;&lt; num; num++; }</code> is called three times. The output is…',
      opts: ['0 0 0', '0 1 2 — the increments carry over from one call to the next call', '1 2 3, counting each of the three separate calls', '0 0 1, with the increment taking effect on the final call'],
      a: 0,
      why: 'num is automatic: created and re-initialized to 0 on every call. The num++ is lost when the function returns.' },

    { q: 'Example 6.4.2 changes one word: <code>static int num = 0;</code>. Now the three calls print…',
      opts: ['0 1 2', '0 0 0 — the initialization still runs at the start of every call', '1 2 3, because static variables start counting from the value one', '2 1 0, since static variables count downward toward zero'],
      a: 0,
      why: 'A static local is created once and remains for the life of the program — its value survives between calls, and the initialization happens only once.' },

    { q: 'Example 6.4.4: <code>int funct(int x) { static int sum = 100; sum += x; return sum; }</code> called with x = 1, 2, 3, 4… returns…',
      opts: ['101, 103, 106, 110, … — each call keeps adding to the same sum',
             '101, 102, 103, 104, … — the sum restarts from 100 on every call',
             '100, 100, 100, 100, … — the return happens before the addition runs',
             '1, 3, 6, 10, … — the static keyword makes the function return x alone'],
      a: 0,
      why: 'static sum persists: 100+1=101, then +2=103, +3=106, +4=110… (With plain auto sum, Example 6.4.3 gives 101, 102, 103… instead.)' },

    { q: 'When no explicit initialization is given, static variables are set to…',
      opts: ['Zero', 'Whatever value happens to be in that memory location already', 'One, so that counters can start counting immediately', 'A special “uninitialized” marker that reads as an error'],
      a: 0,
      why: 'All static variables are zero-initialized when no explicit value is given — and any initialization happens only once.' },

    { q: 'Where are register variables stored?',
      opts: ['In the CPU\'s internal registers rather than in memory',
             'In a special protected region of memory that only the OS can access',
             'On the hard disk, so their values survive after the program ends',
             'Inside the executable file itself, next to the program\'s constants'],
      a: 0,
      why: 'register requests CPU-register storage; the duration is the same as automatic variables.' },

    { q: 'What is an extern variable?',
      opts: ['A global variable that is declared in another file',
             'A local variable that other functions may borrow by declaring it extern',
             'A variable stored outside the computer, for example on the network',
             'Any variable whose declaration appears above the main function'],
      a: 0,
      why: 'extern tells the compiler “this global exists — its definition lives in a different file”, letting several files share one variable.' },

    { q: 'How do you declare that a function parameter is passed by reference?',
      opts: ['Follow the parameter\'s type with an ampersand: <code>int &amp;cRef</code>',
             'Write the keyword reference in front of the parameter\'s data type',
             'Pass the variable\'s name in quotation marks at the call site instead',
             'Declare the parameter twice over, once in the caller and once in the callee'],
      a: 0,
      why: 'The & after the type in the prototype/header means “cRef is a reference parameter to an int” (Example 6.5.1).' },

    { q: 'Example 6.5.1: x = 2, z = 4. After <code>squareByValue(x)</code> and <code>squareByReference(z)</code>, what are x and z?',
      opts: ['x = 2 and z = 16', 'x = 4 and z = 16 — both functions square their own argument', 'x = 2 and z = 4, since a function never changes its caller', 'x = 4 and z = 4'],
      a: 0,
      why: 'squareByValue squares a COPY (its return value is 4, but x stays 2). squareByReference reaches the caller\'s z directly: z becomes 16.' },

    { q: 'Why would you choose pass-by-reference over pass-by-value?',
      opts: ['So the called function can access and modify the caller\'s data directly',
             'Because reference parameters are checked for errors while plain copies are not',
             'Because a function may have at most one parameter passed by value',
             'To stop the caller from seeing what the called function does inside'],
      a: 0,
      why: 'Call-by-reference gives the callee the caller\'s actual data — needed when the function\'s job is to change its arguments (like swap, or squareByReference).' },

    { q: 'How do you pass an array to a function at the call site?',
      opts: ['By its name, without any brackets: <code>modifyArray(hourlyTemperature, size)</code>',
             'By writing a pair of empty brackets right after the name: modifyArray(hourlyTemperature[])',
             'By passing every element one at a time, separated with commas in the call',
             'By first copying the array into a string and passing the string instead'],
      a: 0,
      why: 'Arrays are passed by name alone. The receiving parameter is declared as int b[] — and the size is NOT required between those brackets.' },

    { q: 'Why does a function receiving an array usually also take a size parameter, like <code>int b[], int arraySize</code>?',
      opts: ['The brackets carry no size information, so the function cannot know how many elements there are',
             'Because C++ requires every function to have an even number of parameters',
             'So that the function can quietly enlarge the whole array if arraySize turns out to be much too small',
             'The size parameter is decorative — the function can always measure the array'],
      a: 0,
      why: 'int b[] says “an int array arrives here” and nothing more. The element count must travel as its own parameter — linearSearch takes sizeofArray for exactly this reason.' },

    { q: 'linearSearch scans the array and returns −1 when the key is not found. Why −1?',
      opts: ['−1 can never be a real element position, so it unambiguously means “not found”',
             'Because the last element of every array is always stored at position −1',
             'Because functions that fail are required by C++ to return a negative value',
             '−1 makes the loop run for one extra time so that no element is accidentally skipped'],
      a: 0,
      why: 'Valid indices are 0…size−1, so −1 is safely outside them — a sentinel return value (the same idea as Chapter 4\'s sentinels!).' },

    { q: 'A function modifies the elements of an array parameter. What does the caller observe?',
      opts: ['The caller\'s array is changed — arrays are effectively passed by reference',
             'Nothing — the function worked on a private copy of the entire array',
             'A compile error, because array parameters are always read-only inside functions',
             'Only the first element of the caller\'s array receives the new values'],
      a: 0,
      why: 'Unlike single values, an array is not copied into the function: the callee works on the caller\'s elements. (Try the fill() exercise below.)' },

    { q: 'Which prototype matches the definition <code>int maximum(int x, int y, int z) { … }</code>?',
      opts: ['int maximum(int, int, int); — parameter names are optional in a prototype',
             'maximum(int, int, int) returns int; written in the older C++ style',
             'int maximum(x, y, z); listing the three names without their types',
             'prototype int maximum(3); giving only the count of how many parameters there are'],
      a: 0,
      why: 'A prototype needs the return type, name, and parameter types — the names may be omitted, exactly as the slide writes int maximum (int, int, int);.' }
  ],

  exercises: [
    { title: 'FindMax — your first void function',
      brief: 'Example 6.1.1: write <code>void FindMax(int x, int y)</code> that prints <code>The maximum of the 2 numbers is &lt;max&gt;</code> (use the ternary <code>?:</code> if you like). main() reads two ints and calls it.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define void FindMax(int x, int y)\n\nint main() {\n    int firstNum, secNum;\n    cin >> firstNum >> secNum;\n    FindMax(firstNum, secNum);\n    return 0;\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nvoid FindMax(int x, int y) {\n    int maxnum;\n    maxnum = (x >= y) ? x : y;\n    cout << "The maximum of the 2 numbers is " << maxnum << endl;\n}\n\nint main() {\n    int firstNum, secNum;\n    cin >> firstNum >> secNum;\n    FindMax(firstNum, secNum);\n    return 0;\n}\n',
      tests: [
        { stdin: '5 8', expect: 'The maximum of the 2 numbers is 8\n' },
        { stdin: '12 3', expect: 'The maximum of the 2 numbers is 12\n' }
      ] },

    { title: 'Maximum of three, with a prototype',
      brief: 'Example 7.3.2: declare the prototype <code>int maximum(int, int, int);</code> above main, call it, and define the function <em>below</em> main. Print <code>Maximum is: &lt;value&gt;</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: the function prototype goes here\n\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    cout << "Maximum is: " << maximum(a, b, c) << endl;\n    return 0;\n}\n\n// TODO: define int maximum(int x, int y, int z) here\n',
      solution: '#include <iostream>\nusing namespace std;\n\n// function prototype (forward declaration)\nint maximum(int, int, int);\n\nint main() {\n    int a, b, c;\n    cin >> a >> b >> c;\n    cout << "Maximum is: " << maximum(a, b, c) << endl;\n    return 0;\n}\n\nint maximum(int x, int y, int z) {\n    int max = x;\n    if (y > max)\n        max = y;\n    if (z > max)\n        max = z;\n    return max;\n}\n',
      tests: [
        { stdin: '22 85 17', expect: 'Maximum is: 85\n' },
        { stdin: '9 2 30', expect: 'Maximum is: 30\n' },
        { stdin: '-5 -2 -9', expect: 'Maximum is: -2\n' }
      ] },

    { title: 'squareByValue vs squareByReference',
      brief: 'Example 6.5.1 in full: one function squares a copy and returns it; the other squares the caller\'s variable through <code>int &amp;cRef</code>. Reproduce the exact five lines of output for x = 2, z = 4.',
      starter: '#include <iostream>\nusing namespace std;\n\nint squareByValue(int);\nvoid squareByReference(int &cRef);\n\nint main() {\n    int x = 2, z = 4;\n    cout << "x = " << x << " before squareByValue\\n"\n         << "Value returned by squareByValue: "\n         << squareByValue(x) << endl\n         << "x = " << x << " after squareByValue\\n" << endl;\n    cout << "z = " << z << " before squareByReference" << endl;\n    squareByReference(z);\n    cout << "z = " << z << " after squareByReference" << endl;\n    return 0;\n}\n\n// TODO: define both functions\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint squareByValue(int);\nvoid squareByReference(int &cRef);\n\nint main() {\n    int x = 2, z = 4;\n    cout << "x = " << x << " before squareByValue\\n"\n         << "Value returned by squareByValue: "\n         << squareByValue(x) << endl\n         << "x = " << x << " after squareByValue\\n" << endl;\n    cout << "z = " << z << " before squareByReference" << endl;\n    squareByReference(z);\n    cout << "z = " << z << " after squareByReference" << endl;\n    return 0;\n}\n\nint squareByValue(int a) {\n    return a *= a;      // caller\'s argument not modified\n}\n\nvoid squareByReference(int &cRef) {\n    cRef *= cRef;       // caller\'s argument modified\n}\n',
      tests: [
        { stdin: '', expect: 'x = 2 before squareByValue\nValue returned by squareByValue: 4\nx = 2 after squareByValue\n\nz = 4 before squareByReference\nz = 16 after squareByReference\n' }
      ] },

    { title: 'The static counter',
      brief: 'Examples 6.4.1 vs 6.4.2 in one program: write <code>teststatic()</code> with a <code>static int num = 0</code>, print it, increment it; call the function three times. Then predict: what would change if you deleted the word static?',
      starter: '#include <iostream>\nusing namespace std;\n\nvoid teststatic();     // function prototype\n\nint main() {\n    for (int count = 1; count <= 3; count++)\n        teststatic();\n    return 0;\n}\n\nvoid teststatic() {\n    // TODO: a static local, printed as\n    // "The value of the static variable num is <num>"\n    // then incremented\n}\n',
      solution: '#include <iostream>\nusing namespace std;\n\nvoid teststatic();     // function prototype\n\nint main() {\n    for (int count = 1; count <= 3; count++)\n        teststatic();\n    return 0;\n}\n\nvoid teststatic() {\n    static int num = 0;    // created once, remembered between calls\n    cout << "The value of the static variable num is " << num << endl;\n    num++;\n}\n',
      tests: [
        { stdin: '', expect: 'The value of the static variable num is 0\nThe value of the static variable num is 1\nThe value of the static variable num is 2\n' }
      ] },

    { title: 'linearSearch with an array parameter',
      brief: 'Example 6.6.1: fill <code>a[x] = 2 * x</code> for 100 elements, read a search key, and call <code>linearSearch(a, searchKey, arraySize)</code> — note the array passed by name, no brackets. Print <code>Found value in element &lt;i&gt;</code> or <code>Value not found</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint linearSearch(int [], int, int);\n\nint main() {\n    const int arraySize = 100;\n    int a[arraySize], searchKey, element;\n\n    for (int x = 0; x < arraySize; x++)     // create some data\n        a[x] = 2 * x;\n\n    cin >> searchKey;\n    element = linearSearch(a, searchKey, arraySize);\n\n    if (element != -1)\n        cout << "Found value in element " << element << endl;\n    else\n        cout << "Value not found" << endl;\n    return 0;\n}\n\n// TODO: define linearSearch(int array[], int key, int sizeofArray)\n',
      solution: '#include <iostream>\nusing namespace std;\n\nint linearSearch(int [], int, int);\n\nint main() {\n    const int arraySize = 100;\n    int a[arraySize], searchKey, element;\n\n    for (int x = 0; x < arraySize; x++)     // create some data\n        a[x] = 2 * x;\n\n    cin >> searchKey;\n    element = linearSearch(a, searchKey, arraySize);\n\n    if (element != -1)\n        cout << "Found value in element " << element << endl;\n    else\n        cout << "Value not found" << endl;\n    return 0;\n}\n\nint linearSearch(int array[], int key, int sizeofArray) {\n    for (int n = 0; n < sizeofArray; n++)\n        if (array[n] == key)\n            return n;\n    return -1;\n}\n',
      tests: [
        { stdin: '8', expect: 'Found value in element 4\n' },
        { stdin: '198', expect: 'Found value in element 99\n' },
        { stdin: '7', expect: 'Value not found\n' }
      ] },

    { supp: true,
      title: 'Array statistics with reference out-parameters',
      brief: 'Synthesis of the whole chapter: write <code>void stats(int a[], int n, int &amp;sum, double &amp;avg)</code> that returns BOTH results through reference parameters. main reads n (≤ 20) and the values, calls stats once, and prints <code>sum = &lt;sum&gt;</code> and <code>avg = &lt;avg&gt;</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nvoid stats(int a[], int n, int &sum, double &avg);\n\nint main() {\n    int a[20], n;\n    cin >> n;\n    for (int i = 0; i < n; i++)\n        cin >> a[i];\n\n    int sum;\n    double avg;\n    stats(a, n, sum, avg);\n\n    cout << "sum = " << sum << endl;\n    cout << "avg = " << avg << endl;\n    return 0;\n}\n\n// TODO: define stats — fill sum and avg through the references\n',
      solution: '#include <iostream>\nusing namespace std;\n\nvoid stats(int a[], int n, int &sum, double &avg);\n\nint main() {\n    int a[20], n;\n    cin >> n;\n    for (int i = 0; i < n; i++)\n        cin >> a[i];\n\n    int sum;\n    double avg;\n    stats(a, n, sum, avg);\n\n    cout << "sum = " << sum << endl;\n    cout << "avg = " << avg << endl;\n    return 0;\n}\n\nvoid stats(int a[], int n, int &sum, double &avg) {\n    sum = 0;\n    for (int i = 0; i < n; i++)\n        sum += a[i];\n    avg = sum / (double) n;   // why the cast? try removing it\n}\n',
      tests: [
        { stdin: '4 10 20 30 40', expect: 'sum = 100\navg = 25\n' },
        { stdin: '3 1 2 4', expect: 'sum = 7\navg = 2.33333\n' }
      ] }
  ]
};
