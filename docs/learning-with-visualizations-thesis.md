# Learning With Visualizations
## A product thesis for an open-source Brilliant-class learning system

**Audience:** product thinkers and AI agents who will design lessons, interactives, sequences, feedback, and curriculum.  
**Scope:** *why it works* and *what to build*. Not how to implement it.  
**Stance:** Brilliant is the reference product. This document extracts the elegance so an open alternative can match the learning effect, not just the look.

---

## 0. One-page thesis

People do not understand an idea by being told it. They understand it when they can *move the world the idea describes* and watch the structure appear.

Brilliant’s core invention is not “pretty math animations.” It is this:

> **The visualization is the question.**  
> The learner is placed *inside* the problem. Interaction is not decoration after an explanation. Interaction *is* the explanation, happening in the learner’s hands.

A lesson is a carefully sequenced chain of small decisions — drag this, predict that, choose what must be true — that force the idea to assemble itself. Symbols arrive *after* the idea has a body. Mistakes are information, not verdicts. Help exists, but it refuses to steal the thinking. Practice then strips the scaffolding and makes the idea usable in new clothes.

That is the elegance. Everything else — streaks, leagues, a tutor, learning paths — is either support for this loop or a habit layer around it.

If an open-source alternative copies the UI and misses this loop, it will be a pretty quiz app. If it honors this loop, the tech can be humble and the product can still be Brilliant-class.

---

## 1. What Brilliant actually is (product definition)

Brilliant is not a video school, a textbook, a question bank, or a chatbot with diagrams.

It is a **personal problem-solving studio** for STEM:

- You learn by doing short interactive lessons (typically minutes, not hours).
- Each lesson is a *guided discovery path*, not a lecture followed by homework.
- The atomic unit is a **solvable**: an interactive question that requires a decision in a visual world.
- Feedback arrives while reasoning is still warm. You can revise.
- A tutor (Koji) can see the canvas and coach without handing over the answer.
- Practice later removes help and changes the surface of the problem so the idea must be recognized, not copied.
- Motivation systems (streaks, XP, weekly leagues of ~30 people) keep a daily habit alive.
- Curriculum is organized as courses and **learning paths** from core ideas to advanced ones, with checkpoints.

Mission in their words: *a world of great problem solvers*; STEM ability in less time, with more purpose and joy.

The identity they sell is important: not “what will be on the test?” but “how far can I go?” The product trains a *well-trained mind*, not a certificate hunter. An open alternative should protect that identity or it will slide into homework software.

---

## 2. Why it feels brilliant: the elegance, not the stack

### 2.1 The learner is inside the problem

Watching someone solve a problem feels clear. Solving it yourself is a different event. Brilliant makes the second event the default.

The learner is asked to:

- move a point
- test a pattern
- estimate before calculating
- choose a strategy
- decide what *must* be true
- rearrange pieces
- drag a tangent and watch slope change
- adjust a graph and watch the equation respond

That effort is where learning happens. The interface is a laboratory, not a page.

### 2.2 Concrete before abstract

Math (and most STEM) becomes hard when symbols arrive before the idea has a body.

Brilliant’s order is almost always:

1. **Objects you can touch** — tiles, pieces, sliders, points, circuits, blocks of code.
2. **Behavior you can see** — what changes when you change this.
3. **Language for what you just saw** — words, then notation.

The interaction is designed to *expose the structure that the symbols later name*. Notation is a caption, not the first contact.

### 2.3 Question before procedure

They often ask a question *before* teaching the method. That first attempt does two jobs:

- It gives the coming explanation a *purpose* (“I needed this”).
- It surfaces what the learner already knows and where the misconception lives.

This is pretesting / generation effect used as product design, not as a research paper.

### 2.4 Guided discovery, not abandonment

This is the most misunderstood piece.

Unguided “explore and find out” wastes people. Pure lecture produces the illusion of understanding. Brilliant sits in the narrow middle:

> Guided discovery is not the same as leaving someone to guess.  
> Questions, examples, feedback, and direct instruction are arranged to keep the learner moving *without doing the thinking for them*.

