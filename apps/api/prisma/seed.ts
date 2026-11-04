// Local and CI: demo seller, product and the five shared scenarios (`pnpm db:reset`).
// Production: SEED_SCENARIOS=false loads only the seller and product. Real sandbox disputes fill the rest.
// Safe to run twice.
import { PrismaClient } from '@prisma/client';
import { DEFAULT_RULES, DEMO_PRODUCT, DEMO_SELLER, SCENARIOS } from '@proofvault/shared/fixtures';

const prisma = new PrismaClient();

async function main() {
  await prisma.seller.upsert({
    where: { id: DEMO_SELLER.id },
    update: {},
    create: { ...DEMO_SELLER, autoActionRules: DEFAULT_RULES },
  });
  await prisma.product.upsert({
    where: { id: DEMO_PRODUCT.id },
    update: {},
    create: {
      id: DEMO_PRODUCT.id,
      sellerId: DEMO_PRODUCT.sellerId,
      name: DEMO_PRODUCT.name,
      type: DEMO_PRODUCT.type,
      price: DEMO_PRODUCT.price.value,
    },
  });

  if (process.env.SEED_SCENARIOS === 'false') {
    console.log('Seeded demo seller and product only (SEED_SCENARIOS=false).');
    return;
  }

  for (const { context } of SCENARIOS) {
    const { order, events, dispute } = context;
    if (order) {
      await prisma.order.upsert({
        where: { id: order.id },
        update: {},
        create: {
          id: order.id,
          paypalOrderId: order.paypalOrderId,
          paypalCaptureId: order.paypalCaptureId,
          productId: order.productId,
          buyerEmail: order.buyerEmail,
          amount: order.amount.value,
          checkoutIp: order.checkoutIp,
          checkoutDevice: order.checkoutDevice,
          riskLevel: order.riskLevel,
          createdAt: order.createdAt,
        },
      });
      // S5 reuses S2's order and events, so skip ones already there.
      await prisma.accessEvent.createMany({
        data: events.map((e) => ({ ...e, meta: e.meta ?? undefined })),
        skipDuplicates: true,
      });
    }
    await prisma.dispute.upsert({
      where: { id: dispute.id },
      update: {},
      create: {
        id: dispute.id,
        paypalDisputeId: dispute.paypalDisputeId,
        orderId: dispute.orderId,
        reason: dispute.reason,
        amount: dispute.amount.value,
        status: dispute.status,
        responseDueAt: dispute.responseDueAt,
        createdAt: dispute.createdAt,
      },
    });
  }
  console.log(`Seeded 1 seller, 1 product, ${SCENARIOS.length} scenario disputes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
