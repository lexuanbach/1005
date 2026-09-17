/* Tutorial 4 — Repetition Structures
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-4.html). window.TUTORIAL_DATA, not
   CHAPTER_DATA — pure practice: starter skeleton only, no solution shown. */
window.TUTORIAL_DATA = {
  id: 4,
  title: 'Repetition Structures',

  exercises: [
    { title: 'Sum from 1 to n',
      brief: 'Read a positive integer n and compute the sum of the integers from 1 to n.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n, sum = 0;\n\n    // TODO: read n\n\n    // TODO: loop i = 1..n, adding i to sum\n\n    cout << "Sum = " << sum << endl;\n    return 0;\n}\n' },

    { title: 'Factorial of n',
      brief: 'Read a positive integer n and compute n! (n factorial). The program must reject negative input with an error message instead of computing anything.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    long fact = 1;\n\n    // TODO: read n\n\n    // TODO: if n < 0, print an error message\n    // TODO: otherwise loop i = 1..n, multiplying fact by i, then print fact\n\n    return 0;\n}\n' },

    { title: 'Prime or not',
      brief: 'Read an integer n and determine whether it is a prime number.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n    bool isPrime = true;\n\n    // TODO: read n\n\n    // TODO: test divisibility by every i from 2 up to n-1 (or sqrt(n));\n    //       if any divides n evenly, isPrime = false\n\n    // TODO: print whether n is prime (handle n < 2 as not prime)\n\n    return 0;\n}\n' },

    { title: 'All divisors of n',
      brief: 'Read a positive integer n and print all of its positive divisors.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n\n    // TODO: read n\n\n    // TODO: loop i = 1..n, printing i whenever n % i == 0\n\n    return 0;\n}\n' },

    { title: 'Sum of digits',
      brief: 'Read a positive integer n and compute the sum of its digits.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n, sum = 0;\n\n    // TODO: read n\n\n    // TODO: while n > 0: add (n % 10) to sum, then n = n / 10\n\n    cout << "Sum of digits = " << sum << endl;\n    return 0;\n}\n' },

    { title: 'Reverse the digits',
      brief: 'Read a positive integer n and print its digits in reverse order. For example, 12345 should be printed as 54321.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n, reversed = 0;\n\n    // TODO: read n\n\n    // TODO: while n > 0: reversed = reversed * 10 + (n % 10), then n = n / 10\n\n    cout << "Reversed = " << reversed << endl;\n    return 0;\n}\n' },

    { title: 'Multiplication tables 2-9',
      brief: 'Print the multiplication tables from 2 through 9, using nested loops (outer loop over the table number, inner loop over 1..10, say).',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: outer loop: table = 2..9\n    //   TODO: inner loop: i = 1..10, printing "table x i = " << table * i\n\n    return 0;\n}\n' },

    { title: 'A right triangle of asterisks',
      brief: 'Read a height n and print a right triangle of asterisks: row 1 has one <code>*</code>, row 2 has two, and so on up to row n.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n\n    // TODO: read n\n\n    // TODO: outer loop: row = 1..n\n    //   TODO: inner loop: print row asterisks, then a newline\n\n    return 0;\n}\n' },

    { title: 'Sum and count until zero',
      brief: 'Let the user enter integers one at a time. The program stops when the user enters 0, then prints the sum and the number of nonzero values that were entered.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int value, sum = 0, count = 0;\n\n    cout << "Enter an integer (0 to stop): ";\n    // TODO: read the first value\n\n    // TODO: while value != 0:\n    //   - add value to sum, increment count\n    //   - prompt and read the next value\n\n    cout << "Sum = " << sum << endl;\n    cout << "Count = " << count << endl;\n    return 0;\n}\n' },

    { title: 'Sum of positives, with continue and break',
      brief: 'Continuously read integers and compute the sum of all positive integers entered. On a positive integer, add it to the sum. On a negative integer, use <code>continue</code> to skip it and read the next value. On 0, use <code>break</code> to stop the loop. After the loop, print the sum of positive integers.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int value, sum = 0;\n\n    while (true) {\n        cout << "Enter an integer: ";\n        // TODO: read value\n\n        // TODO: if value == 0, break\n        // TODO: else if value < 0, continue (skip it, do not add)\n        // TODO: else add value to sum\n    }\n\n    cout << "Sum of positive integers: " << sum << endl;\n    return 0;\n}\n' }
  ]
};
