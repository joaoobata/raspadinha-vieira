"use client";

import { useState, useTransition } from "react";
import { Copy, ClipboardCheck, Sparkles, Loader2 } from "lucide-react";
import { generateQuip } from "@/ai/flows/generate-quip";
import type { GenerateQuipOutput } from "@/ai/flows/generate-quip";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<GenerateQuipOutput | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!topic || isPending) return;

    startTransition(async () => {
      setResult(null);
      setIsCopied(false);
      try {
        const res = await generateQuip({ topic });
        setResult(res);
      } catch (error) {
        console.error(error);
        toast({
          title: "Error Generating Quip",
          description: "There was a problem with the request. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  const handleCopy = () => {
    if (!result?.quip) return;
    navigator.clipboard.writeText(result.quip);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  };

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-lg rounded-xl">
          <CardHeader className="text-center p-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 mb-4">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl">
              Quip Generator
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground mt-2">
              Enter a topic and let AI craft a witty quip for you.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            <form onSubmit={handleGenerate} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="topic" className="text-sm font-medium">Topic</Label>
                <Input
                  id="topic"
                  name="topic"
                  placeholder="e.g., coffee, Mondays, coding"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  disabled={isPending}
                  required
                />
              </div>
              <Button type="submit" disabled={isPending || !topic} className="w-full" size="lg">
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Generate Quip"
                )}
              </Button>
            </form>

            {isPending && (
                <div className="text-center pt-6 text-sm text-muted-foreground animate-pulse">
                    Crafting your quip...
                </div>
            )}

            {result?.quip && !isPending && (
              <div className="mt-6 animate-in fade-in duration-500">
                <div className="rounded-lg border bg-accent/20 p-4 relative">
                   <p className="text-center text-lg italic text-foreground/90 pr-10">
                      &ldquo;{result.quip}&rdquo;
                    </p>
                  <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCopy}
                      aria-label="Copy quip"
                      className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      {isCopied ? (
                        <ClipboardCheck className="h-5 w-5" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <footer className="text-center mt-4">
            <p className="text-xs text-muted-foreground">Powered by Generative AI</p>
        </footer>
      </div>
    </main>
  );
}
