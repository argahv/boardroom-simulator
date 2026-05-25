# Real-World Workflow: Sales Briefing via Simulation

**What this product actually is**: An Account Executive (AE) uses a simulation to prep for a high-stakes customer call.

**Target user**: Enterprise sellers at Series B–D SaaS, selling $250K–$5M deals to buying committees (4+ stakeholders).

**The AE's problem**: Before the call with the buyer's committee, they need to anticipate objections and coalition dynamics. A single missed objection can cost the deal. They can't run the call twice.

---

## Real-World Workflow (Today)

### Step 1: Deal Intake — The AE Enters Company + Deal Context

The AE opens the web app and fills a form:
- **Company name & industry** (e.g., "Acme Corp, B2B SaaS")
- **Deal size** ($1.2M ACV)
- **Stage** (technical evaluation phase)
- **Known stakeholders** with titles
  - Sarah Chen, VP of Procurement
  - Marcus Johnson, CTO
  - Jennifer Park, CFO
  - Robert Singh, End User (ops manager)
- **Known objections** (AE's guesses based on past calls, emails, RFP responses)
- **The call's purpose** (technical deep-dive on security architecture)
- **AE's intended outcome** (get their security team aligned on the architecture)

### Step 2: Current UI (MVP) — Manual Attributes & Evidence Entry

Frontend `Step 1 — Configure Debate` asks:
- **Subject name**: "Acme Corp Technical Evaluation Deep-Dive"
- **Description**: "Acme's security team will challenge our data residency model. They want on-prem encryption and audit logs."
- **Stakes**: "If they reject our architecture, they move to a competitor."

**Then** it asks for Attributes (Key/Value):
```
Key: deal_size
Value: 1200000

Key: approval_timeline
Value: 45 days

Key: security_requirement
Value: on-prem_data_residency
```

**And** Evidence items:
```
• RFP rejected cloud-only option, specifically requested on-prem residency
• CTO mentioned they've had data breach lawsuits before
• CFO is cost-conscious, wants proof ROI beats current system by 30%
```

### Step 3: Simulation Runs

Backend instantiates 4 agents (one per stakeholder persona):
- Sarah Chen (Economic buyer / Procurement) → persona: "pragmatic negotiator, cost-focused"
- Marcus Johnson (Technical gatekeeper / CTO) → persona: "security-first, risk-averse"
- Jennifer Park (CFO) → persona: "financially driven, skeptical of vendor lock-in"
- Robert Singh (End user) → persona: "wants easy migration, minimal disruption"

Each agent is fed:
- Their persona briefing (from the library or custom)
- **Subject name + description** ← current implementation uses these
- **Attributes + evidence** ← currently IGNORED by the runtime
- Hidden agendas (conflicts between stakeholders)

Agents debate for 4–8 turns simulating the call.

### Step 4: Briefing Generation

A summarizer agent reads the transcript and produces:
- Top 5 likely objections ranked by probability
- Coalition map (who aligns with whom and why)
- Recommended positioning moves
- Risk callouts

**The output the AE gets**: A 2-page PDF briefing to read before the real call.

### Step 5: The Real Call Happens

The AE runs the actual call with the 4 stakeholders.

### Step 6: Post-Call Feedback

Within 48 hours, the AE reports:
- Which predicted objections actually came up? (hit rate)
- Were there objections we missed?
- Did the briefing change how you ran the call? (behavior change)
- What was the outcome?

---

## The Gap: What Real Data Should Look Like

Currently, the AE manually types `deal_size: 1200000` and `approval_timeline: 45 days` as key-value strings.

In a real product (Phase 3 vision from ROADMAP.md), this data would come from:

### Salesforce / HubSpot Integration
```json
{
  "deal_stage": "Technical evaluation",
  "deal_amount": 1200000,
  "deal_created_at": "2026-04-15",
  "approval_timeline": "45 days",
  "stakeholders": [
    {
      "name": "Sarah Chen",
      "title": "VP of Procurement",
      "email": "sarah.chen@acme.com",
      "last_activity": "2026-05-20 email",
      "response_time_hours": 4,
      "cc_frequency": "high"
    },
    ...
  ],
  "notes": "...",
  "deal_size_category": "enterprise"
}
```

### Gong / Chorus Call Transcripts
```json
{
  "previous_calls": [
    {
      "date": "2026-05-15",
      "speakers": ["Sarah Chen", "Marcus Johnson"],
      "transcript_excerpts": [
        "Marcus: We had a data breach in 2024. On-prem is non-negotiable.",
        "Sarah: We're comparing to [competitor]. Their TCO is $900K. You need to beat that.",
      ]
    }
  ]
}
```

### LinkedIn Data (tenure, prior companies, signals)
```json
{
  "stakeholders": [
    {
      "name": "Marcus Johnson",
      "title": "CTO",
      "tenure_at_company": "3 years",
      "prior_companies": ["Google", "AWS"],
      "inferred_seniority": "high",
      "decision_authority": "veto power on security"
    }
  ]
}
```

### Email Thread Analysis
```json
{
  "tone": "formal, demanding",
  "response_latency": "4 hours avg (fast, engaged)",
  "who_cc_each_other": {
    "Sarah Chen": ["Marcus Johnson", "Jennifer Park"],
    "Marcus Johnson": ["CTO reports", "security team"]
  },
  "key_phrases": ["must have", "non-negotiable", "regulatory requirement"]
}
```

---

## What the Attributes/Evidence UI Should Enable

Currently, the UI collects attributes and evidence but agents **never see them**. 

In a working product:

### Attributes Should Feed Agent Context
```
{
  "deal_size": 1200000,
  "approval_timeline": "45 days",
  "security_requirement": "on-prem_data_residency",
  "cto_prior_breach": true,
  "current_vendor_cost": 850000,
  "acme_revenue_category": "enterprise_10k+",
}
```

Agents would see in their system prompt:
```
"Context for this deal:
- Deal size: $1.2M ACV
- Decision must be made in 45 days
- CTO has had a prior breach; security is non-negotiable
- Existing vendor costs $850K. Your proposal needs to beat that ROI-wise.
- This is a large enterprise customer."
```

Instead of inventing numbers, the CTO agent would say:
> "Look, we had a breach in 2024. Our board mandated on-prem data residency for any new tools. Your cloud-only model disqualifies you immediately."

**Current behavior** (without attributes):
> "Security is important to us. We need to think about data protection."

### Evidence Should Anchor Agent Arguments
```
evidence_items: [
  "RFP explicitly rejected cloud-only option",
  "CTO email from May 15: 'We had a data breach in 2024. On-prem is non-negotiable.'",
  "CFO noted competitor's TCO is $900K. Yours needs to beat that.",
  "Acme's last IT vendor change took 8 months. Plan for migration time.",
]
```

Agents would cite evidence:
> "In your RFP you explicitly said 'no cloud-only solutions.' Our architecture requires cloud. That's a deal-killer."

**Evidence chain for the CFO agent:**
> "Your competitor is offering TCO of $900K. By your own RFP, you need to show 30% ROI improvement over your current $850K spend. That puts your break-even at $595K ACV. Your proposal is $1.2M. Walk me through that math."

**Current behavior**:
> "Cost is a concern for us."

---

## The Full Flow — What Needs to Happen

### Phase 1 MVP (Current State)
1. AE manually types attributes + evidence as key/value strings
2. Attributes/evidence are stored but **never reach agents**
3. Agents reason about deal abstractly using only name + description
4. Briefing quality is limited because agents lack grounding facts
5. Hit rate targets (≥60%) will be hard to hit

### Phase 2 MVP (With Real Data Flow)
1. AE manually types attributes + evidence as structured data
2. Backend validates and formats attributes (number, string, boolean, enum)
3. Agents receive attributes + evidence in system prompt
4. Agents cite evidence and reference concrete numbers
5. Briefing quality improves because reasoning is grounded
6. Hit rate targets become achievable (≥60%)

### Phase 3 (With Integrations)
1. Salesforce/HubSpot API pulls: deal_size, stakeholders, stage, notes
2. Gong API pulls: call transcripts with verbatim quotes from stakeholders
3. LinkedIn scrape pulls: tenure, title, decision authority, prior companies
4. Email analysis pulls: tone, response patterns, coalition signals
5. All of this becomes structured attributes + evidence
6. Agents reason about real signals, not guesses
7. Hit rate improves further (≥70%) with higher-quality evidence

---

## What Can Be Done — Immediate Actions

### Action 1: Wire Up Attributes & Evidence (Backend, 1 hour)
**Location**: `backend/app/runtime/agent.py` line 248

**Currently**:
```python
template = self.system_prompt_template or (
    "You are {name}, {role}. {backstory}\n"
    "Current subject: {subject_name} — {subject_description}\n"
    "Hidden agenda: {hidden_agenda}\n"
    ...
)
```

**Should be**:
```python
template = self.system_prompt_template or (
    "You are {name}, {role}. {backstory}\n"
    "Current subject: {subject_name} — {subject_description}\n"
    
    # ADD THESE:
    "Key facts: {attributes_formatted}\n"
    "Evidence and context: {evidence_formatted}\n"
    
    "Hidden agenda: {hidden_agenda}\n"
    ...
)

# Add formatting (in template.format() call):
attributes_formatted = "; ".join([
    f"{k}: {v}"
    for k, v in self.space.config.subject.attributes.items()
]) or "None provided"

evidence_formatted = "\n".join([
    f"• {item}"
    for item in self.space.config.subject.evidence_items
]) or "None provided"
```

**Impact**: Agents now see attributes and evidence. Briefing quality jumps.

### Action 2: Improve Attributes/Evidence UI (Frontend, 2 hours)
**Location**: `frontend/app/simulate/new/page.tsx` lines 225–270

**Quick wins**:
1. Add type indicator to Attributes: `[Key] [Type: string/number/boolean] [Value] [Add]`
2. Evidence cards instead of flat text: `[Input] [Add]` → displays as `[Priority: high/med/low] [Source URL] [Text] [Delete]`
3. Validation: warn on duplicate attribute keys, suggest templates
4. Keyboard flow: Tab Key→Type→Value→Add, Enter submits

**Result**: Users enter richer structured data that agents can use better.

### Action 3: Add Attributes/Evidence Templates (Frontend, 1 hour)
**Location**: `frontend/app/simulate/new/page.tsx` line 225

**Pre-built templates for common scenarios**:
```
"Enterprise SaaS Deal":
  - deal_size: number
  - approval_timeline: string
  - stakeholder_count: number
  - main_blocker: string
  - current_vendor_cost: number

"M&A / Acquisition":
  - valuation: number
  - employees: number
  - revenue_growth: string
  - key_asset: string

"Policy / Government":
  - voting_members: number
  - budget: number
  - implementation_timeline: string
```

AE selects template → auto-populates attribute keys → AE fills values.

**Result**: Better data structure, consistent across deals.

### Action 4: Store Evidence with Metadata (Backend/Frontend, 2 hours)
**Current**: `evidence_items: ["string", "string"]`

**Should be**:
```python
evidence_items: [
  {
    "text": "CTO email from May 15...",
    "source": "gong_transcript | email_thread | cto_email | rfp | notes",
    "importance": "high | medium | low",
    "category": "technical | financial | timeline | legal",
    "confidence": 0.95  # how certain is this signal
  }
]
```

**Impact**: Agents can weight evidence by source and importance. CFO agent deprioritizes abstract concerns, focuses on cost signals.

---

## The Strategy

**Without** integrations (Phase 1), the bottleneck is **data quality**. The AE fills it in manually. The UI/UX for Attributes/Evidence directly impacts whether the AE provides rich, structured data or vague guesses.

**With** integrations (Phase 3), the bottleneck shifts to **signal extraction**. The integration pulls data; the UI just validates/selects.

**Today**, both layers are broken:
1. Backend doesn't use attributes/evidence (Layer 1 gap)
2. Frontend doesn't help users enter rich data (Layer 2 gap)

**Priority order**:
1. **Fix Layer 1** (backend integration) — 1 hour, massive impact
2. **Improve Layer 2** (frontend UX) — makes Layer 1 actually useful
3. **Plan Layer 3** (integrations) — when you're ready for Phase 3

Without Layer 1, improving Layer 2 is theater.

