import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function updateCoffee() {
  const updatedData = {
    rating: 4.7,
    workingHours: 'Open · Closes at 00:00',
    phoneNumber: 'Telefon numarası verilecek',
    address: 'Osmanağa, Halitağa Cd. No:10A, 34714 Kadıköy/İstanbul'
  };

  await prisma.business.update({
    where: { name: 'VAU Coffee Kadıköy' },
    data: updatedData,
  });

  console.log('VAU Coffee Kadıköy updated successfully!');
  await prisma.$disconnect();
}

updateCoffee().catch(e => {
  console.error(e);
  process.exit(1);
});