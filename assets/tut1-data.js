/* Tutorial 1 — Algorithms & Flowcharts
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-1.html, since this uses a different
   global name than the chapter pages: window.TUTORIAL_DATA, not CHAPTER_DATA).
   Pure practice: starter skeleton only, no solution, no automated tests. */
window.TUTORIAL_DATA = {
  id: 1,
  title: 'Algorithms & Flowcharts',

  exercises: [
    { title: 'Sum of two numbers',
      brief: 'Read two numbers A and B, then display their sum. On paper, also sketch the flowchart and write the pseudocode for this algorithm first — here, focus on translating that same logic into a runnable C++ program.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double a, b;\n\n    // TODO: read a and b with cin\n\n    // TODO: compute the sum and print it, e.g.\n    // cout << "Sum = " << (a + b) << endl;\n\n    return 0;\n}\n' },

    { title: 'The smaller of two numbers',
      brief: 'Read two numbers A and B, then display the smaller of the two. On paper, also sketch the flowchart/pseudocode (a single decision block); here, write the C++ equivalent.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double a, b;\n\n    // TODO: read a and b with cin\n\n    // TODO: compare a and b, and print whichever is smaller\n\n    return 0;\n}\n' },

    { title: 'The smallest of three numbers',
      brief: 'Read three numbers A, B, and C, then display the smallest of the three. On paper, sketch the flowchart/pseudocode with nested decisions; here, write the C++ version.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double a, b, c;\n\n    // TODO: read a, b, and c with cin\n\n    // TODO: find and print the smallest of the three\n\n    return 0;\n}\n' },

    { title: 'Read until zero',
      brief: 'Repeatedly read numbers from the user until the user enters 0 (the loop itself does not need to print anything else). On paper, this is a pretest loop in the flowchart/pseudocode; here, translate it into a C++ <code>while</code> loop.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double num;\n\n    cout << "Enter a number (0 to stop): ";\n    // TODO: read the first value into num\n\n    // TODO: while num is not 0:\n    //   - prompt and read the next value into num\n\n    cout << "Done." << endl;\n    return 0;\n}\n' },

    { title: 'Sum until zero',
      brief: 'Repeatedly read numbers from the user until the user enters 0; then display the sum of all the numbers that were entered (not counting the terminating 0). Same loop shape as the previous exercise, plus a running total.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double num, sum;\n    sum = 0;\n\n    cout << "Enter a number (0 to stop): ";\n    // TODO: read the first value into num\n\n    // TODO: while num is not 0:\n    //   - add num to sum\n    //   - prompt and read the next value into num\n\n    cout << "Sum = " << sum << endl;\n    return 0;\n}\n' }
  ]
};
