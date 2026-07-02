type VercelResponse = {
    status: (code: number) => VercelResponse;
    setHeader: (name: string, value: string) => void;
    send: (body: string) => void;
};

export default function handler(_req: unknown, res: VercelResponse) {
    const tag = process.env.APAY_VERIFICATION_TAG;

    if (!tag) {
        res.status(404).send('Not found');
        return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="apay-tag" content="${tag}">
    <title>Verification</title>
</head>
<body></body>
</html>`);
}
