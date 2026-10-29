let telegramBotUsername: string | undefined;

export function setTelegramBotUsername(username: string | undefined): void {
    const normalized = username?.replace(/^@/, '').trim();
    telegramBotUsername = normalized || undefined;
}

export function getTelegramBotUsername(): string | undefined {
    return telegramBotUsername;
}

/** Direct Mini App link. Reply-keyboard web_app URLs omit initData on iOS. */
export function getMainMiniAppLink(): string | undefined {
    const username = getTelegramBotUsername();
    if (!username) return undefined;
    return `https://t.me/${username}/app`;
}