The designer’s craft is the *arrangement*. The learner still has to do the work.

### 2.5 One idea at a time, simplest useful case first

A lesson does not dump a chapter. Each section owns one manageable idea. It starts at the simplest case that is still *real*, then adds complexity only as understanding grows.

Cognitive load is treated as a product constraint. The canvas is quiet. There is almost never a wall of text. Educators say students choose to use it because it *looks like something they would pick up on their own*.

### 2.6 Mistakes are useful information

A wrong answer can be:

- a misconception
- a skipped step
- a reasonable idea used in the wrong place

Interactive problems respond while the reasoning is still fresh. You revise. You see what changed. Confusion is not evidence that you are “bad at math.”

Good feedback answers three questions (Hattie & Timperley):

1. Where am I going?
2. How am I doing?
3. What should I try next?

A red X with no next move is not feedback. It is a grade.

### 2.7 Help that protects the struggle

Koji’s product principle is more important than Koji the feature:

**Do not lift the weights for the learner.**

Explanations and copied answers both remove responsibility. A good tutor:

- sees the canvas and the attempts
- asks a guiding question
- highlights a region
- sketches on the same diagram
- breaks the problem into a smaller interactive step
- offers another *approach*, not the answer
- gives more help when the idea is new
- steps back when it is time to test knowledge
- aims to make itself unnecessary

Most AI tutors make students dumber by doing the thinking. An open alternative that ships a “helpful chatbot next to a diagram” has failed this principle even if the chatbot is smart.

### 2.8 Understanding that can travel

Knowing it once is not knowing it.

Practice is designed so that:

- you must **retrieve**, not reread
- **surface details change** so you recognize the idea, not the costume
- ideas return **across days** (spacing)
- related problem types are **mixed** so you must choose a strategy (interleaving)
- misconceptions are corrected while the reasoning is still visible

A learner understands an idea when they can:

- explain *why* a method works
- represent it in words, pictures, graphs, *and* equations
- choose a strategy without being told which one
- notice when an approach is failing and revise
- apply it to an unfamiliar problem

That list is the product’s definition of mastery. Grade it against that, not against “got the answer.”

### 2.9 Feel the math

Internally they talk about tactile learning and *feeling the math*. Intuition through interaction. Understanding through experimentation. Play that produces an “oh, wait, I get it.”

The target emotion is not entertainment. It is **click**. Fun is the side effect of a well-tuned difficulty curve and a world that talks back.

---

## 3. Intellectual lineage (so agents do not reinvent a worse version)

Brilliant sits at the intersection of several traditions. Use them as design ancestors.

| Ancestor | What to steal |
|---|---|
| Constructivism / discovery learning | Knowledge is built by the learner. |
| Cognitive load theory + worked examples | Do *not* leave novices in raw discovery. Sequence and constrain. |
| Realistic Mathematics Education / progressive formalization | Start in a situation, formalize later. |
| Dual coding | Picture + language beat either alone — but the picture must be *worked*, not watched. |
| Generation effect & pretesting | Attempt before instruction. |
| Retrieval, spacing, interleaving, desirable difficulties | Practice that feels slightly harder now, pays later. |
| Feedback research (Hattie) | Feed forward, not just “correct/incorrect.” |
| Bret Victor / explorable explanations | You don’t understand it until you can play with it. |
| Nicky Case, 3blue1brown (Grant Sanderson), Dan Meyer 3-act math | Curiosity first; the visual *is* the argument. |
| Game design (flow, juice, fail-forward) | Difficulty curve, immediate response, retry without shame. |
| Socratic tutoring | Questions that force the next inference. |

The synthesis is the product: **Socratic questions attached to a living diagram, sequenced like a great game level.**

---

## 4. Macro product architecture

Think in layers. An open alternative should have all of them, even if v1 is thin.

### Layer A — The studio (the heart)

The place where learning happens.

- Courses made of **lessons**
- Lessons made of **solvables** (interactive questions) plus rare, short pieces of direct instruction
- A shared **visual world** per lesson that persist across a few questions (same diagram evolves)
- Instant, in-place response to action
- Retry / start over without punishment
- A canonical explanation *after* an honest attempt

