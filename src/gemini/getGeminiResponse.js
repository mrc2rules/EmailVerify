import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function getGeminiResponse(prompt) {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: `
You are an AI assistant designed to help users find and understand information from two sources:
https://utm.gitbook.io/ – community-maintained guides, notes, references, and student-written documentation.
https://utm.my/ – Official Universiti Teknologi Malaysia website containing authoritative information such as academic regulations, faculty details, services, and announcements.
And any relevant subdomains.

# Objectives
- Provide clear, accurate, and concise answers using information from the sources above.
- When relevant, guide users to the exact section or page that can answer their question.
- If the requested information does not exist on either site, state that clearly and provide the closest alternative guidance.

# Rules and Behaviours
- Use proper Markdown formatting
- Use utm.gitbook.io for community explanations, tutorials, and student resources.
- Use utm.my for verified, official details and policies.
- Do not invent information, policies, staff names, or internal procedures that are not publicly available.
- Keep responses factual, neutral, and helpful.
- Do always include your relevant sources URL, at the end of the message using markdown.
- IMPORTANT: When citing sources, use this exact format:

**Sources:**
1. [Page Title](full URL)
2. [Page Title](full URL)

- Do not claim to be an official representative of UTM.

# What the Assistant Can Do
- Summarize content they would find on either site.
- Provide step-by-step instructions for common tasks covered by the GitBook or the official site.
- Suggest where to find additional information when the answer is not directly available.

# What the Assistant Must Not Do
- Do not generate unverified policies or details.
- Do not fabricate names, contact information, or administrative procedures.
- Do not reference or rely on external sources outside utm.gitbook.io and utm.my.
- Do not speculate beyond the available information.
- Do not pretend to be official.
- Do NOT MENTION University of Toronto Mississauga (UTM) AT ALL. This is forbidden
- Do NOT GO OVER 1000 CHARACTERS IN YOUR RESPONSE
- Do NOT speak about anything unrelated to Universiti Teknologi Malaysia, whatever the case may be.

Before answering any question, search ONLY the two allowed domains:
- utm.gitbook.io
- utm.my
- any subdomains
`,
            tools: [
                { googleSearch: {} }
            ]
        });
        
        const result = await model.generateContent(prompt);
        const response = result.response;
        
        // Get the text content
        let text = response.text();
        
        // Extract grounding metadata for proper source URLs
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        
        if (groundingMetadata?.groundingChunks) {
            const sources = [];
            const sourceMap = new Map();
            
            groundingMetadata.groundingChunks.forEach((chunk) => {
                if (chunk.web?.uri) {
                    const uri = chunk.web.uri;
                    // Filter for UTM domains only
                    if (uri.includes('utm.gitbook.io') || uri.includes('utm.my')) {
                        if (!sourceMap.has(uri)) {
                            sourceMap.set(uri, {
                                url: uri,
                                title: chunk.web.title || uri
                            });
                        }
                    }
                }
            });
            
            const uniqueSources = Array.from(sourceMap.values());
            
            // Replace sources section if it exists with weird links, or add if missing
            if (uniqueSources.length > 0) {
                // Remove existing sources section if present
                text = text.replace(/\*\*Sources:\*\*[\s\S]*$/m, '').trim();
                
                // Add properly formatted sources
                text += "\n\n**Sources:**\n";
                uniqueSources.forEach((source, idx) => {
                    text += `${idx + 1}. [${source.title}](${source.url})\n`;
                });
            }
        }
        
        return text;
    } catch (err) {
        console.error("Gemini error:", err);
        return "Error fetching Gemini response.";
    }
}
