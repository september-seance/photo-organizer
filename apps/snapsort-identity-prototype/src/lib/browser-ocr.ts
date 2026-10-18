"use client";

export type OcrResult = {
  text: string;
  confidence: number;
  rotation: 0 | 180;
};

type WorkerLike = {
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>;
};

let workerPromise: Promise<WorkerLike> | undefined;

async function getWorker(): Promise<WorkerLike> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(async ({ createWorker }) => {
      const worker = await createWorker("eng");
      return worker as unknown as WorkerLike;
    }).catch((error: unknown) => {
      workerPromise = undefined;
      throw error;
    });
  }
  return workerPromise;
}

async function makeCanvas(file: File, rotation: 0 | 180): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the image for text reading.");
    if (rotation === 180) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    }
    context.drawImage(image, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** OCR the original and upside-down orientation locally, returning the clearer text result. */
export async function readPackageText(file: File): Promise<OcrResult> {
  const worker = await getWorker();
  let best: OcrResult = { text: "", confidence: -1, rotation: 0 };

  for (const rotation of [0, 180] as const) {
    const canvas = await makeCanvas(file, rotation);
    const result = await worker.recognize(canvas);
    const text = result.data.text.trim();
    if (result.data.confidence > best.confidence) {
      best = { text, confidence: result.data.confidence, rotation };
    }
  }

  return best;
}
