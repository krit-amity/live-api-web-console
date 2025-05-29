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
import { getPrimer, primer } from "./primer";
import { sessionConfigData as initialSessionConfigData, clientData as initialClientData } from "./sessionConfigData";
import React from "react";

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
  const [primerText, setPrimerText] = useState<string>(primer);
  const [sessionConfigText, setSessionConfigText] = useState<string>(JSON.stringify(initialSessionConfigData, null, 2));
  const [clientDataText, setClientDataText] = useState<string>(initialClientData);
  const { client, setConfig, setModel } = useLiveAPIContext();
  const [updateFeedback, setUpdateFeedback] = useState<string>("");

  useEffect(() => {
    setModel("models/gemini-2.5-flash-preview-native-audio-dialog");
    let configObj;
    try {
      configObj = JSON.parse(sessionConfigText);
    } catch {
      configObj = initialSessionConfigData;
    }
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: getPrimer(primerText, configObj, clientDataText),
          },
        ],
      },
      tools: [
        // { googleSearch: {} },
        { functionDeclarations: [calculatorDeclaration, callSummary] },
      ],
    });
  }, [setConfig, setModel, primerText, sessionConfigText, clientDataText]);

  // Handler for Primer submit
  const handlePrimerSubmit = () => {
    let configObj;
    try {
      configObj = JSON.parse(sessionConfigText);
    } catch {
      alert("Invalid JSON in sessionConfigData");
      return;
    }
    setConfig({
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } },
      },
      systemInstruction: {
        parts: [
          {
            text: getPrimer(primerText, configObj, clientDataText),
          },
        ],
      },
      tools: [
        { googleSearch: {} },
        { functionDeclarations: [calculatorDeclaration, callSummary] },
      ],
    });
    setUpdateFeedback("Primer updated!");
    setTimeout(() => setUpdateFeedback(""), 2000);
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

  // Helper to highlight only the replaced {VARS} in blue
  function highlightPrimerVars(text: string) {
    return text.replace(/({AGENT_NAME}|{AGENT_ID}|{CLIENT_ID}|{DATE}|{SERVICE})/g, '<span style="color:#2563eb;font-weight:bold">$1</span>');
  }

  return (
    <div className="w-full h-full flex flex-row gap-4">
      <div className="flex flex-col flex-1 h-full">
        <div className="flex flex-row items-center justify-between mb-2">
          <label htmlFor="primer-textarea" className="block font-bold">Primer (System Prompt):</label>
          <div className="flex flex-col items-end">
            <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded ml-2" onClick={handlePrimerSubmit}>Update Primer</button>
            {updateFeedback && <span className="text-green-600 text-xs mt-1">{updateFeedback}</span>}
          </div>
        </div>
        <textarea
          id="primer-textarea"
          className="w-full flex-1 min-h-0 p-2 border rounded mb-2 font-mono resize-none"
          value={primerText}
          onChange={e => setPrimerText(e.target.value)}
        />
        <div className="w-full bg-gray-50 border rounded p-2 font-mono text-sm overflow-auto" style={{minHeight: 80, maxHeight: 200}}>
          <div dangerouslySetInnerHTML={{ __html: highlightPrimerVars(primerText) }} />
        </div>
      </div>
      <div className="flex flex-col flex-1 h-full gap-4">
        <div className="flex-1 flex flex-col">
          <label htmlFor="session-config-textarea" className="block font-bold mb-2">sessionConfigData (JSON):</label>
          <textarea
            id="session-config-textarea"
            className="w-full flex-1 min-h-0 p-2 border rounded mb-2 font-mono resize-none"
            value={sessionConfigText}
            onChange={e => setSessionConfigText(e.target.value)}
          />
        </div>
        <div className="flex-1 flex flex-col">
          <label htmlFor="client-data-textarea" className="block font-bold mb-2">clientData (raw):</label>
          <textarea
            id="client-data-textarea"
            className="w-full flex-1 min-h-0 p-2 border rounded mb-2 font-mono resize-none"
            value={clientDataText}
            onChange={e => setClientDataText(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

export const Altair = memo(AltairComponent);
