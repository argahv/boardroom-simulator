"""Seed the new templates table with full SimulationV2Config from frontend templates."""
import json
import asyncio
import sys
sys.path.insert(0, "..")

from app.database import initialize_database, close_database, get_database

TEMPLATES = [
    {
        "slug": "series-b-fundraise",
        "name": "Series B Fundraise",
        "description": "Founder pitches to a skeptical VC board. Tension over valuation, dilution, and governance terms.",
        "category": "Fundraising",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 5,
        "voltage": 62,
        "config": {
            "subject": {
                "name": "Series B Fundraise",
                "description": "The founding team is seeking $15M Series B at a $75M valuation. The board includes the CEO, a VC lead, a skeptical angel, the CTO, and the CFO. Key tension: growth vs. profitability tradeoffs.",
                "attributes": {"valuation": 75000000, "raise": 15000000, "revenue_arr": 3200000},
                "evidence_items": ["ARR grew 180% YoY to $3.2M", "Burn rate is $420K/month with 14 months runway", "Enterprise segment grew 340% but has 60% gross margin vs 78% SMB", "Competitor raised $25M Series C last quarter"],
                "stakes_description": "The company needs capital to capture an expanding market, but existing investors are split on whether to push for profitability first."
            },
            "stakeholders": [
                {"id": "ceo", "name": "Sarah Chen", "role": "CEO & Co-founder", "backstory": "Visionary founder who scaled the company from 0 to 40 people. Believes this is a once-in-a-generation market moment.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 70, "verbosity": 60}, "hidden_agenda": "Wants to secure the round before a key competitor announces their own raise", "tools": []},
                {"id": "vc", "name": "Marcus Webb", "role": "VC Lead (Sequoia)", "backstory": "Lead investor from seed round. Supports the raise but wants tighter governance and a board seat.", "stance": "moderator", "personality": {"aggressiveness": 45, "empathy": 55, "stubbornness": 60, "verbosity": 50}, "hidden_agenda": "Has a termsheet ready but wants to push for pro-rata rights", "tools": []},
                {"id": "angel", "name": "Elena Torres", "role": "Angel Investor", "backstory": "Early angel who wrote the first check. Skeptical of the valuation and worried about dilution for early backers.", "stance": "detractor", "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 75, "verbosity": 45}, "hidden_agenda": "Is angling for a side deal - wants advisory shares before approving", "tools": []},
                {"id": "cto", "name": "Raj Patel", "role": "CTO", "backstory": "Technical co-founder. Wants to invest in infrastructure but worried about losing engineering autonomy.", "stance": "neutral", "personality": {"aggressiveness": 30, "empathy": 60, "stubbornness": 55, "verbosity": 35}, "hidden_agenda": "Has a competing offer from a FAANG and is using it as leverage", "tools": []},
                {"id": "cfo", "name": "Diana Park", "role": "CFO", "backstory": "Financial conservative. Pushing for better unit economics before scaling further.", "stance": "detractor", "personality": {"aggressiveness": 40, "empathy": 45, "stubbornness": 80, "verbosity": 55}, "hidden_agenda": "Has identified $200K in annual waste that undermines the growth narrative", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 12},
            "system_prompt_template": "", "voltage": 62, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "merger-negotiation",
        "name": "Merger Negotiation",
        "description": "Cross-company merger terms being debated by both leadership teams. Culture clash, valuation gaps, and retention risks.",
        "category": "M&A",
        "difficulty": "hard",
        "estimated_duration": "7 min",
        "stakeholder_count": 6,
        "voltage": 75,
        "config": {
            "subject": {
                "name": "Cross-Company Merger",
                "description": "Two mid-market SaaS companies are negotiating a merger of equals. Company A (Acquirer) is product-led, Company B (Target) is sales-led. Integration strategy, cultural fit, and leadership roles are all contentious.",
                "attributes": {"company_a_arr": 12000000, "company_b_arr": 8500000, "synergy_estimate": 4000000},
                "evidence_items": ["Combined entity would be #3 in the market by market share", "Product overlap is ~40% - consolidation risk", "Company A has 3x the engineering headcount", "Company B has 2x the enterprise sales relationships"],
                "stakes_description": "Both boards need to approve the merger. A competing offer from a private equity firm is expected within 60 days."
            },
            "stakeholders": [
                {"id": "ceo-a", "name": "James Hartley", "role": "CEO - Company A", "backstory": "Product visionary who built from 0 to 200 people. Wants to acquire for technology and talent.", "stance": "champion", "personality": {"aggressiveness": 65, "empathy": 35, "stubbornness": 75, "verbosity": 60}, "hidden_agenda": "Has a backup acquisition target if this falls through", "tools": []},
                {"id": "ceo-b", "name": "Amara Osei", "role": "CEO - Company B", "backstory": "Sales-driven leader who scaled revenue 5x in 3 years. Protective of her team's culture.", "stance": "neutral", "personality": {"aggressiveness": 50, "empathy": 60, "stubbornness": 70, "verbosity": 55}, "hidden_agenda": "Wants to ensure she retains CEO title in combined entity", "tools": []},
                {"id": "council-a", "name": "Robert Kim", "role": "Legal Counsel - Company A", "backstory": "M&A lawyer focused on liability protection and IP assignment.", "stance": "detractor", "personality": {"aggressiveness": 40, "empathy": 30, "stubbornness": 85, "verbosity": 45}, "hidden_agenda": "Concerned about Company B's IP ownership documentation gaps", "tools": []},
                {"id": "hr-lead", "name": "Maya Lopez", "role": "CHRO - Combined Entity", "backstory": "HR leader focused on retention plans, culture integration, and avoiding talent exodus.", "stance": "moderator", "personality": {"aggressiveness": 30, "empathy": 75, "stubbornness": 50, "verbosity": 50}, "hidden_agenda": "Has data showing 30% of key talent would leave without retention packages", "tools": []},
                {"id": "investor", "name": "Tom Greer", "role": "Board Member - Both Companies", "backstory": "Sits on both boards. Wants the deal done but needs to protect shareholder value.", "stance": "moderator", "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 60, "verbosity": 40}, "hidden_agenda": "Holds a swing vote on both boards - playing both sides", "tools": []},
                {"id": "cto-b", "name": "Lin Wei", "role": "CTO - Company B", "backstory": "Built the original architecture. Worried about tech debt being exposed in due diligence.", "stance": "detractor", "personality": {"aggressiveness": 35, "empathy": 55, "stubbornness": 65, "verbosity": 40}, "hidden_agenda": "Knows the core platform has scalability issues not yet disclosed", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "timeout", "max_normal_turns": 15},
            "system_prompt_template": "", "voltage": 75, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "partnership-renewal",
        "name": "Partnership Renewal",
        "description": "Enterprise agreement renegotiation between a SaaS vendor and a strategic partner. Pricing, SLAs, and exclusivity terms on the table.",
        "category": "Partnership",
        "difficulty": "medium",
        "estimated_duration": "4 min",
        "stakeholder_count": 4,
        "voltage": 50,
        "config": {
            "subject": {
                "name": "Partnership Renewal Dispute",
                "description": "A 3-year strategic partnership between a data platform (DataFlow) and an enterprise AI company (CortexAI) is up for renewal. CortexAI wants better pricing and exclusivity guarantees. DataFlow wants higher commit and access to CortexAI's customer list.",
                "attributes": {"contract_value": 2400000, "years": 3, "renewal_month": "June"},
                "evidence_items": ["CortexAI generated $2.4M in revenue for DataFlow over 3 years", "DataFlow's platform now has 3 alternative partners in the same space", "CortexAI has 12 joint customers with DataFlow", "Market growth in this segment is 28% YoY"],
                "stakes_description": "This renewal sets the commercial template for both companies' partnership strategies for the next 3 years."
            },
            "stakeholders": [
                {"id": "vp-dataflow", "name": "Nathan Cross", "role": "VP Partnerships - DataFlow", "backstory": "Wants to upsell CortexAI to a higher tier. Using alternative partners as leverage.", "stance": "champion", "personality": {"aggressiveness": 55, "empathy": 40, "stubbornness": 65, "verbosity": 55}, "hidden_agenda": "Has a competing partner ready to sign if renewal fails", "tools": []},
                {"id": "vp-cortex", "name": "Priya Mehta", "role": "VP Strategic Alliances - CortexAI", "backstory": "Needs better pricing to maintain margins on joint deals. Pushing for 3-year exclusivity.", "stance": "champion", "personality": {"aggressiveness": 50, "empathy": 55, "stubbornness": 60, "verbosity": 50}, "hidden_agenda": "Has internal pressure to reduce partnership costs by 20%", "tools": []},
                {"id": "legal-cortex", "name": "Derek Shaw", "role": "General Counsel - CortexAI", "backstory": "Risk-averse legal lead. Worried about data-sharing clauses and indemnification terms.", "stance": "detractor", "personality": {"aggressiveness": 30, "empathy": 40, "stubbornness": 80, "verbosity": 45}, "hidden_agenda": "Has found a data privacy risk in DataFlow's SOC2 report", "tools": []},
                {"id": "finance-df", "name": "Angela Cruz", "role": "VP Finance - DataFlow", "backstory": "Needs to hit revenue targets. Will compromise on pricing for volume commitments.", "stance": "neutral", "personality": {"aggressiveness": 45, "empathy": 50, "stubbornness": 55, "verbosity": 40}, "hidden_agenda": "Has a revenue gap for Q3 that this deal must fill", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 50, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable"
        }
    },
    {
        "slug": "go-to-market-pivot",
        "name": "Go-to-Market Pivot",
        "description": "Leadership debates whether to shift from product-led growth to enterprise sales. Team is deeply split on strategy.",
        "category": "Strategy",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 4,
        "voltage": 68,
        "config": {
            "subject": {
                "name": "GTM Strategy Pivot",
                "description": "After 3 years of PLG, growth has plateaued at $5M ARR. The board is pushing for an enterprise sales motion. The founding team is split - some see enterprise as the only path to $20M, others fear it destroys the product culture.",
                "attributes": {"current_arr": 5000000, "growth_rate": 15, "target_arr": 20000000},
                "evidence_items": ["PLG conversion rate dropped from 4.2% to 2.8% over 6 quarters", "Enterprise pilot with 2 Fortune 500 companies showed 3x ACV potential", "Average enterprise sales cycle is 9 months - 3x longer than PLG", "Team has no enterprise sales experience - would need to hire a VP Sales"],
                "stakes_description": "The next board meeting will decide the company's strategic direction for the next 18 months. A wrong bet could mean losing the company."
            },
            "stakeholders": [
                {"id": "ceo", "name": "Alex Rivera", "role": "CEO", "backstory": "Wants to pursue enterprise but worried about losing the PLG motion that made the company successful.", "stance": "neutral", "personality": {"aggressiveness": 50, "empathy": 55, "stubbornness": 50, "verbosity": 60}, "hidden_agenda": "Under pressure from the board to show a path to $20M ARR", "tools": []},
                {"id": "head-product", "name": "Jordan Blake", "role": "VP Product", "backstory": "Built the PLG motion. Believes enterprise will ruin the product experience and slow innovation.", "stance": "detractor", "personality": {"aggressiveness": 45, "empathy": 65, "stubbornness": 70, "verbosity": 55}, "hidden_agenda": "Has already started building an enterprise feature set without telling anyone", "tools": []},
                {"id": "head-growth", "name": "Sam Witt", "role": "VP Growth", "backstory": "PLG is stagnating. Sees enterprise as the only viable path to the next stage.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 65, "verbosity": 50}, "hidden_agenda": "Has a verbal offer from a top enterprise SaaS company and is using it as leverage", "tools": []},
                {"id": "board-rep", "name": "Dr. Karen Liu", "role": "Board Member", "backstory": "Former CEO of a $100M SaaS company. Has seen this play out before. Wants a hybrid model.", "stance": "moderator", "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 60, "verbosity": 45}, "hidden_agenda": "Is evaluating the CEO's performance and this decision is part of the assessment", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 68, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "pricing-package-dispute",
        "name": "Pricing & Packaging Dispute",
        "description": "Product, Sales, and Marketing clash over a major pricing overhaul. Revenue at risk.",
        "category": "Revenue",
        "difficulty": "easy",
        "estimated_duration": "3 min",
        "stakeholder_count": 3,
        "voltage": 55,
        "config": {
            "subject": {
                "name": "Pricing Restructure Debate",
                "description": "The company is considering a major pricing and packaging overhaul. Moving from per-seat to usage-based pricing with tiered feature gates. Product, Sales, and Marketing all have strongly opposing views on the right approach.",
                "attributes": {"current_acv": 12000, "projected_acv": 18000, "customer_count": 450},
                "evidence_items": ["Churn is highest among customers with >50 seats - they outgrow the per-seat model", "Competitors using usage-based pricing command 2x ACV", "Usage data shows 40% of seats are rarely active", "A/B test showed 22% higher conversion with simplified tiers"],
                "stakes_description": "The pricing committee meets in 2 weeks. A wrong decision could trigger mass churn or leave millions on the table."
            },
            "stakeholders": [
                {"id": "vp-product", "name": "Mia Chen", "role": "VP Product", "backstory": "Wants usage-based pricing with generous free tier. Believes it drives adoption and reduces churn.", "stance": "champion", "personality": {"aggressiveness": 45, "empathy": 60, "stubbornness": 55, "verbosity": 55}, "hidden_agenda": "Has already started building usage metering infrastructure", "tools": []},
                {"id": "vp-sales", "name": "Carlos Vega", "role": "VP Sales", "backstory": "Wants to keep per-seat pricing with higher enterprise tiers. Predictable revenue is non-negotiable for his team.", "stance": "detractor", "personality": {"aggressiveness": 60, "empathy": 35, "stubbornness": 75, "verbosity": 50}, "hidden_agenda": "His comp plan is built on per-seat quotas - change would disrupt his team", "tools": []},
                {"id": "cmo", "name": "Tessa Wright", "role": "CMO", "backstory": "Wants simplified packaging to improve marketing messaging. Current 4-tier system is confusing prospects.", "stance": "moderator", "personality": {"aggressiveness": 40, "empathy": 55, "stubbornness": 45, "verbosity": 45}, "hidden_agenda": "Has a brand awareness campaign launching that needs clear messaging", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 8},
            "system_prompt_template": "", "voltage": 55, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable"
        }
    },
    {
        "slug": "crisis-simulation",
        "name": "Crisis Simulation",
        "description": "High-pressure incident response: PR disaster, data breach, product failure, or regulatory action. Tests response coordination under fire.",
        "category": "Crisis",
        "difficulty": "hard",
        "estimated_duration": "6 min",
        "stakeholder_count": 4,
        "voltage": 90,
        "config": {
            "subject": {
                "name": "Crisis Response Simulation",
                "description": "A major incident has just become public. Internal teams are scrambling. Media is calling. Regulatory bodies have been notified. The leadership team must align on response strategy, public statement, and remediation timeline within the hour.",
                "attributes": {"severity": "critical", "media_attention": "high", "regulatory_risk": "high"},
                "evidence_items": ["Initial reports indicate a data breach affecting 50K users", "A journalist has already published preliminary details", "Stock dropped 8% in after-hours trading", "Two board members are demanding immediate answers"],
                "stakes_description": "Every word said in this room may surface in litigation. The wrong response could trigger regulatory fines, lawsuits, or executive turnover."
            },
            "stakeholders": [
                {"id": "crisis-ceo", "name": "Thomas Adeyemi", "role": "CEO", "backstory": "Damage containment, employee confidence, regulatory response.", "stance": "champion", "personality": {"aggressiveness": 65, "empathy": 45, "stubbornness": 60, "verbosity": 55}, "hidden_agenda": "Board has called an emergency session; buyout rumors are circulating", "tools": []},
                {"id": "pr-lead", "name": "Camille Dubois", "role": "Head of Communications", "backstory": "Message control, media relations, public statement timing.", "stance": "moderator", "personality": {"aggressiveness": 40, "empathy": 55, "stubbornness": 50, "verbosity": 60}, "hidden_agenda": "Has a journalist contact who already knows part of the story", "tools": []},
                {"id": "legal-crisis", "name": "Nadia Kowalski", "role": "General Counsel", "backstory": "Liability exposure, disclosure obligations, regulatory notifications.", "stance": "detractor", "personality": {"aggressiveness": 35, "empathy": 35, "stubbornness": 85, "verbosity": 45}, "hidden_agenda": "Previous incident was settled quietly; second incident triggers mandatory disclosure", "tools": []},
                {"id": "affected-customer", "name": "Chris Harrington", "role": "Customer Advocate", "backstory": "Remediation timeline, compensation, trust restoration.", "stance": "detractor", "personality": {"aggressiveness": 70, "empathy": 60, "stubbornness": 75, "verbosity": 50}, "hidden_agenda": "Coordinating with a consumer advocacy group considering a class action", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "timeout", "max_normal_turns": 12},
            "system_prompt_template": "", "voltage": 90, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "investor-meeting",
        "name": "Investor Meeting",
        "description": "Founder pitching to a VC partnership. VC team probes unit economics, market size, team, and competitive moat.",
        "category": "Fundraising",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 4,
        "voltage": 60,
        "config": {
            "subject": {
                "name": "Series A Pitch Meeting",
                "description": "A Series A pitch meeting. The founder is presenting to the full partnership. The GP is broadly positive but the associate is tasked with finding deal-breakers.",
                "attributes": {"ask_amount": 5000000, "pre_money": 25000000, "revenue_arr": 1200000},
                "evidence_items": ["Revenue grew 220% YoY to $1.2M ARR", "Net dollar retention is 128%", "Gross margin is 72%", "Three competitors have raised in the last 6 months"],
                "stakes_description": "This is the founder's third and final pitch meeting this quarter. The partnership vote happens tomorrow."
            },
            "stakeholders": [
                {"id": "founder", "name": "Alex Rivera", "role": "Founder & CEO", "backstory": "Second-time founder with a $3M exit previously. Confident but anxious about the macro environment.", "stance": "champion", "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 60, "verbosity": 65}, "hidden_agenda": "Has a lower term sheet from a different firm but this is the preferred partner", "tools": []},
                {"id": "gp", "name": "Elena Voss", "role": "General Partner", "backstory": "Has a thesis on this space. Supports the investment but needs to convince the partnership.", "stance": "moderator", "personality": {"aggressiveness": 50, "empathy": 55, "stubbornness": 65, "verbosity": 50}, "hidden_agenda": "Already passed on one competing deal; needs to show conviction to LP base", "tools": []},
                {"id": "associate", "name": "James Okonkwo", "role": "Associate", "backstory": "Tasked with due diligence. Looking for reasons to say no to justify his analysis.", "stance": "detractor", "personality": {"aggressiveness": 45, "empathy": 35, "stubbornness": 70, "verbosity": 45}, "hidden_agenda": "Trying to surface a deal-killer before the GP commits", "tools": []},
                {"id": "analyst", "name": "Sora Tanaka", "role": "Market Analyst", "backstory": "Published a bearish note on this sector. Has data to back up skepticism.", "stance": "detractor", "personality": {"aggressiveness": 35, "empathy": 40, "stubbornness": 75, "verbosity": 40}, "hidden_agenda": "Published a bearish note on this sector last quarter and stands by it", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 60, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable"
        }
    },
    {
        "slug": "product-launch-decision",
        "name": "Product Launch Decision",
        "description": "Executive team debates whether to launch a major new product on schedule despite quality concerns.",
        "category": "Product",
        "difficulty": "medium",
        "estimated_duration": "4 min",
        "stakeholder_count": 4,
        "voltage": 58,
        "config": {
            "subject": {
                "name": "Product Launch Go/No-Go Decision",
                "description": "The executive team must decide whether to launch a major product update next quarter. Engineering wants more time to fix known issues. Marketing has already booked the campaign. Sales needs the new features to close deals.",
                "attributes": {"delay_cost": 500000, "bug_count": 47, "blocker_count": 3},
                "evidence_items": ["47 known bugs, 3 classified as blockers", "Marketing campaign worth $500K is already booked", "Two enterprise deals worth $1.2M are contingent on new features", "Competitor is launching a similar feature next quarter"],
                "stakes_description": "Delay means losing booked revenue and market positioning. Launching with bugs means risking enterprise reputation."
            },
            "stakeholders": [
                {"id": "vp-eng", "name": "Maya Chen", "role": "VP Engineering", "backstory": "Prides herself on quality. Pushing for a 6-week delay to fix critical issues.", "stance": "detractor", "personality": {"aggressiveness": 40, "empathy": 45, "stubbornness": 80, "verbosity": 45}, "hidden_agenda": "Her team is burned out from the crunch and she's worried about retention", "tools": []},
                {"id": "vp-product", "name": "Tom Suzuki", "role": "VP Product", "backstory": "Has been managing the roadmap for this launch for 8 months. Wants to ship with known issues and patch later.", "stance": "champion", "personality": {"aggressiveness": 55, "empathy": 50, "stubbornness": 60, "verbosity": 55}, "hidden_agenda": "His promotion to CPO is contingent on a successful launch", "tools": []},
                {"id": "vp-sales", "name": "Diana Cruz", "role": "VP Sales", "backstory": "Has two enterprise deals in final stage that require the new features.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 65, "verbosity": 50}, "hidden_agenda": "Her Q1 quota depends entirely on these two deals closing", "tools": []},
                {"id": "ceo", "name": "Marcus Webb", "role": "CEO", "backstory": "Has to make the final call. Balancing short-term revenue against long-term brand damage.", "stance": "neutral", "personality": {"aggressiveness": 50, "empathy": 55, "stubbornness": 55, "verbosity": 50}, "hidden_agenda": "Board has set an aggressive revenue target that requires shipping this quarter", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 58, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "boardroom-shakeup",
        "name": "Boardroom Shakeup",
        "description": "Activist investor pushes for leadership change and strategic pivot. Board must decide the CEO's fate.",
        "category": "Governance",
        "difficulty": "hard",
        "estimated_duration": "6 min",
        "stakeholder_count": 5,
        "voltage": 85,
        "config": {
            "subject": {
                "name": "Boardroom Leadership Crisis",
                "description": "An activist investor has acquired 12% of the company and is demanding the CEO's resignation, citing 4 quarters of missed guidance. The board is split between supporting the CEO who built the company and heeding the investor's demands.",
                "attributes": {"activist_stake": 12, "missed_quarters": 4, "stock_decline": 35},
                "evidence_items": ["Stock down 35% over 12 months", "Revenue guidance missed for 4 consecutive quarters", "Activist investor has board representation on 3 other companies", "Two key executives have left in the last 6 months"],
                "stakes_description": "The board's decision will determine the company's trajectory for the next 3-5 years. A wrong call could trigger a proxy fight or mass executive exodus."
            },
            "stakeholders": [
                {"id": "ceo-incumbent", "name": "Rafael Santos", "role": "CEO", "backstory": "Founded the company 12 years ago. Has taken it from garage to $200M revenue. Protective of his legacy.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 45, "stubbornness": 85, "verbosity": 60}, "hidden_agenda": "Has been quietly searching for a COO to address operational gaps", "tools": []},
                {"id": "activist", "name": "Morgan Blake", "role": "Activist Investor", "backstory": "Has a track record of forcing leadership changes. Believes the current CEO has lost touch with the market.", "stance": "detractor", "personality": {"aggressiveness": 80, "empathy": 25, "stubbornness": 90, "verbosity": 65}, "hidden_agenda": "Has a replacement CEO candidate ready to install", "tools": []},
                {"id": "board-chair", "name": "Dr. Karen Liu", "role": "Board Chair", "backstory": "Longtime board member. Wants to avoid a proxy fight but recognizes performance issues.", "stance": "neutral", "personality": {"aggressiveness": 50, "empathy": 60, "stubbornness": 65, "verbosity": 50}, "hidden_agenda": "Concerned that removing the CEO would trigger a talent exodus", "tools": []},
                {"id": "lead-director", "name": "Tom Greer", "role": "Lead Independent Director", "backstory": "Recently joined the board. Has no loyalty to the current CEO. Analyzing data dispassionately.", "stance": "neutral", "personality": {"aggressiveness": 45, "empathy": 50, "stubbornness": 60, "verbosity": 40}, "hidden_agenda": "Has been approached by the activist privately and is weighing options", "tools": []},
                {"id": "cfo", "name": "Bernard Osei", "role": "CFO", "backstory": "Has been with the company for 5 years. Caught between supporting the CEO and being honest about the numbers.", "stance": "detractor", "personality": {"aggressiveness": 40, "empathy": 50, "stubbornness": 70, "verbosity": 45}, "hidden_agenda": "Quietly exploring a down-round; needs this situation to stabilize", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "vote", "voters": ["board-chair", "lead-director", "activist", "cfo"], "threshold": 0.5, "max_turns": 15},
            "system_prompt_template": "", "voltage": 85, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
    # ── Fun / Creative Templates ──
    {
        "slug": "hot-topic-podcast",
        "name": "Hot Topic Podcast",
        "description": "Recorded podcast episode where a host and two guests with opposing views debate a controversial tech/business topic.",
        "category": "Media",
        "difficulty": "easy",
        "estimated_duration": "4 min",
        "stakeholder_count": 3,
        "voltage": 55,
        "config": {
            "subject": {
                "name": "Podcast: The AI Debate",
                "description": "A popular tech podcast episode recorded live. The topic: 'Should we slow down AI development?' The host is known for pushing guests to take strong positions. One guest is an AI safety researcher, the other is a startup founder building AI products.",
                "attributes": {"listeners": 500000, "duration_minutes": 45, "season": 4},
                "evidence_items": ["Global AI funding reached $50B last year", "Three major AI safety papers published this month", "Public sentiment on AI is 52% concerned, 48% excited", "Regulation proposals pending in 12 countries"],
                "stakes_description": "This episode will be clipped and shared across social media. Both guests risk being taken out of context. The host wants a viral moment."
            },
            "stakeholders": [
                {"id": "host", "name": "Morgan Blake", "role": "Podcast Host", "backstory": "Known for provocative interviews. Audience engagement is the primary metric. Wants a viral clip.", "stance": "moderator", "personality": {"aggressiveness": 65, "empathy": 40, "stubbornness": 50, "verbosity": 70}, "hidden_agenda": "Wants a viral clip; will push until someone says something controversial", "tools": []},
                {"id": "safety-researcher", "name": "Dr. Yuki Nakamura", "role": "AI Safety Researcher", "backstory": "Published influential papers on AI alignment. Believes current development pace is reckless.", "stance": "detractor", "personality": {"aggressiveness": 45, "empathy": 60, "stubbornness": 80, "verbosity": 55}, "hidden_agenda": "Promoting a forthcoming paper that warns about exactly this topic", "tools": []},
                {"id": "founder", "name": "Samuel Obi", "role": "AI Startup Founder", "backstory": "Building the next generation of AI tools. Believes slowing down would cede leadership to less responsible players.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 45, "stubbornness": 65, "verbosity": 60}, "hidden_agenda": "Company is in stealth fundraise; needs positive press without triggering SEC quiet period", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 55, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": False, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "cofounder-breakup",
        "name": "Co-founder Breakup",
        "description": "Two co-founders can't agree on the company direction. A mediator tries to find common ground before the board gets involved.",
        "category": "Startup",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 3,
        "voltage": 72,
        "config": {
            "subject": {
                "name": "Co-founder Split Negotiation",
                "description": "After 4 years building a $8M ARR company together, the two co-founders have reached an impasse. One wants to raise VC and scale aggressively. The other wants to stay bootstrapped and profitable. They've brought in a trusted advisor to mediate before the situation escalates to the board.",
                "attributes": {"arr": 8000000, "years_together": 4, "employees": 35},
                "evidence_items": ["Company is profitable with 82% gross margins", "Growth has slowed from 15% to 5% month-over-month", "A VC has offered $12M term sheet", "Both founders hold 40% equity each"],
                "stakes_description": "If they can't agree, the board will force a resolution. One founder may walk away entirely, potentially destroying the company."
            },
            "stakeholders": [
                {"id": "ceo-founder", "name": "Jenna Walsh", "role": "CEO & Co-founder", "backstory": "Built the product and led it to market. Believes VC money is the only path to the next level. Frustrated with co-founder's risk aversion.", "stance": "champion", "personality": {"aggressiveness": 65, "empathy": 40, "stubbornness": 70, "verbosity": 60}, "hidden_agenda": "Has already had preliminary conversations with VCs behind co-founder's back", "tools": []},
                {"id": "cto-founder", "name": "Aaron Park", "role": "CTO & Co-founder", "backstory": "Architected the platform. Values independence and work-life balance. Sees VC money as a trap that will destroy the company culture.", "stance": "detractor", "personality": {"aggressiveness": 40, "empathy": 60, "stubbornness": 80, "verbosity": 45}, "hidden_agenda": "Has a buyout offer from a larger competitor and is seriously considering it", "tools": []},
                {"id": "mediator", "name": "Dr. Karen Liu", "role": "Board Advisor / Mediator", "backstory": "Seasoned entrepreneur who has seen this play out before. Her goal is to find a resolution that doesn't destroy the company.", "stance": "neutral", "personality": {"aggressiveness": 45, "empathy": 65, "stubbornness": 55, "verbosity": 50}, "hidden_agenda": "The board has authorized her to restructure the company if founders can't agree", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 72, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "celebrity-endorsement",
        "name": "Celebrity Endorsement Deal",
        "description": "A celebrity's agent negotiates a brand endorsement deal. The brand wants exclusivity. The celebrity wants creative freedom and maximum payout.",
        "category": "Entertainment",
        "difficulty": "easy",
        "estimated_duration": "4 min",
        "stakeholder_count": 4,
        "voltage": 45,
        "config": {
            "subject": {
                "name": "Celebrity Brand Deal Negotiation",
                "description": "A major sportswear brand wants to sign a rising athlete to a multi-year endorsement deal. The athlete's agent is known for tough negotiations. The brand's marketing team wants exclusivity. The athlete wants to keep options open.",
                "attributes": {"deal_value": 8000000, "years": 4, "athlete_age": 22},
                "evidence_items": ["Athlete has 3.2M social media followers", "Brand's revenue grew 18% last quarter", "Comparable athlete endorsements average $6M over 3 years", "Two competing brands have expressed interest"],
                "stakes_description": "This deal sets the market benchmark for the athlete's category. The brand needs a signature face for their new campaign launching next quarter."
            },
            "stakeholders": [
                {"id": "agent", "name": "Marcus Webb", "role": "Celebrity Agent", "backstory": "Top agent known for maximizing client value. Has multiple offers and is playing brands against each other.", "stance": "detractor", "personality": {"aggressiveness": 70, "empathy": 35, "stubbornness": 75, "verbosity": 60}, "hidden_agenda": "Has a competing offer 15% higher from a rival brand", "tools": []},
                {"id": "athlete", "name": "Sasha Williams", "role": "Professional Athlete", "backstory": "Rising star in their sport. Wants the money but also wants creative freedom to build their personal brand.", "stance": "neutral", "personality": {"aggressiveness": 40, "empathy": 55, "stubbornness": 50, "verbosity": 40}, "hidden_agenda": "Planning to launch their own clothing line in 2 years - wants to avoid exclusivity clauses", "tools": []},
                {"id": "brand-vp", "name": "Tessa Wright", "role": "VP Brand Marketing", "backstory": "Needs a signature athlete for the biggest campaign of the year. Budget is approved but she needs exclusivity to justify the spend.", "stance": "champion", "personality": {"aggressiveness": 50, "empathy": 50, "stubbornness": 60, "verbosity": 50}, "hidden_agenda": "Campaign shoot is already scheduled - needs the deal closed in 2 weeks", "tools": []},
                {"id": "brand-legal", "name": "Derek Shaw", "role": "Brand Legal Counsel", "backstory": "Risk-averse. Focused on morality clauses, termination rights, and intellectual property ownership.", "stance": "detractor", "personality": {"aggressiveness": 30, "empathy": 35, "stubbornness": 85, "verbosity": 45}, "hidden_agenda": "Has concerns about a potential controversy from the athlete's social media history", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "alternating"},
            "end_condition": {"type": "timeout", "max_normal_turns": 10},
            "system_prompt_template": "", "voltage": 45, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": False},
            "model_temperature": "stable"
        }
    },
    {
        "slug": "historical-treaty",
        "name": "Historical Treaty Negotiation",
        "description": "Two fictional kingdoms negotiate a peace treaty after a decade of war. Territory, reparations, and prisoner exchanges on the table.",
        "category": "Historical",
        "difficulty": "hard",
        "estimated_duration": "6 min",
        "stakeholder_count": 4,
        "voltage": 82,
        "config": {
            "subject": {
                "name": "Treaty of the Crimson River",
                "description": "After 11 years of war between the Kingdom of Aeldor and the Republic of Valdris, both sides have finally agreed to peace talks. The war has cost 200,000 lives and drained both treasuries. The negotiations will decide borders, war reparations, prisoner exchanges, and a framework for lasting peace.",
                "attributes": {"war_duration_years": 11, "estimated_deaths": 200000, "soldiers_at_table": 0},
                "evidence_items": ["Both armies are exhausted and low on supplies", "The treasury of Aeldor is nearly empty", "Valdris has a secret alliance with a neighboring kingdom", "A plague is spreading through both countries' camps"],
                "stakes_description": "If these talks fail, the war continues and both kingdoms face collapse. If they succeed, a generation of peace begins."
            },
            "stakeholders": [
                {"id": "king-aeldor", "name": "King Theron", "role": "King of Aeldor", "backstory": "Has led his kingdom through the war. Proud and unwilling to appear weak, but knows his kingdom can't continue fighting.", "stance": "champion", "personality": {"aggressiveness": 60, "empathy": 40, "stubbornness": 80, "verbosity": 55}, "hidden_agenda": "Secretly knows his treasury will be empty in 3 months", "tools": []},
                {"id": "consul-valdris", "name": "Consul Valerius", "role": "Consul of Valdris", "backstory": "Elected on a peace platform. Needs a tangible victory to show voters, but also needs to end the war.", "stance": "champion", "personality": {"aggressiveness": 50, "empathy": 55, "stubbornness": 65, "verbosity": 60}, "hidden_agenda": "Facing a no-confidence vote if he returns without territorial gains", "tools": []},
                {"id": "general-aeldor", "name": "General Ironwood", "role": "Military Commander of Aeldor", "backstory": "Has fought for 11 years. Lost his son in the war. Wants peace but refuses to accept terms that dishonor the fallen.", "stance": "detractor", "personality": {"aggressiveness": 55, "empathy": 45, "stubbornness": 85, "verbosity": 45}, "hidden_agenda": "Has a contingency plan to continue the war with or without the king's approval", "tools": []},
                {"id": "diplomat", "name": "Ambassador Elara", "role": "Neutral Mediator", "backstory": "A seasoned diplomat from a neutral nation. Has brokered three peace treaties in the last decade. Calm, patient, and observant.", "stance": "moderator", "personality": {"aggressiveness": 30, "empathy": 70, "stubbornness": 50, "verbosity": 50}, "hidden_agenda": "Her country's trade routes depend on a stable peace; she has back-channel agreements with both sides", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "vote", "voters": ["king-aeldor", "consul-valdris", "general-aeldor"], "threshold": 2, "max_turns": 15},
            "system_prompt_template": "", "voltage": 82, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": False, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
    {
        "slug": "alien-first-contact",
        "name": "First Contact Protocol",
        "description": "Humanity's first contact with an alien civilization. World leaders debate how to respond: welcome, warn, or wait?",
        "category": "Sci-Fi",
        "difficulty": "hard",
        "estimated_duration": "5 min",
        "stakeholder_count": 4,
        "voltage": 88,
        "config": {
            "subject": {
                "name": "First Contact Response Protocol",
                "description": "An unidentified signal has been confirmed as extraterrestrial in origin. A structured transmission has been decoded. World leaders are in an emergency session to determine humanity's response. The signal originated from a star system 40 light-years away.",
                "attributes": {"distance_ly": 40, "signal_strength": "strong", "message_type": "structured"},
                "evidence_items": ["Signal confirmed by three independent observatories", "Message contains structured mathematical patterns", "Analysis suggests technology at least 200 years beyond ours", "Public knowledge of the signal will leak within 48 hours"],
                "stakes_description": "Humanity's response will define our relationship with an alien civilization for generations. Respond too warmly and we appear weak. Respond too coldly and we miss a historic opportunity."
            },
            "stakeholders": [
                {"id": "president", "name": "President Elena Vasquez", "role": "World Coalition President", "backstory": "Elected on a platform of unity. Believes in peaceful outreach but must balance global security concerns.", "stance": "champion", "personality": {"aggressiveness": 50, "empathy": 60, "stubbornness": 55, "verbosity": 60}, "hidden_agenda": "Her approval ratings are at an all-time low - a historic first contact would cement her legacy", "tools": []},
                {"id": "general", "name": "General James Hartley", "role": "Joint Chiefs Chair", "backstory": "Military leader responsible for planetary defense. Sees any unknown as a potential threat. Advocates for caution and preparation.", "stance": "detractor", "personality": {"aggressiveness": 65, "empathy": 30, "stubbornness": 80, "verbosity": 50}, "hidden_agenda": "Has already briefed a rapid-response military protocol without civilian approval", "tools": []},
                {"id": "scientist", "name": "Dr. Amara Osei", "role": "Chief Science Advisor", "backstory": "Leading astrobiologist who has studied this possibility for decades. Sees this as the greatest scientific opportunity in human history.", "stance": "champion", "personality": {"aggressiveness": 40, "empathy": 55, "stubbornness": 60, "verbosity": 55}, "hidden_agenda": "Has been in secret communication with the signal source for 72 hours", "tools": []},
                {"id": "ambassador", "name": "Ambassador Lin Wei", "role": "UN Diplomatic Corps", "backstory": "Veteran diplomat who has negotiated with hostile regimes. Believes in measured, strategic engagement.", "stance": "moderator", "personality": {"aggressiveness": 40, "empathy": 55, "stubbornness": 60, "verbosity": 50}, "hidden_agenda": "Has been approached by a foreign power seeking to control the response narrative", "tools": []}
            ],
            "action_space": {"actions": [], "default_trust_deltas": {}, "default_leverage_deltas": {}},
            "speaker_rules": {"mode": "moderator_led"},
            "end_condition": {"type": "vote", "voters": ["president", "general", "scientist", "ambassador"], "threshold": 3, "max_turns": 12},
            "system_prompt_template": "", "voltage": 88, "player_mode": False,
            "env_flags": {"hidden_motives": True, "time_pressure": True, "external_leaks": True, "deadlock_risk": True},
            "model_temperature": "volatile"
        }
    },
]


async def main():
    await initialize_database()
    db = get_database()
    pool = db._pool_or_raise()

    # Clear existing templates
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM templates WHERE slug IN (" + ",".join(f"'{t['slug']}'" for t in TEMPLATES) + ")")

    for t in TEMPLATES:
        config_json = json.dumps(t["config"])
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO templates (slug, name, description, category, difficulty, estimated_duration, 
                                       stakeholder_count, voltage, config, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    category = EXCLUDED.category,
                    difficulty = EXCLUDED.difficulty,
                    estimated_duration = EXCLUDED.estimated_duration,
                    stakeholder_count = EXCLUDED.stakeholder_count,
                    voltage = EXCLUDED.voltage,
                    config = EXCLUDED.config,
                    updated_at = now()
            """, t["slug"], t["name"], t["description"], t["category"], t["difficulty"],
               t["estimated_duration"], t["stakeholder_count"], t["voltage"], config_json)
        print(f"  ✓ {t['slug']} ({t['category']})")

    # Verify
    async with pool.acquire() as conn:
        row = await conn.fetchval("SELECT COUNT(*) FROM templates")
        print(f"\nTotal templates: {row}")

    await close_database()

if __name__ == "__main__":
    asyncio.run(main())
