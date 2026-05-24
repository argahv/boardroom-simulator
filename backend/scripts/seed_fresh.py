"""Fresh seed: 10 diverse templates. Clears and repopulates all data."""
import json, asyncio, sys
sys.path.insert(0, "..")

TEMPLATES = [
    # ── 1. Tech Acquisition Bidding War ──
    {
        "slug": "tech-acquisition-bidding-war",
        "name": "Tech Acquisition Bidding War",
        "description": "Two rival tech giants are bidding for the same AI startup. The startup's founders must choose between a quick payout and their vision.",
        "category": "M&A",
        "difficulty": "hard",
        "estimated_duration": "7 min",
        "stakeholder_count": 5, "voltage": 82,
        "config": {
            "subject": {"name":"Acquisition Bidding War","description":"Two rival tech conglomerates are competing to acquire Neuralyx, a red-hot AI startup valued at $2.8B. The founders must decide: take the sure thing from MegaCorp (cash, no strings) or the strategic offer from TechGlobal (more money but they'd have to stay for 4 years). The clock is ticking — leaks to the press have tanked one deal already.","attributes":{"valuation":2800000000,"employees":120,"revenue_arr":42000000},"evidence_items":["MegaCorp offered $2.6B all-cash, no retention required","TechGlobal offered $3.1B with 4-year earn-out for founders","Startup grew 340% ARR in 18 months","Three other bidders have dropped out due to due diligence concerns"],"stakes_description":"Choose wrong and the founders lose everything they built. Choose right and they reshape the industry."},
            "stakeholders": [
                {"id":"founder-ceo","name":"Elena Vasquez","role":"CEO & Co-founder","backstory":"Built Neuralyx from her dorm room. Torn between loyalty to her team and the life-changing payout. Wants the best outcome for employees but feels responsible for the technology's future.", "stance":"neutral","personality":{"aggressiveness":45,"empathy":65,"stubbornness":55,"verbosity":60},"hidden_agenda":"Has been quietly talking to a third bidder no one knows about","tools":[]},
                {"id":"founder-cto","name":"Marcus Chen","role":"CTO & Co-founder","backstory":"The technical genius behind the core IP. Worried either acquirer will ruin the technology. Prefers TechGlobal because they promised to keep the team intact.", "stance":"champion","personality":{"aggressiveness":40,"empathy":50,"stubbornness":75,"verbosity":45},"hidden_agenda":"Has a clause in his contract that lets him block any acquisition he deems 'technically irresponsible'","tools":[]},
                {"id":"vc-board","name":"Victoria Reed","role":"VC Board Member","backstory":"Representing the Series A investors who own 40% of the company. Her fiduciary duty is to maximize return. She favors the highest bid regardless of cultural fit.", "stance":"detractor","personality":{"aggressiveness":70,"empathy":30,"stubbornness":80,"verbosity":55},"hidden_agenda":"Her fund is raising a new round and needs this exit to close it","tools":[]},
                {"id":"megacorp-cxo","name":"James Hartley","role":"MegaCorp VP Corporate Development","backstory":"Has been trying to acquire Neuralyx for 2 years. Frustrated that the founders keep stalling. Willing to overpay to deny TechGlobal.", "stance":"champion","personality":{"aggressiveness":65,"empathy":35,"stubbornness":85,"verbosity":50},"hidden_agenda":"His bonus this year depends entirely on closing this acquisition","tools":[]},
                {"id":"techglobal-cxo","name":"Amara Osei","role":"TechGlobal Head of Strategy","backstory":"Sees Neuralyx as the missing piece in their AI stack. Has board approval to go up to $3.5B but needs the founders to stay or the deal doesn't make strategic sense.", "stance":"moderator","personality":{"aggressiveness":50,"empathy":55,"stubbornness":60,"verbosity":50},"hidden_agenda":"Knows MegaCorp's offer is funded by debt that may not close — she's stalling intentionally","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"alternating"},
            "end_condition":{"type":"timeout","max_normal_turns":14},
            "system_prompt_template":"","voltage":82,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":True},
            "model_temperature":"volatile"
        }
    },
    # ── 2. Climate Accord Summit ──
    {
        "slug": "climate-accord-summit",
        "name": "Climate Accord Summit",
        "description": "UN climate summit. Industrialized nations, developing countries, and fossil fuel lobbyists clash over emission targets and reparations.",
        "category": "Diplomacy",
        "difficulty": "hard",
        "estimated_duration": "8 min",
        "stakeholder_count": 5, "voltage": 88,
        "config": {
            "subject":{"name":"Global Climate Accord Negotiations","description":"The annual UN Climate Summit has reached a critical juncture. Industrialized nations are being asked to commit to 60% emission reductions by 2035 and pay $500B annually in climate reparations. Developing nations argue this is the minimum required for survival. Fossil fuel lobbyists claim the targets are economically devastating. The conference must produce a binding resolution or face global confidence collapse.","attributes":{"emission_target":60,"reparations_billions":500,"participating_nations":195},"evidence_items":["Global temperatures have risen 1.3C above pre-industrial levels","Climate-related disasters cost $450B last year alone","Developing nations need $2T annually for green transition","Three major oil companies posted record profits this quarter"],"stakes_description":"Failure means accelerated climate catastrophe. Success requires economic sacrifice from everyone."},
            "stakeholders":[
                {"id":"eu-rep","name":"Dr. Hannah Bergstrom","role":"EU Climate Commissioner","backstory":"Leading the push for ambitious targets. Has support from most European nations but faces internal resistance from Eastern European coal-dependent states.", "stance":"champion","personality":{"aggressiveness":55,"empathy":60,"stubbornness":70,"verbosity":65},"hidden_agenda":"Her political career hinges on delivering a binding agreement — any agreement","tools":[]},
                {"id":"us-rep","name":"Ambassador Robert Kim","role":"US Climate Envoy","backstory":"Representing a divided administration. The US wants to lead but faces congressional limits on funding. Pushing for technology-based solutions over punitive measures.", "stance":"neutral","personality":{"aggressiveness":45,"empathy":50,"stubbornness":60,"verbosity":55},"hidden_agenda":"Has a secret side-deal with major oil companies that would undermine emission targets","tools":[]},
                {"id":"india-rep","name":"Minister Priya Sharma","role":"India's Environment Minister","backstory":"Represents 1.4B people, many still in poverty. Argues that industrialized nations built their wealth on fossil fuels and now want to pull up the ladder. Demands reparations and technology transfer.", "stance":"detractor","personality":{"aggressiveness":60,"empathy":65,"stubbornness":80,"verbosity":60},"hidden_agenda":"Has been offered a massive solar investment package by China in exchange for blocking the US-backed resolution","tools":[]},
                {"id":"oil-lobby","name":"Thomas Adeyemi","role":"Fossil Fuel Industry Representative","backstory":"Former oil executive now lobbying for a 'gradual transition.' His organization has spent $200M fighting climate legislation. Argues that rapid decarbonization will destroy economies.", "stance":"detractor","personality":{"aggressiveness":70,"empathy":25,"stubbornness":90,"verbosity":65},"hidden_agenda":"His organization has a shadow campaign ready to discredit any nation that signs an aggressive agreement","tools":[]},
                {"id":"island-rep","name":"Minister Sera Naivalu","role":"Pacific Island Nations Representative","backstory":"Her country is literally sinking. Speaks for nations facing extinction within decades. Demands immediate action, not promises. Has the moral high ground but limited economic leverage.", "stance":"champion","personality":{"aggressiveness":75,"empathy":70,"stubbornness":85,"verbosity":55},"hidden_agenda":"Has been offered relocation deals for her citizens by three countries — but accepting would mean admitting defeat","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"moderator_led"},
            "end_condition":{"type":"timeout","max_normal_turns":16},
            "system_prompt_template":"","voltage":88,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":True},
            "model_temperature":"volatile"
        }
    },
    # ── 3. Pharma Patent Battle ──
    {
        "slug": "pharma-patent-battle",
        "name": "Pharma Patent Battle",
        "description": "A pharmaceutical company's life-saving drug patent is challenged. Profits vs access — the board must decide.",
        "category": "Healthcare",
        "difficulty": "medium",
        "estimated_duration": "6 min",
        "stakeholder_count": 4, "voltage": 75,
        "config": {
            "subject":{"name":"Life-Saving Drug Patent Dispute","description":"A pharmaceutical company holds the patent for a breakthrough cancer drug priced at $180K per treatment. A generic manufacturer has challenged the patent. The company's board must decide: defend the patent aggressively (protecting $12B in projected revenue), negotiate a licensing deal, or voluntarily reduce the price. Patient advocacy groups are protesting. The media is watching.","attributes":{"drug_price":180000,"annual_revenue_billions":12,"patent_years_remaining":7},"evidence_items":["Drug costs $2,300 to manufacture per treatment","R&D cost was $4.7B over 12 years","78% of patients cannot afford the current price","Generic version would cost $12K per treatment"],"stakes_description":"The board's decision will be scrutinized by Congress, media, and the public. A wrong move could trigger regulation, lawsuits, or reputational collapse."},
            "stakeholders":[
                {"id":"ceo-pharma","name":"Dr. Sarah Chen","role":"Pharma CEO","backstory":"Oversaw the drug's development from lab to market. Believes the high price is justified by R&D costs and risk. Under immense pressure from shareholders to defend the patent.", "stance":"detractor","personality":{"aggressiveness":60,"empathy":40,"stubbornness":75,"verbosity":60},"hidden_agenda":"Has $50M in stock options that vest based on quarterly revenue targets","tools":[]},
                {"id":"board-member","name":"Elena Torres","role":"Independent Board Director","backstory":"Bioethicist who joined the board to bring perspective. Increasingly uncomfortable with the pricing strategy. Pushing for a tiered pricing model.", "stance":"moderator","personality":{"aggressiveness":40,"empathy":70,"stubbornness":55,"verbosity":50},"hidden_agenda":"Has been approached by a patient advocacy group considering a board-level protest","tools":[]},
                {"id":"cfo","name":"Marcus Webb","role":"CFO","backstory":"Numbers person. Sees the patent as the company's most valuable asset. Argues that reducing price would set a precedent that devalues the entire pipeline.", "stance":"detractor","personality":{"aggressiveness":50,"empathy":35,"stubbornness":70,"verbosity":45},"hidden_agenda":"Has already modeled a 'volume at lower price' scenario that shows higher long-term revenue — but hasn't shared it","tools":[]},
                {"id":"patient-advocate","name":"Reverend David Okafor","role":"Patient Advocacy Leader","backstory":"Lost his wife to cancer. Now leads a national patient advocacy organization. Has organized protests, lobbied Congress, and built a coalition of insurers demanding change.", "stance":"champion","personality":{"aggressiveness":70,"empathy":75,"stubbornness":85,"verbosity":65},"hidden_agenda":"Has a whistleblower inside the company ready to leak internal pricing documents","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"alternating"},
            "end_condition":{"type":"timeout","max_normal_turns":12},
            "system_prompt_template":"","voltage":75,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":False},
            "model_temperature":"volatile"
        }
    },
    # ── 4. Sports Franchise Sale ──
    {
        "slug": "sports-franchise-sale",
        "name": "Sports Franchise Sale",
        "description": "A legendary sports franchise is up for sale. A local billionaire and a foreign consortium battle for ownership while fans riot.",
        "category": "Sports",
        "difficulty": "medium",
        "estimated_duration": "6 min",
        "stakeholder_count": 4, "voltage": 68,
        "config": {
            "subject":{"name":"Iconic Sports Franchise Sale","description":"The Boston Wolves, a historic professional sports franchise with 12 championships, is being sold by the founding family after 80 years. Two bids are on the table: a local billionaire who grew up a fan, and a foreign investment consortium promising to build a new stadium. The league must approve any sale. The current owner wants to preserve his legacy.","attributes":{"franchise_value":4200000000,"championships":12,"years_family_owned":80},"evidence_items":["Local billionaire bid: $4.2B, no debt, promises to keep team in city","Foreign consortium bid: $4.8B, will build $1.5B new stadium","League approval required — 75% of owners must vote yes","Fan polls show 89% oppose the foreign consortium"],
            "stakes_description":"Sell to the local and preserve the legacy, but leave money on the table. Sell to the consortium and risk fan backlash but secure the franchise's financial future."},
            "stakeholders":[
                {"id":"owner","name":"Patricia Sullivan","role":"Team Owner","backstory":"80-year-old matriarch whose father founded the team. Deeply emotional about the sale. Wants to secure the team's future in the city but her children want the highest payout.", "stance":"neutral","personality":{"aggressiveness":45,"empathy":70,"stubbornness":65,"verbosity":55},"hidden_agenda":"Has a terminal diagnosis and wants the sale completed within 6 months","tools":[]},
                {"id":"local-bidder","name":"Tom Greer","role":"Local Billionaire","backstory":"Grew up in the shadow of the stadium. Made his fortune in tech. This is his dream — owning the team he's loved since childhood. Willing to overpay.", "stance":"champion","personality":{"aggressiveness":55,"empathy":60,"stubbornness":75,"verbosity":50},"hidden_agenda":"Has been secretly meeting with league officials to line up votes against the consortium","tools":[]},
                {"id":"consortium-rep","name":"Dr. Yuki Tanaka","role":"Foreign Investment Consortium Lead","backstory":"Represents a group of global investors. Sees the franchise as a trophy asset for their portfolio. Has no emotional attachment to the team or city.", "stance":"champion","personality":{"aggressiveness":65,"empathy":30,"stubbornness":70,"verbosity":50},"hidden_agenda":"The consortium's real plan is to relocate the team to London within 5 years","tools":[]},
                {"id":"league-commissioner","name":"Marcus Webb","role":"League Commissioner","backstory":"Must balance the league's financial interests with fan sentiment and legacy. Has veto power over any sale. Wants a clean process.", "stance":"moderator","personality":{"aggressiveness":50,"empathy":55,"stubbornness":60,"verbosity":55},"hidden_agenda":"Prefers the local bidder but the league's expansion plans require the consortium's global reach","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"alternating"},
            "end_condition":{"type":"timeout","max_normal_turns":12},
            "system_prompt_template":"","voltage":68,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":False},
            "model_temperature":"volatile"
        }
    },
    # ── 5. AI Ethics Board ──
    {
        "slug": "ai-ethics-board",
        "name": "AI Ethics Board Decision",
        "description": "A social media company's AI ethics board must decide whether to launch a emotionally-manipulative recommendation algorithm.",
        "category": "Technology",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 4, "voltage": 70,
        "config": {
            "subject":{"name":"AI Ethics Board: Algorithm Launch Decision","description":"A major social media company has developed a new recommendation algorithm (codenamed 'Aurora') that increases engagement by 40% by optimizing for emotional triggers — specifically anger, outrage, and anxiety. Internal testing shows it drives addiction but also increases polarization. The AI Ethics Board must decide: approve, delay for more testing, or kill the project entirely. The CEO wants to launch. The board includes the Chief Ethicist, VP Product, a external academic, and the head of Trust & Safety.","attributes":{"engagement_boost":40,"test_users":50000,"polarization_increase":15},"evidence_items":["Engagement increased 40% in internal tests","Content toxicity increased 28%","User reports of anxiety increased 15%","Competitors are releasing similar algorithms"],
            "stakes_description":"Launching could mean billions in revenue but risk regulation and public backlash. Killing it could mean losing market share to competitors."},
            "stakeholders":[
                {"id":"chief-ethicist","name":"Dr. Amara Osei","role":"Chief Ethicist","backstory":"Ph.D. in ethics and AI. Hired to provide independent ethical guidance. Has been increasingly alarmed by the company's direction. Believes Aurora is dangerous.", "stance":"detractor","personality":{"aggressiveness":45,"empathy":65,"stubbornness":80,"verbosity":60},"hidden_agenda":"Has a draft resignation letter ready and is prepared to go public if the board approves","tools":[]},
                {"id":"vp-product","name":"Jordan Blake","role":"VP Product","backstory":"Designed Aurora. Her team has spent 18 months building it. Under enormous pressure from the CEO to deliver growth. Believes the risks can be mitigated.", "stance":"champion","personality":{"aggressiveness":60,"empathy":45,"stubbornness":70,"verbosity":55},"hidden_agenda":"Her promotion to CPO depends on Aurora's success — and she's already told the CEO it will launch","tools":[]},
                {"id":"academic","name":"Professor Lin Wei","role":"External Ethics Advisor","backstory":"Leading researcher in algorithmic harm. Brought in as an independent voice. Has published papers on exactly this type of algorithmic manipulation.", "stance":"detractor","personality":{"aggressiveness":35,"empathy":55,"stubbornness":75,"verbosity":50},"hidden_agenda":"Has been contacted by a journalist investigating the company's practices","tools":[]},
                {"id":"trust-safety","name":"Diana Park","role":"Head of Trust & Safety","backstory":"Has seen the worst of what the platform enables. Wants to protect users but also understands the business pressures. Torn between two worlds.", "stance":"neutral","personality":{"aggressiveness":40,"empathy":60,"stubbornness":55,"verbosity":50},"hidden_agenda":"Her team is already overwhelmed moderating existing content — Aurora would make it impossible","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"moderator_led"},
            "end_condition":{"type":"vote","voters":["chief-ethicist","vp-product","academic","trust-safety"],"threshold":3,"max_turns":12},
            "system_prompt_template":"","voltage":70,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":False},
            "model_temperature":"volatile"
        }
    },
    # ── 6. Celebrity Divorce Mediation ──
    {
        "slug": "celebrity-divorce-mediation",
        "name": "High-Profile Divorce Mediation",
        "description": "A power couple's divorce mediation. Billions, custody, and public image are on the line. Lawyers and mediators fight it out.",
        "category": "Legal",
        "difficulty": "medium",
        "estimated_duration": "6 min",
        "stakeholder_count": 4, "voltage": 78,
        "config": {
            "subject":{"name":"High-Net-Worth Divorce Mediation","description":"A billionaire tech founder and a world-famous actress are divorcing after 8 years. The prenup is being contested. Custody of two children, ownership of the $50M family home, and 12% of the company stock are all in dispute. Both parties want to avoid a public trial, but neither wants to compromise. The mediator has one session to find common ground.","attributes":{"net_worth_billions":4.2,"marriage_years":8,"children":2,"company_stake":12},"evidence_items":["Pre-marital agreement signed, but may be invalid under current law","Wife claims she contributed to company's brand value significantly","Husband's company is preparing for IPO — stock cannot be easily divided","Custody evaluator has submitted a report favoring shared custody"],"stakes_description":"If mediation fails, a public trial will expose every secret. Both parties have reputations worth billions."},
            "stakeholders":[
                {"id":"husband","name":"Alex Rivera","role":"Tech Founder","backstory":"Built a $4.2B company. Wants to protect his stake and keep the prenup intact. Emotionally distant but fiercely protective of his children.", "stance":"detractor","personality":{"aggressiveness":55,"empathy":35,"stubbornness":80,"verbosity":50},"hidden_agenda":"Has been transferring assets to a shell company for the past 6 months","tools":[]},
                {"id":"wife","name":"Sasha Williams","role":"Actress","backstory":"Internationally famous actress who stepped back from her career for the family. Believes she's entitled to half of everything built during the marriage.", "stance":"champion","personality":{"aggressiveness":60,"empathy":55,"stubbornness":75,"verbosity":60},"hidden_agenda":"Has a tell-all book deal waiting to be signed if the case goes to trial","tools":[]},
                {"id":"mediator","name":"Judge Patricia Sullivan","role":"Mediator","backstory":"Retired family court judge. Has seen hundreds of high-net-worth divorces. Trying to find a settlement that avoids a public trial.", "stance":"moderator","personality":{"aggressiveness":45,"empathy":65,"stubbornness":60,"verbosity":55},"hidden_agenda":"Has been personally approached by the husband's lawyers to favor the prenup — ethically troubled by this","tools":[]},
                {"id":"wife-attorney","name":"Elena Torres","role":"Wife's Attorney","backstory":"Pit bull lawyer who specializes in high-profile divorces. Known for destroying reputations in court. Prefers trial because it means more billable hours.", "stance":"champion","personality":{"aggressiveness":75,"empathy":25,"stubbornness":85,"verbosity":65},"hidden_agenda":"Her firm stands to make $5M+ if this goes to trial rather than settling","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"moderator_led"},
            "end_condition":{"type":"timeout","max_normal_turns":12},
            "system_prompt_template":"","voltage":78,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":True},
            "model_temperature":"volatile"
        }
    },
    # ── 7. Film Studio Profit Participation ──
    {
        "slug": "film-studio-deal",
        "name": "Film Studio Profit Battle",
        "description": "A star actor vs a film studio over backend profit participation. The movie was a hit, but the studio says it lost money. Hollywood accounting exposed.",
        "category": "Entertainment",
        "difficulty": "easy",
        "estimated_duration": "5 min",
        "stakeholder_count": 3, "voltage": 55,
        "config": {
            "subject":{"name":"Hollywood Profit Participation Dispute","description":"A blockbuster movie grossed $1.2B worldwide. The star actor's contract entitles them to 5% of 'net profits.' The studio claims the movie 'lost' $50M due to Hollywood accounting — marketing costs, distribution fees, and overhead. The actor is demanding an audit and threatening to go public. The studio wants to settle quietly.","attributes":{"box_office_billions":1.2,"profit_share_pct":5,"reported_loss_millions":50},"evidence_items":["Movie grossed $1.2B worldwide","Studio claims $50M loss after 'accounting adjustments'","Actor's share would be $60M if calculated on gross","Three previous actors have sued this studio for the same practice"],"stakes_description":"If the actor goes public, it exposes Hollywood accounting to the world. If the studio caves, it sets a precedent for every future deal."},
            "stakeholders":[
                {"id":"actor","name":"Samuel Obi","role":"A-List Actor","backstory":"Star of the franchise. Knows the studio is cheating him. Has the public on his side but is bound by a ironclad contract. Considering leaking the story.", "stance":"champion","personality":{"aggressiveness":60,"empathy":50,"stubbornness":70,"verbosity":55},"hidden_agenda":"Has already given an interview to Variety that will publish if he doesn't settle in 48 hours","tools":[]},
                {"id":"studio-head","name":"Victoria Reed","role":"Studio CEO","backstory":"Built the studio into a powerhouse. Hollywood accounting is standard practice. Defending it fiercely because conceding would cost billions across the entire catalog.", "stance":"detractor","personality":{"aggressiveness":65,"empathy":30,"stubbornness":85,"verbosity":55},"hidden_agenda":"Her bonus is tied to studio profitability — settling would reduce it by 40%","tools":[]},
                {"id":"agent","name":"Marcus Webb","role":"Actor's Agent","backstory":"Top Hollywood agent. Has been fighting the studio for 8 months. Wants to settle but also wants to protect his client's interests and his reputation.", "stance":"neutral","personality":{"aggressiveness":55,"empathy":55,"stubbornness":65,"verbosity":60},"hidden_agenda":"Has another client who is about to sign a deal with this studio — he can't afford to burn the relationship","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"alternating"},
            "end_condition":{"type":"timeout","max_normal_turns":8},
            "system_prompt_template":"","voltage":55,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":False},
            "model_temperature":"stable"
        }
    },
    # ── 8. University Tenure Controversy ──
    {
        "slug": "university-tenure-battle",
        "name": "University Tenure Battle",
        "description": "A brilliant but controversial professor is up for tenure. The academic committee is split between protecting academic freedom and safeguarding reputation.",
        "category": "Education",
        "difficulty": "medium",
        "estimated_duration": "5 min",
        "stakeholder_count": 4, "voltage": 62,
        "config": {
            "subject":{"name":"Controversial Tenure Decision","description":"Professor Yuki Nakamura is up for tenure at a prestigious university. Her research on racial genetics is groundbreaking but politically explosive. Student groups are protesting. Major donors are threatening to withdraw. The tenure committee must decide: approve based on academic merit (protecting academic freedom) or deny to protect the university's reputation and funding.","attributes":{"tenure_years":6,"publications":47,"donors_threatening":12},"evidence_items":["Professor has 47 peer-reviewed publications in top journals","Three student groups have called for her dismissal","12 major donors have threatened to withdraw funding","Her research has been cited by hate groups, which she has publicly denounced"],"stakes_description":"Approve tenure and risk donor revolt and reputation damage. Deny tenure and set a precedent that political pressure can override academic merit."},
            "stakeholders":[
                {"id":"professor","name":"Dr. Yuki Nakamura","role":"Professor (Tenure Candidate)","backstory":"Brilliant geneticist whose research keeps getting misrepresented. She believes strongly in academic freedom. Has job offers from three other universities.", "stance":"champion","personality":{"aggressiveness":45,"empathy":50,"stubbornness":80,"verbosity":55},"hidden_agenda":"Has already accepted a position at a competing university but hasn't announced it yet","tools":[]},
                {"id":"dean","name":"Dean Robert Kim","role":"Dean of Faculty","backstory":"Wants to approve tenure based on merit but is under pressure from the provost and donors. Trying to find a compromise.", "stance":"neutral","personality":{"aggressiveness":40,"empathy":55,"stubbornness":60,"verbosity":50},"hidden_agenda":"Is up for a promotion to Provost and cannot afford a scandal","tools":[]},
                {"id":"donor-rep","name":"Elena Voss","role":"Major Donor Representative","backstory":"Represents a group of alumni who have donated $50M+ to the university. Threatening to redirect funds if tenure is approved.", "stance":"detractor","personality":{"aggressiveness":65,"empathy":30,"stubbornness":75,"verbosity":55},"hidden_agenda":"Has already redirected $10M to a rival university as leverage","tools":[]},
                {"id":"student-rep","name":"Jordan Blake","role":"Student Government President","backstory":"Represents the student body. Views are split — some support the professor's right to research, others find her work harmful. Trying to represent all voices.", "stance":"moderator","personality":{"aggressiveness":45,"empathy":65,"stubbornness":50,"verbosity":60},"hidden_agenda":"Is running for national office and this issue could define their campaign","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"moderator_led"},
            "end_condition":{"type":"vote","voters":["dean","donor-rep","student-rep"],"threshold":2,"max_turns":10},
            "system_prompt_template":"","voltage":62,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":False,"external_leaks":True,"deadlock_risk":False},
            "model_temperature":"volatile"
        }
    },
    # ── 9. Space Mission Partnership ──
    {
        "slug": "space-mission-partnership",
        "name": "Moon Mission Partnership",
        "description": "NASA and a private space company negotiate a historic lunar mission. Science vs profit, safety vs speed, government vs private.",
        "category": "Space",
        "difficulty": "hard",
        "estimated_duration": "7 min",
        "stakeholder_count": 4, "voltage": 58,
        "config": {
            "subject":{"name":"NASA-Private Sector Lunar Mission","description":"NASA has selected a private space company to partner on the first crewed lunar mission in 50 years. The contract is worth $4.5B. The private company wants maximum flexibility and IP rights. NASA wants safety guarantees and scientific control. Both sides have hard deadlines — the launch window opens in 18 months.","attributes":{"contract_value_billions":4.5,"launch_window_months":18,"previous_missions":0},"evidence_items":["NASA's budget requires this to be a fixed-price contract","Private company has never done a crewed mission","China is planning a lunar landing in 24 months","Public opinion strongly supports the partnership"],"stakes_description":"Failure means the US loses the new space race. Success means a new era of public-private space exploration."},
            "stakeholders":[
                {"id":"nasa-admin","name":"Dr. Amara Osei","role":"NASA Administrator","backstory":"Former astronaut turned administrator. Wants to return to the moon but is constrained by government regulations, safety requirements, and a fixed budget.", "stance":"neutral","personality":{"aggressiveness":50,"empathy":55,"stubbornness":65,"verbosity":55},"hidden_agenda":"Has a backup plan to work with a different private company if this deal falls through","tools":[]},
                {"id":"ceo-private","name":"James Hartley","role":"Private Space Company CEO","backstory":"Visionary entrepreneur who wants to establish a permanent presence on the moon. Sees NASA as a customer, not a partner. Wants maximum IP and operational freedom.", "stance":"champion","personality":{"aggressiveness":65,"empathy":35,"stubbornness":85,"verbosity":60},"hidden_agenda":"His company's valuation depends on closing this deal — without it, the next funding round fails","tools":[]},
                {"id":"chief-scientist","name":"Professor Lin Wei","role":"NASA Chief Scientist","backstory":"Leading scientist who has waited her entire career for this mission. Worried that the private company will prioritize profit over scientific discovery.", "stance":"detractor","personality":{"aggressiveness":40,"empathy":50,"stubbornness":70,"verbosity":55},"hidden_agenda":"Has already planned experiments that exceed the agreed payload capacity","tools":[]},
                {"id":"safety-officer","name":"General Thomas Adeyemi","role":"Independent Safety Review Board","backstory":"Retired Air Force general who lost friends in the Challenger disaster. His motto: 'Safety is not negotiable.' Has the power to delay any mission.", "stance":"detractor","personality":{"aggressiveness":55,"empathy":45,"stubbornness":90,"verbosity":50},"hidden_agenda":"Found a critical safety issue in the private company's life support system that hasn't been disclosed","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"alternating"},
            "end_condition":{"type":"timeout","max_normal_turns":14},
            "system_prompt_template":"","voltage":58,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":False,"deadlock_risk":True},
            "model_temperature":"volatile"
        }
    },
    # ── 10. Diplomatic Nuclear Deal ──
    {
        "slug": "nuclear-deal-negotiation",
        "name": "Nuclear Deal Negotiation",
        "description": "Adversarial nations negotiate a nuclear disarmament treaty. Trust is zero. The stakes are existential.",
        "category": "Diplomacy",
        "difficulty": "hard",
        "estimated_duration": "8 min",
        "stakeholder_count": 5, "voltage": 92,
        "config": {
            "subject":{"name":"Nuclear Disarmament Treaty Talks","description":"Two adversarial nations are meeting for high-stakes nuclear disarmament talks. Nation Alpha has 800 warheads. Nation Beta has 450. A neutral mediator is facilitating. A military advisor from Alpha is deeply suspicious. A scientist from Beta believes this is humanity's last chance. The talks are happening in a neutral country, and both sides have threatened to walk away if their conditions aren't met.","attributes":{"alpha_warheads":800,"beta_warheads":450,"previous_treaties_failed":3},"evidence_items":["Alpha tested a new ICBM last month","Beta has been enriching uranium beyond agreed limits","Public opinion in both countries favors disarmament 2:1","A rogue military faction in Alpha has threatened a coup if the treaty is signed"],"stakes_description":"If these talks fail, a new arms race accelerates. If they succeed, it's the most significant disarmament in 50 years."},
            "stakeholders":[
                {"id":"diplomat-alpha","name":"Ambassador Robert Kim","role":"Alpha's Chief Negotiator","backstory":"Career diplomat. Knows his country's red lines. Under pressure from hardliners back home to make no concessions. Personally believes disarmament is necessary.", "stance":"neutral","personality":{"aggressiveness":45,"empathy":50,"stubbornness":65,"verbosity":60},"hidden_agenda":"His daughter lives in Beta's country — a fact that would end his career if revealed","tools":[]},
                {"id":"diplomat-beta","name":"Minister Priya Sharma","role":"Beta's Foreign Minister","backstory":"Hawkish politician who has built her career on a tough stance against Alpha. Publicly supports disarmament but privately benefits from the tension.", "stance":"detractor","personality":{"aggressiveness":60,"empathy":40,"stubbornness":75,"verbosity":65},"hidden_agenda":"Her country's defense contractors are major political donors — disarmament would hurt their business","tools":[]},
                {"id":"mediator","name":"Secretary-General Elena Vasquez","role":"UN Secretary-General","backstory":"Former president of a neutral nation. Has dedicated her post to nuclear disarmament. This is the culmination of her career. Failure is not an option.", "stance":"champion","personality":{"aggressiveness":55,"empathy":65,"stubbornness":70,"verbosity":55},"hidden_agenda":"Has a draft treaty ready that both sides already agreed to in back-channel talks — but neither knows the other agreed","tools":[]},
                {"id":"military-alpha","name":"General Thomas Adeyemi","role":"Alpha's Military Advisor","backstory":"Hardliner who believes the only way to keep peace is through strength. Deeply distrusts Beta. Has advised against any concessions.", "stance":"detractor","personality":{"aggressiveness":70,"empathy":25,"stubbornness":90,"verbosity":50},"hidden_agenda":"Has been in contact with rogue military elements planning a coup if the treaty proceeds","tools":[]},
                {"id":"scientist-beta","name":"Dr. Yuki Nakamura","role":"Beta's Chief Scientific Advisor","backstory":"Nobel laureate who has studied the effects of nuclear winter. Believes any reduction in warheads saves millions of lives. Willing to reveal state secrets if needed.", "stance":"champion","personality":{"aggressiveness":50,"empathy":70,"stubbornness":80,"verbosity":55},"hidden_agenda":"Has evidence that Beta's official warhead count is understated by 200 — if revealed, it would end the talks","tools":[]}
            ],
            "action_space":{"actions":[],"default_trust_deltas":{},"default_leverage_deltas":{}},
            "speaker_rules":{"mode":"moderator_led"},
            "end_condition":{"type":"vote","voters":["diplomat-alpha","diplomat-beta","military-alpha"],"threshold":2,"max_turns":16},
            "system_prompt_template":"","voltage":92,"player_mode":False,
            "env_flags":{"hidden_motives":True,"time_pressure":True,"external_leaks":True,"deadlock_risk":True},
            "model_temperature":"volatile"
        }
    },
]


async def main():
    from app.database import initialize_database, close_database, get_database
    await initialize_database()
    db = get_database()
    pool = db._pool_or_raise()

    for t in TEMPLATES:
        config_json = json.dumps(t["config"])
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO templates (slug, name, description, category, difficulty, estimated_duration,
                                       stakeholder_count, voltage, config, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now(), now())
                ON CONFLICT (slug) DO UPDATE SET config = EXCLUDED.config
            """, t["slug"], t["name"], t["description"], t["category"], t["difficulty"],
               t["estimated_duration"], t["stakeholder_count"], t["voltage"], config_json)
        print(f"  ✔ {t['slug']} ({t['category']})")

    # Seed personas from all template stakeholders
    async with pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT DISTINCT jsonb_array_elements(config->'stakeholders')->>'name' AS name,
                            jsonb_array_elements(config->'stakeholders')->>'role' AS role
            FROM templates
        """)
        names = set()
        for r in rows:
            name = r["name"]
            role = r.get("role", "")
            if name and name not in names:
                names.add(name)
                slug = name.lower().replace("'", "").replace(".", "").replace(" ", "-")
                await conn.execute("""
                    INSERT INTO personas (slug, name, role, created_at, updated_at)
                    VALUES ($1, $2, $3, now(), now())
                    ON CONFLICT (slug) DO NOTHING
                """, slug, name, role)

    # Verify
    async with pool.acquire() as conn:
        t_cnt = await conn.fetchval("SELECT COUNT(*) FROM templates")
        p_cnt = await conn.fetchval("SELECT COUNT(*) FROM personas")
        print(f"\n✔ {t_cnt} templates, {p_cnt} personas seeded")

    await close_database()

if __name__ == "__main__":
    asyncio.run(main())
