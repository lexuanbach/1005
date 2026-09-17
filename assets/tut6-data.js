/* Tutorial 6 — Functions
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-6.html). window.TUTORIAL_DATA, not
   CHAPTER_DATA — pure practice: starter skeleton only, no solution shown. */
window.TUTORIAL_DATA = {
  id: 6,
  title: 'Functions',

  exercises: [
    { title: 'Solve ax - b = 0',
      brief: 'Write a function that takes two values a and b and prints the solution x of <code>ax - b = 0</code> (that is, x = b/a). The function should print an error message when a = 0 (no solution if b &ne; 0, infinitely many solutions if b = 0), instead of dividing by zero.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define void solveLinear(double a, double b)\n//   - if a == 0 and b != 0: print "No solution"\n//   - if a == 0 and b == 0: print "Infinite solutions"\n//   - otherwise: print x = b / a\n\nint main() {\n    double a, b;\n    cin >> a >> b;\n\n    // TODO: call solveLinear(a, b)\n\n    return 0;\n}\n' },

    { title: 'Factorial function',
      brief: 'Write a function that computes the factorial of a non-negative integer n (n!).',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define long factorial(int n) — loop or recursion, your choice\n\nint main() {\n    int n;\n    cin >> n;\n\n    // TODO: call factorial(n) and print the result\n\n    return 0;\n}\n' },

    { title: 'Maximum of two numbers',
      brief: 'Write a function that finds the maximum value of two numbers.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define double findMax(double x, double y)\n\nint main() {\n    double a, b;\n    cin >> a >> b;\n\n    // TODO: call findMax(a, b) and print the result\n\n    return 0;\n}\n' },

    { title: 'Maximum of three numbers (reusing findMax)',
      brief: 'Reuse the two-number maximum function from the previous exercise to build a function that finds the maximum of three numbers (call it twice: max(max(a,b), c)).',
      starter: '#include <iostream>\nusing namespace std;\n\ndouble findMax(double x, double y) {\n    // TODO: same as the previous exercise\n    return 0;\n}\n\n// TODO: define double findMax3(double a, double b, double c) using findMax twice\n\nint main() {\n    double a, b, c;\n    cin >> a >> b >> c;\n\n    // TODO: call findMax3(a, b, c) and print the result\n\n    return 0;\n}\n' },

    { title: 'Maximum of two, by reference',
      brief: 'Redo the "maximum of two numbers" exercise, but this time using pass-by-reference: the function takes a and b by value and writes the larger one into a third parameter passed by reference, instead of returning it.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define void findMaxRef(double a, double b, double &result)\n//   store the larger of a and b into result\n\nint main() {\n    double a, b, result;\n    cin >> a >> b;\n\n    // TODO: call findMaxRef(a, b, result), then print result\n\n    return 0;\n}\n' },

    { title: 'Maximum and minimum of three, together',
      brief: 'Write a function that simultaneously finds the maximum and minimum values of three numbers, reporting both through reference parameters.',
      starter: '#include <iostream>\nusing namespace std;\n\n// TODO: define void findMaxMin(double a, double b, double c, double &maxVal, double &minVal)\n\nint main() {\n    double a, b, c, maxVal, minVal;\n    cin >> a >> b >> c;\n\n    // TODO: call findMaxMin(a, b, c, maxVal, minVal)\n\n    // TODO: print maxVal and minVal\n\n    return 0;\n}\n' }
  ]
};
