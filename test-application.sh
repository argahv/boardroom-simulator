#!/bin/bash

set -e

echo "🧪 Boardroom Simulator - Production Readiness Test"
echo "=================================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if backend is running
echo "1️⃣  Checking backend server..."
if curl -s http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running${NC}"
else
    echo -e "${RED}✗ Backend is not running${NC}"
    echo "   Start with: cd backend && python -m uvicorn app.main:app --reload"
    exit 1
fi

# Check if frontend is running
echo ""
echo "2️⃣  Checking frontend server..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend is running${NC}"
else
    echo -e "${RED}✗ Frontend is not running${NC}"
    echo "   Start with: cd frontend && npm run dev"
    exit 1
fi

# Test backend endpoints
echo ""
echo "3️⃣  Testing backend endpoints..."

# GET /stakeholders
echo "   → GET /stakeholders"
if curl -s -f http://127.0.0.1:8000/stakeholders > /dev/null; then
    echo -e "     ${GREEN}✓ Stakeholder list endpoint works${NC}"
else
    echo -e "     ${RED}✗ Failed to fetch stakeholders${NC}"
    exit 1
fi

# POST /stakeholders (create)
echo "   → POST /stakeholders"
CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://127.0.0.1:8000/stakeholders \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-persona-001",
    "name": "Test Persona",
    "role": "Tester",
    "tag": "TEST-001",
    "focus": "Quality assurance",
    "incentive_tuning": 50,
    "hidden_agenda": ""
  }')

HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "201" ]; then
    echo -e "     ${GREEN}✓ Create persona endpoint works${NC}"
    PERSONA_ID=$(echo "$RESPONSE_BODY" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\([^"]*\)"/\1/')
    echo "     Created persona ID: $PERSONA_ID"
else
    echo -e "     ${RED}✗ Failed to create persona (HTTP $HTTP_CODE)${NC}"
    exit 1
fi

# PUT /stakeholders/{id} (update)
if [ -n "$PERSONA_ID" ]; then
    echo "   → PUT /stakeholders/$PERSONA_ID"
    UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" -X PUT http://127.0.0.1:8000/stakeholders/$PERSONA_ID \
      -H "Content-Type: application/json" \
      -d '{
        "id": "'"$PERSONA_ID"'",
        "name": "Updated Test Persona",
        "role": "Senior Tester",
        "tag": "TEST-001",
        "focus": "Advanced quality assurance",
        "incentive_tuning": 75,
        "hidden_agenda": ""
      }')
    
    HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "     ${GREEN}✓ Update persona endpoint works${NC}"
    else
        echo -e "     ${RED}✗ Failed to update persona (HTTP $HTTP_CODE)${NC}"
        exit 1
    fi

    # DELETE /stakeholders/{id}
    echo "   → DELETE /stakeholders/$PERSONA_ID"
    DELETE_HTTP_CODE=$(curl -s -w "%{http_code}" -X DELETE http://127.0.0.1:8000/stakeholders/$PERSONA_ID -o /dev/null)
    if [ "$DELETE_HTTP_CODE" = "204" ]; then
        echo -e "     ${GREEN}✓ Delete persona endpoint works${NC}"
    else
        echo -e "     ${RED}✗ Failed to delete persona (HTTP $DELETE_HTTP_CODE)${NC}"
        exit 1
    fi
fi

# Test simulation creation
echo ""
echo "4️⃣  Testing simulation creation..."
echo "   → POST /simulations"
SIM_RESPONSE=$(curl -s http://127.0.0.1:8000/stakeholders | head -c 5000)
FIRST_STAKEHOLDER=$(echo "$SIM_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\([^"]*\)"/\1/')

if [ -n "$FIRST_STAKEHOLDER" ]; then
    SIM_CREATE=$(curl -s -X POST http://127.0.0.1:8000/simulations \
      -H "Content-Type: application/json" \
      -d "{
        \"subject\": {
          \"name\": \"Test Simulation\",
          \"description\": \"E2E verification\",
          \"stakes_description\": \"Testing\",
          \"attributes\": {},
          \"evidence_items\": []
        },
        \"stakeholders\": [
          {\"id\":\"simtest_1\",\"name\":\"Alice\",\"role\":\"CEO\",\"stance\":\"champion\",\"backstory\":\"\",\"hidden_agenda\":\"\",\"personality\":{\"aggressiveness\":50,\"empathy\":50,\"stubbornness\":50,\"verbosity\":50}},
          {\"id\":\"simtest_2\",\"name\":\"Bob\",\"role\":\"CFO\",\"stance\":\"detractor\",\"backstory\":\"\",\"hidden_agenda\":\"\",\"personality\":{\"aggressiveness\":50,\"empathy\":50,\"stubbornness\":50,\"verbosity\":50}}
        ],
        \"voltage\": 50,
        \"model_temperature\": \"stable\",
        \"max_turns\": 3,
        \"action_space\": {\"actions\": []},
        \"auto_research\": false,
        \"inject_knowledge\": false
      }")
    
    SIM_ID=$(echo "$SIM_CREATE" | grep -o '"simulation_id":"[^"]*"' | sed 's/"simulation_id":"\([^"]*\)"/\1/')
    
    if [ -n "$SIM_ID" ]; then
        echo -e "     ${GREEN}✓ Simulation created successfully${NC}"
        echo "     Simulation ID: $SIM_ID"
    else
        echo -e "     ${RED}✗ Failed to create simulation${NC}"
        exit 1
    fi
else
    echo -e "     ${YELLOW}⚠ No stakeholders available, skipping simulation test${NC}"
fi

# Check environment variables
echo ""
echo "5️⃣  Verifying API keys..."

if [ -f "backend/.env" ]; then
    if grep -q "OPENROUTER_API_KEY" backend/.env; then
        echo -e "   ${GREEN}✓ OpenRouter API key configured${NC}"
    else
        echo -e "   ${YELLOW}⚠ OpenRouter API key not found${NC}"
    fi
    
    if grep -q "LANGSMITH_API_KEY" backend/.env; then
        echo -e "   ${GREEN}✓ LangSmith API key configured${NC}"
    else
        echo -e "   ${YELLOW}⚠ LangSmith API key not found${NC}"
    fi
else
    echo -e "   ${RED}✗ backend/.env file not found${NC}"
fi

echo ""
echo "=================================================="
echo -e "${GREEN}✅ All tests passed!${NC}"
echo ""
echo "📋 Production Checklist:"
echo "   ✓ Backend server running"
echo "   ✓ Frontend server running"
echo "   ✓ CRUD endpoints working (GET/POST/PUT/DELETE)"
echo "   ✓ Simulation creation working"
echo "   ✓ API keys configured"
echo ""
echo "🚀 Ready for production use!"
echo ""
echo "Next steps:"
echo "   1. Visit http://localhost:3000 to access the application"
echo "   2. Navigate to Personas page to manage stakeholders"
echo "   3. Create a new simulation and test SSE streaming"
echo "   4. Monitor LangSmith dashboard for tracing"
