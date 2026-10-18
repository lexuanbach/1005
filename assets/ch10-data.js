/* Chapter 10 — Databases
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  id: 10,

  quiz: [
    {
      "q": "Which of these is <em>information</em> rather than raw data?",
      "opts": [
        "The three marks 8.5, 7.0 and 9.0 typed in from the test sheets",
        "The student code SV20260002 printed on a student card",
        "Class X has 40 students and a class average of 7.85",
        "A birth date such as 15/03/2008 stored in a date field"
      ],
      "a": 2,
      "why": "Information is data that has been processed and organised into something meaningful that supports a decision (Table 3.1). The other three are raw facts that mean little on their own."
    },
    {
      "q": "A student changes phone number, and only Student Affairs is told. The Training Department files still hold the old number. Which weakness of the file-based approach is this?",
      "opts": [
        "Duplicated data, which leads to inconsistency",
        "Data dependence, because the field layouts live inside programs",
        "Incompatible file formats between the two departments",
        "Separation and isolation: the files simply sit in different places"
      ],
      "a": 0,
      "why": "The same fact is stored in two places, and an update reached only one of them. Duplication is what makes inconsistency possible."
    },
    {
      "q": "Widening the Address field from 50 to 100 characters means converting the old file and editing every program that reads it. What is this problem called?",
      "opts": [
        "Data redundancy: the same address is stored in too many places",
        "Fixed queries: users cannot define their own reports",
        "Poor concurrency: only one person can open the file at a time",
        "Data dependence: the structure is hard-coded in the programs"
      ],
      "a": 3,
      "why": "In the file approach the layout of each file is defined inside the application programs, so a structural change ripples into every one of them. A database stores the structure separately (data independence)."
    },
    {
      "q": "What is metadata in a database?",
      "opts": [
        "Very large collections of data that no single server can hold, such as logs and sensor readings from millions of users",
        "Data that describes the structure, types and rules of the data, kept in the system catalogue",
        "A backup copy of the data stored on a different machine in case of a failure or a disaster",
        "The result table produced by the most recent SELECT statement, kept in memory for reuse"
      ],
      "a": 1,
      "why": "A database is self-describing: besides the rows it stores metadata (table names, column types, constraints) in the catalogue, so the data can be understood without any particular program."
    },
    {
      "q": "Which statement about the first database models of the 1960s is correct?",
      "opts": [
        "The network model allowed each record only one parent, exactly like a tree structure",
        "The hierarchical model organises data as a parent-child tree, as in IBM’s IMS",
        "Both models let programmers ignore how records were physically linked on disk",
        "The relational model was published in the 1960s and quickly replaced both of them"
      ],
      "a": 1,
      "why": "The hierarchical model is a strict tree (IMS is the classic example). The network model allows many parents, and both forced programmers to navigate physical pointers. The relational model came in 1970."
    },
    {
      "q": "Who published the relational model, and when?",
      "opts": [
        "Donald Chamberlin of IBM, in 1974, together with the SQL language",
        "Larry Ellison of Oracle, in 1980, as the first commercial database product",
        "Tim Kraska and colleagues, in 2018, as part of the learned-index work",
        "E. F. Codd of IBM, in 1970"
      ],
      "a": 3,
      "why": "Codd’s paper “A Relational Model of Data for Large Shared Data Banks” appeared in Communications of the ACM in June 1970. SQL followed in the 1970s; learned indexes are a 2018 idea."
    },
    {
      "q": "Student 211004 has two phone numbers. Which design respects the rule that every cell holds a single atomic value?",
      "opts": [
        "A separate phones table with one row per number, linked by student_id",
        "One cell holding both numbers, separated by a comma, in a single phone column",
        "Two rows in the students table that repeat the same student_id and name",
        "A single phone cell that stores whichever number was typed in most recently"
      ],
      "a": 0,
      "why": "A cell may not hold a list, and a primary key may not repeat. The textbook’s fix is a separate table for the phone numbers, linked back to the student by a foreign key."
    },
    {
      "q": "In STUDENT(SSN, Name, Age), SSN is unique for every student. What is the set {SSN, Name, Age}?",
      "opts": [
        "A key, because the three columns together identify every row uniquely and nothing else could",
        "A foreign key, because it contains several columns that belong to one student",
        "A superkey but not a key, because SSN alone is already enough",
        "Not a superkey, because Name and Age can repeat between two different students"
      ],
      "a": 2,
      "why": "A superkey is any column set that is unique per row. A key must be a minimal superkey: drop Name and Age and SSN still identifies each row, so the larger set is only a superkey."
    },
    {
      "q": "EMPLOYEE.Dno is a foreign key to DEPARTMENT.Dnumber, and the departments are numbered 1, 4 and 5. What happens when you INSERT an employee with Dno = 9?",
      "opts": [
        "It succeeds, and department 9 is added to DEPARTMENT automatically",
        "It succeeds, but the employee is hidden from every query until a department 9 exists",
        "It succeeds, and the database silently changes Dno to NULL",
        "It is refused, because no department 9 exists (referential integrity)"
      ],
      "a": 3,
      "why": "Referential integrity says a foreign-key value must match an existing primary-key value (or be NULL). The lab shows the message “FOREIGN KEY violated … does not match any row”."
    },
    {
      "q": "Why can ORDER BY use a column alias defined in SELECT, while WHERE cannot?",
      "opts": [
        "ORDER BY is the only clause that is allowed to read aliases of numeric columns",
        "The DBMS runs WHERE before SELECT, and ORDER BY after it",
        "The DBMS runs the clauses in the order they are written, but WHERE ignores aliases",
        "Aliases are stored only for the length of the sorting step and are then deleted"
      ],
      "a": 1,
      "why": "The logical order is FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY. When WHERE runs, the alias created in SELECT does not exist yet."
    },
    {
      "q": "The salaries of the 8 employees are 30000, 40000, 25000, 43000, 38000, 25000, 25000 and 55000. How many rows does <code>WHERE Salary BETWEEN 25000 AND 30000</code> return?",
      "opts": [
        "3",
        "0",
        "4",
        "8"
      ],
      "a": 2,
      "why": "BETWEEN includes both end points: the 30000 and the three 25000s make 4 rows. Only the three 25000s would be 3 (excluding the upper end); 0 would exclude both ends."
    },
    {
      "q": "The students table has 10 rows and one NULL in the gpa column. What does <code>SELECT COUNT(*), COUNT(gpa) FROM students</code> return?",
      "opts": [
        "10 and 9",
        "9 and 9",
        "10 and 10",
        "9 and 10"
      ],
      "a": 0,
      "why": "COUNT(*) counts rows; COUNT(column) skips NULLs. So 10 rows but only 9 gpa values."
    },
    {
      "q": "The student names are An, Binh, Colin, Daisy, Binh, Em, Phuc, Giang, Hoa and Khoa. Which condition returns exactly Hoa and Khoa?",
      "opts": [
        "name LIKE '%a'",
        "name LIKE 'a%'",
        "name LIKE '_a'",
        "name LIKE '%a%'"
      ],
      "a": 0,
      "why": "% matches any run of characters, so '%a' means “ends with a”. 'a%' is “starts with a”; '_a' is exactly two characters (no such name); '%a%' also returns Daisy, Giang and An."
    },
    {
      "q": "Why does <code>SELECT Dno FROM EMPLOYEE WHERE COUNT(*) &gt; 2 GROUP BY Dno</code> fail?",
      "opts": [
        "COUNT(*) can only be used on numeric columns, and Dno is a column of department codes",
        "GROUP BY must be written before WHERE, so the statement has its clauses in the wrong order",
        "WHERE filters rows before any groups exist; a condition on groups belongs in HAVING",
        "COUNT(*) is only allowed in the sub-query of a SELECT statement, never in the main query"
      ],
      "a": 2,
      "why": "Aggregates need groups, and groups are formed after WHERE has filtered the rows. A condition on a group’s aggregate is written in HAVING: GROUP BY Dno HAVING COUNT(*) > 2."
    },
    {
      "q": "Department 5 has 4 employees, department 4 has 3, and department 1 has 1. How many rows does <code>SELECT Dno, COUNT(*) FROM EMPLOYEE GROUP BY Dno HAVING COUNT(*) &gt; 2</code> return?",
      "opts": [
        "3",
        "2",
        "1",
        "8"
      ],
      "a": 1,
      "why": "GROUP BY makes three groups; HAVING keeps those with more than 2 members: departments 5 and 4. Department 1 is filtered out."
    },
    {
      "q": "The average salary is 35 125. How many of the 8 employees (salaries 30000, 40000, 25000, 43000, 38000, 25000, 25000, 55000) does <code>WHERE Salary &gt; (SELECT AVG(Salary) FROM EMPLOYEE)</code> return?",
      "opts": [
        "3",
        "5",
        "2",
        "4"
      ],
      "a": 3,
      "why": "The sub-query is evaluated first and gives 35 125. The salaries above it are 40000, 43000, 38000 and 55000: four employees."
    },
    {
      "q": "Given <code>CREATE TABLE t (id INTEGER PRIMARY KEY, label TEXT NOT NULL);</code> followed by <code>INSERT INTO t VALUES (1, &#39;a&#39;);</code> and then <code>INSERT INTO t VALUES (1, &#39;b&#39;);</code>, what happens?",
      "opts": [
        "Both rows are stored, because the label values are different from each other",
        "The second INSERT replaces the first row, so the table ends up with one row",
        "The second INSERT is refused because label may only contain a single letter",
        "The second INSERT is refused because the primary key 1 already exists"
      ],
      "a": 3,
      "why": "A primary key must be unique. The database refuses the statement and the table keeps its single row. Constraints are checked for every statement, whatever program sends it."
    },
    {
      "q": "In the library database, BookLoan has <code>CHECK (dueDate &gt; borrowedDate)</code>. Which rule refuses <code>INSERT INTO BookLoan VALUES (2, &#39;978-1400079444&#39;, &#39;2025-05-28&#39;, &#39;2025-05-20&#39;, NULL, 101)</code>?",
      "opts": [
        "The CHECK: the due date is earlier than the borrowing date",
        "The PRIMARY KEY: copy 2 of this book has already been borrowed once before",
        "The FOREIGN KEY: borrower 101 does not exist in the Borrower table",
        "The NOT NULL rule: actReturnDate must have a value when a loan is created"
      ],
      "a": 0,
      "why": "Borrower 101 and copy 2 of that ISBN both exist, and (2, ISBN, 2025-05-28) is a new key. Only the CHECK fails: 2025-05-20 is not later than 2025-05-28."
    },
    {
      "q": "Why does the textbook create EMPLOYEE without its Dno foreign key and add the key later with ALTER TABLE?",
      "opts": [
        "A foreign key can only be created after the table already contains at least one row of data to check",
        "EMPLOYEE and DEPARTMENT refer to each other, so neither can name the other while it is being created",
        "ALTER TABLE is the only statement that is allowed to declare a foreign key in SQL Server or any other system",
        "Foreign keys slow down CREATE TABLE a great deal, so they are always added afterwards to save time"
      ],
      "a": 1,
      "why": "Dno points at DEPARTMENT and Mgr_ssn points back at EMPLOYEE: a circular reference. Create the tables first, then add the missing foreign key with ALTER TABLE."
    },
    {
      "q": "What does a database index store?",
      "opts": [
        "A complete second copy of the whole table, with the rows in random order",
        "The text of the most recent queries, so they can be repeated more quickly",
        "Sorted values of the indexed column, each with a pointer to its row",
        "Only the NULL values of the column, so that they never need to be searched"
      ],
      "a": 2,
      "why": "An index is like the index of a book: a sorted list of values with pointers to where the data is. The search happens in the small sorted index; the pointer leads to the row."
    },
    {
      "q": "A table has 2 000 rows, no index on customer_id, and 19 rows match <code>customer_id = 42</code>. How many rows does the DBMS have to read to find them?",
      "opts": [
        "Only the 19 matching rows",
        "About 11, by a binary search",
        "All 2 000",
        "About 1 000 on average, then it stops"
      ],
      "a": 2,
      "why": "Without an index the rows are not sorted by customer_id, so the DBMS cannot know it has found them all until it has read every row: a full table scan."
    },
    {
      "q": "A sorted index has 1 000 000 entries. About how many comparisons does a binary search need in the worst case?",
      "opts": [
        "About 1 000, because that is the square root of a million entries",
        "About 500 000, because on average half of the entries are checked",
        "About 1 000 000, because every entry has to be compared once",
        "About 20, because 2 to the power 20 is just over a million"
      ],
      "a": 3,
      "why": "Each comparison halves the remaining entries, so n entries need about log2 n steps: 20 for a million, 30 for a billion."
    },
    {
      "q": "Which query can <em>not</em> use an ordinary index on the column <code>item</code>?",
      "opts": [
        "WHERE item LIKE '%ho'",
        "WHERE item = 'Pho'",
        "WHERE item IN ('Pho', 'Che')",
        "WHERE item BETWEEN 'Banh' AND 'Com'"
      ],
      "a": 0,
      "why": "The index is sorted by the whole value, so it can answer =, IN and ranges. Words that merely end in “ho” are scattered all over the sorted list, so the DBMS has to scan."
    },
    {
      "q": "A table receives thousands of INSERTs a minute and is almost never searched by column X. What does an index on X mostly do?",
      "opts": [
        "It speeds up every INSERT, because the rows are kept in sorted order",
        "It slows every write and uses space, for almost no benefit",
        "It makes the table smaller by compressing the values of column X",
        "Nothing at all, because indexes are only consulted by SELECT statements"
      ],
      "a": 1,
      "why": "Each INSERT, UPDATE and DELETE must also update the index, and the index takes storage. It pays off only for columns that queries filter or join on."
    },
    {
      "q": "Which kind of NoSQL system best fits the question “which friends of my friends could I recommend?” in a social network?",
      "opts": [
        "A key–value store, such as Redis or DynamoDB",
        "A graph database, such as Neo4j",
        "A document database, such as MongoDB",
        "A column-family store, such as Cassandra or HBase"
      ],
      "a": 1,
      "why": "Graph databases store nodes and relationships and are built to follow them: friends of friends is a short walk through the graph."
    },
    {
      "q": "What is the core idea of a <em>learned index</em>?",
      "opts": [
        "A trained model predicts where a key sits in the sorted data, instead of walking a tree",
        "The index watches which queries are asked most often and deletes the rest of the table",
        "Rows are sorted by a neural network every single time a new row is inserted into the table",
        "Binary search is replaced by asking the user to type in the exact position of the key"
      ],
      "a": 0,
      "why": "Kraska et al. observe that an index is a model that maps a key to a position in a sorted array, and propose replacing it with other models, “from sorting to predicting”."
    },
    {
      "q": "What is the <em>lakehouse</em> design trying to combine?",
      "opts": [
        "The strict relational schema of a warehouse with the eventual consistency of NoSQL",
        "The speed of an in-memory cache with the long-term durability of a tape archive",
        "The privacy of a personal laptop with the sharing features of a social network",
        "The cheap storage of a data lake with the ACID transactions of a data warehouse"
      ],
      "a": 3,
      "why": "A lakehouse keeps raw data cheaply in open files like a lake, but adds a transaction layer (for example Delta Lake or Apache Iceberg) so that tables behave like a warehouse, with ACID guarantees."
    }
  ],

  exercises: [
    {
      "type": "text",
      "title": "Build the Library database (textbook 3.9.1)",
      "brief": "You are designing the database of a library (textbook Table 3.8). Open the lab, choose <strong>Blank &mdash; design your own</strong>, and write the <code>CREATE TABLE</code> statements for these four tables, with every key and rule:<br>\n<strong>Book</strong>(ISBN CHAR(14) &mdash; primary key; title VARCHAR(50) &mdash; required; edition INT &mdash; must be greater than 0; publishedYear NUMERIC(4))<br>\n<strong>BookCopy</strong>(copyNo INT; ISBN CHAR(14) &mdash; foreign key to Book; status VARCHAR(10) &mdash; default 'good'; <em>(copyNo, ISBN) together are the primary key</em>)<br>\n<strong>Borrower</strong>(borrowerNo INT &mdash; primary key; borrowerName VARCHAR(30) &mdash; required; address VARCHAR(50))<br>\n<strong>BookLoan</strong>(copyNo INT; ISBN CHAR(14); borrowedDate DATE; dueDate DATE &mdash; required, must be after borrowedDate; actReturnDate DATE; BNo INT &mdash; foreign key to Borrower; <em>(copyNo, ISBN, borrowedDate) is the primary key; (copyNo, ISBN) is a foreign key to BookCopy</em>)<br>\nRun the script and check the schema browser shows 4 tables with PK and FK badges. In what order must you create them?",
      "solutionText": "CREATE TABLE Book (\n  ISBN CHAR(14) PRIMARY KEY,\n  title VARCHAR(50) NOT NULL,\n  edition INT CHECK (edition > 0),\n  publishedYear NUMERIC(4)\n);\nCREATE TABLE BookCopy (\n  copyNo INT,\n  ISBN CHAR(14),\n  status VARCHAR(10) DEFAULT 'good',\n  PRIMARY KEY (copyNo, ISBN),\n  FOREIGN KEY (ISBN) REFERENCES Book(ISBN)\n);\nCREATE TABLE Borrower (\n  borrowerNo INT PRIMARY KEY,\n  borrowerName VARCHAR(30) NOT NULL,\n  address VARCHAR(50)\n);\nCREATE TABLE BookLoan (\n  copyNo INT,\n  ISBN CHAR(14),\n  borrowedDate DATE,\n  dueDate DATE NOT NULL,\n  actReturnDate DATE,\n  BNo INT,\n  PRIMARY KEY (copyNo, ISBN, borrowedDate),\n  FOREIGN KEY (BNo) REFERENCES Borrower(borrowerNo),\n  FOREIGN KEY (copyNo, ISBN) REFERENCES BookCopy(copyNo, ISBN),\n  CHECK (dueDate > borrowedDate)\n);\n\n-- Notes\n-- * Create Book and Borrower first: BookCopy and BookLoan point at them.\n-- * BookCopy has a COMPOSITE primary key (copyNo, ISBN): copy numbers repeat from book to book.\n-- * BookLoan's foreign key to BookCopy is also composite: (copyNo, ISBN).\n-- * Check: the schema browser should list 4 tables, with PK and FK badges."
    },
    {
      "type": "text",
      "title": "Which inserts does the database accept? (textbook 3.9.2, in the lab)",
      "brief": "Choose the <strong>Library</strong> database in the lab (it already holds the sample data of Tables 3.9&ndash;3.12 and every constraint of Table 3.8). Run each statement below on its own, <em>after pressing Reset database</em>, and decide: accepted or refused? If refused, which rule is broken?<br>\n<code>a. (1, '978-0743273111', '2025-05-10', '2025-05-25', NULL, 101)</code><br>\n<code>b. (1, NULL, '2025-05-10', '2025-05-20', NULL, 101)</code><br>\n<code>c. (1, '978-1400079333', '2025-05-10', '2025-05-20', '2025-05-21', 111)</code><br>\n<code>d. (2, '978-1400079444', '2025-05-28', '2025-05-20', NULL, 101)</code><br>\n<code>e. (3, '978-1400079444', '2025-06-01', '2025-06-15', NULL, 103)</code><br>\n<code>f. (4, '978-1400079333', '2025-06-05', '2025-06-20', NULL, 104)</code><br>\n<code>g. (1, '978-0141439222', '2025-06-10', '2025-06-25', NULL, 102)</code><br>\n<code>h. (5, '978-1400079444', '2025-06-15', '2025-06-30', NULL, 101)</code><br>\nEach one is the values of <code>INSERT INTO BookLoan VALUES (...)</code>. Predict first, then run.",
      "solutionText": "a. REFUSED - PRIMARY KEY. Copy 1 of 978-0743273111 was already borrowed on 2025-05-10, so (copyNo, ISBN, borrowedDate) would repeat.\nb. REFUSED - ISBN is part of the primary key, so it cannot be NULL (entity integrity). It would also break the foreign key to BookCopy.\nc. REFUSED - FOREIGN KEY. Borrower 111 does not exist (BNo must match a borrowerNo).\nd. REFUSED - CHECK (dueDate > borrowedDate): the due date 2025-05-20 is before the borrowed date 2025-05-28.\ne. ACCEPTED - copy 3 of 978-1400079444 exists, borrower 103 exists, the key (3, ISBN, 2025-06-01) is new, and the dates are in order.\nf. ACCEPTED - copy 4 of the C++ book exists and so does borrower 104.\ng. ACCEPTED - copy 1 of 978-0141439222 exists, borrower 102 exists, and it was never borrowed on 2025-06-10 before.\nh. REFUSED - FOREIGN KEY on (copyNo, ISBN). The book 978-1400079444 has only copies 1 to 3, so copy 5 does not exist.\n\n(Lab message for a: \"PRIMARY KEY violated: there is already a row with copyNo = 1, ISBN = '978-0743273111', borrowedDate = '2025-05-10' in BookLoan.\")\nPress Reset database between runs if you want each statement to start from the original data. Note: the real SQLite program accepts (b), a historic quirk; standard SQL and this lab refuse it."
    },
    {
      "type": "text",
      "title": "Library queries, part 1 (textbook 3.9.3 a to e)",
      "brief": "Choose the <strong>Library</strong> database in the lab and write SQL for each request, then run it and compare with the expected row count in the solution.<br>\na. The names of all books published in 2019.<br>\nb. Books whose title contains &ldquo;Database&rdquo; and that were published in 2019 or later.<br>\nc. Borrowers whose name contains &ldquo;a&rdquo; (any case) and whose address contains &ldquo;St&rdquo;.<br>\nd. Loans borrowed in May 2025 whose due date is after 20 May 2025.<br>\ne. All books (ISBN, title, edition) that nobody has ever borrowed.",
      "solutionText": "-- a. names of the books published in 2019\nSELECT title FROM Book WHERE publishedYear = 2019;\n--    -> Database System Concepts; Fundamentals of Database Systems\n\n-- b. title contains 'Database' and published in 2019 or later\nSELECT * FROM Book WHERE title LIKE '%Database%' AND publishedYear >= 2019;\n--    -> the same two books (the AI book was published in 2022 but has no 'Database' in its title)\n\n-- c. borrower name contains 'a' (any case) and address contains 'St'\nSELECT * FROM Borrower WHERE borrowerName LIKE '%a%' AND address LIKE '%St%';\n--    -> all 4 borrowers. (LIKE ignores case here, so 'Main St', 'Oak St', 'Pine St' and 'Weast St' all match.)\n\n-- d. loans borrowed in May 2025 with a due date after 2025-05-20\nSELECT * FROM BookLoan\nWHERE borrowedDate >= '2025-05-01' AND borrowedDate <= '2025-05-31'\n  AND dueDate > '2025-05-20';\n--    -> 4 loans (the loan from 2025-05-10 is due exactly on 05-20, so it is not \"after\")\n\n-- e. books never borrowed by anyone\nSELECT ISBN, title, edition FROM Book\nWHERE ISBN NOT IN (SELECT ISBN FROM BookLoan);\n--    -> 978-1400079333, The C++ Programming Language, 4"
    },
    {
      "type": "text",
      "title": "Library queries, part 2: joins, groups, sub-queries (textbook 3.9.3 f to j)",
      "brief": "Same database. These need <code>IN</code>/<code>NOT IN</code> sub-queries, <code>GROUP BY</code> and <code>HAVING</code> (or a join).<br>\nf. The titles of books that have been borrowed at least once.<br>\ng. The number and name of borrowers who have borrowed more than 2 <em>different</em> books.<br>\nh. The borrowers (number, name) who have never returned a book late.<br>\ni. The copies (copyNo, ISBN) that are currently on loan (not yet returned) and belong to a title with 3 or more copies.<br>\nj. The titles (ISBN, title) that have never been borrowed and have 3 or more copies.",
      "solutionText": "-- f. titles borrowed at least once\nSELECT title FROM Book WHERE ISBN IN (SELECT ISBN FROM BookLoan);\n--    -> Database System Concepts; Fundamentals of Database Systems; The Age of AI: And Our Human Future\n\n-- g. borrowers who have borrowed MORE THAN 2 DIFFERENT books\nSELECT b.borrowerNo, b.borrowerName\nFROM Borrower b JOIN BookLoan l ON l.BNo = b.borrowerNo\nGROUP BY b.borrowerNo, b.borrowerName\nHAVING COUNT(DISTINCT l.ISBN) > 2;\n--    -> 101, Mark King (three different books)\n\n-- h. borrowers who have never returned a book late\nSELECT borrowerNo, borrowerName FROM Borrower\nWHERE borrowerNo NOT IN (SELECT BNo FROM BookLoan WHERE actReturnDate > dueDate);\n--    -> all 4 borrowers: nobody returned late. (Borrowers with no loans, or whose books are still out,\n--       count too. A NULL actReturnDate makes the comparison unknown, so that loan is not \"late\".)\n\n-- i. copies currently out (not yet returned) that belong to a title with 3 or more copies\nSELECT c.copyNo, c.ISBN\nFROM BookCopy c\nWHERE EXISTS (SELECT 1 FROM BookLoan l\n              WHERE l.copyNo = c.copyNo AND l.ISBN = c.ISBN AND l.actReturnDate IS NULL)\n  AND c.ISBN IN (SELECT ISBN FROM BookCopy GROUP BY ISBN HAVING COUNT(*) >= 3);\n--    -> (1, 978-0743273111), (3, 978-0141439222), (3, 978-1400079444)\n\n-- j. titles never borrowed that have 3 or more copies\nSELECT ISBN, title FROM Book\nWHERE ISBN NOT IN (SELECT ISBN FROM BookLoan)\n  AND ISBN IN (SELECT ISBN FROM BookCopy GROUP BY ISBN HAVING COUNT(*) >= 3);\n--    -> 978-1400079333, The C++ Programming Language (it has 4 copies)"
    },
    {
      "type": "text",
      "title": "Make an index earn its keep (lab: Canteen database)",
      "brief": "Choose the <strong>Canteen</strong> database (2 000 orders). Use the plan panel's <em>rows read</em>, <em>index steps</em> and <em>total work</em>.<br>\n1. Run <code>SELECT * FROM orders WHERE customer_id = 42;</code> and record the numbers.<br>\n2. Create an index on <code>customer_id</code> and run the same query again. How many times less work is it?<br>\n3. Run <code>SELECT * FROM orders WHERE customer_id + 0 = 42;</code> Why did the plan change back?<br>\n4. Create an index on <code>day</code> and run <code>WHERE day &gt;= '2026-10-01'</code>. Is the index worth it for this query? Compare with <code>'2026-10-25'</code>.<br>\n5. With the customer_id index in place, run <code>UPDATE orders SET customer_id = 7 WHERE order_id = 1500;</code> and read the message. What is the cost of an index?<br>\n6. Run the customers/orders join with and without the customer_id index (it is preset 7).",
      "solutionText": "1. SELECT * FROM orders WHERE customer_id = 42;\n   Plan: SCAN orders. Rows read 2000, index steps 0, total work 2000 (19 rows returned).\n2. CREATE INDEX idx_orders_customer ON orders (customer_id);  then run the query again.\n   Plan: SEARCH orders USING INDEX idx_orders_customer. Rows read 19, index steps 31, total work 50. That is 40 times less work (2000 / 50).\n   The ORDER of the rows may differ from step 1: without ORDER BY the order is not promised.\n3. SELECT * FROM orders WHERE customer_id + 0 = 42;\n   Back to SCAN: rows read 2000. The index is sorted by customer_id, not by customer_id + 0, so the database cannot use it.\n   Rewrite it as customer_id = 42 and the index works again.\n4. CREATE INDEX idx_orders_day ON orders (day);  SELECT * FROM orders WHERE day >= '2026-10-01';\n   The index IS used, but 1007 rows match, so rows read 1007 + index steps 1018 = 2025 total work, slightly MORE than a plain scan (2000).\n   An index pays off when few rows match. With '2026-10-25' (209 rows) the work is 429.\n5. UPDATE orders SET customer_id = 7 WHERE order_id = 1500;\n   Message: \"1 index entry had to be moved as well\". The index made reading cheaper but every write to customer_id must also fix the index.\n   (Reset the database afterwards if you want the original data back.)\n6. Joining: SELECT c.name, COUNT(*) AS orders_placed FROM customers c JOIN orders o ON o.customer_id = c.customer_id GROUP BY c.name ORDER BY orders_placed DESC LIMIT 5;\n   Without the customer_id index the plan shows 100 scans of orders: 200 100 rows read. With the index: 2 100 rows read + 3 198 index steps = 5 298."
    },
    {
      "type": "text",
      "title": "Keys, relationships and a flawed slide (paper + lab)",
      "brief": "<strong>Part A.</strong> The lecture figure shows STUDENTS(Student_ID, Name, Year) and COURSES(Course_ID, Course_name, Student_ID), where <code>CS102</code> appears twice with two different students. (1) Why can't Course_ID be COURSES' primary key? (2) Why are Name and e-mail poor keys for STUDENTS? (3) Redesign the tables so every fact is stored once, name the primary and foreign keys, and say what kind of relationship students&ndash;courses really is.<br>\n<strong>Part B (lab, University database).</strong> Run the &ldquo;Bad primary key demo&rdquo;, then try (i) an INSERT into <code>students</code> that reuses the e-mail <code>an@uni.edu</code>, and (ii) <code>DELETE FROM students WHERE student_id = 211001;</code>. For each error, say which key or constraint caused it.",
      "solutionText": "Part A (on paper)\n1. CS102 appears twice in the slide's COURSES table (once for student 211003, once for 211001). A primary key must be unique, so Course_ID cannot be the key. {Course_ID, Student_ID} would be unique, but then the course name is repeated in every row: duplication and the risk of inconsistency (rename one copy and not the other).\n2. \"Binh\" is not a key for STUDENTS either (two students share it), and e-mail addresses change. Use the stable, meaningless Student_ID.\n3. Redesign (one fact in one place):\n   STUDENTS(Student_ID PK, Name, Year, GPA)\n   COURSES(Course_ID PK, Course_name, Credits)\n   ENROLMENTS(Student_ID FK, Course_ID FK, Grade, PRIMARY KEY (Student_ID, Course_ID))\n   The relationship is many-to-many: a student takes many courses AND a course has many students. The third table turns it into two one-to-many relationships.\n\nPart B (in the lab, University database)\n- The 'Bad primary key demo' preset: the second INSERT of 'Binh' is refused: \"PRIMARY KEY violated: there is already a row with name = 'Binh' in people.\" A name cannot be a key, because real people share names.\n- INSERT INTO students (student_id, name, year, email) VALUES (211011, 'Lan', 2, 'an@uni.edu');\n  -> \"UNIQUE violated: there is already a row with email = 'an@uni.edu' in students.\" The e-mail is a candidate key (UNIQUE) but not the primary key: it is guarded, but we would not use it as the key because it can change.\n- DELETE FROM students WHERE student_id = 211001;\n  -> \"Can't delete from students: 2 row(s) of enrolments still point to student_id = 211001 (FOREIGN KEY, ON DELETE RESTRICT).\" Referential integrity stops a student from vanishing while enrolments still refer to them. Delete the enrolments first (or declare the foreign key ON DELETE CASCADE)."
    }
  ]
};
