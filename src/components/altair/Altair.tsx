/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useEffect, useRef, useState, memo } from "react";
import vegaEmbed from "vega-embed";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import {
  FunctionDeclaration,
  LiveServerToolCall,
  Modality,
  Type,
} from "@google/genai";

const calculatorDeclaration: FunctionDeclaration = {
  name: "calculator",
  description: "Calculator for math operations",
  parameters: {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        description: "The operation to perform (add, subtract, multiply, divide)",
      },
      num1: {
        type: Type.NUMBER,
        description: "The first number",
      },
      num2: {
        type: Type.NUMBER,
        description: "The second number",
      },
    },
    required: ["operation", "num1", "num2"],
  },
};

export const callSummary = {
  type: "function",
  name: "call_summary",
  description:
    "Call this function for log (save in the database) summary of the call",
  parameters: {
    type: "object",
    properties: {
      call_id: {
        type: "string",
        description: "The call ID for this call (Generated randomly)",
      },
      client_id: {
        type: "string",
        description: "The client ID of the user",
      },
      is_selling_success: {
        type: "boolean",
        description: "Whether the selling was successful or not",
      },
      call_date: {
        type: "string",
        description: "The date of the call format YYYY-MM-DD",
      },
      call_time: {
        type: "string",
        description: "The time of the call format HH:MM",
      },
    },
    required: ["client_id", "is_selling_success", "call_date", "call_time"],
  },
};

async function calculator(
  operation: string,
  number1: number,
  number2: number,
  call_id: string
): Promise<any> {
  let result;
  switch (operation) {
    case "add":
      result = number1 + number2;
      break;
    case "subtract":
      result = number1 - number2;
      break;
    case "multiply":
      result = number1 * number2;
      break;
    case "divide":
      if (number2 !== 0) {
        result = number1 / number2;
      } else {
        throw new Error("Division by zero is not allowed.");
      }
      break;
    default:
      throw new Error(
        "Invalid operation. Please use add, subtract, multiply, or divide."
      );
  }
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: call_id,
      output: JSON.stringify({
        operation: operation,
        number1: number1,
        number2: number2,
        result: result,
      }),
    },
  };
}

async function call_summary(
  call_id: string,
  client_id: string,
  is_selling_success: boolean,
  call_date: string,
  call_time: string,
  tool_call_id: string
): Promise<any> {
  return {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: tool_call_id,
      output: JSON.stringify({ success: true }),
    },
  };
}

function AltairComponent() {
  const [jsonString, setJSONString] = useState<string>("");
  const { client, setConfig, setModel } = useLiveAPIContext();

  useEffect(() => {
    setModel("models/gemini-2.0-flash-exp");
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: 'You are my helpful assistant. Any time I ask you for a graph call the "render_altair" function I have provided you. Dont ask for additional information just make your best judgement.',
          },
        ],
      },
      tools: [
        // there is a free-tier quota for search
        { googleSearch: {} },
        { functionDeclarations: [calculatorDeclaration, callSummary] },
      ],
    });
  }, [setConfig, setModel]);

  useEffect(() => {
    const onToolCall = async (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }
      for (const fc of toolCall.functionCalls as any[]) {
        if (fc.name === calculatorDeclaration.name) {
          const { operation, num1, num2 } = fc.args as any;
          const result = await calculator(operation, num1, num2, fc.id);
          client.sendToolResponse({ functionResponses: [{
            response: { output: { success: true, ...JSON.parse(result.item.output) } },
            id: fc.id,
            name: fc.name,
          }] });
        } else if (fc.name === callSummary.name) {
          // call_summary expects: call_id, client_id, is_selling_success, call_date, call_time
          const { call_id, client_id, is_selling_success, call_date, call_time } = fc.args as any;
          await call_summary(call_id, client_id, is_selling_success, call_date, call_time, fc.id);
          client.sendToolResponse({ functionResponses: [{
            response: { output: { success: true } },
            id: fc.id,
            name: fc.name,
          }] });
        }
      }
    };
    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (embedRef.current && jsonString) {
      console.log("jsonString", jsonString);
      vegaEmbed(embedRef.current, JSON.parse(jsonString));
    }
  }, [embedRef, jsonString]);
  return <div className="vega-embed" ref={embedRef} />;
}

export const Altair = memo(AltairComponent);
