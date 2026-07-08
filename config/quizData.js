// Edit this file to change the quiz. Each question needs exactly 4 options.
// image is optional — set to a path like "/shared/images/foo.png" or leave null.

module.exports = {
  title: "Code to Career — CS & IP Quiz",
  questions: [
    {
      category: "Data Structures",
      question: "Which data structure follows the LIFO (Last-In-First-Out) principle?",
      image: null,
      options: ["Queue", "Stack", "Linked List", "Graph"],
      correctIndex: 1,
      explanation: "A Stack is LIFO — the last element pushed is the first one popped. Think of a stack of plates.",
      timeLimitSeconds: 20
    },
    {
      category: "Python",
      question: "In Python, which keyword is used to define a function?",
      image: null,
      options: ["function", "def", "fun", "define"],
      correctIndex: 1,
      explanation: "Python uses the 'def' keyword to define a function, e.g. def greet():",
      timeLimitSeconds: 15
    },
    {
      category: "Databases",
      question: "What does SQL stand for?",
      image: null,
      options: [
        "Structured Query Language",
        "Simple Question Language",
        "Sequential Query Logic",
        "Structured Question Loop"
      ],
      correctIndex: 0,
      explanation: "SQL = Structured Query Language, used to query and manage relational databases.",
      timeLimitSeconds: 15
    },
    {
      category: "Python",
      question: "Which of these is NOT a valid Python data type?",
      image: null,
      options: ["list", "tuple", "array", "dict"],
      correctIndex: 2,
      explanation: "Python has no built-in 'array' type by that name — it uses list, tuple, dict, and set natively (array requires the array/numpy module).",
      timeLimitSeconds: 20
    },
    {
      category: "Networking",
      question: "In networking, what does IP stand for?",
      image: null,
      options: ["Internet Protocol", "Internal Process", "Intranet Path", "Information Packet"],
      correctIndex: 0,
      explanation: "IP stands for Internet Protocol — the addressing/routing scheme for data across networks.",
      timeLimitSeconds: 15
    },
    {
      category: "Algorithms",
      question: "Which sorting algorithm has the best average-case time complexity?",
      image: null,
      options: ["Bubble Sort", "Selection Sort", "Quick Sort", "Insertion Sort"],
      correctIndex: 2,
      explanation: "Quick Sort averages O(n log n), while Bubble, Selection, and Insertion Sort average O(n²).",
      timeLimitSeconds: 20
    },
    {
      category: "Web Development",
      question: "In HTML, which tag is used to link an external CSS file?",
      image: null,
      options: ["<style>", "<css>", "<link>", "<script>"],
      correctIndex: 2,
      explanation: "The <link> tag (with rel=\"stylesheet\") connects an external CSS file to an HTML document.",
      timeLimitSeconds: 15
    },
    {
      category: "Algorithms",
      question: "What is the time complexity of binary search on a sorted array?",
      image: null,
      options: ["O(n)", "O(n²)", "O(log n)", "O(1)"],
      correctIndex: 2,
      explanation: "Binary search halves the search space each step, giving O(log n) time complexity.",
      timeLimitSeconds: 20
    },
    {
      category: "Databases",
      question: "Which of these is a NoSQL database?",
      image: null,
      options: ["MySQL", "PostgreSQL", "Oracle", "MongoDB"],
      correctIndex: 3,
      explanation: "MongoDB is a document-oriented NoSQL database; the other three are relational (SQL) databases.",
      timeLimitSeconds: 15
    },
    {
      category: "Networking",
      question: "In IP addressing, how many bits does an IPv4 address have?",
      image: null,
      options: ["16", "32", "64", "128"],
      correctIndex: 1,
      explanation: "IPv4 addresses are 32 bits long (four 8-bit octets), e.g. 192.168.1.1. IPv6 uses 128 bits.",
      timeLimitSeconds: 20
    }
  ]
};
