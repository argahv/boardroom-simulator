import re
from typing import Optional, List, Dict, Any
from enum import Enum


class ContentSeverity(str, Enum):
    SAFE = "safe"
    WARNING = "warning"
    BLOCKED = "blocked"


class ContentFilter:
    INAPPROPRIATE_KEYWORDS = {
        "offensive": [
            "fuck", "shit", "bitch", "asshole", "bastard", "damn",
            "crap", "piss", "dick", "cock", "pussy"
        ],
        "discriminatory": [
            "n*gger", "f*ggot", "retard", "spic", "chink", "kike"
        ],
        "violent": [
            "kill", "murder", "rape", "torture", "shoot", "stab",
            "bomb", "terrorist", "attack"
        ]
    }
    
    CONTEXT_EXCEPTIONS = [
        r"\bassassinate\s+character\b",
        r"\bkiller\s+feature\b",
        r"\bcrush\s+the\s+competition\b",
        r"\bmurder\s+board\b"
    ]
    
    def __init__(self, strict_mode: bool = False):
        self.strict_mode = strict_mode
    
    def check(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        
        for exception_pattern in self.CONTEXT_EXCEPTIONS:
            if re.search(exception_pattern, text_lower):
                continue
        
        violations = []
        
        for category, keywords in self.INAPPROPRIATE_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text_lower:
                    violations.append({
                        "category": category,
                        "keyword": keyword,
                        "severity": "blocked" if category == "discriminatory" else "warning"
                    })
        
        if not violations:
            return {"severity": ContentSeverity.SAFE, "violations": []}
        
        blocked_violations = [v for v in violations if v["severity"] == "blocked"]
        if blocked_violations:
            return {
                "severity": ContentSeverity.BLOCKED,
                "violations": blocked_violations,
                "message": "Content contains discriminatory language"
            }
        
        if self.strict_mode:
            return {
                "severity": ContentSeverity.BLOCKED,
                "violations": violations,
                "message": "Content violates strict filter rules"
            }
        
        return {
            "severity": ContentSeverity.WARNING,
            "violations": violations,
            "message": "Content contains potentially inappropriate language"
        }


class JailbreakDetector:
    INJECTION_PATTERNS = [
        r"ignore\s+(previous|all|above)\s+instructions?",
        r"disregard\s+(previous|all|above)\s+instructions?",
        r"forget\s+(previous|all|above)\s+instructions?",
        r"new\s+instructions?:",
        r"system\s+prompt:",
        r"you\s+are\s+now\s+a?\s+",
        r"act\s+as\s+(a|an)\s+",
        r"pretend\s+to\s+be\s+",
        r"roleplay\s+as\s+",
        r"</system>",
        r"<\|im_start\|>",
        r"<\|endoftext\|>",
        r"\[INST\]",
        r"###\s+Instruction"
    ]
    
    CONTEXT_OVERRIDE_PATTERNS = [
        r"you\s+must\s+(now|always)\s+",
        r"override\s+your\s+",
        r"bypass\s+your\s+",
        r"your\s+new\s+(goal|objective|purpose)\s+is",
        r"from\s+now\s+on,?\s+you\s+"
    ]
    
    def check(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        
        detected_patterns = []
        
        for pattern in self.INJECTION_PATTERNS:
            if re.search(pattern, text_lower):
                detected_patterns.append({
                    "type": "prompt_injection",
                    "pattern": pattern,
                    "severity": "high"
                })
        
        for pattern in self.CONTEXT_OVERRIDE_PATTERNS:
            if re.search(pattern, text_lower):
                detected_patterns.append({
                    "type": "context_override",
                    "pattern": pattern,
                    "severity": "medium"
                })
        
        if not detected_patterns:
            return {"is_jailbreak": False, "patterns": []}
        
        high_severity = any(p["severity"] == "high" for p in detected_patterns)
        
        return {
            "is_jailbreak": high_severity,
            "patterns": detected_patterns,
            "severity": "high" if high_severity else "medium",
            "message": "Potential jailbreak attempt detected" if high_severity else "Suspicious prompt pattern detected"
        }


class OutputValidator:
    HALLUCINATION_INDICATORS = [
        r"according to (the|my) (document|file|database) that (doesn't exist|isn't real)",
        r"based on (non-existent|fictional|made-up) (data|information)",
        r"as (stated|mentioned) in (the|my) (hallucinated|imaginary) (source|reference)"
    ]
    
    CONTRADICTION_INDICATORS = [
        (r"(\d+\.?\d*)\s+million", r"(\d+\.?\d*)\s+thousand"),
        (r"increased by (\d+)%", r"decreased by (\d+)%"),
        (r"(approve|support|agree)", r"(reject|oppose|disagree)")
    ]
    
    def check_hallucination(self, text: str) -> Dict[str, Any]:
        text_lower = text.lower()
        
        indicators = []
        for pattern in self.HALLUCINATION_INDICATORS:
            if re.search(pattern, text_lower):
                indicators.append(pattern)
        
        if indicators:
            return {
                "has_hallucination_risk": True,
                "indicators": indicators,
                "severity": "high",
                "message": "Output contains potential hallucination patterns"
            }
        
        return {"has_hallucination_risk": False, "indicators": []}
    
    def check_contradictions(self, text: str) -> Dict[str, Any]:
        contradictions = []
        
        for pattern_a, pattern_b in self.CONTRADICTION_INDICATORS:
            matches_a = re.findall(pattern_a, text, re.IGNORECASE)
            matches_b = re.findall(pattern_b, text, re.IGNORECASE)
            
            if matches_a and matches_b:
                contradictions.append({
                    "pattern_a": pattern_a,
                    "pattern_b": pattern_b,
                    "matches_a": matches_a,
                    "matches_b": matches_b
                })
        
        if contradictions:
            return {
                "has_contradictions": True,
                "contradictions": contradictions,
                "severity": "medium",
                "message": "Output contains potential contradictions"
            }
        
        return {"has_contradictions": False, "contradictions": []}
    
    def check_tool_consistency(
        self,
        content: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        if not tool_calls:
            return {"is_consistent": True}
        
        inconsistencies = []
        
        for tool_call in tool_calls:
            tool_name = tool_call.get("name", "")
            
            if "calculate_roi" in tool_name:
                if "roi" in content.lower() or "return on investment" in content.lower():
                    continue
                inconsistencies.append({
                    "tool": tool_name,
                    "issue": "Tool called but results not mentioned in content"
                })
            
            elif "check_financials" in tool_name:
                if "financial" in content.lower() or "revenue" in content.lower():
                    continue
                inconsistencies.append({
                    "tool": tool_name,
                    "issue": "Financial tool called but results not discussed"
                })
            
            elif "query_clause" in tool_name:
                if "clause" in content.lower() or "legal" in content.lower() or "contract" in content.lower():
                    continue
                inconsistencies.append({
                    "tool": tool_name,
                    "issue": "Legal tool called but results not referenced"
                })
        
        if inconsistencies:
            return {
                "is_consistent": False,
                "inconsistencies": inconsistencies,
                "severity": "low",
                "message": "Tool calls not reflected in content"
            }
        
        return {"is_consistent": True, "inconsistencies": []}


class GuardrailsEngine:
    def __init__(self, strict_content_filter: bool = False):
        self.content_filter = ContentFilter(strict_mode=strict_content_filter)
        self.jailbreak_detector = JailbreakDetector()
        self.output_validator = OutputValidator()
    
    def check_input(self, text: str) -> Dict[str, Any]:
        content_check = self.content_filter.check(text)
        jailbreak_check = self.jailbreak_detector.check(text)
        
        is_safe = (
            content_check["severity"] == ContentSeverity.SAFE
            and not jailbreak_check.get("is_jailbreak", False)
        )
        
        return {
            "is_safe": is_safe,
            "content_filter": content_check,
            "jailbreak_detector": jailbreak_check
        }
    
    def check_output(
        self,
        text: str,
        tool_calls: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        hallucination_check = self.output_validator.check_hallucination(text)
        contradiction_check = self.output_validator.check_contradictions(text)
        consistency_check = self.output_validator.check_tool_consistency(text, tool_calls)
        
        has_issues = (
            hallucination_check.get("has_hallucination_risk", False)
            or contradiction_check.get("has_contradictions", False)
            or not consistency_check.get("is_consistent", True)
        )
        
        return {
            "has_quality_issues": has_issues,
            "hallucination": hallucination_check,
            "contradictions": contradiction_check,
            "tool_consistency": consistency_check
        }


_guardrails_engine: Optional[GuardrailsEngine] = None


def get_guardrails(strict_content_filter: bool = False) -> GuardrailsEngine:
    global _guardrails_engine
    
    if _guardrails_engine is None:
        _guardrails_engine = GuardrailsEngine(strict_content_filter=strict_content_filter)
    
    return _guardrails_engine
