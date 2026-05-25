/* Series B fundraise scenario — Hearthline (fictional SaaS analytics company)
   The user (pitching company) runs this simulation to predict their VC term-sheet meeting.
   ============================================================================= */

const SCENARIO = {
  id: "series-b-hearthline",
  title: "Series B / Term Sheet — Catalyst Capital",
  company: "Hearthline",
  context:
    "Hearthline is raising $30M Series B at $180M post on $4.2M ARR. Growth was 220% YoY but Q4 slowed to 15% MoM. CAC up 40%. Two lead candidates; this room is Catalyst, the preferred lead. Founder wants a 6-month runway extension and a board seat for Priya (seed).",
  goal:
    "Secure a $30M term sheet at or above $170M post, with Marin (Catalyst lead) as new board member and Priya (Optio Seed) retaining her seat.",
  voltage: 62,
  temperature: "Volatile",
  flags: { hidden: true, time: true, leaks: false, deadlock: true },
};

const STAKEHOLDERS = [
  {
    id: "marin",
    name: "Marin Vélez",
    role: "Lead Partner",
    org: "Catalyst Capital",
    focus: "Growth efficiency, market position",
    tag: "SKEPTICAL",
    tools: "financial",
    incentive: 74,
    agenda:
      "Wants to push price down to $150M post; needs to justify the deal to her IC after two soft Q4 quarters.",
    initials: "MV",
    accent: "var(--ink)",
    seat: 0,
  },
  {
    id: "devon",
    name: "Devon Park",
    role: "Operating Partner",
    org: "Catalyst Capital",
    focus: "GTM, founder coachability",
    tag: "CALIBRATING",
    tools: "comms",
    incentive: 52,
    agenda:
      "Sold his own startup at the same stage in 2014. Watches for founder defensiveness — that's his single tell.",
    initials: "DP",
    accent: "var(--accent-amber)",
    seat: 1,
  },
  {
    id: "yuki",
    name: "Yuki Tanaka",
    role: "Senior Associate",
    org: "Catalyst Capital",
    focus: "Technical DD, cohort math",
    tag: "SKEPTICAL",
    tools: "technical",
    incentive: 61,
    agenda:
      "Found a NRR dip in the Q3 enterprise cohort that nobody has flagged yet. Plans to surface it mid-meeting.",
    initials: "YT",
    accent: "var(--accent-teal)",
    seat: 2,
  },
  {
    id: "aaron",
    name: "Aaron Becker",
    role: "Junior Partner",
    org: "Catalyst Capital",
    focus: "Deal champion, sourcer",
    tag: "AGREEABLE",
    tools: "none",
    incentive: 88,
    agenda:
      "Sourced the deal; his promotion case rests on it closing. Will steer the room away from price talk if he can.",
    initials: "AB",
    accent: "var(--primary)",
    seat: 3,
  },
  {
    id: "priya",
    name: "Priya Raghavan",
    role: "Seed Investor",
    org: "Optio Ventures",
    focus: "Founder advocate, board continuity",
    tag: "VISIONARY",
    tools: "none",
    incentive: 80,
    agenda:
      "Wants to keep her board seat. Will absorb dilution to keep Marin's check off pro-rata language.",
    initials: "PR",
    accent: "var(--success)",
    seat: 4,
  },
];

