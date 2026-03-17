"use client"

// Manus AI Agent Tab - v3
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { 
  ArrowUp, 
  Loader2, 
  Copy, 
  Check, 
  RotateCcw, 
  ExternalLink, 
  FileText, 
  Code, 
  Sparkles, 
  Bot, 
  Zap, 
  X,
  Download,
  File,
  FileImage,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight,
  Circle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  PenTool,
  Globe,
  Brain
} from "lucide-react"
import { cn } from "@/lib/utils"
import { DocViewer, DocWizard, type DocData } from "@/components/doc-viewer"
import { SlidesViewer, SlidesWizard, type SlidesData } from "@/components/slides-viewer"

interface Slide {
  id: string
  title: string
  content: string[]
  backgroundColor?: string
  textColor?: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  status?: "pending" | "processing" | "completed" | "error" | "complete"
  taskId?: string
  steps?: TaskStep[]
  artifacts?: Artifact[]
}

interface TaskStep {
  id: string
  type: "thinking" | "browsing" | "searching" | "analyzing" | "writing" | "complete" | "pending" | "success" | "error" | "info"
  description: string
  timestamp: Date
  output?: string
}

interface Artifact {
  id: string
  type: "document" | "code" | "website" | "file"
  title: string
  content?: string
  url?: string
}

interface ManusFile {
  fileName: string
  fileUrl: string
  mimeType: string
}

interface ManusSession {
  taskId: string
  taskUrl?: string
  status?: string
}

