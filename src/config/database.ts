import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'warn', 'error'],
});

prisma.$on('query', (event) => {
  if (event.duration > 200) {
    console.log(
      `[Prisma] ${event.duration}ms | ${event.query.substring(0, 200)}`
    );
  }
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;