/* Each event is one turn. The simulator plays them on a timer.
   action: statement | question | challenge | compromise | coalition_signal | interrupt | escalate
   tone: emotional tone, used for sentiment graph.
*/
const TRANSCRIPT = [
  {
    t: 0,
    by: "marin",
    action: "statement",
    tone: 0,
    text:
      "Thanks for coming back in. Before we walk through the term sheet, I want to revisit the Q4 number. 15% month-over-month after a 220% year is not a soft landing — it's a question.",
    reason: "Anchors the room on the slowdown so price discussion starts from a defensive position.",
  },
  {
    t: 1,
    by: "aaron",
    action: "compromise",
    tone: 0.4,
    text:
      "To be fair, Q4 is when they pivoted into mid-market. The mix shift explains most of it. Let's not start the meeting on the dip.",
    reason: "Champion move — reframe the dip as deliberate, defuse before the founder has to.",
  },
  {
    t: 2,
    by: "yuki",
    action: "challenge",
    tone: -0.5,
    text:
      "It explains part of it. I pulled the Q3 enterprise cohort last night — NRR dropped from 134 to 109 in two quarters. That's not mix shift. That's logos churning at the top.",
    reason: "Yuki tips the hidden agenda — surfaces the NRR finding earlier than the wizard predicted.",
    leverage: { from: "founder", to: "yuki", delta: 12 },
  },
  {
    t: 3,
    by: "marin",
    action: "coalition_signal",
    tone: -0.3,
    text:
      "Yuki, send that breakdown to the founder after this. If the top cohort is leaking, the $180M is hard.",
    reason: "Marin pairs with Yuki to apply price pressure — coalition forms.",
    coalition: ["marin", "yuki"],
  },
  {
    t: 4,
    by: "priya",
    action: "interrupt",
    tone: 0.2,
    text:
      "Sorry — before we slide into valuation. The two churned logos were both pilot conversions that should never have been booked as ARR. The seed board flagged it at the time.",
    reason: "Priya cuts in to defend the founder; references seed-board memory as authority.",
  },
  {
    t: 5,
    by: "devon",
    action: "question",
    tone: 0,
    text:
      "Priya, if you flagged it, why did the number stay in the deck through Series A?",
    reason: "Devon tests the founder-investor relationship for cracks. Pure calibration move.",
  },
  {
    t: 6,
    by: "priya",
    action: "statement",
    tone: -0.1,
    text:
      "Because the founder pushed back and I didn't die on the hill. That's on me, not on the team.",
    reason: "Priya takes the hit personally — protects founder credibility at her own expense.",
    align: { priya: -8 },
  },
  {
    t: 7,
    by: "aaron",
    action: "compromise",
    tone: 0.3,
    text:
      "Look — the cohort question is fair, but it's a covenant issue, not a valuation issue. We can size the round at $30 on $170, hold back $5M on milestones, revisit in twelve months.",
    reason: "Aaron offers a structural compromise to keep price near target — tranching as escape hatch.",
  },
  {
    t: 8,
    by: "marin",
    action: "challenge",
    tone: -0.4,
    text:
      "I'm not doing a tranched B. Either we believe the trajectory at $150 flat, or we pass. Tranches are a tax on the founder and a babysitting job for me.",
    reason: "Marin rejects the compromise and re-anchors lower. Hard line.",
    leverage: { from: "aaron", to: "marin", delta: 8 },
  },
  {
    t: 9,
    by: "devon",
    action: "statement",
    tone: 0.1,
    text:
      "I'll say this — I sold a company at this stage with worse Q4 numbers. What I'd want to see is the founder talk about the dip without a deck. That's the signal.",
    reason: "Devon shifts the meeting toward a founder-pressure test. Coachability check.",
  },
  {
    t: 10,
    by: "yuki",
    action: "statement",
    tone: -0.2,
    text:
      "If we go to $150, I can underwrite it. At $170 I'd want a participating pref, capped 1.5x.",
    reason: "Yuki proposes terms — moves from objection into actual deal structure.",
  },
  {
    t: 11,
    by: "priya",
    action: "challenge",
    tone: -0.3,
    text:
      "Participating pref is a non-starter. We didn't take it at seed and we won't take it at B. If that's where we are, the round goes to Threadline.",
    reason: "Priya invokes the competing offer — credible walk-away signal.",
    leverage: { from: "marin", to: "priya", delta: 14 },
    coalition: ["priya"],
  },
  {
    t: 12,
    by: "marin",
    action: "statement",
    tone: 0,
    text:
      "Then let's talk about what gets us to $170 without participating. I want to hear how the founder thinks about the next four cohorts — by month, not by quarter.",
    reason: "Marin yields on participating pref and opens the negotiable space.",
  },
  {
    t: 13,
    by: "aaron",
    action: "compromise",
    tone: 0.5,
    text:
      "$170 post, clean 1x non-participating, 20% option pool pre, Marin joins, Priya stays. That's the room we're in.",
    reason: "Aaron lands the structure — clean terms, board continuity preserved.",
  },
  {
    t: 14,
    by: "devon",
    action: "statement",
    tone: 0.3,
    text:
      "I can live with that if the founder spends fifteen minutes on the Q4 cohort with no slides. That's my one ask.",
    reason: "Devon accepts in exchange for the founder coachability test.",
  },
  {
    t: 15,
    by: "marin",
    action: "compromise",
    tone: 0.2,
    text:
      "Fine. $170, clean prefs, two-week confirmatory diligence on the enterprise book. We can have paper Thursday.",
    reason: "Marin commits to a timeline — closing band reached.",
    align: { marin: 18, yuki: 6, aaron: 22, devon: 8, priya: 4 },
  },
];

const EVENT_LOG = [
  { t: 0,  type: "sim", text: "Simulation started · voltage 62 · temperature volatile" },
  { t: 0,  type: "agent", text: "marin.statement → anchored on Q4 slowdown" },
  { t: 1,  type: "agent", text: "aaron.compromise → reframe attempt" },
  { t: 2,  type: "tool",  text: "yuki invoked check_financials → NRR cohort series Q1–Q4" },
  { t: 2,  type: "alert", text: "Unanticipated objection: cohort NRR dip surfaced" },
  { t: 3,  type: "graph", text: "Coalition formed: marin + yuki (pricing pressure)" },
  { t: 4,  type: "agent", text: "priya.interrupt → defended founder revenue recognition" },
  { t: 6,  type: "graph", text: "Alignment delta: priya −8 (took personal credibility hit)" },
  { t: 8,  type: "alert", text: "Leverage shift: aaron → marin (+8)" },
  { t: 11, type: "alert", text: "Walk-away signal detected from priya (Threadline)" },
  { t: 11, type: "graph", text: "Leverage shift: marin → priya (+14)" },
  { t: 12, type: "agent", text: "marin yielded on participating pref" },
  { t: 13, type: "agent", text: "aaron.compromise → clean 1x non-participating, 20% pool" },
  { t: 15, type: "sim",   text: "Closing band reached · $170M post · confirmatory diligence" },
];

