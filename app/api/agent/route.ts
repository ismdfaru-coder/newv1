// app/api/agent/route.ts
// Manus API implementation with full output parsing and file downloads

export const runtime = "nodejs";
export const maxDuration = 300;

const MANUS_API_URL = "https://api.manus.ai";
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";

// Helper to get auth headers - Manus uses "API_KEY" header
const getAuthHeaders = () => ({
  "API_KEY": MANUS_API_KEY,
  "Content-Type": "application/json",
});

// Message content types
interface OutputText {
  type: "output_text";
  text: string;
}

interface OutputFile {
  type: "output_file";
  fileUrl: string;
  fileName: string;
  mimeType: string;
}

type MessageContent = OutputText | OutputFile;

// Task message structure
interface TaskMessage {
  id: string;
  status: string;
  role: "user" | "assistant";
  type: string;
  content: MessageContent[];
}

// Task metadata
interface TaskMetadata {
  task_title?: string;
  task_url?: string;
  [key: string]: string | undefined;
}

// Full task response from GET /v1/tasks/{task_id}
interface TaskResponse {
  id: string;
  object: string;
  created_at: number;
  updated_at: number;
  status: "pending" | "running" | "completed" | "failed";
  error?: string;
  incomplete_details?: string;
  instructions?: string;
  model?: string;
  metadata?: TaskMetadata;
  output?: TaskMessage[];
  credit_usage?: number;
}

// Response from POST /v1/tasks
interface TaskCreatedResponse {
  id: string;
  metadata?: TaskMetadata;
  status?: string;
}

async function createTask(prompt: string): Promise<TaskCreatedResponse> {
  const res = await fetch(`${MANUS_API_URL}/v1/tasks`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ 
      instructions: prompt,
    }),
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create task: ${res.status} - ${errText}`);
  }
  
  return res.json();
}

async function getTaskStatus(taskId: string): Promise<TaskResponse> {
  const res = await fetch(`${MANUS_API_URL}/v1/tasks/${taskId}?convert=true`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to get task status: ${res.status} - ${errText}`);
  }
  
  return res.json();
}

