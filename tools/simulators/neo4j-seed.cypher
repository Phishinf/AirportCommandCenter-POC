// ─── Nexus Aviation Suite — Neo4j Airport Topology Seed ──────────────────────
// Seeds a 2-terminal airport graph for POC purposes.
// Run: cypher-shell -u neo4j -p nexus_graph -f neo4j-seed.cypher

// Clean up existing data
MATCH (n) DETACH DELETE n;

// ─── Terminal 1 ────────────────────────────────────────────────────────────────

CREATE (:Terminal {id: "T1", name: "Terminal 1"});

// Check-in
CREATE (:Zone {id: "T1_CHECKIN_A", name: "Check-in Zone A", type: "CHECK_IN",
  terminalId: "T1", capacityMax: 200, x: 100, y: 300});
CREATE (:Zone {id: "T1_CHECKIN_B", name: "Check-in Zone B", type: "CHECK_IN",
  terminalId: "T1", capacityMax: 180, x: 100, y: 450});

// Security
CREATE (:Zone {id: "T1_SECURITY_LANE_1", name: "Security Lane 1", type: "SECURITY_LANE",
  terminalId: "T1", capacityMax: 60, x: 250, y: 280});
CREATE (:Zone {id: "T1_SECURITY_LANE_2", name: "Security Lane 2", type: "SECURITY_LANE",
  terminalId: "T1", capacityMax: 60, x: 250, y: 360});
CREATE (:Zone {id: "T1_SECURITY_LANE_3", name: "Security Lane 3", type: "SECURITY_LANE",
  terminalId: "T1", capacityMax: 60, x: 250, y: 440});

// Immigration
CREATE (:Zone {id: "T1_IMMIGRATION", name: "Immigration T1", type: "IMMIGRATION",
  terminalId: "T1", capacityMax: 80, x: 400, y: 360});

// Retail
CREATE (:Zone {id: "T1_RETAIL_PLAZA", name: "Retail Plaza T1", type: "RETAIL",
  terminalId: "T1", capacityMax: 300, x: 520, y: 360});

// Gates - Pier A
CREATE (:Zone {id: "T1_GATE_A05", name: "Gate A05", type: "BOARDING_GATE",
  terminalId: "T1", capacityMax: 80, x: 660, y: 200});
CREATE (:Zone {id: "T1_GATE_A08", name: "Gate A08", type: "BOARDING_GATE",
  terminalId: "T1", capacityMax: 80, x: 660, y: 280});
CREATE (:Zone {id: "T1_GATE_A12", name: "Gate A12", type: "BOARDING_GATE",
  terminalId: "T1", capacityMax: 100, x: 660, y: 360});

// Gates - Pier B
CREATE (:Zone {id: "T1_GATE_B03", name: "Gate B03", type: "BOARDING_GATE",
  terminalId: "T1", capacityMax: 80, x: 660, y: 440});
CREATE (:Zone {id: "T1_GATE_B08", name: "Gate B08", type: "BOARDING_GATE",
  terminalId: "T1", capacityMax: 120, x: 660, y: 520});

// Corridors
CREATE (:Zone {id: "T1_CORRIDOR_POST_SECURITY", name: "Post-Security Corridor T1",
  type: "CORRIDOR", terminalId: "T1", capacityMax: 150, x: 380, y: 280});
CREATE (:Zone {id: "T1_CORRIDOR_PIER_A", name: "Pier A Corridor", type: "CORRIDOR",
  terminalId: "T1", capacityMax: 100, x: 580, y: 280});
CREATE (:Zone {id: "T1_CORRIDOR_PIER_B", name: "Pier B Corridor", type: "CORRIDOR",
  terminalId: "T1", capacityMax: 100, x: 580, y: 480});

// Baggage
CREATE (:Zone {id: "T1_BAGGAGE_A", name: "Baggage Reclaim A", type: "BAGGAGE_RECLAIM",
  terminalId: "T1", capacityMax: 100, x: 150, y: 560});

// Landside
CREATE (:Zone {id: "T1_LANDSIDE", name: "T1 Landside Arrivals", type: "LANDSIDE",
  terminalId: "T1", capacityMax: 400, x: 50, y: 560});

// ─── Terminal 2 ────────────────────────────────────────────────────────────────

CREATE (:Terminal {id: "T2", name: "Terminal 2"});

CREATE (:Zone {id: "T2_CHECKIN_B", name: "Check-in Zone B", type: "CHECK_IN",
  terminalId: "T2", capacityMax: 160, x: 100, y: 900});
CREATE (:Zone {id: "T2_SECURITY_LANE_1", name: "Security Lane 1", type: "SECURITY_LANE",
  terminalId: "T2", capacityMax: 60, x: 250, y: 860});