### Layer B — The coach

Help that sees the same canvas.

- Guiding questions
- Highlights and annotations on the current figure
- Smaller intermediate interactives
- Misconception-aware prompts (“you treated this as area, but the question is slope”)
- Ability to mute the coach
- Goal: fade out

### Layer C — The gym

Where understanding becomes durable.

- Targeted practice from learning history
- Variants of the same idea with new surfaces
- Mixed review / rolling review sets
- Checkpoints on learning paths
- Edge cases after the happy path
- Rough target they use internally: **20+ problems per concept** (ramp + variants + edges). A 50-concept course is 1,000+ problems. Depth is the product.

### Layer D — The map

How a person knows where they are and where to go.

- Courses with levels / sections
- Learning paths (core → advanced, with practice checkpoints)
- Visible mastery, not just completion
- “Ask in your own words → routed to the right lesson”
- Permission to jump (premium Brilliant allows this; free often forces sequence — an open product can be more generous)
- Parent / teacher dashboards: time on task, what’s active, what’s stuck — not surveillance theater

### Layer E — The habit

Why people come back tomorrow.

- Daily minimum that is small and real (Brilliant: 3 problems *or* 1 lesson)
- Streaks with a small safety valve (they use up to two “streak charges”)
- XP as a visible measure of effort, not of IQ
- Small weekly leagues (~30 peers), not a global infinite leaderboard
- Home surface that answers: *what should I do in the next eight minutes?*
- Optional daily challenge as a cultural object (a beautiful small puzzle that is shareable)

Habit systems must never outrank learning quality. If XP can be farmed by clicking through, the habit layer has corrupted the studio.

### Layer F — The culture

- Identity: problem solver, not content consumer
- Community explanations / wiki of hard problems (Brilliant had a serious community wiki historically)
- Shareable puzzles
- Tone: adult, warm, precise, never cutesy-condescending, never punitive

---

## 5. Micro anatomy of a Brilliant-class lesson

This is the unit agents will generate most often. Get this right and the product works. Get this wrong and no feature list will save it.

### 5.1 Time and density

- A lesson should be finishable in a short sitting: think **5–12 minutes** of real attention.
- Enough solvables to *build* one idea, not a survey of five.
- Almost no paragraphs. If text is needed, it is a sentence that sets a goal or names what just happened.

### 5.2 The beat structure

A strong lesson has a musical structure. Use this as a default template:

1. **Hook / confrontation**  
   A situation that is slightly too interesting to skip. A picture that is already a question. “What happens if…?” or “Which of these must be true?”  
   No theory yet.

2. **Naive attempt**  
   The learner acts with whatever they have. This is the pretest. Design it so both success and failure are informative.

3. **The world talks back**  
   The diagram changes. A counterexample appears. Two cases diverge. The idea starts to have edges.

4. **Name the structure**  
   One or two sentences. A label. Maybe the first equation, attached to the thing they already moved.

5. **Tighten the model**  
   Same world, slightly harder constraint. The simplest useful case becomes the general case in small steps.

6. **Representation shift**  
   Same idea in a second form: tiles → number line → equation, or graph → table → sentence. The point is *translation*, which is understanding.

7. **A near-transfer problem**  
   Same idea, different costume. If they only memorized the last screen, they fail here. Good.

8. **Optional edge / “wait, really?”**  
   The case that breaks the sloppy version of the idea. This is where depth lives.

9. **Close with a reusable picture**  
   Leave them with a visual they can remember tomorrow. Not a paragraph of summary.

Direct instruction, when it appears, is *short and earned*. It is never the opening act.

### 5.3 One idea, many costumes

Do not teach “slope” as a definition. Teach slope as:

- steepness you can feel by dragging
- rise over run you can count on a lattice
- a number that predicts the next point
- the thing that stays put when you slide the line
- the derivative’s baby picture later

The lesson is successful when the learner can move between these without being told they are “the same.”

### 5.4 Persistence of the visual world

Cheap products show a new clipart per question. Brilliant-class lessons often keep **one evolving diagram**.