// Parse task output to extract text and files
function parseTaskOutput(output: TaskMessage[]): { 
  texts: string[]; 
  files: OutputFile[];
  steps: string[];
} {
  const texts: string[] = [];
  const files: OutputFile[] = [];
  const steps: string[] = [];

  for (const message of output) {
    if (message.role === "assistant" && message.content) {
      for (const content of message.content) {
        if (content.type === "output_text" && content.text) {
          texts.push(content.text);
          // Extract step-like content from text
          const lines = content.text.split('\n').filter(l => l.trim());
          for (const line of lines) {
            if (line.length < 200) {
              steps.push(line);
            }
          }
        } else if (content.type === "output_file") {
          files.push(content as OutputFile);
        }
      }
    }
  }

  return { texts, files, steps };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query") ?? "";

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 });
  }

  if (!MANUS_API_KEY) {
    return new Response(JSON.stringify({ error: "MANUS_API_KEY environment variable is not set" }), { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      try {
        // ── 1. Create Manus task ─────────────────────────────
        send("step", { type: "info", desc: "Creating Manus AI task...", icon: "thinking" });

        const taskResponse = await createTask(query);
        
        if (!taskResponse.id) {
          throw new Error("Invalid response: missing task id");
        }

        const taskId = taskResponse.id;
        const taskUrl = taskResponse.metadata?.task_url || `https://manus.im/app/${taskId}`;

        send("step", { type: "success", desc: `Task created successfully`, icon: "check" });
        
        // Send task info
        send("session", {
          taskId: taskId,
          taskUrl: taskUrl,
          status: "pending",
        });

        send("step", { type: "info", desc: `Processing: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`, icon: "processing" });

        // ── 2. Poll for task completion with detailed updates ──────────────────────────────────────
        const maxPolls = 180; // 6 minutes max (2s intervals)
        let pollCount = 0;
        let lastStatus = "pending";
        let lastOutputLength = 0;
        let sentSteps = new Set<string>();

        // Wait a bit before first poll
        await new Promise(r => setTimeout(r, 2000));

        while (pollCount < maxPolls) {
          await new Promise(r => setTimeout(r, 2000));
          
          let currentTask: TaskResponse;
          try {
            currentTask = await getTaskStatus(taskId);
          } catch (e) {
            // Task might not be ready yet, continue polling
            pollCount++;
            if (pollCount % 10 === 0) {
              send("step", { type: "info", desc: `Waiting for Manus AI... (${pollCount * 2}s)`, icon: "waiting" });
            }
            continue;
          }

          // Send status update if changed
          if (currentTask.status !== lastStatus) {
            const statusMessages: Record<string, { desc: string; icon: string }> = {
              "pending": { desc: "Task queued, waiting to start...", icon: "waiting" },
              "running": { desc: "Manus AI is working on your task...", icon: "processing" },
              "completed": { desc: "Task completed successfully!", icon: "check" },
              "failed": { desc: currentTask.error || "Task failed", icon: "error" },
            };
            const statusInfo = statusMessages[currentTask.status] || { desc: `Status: ${currentTask.status}`, icon: "info" };
            send("step", { 
              type: currentTask.status === "completed" ? "success" : 
                    currentTask.status === "failed" ? "error" : "info",
              desc: statusInfo.desc,
              icon: statusInfo.icon
            });
            lastStatus = currentTask.status;
          }

          // Stream intermediate output as it comes
          if (currentTask.output && currentTask.output.length > lastOutputLength) {
            const { texts, files, steps } = parseTaskOutput(currentTask.output);
            
            // Send new steps that haven't been sent yet
            for (const step of steps) {
              const stepKey = step.substring(0, 100);
              if (!sentSteps.has(stepKey)) {
                sentSteps.add(stepKey);
                send("step", { type: "info", desc: step, icon: "action" });
              }
            }
            
            // Send files as they become available
            for (const file of files) {
              send("file", {
                fileName: file.fileName,
                fileUrl: file.fileUrl,
                mimeType: file.mimeType,
              });
            }
            
            lastOutputLength = currentTask.output.length;
          }

          // Check if task is complete
          if (currentTask.status === "completed") {
            // Parse final output
            if (currentTask.output && currentTask.output.length > 0) {
              const { texts, files } = parseTaskOutput(currentTask.output);
              
              // Send all files
              send("files", { 
                files: files.map(f => ({
                  fileName: f.fileName,
                  fileUrl: f.fileUrl,
                  mimeType: f.mimeType,
                }))
              });
              
              // Send result text
              const resultText = texts.join('\n\n');
              send("result", { 
                output: resultText,
                success: true,
                taskUrl: taskUrl,
                creditUsage: currentTask.credit_usage,
              });
              
              send("summary", { 
                text: resultText,
                taskTitle: currentTask.metadata?.task_title || "Task Completed",
              });
            }
            
            break;
          }

          // Check for failed status
          if (currentTask.status === "failed") {
            send("step", { 
              type: "error", 
              desc: currentTask.error || "Task failed",
              icon: "error"
            });
            if (currentTask.incomplete_details) {
              send("step", { type: "info", desc: currentTask.incomplete_details, icon: "info" });
            }
            break;
          }

          pollCount++;
          
          // Send progress indicator every 20 seconds
          if (pollCount % 10 === 0) {
            send("step", { 
              type: "info", 
              desc: `Still working... (${pollCount * 2}s elapsed)`,
              icon: "waiting"
            });
          }
        }

        if (pollCount >= maxPolls) {
          send("step", { type: "error", desc: "Polling timeout reached. Task may still be running - check Manus dashboard.", icon: "error" });
        }

        send("done", { message: "Manus AI task finished." });

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        
        // Handle specific errors
        if (errorMessage.includes("401") || errorMessage.includes("403") || errorMessage.includes("Unauthorized") || errorMessage.includes("unauthorized")) {
          send("agent_error", { 
            message: "Invalid API key. Please check your MANUS_API_KEY environment variable." 
          });
        } else if (errorMessage.includes("402") || errorMessage.includes("quota") || errorMessage.includes("limit")) {
          send("agent_error", { 
            message: "API quota exceeded. Please check your Manus account." 
          });
        } else {
          send("agent_error", { message: errorMessage });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

// POST endpoint for more complex requests
export async function POST(req: Request) {
  const body = await req.json();
  const { query } = body;

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 });
  }

  const url = new URL(req.url);
  url.searchParams.set("query", query);
  
  return GET(new Request(url.toString()));
}
