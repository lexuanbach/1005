/* Chapter 13 — Citation & Responsible AI
   Quiz + exercises data, rendered by assets/course.js */
window.CHAPTER_DATA = {
  "id": 13,
  "quiz": [
    {
      "q": "What does it mean to <strong>cite</strong> a source?",
      "opts": [
        "To copy the source’s wording into your work so that readers need not look anything up themselves",
        "To credit the original source of an idea, data or wording, in a standard format",
        "To list every document you read during the research, whether or not you used anything from it",
        "To ask the author for permission before using any of his or her ideas in your own writing"
      ],
      "a": 1,
      "why": "Citing is a standardised way of acknowledging what you borrowed — an idea, data, or a particular way of putting something (textbook 6.1.1)."
    },
    {
      "q": "A citation system always has two parts that work together. Which pair is that?",
      "opts": [
        "A table of contents at the start, and an index of terms at the end of the document",
        "A footnote on every page, and a separate bibliography written by someone else",
        "A quotation, and a paraphrase of the same sentence placed directly next to it",
        "A short in-text citation, and a full entry in the reference list at the end"
      ],
      "a": 3,
      "why": "The in-text citation (author-year or [number]) points the reader to the full entry in the references, which holds author, title, publisher/journal, year, pages and DOI or URL (textbook 6.1.2)."
    },
    {
      "q": "Why do instructors ask students to cite their sources?",
      "opts": [
        "To see which ideas are the student’s own and which build on other writers’ work",
        "Because every sentence in a report has to be backed by at least one quotation from a book",
        "To make reports longer, since a longer reference list always earns the higher mark",
        "Only to be able to catch cheaters; citations have no other use for the reader"
      ],
      "a": 0,
      "why": "Citing shows scholarly discourse (you join an ongoing conversation), documents the work you did, and lets a reader find your sources. Detecting plagiarism is a by-product, not the purpose."
    },
    {
      "q": "Which of these normally needs <strong>no</strong> citation?",
      "opts": [
        "A chart that you redraw by hand from a figure in a website article",
        "A short function you adapted from an open-source repository you found online",
        "Your own experiment results and your interpretation of them",
        "A population figure you copied from a blog post without checking it"
      ],
      "a": 2,
      "why": "Original ideas — your own data, analysis and conclusions — need no citation (textbook 6.3.1). Anything borrowed does: figures, adapted code, statistics, even if you change the form."
    },
    {
      "q": "You are not sure whether a fact is “common knowledge” for your readers. What is the safest rule?",
      "opts": [
        "Leave it out of the citations, since most facts that can be found online count as common knowledge",
        "Cite it only if it contains a number, because only numbers can be wrong or disputed",
        "Cite it; if there is any doubt about how widely known it is, a citation costs nothing",
        "Ask an AI chatbot whether it is common knowledge and follow its answer"
      ],
      "a": 2,
      "why": "Universal facts need no citation, but the textbook’s rule is: when in doubt, cite. Whether something is common knowledge depends on the readers, not on whether you can find it online."
    },
    {
      "q": "A <strong>direct quotation</strong> is…",
      "opts": [
        "The author’s exact words, inside quotation marks, with a citation that includes the page",
        "The author’s idea restated in your own words, followed by an in-text citation with the year",
        "A paragraph copied word for word, then listed in the references at the very end",
        "A short summary of the whole source, written without any quotation marks"
      ],
      "a": 0,
      "why": "Quoting = exactly the author’s words, in quotation marks (§6.3.2). APA, MLA and IEEE all add a page (or other locator) so the reader can find the passage."
    },
    {
      "q": "Which is a real <strong>paraphrase</strong> of a source sentence?",
      "opts": [
        "The original sentence with two or three words swapped for synonyms, and no citation",
        "The original sentence in quotation marks, with the author’s name as the only credit",
        "Your own opinion on the topic, written after reading the source but not mentioning it",
        "The idea restated in your own words and structure, and still credited to the author"
      ],
      "a": 3,
      "why": "A paraphrase changes the words and the structure but keeps the meaning — so the idea is still borrowed and still needs a citation. Swapping a few words is “patchwriting”, not paraphrasing."
    },
    {
      "q": "Which citation style numbers its sources in square brackets, in the order they first appear?",
      "opts": [
        "APA, which uses [1], [2] after each author",
        "IEEE",
        "MLA, which numbers its works-cited list from the top",
        "Chicago author-date, which numbers the references"
      ],
      "a": 1,
      "why": "IEEE is the numbered style used across engineering and computer science: [1], [2], [3] in order of first appearance. APA, MLA and Chicago author-date identify sources by author name (and year or page)."
    },
    {
      "q": "In APA 7, where does the year of publication go in a reference-list entry?",
      "opts": [
        "At the very end of the entry, after the publisher or DOI, separated by a comma",
        "After the title of the work, written without parentheses",
        "Nowhere: APA references leave the year to the in-text citation",
        "In parentheses right after the authors: Dijkstra, E. W. (1968)."
      ],
      "a": 3,
      "why": "APA is “author-date”: Author. (Year). Title… The date comes early because currency of research matters in the sciences. MLA, by contrast, puts the year late in the entry."
    },
    {
      "q": "Tanenbaum, Feamster and Wetherall wrote <em>Computer Networks</em> (6th ed.). Which MLA 9 in-text citation points to page 45?",
      "opts": [
        "(Tanenbaum, Feamster, and Wetherall 2021, p. 45)",
        "(Tanenbaum et al. 45)",
        "(Tanenbaum, Feamster, & Wetherall, 2021, p. 45)",
        "(Tanenbaum et al., 2021, 45)"
      ],
      "a": 1,
      "why": "MLA uses author–page with no comma and no year; with three or more authors only the first is named, followed by “et al.”. The other options mix in APA habits."
    },
    {
      "q": "Nguyen and Quan published in 2026. Which APA 7 <em>parenthetical</em> citation is correct?",
      "opts": [
        "(Nguyen and Quan, 2026)",
        "(Nguyen & Quan 2026)",
        "(Nguyen & Quan, 2026)",
        "(Nguyen, Quan, 2026)"
      ],
      "a": 2,
      "why": "Inside parentheses APA joins two authors with “&” and puts a comma before the year. In running text you write “Nguyen and Quan (2026) found…”."
    },
    {
      "q": "Dang et al. (six authors, 2026) is quoted word for word from page 5. Which APA 7 in-text citation is right?",
      "opts": [
        "(Dang et al., 2026, p. 5)",
        "(Dang, Tran-Truong, Vu, Nguyen, Vo, & Quan, 2026, p. 5)",
        "(Dang et al. 5)",
        "[Dang et al., 5]"
      ],
      "a": 0,
      "why": "APA 7 shortens three or more authors to the first name + “et al.” from the first citation on, and adds “p.” plus the page after the year for a direct quotation."
    },
    {
      "q": "In IEEE style your third reference is the Nguyen & Quan paper. How do you cite it, with a quotation from page 2100?",
      "opts": [
        "[3, p. 2100]",
        "(Nguyen & Quan, 2026, p. 2100)",
        "[Nguyen & Quan 2100]",
        "[2100]"
      ],
      "a": 0,
      "why": "IEEE in-text citations are the reference number in square brackets, with the locator after a comma: [3, p. 2100]. The number stays the same for the whole document.",
      "supp": true
    },
    {
      "q": "In an IEEE paper you first cite Dijkstra’s 1968 letter, then Stroustrup’s book, then Dijkstra again. What numbers appear, in order?",
      "opts": [
        "[1], [2], [3], because each citation gets a new number",
        "[2], [1], [2], since the list is alphabetical",
        "[1], [2], [1]",
        "[1], [2], [1.1], marking the repeated source with a sub-number"
      ],
      "a": 2,
      "why": "IEEE numbers sources in the order of first appearance and never renumbers: a source keeps its number each time it is cited. “Do not combine references” — one number per reference."
    },
    {
      "q": "Which of these is a correctly formatted <strong>APA 7</strong> reference (italics not shown)?",
      "opts": [
        "E. W. Dijkstra (1968). Go To Statement Considered Harmful. Communications of the ACM, 11(3), 147–148.",
        "Dijkstra, E. W. (1968). Go to statement considered harmful. Communications of the ACM, 11(3), 147–148.",
        "Dijkstra, Edsger W. 1968. “Go To Statement Considered Harmful.” Communications of the ACM 11 (3): 147–148.",
        "[1] E. W. Dijkstra, “Go to statement considered harmful,” Commun. ACM, vol. 11, no. 3, pp. 147–148, 1968."
      ],
      "a": 1,
      "why": "APA: Family, initials, (year), sentence-case title, Journal, volume(issue), pages. The second option is Chicago author-date, the third is IEEE, and the first inverts nothing and keeps Title Case."
    },
    {
      "q": "In APA 7, which of these is <strong>not</strong> set in italics?",
      "opts": [
        "The title of a book",
        "The name of the journal",
        "The volume number of a journal article",
        "The title of a journal article"
      ],
      "a": 3,
      "why": "APA italicises the stand-alone work or container (book title, journal name, volume number) and leaves the title of the part — article, chapter — in plain type."
    },
    {
      "q": "A student cites a web page that shows no individual author. What should the reference do (textbook 6.6, Q6)?",
      "opts": [
        "Leave the reference out, because a source without a person’s name cannot be cited",
        "Use the publishing organisation as the author, and still give the date and URL",
        "Invent the author’s name from the page’s e-mail address so the entry looks complete",
        "Cite only the name of the website and leave out the page title and the URL"
      ],
      "a": 1,
      "why": "The publishing organisation can serve as the author. If there is none, the title moves to the author position. The URL (and the date or access date) is what lets readers verify the source."
    },
    {
      "q": "Why do MLA and IEEE web-page references carry an “accessed” date, and Wikipedia citations a permanent-version link?",
      "opts": [
        "The date proves that the page was written by a reliable and trustworthy author",
        "It stops other students from citing the same page after you have used it",
        "Search engines need the date to rank the reference correctly in results",
        "Pages change, so readers must know which version you actually saw"
      ],
      "a": 3,
      "why": "Web pages are edited, moved and deleted. The access date (or an archived “oldid” link, which APA prefers) pins down the version that your claim rests on."
    },
    {
      "q": "A student asks ChatGPT to explain “indexes”, rewrites the answer and puts it in an essay. What is the responsible minimum?",
      "opts": [
        "Verify the facts in real sources, follow the course’s AI rules, and disclose or cite the tool",
        "Nothing: once the answer is rewritten in the student’s own words, the text belongs entirely to the student",
        "List ChatGPT as a co-author, so that the tool shares responsibility for any errors in the essay",
        "Delete the chat history so that nobody can compare the essay with the original"
      ],
      "a": 0,
      "why": "AI help must be transparent, and the writer stays responsible for facts and arguments (textbook 6.4.10). Rewriting does not remove the need to verify and to follow the course’s policy."
    },
    {
      "q": "An AI tool suggests a paper with a DOI, but the DOI does not resolve and the title is not found anywhere. What does this show, and what should you do?",
      "opts": [
        "The publisher’s website is down; cite the reference anyway, since an AI would not invent it",
        "It is a copyright block; cite the paper but leave the DOI out of the entry",
        "Probably a hallucinated reference: do not cite it; look for real sources instead",
        "The DOI has expired; replace it with any DOI from a similar-looking paper"
      ],
      "a": 2,
      "why": "LLMs can produce confident, well-formatted references to works that do not exist (textbook 6.6 Q9). Never cite what you have not found and read: look up title and authors in Crossref, DBLP or Google Scholar."
    },
    {
      "q": "According to the MLA Style Center’s generative-AI guidance, who is the “author” in a works-cited entry for ChatGPT output?",
      "opts": [
        "ChatGPT, since it is the system that actually wrote the text in the answer",
        "The student who typed the prompt, because the prompt decided what the answer said",
        "Nobody: the tool is not an author; the entry opens with the prompt description",
        "OpenAI, always shown as a corporate author in front of the title"
      ],
      "a": 2,
      "why": "MLA recommends not treating the AI tool as an author; the entry begins with the prompt description in quotation marks, then the tool, model, company, date and URL."
    },
    {
      "q": "In APA Style’s 2025 guidance for citing a ChatGPT chat, what comes first in the reference?",
      "opts": [
        "The company that made the tool, OpenAI, as the author",
        "The name of the tool itself, ChatGPT, written in front of everything else",
        "The title that the student gave to the essay in which the chat is used",
        "The URL of the shared chat, because the link is what readers click first"
      ],
      "a": 0,
      "why": "APA: Company. (Year, Month Day). Chat title [Generative AI chat]. Tool. Share link — with an in-text citation such as (OpenAI, 2025)."
    },
    {
      "q": "Which sentence is a <strong>disclosure</strong> of AI use, rather than a citation?",
      "opts": [
        "(OpenAI, 2025), placed right after the sentence that uses the chatbot’s wording and ideas",
        "I used ChatGPT (GPT-4o, 12 Oct 2026) for an outline; I wrote and checked the text.",
        "OpenAI. (2025). High school grammar concepts [Generative AI chat]. ChatGPT.",
        "Dijkstra (1968) argued that jumps make programs hard to follow [1]."
      ],
      "a": 1,
      "why": "A citation credits a source; a disclosure tells the reader how a tool was used (which tool and version, when, for what). Often you need both — and neither replaces citing the original sources of facts."
    },
    {
      "q": "A student changes a few words of a website paragraph and pastes it into the report with no citation. Which type of plagiarism is this?",
      "opts": [
        "None, because the wording is no longer identical to the website’s original text",
        "Self-plagiarism, because the student has now written it twice",
        "Contract cheating, because the student used somebody’s service",
        "Patchwriting: the wording is nearly copied and the credit is missing"
      ],
      "a": 3,
      "why": "Changing a few words is still using someone else’s expression, and a real paraphrase without a citation still borrows the idea. Both need credit."
    },
    {
      "q": "A student reuses the analysis section of an earlier, graded report in a new course without saying so. What is this?",
      "opts": [
        "Fine, since it is the student’s own work and no one else’s ideas are involved",
        "Fine, as long as the wording is changed slightly to avoid the same sentences",
        "Plagiarism only if the earlier report was published in a journal",
        "Self-plagiarism, unless the instructor allows it and it is declared"
      ],
      "a": 3,
      "why": "Presenting old work as new, without permission or disclosure, misleads the grader. Ask first, then cite your own earlier work like any other source."
    },
    {
      "q": "For a claim about how Transformer language models work, which source is strongest? (Evaluating sources)",
      "opts": [
        "An anonymous blog post with many colourful diagrams and a very confident tone",
        "The original paper, peer-reviewed, with named authors and a DOI or link",
        "A chatbot’s summary of the topic, since it has read the paper",
        "A viral social-media thread by an account with many followers"
      ],
      "a": 1,
      "why": "Prefer primary, peer-reviewed or well-established sources with named authors and a way to verify them. A chatbot summary is not a source: it can be wrong and can invent references.",
      "supp": true
    },
    {
      "q": "How should code adapted from an online example (a forum answer, say) be credited?",
      "opts": [
        "A comment at that place naming the source (author, title, URL) and any licence terms",
        "Not at all: code is not text, so it cannot be plagiarised",
        "In a single note at the end of the program, listing every website that was ever visited",
        "By deleting the original comments and renaming its variables"
      ],
      "a": 0,
      "why": "The textbook asks you to credit code you consulted or adapted with comments (6.1.1). Check the licence: some code may be reused only under conditions."
    }
  ],
  "exercises": [
    {
      "type": "text",
      "title": "Source inventory — what to write down the moment you find a source",
      "brief": "While researching “why do programmers avoid <code>goto</code>?” you collect four sources: <strong>(a)</strong> Stroustrup’s book <em>The C++ Programming Language</em> (4th ed.), <strong>(b)</strong> Dijkstra’s 1968 letter “Go To Statement Considered Harmful”, <strong>(c)</strong> the Wikipedia article “Plagiarism” (just as a stand-in for any web page), <strong>(d)</strong> an answer from ChatGPT. For each, list what you must record <em>at that moment</em> so that you can build a reference later without hunting. Then say which items differ between a book, a journal article, a web page and an AI chat (textbook questions 2, 4 and 10).",
      "solutionText": "Always record: who made it (authors / organisation), the year (and month/day for web pages and chats), the exact title, where it lives, and an identifier a reader can follow.\n\n(a) Book: authors (Stroustrup, Bjarne), year (2013), title, edition (4th), publisher (Addison-Wesley), city if the style wants it (IEEE), the page numbers you actually use.\n(b) Journal article/letter: author (Dijkstra, Edsger W.), year (1968) and month (March, for IEEE/MLA), title, journal (Communications of the ACM), volume 11, issue 3, pages 147–148, DOI 10.1145/362929.362947.\n(c) Web page: author or organisation (none for Wikipedia: the title leads), date of the page or version, title, website name, full URL (with the permanent \"oldid\" link for Wikipedia), and the date YOU opened it.\n(d) AI chat: the tool (ChatGPT) and company (OpenAI), the model or version, the date, the prompt (or the chat title), the shareable link, and what you used the output for.\n\nWhat differs: books have edition and publisher but no volume; articles have journal, volume, issue, pages and DOI; web pages need URL + access date; AI chats need model, date, prompt and link — and the AI is never the source of a fact, so you also note where you verified the fact."
    },
    {
      "type": "text",
      "title": "Write the in-text citations",
      "brief": "Your report cites, in this order of first appearance: Dang et al. (2026; six authors; online article with article number 100578), Nguyen &amp; Quan (2026; pp. 2098–2119) and Russell &amp; Norvig (2021; book). Write for each source the <strong>parenthetical</strong> and <strong>narrative</strong> form in APA 7, the in-text form in MLA 9, and the IEEE number form. Then write the three styles’ citations for a <strong>direct quotation from page 2100 of Nguyen &amp; Quan</strong>. (Check yourself with the Reference builder’s “In the text” lines.)",
      "solutionText": "APA 7 (parenthetical | narrative)\n  Dang et al.       (Dang et al., 2026)           | Dang et al. (2026)\n  Nguyen & Quan     (Nguyen & Quan, 2026)         | Nguyen and Quan (2026)\n  Russell & Norvig  (Russell & Norvig, 2021)      | Russell and Norvig (2021)\n\nMLA 9 (author–page, no year, no comma)\n  (Dang et al.)   — an online article with only an article number has no page to give\n  (Nguyen and Quan)   — with a page: (Nguyen and Quan 2098)\n  (Russell and Norvig)   — with a page: (Russell and Norvig 45)\n\nIEEE (numbers in order of first appearance)\n  Dang et al. = [1], Nguyen & Quan = [2], Russell & Norvig = [3]\n  narrative: Dang et al. [1]; Nguyen and Quan [2]; Russell and Norvig [3]\n\nDirect quotation from page 2100 of Nguyen & Quan:\n  APA:  (Nguyen & Quan, 2026, p. 2100)\n  MLA:  (Nguyen and Quan 2100)\n  IEEE: [2, p. 2100]\n\nCommon slips: \"and\" instead of \"&\" inside APA parentheses; a year in an MLA citation; a comma between author and page in MLA; renumbering IEEE sources when you cite them a second time; naming all six authors instead of \"et al.\"."
    },
    {
      "type": "text",
      "title": "Lab: build the Dang et al. reference in three styles",
      "brief": "Open the <a href=\"#lab\">Citation Workshop</a>, panel 1, and choose the preset <strong>“Journal article, 6 authors, article number — Dang et al. (2026)”</strong>. (a) How many authors does each style print? (b) Where does “100578” appear in each style? (c) Clear the DOI field. Which style-specific warnings appear, and what should you do about them in real life?",
      "solutionText": "(a) APA 7 prints all six authors: \"Dang, Q. P., Tran-Truong, P. T., Vu, D.-L., Nguyen, L. S. T., Vo, Q. T. N., & Quan, T. (2026).\" (the limit is 20). MLA 9 prints only the first author plus et al.: \"Dang, Quoc Phu, et al.\" IEEE prints all six (the limit is six; a seventh author would turn it into \"Q. P. Dang et al.\").\n\n(b) APA: \"…Intelligence, 10, Article 100578.\" right after the volume. IEEE: \"…vol. 10, 2026, Art. no. 100578, doi: …\" after the year. MLA leaves the article number out altogether: \"…vol. 10, 2026, https://doi.org/10.1016/j.caeai.2026.100578.\"\n\n(c) Without a DOI the APA and IEEE columns warn: APA \"No DOI or URL…\" and IEEE \"No DOI…\". In real life, look the title up at Crossref (search.crossref.org) or on the publisher's page; the DOI for this paper is 10.1016/j.caeai.2026.100578. If the work has no DOI, use a stable URL instead. The remaining notes (MLA et al., MLA article number, IEEE abbreviation) are information, not errors."
    },
    {
      "type": "text",
      "title": "Lab: hunt the hints",
      "brief": "In the <a href=\"#lab\">Citation Workshop</a> choose “Journal article”, press <em>Clear the form</em> and type: authors <code>Edsger W. Dijkstra</code>; year <code>1968</code>; title <code>GO TO STATEMENT CONSIDERED HARMFUL</code>; journal <code>Communications of the ACM</code>; volume <code>11</code>, issue <code>3</code>; pages <code>147-148</code> (hyphen); DOI <code>doi 1145</code>. List every hint the tool shows. Then correct the form until only information notes remain, and compare your APA line with the “Dijkstra” preset.",
      "solutionText": "Hints shown (3 warnings, 2 notes):\n1. WARN: “Edsger W. Dijkstra” has no comma — names must be typed Family, Given (Dijkstra, Edsger W.).\n2. WARN: the title is in ALL CAPITALS — retype it normally (proper nouns go into the “keep capitalised” box).\n3. WARN: “doi 1145” does not look like a DOI (it must start with 10. + prefix/suffix, e.g. 10.1145/362929.362947).\n4. NOTE: the hyphen in the page range was replaced by an en dash (147–148).\n5. NOTE (IEEE): IEEE wants the abbreviated journal title — type “Commun. ACM” in the IEEE abbreviation box.\n\nCorrected form: authors \"Dijkstra, Edsger W.\"; title \"Go To Statement Considered Harmful\" (as printed); DOI 10.1145/362929.362947; month March; IEEE abbreviation \"Commun. ACM\". The APA line is then identical to the preset:\nDijkstra, E. W. (1968). Go to statement considered harmful. Communications of the ACM, 11(3), 147–148. https://doi.org/10.1145/362929.362947\n(APA has no month for journal articles; IEEE and MLA show \"Mar. 1968\".)"
    },
    {
      "type": "text",
      "title": "Lab: rewrite until the checker is quiet — and then cite",
      "brief": "Open panel 3 (<em>Paraphrase check</em>) of the <a href=\"#lab\">Citation Workshop</a>; keep the Wikipedia source sentence. Test (1) “Plagiarism is the representation of another person’s language, thoughts, ideas, or expressions as your own original work.” and (2) “Plagiarism means presenting the language, thoughts, ideas, or expressions of someone else as your own original work.” What does the checker say? Then write a genuine paraphrase of your own, and add the citation. Does a quiet checker mean you are finished?",
      "solutionText": "(1) Verdict “high”: 76% of your words sit in copied stretches (13 of 17 counted words; the longest identical run is 13 words). This is the source sentence with one word changed — either quote it with a citation or rewrite it.\n(2) Verdict “some”: 29% (the stretches “language, thoughts, ideas, or expressions” are still the source’s own list); the longest run is 5 words. Swapping the verb and reordering a clause is “patchwriting”, not paraphrase.\n\nA genuine paraphrase (checker: “little exact overlap”, 0%):\n  Presenting somebody else’s words, thoughts or creative work as if it were your own is plagiarism (“Plagiarism,” 2026).\n\nA quiet checker is NOT the finish line. The checker only counts identical 4-word runs; the idea in the paraphrase still comes from Wikipedia, so the citation (“Plagiarism,” 2026) and a reference-list entry are required. And the tool cannot see copied structure, translated text or uncited ideas — it is a rough heuristic, not a plagiarism detector."
    },
    {
      "type": "text",
      "title": "Case: AI help, a made-up reference, and a pasted answer",
      "brief": "For her report Linh used ChatGPT to (1) brainstorm an outline, (2) explain why her SQL query was slow, and (3) “give me five references”. Two of the five references have DOIs that do not resolve. She also pasted a 12-line C++ function from an online forum into her program without any comment. Write: (a) what Linh should do about the five references; (b) a one-sentence <em>disclosure</em> for the report; (c) what she should cite for the explanation of the slow query; (d) how to credit the C++ function; (e) the one rule she should check before she submits anything. (Do not guess the policy: it is set by the course and the university.)",
      "solutionText": "(a) Treat the two non-resolving references as hallucinated: do not cite them. Look every remaining reference up (title + authors in Crossref, DBLP or Google Scholar), open the real work, and cite only what she has found AND read. If she cannot verify a reference, it stays out.\n\n(b) Disclosure, e.g.: \"I used ChatGPT (GPT-4o, 12 Oct 2026) to suggest an outline and to explain a slow SQL query; I checked the explanation against the database documentation and wrote the report myself.\" (Tool, model/version, date, what for, what she did herself.)\n\n(c) Not \"ChatGPT\" as the source of the fact. The explanation of why the query was slow must be traced to a real source (the database manual, a textbook, a paper) and that source cited. The tool appears only in the disclosure (and, if the course wants a reference entry, in a Generative-AI entry: APA \"OpenAI. (2026, Oct 12). Title of chat [Generative AI chat]. ChatGPT. link\", MLA \"prompt\" entry).\n\n(d) A comment at the function naming the source: author (or user name), page title, URL, date accessed, and the licence if it states one (e.g. // Adapted from <URL>, accessed <date>, licence <...>). She must also understand and test the code, not just paste it.\n\n(e) Read the course and university policy on assistance, AI tools and sources before submitting, and follow it; when in doubt, ask the instructor in writing."
    }
  ]
};