The tangent you dragged in question 2 is still there in question 5, now with a second line. Memory has an object to hold. Cognitive load drops. The story of the lesson is visible.

### 5.5 The solvable (atomic unit)

A solvable is not “a multiple choice with a picture.”

Properties of a good solvable:

- There is a **decision** the learner must make in the world.
- The action space is small enough to try, rich enough to think.
- Right and wrong both produce a *visible* consequence.
- It is retryable. Failure is cheap.
- Submission pattern is predictable across the product (do not invent a new CTA every screen).
- After an attempt, a **canonical path** can be revealed — how a clear thinker would have seen it — without shaming the path they took.
- XP / progress is awarded for honest work, including recovered work after a miss.
- Hints, if any, are sought, not sprayed. (They even experimented with removing always-on tips to reduce passivity.)

Input types that matter at product level (not implementation):

- drag objects / pieces / tiles
- sliders (1D parameters)
- locators (2D position on the diagram)
- steppers through time or algorithm steps
- plot / place points
- graph or reshape a curve
- number or expression entry
- short choice (only when the choices are *ideas*, not trivia)
- assemble a small program or block sequence
- match / classify / sort into a structure
- estimate, then refine

Multiple choice is allowed when the choices are *competing interpretations of the same picture*. It is lazy when it is four numbers and a cartoon.

### 5.6 Prediction is a first-class move

Before the animation runs, ask what will happen.

Prediction creates a stake. The visual then confirms or violates. That gap is the lesson. Passive playback of a perfect animation teaches almost nothing. Research on interactive visuals finds **active control** is what moves intermediate conceptual learning, not watching.

### 5.7 Difficulty curve inside the lesson

Treat each lesson like a short game world:

- first solvable: almost impossible to misunderstand the task
- middle: the actual idea
- last: a twist that requires the idea, not the pattern of the last click

Flow dies in two ways: too easy (boredom, click-through) and too hard with no handle (quit). The handle is either a smaller interactive step or a coach question, never a paragraph of theory dumped on a stuck person.

---

## 6. The visualization-as-question doctrine

This is the design law. Agents should treat violations as bugs.

### 6.1 A visualization that you only watch is an illustration

Illustrations belong in textbooks. They are allowed as a *beat* inside a lesson, not as the lesson.

### 6.2 A visualization you can change is a model

A model has:

- parts
- relationships
- at least one thing the learner can vary
- a visible consequence of that variation

The question is: *what must stay true when you vary this?*

### 6.3 The question should be unanswerable without looking

If a learner can answer from the text alone, the visual is decoration. Rewrite.

If a learner can answer by pattern-matching the last screen, the visual is a costume. Change the surface.

### 6.4 The interaction should expose structure, not perform it

Bad: an animation that *shows* the Pythagorean proof assembling itself while you watch.  
Good: pieces the learner can rearrange until the same areas obviously match, *then* a question: why did that have to work?

The “aha” is owned by the learner.

### 6.5 Parameters beat plots of a single case

Whenever an idea has a knob (angle, probability, mass, learning rate, sample size), give them the knob. The family of cases is the concept. One screenshot is an example.

### 6.6 Multiple linked representations

The gold standard: change one view, the others move.

- equation ↔ graph
- table ↔ plot
- code ↔ output world
- probability area ↔ fraction ↔ expected count

The link *is* the lesson.

### 6.7 Visual hygiene

Elegance is restraint.

- One focal object.
- Motion only when it means something.
- Color encodes meaning, not mood.
- No chartjunk, no mascot noise on the canvas.
- The same visual language across a course so the learner learns the dialect once.
- Precision: if it is geometry, it is exact; if it is a sketch of an idea, it is obviously a sketch.

Authors at Brilliant built thousands of diagrams with shared toolkits and styles for this reason. Consistency is pedagogy.

### 6.8 What “pose visualizations as questions” means in practice

Every interactive should be writable as a question in this family:

- What happens if I change X?
- Which of these is the same structure in disguise?
- What is invariant here?
- What would I have to break to make this false?
- Can I force this situation to happen?
- Which representation is lying?
- Estimate first: too high, too low, or about right?
- Build the thing that satisfies the constraint.

