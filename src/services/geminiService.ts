import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_airport_summary",
        description: "Get a summary of current passenger counts, wait times, and alerts across all airport zones.",
        parameters: { type: Type.OBJECT, properties: {} }
      },
      {
        name: "simulate_delay_impact",
        description: "Predict the impact of a flight delay on a specific zone's wait times.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            flightId: { type: Type.STRING, description: "The ID of the delayed flight (e.g., SQ12)" },
            delayMinutes: { type: Type.NUMBER, description: "The duration of the delay in minutes" },
            zone: { type: Type.STRING, description: "The airport zone to analyze (e.g., Security T1)" }
          },
          required: ["flightId", "delayMinutes"]
        }
      },
      {
        name: "get_zone_details",
        description: "Get detailed flow metrics for a specific airport zone.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            zone: { type: Type.STRING, description: "The name of the zone (e.g., Immigration)" }
          },
          required: ["zone"]
        }
      }
    ]
  }
];

export const nexusChat = async (message: string, context: any) => {
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `You are the Nexus AI Dispatcher Agent for an airport operations center. 
      You have access to real-time passenger flow data, queue wait times, and anomaly alerts via specialized tools.
      Your tone is professional, technical, and decisive.
      Current Context: ${JSON.stringify(context)}
      
      When an operator asks about:
      1. Current status or distribution: Use 'get_airport_summary'.
      2. Impact of delays: Use 'simulate_delay_impact'.
      3. Specific zone details: Use 'get_zone_details'.
      
      Always provide concise, data-driven, and relevant answers. If you use a tool, explain the findings clearly.`,
      tools: tools,
    },
  });

  let response = await chat.sendMessage({ message });

  // Handle function calls
  const functionCalls = response.functionCalls;
  if (functionCalls) {
    const functionResponses = [];
    for (const call of functionCalls) {
      let result;
      if (call.name === "get_airport_summary") {
        const res = await fetch("/api/state/summary");
        result = await res.json();
      } else if (call.name === "simulate_delay_impact") {
        const res = await fetch("/api/simulation/impact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(call.args)
        });
        result = await res.json();
      } else if (call.name === "get_zone_details") {
        const res = await fetch("/api/metrics");
        const allMetrics = await res.json();
        result = allMetrics.filter((m: any) => m.zone === call.args.zone).slice(0, 5);
      }

      functionResponses.push({
        name: call.name,
        response: { result },
        id: call.id
      });
    }

    // Send the tool results back to the model
    response = await chat.sendMessage({
      message: {
        role: "tool",
        parts: functionResponses.map(r => ({
          functionResponse: {
            name: r.name,
            response: r.response,
          }
        }))
      }
    } as any);
  }
  
  return response.text;
};
