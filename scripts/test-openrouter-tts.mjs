import { readFileSync } from 'fs';

const orKey = readFileSync('.env', 'utf8')
    .match(/OPENROUTER_API_KEY=(.+)/)?.[1]
    ?.replace(/"/g, '')
    .trim();
const text = 'привет, меня зовут саша и я диктор канала мастерская настроения';

const variants = [
    [
        'say-exactly-en',
        [{ role: 'user', content: `Say exactly and nothing else: ${text}` }],
    ],
    [
        'json-wrap',
        [
            {
                role: 'system',
                content:
                    'You are a TTS engine. Speak ONLY the value of TEXT_TO_SPEAK. No greetings, no follow-up, no commentary.',
            },
            { role: 'user', content: `TEXT_TO_SPEAK=${JSON.stringify(text)}` },
        ],
    ],
    [
        'assistant-prefill',
        [
            {
                role: 'system',
                content:
                    'Continue speaking the assistant message verbatim in audio.',
            },
            { role: 'assistant', content: text },
        ],
    ],
    [
        'user-as-script',
        [
            {
                role: 'user',
                content: `Voiceover script (read verbatim):\n${text}`,
            },
        ],
    ],
];

async function getTranscript(messages) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${orKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'openai/gpt-audio-mini',
            stream: true,
            messages,
            modalities: ['text', 'audio'],
            audio: { voice: 'alloy', format: 'pcm16' },
        }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let transcript = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
                const json = JSON.parse(payload);
                transcript += json.choices?.[0]?.delta?.audio?.transcript ?? '';
            } catch {}
        }
    }
    return transcript.trim();
}

for (const [name, messages] of variants) {
    const transcript = await getTranscript(messages);
    const ok =
        transcript.toLowerCase().includes('меня зовут саша') &&
        !/чем|как я могу|расскажи/i.test(transcript);
    console.log(`\n[${name}] ok=${ok}`);
    console.log(transcript);
}
