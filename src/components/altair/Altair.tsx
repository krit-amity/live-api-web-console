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
import { getPrimer } from "./primer";

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

const callSummary: FunctionDeclaration = {
  name: "call_summary",
  description:
    "Call this function for log (save in the database) summary of the call",
  parameters: {
    type: Type.OBJECT,
    properties: {
      call_id: {
        type: Type.STRING,
        description: "The call ID for this call (Generated randomly)",
      },
      client_id: {
        type: Type.STRING,
        description: "The client ID of the user",
      },
      is_selling_success: {
        type: Type.BOOLEAN,
        description: "Whether the selling was successful or not",
      },
      call_date: {
        type: Type.STRING,
        description: "The date of the call format YYYY-MM-DD",
      },
      call_time: {
        type: Type.STRING,
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
  const [primerText, setPrimerText] = useState<string>(getPrimer());
  const { client, setConfig, setModel } = useLiveAPIContext();

  useEffect(() => {
    setModel("models/gemini-2.5-flash-preview-native-audio-dialog");
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: primerText,
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [calculatorDeclaration, callSummary] },
      ],
    });
  }, [setConfig, setModel]);

  // Handler for Primer submit
  const handlePrimerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: primerText,
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [calculatorDeclaration, callSummary] },
      ],
    });
  };

  useEffect(() => {
    const onsetupComplete = () => {
      client.send([{ text: "hello" }], true);
    };

    client.on("setupcomplete", onsetupComplete);
    return () => {
      client.off("setupcomplete", onsetupComplete);
    };
  }, [client]);

  useEffect(() => {
    const onToolCall = async (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) {
        return;
      }
      for (const fc of toolCall.functionCalls as any[]) {
        if (fc.name === calculatorDeclaration.name) {
          const { operation, num1, num2 } = fc.args as any;
          const result = await calculator(operation, num1, num2, fc.id);
          client.sendToolResponse({
            functionResponses: [
              {
                response: { output: { success: true, ...JSON.parse(result.item.output) } },
                id: fc.id,
                name: fc.name,
              },
            ],
          });
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
  return (
    <div className="w-full h-full flex flex-col">
      <form onSubmit={handlePrimerSubmit} className="mb-4 h-full flex flex-col flex-1">
        <label htmlFor="primer-textarea" className="block font-bold mb-2">
          Primer (System Prompt):
        </label>
        <textarea
          id="primer-textarea"
          className="w-full flex-1 min-h-0 p-2 border rounded mb-2 font-mono resize-none"
          value={primerText}
          onChange={(e) => setPrimerText(e.target.value)}
        />
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded self-end">
          Update Primer
        </button>
      </form>
      <div className="vega-embed flex-shrink-0" ref={embedRef} />
    </div>
  );
}

export const Altair = memo(AltairComponent);
