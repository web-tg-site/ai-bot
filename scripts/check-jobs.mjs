import { PrismaClient } from '../src/generated/prisma/client.ts';

const prisma = new PrismaClient();
const jobs = await prisma.aiGenerationJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
        id: true,
        toolId: true,
        status: true,
        providerJobId: true,
        errorMessage: true,
        createdAt: true,
    },
});
console.log(JSON.stringify(jobs, null, 2));
await prisma.$disconnect();
