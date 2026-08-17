export const SUPPORT_DOCUMENT_URLS = {
    privacyPolicy:
        'https://docs.google.com/document/d/1sRw7-MkYo_SoqeSJOFOYQzccq8O_no-O/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true',
    userAgreement:
        'https://docs.google.com/document/d/1qOlS8jTUKMBUeDQ7z0AGU7RCV_cAc830/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true',
    refundPolicy:
        'https://docs.google.com/document/d/1Vt0GgEPtXIDL54hxcNjT9iGlu_6ERFwT/edit?usp=sharing&ouid=104945563170223870947&rtpof=true&sd=true',
} as const;

export const SUPPORT_DOCUMENTS = [
    {
        id: 'privacyPolicy',
        title: 'Политика обработки персональных данных',
        url: SUPPORT_DOCUMENT_URLS.privacyPolicy,
    },
    {
        id: 'userAgreement',
        title: 'Пользовательское соглашение',
        url: SUPPORT_DOCUMENT_URLS.userAgreement,
    },
    {
        id: 'refundPolicy',
        title: 'Политика возврата денежных средств',
        url: SUPPORT_DOCUMENT_URLS.refundPolicy,
    },
] as const;