const INCENTIVE_BARS = [
  { label: "Capital Efficiency", value: 71, hint: "Marin & Yuki anchored here all meeting." },
  { label: "Founder Continuity", value: 64, hint: "Devon's coachability test is the wedge." },
  { label: "Board Composition", value: 82, hint: "Priya's seat is the surprise wedge." },
];

const LEVERAGE_EVENTS = [
  { from: "founder", to: "yuki",  delta: 12, t: 2,  reason: "NRR dip surfaced first" },
  { from: "aaron",   to: "marin", delta: 8,  t: 8,  reason: "Tranche compromise rejected" },
  { from: "marin",   to: "priya", delta: 14, t: 11, reason: "Walk-away credible (Threadline)" },
];

const LEADERBOARD = [
  { id: "priya",  rank: 1, score: 84, delta: +18, reason: "Walk-away credibility absorbed by room" },
  { id: "aaron",  rank: 2, score: 76, delta: +12, reason: "Landed final clean structure" },
  { id: "marin",  rank: 3, score: 71, delta:  +4, reason: "Yielded on participating pref" },
  { id: "yuki",   rank: 4, score: 58, delta:  +9, reason: "Cohort finding shifted price" },
  { id: "devon",  rank: 5, score: 52, delta:  +2, reason: "Coachability ask priced in" },
];

const POSTMORTEM = {
  confidence: 72,
  confidenceDelta: +14,
  consensus: 64,
  unanticipated: 2,
  summary:
    "Two dynamics outran the wizard's model. First, Yuki surfaced the Q3 enterprise NRR dip in turn 2 — a full eight turns earlier than baseline. Second, Priya's Threadline walk-away functioned as a price floor; the room repriced from $150 to $170 in three turns. Plan to lead with the cohort breakdown on the first slide rather than waiting for it to surface, and brief Priya beforehand on when to deploy Threadline so it lands as a coalition signal, not an outburst.",
  alignment: [
    { id: "marin", delta: +18, quote: "Then let's talk about what gets us to $170 without participating." },
    { id: "devon", delta: +8,  quote: "I sold a company at this stage with worse Q4 numbers." },
    { id: "yuki",  delta: +6,  quote: "If we go to $150, I can underwrite it." },
    { id: "priya", delta: -4,  quote: "That's on me, not on the team." },
    { id: "aaron", delta: +22, quote: "$170 post, clean 1x non-participating, 20% option pool pre." },
  ],
  strategy: [
    {
      objection: "Q3 enterprise cohort NRR dropped from 134 to 109",
      counter:
        "Open the meeting with the cohort breakdown. Frame the two churned logos as pilot misclassifications and present revised NRR.",
      risk: "MEDIUM",
    },
    {
      objection: "Tranche structure floated by Aaron as escape valve",
      counter:
        "Pre-empt with: tranches are off the table. State this in the founder's opening — Marin will respect it.",
      risk: "LOW",
    },
    {
      objection: "Participating preferred surfaced by Yuki",
      counter:
        "Have Priya deploy the Threadline term sheet at the moment participating is named. Walk-away credibility resets the term immediately.",
      risk: "HIGH",
    },
    {
      objection: "Founder coachability test (Devon's no-deck Q4 ask)",
      counter:
        "Brief the founder on a 15-minute no-deck cohort talk. Include three cohorts by month, named customer reasons, no apologies.",
      risk: "LOW",
    },
  ],
  topology: [
    {
      root: "Valuation",
      children: [
        { node: "$180M is rich after Q4", resolution: "Repriced to $170M" },
        { node: "Tranched structure", resolution: "Rejected by Marin" },
        { node: "Participating preferred", resolution: "Withdrawn after Priya walk-away" },
      ],
    },
    {
      root: "Cohort quality",
      children: [
        { node: "Q3 enterprise NRR dip", resolution: "Surfaced — covenant, not price" },
        { node: "Mix-shift narrative", resolution: "Partially accepted" },
      ],
    },
    {
      root: "Board composition",
      children: [
        { node: "Priya's seat retention", resolution: "Preserved" },
        { node: "Marin observer vs. director", resolution: "Director, voting" },
      ],
    },
  ],
  graph: {
    hostile: [["marin", "priya"]],
    influence: ["yuki → marin", "priya → marin", "aaron → devon"],
    coalitions: [
      { t: 3, pair: ["marin", "yuki"], reason: "Pricing pressure" },
      { t: 11, pair: ["priya", "aaron"], reason: "Clean-terms alignment" },
    ],
    interrupts: ["priya cut marin (t=4)", "yuki cut aaron (t=2)"],
  },
};

const SENTIMENT_BY_TURN = TRANSCRIPT.map((e) => ({ t: e.t, tone: e.tone, by: e.by }));

/* expose to other babel scripts */
Object.assign(window, {
  SCENARIO, STAKEHOLDERS, TRANSCRIPT, EVENT_LOG,
  INCENTIVE_BARS, LEVERAGE_EVENTS, LEADERBOARD, POSTMORTEM,
  SENTIMENT_BY_TURN,
});
