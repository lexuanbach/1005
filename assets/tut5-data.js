/* Tutorial 5 — Arrays and Strings
   Practice exercises data, rendered by assets/course.js (via the small
   inline loader in tutorials/tutorial-5.html). window.TUTORIAL_DATA, not
   CHAPTER_DATA — pure practice: starter skeleton only, no solution shown. */
window.TUTORIAL_DATA = {
  id: 5,
  title: 'Arrays and Strings',

  exercises: [
    { title: 'An array of grade letters',
      brief: 'Declare an array of 5 characters containing \'A\', \'B\', \'C\', \'D\', and \'F\', then print each element on a separate line.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // TODO: declare and initialize a char array of 5 with {\'A\',\'B\',\'C\',\'D\',\'F\'}\n\n    // TODO: loop i = 0..4, printing the i-th element followed by endl\n\n    return 0;\n}\n' },

    { title: 'Sum of a fixed array',
      brief: 'Compute the sum of the elements of the array <code>int a[12] = {1, 3, 5, 4, 7, 2, 99, 16, 45, 67, 89, 45};</code>',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    const int arraySize = 12;\n    int a[arraySize] = {1, 3, 5, 4, 7, 2, 99, 16, 45, 67, 89, 45};\n    int total = 0;\n\n    // TODO: loop over the array, accumulating every element into total\n\n    cout << "Total of array element values is " << total << endl;\n    return 0;\n}\n' },

    { title: 'Is the matrix symmetric?',
      brief: 'Read a 3x3 matrix of integers and determine whether it is symmetric (that is, <code>a[i][j] == a[j][i]</code> for every i, j).',
      starter: '#include <iostream>\nusing namespace std;\n\nconst int N = 3;\n\nint main() {\n    int a[N][N];\n    bool symmetric = true;\n\n    // TODO: read all N*N values into a with a double loop\n\n    // TODO: check a[i][j] == a[j][i] for every i, j; set symmetric = false if any pair differs\n\n    if (symmetric)\n        cout << "The matrix is symmetric" << endl;\n    else\n        cout << "The matrix is not symmetric" << endl;\n    return 0;\n}\n' },

    { title: 'Student score table',
      brief: 'Read three students\' IDs and their three scores each (score_1, score_2, score_3). Compute <code>final_score = 0.2*score_1 + 0.3*score_2 + 0.5*score_3</code> for each student, then print a table with each student\'s ID, their three scores, and their final score, aligned with <code>setw()</code>.',
      starter: '#include <iostream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    const int NUM_STUDENTS = 3;\n    int id[NUM_STUDENTS];\n    double score1[NUM_STUDENTS], score2[NUM_STUDENTS], score3[NUM_STUDENTS], finalScore[NUM_STUDENTS];\n\n    // TODO: loop over the 3 students, reading id[i], score1[i], score2[i], score3[i]\n    //       and computing finalScore[i] = 0.2*score1[i] + 0.3*score2[i] + 0.5*score3[i]\n\n    cout << "+------+---------+---------+---------+-------------+" << endl;\n    cout << "|  ID  | Score 1 | Score 2 | Score 3 | Final Score |" << endl;\n    cout << "+------+---------+---------+---------+-------------+" << endl;\n\n    // TODO: loop over the 3 students, printing one aligned row per student\n    //       using setw() for each column\n\n    cout << "+------+---------+---------+---------+-------------+" << endl;\n    return 0;\n}\n' },

    { title: 'A simple profile (cin and getline together)',
      brief: 'Read a user\'s full name, age, and address, then display them as a simple profile. Read the full name and address with <code>getline()</code>, and the age with <code>cin</code> — this exercise practices mixing both, and handling the leftover newline between them.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    string fullName, address, discard;\n    int age;\n\n    cout << "Enter your full name: ";\n    // TODO: read fullName with getline(cin, fullName)\n\n    cout << "Enter your age: ";\n    // TODO: read age with cin >> age\n\n    // TODO: cin >> age leaves a leftover newline in the input, which would make\n    // the next getline() read an empty line — consume it first, e.g.\n    // getline(cin, discard);\n\n    cout << "Enter your address: ";\n    // TODO: read address with getline(cin, address)\n\n    cout << endl << "----- Profile -----" << endl;\n    // TODO: print "Name: " << fullName\n    // TODO: print "Age: " << age\n    // TODO: print "Address: " << address\n\n    return 0;\n}\n' },

    { title: 'First and last character',
      brief: 'Declare the string "Hello World!", then print its first and last characters using <code>.at()</code>.',
      starter: '#include <iostream>\nusing namespace std;\n\nint main() {\n    string s = "Hello World!";\n\n    // TODO: print the first character using s.at(0)\n    // TODO: print the last character using s.at(s.length() - 1)\n\n    return 0;\n}\n' }
  ]
};
