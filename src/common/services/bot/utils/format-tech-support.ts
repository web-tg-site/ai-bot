export const TECH_SUPPORT_CHAT_ID = -1004482346661;

const MIN_TECH_SUPPORT_TEXT_LENGTH = 5;

type TechSupportUser = {
    first_name?: string;
    last_name?: string;
    username?: string;
};

export const formatTechSupportMessage = (
    user: TechSupportUser,
    text: string,
): string => {
    const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
    const username = user.username ? `@${user.username}` : '';
    const header = [name, username].filter(Boolean).join(' ');

    return `${header}\n${text}`;
};

export { MIN_TECH_SUPPORT_TEXT_LENGTH };