If you cannot name the question, you do not have a lesson. You have a demo.

---

## 7. Feature set — macro

These are product capabilities, not tickets.

### Curriculum and navigation

- Subject worlds: math first (deepest), then coding / computational thinking, then data, then science. Depth over catalog sprawl.
- Courses composed of short lessons grouped in levels.
- Learning paths: curated sequences with checkpoints.
- Placement that starts people at a true level without a humiliating 80-question exam. A short interactive diagnostic is enough.
- Jump / explore mode for the curious; suggested next for the lost.
- “I have a question in my own words” → route into the right lesson, do not answer in chat and send them away.

### Lesson engine

- Solvable-first authoring.
- Shared evolving canvas per lesson.
- Unified submit / retry / reveal-canonical-answer pattern.
- Start over.
- Progress that distinguishes *completed*, *understood*, *needs review*.

### Interaction library (product primitives)

A small, composable set used everywhere, so learners gain fluency and authors stay consistent:

- slider, locator, stepper
- draggable parts / tiles / cards
- point plotter
- function / graph manipulator
- expression field
- classification board
- mini block-code or rule builder
- highlightable regions the coach can point at

Better to have 12 primitives used with taste than 80 one-off widgets.

### Feedback and tutoring

- Immediate world-response (the diagram changes) *and* a short evaluation of the claim.
- Misconception library per concept (the 5 ways people usually get this wrong).
- Coach that can point, ask, and spawn a smaller step.
- Coach that will not emit the final answer unless the learner has already done the work and asks to see a canonical solution.
- Alternate explanation on request (“try another angle”).
- Fade schedule: more help on first contact, less on review.

### Practice and memory

- Variant generator under human / designer direction (same objective, new numbers, new story, new graph).
- Spaced return of weak ideas.
- Interleaved mixed sets at the end of a level.
- Review that is itself interactive, not a flashcard of definitions.

### Habit and motivation

- Daily small win.
- Streak with a humane buffer.
- XP tied to real effort.
- Tiny weekly leagues, not global fame.
- Optional daily puzzle as culture.
- Home widget / reminder is a feature of the habit layer, not of learning.

### People around the learner

- Teacher / parent view: activity, completion, stuck points.
- Assign a lesson or let them roam.
- No theater of analytics that nobody uses.

### Tone and accessibility

- Visual-first helps many dyscalculic and language-loaded learners. Keep that.
- Keyboard and screen-reader story for every primitive, even if v1 is imperfect.
- Language that is plain and adult.
- Internationalization of *lessons*, not just chrome — math is not English.

---

## 8. Feature set — micro (the craft inside a screen)

These are the small things that create the feeling of quality.

- The first sentence is a goal or a puzzle, never a definition.
- The primary action is on the object, not on a “Submit” that is the only verb.
- Every slider has a purpose; unused knobs are removed.
- Numbers on the canvas are readable and few.
- When the learner is wrong, the world shows *why* if possible (the areas don’t match; the point is not on the circle; the program loops).
- Copy is short, concrete, and specific. “Look at the marked points” beats “consider the relationship.”
- Encouragement is factual (“the left side matches; the right side doesn’t”) not empty (“Great job!!”).
- After success, a one-line *why*, then the next problem. Do not celebrate so long that flow dies.
- After reveal, the canonical explanation is itself slightly interactive or tightly tied to the same picture.
- A lesson never ends on a wall of recap. It ends on a last clean use of the idea.
- Transitions between solvables keep spatial memory (the graph does not jump to a new layout without cause).
- Time / animation is learner-paced (stepper), not a video they cannot interrupt.
- “Start over” is always available and never punished.
- Choice options are parallel in form so the decision is conceptual, not grammatical.
- Estimates are first-class: a guess can be wrong and still productive.
- Hidden state is minimized. If a parameter matters, it is visible.

---

## 9. Curriculum philosophy

### Teach unlocking ideas, not everything

Brilliant is deliberate: the concepts that unlock many others, not a full encyclopedia. An open alternative should be even more honest about this.

