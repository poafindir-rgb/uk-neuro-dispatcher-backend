import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "https://poafindir-rgb.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeImageData(imageBase64 = "") {
  if (!imageBase64) return "";

  // Если frontend прислал data:image/png;base64,... — убираем префикс
  if (imageBase64.includes(",")) {
    return imageBase64.split(",")[1];
  }

  return imageBase64;
}

function buildImageDataUrl(imageBase64, mimeType = "image/png") {
  const cleanBase64 = normalizeImageData(imageBase64);

  if (!cleanBase64) return null;

  return `data:${mimeType || "image/png"};base64,${cleanBase64}`;
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "Use POST /api/analyze",
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured on Vercel",
      });
    }

    const {
      prompt,
      imageBase64,
      mimeType,
      images,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        error: "Prompt is required",
      });
    }

    const content = [
      {
        type: "input_text",
        text: prompt,
      },
    ];

    /*
      Новый правильный формат:
      images: [
        {
          label: "Фото ДО 1",
          imageBase64: "...",
          mimeType: "image/png"
        },
        {
          label: "Фото ПОСЛЕ 1",
          imageBase64: "...",
          mimeType: "image/png"
        }
      ]
    */
    if (Array.isArray(images) && images.length > 0) {
      images.forEach((img, index) => {
        if (!img?.imageBase64) return;

        const label = img.label || `Фото ${index + 1}`;
        const currentMimeType = img.mimeType || "image/png";
        const imageUrl = buildImageDataUrl(img.imageBase64, currentMimeType);

        if (!imageUrl) return;

        content.push({
          type: "input_text",
          text: `Изображение ${index + 1}: ${label}`,
        });

        content.push({
          type: "input_image",
          image_url: imageUrl,
          detail: "high",
        });
      });
    }

    /*
      Поддержка старого формата, чтобы не сломать analyzeSourcePhoto:
      {
        prompt,
        imageBase64,
        mimeType
      }
    */
    if ((!Array.isArray(images) || images.length === 0) && imageBase64) {
      const imageUrl = buildImageDataUrl(imageBase64, mimeType || "image/png");

      if (imageUrl) {
        content.push({
          type: "input_text",
          text: "Изображение 1: фото для анализа",
        });

        content.push({
          type: "input_image",
          image_url: imageUrl,
          detail: "high",
        });
      }
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content,
        },
      ],
      temperature: 0.2,
      max_output_tokens: 2500,
    });

    return res.status(200).json({
      text: response.output_text || "",
    });
  } catch (error) {
    console.error("OpenAI backend error:", error);

    return res.status(500).json({
      error: "OpenAI analysis failed",
      details: error?.message || String(error),
    });
  }
}
