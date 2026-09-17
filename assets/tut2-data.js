/* Tutorial 2 — Basic Elements of C++
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-2.html). window.TUTORIAL_DATA, not
   CHAPTER_DATA — pure practice: starter skeleton only, no solution shown. */
window.TUTORIAL_DATA = {
  id: 2,
  title: 'Basic Elements of C++',

  exercises: [
    { title: 'Print pi with a chosen width and precision',
      brief: 'Read a field width and a number of decimal places from the user, then display &pi; formatted with exactly that width and that many decimal places (use <code>setw</code>, <code>setprecision</code>, and <code>fixed</code> from <code>&lt;iomanip&gt;</code>).',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    const double PI = 3.14159265358979;\n    int width, places;\n\n    cout << "Enter field width: ";\n    // TODO: read width\n\n    cout << "Enter number of decimal places: ";\n    // TODO: read places\n\n    // TODO: print PI using setw(width), setprecision(places), and fixed\n\n    return 0;\n}\n' },

    { title: 'Sum of two numbers',
      brief: 'Read two numbers from the keyboard and compute their sum. Match the sample transcript exactly: <code>Sum of two numbers :</code>, a divider line, then the two prompts and the result line.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double num1, num2;\n\n    cout << "Sum of two numbers :" << endl;\n    cout << "-------------------------" << endl;\n\n    cout << "Input 1st number : ";\n    // TODO: read num1\n\n    cout << "Input 2nd number : ";\n    // TODO: read num2\n\n    // TODO: print "The sum of the numbers is : " followed by num1 + num2\n\n    return 0;\n}\n' },

    { title: 'Swap two numbers',
      brief: 'Read two numbers from the keyboard and swap their values (using a third, temporary variable — do not use the library <code>swap()</code>), then print both numbers after swapping.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double num1, num2, temp;\n\n    cout << "Swap two numbers :" << endl;\n    cout << "-----------------------" << endl;\n\n    cout << "Input 1st number : ";\n    // TODO: read num1\n\n    cout << "Input 2nd number : ";\n    // TODO: read num2\n\n    // TODO: swap num1 and num2 using temp\n\n    // TODO: print "After swapping the 1st number is : " << num1\n    // TODO: print "After swapping the 2nd number is : " << num2\n\n    return 0;\n}\n' },

    { title: 'Area and perimeter of a rectangle',
      brief: 'Read the length and width of a rectangle, then compute and print its area (<code>length &times; width</code>) and its perimeter (<code>2 &times; (length + width)</code>).',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double length, width;\n\n    cout << "Find the Area and Perimeter of a Rectangle :" << endl;\n    cout << "-------------------------------------------------" << endl;\n\n    cout << "Input the length of the rectangle : ";\n    // TODO: read length\n\n    cout << "Input the width of the rectangle : ";\n    // TODO: read width\n\n    // TODO: print "The area of the rectangle is : " << area\n    // TODO: print "The perimeter of the rectangle is : " << perimeter\n\n    return 0;\n}\n' },

    { title: 'Arithmetic with mixed data types',
      brief: 'Using the fixed values <code>int</code> 5 and 7, and <code>double</code> 3.7 and 8.0, display the twelve results of +, -, *, / applied to (int, int), (double, double), and (int, double) pairs — one line per operation, in the form <code>a + b = result</code>. Notice which combinations keep a fractional part and which ones truncate.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int i1 = 5, i2 = 7;\n    double d1 = 3.7, d2 = 8.0;\n\n    cout << "Display arithmetic operations with mixed data type :" << endl;\n    cout << "---------------------------------------------------------" << endl;\n\n    // TODO: print the 4 operations (+ - * /) for i1, i2\n\n    // TODO: print the 4 operations (+ - * /) for d1, d2\n\n    // TODO: print the 4 operations (+ - * /) for i1, d2\n\n    return 0;\n}\n' },

    { title: 'Volume of a sphere',
      brief: 'Read the radius of a sphere and compute its volume (<code>4/3 &times; &pi; &times; r&sup3;</code>). Use <code>std::fixed</code> and <code>std::setprecision(2)</code> to round the result to two decimal places.',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    const double PI = 3.14159265358979;\n    double radius, volume;\n\n    cout << "Input the radius of the sphere : ";\n    // TODO: read radius\n\n    // TODO: compute volume = (4.0 / 3.0) * PI * radius * radius * radius\n\n    // TODO: print the volume with fixed and setprecision(2)\n\n    return 0;\n}\n' },

    { title: 'Volume of a cylinder',
      brief: 'Read the radius and height of a cylinder and compute its volume (<code>&pi; &times; r&sup2; &times; h</code>). Use <code>std::fixed</code> and <code>std::setprecision(2)</code> to round the result to two decimal places.',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    const double PI = 3.14159265358979;\n    double radius, height, volume;\n\n    cout << "Input the radius of the cylinder : ";\n    // TODO: read radius\n\n    cout << "Input the height of the cylinder : ";\n    // TODO: read height\n\n    // TODO: compute volume = PI * radius * radius * height\n\n    // TODO: print the volume with fixed and setprecision(2)\n\n    return 0;\n}\n' },

    { title: 'Sum and mean of four numbers',
      brief: 'Read four numbers, then compute and print their sum and their arithmetic mean. Use <code>std::fixed</code> and <code>std::setprecision(2)</code> to round both results to two decimal places.',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    double n1, n2, n3, n4;\n\n    // TODO: read n1, n2, n3, n4\n\n    // TODO: compute sum and mean (mean = sum / 4.0)\n\n    // TODO: print sum and mean, each with fixed and setprecision(2)\n\n    return 0;\n}\n' },

    { title: 'A rectangle of digits',
      brief: 'Read a single-digit number, then print a 4-column, 6-row rectangle made of that digit: the top and bottom rows are the digit repeated 4 times, and the four rows in between show the digit only in the first and last column (two blank spaces in the middle). No loops needed — six <code>cout</code> lines will do.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    int digit;\n\n    cout << "Input the number : ";\n    // TODO: read digit\n\n    // TODO: print the top row: digit printed 4 times, e.g. 5555\n    // TODO: print 4 middle rows: digit, two spaces, digit, e.g. 5  5\n    // TODO: print the bottom row: digit printed 4 times again\n\n    return 0;\n}\n' },

    { title: 'Sum of three variables',
      brief: 'Declare three numeric variables, assign or read their values, and print their sum.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double a, b, c;\n\n    // TODO: assign or read values for a, b, and c\n\n    // TODO: compute and print their sum\n\n    return 0;\n}\n' },

    { title: 'Square of a number',
      brief: 'Declare a numeric variable, assign it a value, and print the square of that value.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double x;\n\n    // TODO: assign a value to x\n\n    // TODO: compute and print the square of x\n\n    return 0;\n}\n' },

    { title: 'Solving ax + b = 0',
      brief: 'Assign values to two numbers a and b, then compute and print the value of x that solves <code>ax + b = 0</code> (that is, <code>x = -b / a</code>). Assume a is not zero.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    double a, b, x;\n\n    // TODO: assign values to a and b (a must not be 0)\n\n    // TODO: compute x = -b / a and print it\n\n    return 0;\n}\n' }
  ]
};
