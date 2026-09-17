/* Tutorial 3 — Selection Structures
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-3.html). window.TUTORIAL_DATA, not
   CHAPTER_DATA — pure practice: starter skeleton only, no solution shown. */
window.TUTORIAL_DATA = {
  id: 3,
  title: 'Selection Structures',

  exercises: [
    { title: 'The larger of two integers',
      brief: 'Read two integers a and b from the keyboard, compare them, and print the larger value. If the two numbers are equal, print <code>Equal</code> instead.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n\n    // TODO: read a and b\n\n    // TODO: if a > b, print a; else if b > a, print b; else print "Equal"\n\n    return 0;\n}\n' },

    { title: 'Solving the quadratic equation',
      brief: 'Read coefficients a, b, c and solve <code>ax&sup2; + bx + c = 0</code>. If a = 0 it reduces to the linear equation bx + c = 0 (single root -c/b, or "No solution" / "Infinite solutions" when b = 0). Otherwise compute the discriminant &Delta; = b&sup2; - 4ac and print two real roots (&Delta; &gt; 0), one repeated root (&Delta; = 0), or the two complex conjugate roots p &plusmn; qi (&Delta; &lt; 0).',
      starter: '#include <iostream>\n#include <cmath>\nusing namespace std;\n\nint main() {\n    double a, b, c;\n\n    // TODO: read a, b, and c\n\n    if (a == 0) {\n        // TODO: linear case bx + c = 0\n        //   b != 0        -> print x = -c / b\n        //   b == 0, c != 0 -> print "No solution"\n        //   b == 0, c == 0 -> print "Infinite solutions"\n    } else {\n        // TODO: compute delta = b*b - 4*a*c\n\n        // TODO: delta > 0  -> print the two real roots\n        // TODO: delta == 0 -> print the repeated root\n        // TODO: delta < 0  -> print p +/- qi using p = -b/(2a), q = sqrt(|delta|)/(2a)\n    }\n\n    return 0;\n}\n' },

    { title: 'Grade classification',
      brief: 'Read a total score N (0-100) and classify it: 90-100 &rarr; A, 80-89 &rarr; B, 70-79 &rarr; C, 60-69 &rarr; D, below 60 &rarr; F. If N is outside 0-100, print <code>Invalid value</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int n;\n\n    // TODO: read n\n\n    // TODO: if n < 0 or n > 100, print "Invalid value"\n    // TODO: otherwise classify n into A/B/C/D/F using the ranges above\n\n    return 0;\n}\n' },

    { title: 'A basic calculator',
      brief: 'Read two integers and an operator character (+, -, *, or /), perform the corresponding operation, and print the result. Print an error message for an unrecognized operator, and a separate error message when dividing by zero.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int num1, num2;\n    char op;\n\n    // TODO: read num1, op, and num2 (e.g. cin >> num1 >> op >> num2;)\n\n    // TODO: switch on op:\n    //   case \'+\': print num1 + num2\n    //   case \'-\': print num1 - num2\n    //   case \'*\': print num1 * num2\n    //   case \'/\': if num2 == 0, print an error; else print num1 / num2\n    //   default:  print an error for an unknown operator\n\n    return 0;\n}\n' },

    { title: 'Days in a month',
      brief: 'Read a month (1-12) and a year (a positive integer), then print how many days that month has. Months 1,3,5,7,8,10,12 have 31 days; months 4,6,9,11 have 30 days; month 2 has 29 days in a leap year (divisible by 400, or by 4 but not by 100) and 28 otherwise. Print "Month does not exist" for an out-of-range month, or "Year does not exist" for a non-positive year.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int month, year;\n\n    // TODO: read month and year\n\n    // TODO: if year <= 0, print "Year does not exist"\n    // TODO: else if month < 1 or month > 12, print "Month does not exist"\n    // TODO: else decide the number of days:\n    //   - 31-day months, 30-day months, and month 2 (check the leap year rule)\n\n    return 0;\n}\n' }
  ]
};
