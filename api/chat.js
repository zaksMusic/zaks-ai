const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { messages } = req.body;

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        error: "Messages tidak valid."
      });
    }

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      instructions:
        "Kamu adalah AI Z, asisten AI yang ramah, membantu, jelas, dan menggunakan bahasa yang sesuai dengan bahasa pengguna.",
      input: messages.map((message) => ({
        role: message.role,
        content: message.content
      }))
    });

    return res.status(200).json({
      message: response.output_text
    });

  } catch (error) {
    console.error("OpenAI API Error:", error);

    return res.status(500).json({
      error: "Gagal mendapatkan jawaban dari AI Z."
    });
  }
};