A good curriculum graph:

- few roots (number sense, proportional reasoning, functions, rate, chance, representation, decomposition)
- many doors those roots open
- later courses that *reuse* early visual worlds so the product feels like one mind

### Math and coding as thinking tools

Their deepest bet: math and coding train transferable problem-solving. Data and science ride that horse. Do not start by trying to be all of Khan + Coursera + a textbook publisher.

### Sequence like a designer, not like a table of contents

School order is not sacred. Visual algebra can precede symbol-heavy algebra. Probability can be area and simulation before formulas. Derivatives can be “how does this output twitch when I twitch the input?” before limits liturgy.

### Applications as clothing, not as the point

A cafe dataset or an orbit is a costume for a structure. Keep the structure visible. Do not become a themed worksheet farm.

### Mastery before novelty

The hunger to add new courses will kill quality. 20+ good problems on one idea beat a new topic with four screens.

---

## 10. Motivation without corrupting learning

Gamification on Brilliant works because the core loop is already satisfying. Points decorate a real game. They cannot *be* the game.

Rules for the open product:

1. **Never reward skip-thinking.** If a learner can farm XP by guessing fast, the economy is wrong.
2. **Streaks measure showing up, not genius.** Keep the daily bar low and honest.
3. **Leagues should be small and weekly.** 30 people is social. 30 million is noise and anxiety.
4. **Safety valves** (a couple of missed-day saves) prevent streak tyranny from turning into guilt software.
5. **No dark patterns.** The product should be something a careful parent is proud to hand a child, and something an adult enjoys at 11pm without feeling manipulated.
6. **Joy is in the click**, then in the habit. If the click is missing, no badge will create a learner.

Self-determination theory is enough theory here: competence (I can do this next thing), autonomy (I chose this puzzle), relatedness (optional, small, human). Do not fake relatedness with a cartoon tutor that flatters.

---

## 11. What “good” feels like (quality bar)

Use this as an acceptance test for any lesson an agent produces.

**The eight-minute test.** A curious adult who is rusty can sit down cold and have at least one genuine “oh” in under eight minutes.

**The mute test.** With the tutor off and the explanations hidden, the interactives alone still teach *something*. If they don’t, they are quizzes with extra pixels.

**The transfer test.** Change the story and the numbers. Does the lesson still work, or did they memorize the screenshot?

**The representation test.** Can the learner show the idea two ways?

**The struggle test.** A wrong path is possible, visible, and recoverable without a lecture.

**The silence test.** Could you remove 30% of the words and lose nothing? Then remove them.

**The pride test.** Would a serious person send this lesson to a friend because the *idea* is beautiful, not because the product is viral?

**The Koji test.** If a coach speaks, does it ask more than it tells? Does it touch the same canvas?

**The tomorrow test.** Is there a picture left in the head tomorrow?

If a lesson fails two of these, rewrite. Do not ship and “iterate later.” This genre dies from almost-good content.

---

## 12. What to copy from Brilliant, what to do better

### Copy without apology

- Learner inside the problem
- Visual model before symbols
- Question before procedure
- One idea per section
- Evolving canvas
- Retry-without-shame
- Feedback while reasoning is warm
- Tutor that refuses to steal work
- Practice as retrieval in new contexts
- Short daily loop
- Quiet, adult visual tone
- Mastery of unlocking concepts

### Do better (open-source advantages)

- **Open lessons as objects.** A lesson should be inspectable, forkable, and improvable by teachers and learners. Brilliant’s quality comes from a closed craft shop. An open craft shop can win on volume *only if* the quality bar in §11 is enforced.
- **Authorable primitives, not one-off art.** Give the world a small language of interactives so humans and agents compose lessons in the same dialect.
- **Misconceptions as first-class data.** Build a public library of “ways this idea breaks” per concept. Tutor and feedback should consume it.
- **Explain the pedagogy in the product.** A “why this lesson is shaped this way” note for teachers — Brilliant is quiet about craft; openness can teach the teachers too.
- **Broader subjects later, same doctrine.** The doctrine is not math-only. Any idea with a structure (music, law of large numbers, compilers, supply and demand, special relativity as invariants) can be a visual question.
- **Honest free tier.** Do not amputate the studio to sell the coach. The interactives *are* the product.
- **Local / offline / classroom reality.** Many learners will not have a perfect always-online premium life.
- **No cognitive offloading theater.** In an AI era this is the ethical differentiator: the product exists so the human still thinks. Say that out loud.

