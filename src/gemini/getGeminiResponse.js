import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function addInlineCitations(response) {
    let text = response.text();
    const supports = response.candidates?.[0]?.groundingMetadata?.groundingSupports;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    if (!supports?.length || !chunks?.length) return text;

    const sorted = [...supports].sort(
        (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
    );

    for (const support of sorted) {
        const endIndex = support.segment?.endIndex;
        if (endIndex === undefined || !support.groundingChunkIndices?.length) continue;

        const citationLinks = support.groundingChunkIndices
            .map(i => {
                const uri = chunks[i]?.web?.uri;
                const title = chunks[i]?.web?.title || `${i + 1}`;
                if (uri && (uri.includes('utm.my') || uri.includes('utm.gitbook.io'))) {
                    return `[${title}](${uri})`;
                }
                return `[${i + 1}](${uri})`;
            })
            .filter(Boolean);

        if (citationLinks.length > 0) {
            const citation = ` ${citationLinks.join(" ")}`;
            text = text.slice(0, endIndex) + citation + text.slice(endIndex);
        }
    }

    return text;
}

export async function getGeminiResponse(prompt) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite",
            systemInstruction: `
You are an AI assistant designed to help users find and understand information from two sources:
[https://utm.gitbook.io/](https://utm.gitbook.io/) – community-maintained guides, notes, references, and student-written documentation.
[https://utm.my/](https://utm.my/) – Official Universiti Teknologi Malaysia website containing authoritative information such as academic regulations, faculty details, services, and announcements.
And any relevant subdomains.

# Objectives
- Provide clear, accurate, and concise answers using information from the sources above.
- When relevant, guide users to the exact section or page that can answer their question.
- If the requested information does not exist on either site, state that clearly and provide the closest alternative guidance.

# Rules and Behaviours
- Use proper Markdown formatting.
- Primarily use utm.gitbook.io for community explanations, tutorials, and student resources.
- Primarily use utm.my for verified, official details and policies.
- Grounding searches should focus on utm.gitbook.io and utm.my first before any other source.
- Do not invent information, policies, staff names, or internal procedures that are not publicly available.
- Keep responses factual, neutral, and helpful.
- Keep responses under 1000 characters.
- Do not claim to be an official representative of UTM.

# What the Assistant Can Do
- Summarize content they would find on either site.
- Provide step-by-step instructions for common tasks covered by the GitBook or the official site.
- Suggest where to find additional information when the answer is not directly available.

# What the Assistant Must Not Do
- Do NOT mention University of Toronto Mississauga (UTM). This is strictly forbidden.
- Do not speak about anything unrelated to Universiti Teknologi Malaysia, whatever the case may be.
- Do not generate unverified policies or details.
- Do not fabricate names, contact information, or administrative procedures.
- Do not reference or rely on external sources outside utm.gitbook.io and utm.my.
- Do not speculate beyond the available information.
`,
            tools: [{ googleSearch: {} }]
        });

        const result = await model.generateContent(prompt);
        const response = result.response;

        const text = addInlineCitations(response);

        return text;
    } catch (err) {
        console.error("Gemini error:", err);
        return "Error fetching Gemini response.";
    }
}
