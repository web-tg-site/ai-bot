export function escapeTelegramHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function markdownToTelegramHtml(input: string): string {
    const placeholders: string[] = [];

    const stash = (html: string): string => {
        const token = `\uE000${placeholders.length}\uE001`;
        placeholders.push(html);
        return token;
    };

    let text = input.replace(/\r\n/g, '\n');

    text = text.replace(/```[^\n]*\n?([\s\S]*?)```/g, (_, code: string) =>
        stash(`<pre>${escapeTelegramHtml(code.trimEnd())}</pre>`),
    );

    text = text.replace(/`([^`\n]+)`/g, (_, code: string) =>
        stash(`<code>${escapeTelegramHtml(code)}</code>`),
    );

    text = escapeTelegramHtml(text);

    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    text = text.replace(/__([^_\n]+)__/g, '<b>$1</b>');

    text = text.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<i>$1</i>');
    text = text.replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<i>$1</i>');

    text = text.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

    text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

    for (let i = 0; i < placeholders.length; i++) {
        text = text.replace(`\uE000${i}\uE001`, placeholders[i]);
    }

    return text;
}