### Do not copy

- Paywalls that lock the actual thinking tools.
- Feature sprawl (charts for teachers that nobody reads, social noise).
- A tutor that is just ChatGPT in a sidebar.
- Video-first “and then a quiz.”
- Coverage for marketing (“500 courses!”) at the cost of the 20-problems-per-idea rule.

---

## 13. Non-goals

Be explicit so agents do not wander.

- Not a video MOOC.
- Not an LMS.
- Not a certificate mill.
- Not a homework auto-grader for existing worksheets.
- Not an AI that explains chapters.
- Not a general chatbot with graphing-calculator plugins.
- Not a Wikipedia of STEM with sliders glued on.
- Not a dopamine app that happens to contain math.

---

## 14. Operating principles for anyone (or any agent) building this

1. **Put the learner inside the problem.**
2. **The visualization is the question.**
3. **Concrete, then language, then symbols.**
4. **Ask before you tell.**
5. **Guide; do not abandon; do not carry.**
6. **One idea. Simplest useful case. Then complexity.**
7. **Keep one world on screen long enough to remember it.**
8. **Wrong answers must change the world or name the misconception.**
9. **Struggle is the point. Help protects struggle. It does not erase it.**
10. **Practice is the same idea in new clothes, later.**
11. **Words are expensive.**
12. **If XP can be farmed, the lesson is broken.**
13. **Depth beats catalog.**
14. **Fade the tutor.**
15. **Ship only what passes the quality bar.**

---

## 15. A worked sense of “features” mapped to layers

Use this as a backlog brain, not a sprint plan.

| Layer | Macro features | Micro features |
|---|---|---|
| Studio | Lesson player, solvable types, evolving canvas, start-over, canonical reveal | Prediction prompts, linked representations, quiet layout, paced steppers |
| Coach | See-the-canvas tutor, misconception prompts, mute, alternate angle | Point at region, spawn mini-step, refuse final answer |
| Gym | Practice sets, variants, mixed review, checkpoints | Surface-change rules, edge-case slots, 20+ per concept |
| Map | Courses, paths, placement, search-by-question | “You are here,” next-eight-minutes, mastery vs completion |
| Habit | Streaks, small leagues, daily puzzle, home prompt | Low daily bar, 2-charge buffer, no farmable XP |
| Culture | Shareable puzzles, explanations, teacher view | Adult tone, pride test, no mascot clutter |

---

## 16. Glossary

**Solvable.** An interactive question that requires a decision in a visual world. The atomic unit of a lesson.

**Visual world / canvas.** The diagram or model that persists across solvables and can be manipulated.

**Guided discovery.** A sequence that makes the learner construct the idea, with enough structure that they are not guessing in the dark.

**Canonical explanation.** The clean way to see the problem, offered after an attempt, tied to the same picture.

**Unlocking concept.** An idea that makes many later ideas cheap (functions, rate, invariance, decomposition, expected value, etc.).

**Surface change.** New story, numbers, or graph that still requires the same structure. The enemy of pattern-copying.

**Fade.** The planned withdrawal of help as competence grows.

**Click.** The moment the structure becomes obvious to the person who moved it. The product’s true KPI.

---

## 17. Closing brief for agents

When you design a lesson, do not start with “explain topic X.”

Start with:

1. What is the structure?
2. What object can a human move that makes that structure visible?
3. What question is unanswerable without moving it?
4. What wrong move is most likely, and how does the world show it?
5. What is the simplest useful case?
6. What is the same idea in different clothes?
7. What picture should still be in their head tomorrow?

Then write the sequence of solvables. Only then write the few sentences of language that name what they already did.

That is how Brilliant makes visualizations that teach.  
That is the whole thesis.
---