CREATE (:Zone {id: "T2_SECURITY_LANE_2", name: "Security Lane 2", type: "SECURITY_LANE",
  terminalId: "T2", capacityMax: 60, x: 250, y: 940});
CREATE (:Zone {id: "T2_IMMIGRATION", name: "Immigration T2", type: "IMMIGRATION",
  terminalId: "T2", capacityMax: 80, x: 400, y: 900});
CREATE (:Zone {id: "T2_RETAIL", name: "Retail T2", type: "RETAIL",
  terminalId: "T2", capacityMax: 200, x: 520, y: 900});
CREATE (:Zone {id: "T2_GATE_C07", name: "Gate C07", type: "BOARDING_GATE",
  terminalId: "T2", capacityMax: 80, x: 660, y: 840});
CREATE (:Zone {id: "T2_GATE_D11", name: "Gate D11", type: "BOARDING_GATE",
  terminalId: "T2", capacityMax: 100, x: 660, y: 960});
CREATE (:Zone {id: "T2_CORRIDOR_POST_SECURITY", name: "Post-Security T2",
  type: "CORRIDOR", terminalId: "T2", capacityMax: 120, x: 380, y: 900});

// ─── Terminal Relationships ────────────────────────────────────────────────────

MATCH (z:Zone), (t:Terminal) WHERE z.terminalId = t.id
CREATE (z)-[:IN_TERMINAL]->(t);

// ─── Zone Connections — Terminal 1 ────────────────────────────────────────────

MATCH (a:Zone {id: "T1_CHECKIN_A"}), (b:Zone {id: "T1_SECURITY_LANE_1"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 180, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CHECKIN_A"}), (b:Zone {id: "T1_SECURITY_LANE_2"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 140, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CHECKIN_B"}), (b:Zone {id: "T1_SECURITY_LANE_2"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 140, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CHECKIN_B"}), (b:Zone {id: "T1_SECURITY_LANE_3"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 180, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_SECURITY_LANE_1"}), (b:Zone {id: "T1_CORRIDOR_POST_SECURITY"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 60, distanceMetres: 80, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_SECURITY_LANE_2"}), (b:Zone {id: "T1_CORRIDOR_POST_SECURITY"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 60, distanceMetres: 80, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_SECURITY_LANE_3"}), (b:Zone {id: "T1_CORRIDOR_POST_SECURITY"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 60, distanceMetres: 80, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_POST_SECURITY"}), (b:Zone {id: "T1_IMMIGRATION"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 120, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_IMMIGRATION"}), (b:Zone {id: "T1_RETAIL_PLAZA"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 160, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_RETAIL_PLAZA"}), (b:Zone {id: "T1_CORRIDOR_PIER_A"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 100, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_RETAIL_PLAZA"}), (b:Zone {id: "T1_CORRIDOR_PIER_B"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 140, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_PIER_A"}), (b:Zone {id: "T1_GATE_A05"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 180, distanceMetres: 250, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_PIER_A"}), (b:Zone {id: "T1_GATE_A08"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 180, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_PIER_A"}), (b:Zone {id: "T1_GATE_A12"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 120, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_PIER_B"}), (b:Zone {id: "T1_GATE_B03"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 160, isActive: true}]->(b);

MATCH (a:Zone {id: "T1_CORRIDOR_PIER_B"}), (b:Zone {id: "T1_GATE_B08"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 180, distanceMetres: 240, isActive: true}]->(b);

// ─── Zone Connections — Terminal 2 ────────────────────────────────────────────

MATCH (a:Zone {id: "T2_CHECKIN_B"}), (b:Zone {id: "T2_SECURITY_LANE_1"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 140, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_CHECKIN_B"}), (b:Zone {id: "T2_SECURITY_LANE_2"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 180, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_SECURITY_LANE_1"}), (b:Zone {id: "T2_CORRIDOR_POST_SECURITY"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 60, distanceMetres: 80, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_SECURITY_LANE_2"}), (b:Zone {id: "T2_CORRIDOR_POST_SECURITY"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 60, distanceMetres: 80, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_CORRIDOR_POST_SECURITY"}), (b:Zone {id: "T2_IMMIGRATION"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 120, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_IMMIGRATION"}), (b:Zone {id: "T2_RETAIL"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 90, distanceMetres: 120, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_RETAIL"}), (b:Zone {id: "T2_GATE_C07"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 120, distanceMetres: 160, isActive: true}]->(b);

MATCH (a:Zone {id: "T2_RETAIL"}), (b:Zone {id: "T2_GATE_D11"})
CREATE (a)-[:CONNECTS_TO {walkTimeSeconds: 150, distanceMetres: 200, isActive: true}]->(b);

// ─── Verify ───────────────────────────────────────────────────────────────────

MATCH (z:Zone) RETURN count(z) AS totalZones;
MATCH ()-[r:CONNECTS_TO]->() RETURN count(r) AS totalEdges;
