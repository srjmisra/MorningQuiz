// Edit this file to change the quiz. Each question needs exactly 4 options.
// image is optional — set to a path like "/shared/images/foo.png" or leave null.

module.exports = {
  title: "Artificial Intelligence and Computer Vision Quiz",
  questions: [
    {
      category: "Artificial Intelligence",
      question: "Which of the following is a branch of Artificial Intelligence?",
      image: null,
      options: ["Machine Learning", "Cyber forensics", "Full-Stack Development", "Network Design"],
      correctIndex: 0,
      explanation: "Machine Learning is a core sub-area of AI, alongside Computer Vision, Robotics, and NLP, used to train models for specific tasks.",
      timeLimitSeconds: 20
    },
    {
      category: "Artificial Intelligence",
      question: "What is the goal of Artificial Intelligence?",
      image: null,
      options: ["To solve artificial problems", "To extract scientific causes", "To explain various sorts of intelligence", "To solve real-world problems"],
      correctIndex: 2,
      explanation: "Artificial Intelligence aims to explain and replicate the many different forms that intelligence can take.",
      timeLimitSeconds: 20
    },
    {
      category: "Artificial Intelligence",
      question: "Into how many categories is the process of Artificial Intelligence typically divided?",
      image: null,
      options: ["5 categories", "Based on the input provided", "3 categories", "Not categorized"],
      correctIndex: 2,
      explanation: "AI processes break down into three categories: sensing (gathering data), reasoning (processing it), and acting (producing a response).",
      timeLimitSeconds: 20
    },
    {
      category: "Artificial Intelligence",
      question: "What is the function of an Artificial Intelligence \"Agent\"?",
      image: null,
      options: ["Mapping of goal sequence to an action", "Working without direct interference from people", "Mapping of percept sequence to an action", "Mapping of environment sequence to an action"],
      correctIndex: 2,
      explanation: "An agent function maps a sequence of percepts — what the agent has sensed — to an action, implemented via agent software.",
      timeLimitSeconds: 20
    },
    {
      category: "Artificial Intelligence",
      question: "Which of the following is not a commonly used programming language for Artificial Intelligence?",
      image: null,
      options: ["Perl", "Java", "PROLOG", "LISP"],
      correctIndex: 0,
      explanation: "Perl is a general-purpose scripting language, not one associated with AI development, unlike LISP, PROLOG, and Java.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "What is the primary goal of Computer Vision?",
      image: null,
      options: ["To create computer hardware", "To enable computers to understand and interpret images and videos", "To improve internet speed", "To design computer networks"],
      correctIndex: 1,
      explanation: "Computer Vision is the AI field focused on enabling computers to analyze and interpret images and video.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which of the following is an example of a Computer Vision application?",
      image: null,
      options: ["Spam email filtering", "Face recognition in smartphones", "Text translation", "Audio compression"],
      correctIndex: 1,
      explanation: "Face recognition uses facial features captured in images or video to identify or verify a person — a classic Computer Vision application.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "In Computer Vision, an image is primarily represented as:",
      image: null,
      options: ["A collection of pixels", "A paragraph of text", "An audio signal", "A database table"],
      correctIndex: 0,
      explanation: "Digital images are made up of pixels, tiny picture elements that store color or intensity values.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which of the following tasks involves identifying and locating objects in an image?",
      image: null,
      options: ["Object Detection", "Data Compression", "Word Processing", "Spreadsheet Calculation"],
      correctIndex: 0,
      explanation: "Object Detection both identifies objects in an image and locates them, typically by drawing bounding boxes around them.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which of the following best describes image classification in Computer Vision?",
      image: null,
      options: ["Identifying the category of the entire image", "Finding the exact location of every object in an image", "Converting an image into text", "Improving the brightness of an image"],
      correctIndex: 0,
      explanation: "Image classification assigns a single label to an entire image, unlike object detection, which also locates objects within it.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which branch of Artificial Intelligence focuses on enabling computers to interpret and analyze visual information from images and videos?",
      image: null,
      options: ["Natural Language Processing (NLP)", "Computer Vision", "Robotics", "Expert Systems"],
      correctIndex: 1,
      explanation: "Computer Vision is the branch of AI that enables computers to process and interpret visual information from images and video.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which of the following best describes image classification in Computer Vision?",
      image: null,
      options: ["Identifying the category of the entire image", "Finding the exact location of every object in an image", "Converting an image into text", "Improving the brightness of an image"],
      correctIndex: 0,
      explanation: "Image classification assigns a single label to an entire image, unlike object detection, which also locates objects within it.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which branch of Artificial Intelligence focuses on enabling computers to interpret and analyze visual information from images and videos?",
      image: null,
      options: ["Natural Language Processing (NLP)", "Computer Vision", "Robotics", "Expert Systems"],
      correctIndex: 1,
      explanation: "Computer Vision is the branch of AI that enables computers to process and interpret visual information from images and video.",
      timeLimitSeconds: 20
    },
    {
      category: "Computer Vision",
      question: "Which of the following is the correct sequence in a basic Computer Vision workflow?",
      image: null,
      options: ["Decision → Image Capture → Image Processing → Feature Extraction", "Image Capture → Image Processing → Feature Extraction → Decision/Recognition", "Feature Extraction → Image Capture → Decision → Image Processing", "Image Processing → Decision → Image Capture → Feature Extraction"],
      correctIndex: 1,
      explanation: "A typical Computer Vision pipeline runs image capture, then image processing, then feature extraction, before a final decision or recognition step.",
      timeLimitSeconds: 20
    }
  ]
};
