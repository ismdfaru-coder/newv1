// app/api/agent/route.ts
// Manus API implementation
// Creates a task, polls for completion, and streams status updates

export const runtime = "nodejs";
export const maxDuration = 300;

const MANUS_API_URL = "https://api.manus.ai";
const MANUS_API_KEY = process.env.MANUS_API_KEY || "";

// Helper to get auth headers - Manus uses "API_KEY" header
const getAuthHeaders = () => ({
  "API_KEY": MANUS_API_KEY,
  "Content-Type": "application/json",
});

// Response from POST /v1/tasks
interface TaskCreatedResponse {
  task_id: string;
  task_url?: string;
  status?: string;
}

// Response from GET /v1/tasks/{task_id}
interface TaskStatusResponse {
  task_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  output?: {
    result?: string;
    artifacts?: Array<{
      type: string;
      url?: string;
      content?: string;
    }>;
  };
  error?: string;
  created_at?: string;
  updated_at?: string;
}

async function createTask(prompt: string): Promise<TaskCreatedResponse> {
  const res = await fetch(`${MANUS_API_URL}/v1/tasks`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ prompt }),
  });
  
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to create task: ${res.status} - ${errText}`);
  }
  
  return res.json();
}

async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
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
        send("step", { type: "info", desc: "Creating Manus AI task..." });

        const taskResponse = await createTask(query);
        
        if (!taskResponse.task_id) {
          throw new Error("Invalid response: missing task_id");
        }

        const taskId = taskResponse.task_id;

        send("step", { type: "success", desc: `Task created. ID: ${taskId}` });
        
        // Send task URL if available
        if (taskResponse.task_url) {
          send("session", {
            taskId: taskId,
            taskUrl: taskResponse.task_url,
            status: "pending",
          });
        }

        send("step", { type: "info", desc: `Processing: "${query}"` });

        // ── 2. Poll for task completion ──────────────────────────────────────
        send("step", { type: "info", desc: "Manus AI is working on your task..." });

        const maxPolls = 180; // 3 minutes max
        let pollCount = 0;
        let lastStatus = "pending";

        // Wait a bit before first poll
        await new Promise(r => setTimeout(r, 3000));

        while (pollCount < maxPolls) {
          await new Promise(r => setTimeout(r, 2000));
          
          let currentTask: TaskStatusResponse;
          try {
            currentTask = await getTaskStatus(taskId);
          } catch (e) {
            // Task might not be ready yet, continue polling
            pollCount++;
            if (pollCount % 5 === 0) {
              send("step", { type: "info", desc: `Waiting for task to be ready... (${pollCount * 2}s elapsed)` });
            }
            continue;
          }

          // Send status update if changed
          if (currentTask.status !== lastStatus) {
            send("step", { 
              type: currentTask.status === "completed" ? "success" : 
                    currentTask.status === "failed" ? "error" : "info", 
              desc: `Task status: ${currentTask.status}` 
            });
            lastStatus = currentTask.status;
          }

          // Check if task is complete
          if (currentTask.status === "completed") {
            send("step", { type: "success", desc: "Task completed!" });
            
            if (currentTask.output) {
              const resultText = currentTask.output.result || 
                JSON.stringify(currentTask.output, null, 2);
              
              send("result", { 
                output: resultText,
                success: true,
                artifacts: currentTask.output.artifacts || []
              });
              
              send("summary", { text: resultText });
            }
            
            break;
          }

          // Check for failed/cancelled status
          if (currentTask.status === "failed" || currentTask.status === "cancelled") {
            send("step", { 
              type: "error", 
              desc: currentTask.error || `Task ${currentTask.status}` 
            });
            break;
          }

          pollCount++;
          
          // Send progress indicator every 10 seconds
          if (pollCount % 5 === 0) {
            send("step", { 
              type: "info", 
              desc: `Still working... (${pollCount * 2}s elapsed)` 
            });
          }
        }

        if (pollCount >= maxPolls) {
          send("step", { type: "error", desc: "Polling timeout reached. Task may still be running." });
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
