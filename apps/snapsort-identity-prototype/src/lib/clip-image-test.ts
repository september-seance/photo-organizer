"use client";

const MODEL_ID = "Xenova/clip-vit-base-patch32";

type PipelineResult = { label: string; score: number };
type ZeroShotPipeline = (image: string, labels: string[]) => Promise<PipelineResult[]>;
export type CategoryGuess = { category: string; score: number };
type LabelKind = "group" | "item";

let pipelinePromise: Promise<ZeroShotPipeline> | undefined;

async function getPipeline(): Promise<ZeroShotPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers").then(async ({ pipeline }) => {
      const classifier = await pipeline("zero-shot-image-classification", MODEL_ID);
      return classifier as unknown as ZeroShotPipeline;
    }).catch((error: unknown) => {
      // Let the user retry if the first model download or initialization fails.
      pipelinePromise = undefined;
      throw error;
    });
  }
  return pipelinePromise;
}

/** Runs a small prompt comparison locally in the browser; the image is never uploaded. */
export async function testImageCategories(file: File, categories: string[], kind: LabelKind): Promise<CategoryGuess[]> {
  if (categories.length === 0) throw new Error("There are no category labels to compare.");

  const templates = kind === "group"
    ? ["a photo of a product in the {category} group", "retail packaging for an item in the {category} group"]
    : ["a photo of {category}", "retail packaging for {category}"];
  const imageUrl = URL.createObjectURL(file);
  try {
    const classify = await getPipeline();
    const bestScores = new Map<string, number>();
    for (const template of templates) {
      const prompts = categories.map(category => template.replace("{category}", category));
      const output = await classify(imageUrl, prompts);
      for (const result of output) {
        const promptIndex = prompts.findIndex(prompt => prompt.toLowerCase() === result.label.toLowerCase());
        if (promptIndex < 0) continue;
        const category = categories[promptIndex];
        bestScores.set(category, Math.max(bestScores.get(category) ?? 0, result.score));
      }
    }
    return [...bestScores.entries()]
      .map(([category, score]) => ({ category, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}
