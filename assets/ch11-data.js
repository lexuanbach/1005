/* Chapter 11 — Artificial Intelligence
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
 "id": 11,
 "quiz": [
  {
   "q": "A pocket calculator multiplies two 8-digit numbers faster than any person. Why do we still not call it \"intelligent\" in the sense of AI?",
   "opts": [
    "It has no screen large enough to show a result as a human-readable explanation of how the product was found",
    "It makes arithmetic mistakes whenever the numbers are large, so it cannot be trusted with any real intelligence task",
    "It only follows a fixed procedure someone wrote down; it cannot learn, adapt, or decide in new situations",
    "It is not connected to the internet, and only networked machines are able to qualify as artificial intelligence"
   ],
   "a": 2,
   "why": "Speed at arithmetic is not intelligence. The chapter's test is whether a machine can learn, understand, adapt and decide in complex situations, not just run a known procedure quickly."
  },
  {
   "q": "Which statement about the 1956 Dartmouth workshop is correct?",
   "opts": [
    "A 1956 summer research project proposed by McCarthy, Minsky, Rochester and Shannon; the usual start of AI as a field",
    "It was a one-day conference at which John McCarthy alone presented the first working chatbot to the public audience",
    "It was held in 2012 to celebrate the result of AlexNet, and the term \"artificial intelligence\" had not been used before it",
    "It was organised by a technology company to launch the first commercial neural-network product to paying customers"
   ],
   "a": 0,
   "why": "The Dartmouth Summer Research Project on Artificial Intelligence (1956) was proposed by four researchers and is where AI took shape as a research field. It was a community effort, not one person's invention."
  },
  {
   "q": "In the slogan \"AI is a function, Y = F(x)\", which part is the model?",
   "opts": [
    "x: the raw data that goes into the system, such as an image, a sentence or a signal",
    "Y: the answer that comes out, which might be a label, a number, some text or an action",
    "The equals sign, which stands for the learning process that connects the input to the output",
    "F: the function that turns an input into an output, with parameters set by training"
   ],
   "a": 3,
   "why": "x is the input, Y is the output and F is the model, the thing that is learned. Learning means choosing F's parameters so that F(x) gives good answers."
  },
  {
   "q": "A list of daily temperature readings from a sensor is turned into \"the average temperature today was 31 °C\". In the data → information → knowledge → intelligence chain, what is that average?",
   "opts": [
    "Data: it is still just a raw measurement taken directly from the sensor itself",
    "Information: raw data organised to answer a specific question",
    "Knowledge: it already links the number to rules about what a rise means for the system",
    "Intelligence: it already decides and acts on the number without any further reasoning"
   ],
   "a": 1,
   "why": "Raw readings are data. Organising them to answer a question (what was the average?) gives information. Knowledge would add context and rules, such as \"an unusual rise signals a fault\"."
  },
  {
   "q": "According to the chapter, which of the six human capabilities of intelligence is still the weakest and the main research frontier?",
   "opts": [
    "Language: AI cannot yet produce fluent text, translate, or summarise documents",
    "Reasoning from knowledge: long, consistent, verifiable multi-step deduction",
    "Vision: AI still cannot classify photographs or detect objects with any reliability",
    "Communication: AI cannot convert speech to text, so voice assistants do not exist yet"
   ],
   "a": 1,
   "why": "Language and vision are now strong (with caveats); reasoning that is long, consistent and checkable remains the hardest, which is why research combines language models with retrieval, knowledge and verification."
  },
  {
   "q": "A traffic camera draws a rectangle around each car in an image. Which computer-vision task is this?",
   "opts": [
    "Image classification: one label for the whole picture, with no location at all",
    "Segmentation: a label for every single pixel, so no rectangles are drawn",
    "Generation: creating a brand-new image that did not exist in the camera feed",
    "Object detection: what is there and where, as a bounding box"
   ],
   "a": 3,
   "why": "Classification says what is in the picture, detection adds where (a box), and segmentation labels each pixel. Boxes around cars is detection."
  },
  {
   "q": "What is the core difference between a spam filter and a generative AI system?",
   "opts": [
    "The filter labels existing input; a generative model creates new text, images or code",
    "The filter uses data and the generative model does not; it is built entirely from hand-written rules",
    "The filter runs on a phone and the generative model can only ever run on a server in a data centre",
    "The filter is always correct, whereas a generative model can never be checked for correctness at all"
   ],
   "a": 0,
   "why": "Both can be learned from data. The difference is the kind of output: a decision about existing data versus newly created content."
  },
  {
   "q": "A chatbot confidently cites a research paper that does not exist. This is called:",
   "opts": [
    "Overfitting: the model has memorised its training set and cannot make predictions",
    "Segmentation: the model has split the text into separate pieces that no longer fit",
    "Hallucination: fluent, convincing output that is not true",
    "Clustering: the model has grouped unlabelled data into a made-up category of papers"
   ],
   "a": 2,
   "why": "Language models produce text that is likely given the context, not text that is checked against reality, so a confident invented reference is possible. Verify important claims against real sources."
  },
  {
   "q": "The 2017 paper \"Attention Is All You Need\" introduced the Transformer. What is the key idea of its attention mechanism?",
   "opts": [
    "The model pays attention to the user's face through the camera so that it can answer politely",
    "The model reads text strictly one word at a time and forgets everything that came earlier",
    "The model stores a hand-written dictionary of grammar rules that a linguist has typed in",
    "When processing a word, the model can weigh how relevant every other word in the context is"
   ],
   "a": 3,
   "why": "Attention lets the model look at all the relevant parts of the context at once and weight them, capturing long-range relations and allowing efficient training on very large data."
  },
  {
   "q": "Which of these is an example of INFERENCE rather than training?",
   "opts": [
    "The model compares its predictions with the real prices and computes the total squared error on the data",
    "The gradient of the error is computed and the slope a is nudged a little in the opposite direction",
    "A trained model gets a new 140 m² house and outputs a price; its parameters stay unchanged",
    "The learning rate is lowered because the loss curve showed the previous steps overshooting the minimum"
   ],
   "a": 2,
   "why": "Inference uses frozen parameters on new input to produce an output. Measuring error, computing gradients and changing parameters are all part of training."
  },
  {
   "q": "Which description of TRAINING is most accurate?",
   "opts": [
    "Typing out every rule the computer must follow so that no example data is needed for any decision",
    "Repeatedly adjusting parameters so predictions on example data get closer to the known answers",
    "Running a finished model on a new input to obtain one prediction at a time for the end user",
    "Copying the model onto a phone or camera so that it can run without a network connection"
   ],
   "a": 1,
   "why": "Training is the learning phase: show examples, measure error, adjust parameters, repeat. The finished model is then used for inference."
  },
  {
   "q": "Why is a hand-written rule list a poor way to build a spam filter that must last for years?",
   "opts": [
    "Spammers change their wording and tricks, so every rule needs exceptions and constant manual updates",
    "C++ if-statements cannot test text at all, so rules for email are not possible in any language",
    "Rules always produce a probability, and probabilities cannot be turned into a spam or not-spam decision",
    "A rule can only be applied once per email, so a second rule would never be checked at all"
   ],
   "a": 0,
   "why": "Rules are brittle: each has exceptions, and the world keeps changing. Learning from labelled examples lets a model pick up new patterns when it is retrained on new data."
  },
  {
   "q": "What is generalization in machine learning?",
   "opts": [
    "Using one single model for every task in the world, from vision to speech to robot control",
    "Remembering every training example exactly so that none of them is ever answered wrongly",
    "Doing well on new examples the model has never seen, not just on the training examples",
    "Collecting data from as many different countries as possible before training can begin"
   ],
   "a": 2,
   "why": "A model that only memorises its training emails fails on tomorrow's emails. Generalization is the ability to apply what was learned to new cases, and it is what we really want."
  },
  {
   "q": "A shop has purchase records of thousands of customers but no labels. A model groups them into \"regulars\", \"bargain hunters\" and \"big spenders\" by itself. This is:",
   "opts": [
    "Unsupervised learning: finding structure in unlabelled data",
    "Supervised learning: the model learns from pairs of inputs and correct labels",
    "Reinforcement learning: an agent learns by trial and error from rewards",
    "Rule-based programming: a person wrote down the three customer groups beforehand"
   ],
   "a": 0,
   "why": "No labels were given and the model discovered the groups itself: clustering, the classic unsupervised task."
  },
  {
   "q": "A robot receives a reward each time it moves closer to a goal without falling, and a penalty when it falls. It slowly improves its walking. What kind of learning is this?",
   "opts": [
    "Supervised learning: every step it takes is paired with a human-provided correct label",
    "Unsupervised learning: it clusters sensor readings without any feedback signal from the world",
    "Transfer learning: it copies the finished weights from a model trained on an unrelated task",
    "Reinforcement learning: an agent learns by trial, reward and penalty"
   ],
   "a": 3,
   "why": "There are no labelled answers, only rewards and penalties received while acting. This is reinforcement learning, suited to sequential decisions."
  },
  {
   "q": "To train a language model without paid human labelling, a program hides a word in a sentence and asks the model to predict it. What is this called?",
   "opts": [
    "Supervised learning with hand-made labels that a person typed in for each sentence",
    "Self-supervised learning: the labels come from the data itself",
    "Reinforcement learning with a score from a human judge after every single sentence",
    "Clustering: the program groups similar sentences and then names each group by hand"
   ],
   "a": 1,
   "why": "The hidden word is the label, and it was already in the text. This is how very large language models learn from huge text collections without manual labelling."
  },
  {
   "q": "In a spam model that uses \"number of links\", \"number of ALL-CAPS words\" and \"sender domain\" as inputs, these three inputs are called:",
   "opts": [
    "Features: the measurable properties of an example that the model uses",
    "Labels: the correct answers that the model is trying to predict for each email",
    "Parameters: the numbers that training adjusts so that the predictions improve",
    "Hallucinations: details that the model has invented and that are not in the email"
   ],
   "a": 0,
   "why": "Features describe an example; labels are the target; parameters (weights) are what training adjusts. Mixing these three up is the most common beginner confusion."
  },
  {
   "q": "A hiring model is trained on past resumes. The team deletes the \"gender\" column and claims the model is now free of gender bias. What is the flaw?",
   "opts": [
    "Deleting a column makes the model slower, and slower models are always more biased than fast ones",
    "Models can only be biased when the word \"gender\" appears literally in the training data they see",
    "There is no flaw: a model cannot learn anything about a person from information it was not given",
    "Other features can act as proxies for gender, so the bias can still be learned from them"
   ],
   "a": 3,
   "why": "Names of schools, activities, wording and career gaps can correlate with gender. The model can pick up the pattern from these proxy features even when the explicit column is gone."
  },
  {
   "q": "Which statement about AI, machine learning (ML) and deep learning (DL) is correct?",
   "opts": [
    "AI, ML and DL are three names for exactly the same technology and may be used interchangeably",
    "ML is a part of DL, and DL is a part of AI; every AI system is built from a neural network",
    "DL is part of ML, ML is part of AI; some AI, such as expert systems, uses no learning",
    "DL is a part of AI but not of ML, because deep learning never learns from data to improve"
   ],
   "a": 2,
   "why": "Nested sets: AI is the broadest goal, ML builds AI from data, DL uses many-layered neural networks within ML. Rule-based and search-based systems are AI but not ML."
  },
  {
   "q": "Using the line y = 3x + 3 (x = size in m², y = price in thousand $), the error for the 120 m² house that really sold for 350 is defined as actual − predicted. What is it?",
   "opts": [
    "+13, because the line predicts 337 and the house sold for 350",
    "−13, because the line predicts 363 and the house sold for 350",
    "−363, because that is the value the line produces for 120 m²",
    "+350, because the actual price is the only thing the error uses"
   ],
   "a": 1,
   "why": "Predicted = 3·120 + 3 = 363. Error = 350 − 363 = −13: the line over-estimates this house by 13 thousand dollars."
  },
  {
   "q": "Why does linear regression square each error before adding them up?",
   "opts": [
    "Squaring makes every error smaller than one, so the total error is always close to zero",
    "The computer cannot subtract numbers unless both of them have been squared first",
    "Squared errors always lead to a straight line that passes through every single data point",
    "Otherwise + and − errors cancel, and squaring punishes big mistakes more"
   ],
   "a": 3,
   "why": "With signs, +7 and −7 would add to zero and look perfect. Squares are never negative and make a big miss count much more. (Squares also make the calculus simpler.)"
  },
  {
   "q": "At the current parameters, the gradient dL/da is positive (+100). What should gradient descent do to a?",
   "opts": [
    "Increase a a little, because a positive gradient means the error is still too low",
    "Decrease a a little, because increasing a would make the total error grow",
    "Leave a unchanged, because only a negative gradient is allowed to change anything",
    "Set a to zero, because a positive gradient means the slope has no effect on error"
   ],
   "a": 1,
   "why": "The gradient points toward increasing error, so we step the opposite way: a ← a − η·dL/da. Positive gradient, so a goes down."
  },
  {
   "q": "During training the loss gets bigger at every step, soon reaching astronomically large numbers. Which fix is most likely to help?",
   "opts": [
    "Lower the learning rate: the steps are so large that each one overshoots the minimum",
    "Raise the learning rate so that the steps become larger and reach the minimum sooner",
    "Add more training steps, because the loss will come down once enough of them have run",
    "Delete half of the data, since less data always makes the error smaller and smoother"
   ],
   "a": 0,
   "why": "Exploding loss is the signature of a learning rate that is too big: each step overshoots the valley and lands higher up the other side. Smaller steps fix it."
  },
  {
   "q": "A security camera runs object detection on a chip inside the camera instead of sending all video to the cloud. Which benefit is NOT a typical reason for this edge-AI design?",
   "opts": [
    "The decision can be made with lower delay because no round trip over the network is needed",
    "Much less video has to be sent over the network, which saves bandwidth for the system",
    "A tiny chip runs a model of any size with no accuracy loss versus a data-centre GPU",
    "Raw footage can stay on the device, which can reduce privacy risks from stored video"
   ],
   "a": 2,
   "why": "Edge AI helps latency, bandwidth and privacy, but small devices have limited memory, power and speed, so models must be optimised and may lose some accuracy. The claim of no loss at any size is the false one."
  },
  {
   "q": "Which dataset is likely to give the better plant-disease model?",
   "opts": [
    "One million leaf photos with many wrong labels, taken in one lab under perfect light",
    "10,000 carefully labelled leaf photos taken in different fields, lights and phones",
    "One million photos scraped from the web and left unchecked since more is always better",
    "Fifty identical photos of one healthy leaf, copied many times to make the set look big"
   ],
   "a": 1,
   "why": "Good data is correct, representative and diverse, not merely large. A million mislabelled or unrepresentative images can teach a worse model than a smaller, careful, varied set (volume without veracity)."
  },
  {
   "q": "A straight line is fitted to the villa data (200 m² → $11.6 M … 1,800 m² → $320.6 M). Its errors are small in the middle but large and systematic at both ends. What does this show?",
   "opts": [
    "The learning rate was too large, so running gradient descent for longer would remove the pattern",
    "The data contains typing mistakes in the middle, which should be deleted before any model is fitted",
    "The model family is wrong: the data curves, so a quadratic would fit better than any line",
    "Gradient descent cannot find the best line, so a human must set a and b by hand for this data"
   ],
   "a": 2,
   "why": "When no choice of a and b can remove the pattern in the errors, the shape of the model is the problem. A curve (more parameters) can follow accelerating growth that a line cannot."
  },
  {
   "q": "Which use of a chatbot in your studies matches the \"assistant, not a substitute\" principle?",
   "opts": [
    "Ask it to explain a concept, check the answer against the textbook, then rewrite it in your own words",
    "Paste the assignment, copy the answer without reading it, and submit it because the AI is probably right",
    "Ask it for references, and put them in your report without opening them because they look professional",
    "Let it read the course notes instead of you, so that you only need to read its short summary of them"
   ],
   "a": 0,
   "why": "The learner stays responsible: verify with sources, restate in your own words, and probe the weaknesses. Copying unverified output skips the learning and risks hallucinated facts."
  },
  {
   "q": "A slide says AI will \"add $2.6–4.4 trillion to global GDP over the next decade\". The McKinsey estimate it appears to come from says something different. What?",
   "opts": [
    "It forecast that AI would reduce global GDP by about $4.4 trillion in total over the next ten years",
    "It measured the cost of training one chatbot, which came to between $2.6 and $4.4 trillion in total",
    "About $2.6–4.4 trillion of value per year across 63 generative-AI use cases, not a GDP forecast",
    "It counted the number of jobs that AI will remove, which will be between 2.6 and 4.4 trillion in all"
   ],
   "a": 2,
   "why": "McKinsey's 2023 report estimated generative AI could add the equivalent of $2.6–4.4 trillion annually across the 63 use cases it analysed (a potential, with many assumptions). Quote the real source and wording, not the slide's paraphrase."
  }
 ],
 "exercises": [
  {
   "type": "text",
   "title": "x, F and Y — name the pieces",
   "brief": "For each system, write down (1) the input <strong>x</strong>, (2) the output <strong>Y</strong>, (3) what the <strong>training data</strong> would have to look like, and (4) one thing that could go wrong because of the data: <strong>(a)</strong> an email spam filter, <strong>(b)</strong> face unlock on a phone, <strong>(c)</strong> a university admissions chatbot, <strong>(d)</strong> an explainable knee X-ray assistant.",
   "solutionText": "(a) Spam filter\n  x: the email (text, links, sender).  Y: \"spam\" or \"not spam\".\n  Training data: many emails, each labelled by users or staff (supervised learning).\n  Risk: spammers change tactics, so the model goes stale; unusual but legitimate mail (e.g. a club newsletter full of links) is wrongly blocked.\n\n(b) Face unlock\n  x: a camera image of a face.  Y: \"owner\" / \"not owner\" (a match score compared with a threshold).\n  Training data: many face images, ideally of many different people, lighting and angles.\n  Risk: if the data under-represents some groups, error rates differ between groups; a photo of the owner might fool a weak system.\n\n(c) Admissions chatbot\n  x: a question in natural language.  Y: a text answer.\n  Training data: a large collection of Vietnamese text, then admissions documents and Q&A used to adapt it.\n  Risk: hallucination, or out-of-date deadlines and fees; so important answers must link to the official notice, and unsure questions should be handed to a human adviser.\n\n(d) Knee X-ray assistant\n  x: an X-ray image.  Y: a severity grade, plus highlighted regions that explain it.\n  Training data: many X-rays graded by medical experts.\n  Risk: images from a different machine or hospital than the training images; wrong labels; doctors trusting a black box. Explanations let the doctor check; the final decision stays with a human.\n\nIn every case F is the trained model, and using it on a new x is inference."
  },
  {
   "type": "text",
   "title": "Squared error in C++ (and by hand)",
   "brief": "The five houses of Table 4.1 are sizes 90, 100, 110, 120, 130 m² with prices 280, 295, 340, 350, 400 (thousand $). <strong>(a)</strong> Write a C++ function <code>double sse(double a, double b)</code> that returns the total squared error of the line <code>y = a·x + b</code> on these five houses. <strong>(b)</strong> By hand, compute the five errors (actual − predicted) and the total for the line <code>y = 2.9x + 10</code>. <strong>(c)</strong> Is it better or worse than the textbook line <code>y = 3x + 3</code>, whose total is 380?",
   "solutionText": "(a)\ndouble sse(double a, double b) {\n    double x[5] = {90, 100, 110, 120, 130};\n    double y[5] = {280, 295, 340, 350, 400};\n    double total = 0;\n    for (int i = 0; i < 5; i++) {\n        double err = y[i] - (a * x[i] + b);   // actual - predicted\n        total += err * err;\n    }\n    return total;\n}\n(compiled and run: sse(3, 3) = 380, sse(2.9, 10) = 460)\n\n(b) y = 2.9x + 10\n  x=90:  predicted 271, error 280-271 = 9    square 81\n  x=100: predicted 300, error 295-300 = -5   square 25\n  x=110: predicted 329, error 340-329 = 11   square 121\n  x=120: predicted 358, error 350-358 = -8   square 64\n  x=130: predicted 387, error 400-387 = 13   square 169\n  total = 81 + 25 + 121 + 64 + 169 = 460\n\n(c) 460 > 380, so y = 2.9x + 10 is a worse fit than y = 3x + 3. (The best possible line, a = 2.95 and b = 8.5, has total 377.5.) Training is the search for the (a, b) with the smallest total."
  },
  {
   "type": "text",
   "title": "Lab task 1 — fit by hand, then predict (Panel 1)",
   "brief": "Open the lab below, Panel 1, dataset <em>5 houses</em>. <strong>(a)</strong> Set the sliders to <code>a = 3</code> and <code>b = 3</code>. What total squared error L do you see? <strong>(b)</strong> Set <code>a = 2.9</code>, <code>b = 10</code>. What is L now? <strong>(c)</strong> Press <em>Jump to the exact best line</em>. What are a, b and L? <strong>(d)</strong> In <em>Inference</em>, predict the price of a 140 m² house with the best line, then with the (3, 3) line. Does the prediction change when you press Predict? Do a and b change?",
   "solutionText": "(a) L = 380 (errors 7, -8, 7, -13, 7: the textbook line).\n(b) L = 460, worse (this is Exercise 2).\n(c) a = 2.950, b = 8.50, L = 377.5. This is the least-squares line from a formula.\n(d) Best line: 2.95 x 140 + 8.5 = 421.5 thousand $. The (3, 3) line: 3 x 140 + 3 = 423.\n    Pressing Predict does not change a or b: this is inference, the parameters stay frozen. Only training (moving a and b to reduce L) changes them.\nTakeaway: two different \"trained\" models give slightly different answers for the same new house; neither is the truth, both are estimates from five sales."
  },
  {
   "type": "text",
   "title": "Lab task 2 — gradient descent, the learning rate and why it can blow up (Panel 1)",
   "brief": "Panel 1, dataset <em>5 houses</em>, press <em>↺ Back to the starting line</em> (a = 1, b = 150; L = 30,825). Leave <em>Centre x</em> off and η at 10<sup>−5</sup>. <strong>(a)</strong> Press <strong>×100</strong>. What are a, b and L? Which parameter has moved, and which has barely moved? <strong>(b)</strong> Reset, tick <em>Centre x</em> (η becomes about 8×10<sup>−4</sup>) and press <strong>×1000</strong> once. What are a, b, L? <strong>(c)</strong> Reset, tick <em>Centre x</em> again, drag η up to 10<sup>−2.5</sup> (about 0.003), and press <strong>1 step</strong> a few times. What does L do?",
   "solutionText": "(a) After 100 steps: a = 1.685, b = 149.98, L = 2004.9 (started at 30,825). The slope a moved a lot (1 -> 1.68), but the intercept b is stuck near 150: with raw sizes around 100 the error is far more sensitive to a than to b, so one learning rate that is safe for a is tiny for b. The best answer is a = 2.95, b = 8.5, so this run is still far from done.\n(b) With Centre x on: a = 2.950, b = 8.47, L = 377.503, essentially the best line (377.5) after 1000 steps. Centring changes nothing about the line, only how easy it is to find; this is why real systems normalise their inputs.\n(c) L grows every step instead of shrinking: 30,825 -> 133,168 -> 3,080,155 -> ... and soon the lab reports that the numbers exploded. The learning rate is too big: each step overshoots the valley and lands higher on the other side.\nLesson: learning rate too small = slow; too big = divergence."
  },
  {
   "type": "text",
   "title": "Lab task 3 — a biased sample bends the boundary (Panel 2)",
   "brief": "Panel 2, learning rate <em>medium (2)</em>. <strong>(a)</strong> With the biased-sample box <em>off</em>, press <strong>×100</strong> once. Note the loss, the training accuracy and the accuracy on the 8 held-out newsletters, then classify an email with 5 links and 4.5 capital words. <strong>(b)</strong> Tick the biased sample (the weights reset), press <strong>×100</strong> once and read the same numbers; classify the same email. <strong>(c)</strong> In one or two sentences: what changed, what did <em>not</em> change, and why does this matter for the textbook's hiring-tool example?",
   "solutionText": "(a) Fair sample, 100 steps: loss 0.2126, training accuracy 97% (37 of 38 emails), held-out newsletters 100% (8 of 8). The 5-link, 4.5-caps email gets P(spam) = 42%, so \"not spam\".\n(b) Biased sample, 100 steps: loss 0.3269, training accuracy 90% (47 of 52), held-out newsletters 0% (0 of 8). The same email gets P(spam) = 65%, so \"SPAM\".\n(c) The algorithm, the features and the number of steps did not change; only the training sample did. The extra spam that looked like newsletters (and no extra newsletters) taught the model that \"lots of links plus some capitals means spam\", so legitimate newsletters it never saw are now blocked. Like Amazon's experimental recruiting tool, which learned from ten years of mostly male resumes, a model reproduces the patterns of its data, including its skew. Checking accuracy per group (as the lab does for the newsletters) is how you notice."
  },
  {
   "type": "text",
   "title": "The villa pricing model (textbook 4.8.3), checked",
   "brief": "The textbook fits a line to five (invented) villas and a competitor uses <code>y = 201.23x − 54144.92</code>; the textbook's own quadratic is <code>y = 0.10744x² − 12.6x + 8596.25</code>. Prices are in <strong>thousand $</strong> in both formulas (a 200 m² villa sells for $11.6 million = 11,600 thousand). <strong>(a)</strong> Estimate a 1,200 m² villa with each formula. <strong>(b)</strong> The textbook says the competitor will <em>under</em>-price it. Is that true at 1,200 m²? <strong>(c)</strong> What does the competitor's line say for a 200 m² villa, and what does that tell you about the model? You can check your answers in Panel 1, dataset <em>Ultra-luxury villas</em>.",
   "solutionText": "(a) Quadratic: 0.10744 x 1200^2 - 12.6 x 1200 + 8596.25 = 154,713.6 - 15,120 + 8,596.25 = 148,189.85 thousand $ (about $148.2 million).\n    Linear: 201.23 x 1200 - 54,144.92 = 187,331.08 thousand $ (about $187.3 million).\n(b) No. At 1,200 m² the line gives about 39,141 thousand $ MORE than the quadratic (about 26% higher), so the competitor would OVER-price this villa. The line is higher than the curve in the middle of the range and falls below it only near the largest sizes (at 1,800 m² the line gives about 308,069 against a real 320,600). The textbook statement should be read as \"systematically wrong\", not \"always too low\".\n(c) 201.23 x 200 - 54,144.92 = -13,898.92 thousand $: a NEGATIVE price. A straight line cannot follow accelerating growth, so its errors are large and systematic at the ends. More training cannot fix that; a different model family (the quadratic, with a third parameter) is needed. In the lab, the best straight line has total squared error about 3.96 x 10^9 against about 4.25 x 10^8 for the best quadratic (roughly 9 times smaller)."
  }
 ]
};
