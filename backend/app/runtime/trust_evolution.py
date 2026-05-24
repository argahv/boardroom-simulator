class TrustEvolution:
    def __init__(self, relationship_graph=None):
        self._graph = relationship_graph

    def evaluate(self, agent_id: str) -> float:
        if self._graph is None:
            return 0.5
        return self._graph.trust_score(agent_id)

    def trending(self, agent_id: str) -> str:
        score = self.evaluate(agent_id)
        if score > 0.7: return "improving"
        if score < 0.3: return "declining"
        return "stable"

def make_trust_evolution(graph=None):
    return TrustEvolution(graph)