export default function AgentsPage() {
  const [inputValue, setInputValue] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [docWizardOpen, setDocWizardOpen] = useState(false)
  const [newSlidesWizardOpen, setNewSlidesWizardOpen] = useState(false)
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false)
  const [isGeneratingNewSlides, setIsGeneratingNewSlides] = useState(false)
  const [generatedDocData, setGeneratedDocData] = useState<DocData | null>(null)
  const [generatedSlidesData, setGeneratedSlidesData] = useState<SlidesData | null>(null)
  
  // Manus Session State
  const [manusSession, setManusSession] = useState<ManusSession | null>(null)
  const [showResultsPanel, setShowResultsPanel] = useState(false)
  const [taskResults, setTaskResults] = useState<string[]>([])
  const [taskFiles, setTaskFiles] = useState<ManusFile[]>([])
  const [currentTask, setCurrentTask] = useState("")
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Get icon for file type
  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />
    if (mimeType.includes('image')) return <FileImage className="h-4 w-4 text-blue-500" />
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return <FileSpreadsheet className="h-4 w-4 text-green-500" />
    if (mimeType.includes('presentation') || mimeType.includes('pptx')) return <FileText className="h-4 w-4 text-orange-500" />
    return <File className="h-4 w-4 text-gray-500" />
  }

  // Get icon for step type
  const getStepIcon = (type: string, icon?: string) => {
    if (icon === "thinking" || type === "thinking") return <Brain className="h-3.5 w-3.5 text-purple-500" />
    if (icon === "processing") return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />
    if (icon === "check" || type === "success") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    if (icon === "error" || type === "error") return <XCircle className="h-3.5 w-3.5 text-red-500" />
    if (icon === "waiting") return <Clock className="h-3.5 w-3.5 text-amber-500" />
    if (icon === "action") return <Zap className="h-3.5 w-3.5 text-purple-400" />
    if (type === "browsing") return <Globe className="h-3.5 w-3.5 text-blue-400" />
    if (type === "searching") return <Search className="h-3.5 w-3.5 text-cyan-500" />
    if (type === "writing") return <PenTool className="h-3.5 w-3.5 text-pink-500" />
    if (type === "info") return <Circle className="h-3.5 w-3.5 text-blue-400" />
    return <Circle className="h-3.5 w-3.5 text-muted-foreground" />
  }

  // Handle task execution with Manus API
  const handleExecuteTask = async () => {
    if (!currentTask.trim()) return

    setIsLoading(true)
    setShowResultsPanel(true)
    setTaskFiles([])

    const assistantMessageId = crypto.randomUUID()

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      status: "processing",
      steps: [
        {
          id: crypto.randomUUID(),
          type: "thinking",
          description: "Starting Manus AI agent...",
          timestamp: new Date(),
        }
      ]
    }

    setMessages(prev => prev.map(m => 
      m.role === "assistant" && m.content.includes("Execute with Manus")
        ? assistantMessage
        : m
    ))

    try {
      // Use the /api/agent endpoint with SSE streaming
      const eventSource = new EventSource(`/api/agent?query=${encodeURIComponent(currentTask)}`);
      
      let rawOutput = "";
      let summaryText = "";

      eventSource.addEventListener("step", (e) => {
        const data = JSON.parse(e.data);
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { 
                ...m, 
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: data.type === "success" ? "success" : data.type === "error" ? "error" : "info",
                    description: data.desc,
                    timestamp: new Date(),
                  }
                ]
              }
            : m
        ));
      });

      eventSource.addEventListener("session", (e) => {
        const data = JSON.parse(e.data);
        setManusSession({
          taskId: data.taskId,
          taskUrl: data.taskUrl,
          status: data.status,
        });
      });

      eventSource.addEventListener("result", (e) => {
        const data = JSON.parse(e.data);
        rawOutput = data.output;
        setTaskResults(prev => [...prev, rawOutput]);
      });

      eventSource.addEventListener("file", (e) => {
        const data = JSON.parse(e.data);
        setTaskFiles(prev => {
          // Avoid duplicates
          if (prev.some(f => f.fileUrl === data.fileUrl)) return prev;
          return [...prev, data];
        });
      });

      eventSource.addEventListener("files", (e) => {
        const data = JSON.parse(e.data);
        if (data.files && Array.isArray(data.files)) {
          setTaskFiles(prev => {
            const newFiles = data.files.filter((f: ManusFile) => 
              !prev.some(existing => existing.fileUrl === f.fileUrl)
            );
            return [...prev, ...newFiles];
          });
        }
      });

      eventSource.addEventListener("summary", (e) => {
        const data = JSON.parse(e.data);
        summaryText = data.text;
      });

      eventSource.addEventListener("done", () => {
        eventSource.close();
        
        const finalContent = summaryText || rawOutput || "Task completed successfully.";
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { 
                ...m, 
                content: finalContent,
                status: "complete",
                steps: [
                  ...(m.steps || []),
                  {
                    id: crypto.randomUUID(),
                    type: "success",
                    description: "Manus AI completed the task",
                    timestamp: new Date(),
                  }
                ]
              }
            : m
        ));
        
        setIsLoading(false);
      });

      let receivedErrorEvent = false;

      eventSource.addEventListener("agent_error", (e: Event) => {
        receivedErrorEvent = true;
        eventSource.close();
        let errorMsg = "An error occurred";
        try {
          const msgEvent = e as MessageEvent;
          if (msgEvent.data) {
            const data = JSON.parse(msgEvent.data);
            errorMsg = data.message || data.error || errorMsg;
          }
        } catch {
          // Ignore parse errors
        }
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { 
                ...m, 
                content: errorMsg,
                status: "error",
              }
            : m
        ));
        
        setIsLoading(false);
      });

      eventSource.onerror = () => {
        eventSource.close();
        
        if (receivedErrorEvent) return;
        
        const errorContent = "Connection error: Unable to establish connection to Manus API. Please check that the MANUS_API_KEY is configured in your environment variables.";
        
        setMessages(prev => prev.map(m => 
          m.id === assistantMessageId 
            ? { 
                ...m, 
                content: errorContent,
                status: "error",
              }
            : m
        ));
        
        setIsLoading(false);
      };

    } catch {
      setIsLoading(false);
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim() || isLoading) return

    setCurrentTask(inputValue.trim())

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: inputValue.trim(),
      timestamp: new Date(),
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "I'll help you with this task using Manus AI! Click \"Execute with Manus\" to start processing.",
      timestamp: new Date(),
      status: "completed",
      steps: [
        {
          id: crypto.randomUUID(),
          type: "thinking",
          description: "Ready to execute task",
          timestamp: new Date(),
        }
      ]
    }

    setMessages(prev => [...prev, userMessage, assistantMessage])
    setInputValue("")
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRetry = (messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId)
    if (messageIndex > 0) {
      const userMessage = messages[messageIndex - 1]
      if (userMessage.role === "user") {
        setInputValue(userMessage.content)
        setMessages(prev => prev.slice(0, messageIndex - 1))
      }
    }
  }

  // Generate document
  const handleGenerateDoc = async (data: { topic: string; audience: string; style: string }) => {
    setIsGeneratingDoc(true)
    setDocWizardOpen(false)
    
    try {
      const response = await fetch("/api/generate-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) throw new Error("Failed to generate document")
      
      const docData = await response.json()
      setGeneratedDocData(docData)
      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: `Create a document about "${data.topic}"${data.audience ? ` for ${data.audience}` : ""}`,
        timestamp: new Date(),
      }
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I've created a professional document about "${data.topic}". You can view it below, copy sections, or download it as PDF or DOCX.`,
        timestamp: new Date(),
        status: "completed",
      }
      
      setMessages(prev => [...prev, userMessage, assistantMessage])
    } catch (error) {
      console.error("Error generating document:", error)
    } finally {
      setIsGeneratingDoc(false)
    }
  }

  // Generate slides
  const handleGenerateNewSlides = async (data: { topic: string; audience: string; slideCount: string; style: string }) => {
    setIsGeneratingNewSlides(true)
    setNewSlidesWizardOpen(false)
    
    try {
      const response = await fetch("/api/generate-slides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) throw new Error("Failed to generate slides")
      
      const slidesResponse = await response.json()
      
      const styleColors = {
        professional: { bg: "#1e293b", text: "#ffffff" },
        creative: { bg: "#7c3aed", text: "#ffffff" },
        minimal: { bg: "#ffffff", text: "#1e293b" },
        dark: { bg: "#0f172a", text: "#e2e8f0" },
      }
      const colors = styleColors[data.style as keyof typeof styleColors] || styleColors.professional
      
      const slides: Slide[] = slidesResponse.slides.map((slide: { title: string; content: string[] }) => ({
        id: crypto.randomUUID(),
        title: slide.title,
        content: slide.content,
        backgroundColor: colors.bg,
        textColor: colors.text,
      }))
      
      setGeneratedSlidesData({
        topic: data.topic,
        slides,
        style: data.style as SlidesData["style"],
      })
      
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: `Create a ${data.slideCount}-slide presentation about "${data.topic}"${data.audience ? ` for ${data.audience}` : ""}`,
        timestamp: new Date(),
      }
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I've created a ${slides.length}-slide presentation about "${data.topic}". You can view it below, navigate through slides, present in fullscreen, or download it as PPTX.`,
        timestamp: new Date(),
        status: "completed",
      }
      
      setMessages(prev => [...prev, userMessage, assistantMessage])
    } catch (error) {
      console.error("Error generating slides:", error)
    } finally {
      setIsGeneratingNewSlides(false)
    }
  }

  // If we have messages, show the chat view with results panel
  if (messages.length > 0) {
    return (
      <div className="flex h-full">
        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Chat Messages */}
          <div className="flex-1 overflow-auto px-4 py-6">
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <div key={message.id} className={cn(
                  "flex gap-3",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}>
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  
                  <div className={cn(
                    "max-w-[80%] rounded-2xl px-4 py-3",
                    message.role === "user" 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted"
                  )}>
                    {/* Status Steps */}
                    {message.steps && message.steps.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {message.steps.map((step) => (
                          <div key={step.id} className="flex items-start gap-2 text-sm">
                            <div className="mt-0.5">
                              {getStepIcon(step.type)}
                            </div>
                            <span className={cn(
                              "text-xs leading-relaxed",
                              step.type === "success" ? "text-green-600 dark:text-green-400" :
                              step.type === "error" ? "text-red-600 dark:text-red-400" :
                              "text-muted-foreground"
                            )}>
                              {step.description}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Message Content */}
                    {message.content && (
                      <div className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </div>
                    )}
                    
                    {/* Execute Button */}
                    {message.role === "assistant" && 
                     message.content.includes("Execute with Manus") && 
                     !isLoading && (
                      <div className="mt-3">
                        <Button 
                          onClick={handleExecuteTask}
                          className="gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700"
                        >
                          <Zap className="h-4 w-4" />
                          Execute with Manus
                        </Button>
                      </div>
                    )}
                    
                    {/* Action Buttons */}
                    {message.role === "assistant" && message.content && message.status === "complete" && (
                      <div className="mt-3 flex items-center gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => handleCopy(message.content, message.id)}
                        >
                          {copiedId === message.id ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {copiedId === message.id ? "Copied" : "Copy"}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => handleRetry(message.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </Button>
                      </div>
                    )}
                  </div>
                  
                  {message.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600">
                      <span className="text-xs font-medium text-white">U</span>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Area */}
          <div className="border-t border-border bg-background p-4">
            <div className="mx-auto max-w-3xl">
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/50 px-4 py-3">
                <textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Manus AI to help with research, analysis, writing..."
                  className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  rows={1}
                />
                <Button
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full bg-purple-500 text-white hover:bg-purple-600"
                  disabled={!inputValue.trim() || isLoading}
                  onClick={handleSubmit}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Results Panel */}
        {showResultsPanel && (
          <div className="flex w-96 flex-col border-l border-border bg-muted/30">
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-purple-50 to-background dark:from-purple-950/30 dark:to-background px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-500">
                  <Bot className="h-3 w-3 text-white" />
                </div>
                <span className="font-medium text-sm">Manus AI</span>
                {isLoading && (
                  <span className="text-xs text-muted-foreground">Processing...</span>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowResultsPanel(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Task Info */}
            {manusSession && (
              <div className="border-b border-border px-4 py-3">
                <div className="text-xs text-muted-foreground mb-1">Task ID</div>
                <div className="font-mono text-xs text-foreground truncate">
                  {manusSession.taskId}
                </div>
                {manusSession.taskUrl && (
                  <a 
                    href={manusSession.taskUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1 text-xs text-purple-500 hover:text-purple-600"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View on Manus
                  </a>
                )}
              </div>
            )}

            {/* Files Section */}
            {taskFiles.length > 0 && (
              <div className="border-b border-border px-4 py-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                  Files ({taskFiles.length})
                </div>
                <div className="space-y-2">
                  {taskFiles.map((file, index) => (
                    <a
                      key={index}
                      href={file.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.fileName}
                      className="flex items-center gap-3 rounded-lg border border-border bg-background p-3 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        {getFileIcon(file.mimeType)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                          {file.fileName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {file.mimeType.split('/').pop()?.toUpperCase()}
                        </div>
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground group-hover:text-purple-500 transition-colors" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-auto p-4">
              {taskResults.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Output
                  </div>
                  {taskResults.map((result, index) => (
                    <div key={index} className="rounded-lg bg-background border border-border p-3">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Code className="h-4 w-4 text-purple-500" />
                          <span className="text-xs font-medium">Result {index + 1}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleCopy(result, `result-${index}`)}
                        >
                          {copiedId === `result-${index}` ? (
                            <Check className="h-3 w-3" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-60">
                        {result}
                      </pre>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {isLoading ? "Processing your task..." : "Results will appear here"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Document Wizard */}
        <DocWizard 
          isOpen={docWizardOpen}
          onClose={() => setDocWizardOpen(false)}
          onGenerate={handleGenerateDoc}
          isGenerating={isGeneratingDoc}
        />

        {/* Slides Wizard */}
        <SlidesWizard
          isOpen={newSlidesWizardOpen}
          onClose={() => setNewSlidesWizardOpen(false)}
          onGenerate={handleGenerateNewSlides}
          isGenerating={isGeneratingNewSlides}
        />

        {/* Generated Document Display */}
        {generatedDocData && (
          <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
            <DocViewer 
              doc={generatedDocData}
              onClose={() => setGeneratedDocData(null)}
            />
          </div>
        )}

        {/* Generated Slides Display */}
        {generatedSlidesData && (
          <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
            <SlidesViewer 
              data={generatedSlidesData}
              onClose={() => setGeneratedSlidesData(null)}
            />
          </div>
        )}
      </div>
    )
  }

  // Example tasks for Manus AI
  const exampleTasks = [
    "Research the latest AI trends and summarize key findings",
    "Analyze competitor pricing strategies",
    "Write a professional email draft",
    "Create a marketing plan outline",
    "Summarize a research paper",
    "Generate content ideas for social media",
  ]

  // Initial view with prompt
  return (
    <div className="flex h-full">
      {/* Left Panel - Welcome & Examples */}
      <div className="flex w-80 flex-col border-r border-border bg-muted/30 p-6">
        <div className="mb-6">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 shadow-sm">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-foreground">Manus AI Agent</span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Welcome to Manus AI Agent. Manus can help you with research, analysis, writing, and complex tasks. Tell me what you&apos;d like me to help with.
          </p>
        </div>

        <div className="mb-4">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Try an Example</span>
        </div>

        <div className="flex-1 space-y-2">
          {exampleTasks.map((task, index) => (
            <button
              key={index}
              onClick={() => setInputValue(task)}
              className="w-full rounded-lg border border-border bg-background p-3 text-left text-sm text-foreground hover:border-purple-300 hover:bg-purple-50 dark:hover:border-purple-800 dark:hover:bg-purple-950/30 transition-colors"
            >
              {task}
            </button>
          ))}
        </div>

        {/* Bottom input for quick access */}
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <input
              type="text"
              placeholder="Ask Manus AI anything..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
            />
            <Button
              size="icon"
              className="h-8 w-8 rounded-full bg-purple-500 text-white hover:bg-purple-600"
              disabled={!inputValue.trim() || isLoading}
              onClick={handleSubmit}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel - Main Content (empty state) */}
      <div className="flex flex-1 flex-col items-center justify-center px-8 bg-muted/10">
        <div className="text-center max-w-md">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg">
              <Bot className="h-8 w-8 text-white" />
            </div>
          </div>
          <h2 className="mb-3 text-2xl font-semibold text-foreground">
            Manus AI Agent Ready
          </h2>
          <p className="text-muted-foreground mb-6">
            Select an example task or type your own request in the left panel. Manus AI will help you with research, analysis, writing, and more.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-950/50 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              <Sparkles className="h-3 w-3" />
              Research
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-950/50 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              <FileText className="h-3 w-3" />
              Writing
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 dark:bg-purple-950/50 px-3 py-1 text-xs font-medium text-purple-700 dark:text-purple-300">
              <Code className="h-3 w-3" />
              Analysis
            </span>
          </div>
        </div>
      </div>

      {/* Document Wizard */}
      <DocWizard 
        isOpen={docWizardOpen}
        onClose={() => setDocWizardOpen(false)}
        onGenerate={handleGenerateDoc}
        isGenerating={isGeneratingDoc}
      />

      {/* Slides Wizard */}
      <SlidesWizard
        isOpen={newSlidesWizardOpen}
        onClose={() => setNewSlidesWizardOpen(false)}
        onGenerate={handleGenerateNewSlides}
        isGenerating={isGeneratingNewSlides}
      />

      {/* Generated Document Display */}
      {generatedDocData && (
        <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
          <DocViewer 
            doc={generatedDocData}
            onClose={() => setGeneratedDocData(null)}
          />
        </div>
      )}

      {/* Generated Slides Display */}
      {generatedSlidesData && (
        <div className="fixed bottom-4 right-4 z-40 w-full max-w-xl">
          <SlidesViewer 
            data={generatedSlidesData}
            onClose={() => setGeneratedSlidesData(null)}
          />
        </div>
      )}
    </div>
  )
}
